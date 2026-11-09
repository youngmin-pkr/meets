/**
 * 신뢰 단계 (정리문서 1장, 정책 값 11·12)
 *
 * 1 기본 · 2 참석 예정 · 3 참석 인증 · 4 쌓인 신뢰. 숫자 점수는 보여주지 않고 단계만 보여 줍니다.
 * 지금은 보여 주기만 합니다. 단계에 따라 기능을 열고 닫는 것은 즉석 동행(10단계) 때 정합니다. (2026-11-09 사용자 확인)
 *
 * 올라가는 기준
 *  - 2단계: '참석 예정'을 한 적이 있음, 3단계: 티켓 인증을 한 적이 있음
 *  - 4단계: 3단계이고, 다른 사람이 남긴 '좋았어요·괜찮았어요' 후기가 3건 이상, 운영팀이 사실로 확인한 불편 신고가 0건
 * 내려가는 기준
 *  - 최근 90일 안에 임박 취소·무응답·운영팀이 확인한 노쇼가 합쳐서 2번 이상이면 한 단계 내려감 (1단계 아래로는 안 내려감)
 */

export type TrustLevel = 1 | 2 | 3 | 4;

export const TRUST_LEVELS: Record<TrustLevel, { label: string; description: string }> = {
  1: { label: '기본', description: '휴대폰 본인 확인. 후보 구경과 대기 알림을 쓸 수 있어요.' },
  2: { label: '참석 예정', description: '행사와 날짜를 입력했어요. 짧은 구간만 제안할 수 있어요.' },
  3: { label: '참석 인증', description: '티켓이나 예약을 확인했어요. 더 긴 구간도 제안할 수 있어요.' },
  4: { label: '쌓인 신뢰', description: '후기와 약속 이행이 쌓였어요. 후보 카드에 쌓인 신뢰 표시가 붙어요.' },
};

export interface TrustFacts {
  everPlanned: boolean;
  everVerified: boolean;
  /** 다른 사람이 나에게 남긴 '좋았어요·괜찮았어요' 후기 수 */
  positiveReviews: number;
  /** 운영팀이 사실로 확인한 불편 신고 수 */
  upheldReports: number;
  /** 최근 기간의 임박 취소 + 무응답 + 운영팀이 확인한 노쇼 */
  recentBadRecords: number;
}

export interface TrustPolicy {
  upReviewCount: number;
  downCount: number;
}

export type TrustReason = 'DEFAULT' | 'ATTENDANCE_PLANNED' | 'ATTENDANCE_VERIFIED' | 'REVIEWS' | 'RECENT_RECORDS' | 'REPORT_UPHELD';

export function computeTrust(f: TrustFacts, p: TrustPolicy): { level: TrustLevel; reason: TrustReason } {
  let base: TrustLevel = f.everVerified ? 3 : f.everPlanned ? 2 : 1;
  let reason: TrustReason = base === 3 ? 'ATTENDANCE_VERIFIED' : base === 2 ? 'ATTENDANCE_PLANNED' : 'DEFAULT';
  if (base === 3 && f.positiveReviews >= p.upReviewCount) {
    if (f.upheldReports === 0) {
      base = 4;
      reason = 'REVIEWS';
    } else {
      reason = 'REPORT_UPHELD';
    }
  }
  if (f.recentBadRecords >= p.downCount && base > 1) {
    return { level: (base - 1) as TrustLevel, reason: 'RECENT_RECORDS' };
  }
  return { level: base, reason };
}

/** 내 신뢰 단계 화면 */
export interface TrustView {
  level: TrustLevel;
  label: string;
  description: string;
  /** 다음 단계. 3단계에서만 '후기 N개 더'를 보여 줍니다 */
  next: { label: string; reviewsToGo: number | null; progress: number | null } | null;
}

export function trustView(level: TrustLevel, facts: TrustFacts, p: TrustPolicy): TrustView {
  const next = level < 4 ? ((level + 1) as TrustLevel) : null;
  const counting = level === 3;
  return {
    level,
    label: TRUST_LEVELS[level].label,
    description: TRUST_LEVELS[level].description,
    next: next
      ? {
          label: TRUST_LEVELS[next].label,
          reviewsToGo: counting ? Math.max(0, p.upReviewCount - facts.positiveReviews) : null,
          progress: counting ? Math.min(1, facts.positiveReviews / p.upReviewCount) : null,
        }
      : null,
  };
}
