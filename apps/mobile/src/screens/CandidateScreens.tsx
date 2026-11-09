/**
 * 후보 목록 · 후보 없음 · 후보 상세 · 후보 알림 신청
 * (시안: Candidates, NoCandidates, Detail, NoCandAlert)
 */
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import {
  ATTENDANCE_GRADE_LABELS,
  type AttendanceGrade,
  describeEventDate,
  formatMinutes,
  type CandidateCard,
  type CandidateDetail,
  type CandidatesResponse,
  type EventDetail,
  type MatchOptions,
  type ProposalView,
} from '@meets/shared';
import { api } from '../api';
import { colors } from '../theme';
import { Body, Card, ErrorText, keepWords, Page, Pill, PrimaryButton, styles, TextButton, Title, TopBar } from '../ui';
import { EventStrip } from './InputFlowScreens';
import { ProposalComposer } from './ProposalScreens';

const shortDate = (iso: string) => {
  const { month, day, weekday } = describeEventDate(iso);
  return `${month}.${day} ${weekday}`;
};

function Avatar({ initial, color, size = 40 }: { initial: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '900', color: colors.lime }}>{initial}</Text>
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: 'lime' | 'line' | 'warn' | 'dark' }) {
  const bg = { lime: colors.lime, line: colors.white, warn: colors.warnBg, dark: colors.ink }[tone];
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: bg,
        color: tone === 'dark' ? colors.lime : colors.ink,
        borderWidth: tone === 'line' ? 1.5 : 0,
        borderColor: colors.ink,
      }}
    >
      {label}
    </Text>
  );
}

function badges(c: CandidateCard, multiDay: boolean) {
  const list: Array<{ label: string; tone: 'lime' | 'line' | 'warn' | 'dark' }> = [
    { label: c.tempoGap === 0 ? '템포 일치' : `템포 ${c.tempoGap}단계 차이`, tone: c.tempoGap === 0 ? 'lime' : 'line' },
    {
      label: c.immersionGap === 0 ? '몰입도 일치' : `몰입도 ${c.immersionGap}단계 차이`,
      tone: c.immersionGap === 0 ? 'lime' : c.shortStart ? 'warn' : 'line',
    },
  ];
  if (multiDay) list.push({ label: `${c.overlaps.map((o) => shortDate(o.date).split(' ')[0]).join(' · ')} 겹침`, tone: 'line' });
  if (c.sameFan) list.push({ label: '같은 팬', tone: 'dark' });
  if (c.trusted) list.push({ label: '쌓인 신뢰', tone: 'dark' });
  return list;
}

function GradeBadge({ grade }: { grade: AttendanceGrade | null }) {
  if (!grade) return <Text style={styles.small}>티켓 인증 전</Text>;
  return grade === 'VERIFIED' ? (
    <Badge label={`✓ ${ATTENDANCE_GRADE_LABELS.VERIFIED}`} tone="lime" />
  ) : (
    <Badge label={ATTENDANCE_GRADE_LABELS.PLANNED} tone="line" />
  );
}

function CandidateCardView({ c, multiDay, onPress, highlight }: { c: CandidateCard; multiDay: boolean; onPress: () => void; highlight: boolean }) {
  const best = [...c.overlaps].sort((a, b) => b.minutes - a.minutes)[0];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${c.nickname} 후보 자세히 보기`}
      style={{ gap: 10, padding: 14, borderRadius: 16, borderWidth: highlight ? 2 : 1.5, borderColor: highlight ? colors.ink : colors.border, backgroundColor: colors.white }}
    >
      <View style={[styles.row, { gap: 10 }]}>
        <Avatar initial={c.avatarInitial} color={c.avatarColor} />
        <View style={{ flex: 1, gap: 4, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{c.nickname}</Text>
          <GradeBadge grade={c.grade} />
          {c.reunion ? <Badge label="서로 또 같이 가고 싶어 했어요" tone="lime" /> : null}
        </View>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>자세히 ›</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {badges(c, multiDay).map((b) => (
          <Badge key={b.label} {...b} />
        ))}
      </View>
      {best ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, color: colors.body }}>{`겹치는 시간 ${formatMinutes(best.minutes)}${multiDay ? ` (${shortDate(best.date)})` : ''}`}</Text>
            <Text style={{ fontSize: 12, color: colors.body }}>{`${best.from}–${best.to}`}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, Math.round((best.minutes / 480) * 100))}%`, height: 8, backgroundColor: colors.primary }} />
          </View>
        </View>
      ) : null}
      <Text style={[{ fontSize: 13, lineHeight: 20, color: colors.ink }, keepWords]}>{c.summary}</Text>
    </Pressable>
  );
}

export function CandidatesScreen(props: {
  event: EventDetail;
  chosenDayIds: string[];
  myGrade: AttendanceGrade | null;
  ticketPending: boolean;
  onVerify: () => void;
  onBack: () => void;
  onOpen: (c: CandidateCard) => void;
  onOtherDay: () => void;
  onWait: () => void;
}) {
  const { event } = props;
  const chosenDays = event.days.filter((d) => props.chosenDayIds.includes(d.id));
  const multiDay = chosenDays.length > 1;
  const [options, setOptions] = useState<MatchOptions>({ sort: 'RECOMMENDED' });
  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    api.getCandidates(event.id, options).then(
      (r) => !cancelled && (setData(r), setError(null)),
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [event.id, options]);

  const widened = options.shortTime || options.immersionPlus;

  if (data && data.total === 0) {
    return (
      <NoCandidatesView
        event={event}
        dates={chosenDays.map((d) => d.date)}
        data={data}
        widened={!!widened}
        onBack={props.onBack}
        onApply={(o) => setOptions({ ...options, ...o })}
        onReset={() => setOptions({ sort: options.sort })}
        onOtherDay={props.onOtherDay}
        onWait={props.onWait}
      />
    );
  }

  return (
    <Page>
      <TopBar label="내 조건에 맞는 후보" onBack={props.onBack} />
      <Title>{data ? `함께할 후보 ${data.total}명` : '후보를 찾는 중이에요…'}</Title>
      <EventStrip event={event} dates={chosenDays.map((d) => d.date)} />
      <VerifyBanner grade={props.myGrade} pending={props.ticketPending} onVerify={props.onVerify} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pill label="추천순" selected={options.sort !== 'OVERLAP'} onPress={() => setOptions({ ...options, sort: 'RECOMMENDED' })} />
        <Pill label="겹치는 시간순" selected={options.sort === 'OVERLAP'} onPress={() => setOptions({ ...options, sort: 'OVERLAP' })} />
      </View>
      {multiDay ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pill label="모든 날" selected={!options.dayId} onPress={() => setOptions({ ...options, dayId: undefined })} />
          {chosenDays.map((d) => (
            <Pill key={d.id} label={shortDate(d.date)} selected={options.dayId === d.id} onPress={() => setOptions({ ...options, dayId: d.id })} />
          ))}
        </View>
      ) : null}

      {widened ? (
        <Pressable onPress={() => setOptions({ sort: options.sort, dayId: options.dayId })} accessibilityRole="button">
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>조건을 넓혀서 보는 중이에요 · 원래 조건으로 보기 ›</Text>
        </Pressable>
      ) : null}
      {data?.immersionRelaxed && !widened ? (
        <Text style={[styles.small, keepWords]}>후보가 많지 않아서 스타일 차이가 조금 있는 분도 함께 보여 드려요.</Text>
      ) : null}

      <View style={{ gap: 12 }}>
        {data?.candidates.map((c, i) => (
          <CandidateCardView key={c.userId} c={c} multiDay={multiDay} highlight={i === 0} onPress={() => props.onOpen(c)} />
        ))}
      </View>
      <ErrorText message={error} />
      <TextButton label="일정·스타일 다시 고르기" onPress={props.onBack} />
    </Page>
  );
}

/** 내 인증 상태 안내 띠 */
function VerifyBanner({ grade, pending, onVerify }: { grade: AttendanceGrade | null; pending: boolean; onVerify: () => void }) {
  if (grade === 'VERIFIED') return null;
  const text = pending
    ? '티켓 인증을 확인하고 있어요. 끝나면 제안을 보낼 수 있어요.'
    : grade === 'PLANNED'
      ? "'참석 예정'으로 보이고 있어요. 예약 확인 화면으로 인증하면 먼저 보여요."
      : '티켓 인증을 하면 제안을 보낼 수 있고, 후보 목록에서도 먼저 보여요.';
  return (
    <View style={{ gap: 6, padding: 12, borderRadius: 12, backgroundColor: colors.warnBg }}>
      <Text style={[{ fontSize: 13, lineHeight: 19, color: colors.ink }, keepWords]}>{text}</Text>
      {!pending ? (
        <Pressable onPress={onVerify} accessibilityRole="button" style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>티켓 인증하기 ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function NoCandidatesView(props: {
  event: EventDetail;
  dates: string[];
  data: CandidatesResponse;
  widened: boolean;
  onBack: () => void;
  onApply: (o: MatchOptions) => void;
  onReset: () => void;
  onOtherDay: () => void;
  onWait: () => void;
}) {
  const w = props.data.widen;
  const option = (title: string, sub: string, count: number | null, onPress: () => void) => (
    <Pressable
      key={title}
      onPress={onPress}
      disabled={count === 0}
      accessibilityRole="button"
      accessibilityState={{ disabled: count === 0 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, opacity: count === 0 ? 0.5 : 1 }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{title}</Text>
        <Text style={[styles.small, keepWords]}>{sub}</Text>
      </View>
      <Text style={{ fontSize: 16, color: colors.ink }}>›</Text>
    </Pressable>
  );

  return (
    <Page footer={<PrimaryButton label="후보가 생기면 알려 주세요" onPress={props.onWait} />}>
      <TopBar label="내 조건에 맞는 후보" onBack={props.onBack} />
      <EventStrip event={props.event} dates={props.dates} />
      <Title>{'지금은 맞는 후보가\n아직 없어요'}</Title>
      <Body>아직 이 행사에 등록한 사람이 적거나 조건이 꽤 구체적이에요. 조건을 조금 넓히면 후보가 보일 수 있어요.</Body>

      {w ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>이렇게 넓혀 볼 수 있어요</Text>
          {option('함께할 시간을 줄이기', `짧게 겹치는 사람도 보기 · 후보 ${w.shortTime}명 예상`, w.shortTime, () => props.onApply({ shortTime: true }))}
          {option(
            '몰입도 차이 한 단계 더 허용',
            `'짧은 구간부터' 안내와 함께 보여드려요 · 후보 ${w.immersionPlus}명 예상`,
            w.immersionPlus,
            () => props.onApply({ immersionPlus: true }),
          )}
          {w.otherDays.map((d) =>
            option('다른 날짜 보기', `${shortDate(d.date)}에 등록한 사람이 ${d.people}명 있어요`, d.people, props.onOtherDay),
          )}
        </View>
      ) : null}
      {props.widened ? <TextButton label="원래 조건으로 돌아가기" onPress={props.onReset} /> : null}

      <View style={{ padding: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted, backgroundColor: colors.white }}>
        <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>
          안전과 관련된 필수 조건(연령 범위, 공개된 장소에서만 만나기 등)은 넓힐 수 없어요.
        </Text>
      </View>
    </Page>
  );
}

export function CandidateDetailScreen(props: {
  event: EventDetail;
  candidate: CandidateCard;
  myGrade: AttendanceGrade | null;
  onVerify: () => void;
  onBack: () => void;
  onSent: (p: ProposalView) => void;
}) {
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getCandidate(props.event.id, props.candidate.userId).then(setDetail, (e: Error) => setError(e.message));
  }, [props.event.id, props.candidate.userId]);

  const c = detail ?? props.candidate;
  const row = (label: string, text: string) => (
    <View key={label} style={{ flexDirection: 'row', gap: 10 }}>
      <Text style={{ width: 76, fontSize: 13, fontWeight: '700', color: colors.primary }}>{label}</Text>
      <Text style={[{ flex: 1, fontSize: 13, lineHeight: 20, color: colors.ink }, keepWords]}>{text}</Text>
    </View>
  );

  return (
    <Page
      footer={
        props.myGrade ? undefined : (
          <>
            <PrimaryButton label="티켓 인증하고 제안하기" onPress={props.onVerify} />
            <Text style={[{ textAlign: 'center', fontSize: 12, color: colors.muted }, keepWords]}>
              제안은 같은 행사 티켓 인증을 마친 뒤 보낼 수 있어요.
            </Text>
          </>
        )
      }
    >
      <TopBar label="후보 상세" onBack={props.onBack} />
      <View style={[styles.row, { gap: 14 }]}>
        <Avatar initial={c.avatarInitial} color={c.avatarColor} size={56} />
        <View style={{ gap: 4, flex: 1, alignItems: 'flex-start' }}>
          <Title>{c.nickname}</Title>
          <GradeBadge grade={c.grade} />
          {c.reunion ? <Badge label="서로 또 같이 가고 싶어 했어요" tone="lime" /> : null}
          {c.trusted ? <Badge label="쌓인 신뢰" tone="dark" /> : null}
          {c.sameFan ? <Badge label={detail?.publicFandoms.length ? `같은 팬 · ${detail.publicFandoms.join(', ')}` : '같은 팬'} tone="dark" /> : null}
        </View>
      </View>

      {detail ? (
        <Card>
          <Text style={{ fontSize: 14, fontWeight: '700' }}>왜 잘 맞나요?</Text>
          {row('템포', detail.reasons.tempo)}
          {row('몰입도', detail.reasons.immersion)}
          {row('겹치는 시간', detail.reasons.time)}
          {row('약속', detail.reasons.promises)}
        </Card>
      ) : null}

      {c.overlaps.length > 1 ? (
        <Card>
          <Text style={{ fontSize: 14, fontWeight: '700' }}>{`${c.nickname}님과 겹치는 날`}</Text>
          {c.overlaps.map((o) => (
            <Body key={o.eventDayId}>{`${shortDate(o.date)} · ${o.from}–${o.to} (${formatMinutes(o.minutes)})`}</Body>
          ))}
        </Card>
      ) : null}
      {!detail && !error ? <Body>불러오는 중이에요…</Body> : null}
      {detail && props.myGrade ? (
        <ProposalComposer event={props.event} candidate={detail} myGrade={props.myGrade} onSent={props.onSent} />
      ) : null}
      <ErrorText message={error} />
    </Page>
  );
}

export function WaitScreen(props: { event: EventDetail; dates: string[]; onBack: () => void; onDone: () => void }) {
  const [includePlus, setIncludePlus] = useState(false);
  const [done, setDone] = useState<{ endsOn: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      setDone(await api.registerWait(props.event.id, includePlus));
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    const { month, day } = describeEventDate(done.endsOn);
    return (
      <Page footer={<PrimaryButton label="다른 행사 둘러보기" onPress={props.onDone} />}>
        <TopBar label="후보 알림" />
        <Title>알림을 신청했어요</Title>
        <Body>{`후보가 생기면 하루 한 번 모아서 알려 드려요. 알림은 ${month}월 ${day}일까지 보내고, 그 뒤에는 자동으로 끝나요.`}</Body>
      </Page>
    );
  }

  return (
    <Page
      footer={
        <>
          <PrimaryButton label="알림 신청하기" onPress={submit} loading={loading} />
          <TextButton label="조건을 먼저 넓혀 볼게요" onPress={props.onBack} />
        </>
      }
    >
      <TopBar label="후보 알림" onBack={props.onBack} />
      <Title>{'후보가 생기면\n알려 드릴게요'}</Title>
      <Body>지금 조건 그대로 기다려요. 알림은 후보가 생겼을 때만 보내요.</Body>
      <View style={{ gap: 10, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>알림을 받을 조건</Text>
        <Body>{`행사 · ${props.event.name}`}</Body>
        <Body>{`날짜 · ${props.dates.map(shortDate).join(', ')}`}</Body>
        <Body>스타일 · 내가 고른 템포·몰입도 그대로</Body>
      </View>
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '700' }}>몰입도 한 단계 차이도 알려 주기</Text>
            <Text style={styles.small}>후보가 더 빨리 생겨요</Text>
          </View>
          <Switch value={includePlus} onValueChange={setIncludePlus} accessibilityLabel="몰입도 한 단계 차이도 알려 주기" />
        </View>
        <Text style={[styles.small, keepWords]}>알림은 하루 한 번 모아서 보내고, 방해 금지 시간은 지켜요. 행사 직전에는 자동으로 끝나요.</Text>
      </Card>
      <ErrorText message={error} />
    </Page>
  );
}
