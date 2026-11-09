/**
 * 앱 안 채팅 (정리문서 2장 "채팅", 정책 값 8)
 *
 * - 제안을 수락해 약속이 생기면 열리고, 만남이 끝나고 24시간 뒤 닫힙니다.
 * - 취소·행사 취소로 끝난 약속은 바로 닫힙니다. 보류된 약속은 약속 시간이 끝나고 24시간 뒤 닫힙니다.
 * - 닫힌 채팅은 읽을 수만 있습니다.
 * - 글자만 보낼 수 있습니다. (사진·위치 불가)
 * - 연락처·SNS는 보내기 전에 멈추고, 그래도 보내면 기록합니다. (CLAUDE.md 규칙 7)
 */
import type { ContactKind } from './contact-detector';
import type { Counterpart, AppointmentStatus } from './proposal';

const HOUR = 60 * 60 * 1000;

/**
 * 채팅이 닫히는 시각. 아직 정해지지 않았으면(진행 중인 약속) null
 * @param endsAt 약속 시간이 끝나는 시각
 * @param endedAt 약속이 끝난(취소·중간 종료·자동 종료된) 시각
 */
export function chatClosesAt(
  a: { status: AppointmentStatus; endsAt: Date; endedAt: Date | null; extended?: boolean },
  policy: { closeHoursAfterEnd: number },
): Date | null {
  // 서로 '또 같이 가고 싶어요'를 골랐으면 만남이 끝난 뒤에도 닫히지 않습니다. (2026-11-09 사용자 확인)
  if (a.extended && a.status === 'ENDED') return null;
  const after = (d: Date) => new Date(d.getTime() + policy.closeHoursAfterEnd * HOUR);
  switch (a.status) {
    case 'ENDED':
    case 'ON_HOLD':
      return after(a.endsAt);
    case 'ENDED_EARLY':
      return after(a.endedAt ?? a.endsAt);
    case 'CANCELLED':
    case 'AUTO_ENDED':
      return a.endedAt ?? a.endsAt;
    default:
      return null;
  }
}

export function isChatOpen(closesAt: Date | null, now: Date): boolean {
  return closesAt === null || now < closesAt;
}

/** 약속 상태가 바뀔 때 대화창에 남기는 안내 줄 */
export const CHAT_STATUS_LINES: Partial<Record<AppointmentStatus, string>> = {
  PENDING_CONFIRM: '약속이 만들어졌어요. 연락처를 주고받지 않아도 만날 수 있어요.',
  CONFIRMED: '약속이 확정됐어요.',
  IN_PROGRESS: '약속 시간이에요.',
  ENDED: '만남이 끝났어요. 채팅은 24시간 뒤 닫혀요.',
  ENDED_EARLY: '만남이 중간에 끝났어요.',
  CANCELLED: '약속이 취소됐어요. 채팅이 닫혔어요.',
  RESCHEDULING: '행사 일정이 바뀌었어요. 바뀐 일정으로 갈 수 있는지 다시 확인해 주세요.',
  ON_HOLD: '약속이 보류됐어요.',
  AUTO_ENDED: '행사가 취소되어 약속이 끝났어요. 채팅이 닫혔어요.',
};

/** 빠른 문장 */
export const CHAT_QUICK_LATE = '조금 늦어요. 곧 도착해요!';

export const arrivedLine = (nickname: string) => `${nickname}님이 도착했어요.`;

/** 메시지 (앱이 받는 모양) */
export interface ChatMessageView {
  id: string;
  /** 순서 번호. 새 메시지를 가져올 때 이 번호 다음부터 받습니다 */
  seq: number;
  kind: 'TEXT' | 'SYSTEM';
  mine: boolean;
  body: string;
  createdAt: string;
  /** 내가 '그래도 보낼게요'로 보낸 메시지 (나에게만 표시) */
  flagged: boolean;
}

export interface ChatView {
  appointmentId: string;
  counterpart: Counterpart;
  event: { id: string; name: string };
  date: string;
  appointmentStatus: AppointmentStatus;
  /** 닫히는 시각 (아직 정해지지 않았으면 null) */
  closesAt: string | null;
  open: boolean;
  messages: ChatMessageView[];
}

/** 대화 목록 한 줄 */
export interface ChatSummary {
  appointmentId: string;
  counterpart: Counterpart;
  event: { id: string; name: string };
  date: string;
  open: boolean;
  unread: number;
  lastMessage: { body: string; createdAt: string; mine: boolean } | null;
}

/** 보내기 결과: 연락처가 감지되어 멈췄을 때는 종류만 알려 줍니다 (원문은 돌려주지 않음) */
export interface ChatContactStop {
  kinds: ContactKind[];
}

/** 메시지 글 검사 (공백만 있거나 너무 길면 안 됨) */
export function checkChatBody(body: string, maxLength: number): 'EMPTY' | 'TOO_LONG' | null {
  const trimmed = body.trim();
  if (!trimmed) return 'EMPTY';
  if ([...trimmed].length > maxLength) return 'TOO_LONG';
  return null;
}

/** 서로 '또 같이 가고 싶어요'를 골랐을 때 대화창에 남기는 안내 줄 */
export const CHAT_EXTENDED_LINE = '서로 또 같이 가고 싶어 해서 채팅이 계속 열려 있어요.';
