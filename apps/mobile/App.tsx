/**
 * 앱의 시작점. 지금은 1단계(가입·본인 확인) 화면만 있습니다.
 */
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, View } from 'react-native';
import type { EventReportInput, EventReportResult, EventSummary, IdentityResult } from '@meets/shared';
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
import { EventSelectedScreen } from './src/screens/EventSelectedScreen';
import { EventReportedScreen, EventReportScreen } from './src/screens/EventReportScreen';

export default function App() {
  const [config, setConfig] = useState<SignupConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('WELCOME');
  const [verifyMode, setVerifyMode] = useState<'signup' | 'login'>('signup');
  const [me, setMe] = useState<Me | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
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
          <EventListScreen
            onNext={(event) => {
              setSelectedEvent(event);
              setScreen('EVENT_SELECTED');
            }}
            onReport={() => setScreen('EVENT_REPORT')}
          />
        )}
        {screen === 'EVENT_SELECTED' && selectedEvent && (
          <EventSelectedScreen event={selectedEvent} onBack={() => setScreen('HOME')} />
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
