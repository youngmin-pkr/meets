/**
 * 일행 (정리문서 2장 "일행", 3장 "일행과 청소년", 5장 "일행")
 *
 * - 성인 2~4명. 초대 링크로 친구가 합류하고, 전원이 입력(일정·스타일, 그리고 티켓 인증 또는 참석 예정)을 마쳐야 후보가 열립니다.
 * - 후보를 찾을 때 같이 볼 구간은 전원이 겹치는 시간, 템포는 가장 여유 있는 사람, 몰입도는 가장 낮은 사람 기준입니다.
 * - 꼭 지킬 조건(나이·성별·약속)은 일행 한 명 한 명 모두에게 맞아야 후보입니다.
 * - 누가 빠져도 남은 사람끼리 계속하고, 한 명만 남으면 일행이 풀립니다.
 * TODO(11단계): 청소년 그룹은 법률 검토 뒤에 만듭니다. 일행은 성인만 만들 수 있습니다.
 * TODO(9-2단계): 일행이 제안을 보내고 받는 것(제안 중), 약속에서 누가 빠지는 경우.
 */
import {
  matchCandidates,
  overlapOnDay,
  effectiveDays,
  passesMust,
  type MatchDay,
  type MatchOptions,
  type MatchPolicy,
  type MatchProfile,
  type MatchResult,
} from './matching';
import { fromMinutes, toMinutes } from './preference';

export type PartyStatus =
  | 'INVITING' // 초대 중
  | 'CONFIRMING' // 확인 중
  | 'ACTIVE' // 활성
  | 'PROPOSING' // 제안 중 (9-2)
  | 'DISBANDED'; // 해체

export const PARTY_STATUSES: PartyStatus[] = ['INVITING', 'CONFIRMING', 'ACTIVE', 'PROPOSING', 'DISBANDED'];

export const PARTY_STATUS_LABELS: Record<PartyStatus, string> = {
  INVITING: '초대 중',
  CONFIRMING: '확인 중',
  ACTIVE: '활성',
  PROPOSING: '제안 중',
  DISBANDED: '해체',
};

export interface PartyTransition {
  from: PartyStatus;
  to: PartyStatus;
  condition: string;
}

/** 정리문서 5장 "일행" 상태 전이 표. 이 표에 없는 전이는 모두 막습니다. */
export const PARTY_TRANSITIONS: PartyTransition[] = [
  { from: 'INVITING', to: 'CONFIRMING', condition: '초대 링크로 친구가 합류' },
  { from: 'CONFIRMING', to: 'ACTIVE', condition: '전원이 입력을 마침. 한 명 없이 진행해도 됨(대표가 입력하지 않은 친구를 빼고 진행)' },
  { from: 'ACTIVE', to: 'PROPOSING', condition: '일행 전원이 제안에 동의 (9-2단계)' },
  { from: 'PROPOSING', to: 'ACTIVE', condition: '제안이 거절·만료·취소되어 끝남 (9-2단계, 2026-11-10 추가)' },
  { from: 'INVITING', to: 'DISBANDED', condition: '대표가 해체하거나 초대 시간이 지나도 아무도 합류하지 않음, 또는 한 명만 남음 (2026-11-10 추가)' },
  { from: 'CONFIRMING', to: 'DISBANDED', condition: '한 명만 남음, 또는 대표가 해체 (2026-11-10 추가)' },
  { from: 'ACTIVE', to: 'DISBANDED', condition: '한 명만 남음, 또는 대표가 해체' },
  { from: 'PROPOSING', to: 'DISBANDED', condition: '한 명만 남음, 또는 대표가 해체 (2026-11-10 추가)' },
];

export function canTransitionParty(from: PartyStatus, to: PartyStatus): boolean {
  return PARTY_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/** 일행에 새로 합류할 수 있는 상태 */
export const JOINABLE_PARTY_STATUSES: PartyStatus[] = ['INVITING', 'CONFIRMING'];

/** 끝나지 않은(해체가 아닌) 상태 */
export const LIVE_PARTY_STATUSES: PartyStatus[] = ['INVITING', 'CONFIRMING', 'ACTIVE', 'PROPOSING'];

export interface PartySizePolicy {
  minSize: number;
  maxSize: number;
}

/** 초대 링크가 사라지는 시각 */
export function partyInviteExpiresAt(createdAt: Date, hours: number): Date {
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

// ───────────── 일행 매칭 정보 ─────────────

/**
 * 일행 전원의 매칭 정보를 하나로 합칩니다.
 * - 날짜: 전원이 그날 입장할 수 있고 입력한 날만. 도착은 가장 늦은 사람, 떠남은 가장 이른 사람, 같이 볼 구간은 전원이 고른 구간만
 * - 템포·몰입도: 가장 낮은(느긋한) 사람 기준
 * - 팬덤: 합집합 (한 명이라도 같은 팬이면 같은 팬 표시)
 * 꼭 지킬 조건은 합치지 않고, 후보를 거를 때 한 명씩 모두 확인합니다. (matchPartyCandidates)
 */
export function combineProfiles(partyKey: string, members: MatchProfile[], days: MatchDay[]): MatchProfile {
  const merged: MatchProfile['days'] = [];
  for (const day of days) {
    const plans = members.map((m) => effectiveDays(m).find((d) => d.eventDayId === day.id));
    if (plans.some((p) => !p)) continue;
    const ps = plans as NonNullable<(typeof plans)[number]>[];
    const arrive = Math.max(...ps.map((p) => toMinutes(p.arriveTime)));
    const leave = Math.min(...ps.map((p) => toMinutes(p.leaveTime)));
    if (arrive >= leave) continue;
    // 구간이 없는 날은 행사 시간 전체가 하나의 구간이므로 따로 거르지 않습니다.
    const segs = day.segments.length > 0 ? day.segments.filter((s) => ps.every((p) => p.togetherSegmentIds.includes(s.id))) : [];
    if (day.segments.length > 0 && segs.length === 0) continue;
    merged.push({ eventDayId: day.id, arriveTime: fromMinutes(arrive), leaveTime: fromMinutes(leave), togetherSegmentIds: segs.map((s) => s.id) });
  }
  const gradeRank = (g: MatchProfile['grade']) => (g === 'VERIFIED' ? 2 : g === 'PLANNED' ? 1 : 0);
  const weakest = members.reduce((a, b) => (gradeRank(a.grade) <= gradeRank(b.grade) ? a : b)).grade ?? null;
  return {
    userId: partyKey,
    age: null,
    gender: null,
    tempo: Math.min(...members.map((m) => m.tempo)),
    immersion: Math.min(...members.map((m) => m.immersion)),
    must: { gender: 'ANY', age: 'ANY', promises: [] },
    fandomIds: [...new Set(members.flatMap((m) => m.fandomIds))],
    days: merged,
    grade: weakest,
    trusted: false,
    reunionWith: [...new Set(members.flatMap((m) => m.reunionWith ?? []))],
  };
}

/**
 * 일행 후보: 일행 전원의 꼭 지킬 조건에 맞는 사람 중에서, 합친 일정·템포·몰입도로 찾습니다.
 * 일행 구성원 본인은 후보에서 빠집니다.
 */
export function matchPartyCandidates(
  partyKey: string,
  members: MatchProfile[],
  others: MatchProfile[],
  days: MatchDay[],
  policy: MatchPolicy,
  options: MatchOptions = {},
): MatchResult {
  const memberIds = new Set(members.map((m) => m.userId));
  const eligible = others.filter((o) => !memberIds.has(o.userId) && members.every((m) => passesMust(m, o)));
  const combined = combineProfiles(partyKey, members, days);
  return matchCandidates(combined, eligible, days, policy, options);
}

/** 일행 후보와 일행 전원의 겹치는 시간이 있는지 (후보 상세에서 전원 기준으로 설명할 때) */
export function partyOverlapOnDay(day: MatchDay, combined: MatchProfile, other: MatchProfile) {
  return overlapOnDay(day, combined, other);
}

// ───────────── 입력 마침 ─────────────

/** 한 사람의 입력 상태: 일정·스타일 입력과, 티켓 인증 또는 참석 예정 */
export interface MemberInputFacts {
  hasPreference: boolean;
  grade: 'VERIFIED' | 'PLANNED' | null;
}

export const isInputDone = (f: MemberInputFacts): boolean => f.hasPreference && f.grade !== null;

/** 일행 상태를 바꿔야 하는지 한 번에 판단합니다. (서버와 데모가 같이 씀) */
export type PartyNext = { to: PartyStatus; reason: 'JOINED' | 'ALL_READY' | 'ONE_LEFT' | 'INVITE_EXPIRED' } | null;

export function nextPartyStatus(
  status: PartyStatus,
  members: Array<{ ready: boolean }>,
  policy: PartySizePolicy,
  inviteExpired: boolean,
): PartyNext {
  if (status === 'DISBANDED') return null;
  if (members.length < policy.minSize) {
    // 모두 빠지고 한 명만 남음. 처음 만든 직후(아직 아무도 합류하지 않음)의 초대 중은 그대로 두되, 초대 시간이 지나면 풀림
    if (status === 'INVITING') return inviteExpired ? { to: 'DISBANDED', reason: 'INVITE_EXPIRED' } : null;
    return { to: 'DISBANDED', reason: 'ONE_LEFT' };
  }
  if (status === 'INVITING') return { to: 'CONFIRMING', reason: 'JOINED' };
  if (status === 'CONFIRMING' && members.every((m) => m.ready)) return { to: 'ACTIVE', reason: 'ALL_READY' };
  return null;
}

// ───────────── 앱이 받는 모양 ─────────────

export interface PartyMemberView {
  userId: string;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
  isMe: boolean;
  isLeader: boolean;
  /** 일정·스타일 입력과 티켓 인증(또는 참석 예정)을 마쳤는지. 내용은 보이지 않고 마쳤는지만 보임 */
  ready: boolean;
}

export interface PartyView {
  id: string;
  event: { id: string; name: string };
  status: PartyStatus;
  statusLabel: string;
  members: PartyMemberView[];
  minSize: number;
  maxSize: number;
  /** 초대 링크는 대표에게만, 합류할 수 있는 동안만 보임 */
  invite: { url: string; expiresAt: string } | null;
  /** 한 줄 안내 */
  guide: string;
  actions: {
    /** 대표: 입력하지 않은 친구를 빼고 진행 */
    proceedWithout: boolean;
    /** 대표: 일행 해체 */
    disband: boolean;
    /** 나: 일행에서 빠지기 */
    leave: boolean;
    /** 후보를 볼 수 있음 (활성) */
    candidates: boolean;
  };
}

/** 초대 링크를 열면 보이는 안내 (로그인한 사람에게만) */
export interface PartyInvitePreview {
  event: { id: string; name: string };
  leaderNickname: string;
  memberCount: number;
  maxSize: number;
  /** 합류할 수 있는지, 없다면 이유 */
  joinable: boolean;
  problem: string | null;
}

export function partyGuide(p: {
  status: PartyStatus;
  isLeader: boolean;
  /** 입력하지 않은 다른 사람들의 별명 (나는 meNotReady로 따로) */
  notReady: string[];
  meNotReady?: boolean;
  memberCount: number;
  maxSize: number;
}): string {
  switch (p.status) {
    case 'INVITING':
      return p.isLeader ? '초대 링크를 친구에게 보내 주세요. 한 명이 합류하면 시작할 수 있어요.' : '친구가 합류하기를 기다리는 중이에요.';
    case 'CONFIRMING': {
      const others = p.notReady.length > 0 ? `${p.notReady.join(', ')}님` : '';
      const who = p.meNotReady ? (others ? `나와 ${others}이` : '내가') : others ? `${others}이` : '';
      return who ? `${who} 일정·스타일 입력과 티켓 인증을 마치면 후보를 볼 수 있어요.` : '전원이 입력을 마쳤어요.';
    }
    case 'ACTIVE':
      return '일행 후보를 볼 수 있어요. 같이 볼 시간은 전원이 겹치는 시간이에요.';
    case 'PROPOSING':
      return '제안의 답을 기다리는 중이에요.';
    case 'DISBANDED':
      return '일행이 풀렸어요.';
  }
}
