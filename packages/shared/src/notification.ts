/**
 * 알림 (정리문서 8장 "알림 목록")
 *
 * 지금은 앱 안 알림함에만 쌓입니다. 푸시 업체를 정하면 같은 내용을 푸시로 보내기만 하면 됩니다.
 * 알림 글에는 별명·행사 이름·시간·장소 이름만 넣고, 연락처 같은 개인정보는 넣지 않습니다.
 */

export type NotificationKind =
  | 'PROPOSAL_RECEIVED'
  | 'PROPOSAL_ACCEPTED'
  | 'PROPOSAL_REJECTED'
  | 'DAY_BEFORE_CONFIRM'
  | 'DAY_BEFORE_REMINDER'
  | 'APPOINTMENT_CONFIRMED'
  | 'NO_CONFIRM_PARTNER'
  | 'NO_CONFIRM_SELF'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENT_SOON'
  | 'PARTNER_ARRIVED'
  | 'APPOINTMENT_ENDED_EARLY'
  | 'EVENT_SCHEDULE_CHANGED'
  | 'APPOINTMENT_ON_HOLD'
  | 'EVENT_CANCELLED'
  | 'REVIEW_REQUEST'
  | 'REVIEW_MUTUAL_AGAIN'
  | 'REPORT_RESULT'
  | 'ADMIN_WARNING'
  | 'ADMIN_RESTRICTION';

export interface NotificationParams {
  nickname?: string;
  eventName?: string;
  /** 약속 시간 글 (예: '12.13 (토) 14:00') */
  when?: string;
  /** 마감 시간 글 */
  deadline?: string;
  spotName?: string;
  reason?: string | null;
  /** 신고를 운영팀이 사실로 확인했는지 */
  upheld?: boolean;
  /** 제한이 풀리는 시각 글자 */
  until?: string;
}

/** 알림 (앱이 받는 모양) */
export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  appointmentId: string | null;
  proposalId: string | null;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 한국 시간으로 '12.13 (토) 14:00' */
export function formatSeoulShort(at: Date | string): string {
  const d = new Date(new Date(at).getTime() + 9 * 60 * 60 * 1000);
  const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()} (${WEEKDAYS[d.getUTCDay()]}) ${hm}`;
}

export function notificationText(kind: NotificationKind, p: NotificationParams): { title: string; body: string } {
  const nick = `${p.nickname ?? ''}님`;
  const ev = p.eventName ?? '';
  switch (kind) {
    case 'PROPOSAL_RECEIVED':
      return { title: '새 제안이 왔어요', body: `${nick}이 ${ev} 동행을 제안했어요. ${p.deadline}까지 답해 주세요.` };
    case 'PROPOSAL_ACCEPTED':
      return { title: '제안이 수락됐어요', body: `${nick}과 ${ev} 약속이 생겼어요. 전날 한 번 더 확인해요.` };
    case 'PROPOSAL_REJECTED':
      return { title: '이번 제안은 어렵대요', body: `${nick}이 이번 제안은 어렵다고 했어요. 다른 후보를 찾아볼까요?` };
    case 'DAY_BEFORE_CONFIRM':
      return { title: '내일 약속, 갈 수 있어요?', body: `${ev} · ${p.when}. ${p.deadline}까지 '갈 수 있어요'를 눌러 주세요.` };
    case 'DAY_BEFORE_REMINDER':
      return { title: '아직 확인하지 않았어요', body: `${p.deadline}까지 확인하지 않으면 ${ev} 약속이 취소돼요.` };
    case 'APPOINTMENT_CONFIRMED':
      return { title: '약속이 확정됐어요', body: `${nick}도 '갈 수 있어요'를 눌렀어요. ${p.when} ${p.spotName}에서 만나요.` };
    case 'NO_CONFIRM_PARTNER':
      return { title: '상대가 확인하지 않아 약속이 취소됐어요', body: `내 신뢰 단계에는 영향이 없어요. ${ev}에 같이 갈 다른 후보를 찾아볼까요?` };
    case 'NO_CONFIRM_SELF':
      return { title: '확인하지 않아 약속이 취소됐어요', body: `${ev} 약속을 확인 마감까지 확인하지 않았어요.` };
    case 'APPOINTMENT_CANCELLED':
      return { title: '약속이 취소됐어요', body: `${nick}이 ${ev} 약속을 취소했어요.${p.reason ? ` 사유: ${p.reason}` : ''}` };
    case 'APPOINTMENT_SOON':
      return { title: '곧 약속 시간이에요', body: `${p.when} · ${p.spotName}. 도착하면 '도착했어요'를 눌러 주세요.` };
    case 'PARTNER_ARRIVED':
      return { title: `${nick}이 도착했어요`, body: `${p.spotName}에 도착했대요.` };
    case 'APPOINTMENT_ENDED_EARLY':
      return { title: '만남이 중간에 끝났어요', body: `${ev} 만남이 '안 나왔어요'로 끝났어요. 도착 기록을 함께 보고 판단해요.` };
    case 'EVENT_SCHEDULE_CHANGED':
      return { title: '행사 일정이 바뀌었어요', body: `${ev} 일정이 바뀌었어요. ${p.deadline}까지 바뀐 일정으로 갈 수 있는지 알려 주세요.` };
    case 'APPOINTMENT_ON_HOLD':
      return { title: '약속이 보류됐어요', body: `기한 안에 정하지 못해 ${ev} 약속이 보류됐어요. 취소가 아니고 신뢰 단계에 영향이 없어요.` };
    case 'EVENT_CANCELLED':
      return { title: '행사가 취소됐어요', body: `${ev} 행사가 취소되어 약속이 자동으로 끝났어요. 신뢰 단계에 영향이 없어요.` };
    case 'REVIEW_REQUEST':
      return { title: '만남은 어땠어요?', body: `${nick}과 함께한 ${ev} 만남이 끝났어요. ${p.deadline}까지 후기를 남겨 주세요. 내가 남긴 후기는 상대에게 보이지 않아요.` };
    case 'REPORT_RESULT':
      return p.upheld
        ? { title: '신고를 확인했어요', body: '운영팀이 신고하신 내용을 확인하고 필요한 조치를 했어요. 신고하신 분의 정보는 상대에게 공개되지 않아요.' }
        : { title: '신고를 확인했어요', body: '운영팀이 확인했지만 조치할 내용을 찾지 못했어요. 위험하다고 느끼면 언제든 다시 알려 주세요.' };
    case 'ADMIN_WARNING':
      return { title: '운영 안내', body: '다른 이용자의 신고가 확인되어 안내드려요. 모두가 편안하게 만날 수 있도록 이용 규칙을 지켜 주세요.' };
    case 'ADMIN_RESTRICTION':
      return { title: '운영 안내', body: `신고가 확인되어 ${p.until}까지 제안 보내기와 수락이 제한돼요. 채팅과 이미 만든 약속은 그대로 쓸 수 있어요.` };
    case 'REVIEW_MUTUAL_AGAIN':
      return { title: '서로 또 같이 가고 싶어 해요', body: `${nick}과 서로 '또 같이 가고 싶어요'를 골랐어요. 다음에 같은 행사에 가면 먼저 보여 드리고, 채팅도 계속 열려 있어요.` };
  }
}

/**
 * 푸시를 보내도 되는 가장 이른 시각. 방해 금지 시간(밤 N시~아침 M시, 한국 시간)이면 아침 M시로 미룹니다.
 * 알림함에는 바로 쌓이고, 이 값은 나중에 푸시를 붙일 때 씁니다.
 */
export function pushAvailableAt(now: Date, quietStartHour: number, quietEndHour: number): Date {
  const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const h = seoul.getUTCHours();
  const quiet = quietStartHour > quietEndHour ? h >= quietStartHour || h < quietEndHour : h >= quietStartHour && h < quietEndHour;
  if (!quiet) return now;
  const dayOffset = quietStartHour > quietEndHour && h >= quietStartHour ? 1 : 0;
  return new Date(
    Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate() + dayOffset, quietEndHour - 9, 0),
  );
}
