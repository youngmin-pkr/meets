/**
 * 홈 · 약속(확정 대기, 전날 확인, 상대 미확정, 확정, 당일, 다시 정하기) · 취소 · 알림함
 * (시안: Home, ConfirmWait, ConfirmDayBefore, ConfirmPartner, ConfirmCancel, NoShow, NotifySettings)
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  APPOINTMENT_STATUS_LABELS,
  CANCEL_REASON_CODES,
  CANCEL_REASONS,
  dDayLabel,
  describeRemaining,
  EVENT_CATEGORY_LABELS,
  formatSeoulShort,
  POLICY_DEFAULTS,
  todayInSeoul,
  type AppointmentView,
  type CancelReason,
  type EventCategory,
  type NotificationView,
  type ProposalView,
} from '@meets/shared';
import { api, type HomeSummary } from '../api';
import { appointmentHeadline, appointmentMode, todoText, upcomingAppointments } from '../appointmentMode';
import { colors } from '../theme';
import { Body, Card, ErrorText, keepWords, Page, Pill, PrimaryButton, styles, TabBar, TextButton, Title, TopBar, type Tab } from '../ui';
import { Avatar, dateText, Row } from './ProposalScreens';

const todayIso = () => {
  const t = todayInSeoul();
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
};

const timeOf = (iso: string) => formatSeoulShort(iso).split(' ').pop() ?? '';

function Badge({ label, tone = 'red' }: { label: string; tone?: 'red' | 'ink' | 'lime' }) {
  const bg = tone === 'red' ? colors.primary : tone === 'ink' ? colors.ink : colors.lime;
  const fg = tone === 'lime' ? colors.ink : tone === 'ink' ? colors.lime : colors.white;
  return (
    <View style={{ height: 24, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 12, backgroundColor: bg }}>
      <Text style={{ fontSize: 12, fontWeight: '900', color: fg }}>{label}</Text>
    </View>
  );
}

function Arrow({ color = colors.ink }: { color?: string }) {
  return <Text style={{ fontSize: 18, color }}>›</Text>;
}

// ───────────────────────── 홈 ─────────────────────────

/** 가입을 마친 사람의 첫 화면 */
export function HomeScreen(props: {
  nickname: string;
  onFindEvents: (category?: EventCategory) => void;
  onProposals: () => void;
  onAppointment: (a: AppointmentView) => void;
  onNotifications: () => void;
  onTab: (t: Tab) => void;
}) {
  const [proposals, setProposals] = useState<ProposalView[] | null>(null);
  const [appointments, setAppointments] = useState<AppointmentView[]>([]);
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [counts, setCounts] = useState<Record<EventCategory, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listProposals(), api.listAppointments(), api.getHomeSummary(), api.listEvents({})]).then(
      ([p, a, s, events]) => {
        setProposals(p);
        setAppointments(a);
        setSummary(s);
        setCounts({
          PERFORMANCE: events.filter((e) => e.category === 'PERFORMANCE').length,
          EXHIBITION: events.filter((e) => e.category === 'EXHIBITION').length,
        });
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  const today = todayIso();
  const received = proposals?.filter((p) => p.direction === 'RECEIVED' && p.status === 'SENT') ?? [];
  const sent = proposals?.filter((p) => p.direction === 'SENT' && p.status === 'SENT') ?? [];
  const upcoming = upcomingAppointments(appointments);
  const todos = upcoming.map((a) => ({ a, text: todoText(a, today) })).filter((x) => x.text);
  const soonest = received.map((p) => p.expiresAt).sort()[0];
  const chatUnread = appointments.reduce((n, a) => n + a.unreadMessages, 0);

  return (
    <Page tabBar={<TabBar current="HOME" onChange={props.onTab} chatUnread={chatUnread} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 13, color: colors.muted }}>오늘도 즐거운 행사 되세요</Text>
          <Text style={[{ fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.ink }, keepWords]}>{`안녕하세요, ${props.nickname}님`}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {summary?.hasVerifiedTicket ? <Badge label="참석 인증" tone="ink" /> : null}
          <Pressable
            onPress={props.onNotifications}
            accessibilityRole="button"
            accessibilityLabel={summary?.unreadNotifications ? `알림, 읽지 않은 알림 ${summary.unreadNotifications}개` : '알림'}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <BellIcon />
            {summary?.unreadNotifications ? (
              <View style={{ position: 'absolute', top: 9, right: 9, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.background }} />
            ) : null}
          </Pressable>
        </View>
      </View>

      {todos.map(({ a, text }) => (
        <Pressable
          key={`todo-${a.id}`}
          onPress={() => props.onAppointment(a)}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: colors.primary }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.white }}>오늘 할 일</Text>
            <Text style={[{ fontSize: 15, fontWeight: '900', color: colors.white }, keepWords]}>{text!.title}</Text>
            <Text style={[{ fontSize: 12, color: colors.white }, keepWords]}>{text!.body}</Text>
          </View>
          <Arrow color={colors.white} />
        </Pressable>
      ))}

      {upcoming.map((a) => (
        <Pressable
          key={a.id}
          onPress={() => props.onAppointment(a)}
          accessibilityRole="button"
          style={{ gap: 8, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>{`다가오는 약속 · ${APPOINTMENT_STATUS_LABELS[a.status]}`}</Text>
            <Badge label={dDayLabel(a.day.date, today)} />
          </View>
          <Text style={[{ fontSize: 16, fontWeight: '900', color: colors.ink }, keepWords]}>{a.event.name}</Text>
          <Text style={[{ fontSize: 13, color: colors.body }, keepWords]}>
            {`${dateText(a.day.date)} ${a.day.startTime} · ${a.segments.map((s) => s.label).join(', ') || '행사 시간'} · ${a.counterpart.nickname}님`}
          </Text>
          {a.unreadMessages ? (
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{`안 읽은 메시지 ${a.unreadMessages}개`}</Text>
          ) : null}
        </Pressable>
      ))}

      <Pressable
        onPress={props.onProposals}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, backgroundColor: received.length ? colors.lime : colors.white, borderWidth: received.length ? 0 : 1.5, borderColor: colors.border }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: colors.ink }}>{`받은 제안 ${received.length}건 · 보낸 제안 ${sent.length}건`}</Text>
          <Text style={[{ fontSize: 12, color: colors.body }, keepWords]}>
            {soonest ? `답하지 않으면 ${describeRemaining(soonest, new Date()).replace(' 남음', '')} 뒤 만료돼요` : '제안을 주고받으면 여기에 보여요'}
          </Text>
        </View>
        <Arrow />
      </Pressable>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: colors.ink }}>같이 갈 행사 찾기</Text>
          <Pressable onPress={() => props.onFindEvents()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>전체 보기</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['PERFORMANCE', 'EXHIBITION'] as EventCategory[]).map((c) => (
            <Pressable
              key={c}
              onPress={() => props.onFindEvents(c)}
              accessibilityRole="button"
              style={{ flex: 1, gap: 4, padding: 14, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border }}
            >
              <Text style={[{ fontSize: 13, fontWeight: '700', color: colors.ink }, keepWords]}>{EVENT_CATEGORY_LABELS[c]}</Text>
              <Text style={{ fontSize: 12, color: colors.muted }}>{counts ? `열리는 행사 ${counts[c]}개` : ' '}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ErrorText message={error} />
    </Page>
  );
}

function BellIcon() {
  // 종 모양 (글자 대신 도형으로 그려서 어느 기기에서나 같게 보입니다)
  return (
    <View style={{ alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
      <View style={{ width: 16, height: 15, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 2, borderBottomWidth: 0, borderColor: colors.ink }} />
      <View style={{ width: 22, height: 2, backgroundColor: colors.ink, borderRadius: 1 }} />
      <View style={{ width: 6, height: 3, marginTop: 1, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.ink }} />
    </View>
  );
}

// ───────────────────────── 약속 ─────────────────────────

function StatusRow(props: { c?: AppointmentView['counterpart']; label: string; done: boolean; doneText: string; waitText: string }) {
  return (
    <View style={[styles.row, { padding: 12, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border }]}>
      {props.c ? (
        <Avatar c={props.c} size={36} />
      ) : (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: colors.lime }}>나</Text>
        </View>
      )}
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink }}>{props.label}</Text>
      {props.done ? <Badge label={`✓ ${props.doneText}`} tone="lime" /> : <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{props.waitText}</Text>}
    </View>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
      <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>{children}</Text>
    </View>
  );
}

function Step(props: { n: string; title: string; text: string; done?: boolean; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: props.done ? colors.ink : colors.white,
            borderWidth: props.done ? 0 : 2,
            borderColor: props.n === '2' ? colors.primary : colors.border,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '900', color: props.done ? colors.lime : props.n === '2' ? colors.primary : colors.muted }}>{props.done ? '✓' : props.n}</Text>
        </View>
        {props.last ? null : <View style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: props.done ? colors.ink : colors.border }} />}
      </View>
      <View style={{ flex: 1, gap: 2, paddingBottom: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{props.title}</Text>
        <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>{props.text}</Text>
      </View>
    </View>
  );
}

/** 약속 하나. 상태에 따라 전날 확인·상대 기다리기·확정·당일·다시 정하기·끝남을 보여 줍니다. */
export function AppointmentScreen(props: {
  appointment: AppointmentView;
  justAccepted?: boolean;
  onBack: () => void;
  onCancel: (a: AppointmentView) => void;
  onFindOthers: (eventId: string) => void;
  onChat: (appointmentId: string) => void;
}) {
  const [a, setA] = useState(props.appointment);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askNoShow, setAskNoShow] = useState(false);
  const mode = appointmentMode(a);

  const reload = useCallback(() => {
    api.getAppointment(props.appointment.id).then(setA, (e: Error) => setError(e.message));
  }, [props.appointment.id]);
  useEffect(reload, [reload]);
  // 상대를 기다리는 동안에는 가끔 다시 불러와서, 상대가 확인하면 바로 바뀌게 합니다.
  useEffect(() => {
    if (mode !== 'WAITING_PARTNER' && !(mode === 'RESCHEDULE' && a.reschedule?.mine)) return;
    const timer = setInterval(reload, 4000);
    return () => clearInterval(timer);
  }, [mode, a.reschedule?.mine, reload]);

  async function act(fn: () => Promise<AppointmentView>) {
    setError(null);
    setBusy(true);
    try {
      setA(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
      setAskNoShow(false);
    }
  }

  const today = todayIso();
  const head = appointmentHeadline(a, { justAccepted: props.justAccepted, today });
  const nick = `${a.counterpart.nickname}님`;
  const cancelLink = a.actions.cancel ? <TextButton label="약속을 취소할래요" onPress={() => props.onCancel(a)} /> : null;

  let footer: ReactNode;
  if (mode === 'CONFIRM_NOW') {
    footer = (
      <>
        <PrimaryButton label="갈 수 있어요" loading={busy} onPress={() => act(() => api.confirmAppointment(a.id))} />
        {cancelLink}
      </>
    );
  } else if (mode === 'WAITING_PARTNER') {
    footer = (
      <>
        <PrimaryButton label="다른 후보 보러 가기" onPress={() => props.onFindOthers(a.event.id)} />
        {cancelLink}
      </>
    );
  } else if (mode === 'RESCHEDULE' && a.actions.reconfirm) {
    footer = <PrimaryButton label="바뀐 일정으로 갈게요" loading={busy} onPress={() => act(() => api.confirmAppointment(a.id))} />;
  } else if (mode === 'MEETING' && a.actions.reportNoShow) {
    footer = askNoShow ? (
      <>
        <Text style={[styles.small, { textAlign: 'center' }, keepWords]}>만남이 끝나요. 바로 노쇼로 정해지지 않고, 양쪽 도착 기록을 함께 보고 판단해요.</Text>
        <PrimaryButton dark label="네, 만남을 끝낼게요" loading={busy} onPress={() => act(() => api.reportNoShow(a.id))} />
        <TextButton label="조금 더 기다릴게요" onPress={() => setAskNoShow(false)} />
      </>
    ) : (
      <>
        <PrimaryButton label="조금 더 기다릴게요" onPress={props.onBack} />
        <TextButton label="안 나왔어요 (만남 종료)" onPress={() => setAskNoShow(true)} />
      </>
    );
  } else if ((mode === 'CONFIRMED' || mode === 'MEETING') && a.actions.arrive) {
    footer = (
      <>
        <PrimaryButton label="도착했어요" loading={busy} onPress={() => act(() => api.arriveAppointment(a.id))} />
        {cancelLink}
      </>
    );
  } else if (mode === 'CLOSED' && a.end?.reason === 'NO_CONFIRM' && !a.end.byMe) {
    footer = (
      <>
        <PrimaryButton label="다른 후보 보러 가기" onPress={() => props.onFindOthers(a.event.id)} />
        <TextButton label="홈으로" onPress={props.onBack} />
      </>
    );
  } else {
    footer = (
      <>
        <PrimaryButton label={mode === 'CLOSED' || mode === 'ON_HOLD' ? '홈으로' : '확인했어요'} onPress={props.onBack} />
        {cancelLink}
      </>
    );
  }

  const closed = mode === 'CLOSED' || mode === 'ON_HOLD';
  return (
    <Page footer={footer}>
      <View style={[styles.row, { minHeight: 44 }]}>
        <TopBar label="내 약속" onBack={props.onBack} />
        {!closed ? <Badge label={dDayLabel(a.day.date, today)} /> : null}
      </View>

      {mode === 'CONFIRM_NOW' || mode === 'WAITING_PARTNER' || mode === 'RESCHEDULE' ? (
        <View style={{ gap: 8 }}>
          <Title>{head.title}</Title>
          <Body>{head.body}</Body>
        </View>
      ) : (
        <View style={[styles.row, { padding: 14, borderRadius: 14, backgroundColor: closed ? colors.warnBg : colors.lime }]}>
          <Avatar c={a.counterpart} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[{ fontSize: 16, fontWeight: '900', color: colors.ink }, keepWords]}>{head.title}</Text>
            {head.body ? <Text style={[{ fontSize: 12, color: colors.ink }, keepWords]}>{head.body}</Text> : null}
          </View>
        </View>
      )}

      <View style={{ gap: 10, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white }}>
        <Row label="행사" text={a.event.name} />
        <Row label="날짜" text={`${dateText(a.day.date)} ${timeOf(a.startsAt)}–${timeOf(a.endsAt)}`} />
        <Row label="구간" text={a.segments.map((s) => `${s.label} ${s.startTime}–${s.endTime}`).join(', ') || '행사 시간 중'} />
        <Row label="장소" text={a.meetingSpot.name} />
        <Row label="상대" text={nick} />
      </View>

      <Pressable
        onPress={() => props.onChat(a.id)}
        accessibilityRole="button"
        style={[styles.row, { padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: a.unreadMessages ? colors.ink : colors.border, backgroundColor: colors.white }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: colors.ink }}>{`${nick}과 대화하기`}</Text>
          <Text style={[{ fontSize: 12, color: colors.muted }, keepWords]}>
            {a.unreadMessages ? `안 읽은 메시지 ${a.unreadMessages}개` : closed ? '지난 대화를 볼 수 있어요' : '연락처 없이 앱 안에서 대화해요'}
          </Text>
        </View>
        <Arrow />
      </Pressable>

      {mode === 'WAITING_DAY_BEFORE' ? (
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', marginBottom: 10 }}>앞으로 이렇게 진행돼요</Text>
          <Step n="1" title="수락됨" text="지금 여기예요" done />
          <Step n="2" title="전날 확정" text={`${formatSeoulShort(a.confirm.opensAt)}에 알림이 가요. 둘 다 '갈 수 있어요'를 누르면 확정돼요.`} />
          <Step n="3" title="당일 만남" text={`약속 ${POLICY_DEFAULTS.APPOINTMENT_SOON_MINUTES / 60}시간 전에 한 번 더 알려드려요.`} last />
        </View>
      ) : null}

      {mode === 'CONFIRM_NOW' || mode === 'WAITING_PARTNER' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700' }}>지금 상태</Text>
          <StatusRow label="내 확인" done={a.confirm.mine} doneText="갈 수 있어요" waitText="기다리는 중" />
          <StatusRow c={a.counterpart} label={nick} done={a.confirm.theirs} doneText="갈 수 있어요" waitText="아직이에요" />
          <Card>
            <Text style={{ fontSize: 14, fontWeight: '900' }}>{`확인 마감 ${formatSeoulShort(a.confirm.deadline)}`}</Text>
            <Body>마감까지 둘 다 확인하지 않으면 약속이 자동으로 취소돼요. 확인한 사람의 신뢰 단계에는 영향이 없어요.</Body>
            <Text style={styles.small}>{`아직 확인하지 않았으면 마감 ${POLICY_DEFAULTS.APPOINTMENT_CONFIRM_REMINDER_HOURS}시간 전에 한 번만 다시 알려 드려요.`}</Text>
          </Card>
        </View>
      ) : null}

      {mode === 'CONFIRMED' || mode === 'MEETING' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700' }}>도착 기록</Text>
          <StatusRow label="내 도착" done={!!a.arrival.mine} doneText={a.arrival.mine ? `${timeOf(a.arrival.mine)} 도착` : ''} waitText="아직이에요" />
          <StatusRow c={a.counterpart} label={nick} done={!!a.arrival.theirs} doneText={a.arrival.theirs ? `${timeOf(a.arrival.theirs)} 도착` : ''} waitText="도착 기록 없음" />
          {mode === 'CONFIRMED' && !a.actions.arrive ? (
            <Text style={[styles.small, keepWords]}>{`약속 ${POLICY_DEFAULTS.APPOINTMENT_ARRIVAL_OPEN_MINUTES}분 전부터 '도착했어요'를 누를 수 있어요.`}</Text>
          ) : null}
          {a.actions.reportNoShow ? (
            <Note>{`약속 시간에서 ${POLICY_DEFAULTS.APPOINTMENT_NO_SHOW_WAIT_MINUTES}분이 지났어요. '안 나왔어요'를 눌러도 바로 반영되지 않아요. 양쪽 도착 기록을 함께 보고 판단해요. 위험하다고 느끼면 112에 연락하세요.`}</Note>
          ) : null}
        </View>
      ) : null}

      {mode === 'RESCHEDULE' && a.reschedule ? (
        <View style={{ gap: 8 }}>
          {a.reschedule.newSchedule ? (
            <Card>
              <Text style={{ fontSize: 13, fontWeight: '700' }}>바뀐 일정</Text>
              <Row label="원래" text={`${dateText(a.day.date)} ${timeOf(a.startsAt)}–${timeOf(a.endsAt)}`} />
              <Row label="바뀐 뒤" text={`${dateText(a.reschedule.newSchedule.date)} ${a.reschedule.newSchedule.startTime}–${a.reschedule.newSchedule.endTime}`} />
            </Card>
          ) : null}
          <StatusRow label="내 확인" done={a.reschedule.mine} doneText="갈게요" waitText="기다리는 중" />
          <StatusRow c={a.counterpart} label={nick} done={a.reschedule.theirs} doneText="갈게요" waitText="아직이에요" />
          <Note>{`${formatSeoulShort(a.reschedule.deadline)}까지 정하지 못하면 보류돼요. 보류는 취소가 아니고 신뢰 단계에 영향이 없어요.`}</Note>
        </View>
      ) : null}

      {a.actions.cancel ? (
        <Note>{`${formatSeoulShort(a.freeCancelUntil)}까지 취소하면 신뢰 단계에 영향이 없어요. 그 뒤의 취소나 무응답은 반영돼요.`}</Note>
      ) : null}
      {!closed ? <Body>연락처는 공개되지 않아요. 약속에 대한 대화는 앱 안 채팅으로 해요.</Body> : null}
      <ErrorText message={error} />
    </Page>
  );
}

/** 약속 취소 (시안: ConfirmCancel. '시간만 바꾸기'는 정리 문서 상태표에 없어서 이번에는 만들지 않았습니다) */
export function CancelAppointmentScreen(props: { appointment: AppointmentView; onBack: () => void; onDone: (a: AppointmentView) => void }) {
  const a = props.appointment;
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const late = new Date() >= new Date(a.freeCancelUntil);

  async function cancel() {
    setError(null);
    setBusy(true);
    try {
      props.onDone(await api.cancelAppointment(a.id, reason ?? undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      footer={
        <>
          <PrimaryButton dark label="약속 취소하기" loading={busy} onPress={cancel} />
          <TextButton label="돌아가기" onPress={props.onBack} />
        </>
      }
    >
      <TopBar label="약속 취소" onBack={props.onBack} />
      <Title>{'무슨 일이\n생겼어요?'}</Title>
      <Body>{`사유는 ${a.counterpart.nickname}님께 간단히 전달돼요. 고르지 않아도 돼요.`}</Body>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700' }}>사유 (선택)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CANCEL_REASON_CODES.map((code) => (
            <Pill key={code} label={CANCEL_REASONS[code]} selected={reason === code} onPress={() => setReason(reason === code ? null : code)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 6, padding: 14, borderRadius: 12, backgroundColor: late ? colors.warnBg : colors.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>신뢰 단계에 미치는 영향</Text>
        <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>
          {late
            ? `약속 ${POLICY_DEFAULTS.APPOINTMENT_FREE_CANCEL_HOURS}시간 안이라 지금 취소하면 '임박 취소'로 기록돼요.`
            : `${formatSeoulShort(a.freeCancelUntil)}까지는 취소해도 영향이 없어요. 지금 취소하면 괜찮아요.`}
        </Text>
      </View>
      <ErrorText message={error} />
    </Page>
  );
}

// ───────────────────────── 알림함 ─────────────────────────

export function NotificationsScreen(props: {
  onBack: () => void;
  onAppointment: (id: string) => void;
  onProposals: () => void;
}) {
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listNotifications()
      .then((r) => {
        setItems(r.items);
        // 열어 본 알림은 읽음으로 (빨간 점은 화면에서 한 번 더 보여 준 뒤 사라집니다)
        return api.markNotificationsRead();
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Page>
      <TopBar label="알림" onBack={props.onBack} />
      <Title>{'꼭 필요한 알림만\n보내 드려요'}</Title>
      <Body>약속과 관련된 알림은 같은 일로 여러 번 보내지 않아요.</Body>
      {items === null && !error ? <Body>불러오는 중이에요…</Body> : null}
      {items?.length === 0 ? <Body>아직 알림이 없어요.</Body> : null}
      <View style={{ gap: 8 }}>
        {items?.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => (n.appointmentId ? props.onAppointment(n.appointmentId) : props.onProposals())}
            accessibilityRole="button"
            style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.white, borderWidth: n.read ? 1.5 : 2, borderColor: n.read ? colors.border : colors.ink }}
          >
            <View style={{ width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: n.read ? 'transparent' : colors.primary }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[{ fontSize: 14, fontWeight: '900', color: colors.ink }, keepWords]}>{n.title}</Text>
              <Text style={[{ fontSize: 13, lineHeight: 19, color: colors.body }, keepWords]}>{n.body}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{formatSeoulShort(n.createdAt)}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <ErrorText message={error} />
    </Page>
  );
}
