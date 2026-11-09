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

export type ReportPriority = 'HELP' | 'TEEN' | 'GENERAL';

export interface ReportInput {
  appointmentId: string;
  category: ReportCategory;
  detail?: string;
  /** 이 사람을 차단하고 서로 보이지 않게 하기 */
  alsoBlock: boolean;
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
