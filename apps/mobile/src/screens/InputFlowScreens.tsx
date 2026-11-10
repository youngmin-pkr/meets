/**
 * 입력 흐름: 일정(2/5) → 템포(3/5) → 몰입도(4/5) → 필수 조건(5/5)
 * (1/5는 행사 선택)
 */
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  describeEventDate,
  describeEventDateRange,
  immersionQuestions,
  MUST_AGE_LABELS,
  MUST_GENDER_LABELS,
  PROMISE_CODES,
  PROMISE_LABELS,
  TEMPO_QUESTIONS,
  type AnswerValue,
  type ChoiceQuestion,
  type EventCategory,
  type EventDetail,
  type MustAge,
  type MustGender,
} from '@meets/shared';
import {
  answersReady,
  scheduleReady,
  setSegment,
  toggleDay,
  togglePromise,
  updateDay,
  type PreferenceDraft,
} from '../preferenceDraft';
import { colors } from '../theme';
import { Body, ChoiceRow, ErrorText, keepWords, Page, Pill, PrimaryButton, StepHeader, styles, TimeField, Title } from '../ui';

const TOTAL = 4;

/** 화면 위의 행사 띠 (날짜 + 이름) */
export function EventStrip({ event, dates }: { event: EventDetail; dates?: string[] }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.ink }}>
      <Text style={{ fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.lime, color: colors.ink }}>
        {describeEventDateRange(dates ?? event.days.map((d) => d.date))}
      </Text>
      <Text style={[{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.white }, keepWords]} numberOfLines={2}>
        {event.name}
      </Text>
    </View>
  );
}

export function ScheduleScreen(props: {
  event: EventDetail;
  days: EventDetail['days'];
  draft: PreferenceDraft;
  onChange: (d: PreferenceDraft) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { event, days, draft } = props;
  const chosen = days.filter((d) => draft.days[d.id]);
  const [activeId, setActiveId] = useState<string | null>(chosen[0]?.id ?? null);
  const active = days.find((d) => d.id === activeId && draft.days[d.id]) ?? chosen[0] ?? null;
  const plan = active ? draft.days[active.id] : null;
  const multi = days.length > 1;

  return (
    <Page footer={<PrimaryButton label="다음" onPress={props.onNext} disabled={!scheduleReady(draft, event)} />}>
      <StepHeader step={1} total={TOTAL} onBack={props.onBack} />
      <Title>{'그날 일정을\n알려주세요'}</Title>
      <Body>같이할 구간만 골라도 돼요. 나머지는 혼자 즐기세요.</Body>
      <EventStrip event={event} dates={days.map((d) => d.date)} />

      {multi ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>가고 싶은 날을 골라 주세요</Text>
          <Text style={styles.small}>고른 날마다 따로 약속을 잡아요. 날짜를 누르면 그날 일정을 정할 수 있어요.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {days.map((d) => {
              const { month, day, weekday } = describeEventDate(d.date);
              const on = !!draft.days[d.id];
              return (
                <Pill
                  key={d.id}
                  label={`${month}.${day} ${weekday}${on ? ' ✓' : ''}`}
                  selected={on}
                  onPress={() => {
                    props.onChange(toggleDay(draft, d));
                    setActiveId(on ? null : d.id);
                  }}
                />
              );
            })}
          </View>
          {chosen.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {chosen.map((d) => {
                const { month, day } = describeEventDate(d.date);
                return <Pill key={d.id} label={`${month}.${day} 일정 보기`} selected={active?.id === d.id} onPress={() => setActiveId(d.id)} />;
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {active && plan ? (
        <>
          {multi ? (
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
              {(() => {
                const { month, day, weekday } = describeEventDate(active.date);
                return `${month}월 ${day}일 (${weekday}) 일정`;
              })()}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TimeField
              label="도착 가능 시간"
              value={plan.arriveTime}
              min={active.startTime}
              max={active.endTime}
              onChange={(v) => props.onChange(updateDay(draft, active.id, { arriveTime: v }))}
            />
            <TimeField
              label="귀가 마감 시간"
              value={plan.leaveTime}
              min={active.startTime}
              max="23:30"
              onChange={(v) => props.onChange(updateDay(draft, active.id, { leaveTime: v }))}
            />
          </View>

          {active.segments.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>구간별로 함께할지 골라 주세요</Text>
              {active.segments.map((s) => {
                const together = plan.togetherSegmentIds.includes(s.id);
                return (
                  <View
                    key={s.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white }}
                  >
                    <Text style={{ width: 52, fontSize: 14, fontWeight: '900', color: colors.primary }}>{s.startTime}</Text>
                    <Text style={[{ flex: 1, fontSize: 14, color: colors.ink }, keepWords]}>{`${s.label}\n${s.startTime}–${s.endTime}`}</Text>
                    <View style={{ flexDirection: 'row', borderRadius: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.ink }}>
                      {[true, false].map((v) => (
                        <Text
                          key={String(v)}
                          onPress={() => props.onChange(setSegment(draft, active.id, s.id, v))}
                          accessibilityRole="button"
                          accessibilityState={{ selected: together === v }}
                          style={{
                            minWidth: 56,
                            height: 44,
                            lineHeight: 44,
                            textAlign: 'center',
                            fontSize: 13,
                            fontWeight: together === v ? '700' : '500',
                            backgroundColor: together === v ? colors.ink : colors.white,
                            color: together === v ? colors.white : colors.ink,
                          }}
                        >
                          {v ? '같이' : '혼자'}
                        </Text>
                      ))}
                    </View>
                  </View>
                );
              })}
              {plan.togetherSegmentIds.length === 0 ? <ErrorText message="같이할 구간을 하나 이상 골라 주세요." /> : null}
            </View>
          ) : (
            <Body>이 날은 정해진 구간이 없어서, 도착부터 귀가 마감까지를 함께할 수 있는 시간으로 봐요.</Body>
          )}
          <Text style={styles.small}>함께할 구간은 상대를 만나기 전까지 언제든 바꿀 수 있어요.</Text>
        </>
      ) : (
        <Body>위에서 가고 싶은 날을 골라 주세요.</Body>
      )}
    </Page>
  );
}

/** 템포(3/5)·몰입도(4/5) 질문 화면 */
export function QuestionsScreen(props: {
  step: 2 | 3;
  tag: string;
  title: string;
  questions: ChoiceQuestion[];
  answers: Array<AnswerValue | null>;
  onChange: (answers: Array<AnswerValue | null>) => void;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <Page footer={<PrimaryButton label={props.nextLabel ?? '다음'} onPress={props.onNext} disabled={!answersReady(props.answers)} />}>
      <StepHeader step={props.step} total={TOTAL} onBack={props.onBack} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{props.tag}</Text>
      <Title>{props.title}</Title>
      {props.questions.map((q, i) => (
        <View key={q.id} style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>{q.label}</Text>
          <Text style={[{ fontSize: 16, fontWeight: '700', color: colors.ink }, keepWords]}>{q.title}</Text>
          {q.options.map((o) => (
            <ChoiceRow
              key={o.value}
              label={o.text}
              selected={props.answers[i] === o.value}
              onPress={() => props.onChange(props.answers.map((a, j) => (j === i ? o.value : a)))}
            />
          ))}
        </View>
      ))}
    </Page>
  );
}

export function TempoScreen(p: Omit<Parameters<typeof QuestionsScreen>[0], 'step' | 'tag' | 'title' | 'questions'>) {
  return <QuestionsScreen {...p} step={2} tag="스타일 ① 템포" title="나는 이렇게 움직여요" questions={TEMPO_QUESTIONS} />;
}

/** 몰입도: 행사 종류(공연 / 전시·팝업·박람회)에 맞는 질문만 보여 줍니다. */
export function ImmersionScreen({
  category,
  ...p
}: { category: EventCategory } & Omit<Parameters<typeof QuestionsScreen>[0], 'step' | 'tag' | 'title' | 'questions'>) {
  return <QuestionsScreen {...p} step={3} tag="스타일 ② 몰입도" title="나는 이렇게 즐겨요" questions={immersionQuestions(category)} />;
}

export function MustScreen(props: {
  draft: PreferenceDraft;
  onChange: (d: PreferenceDraft) => void;
  onBack: () => void;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
}) {
  const { draft } = props;
  return (
    <Page footer={<PrimaryButton label="후보 보러 가기" onPress={props.onSubmit} loading={props.saving} />}>
      <StepHeader step={4} total={TOTAL} onBack={props.onBack} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>필수 조건</Text>
      <Title>{'이것만은\n꼭 지켜주세요'}</Title>
      <Body>여기서 고른 조건이 어긋나는 사람은 후보에 나타나지 않아요.</Body>

      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Q6 · 함께할 상대의 범위</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>성별</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(MUST_GENDER_LABELS) as MustGender[]).map((g) => (
            <Pill key={g} label={MUST_GENDER_LABELS[g]} selected={draft.must.gender === g} onPress={() => props.onChange({ ...draft, must: { ...draft.must, gender: g } })} />
          ))}
        </View>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>나이</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(MUST_AGE_LABELS) as MustAge[]).map((a) => (
            <Pill key={a} label={MUST_AGE_LABELS[a]} selected={draft.must.age === a} onPress={() => props.onChange({ ...draft, must: { ...draft.must, age: a } })} />
          ))}
        </View>
        <Text style={styles.small}>나이와 성별은 본인 확인 결과로만 비교하고, 다른 사람에게 보여 주지 않아요.</Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>Q7 · 꼭 지켰으면 하는 약속</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>해당하는 것을 모두 골라 주세요</Text>
        {PROMISE_CODES.map((c) => (
          <ChoiceRow key={c} multi label={PROMISE_LABELS[c]} selected={draft.must.promises.includes(c)} onPress={() => props.onChange(togglePromise(draft, c))} />
        ))}
        <Text style={styles.small}>내가 고른 약속을 상대도 골랐을 때만 후보로 보여 드려요.</Text>
      </View>

      <View style={{ padding: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted, backgroundColor: colors.white }}>
        <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>
          후보 목록은 티켓 인증 전에도 볼 수 있어요. 제안은 같은 행사 티켓 인증을 마친 뒤 보낼 수 있어요.
        </Text>
      </View>
      <ErrorText message={props.error} />
    </Page>
  );
}
