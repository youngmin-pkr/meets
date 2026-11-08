/**
 * 앱의 시작점: 가입 → 행사 선택 → 입력 흐름 → 후보
 */
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, View } from 'react-native';
import {
  todayInSeoul,
  type CandidateCard,
  type EventDetail,
  type EventReportInput,
  type EventReportResult,
  type EventSummary,
  type IdentityResult,
} from '@meets/shared';
import { api, setSessionToken, type Me, type SignupConfig } from './src/api';
import { screenAfterIdentity, screenForStep, type Screen } from './src/signupFlow';
import { colors } from './src/theme';
import { Body, Page, PrimaryButton, Title } from './src/ui';
import {
  AccountUnavailableScreen,
  TeenNotYetScreen,
  UnderMinAgeScreen,
  WelcomeScreen,
} from './src/screens/InfoScreens';
import { VerifyScreen } from './src/screens/VerifyScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { FandomScreen } from './src/screens/FandomScreen';
import { ReadyScreen } from './src/screens/ReadyScreen';
import { EventListScreen } from './src/screens/EventListScreen';
import { ImmersionScreen, MustScreen, ScheduleScreen, TempoScreen } from './src/screens/InputFlowScreens';
import { CandidateDetailScreen, CandidatesScreen, WaitScreen } from './src/screens/CandidateScreens';
import { initialDraft, selectableDays, toInput, type PreferenceDraft } from './src/preferenceDraft';
import { EventReportedScreen, EventReportScreen } from './src/screens/EventReportScreen';

export default function App() {
  const [config, setConfig] = useState<SignupConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('WELCOME');
  const [verifyMode, setVerifyMode] = useState<'signup' | 'login'>('signup');
  const [me, setMe] = useState<Me | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [draft, setDraft] = useState<PreferenceDraft | null>(null);
  const [candidate, setCandidate] = useState<CandidateCard | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reported, setReported] = useState<{ input: EventReportInput; result: EventReportResult } | null>(null);

  function loadConfig() {
    setLoadError(null);
    api.getConfig().then(setConfig, (e: Error) => setLoadError(e.message));
  }
  useEffect(loadConfig, []);

  async function handleIdentity(result: IdentityResult) {
    if (result.outcome === 'SIGNED_UP' || result.outcome === 'LOGGED_IN') {
      setSessionToken(result.sessionToken);
      setMe(await api.getMe());
    }
    setScreen(screenAfterIdentity(result));
  }

  function afterSave(next: Me) {
    setMe(next);
    setScreen(screenForStep(next.nextStep));
  }

  const todayIso = () => {
    const t = todayInSeoul();
    return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  };

  /** 행사를 고르면 저장된 입력을 불러와 일정 화면으로 */
  async function startFlow(summary: EventSummary) {
    setFlowError(null);
    try {
      const [detail, saved] = await Promise.all([api.getEvent(summary.id), api.getPreference(summary.id)]);
      setEvent(detail);
      setDraft(initialDraft(detail, saved, todayIso()));
      setScreen('SCHEDULE');
    } catch (e) {
      setFlowError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    }
  }

  async function submitPreference() {
    if (!event || !draft) return;
    const input = toInput(draft, event);
    if (!input) return;
    setFlowError(null);
    setSaving(true);
    try {
      await api.savePreference(event.id, input);
      setScreen('CANDIDATES');
    } catch (e) {
      setFlowError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  function backToWelcome() {
    setSessionToken(null);
    setMe(null);
    setScreen('WELCOME');
  }

  if (!config) {
    return (
      <Page footer={loadError ? <PrimaryButton label="다시 시도" onPress={loadConfig} /> : undefined}>
        {loadError ? (
          <>
            <Title>연결하지 못했어요</Title>
            <Body>{loadError}</Body>
          </>
        ) : (
          <View style={{ paddingTop: 120 }}>
            <ActivityIndicator color={colors.ink} />
          </View>
        )}
      </Page>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.border }}>
      <View style={[{ flex: 1, width: '100%', backgroundColor: colors.background }, webPhoneWidth]}>
        <StatusBar style="dark" />
        {screen === 'WELCOME' && (
          <WelcomeScreen
            onStart={() => {
              setVerifyMode('signup');
              setScreen('VERIFY');
            }}
            onLogin={() => {
              setVerifyMode('login');
              setScreen('VERIFY');
            }}
          />
        )}
        {screen === 'VERIFY' && (
          <VerifyScreen config={config} mode={verifyMode} onBack={backToWelcome} onResult={handleIdentity} />
        )}
        {screen === 'UNDER_MIN_AGE' && <UnderMinAgeScreen signupMinAge={config.signupMinAge} onDone={backToWelcome} />}
        {screen === 'TEEN_NOT_YET' && <TeenNotYetScreen onDone={backToWelcome} />}
        {screen === 'ACCOUNT_UNAVAILABLE' && <AccountUnavailableScreen onDone={backToWelcome} />}
        {screen === 'PROFILE' && <ProfileScreen config={config} onDone={afterSave} />}
        {screen === 'FANDOM' && (
          <FandomScreen config={config} onBack={() => setScreen('PROFILE')} onDone={afterSave} />
        )}
        {screen === 'READY' && me && <ReadyScreen me={me} onDone={afterSave} />}
        {screen === 'HOME' && (
          <EventListScreen onNext={startFlow} onReport={() => setScreen('EVENT_REPORT')} flowError={flowError} />
        )}
        {screen === 'SCHEDULE' && event && draft && (
          <ScheduleScreen
            event={event}
            days={selectableDays(event, todayIso())}
            draft={draft}
            onChange={setDraft}
            onBack={() => setScreen('HOME')}
            onNext={() => setScreen('TEMPO')}
          />
        )}
        {screen === 'TEMPO' && draft && (
          <TempoScreen
            answers={draft.tempoAnswers}
            onChange={(a) => setDraft({ ...draft, tempoAnswers: a })}
            onBack={() => setScreen('SCHEDULE')}
            onNext={() => setScreen('IMMERSION')}
          />
        )}
        {screen === 'IMMERSION' && draft && (
          <ImmersionScreen
            answers={draft.immersionAnswers}
            onChange={(a) => setDraft({ ...draft, immersionAnswers: a })}
            onBack={() => setScreen('TEMPO')}
            onNext={() => setScreen('MUST')}
          />
        )}
        {screen === 'MUST' && draft && (
          <MustScreen
            draft={draft}
            onChange={setDraft}
            onBack={() => setScreen('IMMERSION')}
            onSubmit={submitPreference}
            saving={saving}
            error={flowError}
          />
        )}
        {screen === 'CANDIDATES' && event && draft && (
          <CandidatesScreen
            event={event}
            chosenDayIds={Object.keys(draft.days)}
            onBack={() => setScreen('MUST')}
            onOpen={(c) => {
              setCandidate(c);
              setScreen('CANDIDATE_DETAIL');
            }}
            onOtherDay={() => setScreen('SCHEDULE')}
            onWait={() => setScreen('WAIT')}
          />
        )}
        {screen === 'CANDIDATE_DETAIL' && event && candidate && (
          <CandidateDetailScreen event={event} candidate={candidate} onBack={() => setScreen('CANDIDATES')} />
        )}
        {screen === 'WAIT' && event && draft && (
          <WaitScreen
            event={event}
            dates={event.days.filter((d) => draft.days[d.id]).map((d) => d.date)}
            onBack={() => setScreen('CANDIDATES')}
            onDone={() => setScreen('HOME')}
          />
        )}
        {screen === 'EVENT_REPORT' && (
          <EventReportScreen
            onBack={() => setScreen('HOME')}
            onDone={(input, result) => {
              setReported({ input, result });
              setScreen('EVENT_REPORTED');
            }}
          />
        )}
        {screen === 'EVENT_REPORTED' && reported && (
          <EventReportedScreen input={reported.input} result={reported.result} onDone={() => setScreen('HOME')} />
        )}
      </View>
    </View>
  );
}

/** 웹(PC 브라우저)에서는 휴대폰 폭으로 가운데에 보여 줍니다. */
const webPhoneWidth = Platform.OS === 'web' ? { maxWidth: 480, alignSelf: 'center' as const } : null;
