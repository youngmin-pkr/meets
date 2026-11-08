/**
 * 티켓 인증 상태 전이 표 (정리문서 5장 "티켓 인증")
 * 표에 있는 전이만 허용하고 나머지는 거절합니다. (CLAUDE.md 규칙 2)
 */
import type { TicketStatus } from '@meets/shared';
import { AppError } from '../common/app-error';

export const TICKET_STATUSES: TicketStatus[] = [
  'STARTED',
  'UPLOADED',
  'CONFIRMED',
  'REVIEW_PENDING',
  'VERIFIED',
  'FAILED',
  'REVERIFYING',
];

export const TICKET_TRANSITIONS: Array<{ from: TicketStatus; to: TicketStatus; condition: string }> = [
  { from: 'STARTED', to: 'UPLOADED', condition: '캡처를 올림' },
  { from: 'UPLOADED', to: 'CONFIRMED', condition: '개인정보를 가리고 인식 결과를 사용자가 확인' },
  { from: 'CONFIRMED', to: 'REVIEW_PENDING', condition: '일부는 사람이 검수' },
  { from: 'CONFIRMED', to: 'VERIFIED', condition: '입장 가능한 날을 기록하고 이미지는 바로 삭제' },
  { from: 'REVIEW_PENDING', to: 'VERIFIED', condition: '입장 가능한 날을 기록하고 이미지는 바로 삭제' },
  { from: 'CONFIRMED', to: 'FAILED', condition: '중복 예매번호 등' },
  { from: 'REVIEW_PENDING', to: 'FAILED', condition: '중복 예매번호 등' },
  { from: 'VERIFIED', to: 'REVERIFYING', condition: '신고가 들어오면' },
  // 사용자 결정(2026-11-08): 재검증 뒤의 결과
  { from: 'REVERIFYING', to: 'VERIFIED', condition: '재검증에서 다시 확인됨' },
  { from: 'REVERIFYING', to: 'FAILED', condition: '재검증에서 확인되지 않음' },
];

export function assertTicketTransition(from: TicketStatus, to: TicketStatus): void {
  if (!TICKET_TRANSITIONS.some((t) => t.from === from && t.to === to)) {
    throw new AppError('INVALID_TRANSITION', `티켓 인증 상태를 ${from}에서 ${to}(으)로 바꿀 수 없어요.`);
  }
}
