/**
 * 내 제안(받은/보낸) · 제안 보내기 (시안: Detail의 '처음엔 짧게 시작해요')
 * 홈과 약속 화면은 AppointmentScreens.tsx에 있습니다.
 */
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
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
import { Body, ChoiceRow, ErrorText, keepWords, Page, Pill, PrimaryButton, styles, TextButton, Title, TopBar } from '../ui';

export const dateText = (iso: string) => {
  const { month, day, weekday } = describeEventDate(iso);
  return `${month}.${day} (${weekday})`;
};

export function Avatar({ c, size = 40 }: { c: Counterpart; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.avatarColor, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '900', color: colors.lime }}>{c.avatarInitial}</Text>
    </View>
  );
}

export const Row = ({ label, text }: { label: string; text: string }) => (
  <View style={{ flexDirection: 'row', gap: 12 }}>
    <Text style={{ width: 56, fontSize: 12, fontWeight: '700', color: colors.muted }}>{label}</Text>
    <Text style={[{ flex: 1, fontSize: 14, color: colors.ink }, keepWords]}>{text}</Text>
  </View>
);

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
