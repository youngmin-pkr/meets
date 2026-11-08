/**
 * 앱의 시작점: 가입 → 행사 선택 → 입력 흐름 → 후보
 */
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, View } from 'react-native';
import {
  todayInSeoul,
  type MaskBox,
  type MyTicketStatus,
  type TicketConfirmResult,
  type TicketKind,
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
import {
  TicketCheckScreen,
  TicketIntroScreen,
  TicketMaskScreen,
  TicketResultScreen,
  TicketUploadScreen,
} from './src/screens/TicketScreens';
import type { PickedImage } from './src/ticketFlow';
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
  // 티켓 인증
  const [myTicket, setMyTicket] = useState<MyTicketStatus | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticketKind, setTicketKind] = useState<TicketKind>('TICKET');
  const [reverifying, setReverifying] = useState(false);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [masks, setMasks] = useState<MaskBox[]>([]);
  const [ticketResult, setTicketResult] = useState<TicketConfirmResult | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
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
      await showCandidates();
    } catch (e) {
      setFlowError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  async function showCandidates() {
    if (event) setMyTicket(await api.getTicketStatus(event.id).catch(() => null));
    setScreen('CANDIDATES');
  }

  /** 티켓 인증 단계를 실행하고, 실패하면 화면에 안내합니다. */
  async function ticketStep(fn: () => Promise<void>) {
    setTicketError(null);
    setTicketBusy(true);
    try {
      await fn();
    } catch (e) {
      setTicketError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setTicketBusy(false);
    }
  }

  const startTicket = (kind: TicketKind) =>
    ticketStep(async () => {
      if (!event) return;
      setTicketKind(kind);
      setPicked(null);
      setMasks([]);
      // 재검증 중이면 새로 시작하지 않고, 같은 인증에 이미지만 다시 올립니다.
      const v = myTicket?.verification;
      if (v?.status === 'REVERIFYING') {
        setTicketId(v.id);
        setReverifying(true);
      } else {
        const started = await api.startTicket(event.id, kind);
        setTicketId(started.id);
        setReverifying(false);
      }
      setScreen('TICKET_UPLOAD');
    });

  const planAttendance = () =>
    ticketStep(async () => {
      if (!event) return;
      setMyTicket(await api.planAttendance(event.id));
      setScreen('CANDIDATES');
    });

  const uploadTicket = () =>
    ticketStep(async () => {
      if (!ticketId || !picked) return;
      await api.uploadTicketImage(ticketId, picked.base64, picked.mimeType, masks);
      if (reverifying) {
        setTicketResult({ status: 'REVIEW_PENDING', failReason: null, checks: { sameEvent: true, notPast: true, notUsedElsewhere: true } });
        setScreen('TICKET_RESULT');
      } else {
        setScreen('TICKET_CHECK');
      }
    });

  const confirmTicket = (number: string, dayIds: string[]) =>
    ticketStep(async () => {
      if (!ticketId || !event) return;
      setTicketResult(await api.confirmTicket(ticketId, number, dayIds));
      setMyTicket(await api.getTicketStatus(event.id));
      setPicked(null); // 앱에서도 이미지를 바로 잊습니다.
      setScreen('TICKET_RESULT');
    });

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
            myGrade={myTicket?.grade ?? null}
            ticketPending={myTicket?.verification?.status === 'REVIEW_PENDING'}
            onVerify={() => setScreen('TICKET_INTRO')}
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
          <CandidateDetailScreen
            event={event}
            candidate={candidate}
            myGrade={myTicket?.grade ?? null}
            onVerify={() => setScreen('TICKET_INTRO')}
            onBack={() => setScreen('CANDIDATES')}
          />
        )}
        {screen === 'TICKET_INTRO' && event && (
          <TicketIntroScreen
            event={event}
            canPlan={!!myTicket?.canPlanWithoutTicket && myTicket.grade !== 'PLANNED'}
            onBack={() => setScreen('CANDIDATES')}
            onStart={startTicket}
            onPlan={planAttendance}
            busy={ticketBusy}
            error={ticketError}
          />
        )}
        {screen === 'TICKET_UPLOAD' && event && (
          <TicketUploadScreen
            event={event}
            picked={picked}
            onPick={(img) => {
              setPicked(img);
              setMasks([]);
            }}
            onBack={() => setScreen('TICKET_INTRO')}
            onNext={() => setScreen('TICKET_MASK')}
          />
        )}
        {screen === 'TICKET_MASK' && picked && (
          <TicketMaskScreen
            picked={picked}
            masks={masks}
            onChange={setMasks}
            onBack={() => setScreen('TICKET_UPLOAD')}
            onNext={uploadTicket}
            busy={ticketBusy}
            error={ticketError}
          />
        )}
        {screen === 'TICKET_CHECK' && event && (
          <TicketCheckScreen
            event={event}
            onBack={() => setScreen('TICKET_UPLOAD')}
            onSubmit={confirmTicket}
            busy={ticketBusy}
            error={ticketError}
          />
        )}
        {screen === 'TICKET_RESULT' && event && ticketResult && (
          <TicketResultScreen
            event={event}
            nickname={me?.nickname ?? ''}
            result={ticketResult}
            canPlan={!!myTicket?.canPlanWithoutTicket}
            onDone={showCandidates}
            onRetry={() => startTicket(ticketKind)}
            onPlan={planAttendance}
          />
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
