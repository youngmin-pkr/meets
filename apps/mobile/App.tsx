/**
 * 앱의 시작점: 가입 → 행사 선택 → 입력 흐름 → 후보
 */
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, View } from 'react-native';
import {
  todayInSeoul,
  type AppointmentView,
  type PartyView,
  type ProposalView,
  type MaskBox,
  type MyTicketStatus,
  type TicketConfirmResult,
  type TicketKind,
  type CandidateCard,
  type EventCategory,
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
import { ProposalSentScreen, ProposalsScreen } from './src/screens/ProposalScreens';
import { AppointmentScreen, CancelAppointmentScreen, HomeScreen, NotificationsScreen } from './src/screens/AppointmentScreens';
import { EventReportedScreen, EventReportScreen } from './src/screens/EventReportScreen';
import { ChatListScreen, ChatRulesScreen, ChatScreen } from './src/screens/ChatScreens';
import { BlockListScreen, MyPageScreen, TrustLevelScreen } from './src/screens/MyScreens';
import { SafetySettingsScreen } from './src/screens/SafetyScreens';
import { InstantScreen } from './src/screens/InstantScreens';
import { PartyCandidatesScreen, PartyJoinScreen, PartyListScreen, PartyScreen } from './src/screens/PartyScreens';
import { ReportScreen, ReviewAgainScreen, ReviewDoneScreen, ReviewPickScreen, ReviewStartScreen } from './src/screens/ReviewScreens';
import { chooseOverall, initialReviewDraft, type ReviewDraft } from './src/reviewFlow';
import type { Tab } from './src/ui';

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
  const [instantEventId, setInstantEventId] = useState<string | null>(null);
  const [partyEventId, setPartyEventId] = useState<string | null>(null);
  const [partyBack, setPartyBack] = useState<Screen>('PARTY_LIST');
  const [partyForCandidates, setPartyForCandidates] = useState<PartyView | null>(null);
  const [myTicket, setMyTicket] = useState<MyTicketStatus | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticketKind, setTicketKind] = useState<TicketKind>('TICKET');
  const [reverifying, setReverifying] = useState(false);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [masks, setMasks] = useState<MaskBox[]>([]);
  const [ticketResult, setTicketResult] = useState<TicketConfirmResult | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  // 제안과 약속
  const [appointment, setAppointment] = useState<AppointmentView | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);
  const [sentProposal, setSentProposal] = useState<ProposalView | null>(null);
  // 후기와 신고
  const [reviewAppt, setReviewAppt] = useState<AppointmentView | null>(null);
  /** 여러 명이 만난 약속에서 아직 후기를 남기지 않은 다음 사람이 있는 약속 */
  const [reviewNext, setReviewNext] = useState<AppointmentView | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>(initialReviewDraft());
  const [reviewResult, setReviewResult] = useState<{ mutual: boolean; reported: boolean }>({ mutual: false, reported: false });
  const [reportBack, setReportBack] = useState<Screen>('HOME');
  const [reportFromReview, setReportFromReview] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatBack, setChatBack] = useState<Screen>('CHATS');
  const [focusSearch, setFocusSearch] = useState(false);
  const [eventCategory, setEventCategory] = useState<EventCategory | undefined>(undefined);
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
      // 홈에서 눌렀어도 오류는 행사 탭에서 보여 줍니다.
      setScreen('EVENTS');
    }
  }

  /** 약속 화면의 '다른 후보 보러 가기': 이미 입력했으면 후보로, 아니면 일정 입력부터 */
  async function openCandidates(eventId: string) {
    setFlowError(null);
    try {
      const [detail, saved] = await Promise.all([api.getEvent(eventId), api.getPreference(eventId)]);
      setEvent(detail);
      setDraft(initialDraft(detail, saved, todayIso()));
      if (saved) {
        setMyTicket(await api.getTicketStatus(eventId).catch(() => null));
        setScreen('CANDIDATES');
      } else {
        setScreen('SCHEDULE');
      }
    } catch (e) {
      setFlowError(e instanceof Error ? e.message : '다시 시도해 주세요.');
      setScreen('EVENTS');
    }
  }

  /** 아래쪽 메뉴 */
  function goTab(t: Tab) {
    if (t === 'EVENTS') {
      setEventCategory(undefined);
      setFocusSearch(false);
    }
    setScreen(t);
  }

  /** 후기 시작 */
  function startReview(a: AppointmentView) {
    // 후기는 한 사람씩 따로 남깁니다. 후기 화면들은 '대상'을 counterpart로 보여 주므로, 남길 사람을 counterpart로 바꿔서 넘깁니다.
    const target = a.review.targets[0] ?? a.counterpart;
    setReviewNext(null);
    setReviewAppt({ ...a, counterpart: target });
    setReviewDraft(initialReviewDraft());
    setReviewResult({ mutual: false, reported: false });
    setScreen('REVIEW_START');
  }

  /** 신고 화면 (돌아갈 곳을 함께 기억) */
  function openReport(a: AppointmentView, back: Screen, fromReview = false) {
    setReviewAppt(a);
    setReportBack(back);
    setReportFromReview(fromReview);
    setScreen('REPORT');
  }

  function openChat(appointmentId: string, from: Screen) {
    setChatId(appointmentId);
    setChatBack(from);
    setScreen('CHAT');
  }

  function openAppointment(a: AppointmentView, accepted = false) {
    setAppointment(a);
    setJustAccepted(accepted);
    setScreen('APPOINTMENT');
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
          <HomeScreen
            nickname={me?.nickname ?? ''}
            onFindEvents={(category) => {
              setEventCategory(category);
              setFocusSearch(false);
              setScreen('EVENTS');
            }}
            onSearch={() => {
              setEventCategory(undefined);
              setFocusSearch(true);
              setScreen('EVENTS');
            }}
            onOpenEvent={startFlow}
            onReview={startReview}
            onProposals={() => setScreen('PROPOSALS')}
            onAppointment={(a) => openAppointment(a)}
            onNotifications={() => setScreen('NOTIFICATIONS')}
            onInstant={(id) => {
              setInstantEventId(id);
              setScreen('INSTANT');
            }}
            onTab={goTab}
          />
        )}
        {screen === 'EVENTS' && (
          <EventListScreen
            key={`${eventCategory ?? 'all'}-${focusSearch}`}
            initialCategory={eventCategory}
            focusSearch={focusSearch}
            onNext={startFlow}
            onReport={() => setScreen('EVENT_REPORT')}
            onTab={goTab}
            flowError={flowError}
          />
        )}
        {screen === 'PROPOSALS' && (
          <ProposalsScreen
            onBack={() => setScreen('HOME')}
            onAccepted={(a) => openAppointment(a, true)}
          />
        )}
        {screen === 'APPOINTMENT' && appointment && (
          <AppointmentScreen
            key={`${appointment.id}-${appointment.status}`}
            appointment={appointment}
            justAccepted={justAccepted}
            onBack={() => setScreen('HOME')}
            onCancel={(a) => {
              setAppointment(a);
              setScreen('APPOINTMENT_CANCEL');
            }}
            onFindOthers={openCandidates}
            onChat={(id) => openChat(id, 'APPOINTMENT')}
          />
        )}
        {screen === 'APPOINTMENT_CANCEL' && appointment && (
          <CancelAppointmentScreen appointment={appointment} onBack={() => setScreen('APPOINTMENT')} onDone={(a) => openAppointment(a)} />
        )}
        {screen === 'CHATS' && <ChatListScreen onOpen={(id) => openChat(id, 'CHATS')} onTab={goTab} />}
        {screen === 'CHAT' && chatId && (
          <ChatScreen
            key={chatId}
            appointmentId={chatId}
            onBack={async () => {
              // 약속 화면에서 왔으면 최신 약속으로 돌아갑니다.
              if (chatBack === 'APPOINTMENT') {
                const fresh = await api.getAppointment(chatId).catch(() => null);
                if (fresh) setAppointment(fresh);
              }
              setScreen(chatBack);
            }}
            onRules={() => setScreen('CHAT_RULES')}
          />
        )}
        {screen === 'CHAT_RULES' && chatId && (
          <ChatRulesScreen
            appointmentId={chatId}
            onBack={() => setScreen('CHAT')}
            onReport={(a) => openReport(a, 'CHAT_RULES')}
            onBlocked={() => setScreen('CHATS')}
          />
        )}
        {screen === 'ME' && (
          <MyPageScreen
            nickname={me?.nickname ?? ''}
            avatarInitial={me?.avatarInitial ?? null}
            onTab={goTab}
            onTrust={() => setScreen('TRUST')}
            onBlocks={() => setScreen('BLOCKS')}
            onProposals={() => setScreen('PROPOSALS')}
            onNotifications={() => setScreen('NOTIFICATIONS')}
            onSafety={() => setScreen('SAFETY_SETTINGS')}
            onParties={() => setScreen('PARTY_LIST')}
          />
        )}
        {screen === 'INSTANT' && instantEventId && <InstantScreen eventId={instantEventId} onBack={() => setScreen('HOME')} />}
        {screen === 'PARTY_LIST' && (
          <PartyListScreen
            onBack={() => setScreen('ME')}
            onOpen={(p) => {
              setPartyEventId(p.event.id);
              setPartyBack('PARTY_LIST');
              setScreen('PARTY');
            }}
            onJoin={() => setScreen('PARTY_JOIN')}
          />
        )}
        {screen === 'PARTY_JOIN' && (
          <PartyJoinScreen
            onBack={() => setScreen('PARTY_LIST')}
            onJoined={(p) => {
              setPartyEventId(p.event.id);
              setPartyBack('PARTY_LIST');
              setScreen('PARTY');
            }}
          />
        )}
        {screen === 'PARTY' && partyEventId && (
          <PartyScreen
            eventId={partyEventId}
            onBack={() => setScreen(partyBack)}
            onInput={(id) => openCandidates(id)}
            onCandidates={(p) => {
              setPartyForCandidates(p);
              setScreen('PARTY_CANDIDATES');
            }}
          />
        )}
        {screen === 'PARTY_CANDIDATES' && partyForCandidates && (
          <PartyCandidatesScreen party={partyForCandidates} onBack={() => setScreen('PARTY')} onProposed={() => setScreen('PARTY')} />
        )}
        {screen === 'SAFETY_SETTINGS' && <SafetySettingsScreen onBack={() => setScreen('ME')} />}
        {screen === 'TRUST' && <TrustLevelScreen onBack={() => setScreen('ME')} onEvents={() => goTab('EVENTS')} />}
        {screen === 'BLOCKS' && <BlockListScreen onBack={() => setScreen('ME')} onReport={(a) => openReport(a, 'BLOCKS')} />}
        {screen === 'REVIEW_START' && reviewAppt && (
          <ReviewStartScreen
            appointment={reviewAppt}
            onLater={() => setScreen('HOME')}
            onChoose={(overall) => {
              const r = chooseOverall(reviewDraft, overall);
              setReviewDraft(r.draft);
              if (r.next === 'REPORT') openReport(reviewAppt, 'REVIEW_START', true);
              else setScreen(r.next);
            }}
          />
        )}
        {screen === 'REVIEW_PICK' && (
          <ReviewPickScreen draft={reviewDraft} onChange={setReviewDraft} onBack={() => setScreen('REVIEW_START')} onNext={() => setScreen('REVIEW_AGAIN')} />
        )}
        {screen === 'REVIEW_AGAIN' && reviewAppt && (
          <ReviewAgainScreen
            appointment={reviewAppt}
            draft={reviewDraft}
            onChange={setReviewDraft}
            onBack={() => setScreen('REVIEW_PICK')}
            onSent={(r) => {
              setReviewResult({ mutual: r.mutual, reported: false });
              // 남길 사람이 더 있으면 이어서 안내합니다.
              api.getAppointment(reviewAppt.id).then(
                (fresh) => setReviewNext(fresh.review.targets.length > 0 ? fresh : null),
                () => setReviewNext(null),
              );
              setScreen('REVIEW_DONE');
            }}
          />
        )}
        {screen === 'REVIEW_DONE' && reviewAppt && (
          <ReviewDoneScreen
            appointment={reviewAppt}
            result={reviewResult}
            nextTarget={reviewNext?.review.targets[0]?.nickname ?? null}
            onNext={() => reviewNext && startReview(reviewNext)}
            onTrust={() => setScreen('TRUST')}
            onEvents={() => goTab('EVENTS')}
          />
        )}
        {screen === 'REPORT' && reviewAppt && (
          <ReportScreen
            appointment={reviewAppt}
            fromReview={reportFromReview}
            onBack={() => setScreen(reportBack)}
            onSent={() => {
              setReviewResult({ mutual: false, reported: true });
              setScreen('REVIEW_DONE');
            }}
          />
        )}
        {screen === 'NOTIFICATIONS' && (
          <NotificationsScreen
            onBack={() => setScreen('HOME')}
            onProposals={() => setScreen('PROPOSALS')}
            onAppointment={async (id) => {
              try {
                openAppointment(await api.getAppointment(id));
              } catch {
                setScreen('HOME');
              }
            }}
          />
        )}
        {screen === 'PROPOSAL_SENT' && sentProposal && (
          <ProposalSentScreen proposal={sentProposal} onDone={() => setScreen('CANDIDATES')} onHome={() => setScreen('HOME')} />
        )}
        {screen === 'SCHEDULE' && event && draft && (
          <ScheduleScreen
            event={event}
            days={selectableDays(event, todayIso())}
            draft={draft}
            onChange={setDraft}
            onBack={() => setScreen('EVENTS')}
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
        {screen === 'IMMERSION' && draft && event && (
          <ImmersionScreen
            category={event.category}
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
            onParty={() => {
              setPartyEventId(event.id);
              setPartyBack('CANDIDATES');
              setScreen('PARTY');
            }}
          />
        )}
        {screen === 'CANDIDATE_DETAIL' && event && candidate && (
          <CandidateDetailScreen
            event={event}
            candidate={candidate}
            myGrade={myTicket?.grade ?? null}
            onVerify={() => setScreen('TICKET_INTRO')}
            onBack={() => setScreen('CANDIDATES')}
            onSent={(p) => {
              setSentProposal(p);
              setScreen('PROPOSAL_SENT');
            }}
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
            onBack={() => setScreen('EVENTS')}
            onDone={(input, result) => {
              setReported({ input, result });
              setScreen('EVENT_REPORTED');
            }}
          />
        )}
        {screen === 'EVENT_REPORTED' && reported && (
          <EventReportedScreen input={reported.input} result={reported.result} onDone={() => setScreen('EVENTS')} />
        )}
      </View>
    </View>
  );
}

/** 웹(PC 브라우저)에서는 휴대폰 폭으로 가운데에 보여 줍니다. */
const webPhoneWidth = Platform.OS === 'web' ? { maxWidth: 480, alignSelf: 'center' as const } : null;
