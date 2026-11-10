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
  | 'ADMIN_RESTRICTION'
  | 'SAFETY_CHECK'
  | 'SAFETY_CHECK_REMIND'
  | 'PARTY_JOINED'
  | 'PARTY_INPUT_REMIND'
  | 'PARTY_READY'
  | 'PARTY_MEMBER_LEFT'
  | 'PARTY_REMOVED'
  | 'PARTY_DISBANDED'
  | 'APPOINTMENT_MEMBER_LEFT'
  | 'PARTY_PROPOSAL_ASK'
  | 'PARTY_PROPOSAL_SENT'
  | 'PARTY_PROPOSAL_DECLINED'
  | 'INSTANT_READY';

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
  /** 확인하지 않아 약속에서 빠진 경우 (다른 사람들은 계속함) */
  dropped?: boolean;
  /** 서로 '또 같이 가고 싶어요'일 때 채팅이 계속 열려 있는지 (둘이 만난 약속만) */
  chatOpen?: boolean;
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

/** '하늘' → '하늘님', '하늘 외 2명' → '하늘님 외 2명' */
export function honorific(name: string): string {
  const i = name.indexOf(' 외 ');
  return i >= 0 ? `${name.slice(0, i)}님${name.slice(i)}` : `${name}님`;
}

export function notificationText(kind: NotificationKind, p: NotificationParams): { title: string; body: string } {
  const nick = honorific(p.nickname ?? '');
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
      return p.dropped
        ? { title: '확인하지 않아 약속에서 빠졌어요', body: `${ev} 약속을 확인 마감까지 확인하지 않아 빠졌어요. 다른 사람들은 약속을 계속해요.` }
        : { title: '확인하지 않아 약속이 취소됐어요', body: `${ev} 약속을 확인 마감까지 확인하지 않았어요.` };
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
    case 'SAFETY_CHECK':
      return { title: '잘 만나고 계세요?', body: `${ev} 만남 중이에요. 짧게 확인만 할게요. 상대에게는 보이지 않아요.` };
    case 'SAFETY_CHECK_REMIND':
      return { title: '한 번만 더 확인할게요', body: `${ev} 만남은 잘 이어지고 있나요? 답하지 않아도 괜찮아요.` };
    case 'PARTY_JOINED':
      return { title: '일행에 친구가 합류했어요', body: `${nick}이 ${ev} 일행에 합류했어요. 일정과 스타일을 입력하면 후보를 같이 볼 수 있어요.` };
    case 'PARTY_INPUT_REMIND':
      return { title: '일행이 기다리고 있어요', body: `${ev} 일정과 스타일을 입력해야 일행 후보를 볼 수 있어요.` };
    case 'PARTY_READY':
      return { title: '일행 후보가 열렸어요', body: `${ev} 일행 전원이 입력을 마쳤어요. 같이 갈 사람을 찾아볼까요?` };
    case 'PARTY_MEMBER_LEFT':
      return { title: '일행 인원이 바뀌었어요', body: `${nick}이 ${ev} 일행에서 빠졌어요. 남은 사람끼리 계속할 수 있어요.` };
    case 'PARTY_REMOVED':
      return { title: '일행에서 빠졌어요', body: `일정과 스타일 입력이 없어 ${ev} 일행이 입력을 마친 사람들끼리 진행하기로 했어요. 개인으로 같이 갈 사람을 찾아볼 수 있어요.` };
    case 'APPOINTMENT_MEMBER_LEFT':
      return {
        title: '약속에서 한 명이 빠졌어요',
        body: p.deadline
          ? `${nick}이 ${ev} 약속에서 빠졌어요. ${p.deadline}까지 이 약속에 갈 수 있는지 다시 확인해 주세요. 확인하지 않으면 보류돼요.`
          : `${nick}이 ${ev} 약속에서 빠졌어요. 남은 사람끼리 계속해요.`,
      };
    case 'PARTY_PROPOSAL_ASK':
      return { title: '일행 제안에 동의해 주세요', body: `${nick}이 ${ev} 일행 제안을 만들었어요. ${p.deadline}까지 모두 동의하면 제안이 나가요.` };
    case 'PARTY_PROPOSAL_SENT':
      return { title: '일행 제안이 나갔어요', body: `${ev} 일행 제안에 모두 동의해서 제안을 보냈어요. ${p.deadline}까지 답을 기다려요.` };
    case 'PARTY_PROPOSAL_DECLINED':
      return { title: '일행 제안이 취소됐어요', body: `${nick}이 동의하지 않아 ${ev} 일행 제안이 취소됐어요. 다시 만들 수 있어요.` };
    case 'INSTANT_READY':
      return { title: '같이 갈 사람을 볼 수 있어요', body: `${ev}에서 지금 만날 수 있는 사람이 모였어요. 후보를 확인해 보세요.` };
    case 'PARTY_DISBANDED':
      return { title: '일행이 풀렸어요', body: `${ev} 일행이 풀렸어요. 개인으로 같이 갈 사람을 찾아볼 수 있어요.` };
    case 'ADMIN_WARNING':
      return { title: '운영 안내', body: '다른 이용자의 신고가 확인되어 안내드려요. 모두가 편안하게 만날 수 있도록 이용 규칙을 지켜 주세요.' };
    case 'ADMIN_RESTRICTION':
      return { title: '운영 안내', body: `신고가 확인되어 ${p.until}까지 제안 보내기와 수락이 제한돼요. 채팅과 이미 만든 약속은 그대로 쓸 수 있어요.` };
    case 'REVIEW_MUTUAL_AGAIN':
      return { title: '서로 또 같이 가고 싶어 해요', body: `${nick}과 서로 '또 같이 가고 싶어요'를 골랐어요. 다음에 같은 행사에 가면 먼저 보여 드려요.${p.chatOpen === false ? '' : ' 채팅도 계속 열려 있어요.'}` };
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
