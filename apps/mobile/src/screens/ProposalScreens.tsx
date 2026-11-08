/**
 * 홈 · 내 제안(받은/보낸) · 약속(확정 대기) · 제안 보내기
 * (시안: Home, Detail의 '처음엔 짧게 시작해요', ConfirmWait)
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  APPOINTMENT_STATUS_LABELS,
  describeEventDate,
  describeRemaining,
  POLICY_DEFAULTS,
  PROPOSAL_STATUS_LABELS,
  type AppointmentView,
  type AttendanceGrade,
  type CandidateCard,
  type Counterpart,
  type EventDetail,
  type ProposalView,
} from '@meets/shared';
import { api } from '../api';
import { colors } from '../theme';
import { Body, Card, ChoiceRow, ErrorText, keepWords, Page, Pill, PrimaryButton, styles, TextButton, Title, TopBar } from '../ui';

const dateText = (iso: string) => {
  const { month, day, weekday } = describeEventDate(iso);
  return `${month}.${day} (${weekday})`;
};

function Avatar({ c, size = 40 }: { c: Counterpart; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.avatarColor, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '900', color: colors.lime }}>{c.avatarInitial}</Text>
    </View>
  );
}

const Row = ({ label, text }: { label: string; text: string }) => (
  <View style={{ flexDirection: 'row', gap: 12 }}>
    <Text style={{ width: 56, fontSize: 12, fontWeight: '700', color: colors.muted }}>{label}</Text>
    <Text style={[{ flex: 1, fontSize: 14, color: colors.ink }, keepWords]}>{text}</Text>
  </View>
);

/** 가입을 마친 사람의 첫 화면 */
export function HomeScreen(props: {
  nickname: string;
  onFindEvents: () => void;
  onProposals: () => void;
  onAppointment: (a: AppointmentView) => void;
}) {
  const [proposals, setProposals] = useState<ProposalView[] | null>(null);
  const [appointments, setAppointments] = useState<AppointmentView[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listProposals(), api.listAppointments()]).then(
      ([p, a]) => {
        setProposals(p);
        setAppointments(a);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  const received = proposals?.filter((p) => p.direction === 'RECEIVED' && p.status === 'SENT') ?? [];
  const sent = proposals?.filter((p) => p.direction === 'SENT' && p.status === 'SENT') ?? [];
  const upcoming = appointments.filter((a) => a.status === 'PENDING_CONFIRM' || a.status === 'CONFIRMED');
  const soonest = received.map((p) => p.expiresAt).sort()[0];

  return (
    <Page footer={<PrimaryButton label="같이 갈 행사 찾기" onPress={props.onFindEvents} />}>
      <Text style={{ fontSize: 13, color: colors.muted, paddingTop: 8 }}>오늘도 즐거운 행사 되세요</Text>
      <Title>{`안녕하세요, ${props.nickname}님`}</Title>

      {upcoming.map((a) => (
        <Pressable
          key={a.id}
          onPress={() => props.onAppointment(a)}
          accessibilityRole="button"
          style={{ gap: 8, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>다가오는 약속</Text>
            <Text style={{ fontSize: 12, fontWeight: '900', color: colors.primary }}>{APPOINTMENT_STATUS_LABELS[a.status]}</Text>
          </View>
          <Text style={[{ fontSize: 16, fontWeight: '900', color: colors.ink }, keepWords]}>{a.event.name}</Text>
          <Text style={[{ fontSize: 13, color: colors.body }, keepWords]}>
            {`${dateText(a.day.date)} ${a.segments[0]?.startTime ?? a.day.startTime} · ${a.segments.map((s) => s.label).join(', ') || '행사 시간'} · ${a.counterpart.nickname}님`}
          </Text>
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
        <Text style={{ fontSize: 16, color: colors.ink }}>›</Text>
      </Pressable>
      <ErrorText message={error} />
    </Page>
  );
}

/** 받은 제안 · 보낸 제안 */
export function ProposalsScreen(props: { onBack: () => void; onAccepted: (a: AppointmentView) => void }) {
  const [tab, setTab] = useState<'RECEIVED' | 'SENT'>('RECEIVED');
  const [list, setList] = useState<ProposalView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listProposals().then(setList, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(id);
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  }

  const shown = (list ?? []).filter((p) => p.direction === tab);
  return (
    <Page>
      <TopBar label="내 제안" onBack={props.onBack} />
      <Title>내 제안</Title>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pill label={`받은 제안 ${(list ?? []).filter((p) => p.direction === 'RECEIVED' && p.status === 'SENT').length}`} selected={tab === 'RECEIVED'} onPress={() => setTab('RECEIVED')} />
        <Pill label="보낸 제안" selected={tab === 'SENT'} onPress={() => setTab('SENT')} />
      </View>
      {list && shown.length === 0 ? <Body>{tab === 'RECEIVED' ? '아직 받은 제안이 없어요.' : '아직 보낸 제안이 없어요.'}</Body> : null}
      {shown.map((p) => (
        <View key={p.id} style={{ gap: 10, padding: 14, borderRadius: 16, borderWidth: p.status === 'SENT' ? 2 : 1.5, borderColor: p.status === 'SENT' ? colors.ink : colors.border, backgroundColor: colors.white }}>
          <View style={[styles.row, { gap: 10 }]}>
            <Avatar c={p.counterpart} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{p.counterpart.nickname}</Text>
              <Text style={{ fontSize: 12, color: p.status === 'SENT' ? colors.primary : colors.muted, fontWeight: '700' }}>
                {p.status === 'SENT' ? `${PROPOSAL_STATUS_LABELS.SENT} · ${describeRemaining(p.expiresAt, new Date())}` : PROPOSAL_STATUS_LABELS[p.status]}
              </Text>
            </View>
          </View>
          <Row label="행사" text={p.event.name} />
          <Row label="날짜" text={dateText(p.day.date)} />
          <Row label="구간" text={p.segments.map((s) => `${s.label} ${s.startTime}–${s.endTime}`).join(', ') || '행사 시간 중'} />
          <Row label="장소" text={p.meetingSpot.name} />
          {p.status === 'SENT' && p.direction === 'RECEIVED' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="수락하기"
                  loading={busy === p.id}
                  onPress={() =>
                    act(p.id, async () => {
                      props.onAccepted(await api.acceptProposal(p.id));
                    })
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton dark label="거절하기" disabled={busy === p.id} onPress={() => act(p.id, () => api.rejectProposal(p.id))} />
              </View>
            </View>
          ) : null}
          {p.status === 'SENT' && p.direction === 'SENT' ? (
            <TextButton label="제안 취소하기" onPress={() => act(p.id, () => api.cancelProposal(p.id))} />
          ) : null}
        </View>
      ))}
      <Text style={[styles.small, keepWords]}>{`답하지 않은 제안은 ${POLICY_DEFAULTS.PROPOSAL_EXPIRE_HOURS}시간 뒤(행사가 가까우면 더 일찍) 만료돼요. 연락처는 수락 뒤에도 공개되지 않아요.`}</Text>
      <ErrorText message={error} />
    </Page>
  );
}

/** 수락 뒤 약속 (확정 대기) */
export function AppointmentScreen(props: { appointment: AppointmentView; justAccepted?: boolean; onBack: () => void }) {
  const a = props.appointment;
  return (
    <Page footer={<PrimaryButton label="확인했어요" onPress={props.onBack} />}>
      <TopBar label="내 약속" onBack={props.onBack} />
      <View style={[styles.row, { padding: 14, borderRadius: 14, backgroundColor: colors.lime }]}>
        <Avatar c={a.counterpart} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>
            {props.justAccepted ? '약속이 만들어졌어요' : `${a.counterpart.nickname}님과의 약속`}
          </Text>
          <Text style={[{ fontSize: 12, color: colors.ink }, keepWords]}>아직 확정은 아니에요. 전날 한 번 더 확인해요.</Text>
        </View>
      </View>
      <View style={{ gap: 10, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white }}>
        <Row label="행사" text={a.event.name} />
        <Row label="날짜" text={`${dateText(a.day.date)} ${a.segments[0]?.startTime ?? a.day.startTime}`} />
        <Row label="구간" text={a.segments.map((s) => `${s.label} ${s.startTime}–${s.endTime}`).join(', ') || '행사 시간 중'} />
        <Row label="장소" text={a.meetingSpot.name} />
        <Row label="상대" text={`${a.counterpart.nickname}님`} />
        <Row label="상태" text={APPOINTMENT_STATUS_LABELS[a.status]} />
      </View>
      <Card>
        <Text style={{ fontSize: 13, fontWeight: '700' }}>앞으로 이렇게 진행돼요</Text>
        <Body>{'① 수락됨 — 지금 여기예요\n② 전날 확정 — 둘 다 ‘갈 수 있어요’를 누르면 확정돼요\n③ 당일 만남'}</Body>
        <Text style={[styles.small, keepWords]}>전날 확인과 알림, 채팅은 다음 단계에서 열려요.</Text>
      </Card>
      <Body>연락처는 공개되지 않아요. 약속에 대한 대화는 앱 안 채팅으로 하게 돼요.</Body>
    </Page>
  );
}

/** 후보 상세의 제안 보내기: 날짜 → 구간(처음엔 짧게) → 만날 장소 */
export function ProposalComposer(props: {
  event: EventDetail;
  candidate: CandidateCard;
  myGrade: AttendanceGrade;
  onSent: (p: ProposalView) => void;
}) {
  const { event, candidate } = props;
  const days = candidate.overlaps;
  const [dayId, setDayId] = useState(days[0]?.eventDayId ?? '');
  const overlap = days.find((d) => d.eventDayId === dayId);
  const day = event.days.find((d) => d.id === dayId);
  const segs = day?.segments.filter((s) => overlap?.segmentIds.includes(s.id)) ?? [];
  // 처음엔 짧게: 첫 구간 하나만 골라 둡니다.
  const [chosen, setChosen] = useState<string[]>(segs[0] ? [segs[0].id] : []);
  const [spotId, setSpotId] = useState(event.meetingSpots[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const max = props.myGrade === 'PLANNED' ? POLICY_DEFAULTS.PROPOSAL_PLANNED_MAX_SEGMENTS : Infinity;

  function pickDay(id: string) {
    setDayId(id);
    const ov = days.find((d) => d.eventDayId === id);
    const first = event.days.find((d) => d.id === id)?.segments.find((s) => ov?.segmentIds.includes(s.id));
    setChosen(first ? [first.id] : []);
  }

  function toggle(id: string) {
    setError(null);
    if (chosen.includes(id)) setChosen(chosen.filter((x) => x !== id));
    else if (chosen.length >= max) setError(`'참석 예정'일 때는 구간을 ${max}개까지 제안할 수 있어요.`);
    else setChosen([...chosen, id]);
  }

  async function send() {
    setError(null);
    setBusy(true);
    try {
      props.onSent(await api.sendProposal(event.id, { receiverId: candidate.userId, eventDayId: dayId, segmentIds: chosen, meetingSpotId: spotId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  const ready = !!dayId && !!spotId && (segs.length === 0 || chosen.length > 0);
  return (
    <View style={{ gap: 14 }}>
      {days.length > 1 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700' }}>어느 날 만날까요?</Text>
          <Text style={styles.small}>{`${candidate.nickname}님과 겹치는 날만 보여요. 날마다 따로 약속해요.`}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {days.map((d) => (
              <Pill key={d.eventDayId} label={dateText(d.date)} selected={d.eventDayId === dayId} onPress={() => pickDay(d.eventDayId)} />
            ))}
          </View>
        </View>
      ) : null}
      {segs.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700' }}>처음엔 짧게 시작해요</Text>
          <Text style={styles.small}>제안할 구간을 골라 주세요. 만나 보고 더 늘려도 돼요.</Text>
          {segs.map((s) => (
            <ChoiceRow key={s.id} multi label={`${s.label} · ${s.startTime}–${s.endTime}`} selected={chosen.includes(s.id)} onPress={() => toggle(s.id)} />
          ))}
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '700' }}>어디서 만날까요?</Text>
        <Text style={styles.small}>운영팀이 정한 공개된 장소 중에서 골라요.</Text>
        {event.meetingSpots.map((m) => (
          <ChoiceRow key={m.id} label={m.name} selected={m.id === spotId} onPress={() => setSpotId(m.id)} />
        ))}
      </View>
      <PrimaryButton label="이 구간으로 제안 보내기" onPress={send} disabled={!ready} loading={busy} />
      <Text style={[{ textAlign: 'center', fontSize: 12, color: colors.muted }, keepWords]}>제안은 상대가 수락하기 전까지 연락처가 공개되지 않아요.</Text>
      <ErrorText message={error} />
    </View>
  );
}

/** 제안을 보낸 뒤 */
export function ProposalSentScreen(props: { proposal: ProposalView; onDone: () => void; onHome: () => void }) {
  const p = props.proposal;
  return (
    <Page
      footer={
        <>
          <PrimaryButton label="후보 더 보기" onPress={props.onDone} />
          <TextButton label="홈으로" onPress={props.onHome} />
        </>
      }
    >
      <TopBar label="제안" />
      <Title>제안을 보냈어요</Title>
      <Body>{`${p.counterpart.nickname}님이 수락하면 약속이 만들어져요. ${describeRemaining(p.expiresAt, new Date())} 안에 답이 없으면 자동으로 만료돼요.`}</Body>
      <View style={{ gap: 10, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white }}>
        <Row label="행사" text={p.event.name} />
        <Row label="날짜" text={dateText(p.day.date)} />
        <Row label="구간" text={p.segments.map((s) => `${s.label} ${s.startTime}–${s.endTime}`).join(', ') || '행사 시간 중'} />
        <Row label="장소" text={p.meetingSpot.name} />
      </View>
    </Page>
  );
}
