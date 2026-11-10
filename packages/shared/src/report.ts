/**
 * 신고 (정리문서 2장 "후기·신뢰" 불편했어요 → 신고, 5장 "신고")
 *
 * 신고하는 사람의 정보는 상대에게 공개되지 않습니다. 접수된 신고는 운영팀이 우선순위 순서로 처리합니다. (7-2단계)
 * 우선순위: 도움 요청 > 청소년 신고 > 일반 신고
 */

export const REPORT_CATEGORIES = {
  UNWANTED_TOUCH: '원치 않는 신체 접촉이 있었어요',
  STALKING: '계속 연락하거나 따라다녔어요',
  THREATENING: '위협적이거나 불쾌한 말을 했어요',
  PHOTO_WITHOUT_CONSENT: '동의 없이 사진·영상을 찍었어요',
  OTHER_PURPOSE: '다른 목적으로 만나자고 요구했어요',
  MONEY: '돈을 요구했어요',
  OTHER: '그 밖의 일이에요',
} as const;
export type ReportCategory = keyof typeof REPORT_CATEGORIES;
export const REPORT_CATEGORY_CODES = Object.keys(REPORT_CATEGORIES) as ReportCategory[];

/** 사용자가 고를 수 없고 시스템이 만드는 분류: '안 나왔어요'를 누르면 운영팀이 양쪽 도착 기록을 보고 판단합니다 */
export const SYSTEM_REPORT_CATEGORIES = {
  NO_SHOW: '안 나왔어요 (도착 기록 확인)',
  /** '불편해서 벗어나고 싶어요': 약속을 끝내고 운영팀에 가장 먼저 접수 */
  HELP_REQUEST: '도움 요청 (벗어나고 싶어요)',
} as const;
export type ReportCategoryAll = ReportCategory | keyof typeof SYSTEM_REPORT_CATEGORIES;
export const REPORT_CATEGORY_LABELS: Record<ReportCategoryAll, string> = { ...REPORT_CATEGORIES, ...SYSTEM_REPORT_CATEGORIES };

export type ReportPriority = 'HELP' | 'TEEN' | 'GENERAL';

/** 처리 순서: 도움 요청 > 청소년 신고 > 일반 신고 */
export const REPORT_PRIORITY_ORDER: ReportPriority[] = ['HELP', 'TEEN', 'GENERAL'];
export const REPORT_PRIORITY_LABELS: Record<ReportPriority, string> = { HELP: '도움 요청', TEEN: '청소년', GENERAL: '일반' };

/** 신고 상태 (정리문서 5장 "신고") */
export type ReportStatus = 'RECEIVED' | 'QUEUED' | 'IN_REVIEW' | 'SUSPENSION_PROPOSED' | 'CONFIRMED' | 'CLOSED';
export const REPORT_STATUSES: ReportStatus[] = ['RECEIVED', 'QUEUED', 'IN_REVIEW', 'SUSPENSION_PROPOSED', 'CONFIRMED', 'CLOSED'];
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  RECEIVED: '접수',
  QUEUED: '대기',
  IN_REVIEW: '처리 중',
  SUSPENSION_PROPOSED: '정지 제안',
  CONFIRMED: '확정',
  CLOSED: '종결',
};

/** 신고 상태 전이 표 (정리문서 5장 "신고"). 표에 있는 전이만 허용하고 나머지는 거절합니다. */
export const REPORT_TRANSITIONS: Array<{ from: ReportStatus; to: ReportStatus; condition: string; twoPerson?: boolean }> = [
  { from: 'RECEIVED', to: 'QUEUED', condition: '도움 요청 > 청소년 신고 > 일반 신고 순으로 정렬해 대기열에 올림' },
  { from: 'QUEUED', to: 'IN_REVIEW', condition: '담당자가 지정됨. 대화를 열람하면 사유가 기록됨' },
  { from: 'IN_REVIEW', to: 'SUSPENSION_PROPOSED', condition: '신고 담당이 이용 정지를 제안' },
  { from: 'SUSPENSION_PROPOSED', to: 'CONFIRMED', condition: '다른 관리자가 확정 (2명 확인)', twoPerson: true },
  { from: 'IN_REVIEW', to: 'CLOSED', condition: '조치 없음이거나 조치가 끝남' },
  { from: 'SUSPENSION_PROPOSED', to: 'IN_REVIEW', condition: '다른 관리자가 정지를 확정하지 않고 되돌림 (2026-11-09 추가)' },
  { from: 'CONFIRMED', to: 'CLOSED', condition: '정지가 적용되고 조치가 끝남 (2026-11-09 추가)' },
];

export function reportTransition(from: ReportStatus, to: ReportStatus) {
  return REPORT_TRANSITIONS.find((t) => t.from === from && t.to === to) ?? null;
}

/** 운영팀이 고르는 조치 (정리문서 7장 시안: 기록만 남기기, 경고, 기능 제한 N일, 이용 정지). 이용 정지는 두 명 확인이라 따로 제안합니다. */
export const REPORT_RESOLVE_ACTIONS = {
  NO_ACTION: { label: '조치 없음', upheld: false },
  RECORD_ONLY: { label: '기록만 남기기', upheld: true },
  WARN: { label: '경고', upheld: true },
  RESTRICT: { label: '기능 제한', upheld: true },
} as const;
export type ReportResolveAction = keyof typeof REPORT_RESOLVE_ACTIONS;
export const REPORT_RESOLVE_ACTION_CODES = Object.keys(REPORT_RESOLVE_ACTIONS) as ReportResolveAction[];

/** 신고를 처리한 결과 (종결된 신고에 남음) */
export type ReportOutcome = ReportResolveAction | 'SUSPEND';

/** 운영 콘솔의 신고 목록 한 줄. 이름·내용은 상세에서만 보입니다. */
export interface AdminReportQueueItem {
  id: string;
  status: ReportStatus;
  priority: ReportPriority;
  category: ReportCategoryAll;
  categoryLabel: string;
  eventName: string;
  createdAt: string;
  assigned: boolean;
  assignedToMe: boolean;
}

/** 운영 콘솔의 신고 상세 (대화 내용은 들어 있지 않음. 대화는 사유를 적고 따로 엽니다) */
export interface AdminReportDetail extends AdminReportQueueItem {
  detail: string | null;
  appointment: { id: string; date: string; startTime: string; endTime: string; status: string };
  reporter: { nickname: string; ageClass: string; arrivedAt: string | null };
  target: { nickname: string; ageClass: string; arrivedAt: string | null };
  /** 상대에게 접수된 다른 신고 수 / 그중 운영팀이 사실로 확인한 수 */
  targetPastReports: { total: number; upheld: number };
  pendingSuspension: { approvalId: string; proposedByMe: boolean } | null;
  outcome: ReportOutcome | null;
}

/** 운영팀이 신고 건에서 연 대화 기록 */
export interface AdminReportChat {
  reportId: string;
  messages: Array<{ seq: number; side: 'REPORTER' | 'TARGET' | 'SYSTEM'; body: string; createdAt: string; contactDetected: boolean }>;
}

export interface ReportInput {
  appointmentId: string;
  category: ReportCategory;
  detail?: string;
  /** 이 사람을 차단하고 서로 보이지 않게 하기 */
  alsoBlock: boolean;
  /** 여러 명이 만난 약속에서 누구를 신고하는지. 1:1이면 비워 둡니다 */
  targetId?: string;
}

/** 신고 우선순위: 도움 요청이면 가장 앞, 청소년이 걸려 있으면 그다음, 나머지는 일반 */
export function reportPriority(o: { help?: boolean; reporterIsTeen: boolean; targetIsTeen: boolean }): ReportPriority {
  if (o.help) return 'HELP';
  return o.reporterIsTeen || o.targetIsTeen ? 'TEEN' : 'GENERAL';
}

/** 차단한 사람 목록 한 줄 */
export interface BlockView {
  userId: string;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
  blockedAt: string;
  /** 어디에서 차단했는지 */
  sourceLabel: string;
  /** 신고하고 싶을 때 연결할 가장 최근 함께한 약속 */
  lastAppointmentId: string | null;
}

export type BlockSource = 'CHAT' | 'REPORT' | 'REVIEW' | 'ME';

export const BLOCK_SOURCE_LABELS: Record<BlockSource, string> = {
  CHAT: '채팅에서 차단',
  REPORT: '약속 중 불편',
  REVIEW: '후기에서 차단',
  ME: '직접 차단',
};
