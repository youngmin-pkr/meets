/**
 * 운영자 권한표 (정리문서 7장) — 역할 4개 × 기능 10개
 *
 * 권한 검사는 서버에서 이 표로만 합니다. (CLAUDE.md 규칙 3)
 * - 관리자도 대화 기록과 인증 원본은 열 수 없습니다.
 * - 두 명 확인 작업은 제안(PROPOSE)과 확정(CONFIRM)을 서로 다른 사람이 합니다.
 */
export type AdminRoleName = 'REVIEWER' | 'REPORT_MANAGER' | 'EVENT_MANAGER' | 'ADMIN';

export type AdminFunction =
  | 'VIEW_TODAY' // 오늘 할 일 보기
  | 'REVIEW_TICKET' // 인증 검수 (승인·반려)
  | 'VIEW_TICKET_IMAGE' // 인증 원본 이미지 보기 (검수 중에만)
  | 'HANDLE_REPORT' // 신고 처리 (청소년·도움 요청 포함)
  | 'VIEW_REPORT_CHAT' // 신고 건의 대화 기록 열람 (사유 기록)
  | 'SUSPEND_USER' // 이용 정지
  | 'MANAGE_EVENT' // 행사 등록·제보 검수·수정
  | 'CANCEL_EVENT' // 행사 취소
  | 'CHANGE_POLICY' // 정책 값 변경
  | 'MANAGE_ADMINS'; // 운영자 권한 부여·회수

/** NONE 불가 · ALLOW 가능 · PROPOSE 제안만 · CONFIRM 확정만 · PROPOSE_AND_CONFIRM 제안·승인(다른 사람끼리) */
export type Access = 'NONE' | 'ALLOW' | 'PROPOSE' | 'CONFIRM' | 'PROPOSE_AND_CONFIRM';

export type AdminAction = 'USE' | 'PROPOSE' | 'CONFIRM';

export const ADMIN_ROLES: AdminRoleName[] = ['REVIEWER', 'REPORT_MANAGER', 'EVENT_MANAGER', 'ADMIN'];

export const PERMISSION_TABLE: Record<AdminFunction, Record<AdminRoleName, Access>> = {
  VIEW_TODAY: { REVIEWER: 'ALLOW', REPORT_MANAGER: 'ALLOW', EVENT_MANAGER: 'ALLOW', ADMIN: 'ALLOW' },
  REVIEW_TICKET: { REVIEWER: 'ALLOW', REPORT_MANAGER: 'NONE', EVENT_MANAGER: 'NONE', ADMIN: 'ALLOW' },
  VIEW_TICKET_IMAGE: { REVIEWER: 'ALLOW', REPORT_MANAGER: 'NONE', EVENT_MANAGER: 'NONE', ADMIN: 'NONE' },
  HANDLE_REPORT: { REVIEWER: 'NONE', REPORT_MANAGER: 'ALLOW', EVENT_MANAGER: 'NONE', ADMIN: 'ALLOW' },
  VIEW_REPORT_CHAT: { REVIEWER: 'NONE', REPORT_MANAGER: 'ALLOW', EVENT_MANAGER: 'NONE', ADMIN: 'NONE' },
  SUSPEND_USER: { REVIEWER: 'NONE', REPORT_MANAGER: 'PROPOSE', EVENT_MANAGER: 'NONE', ADMIN: 'CONFIRM' },
  MANAGE_EVENT: { REVIEWER: 'NONE', REPORT_MANAGER: 'NONE', EVENT_MANAGER: 'ALLOW', ADMIN: 'ALLOW' },
  CANCEL_EVENT: { REVIEWER: 'NONE', REPORT_MANAGER: 'NONE', EVENT_MANAGER: 'PROPOSE', ADMIN: 'CONFIRM' },
  CHANGE_POLICY: { REVIEWER: 'NONE', REPORT_MANAGER: 'NONE', EVENT_MANAGER: 'NONE', ADMIN: 'PROPOSE_AND_CONFIRM' },
  MANAGE_ADMINS: { REVIEWER: 'NONE', REPORT_MANAGER: 'NONE', EVENT_MANAGER: 'NONE', ADMIN: 'ALLOW' },
};

export const ADMIN_FUNCTIONS = Object.keys(PERMISSION_TABLE) as AdminFunction[];

export function isAllowed(role: AdminRoleName, fn: AdminFunction, action: AdminAction): boolean {
  const access = PERMISSION_TABLE[fn][role];
  switch (action) {
    case 'USE':
      return access === 'ALLOW';
    case 'PROPOSE':
      return access === 'PROPOSE' || access === 'PROPOSE_AND_CONFIRM';
    case 'CONFIRM':
      return access === 'CONFIRM' || access === 'PROPOSE_AND_CONFIRM';
  }
}
