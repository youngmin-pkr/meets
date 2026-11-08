/**
 * 입력 흐름(일정 → 템포 → 몰입도 → 필수 조건)에서 고르는 중인 값
 * 화면 코드와 분리해서 테스트합니다.
 */
import type { AnswerValue, DayPlan, EventDetail, MustConditions, PreferenceInput, PreferenceView, PromiseCode } from '@meets/shared';

export interface PreferenceDraft {
  /** 고른 날 (EventDay id → 그날 일정) */
  days: Record<string, DayPlan>;
  tempoAnswers: Array<AnswerValue | null>;
  immersionAnswers: Array<AnswerValue | null>;
  must: MustConditions;
}

/** 아직 지나지 않은 날만 고를 수 있습니다. */
export function selectableDays(event: EventDetail, todayIso: string) {
  return event.days.filter((d) => d.date >= todayIso);
}

function defaultPlan(day: EventDetail['days'][number]): DayPlan {
  return {
    eventDayId: day.id,
    arriveTime: day.startTime,
    leaveTime: day.endTime,
    // 처음에는 모든 구간을 '같이'로 둡니다.
    togetherSegmentIds: day.segments.map((s) => s.id),
  };
}

/** 저장된 값이 있으면 불러오고, 없으면 기본값 (하루짜리 행사면 그날을 미리 고름) */
export function initialDraft(event: EventDetail, saved: PreferenceView | null, todayIso: string): PreferenceDraft {
  const days = selectableDays(event, todayIso);
  if (saved) {
    const kept = saved.days.filter((p) => days.some((d) => d.id === p.eventDayId));
    return {
      days: Object.fromEntries(kept.map((p) => [p.eventDayId, { ...p }])),
      tempoAnswers: [...saved.tempoAnswers],
      immersionAnswers: [...saved.immersionAnswers],
      must: { ...saved.must, promises: [...saved.must.promises] },
    };
  }
  return {
    days: days.length === 1 ? { [days[0].id]: defaultPlan(days[0]) } : {},
    tempoAnswers: [null, null, null],
    immersionAnswers: [null, null, null],
    must: { gender: 'ANY', age: 'ANY', promises: [] },
  };
}

export function toggleDay(draft: PreferenceDraft, day: EventDetail['days'][number]): PreferenceDraft {
  const days = { ...draft.days };
  if (days[day.id]) delete days[day.id];
  else days[day.id] = defaultPlan(day);
  return { ...draft, days };
}

export function updateDay(draft: PreferenceDraft, dayId: string, patch: Partial<DayPlan>): PreferenceDraft {
  const current = draft.days[dayId];
  if (!current) return draft;
  const next = { ...current, ...patch };
  // 도착이 귀가 마감과 같거나 늦어지면 귀가 마감을 30분 뒤로 밀어 줍니다.
  if (next.arriveTime >= next.leaveTime) {
    const [h, m] = next.arriveTime.split(':').map(Number);
    const t = h * 60 + m + 30;
    next.leaveTime = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  return { ...draft, days: { ...draft.days, [dayId]: next } };
}

export function setSegment(draft: PreferenceDraft, dayId: string, segmentId: string, together: boolean): PreferenceDraft {
  const current = draft.days[dayId];
  if (!current) return draft;
  const ids = current.togetherSegmentIds.filter((x) => x !== segmentId);
  return updateDay(draft, dayId, { togetherSegmentIds: together ? [...ids, segmentId] : ids });
}

export function togglePromise(draft: PreferenceDraft, code: PromiseCode): PreferenceDraft {
  const has = draft.must.promises.includes(code);
  return {
    ...draft,
    must: { ...draft.must, promises: has ? draft.must.promises.filter((p) => p !== code) : [...draft.must.promises, code] },
  };
}

/** 일정 화면에서 '다음'을 누를 수 있는지 */
export function scheduleReady(draft: PreferenceDraft, event: EventDetail): boolean {
  const plans = Object.values(draft.days);
  if (plans.length === 0) return false;
  return plans.every((p) => {
    const day = event.days.find((d) => d.id === p.eventDayId);
    return !!day && p.arriveTime < p.leaveTime && (day.segments.length === 0 || p.togetherSegmentIds.length > 0);
  });
}

export const answersReady = (answers: Array<AnswerValue | null>) => answers.every((a) => a !== null);

/** 서버로 보낼 값. 아직 다 고르지 않았으면 null */
export function toInput(draft: PreferenceDraft, event: EventDetail): PreferenceInput | null {
  if (!scheduleReady(draft, event) || !answersReady(draft.tempoAnswers) || !answersReady(draft.immersionAnswers)) {
    return null;
  }
  const order = event.days.map((d) => d.id);
  return {
    days: Object.values(draft.days).sort((a, b) => order.indexOf(a.eventDayId) - order.indexOf(b.eventDayId)),
    tempoAnswers: draft.tempoAnswers as AnswerValue[],
    immersionAnswers: draft.immersionAnswers as AnswerValue[],
    must: draft.must,
  };
}
