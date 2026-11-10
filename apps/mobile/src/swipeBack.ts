/**
 * 화면을 오른쪽으로 밀었을 때 돌아갈 화면.
 * 위쪽 "이전" 버튼과 같은 곳으로 가고, 밀어서는 안 되는 화면(글을 쓰는 중이거나 손으로 그리는 화면)은 목록에 넣지 않습니다.
 * 채팅방과 아래 메뉴 4개는 App에서 따로 처리합니다.
 */
import type { Screen } from './signupFlow';

export function swipeBackTarget(screen: Screen, ctx: { partyBack: Screen }): Screen | null {
  const fixed: Partial<Record<Screen, Screen>> = {
    PROPOSALS: 'HOME',
    APPOINTMENT: 'HOME',
    APPOINTMENT_CANCEL: 'APPOINTMENT',
    CHAT_RULES: 'CHAT',
    INSTANT: 'HOME',
    PARTY_LIST: 'ME',
    PARTY_JOIN: 'PARTY_LIST',
    PARTY_CANDIDATES: 'PARTY',
    SAFETY_SETTINGS: 'ME',
    TRUST: 'ME',
    BLOCKS: 'ME',
    REVIEW_PICK: 'REVIEW_START',
    REVIEW_AGAIN: 'REVIEW_PICK',
    NOTIFICATIONS: 'HOME',
    SCHEDULE: 'EVENTS',
    TEMPO: 'SCHEDULE',
    IMMERSION: 'TEMPO',
    MUST: 'IMMERSION',
    CANDIDATES: 'MUST',
    CANDIDATE_DETAIL: 'CANDIDATES',
    TICKET_INTRO: 'CANDIDATES',
    TICKET_UPLOAD: 'TICKET_INTRO',
    TICKET_CHECK: 'TICKET_UPLOAD',
    WAIT: 'CANDIDATES',
  };
  if (screen === 'PARTY') return ctx.partyBack;
  return fixed[screen] ?? null;
}
