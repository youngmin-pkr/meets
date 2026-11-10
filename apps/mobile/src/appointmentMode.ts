/**
 * 약속 화면에서 지금 무엇을 보여 줄지 정하는 규칙 (화면 코드와 분리해서 테스트합니다)
 * 누를 수 있는 버튼(actions)은 서버가 정해서 보내 주고, 여기서는 그것을 화면 모양으로 바꾸기만 합니다.
 */
import { companionsLabel, formatSeoulShort, type AppointmentView } from '@meets/shared';

export type AppointmentMode =
  /** 확정 대기, 전날 확인 전 */
  | 'WAITING_DAY_BEFORE'
  /** 지금 '갈 수 있어요'를 눌러야 함 */
  | 'CONFIRM_NOW'
  /** 나는 확인했고 상대를 기다림 */
  | 'WAITING_PARTNER'
  | 'CONFIRMED'
  | 'MEETING'
  | 'RESCHEDULE'
  | 'ON_HOLD'
  | 'CLOSED';

export function appointmentMode(a: AppointmentView): AppointmentMode {
  switch (a.status) {
    case 'PENDING_CONFIRM':
      if (a.actions.confirm) return 'CONFIRM_NOW';
      return a.confirm.mine ? 'WAITING_PARTNER' : 'WAITING_DAY_BEFORE';
    case 'CONFIRMED':
      return 'CONFIRMED';
    case 'IN_PROGRESS':
      return 'MEETING';
    case 'RESCHEDULING':
      return 'RESCHEDULE';
    case 'ON_HOLD':
      return 'ON_HOLD';
    default:
      return 'CLOSED';
  }
}

/** 화면 위쪽 안내 (제목과 설명) */
export function appointmentHeadline(a: AppointmentView, opts: { justAccepted?: boolean; today?: string } = {}): { title: string; body: string } {
  const nick = companionsLabel(a);
  switch (appointmentMode(a)) {
    case 'WAITING_DAY_BEFORE':
      return { title: opts.justAccepted ? '약속이 만들어졌어요' : `${nick}과의 약속`, body: '아직 확정은 아니에요. 전날 한 번 더 확인해요.' };
    case 'CONFIRM_NOW':
      return { title: `${whenWord(a, opts.today)} 약속,\n갈 수 있어요?`, body: "둘 다 '갈 수 있어요'를 누르면 약속이 확정돼요." };
    case 'WAITING_PARTNER':
      return { title: `${nick}의 확인을 기다리고 있어요`, body: `내 확인은 끝났어요. ${nick}이 확인하면 바로 알려 드릴게요.` };
    case 'CONFIRMED':
      return { title: '약속이 확정됐어요', body: `${formatSeoulShort(a.startsAt)} ${a.meetingSpot.name}에서 만나요.` };
    case 'MEETING':
      return { title: '만남 중이에요', body: '도착하면 도착 기록을 남겨 주세요. 연락처는 공개되지 않아요.' };
    case 'RESCHEDULE':
      if (a.reschedule?.reason === 'MEMBERS_CHANGED') {
        return { title: '함께하는 사람이 바뀌었어요', body: '약속에서 한 명이 빠졌어요. 남은 사람끼리 이 약속에 갈 수 있는지 다시 확인해 주세요.' };
      }
      return a.reschedule?.newSchedule
        ? { title: '행사 일정이 바뀌었어요', body: '바뀐 일정으로도 갈 수 있는지 둘 다 다시 알려 주세요.' }
        : { title: '약속한 날이 행사에서 빠졌어요', body: '이 약속은 다시 정할 수 없어요. 기한이 지나면 보류돼요.' };
    case 'ON_HOLD':
      return { title: '약속이 보류됐어요', body: '기한 안에 정하지 못했어요. 취소가 아니고 신뢰 단계에 영향이 없어요.' };
    case 'CLOSED':
      return closedHeadline(a);
  }
}

/** 전날 확인은 보통 전날 열리므로 '내일', 당일이면 '오늘' */
function whenWord(a: AppointmentView, today?: string) {
  return today && a.day.date === today ? '오늘' : '내일';
}

function closedHeadline(a: AppointmentView): { title: string; body: string } {
  const nick = companionsLabel(a);
  if (a.status === 'ENDED') return { title: '만남이 끝났어요', body: '함께해서 즐거웠길 바라요.' };
  const end = a.end;
  switch (end?.reason) {
    case 'CANCELLED':
      if (end.byMe && a.status === 'ENDED_EARLY') {
        // 만남 중에 내가 끝낸 경우(도움 요청, 차단)
        return { title: '만남을 끝냈어요', body: '내 신뢰 단계에는 영향이 없어요.' };
      }
      if (end.byMe) {
        return {
          title: '약속을 취소했어요',
          body: end.late ? "약속 24시간 안의 취소라 '임박 취소'로 기록됐어요." : '미리 취소해서 신뢰 단계에 영향이 없어요.',
        };
      }
      return { title: `${nick}이 약속을 취소했어요`, body: end.cancelReason ? `사유: ${end.cancelReason}` : '내 신뢰 단계에는 영향이 없어요.' };
    case 'NO_CONFIRM':
      return end.byMe
        ? { title: '확인하지 않아 약속이 취소됐어요', body: "확인 마감까지 '갈 수 있어요'를 누르지 않았어요." }
        : { title: '상대가 확인하지 않아 약속이 취소됐어요', body: '내 신뢰 단계에는 영향이 없어요. 다른 후보를 찾아볼까요?' };
    case 'NO_SHOW':
      return end.byMe
        ? { title: '만남을 끝냈어요', body: "'안 나왔어요'는 바로 반영되지 않아요. 양쪽 도착 기록을 함께 보고 판단해요." }
        : { title: '만남이 중간에 끝났어요', body: "상대가 '안 나왔어요'를 눌렀어요. 양쪽 도착 기록을 함께 보고 판단해요." };
    case 'EVENT_CANCELLED':
      return { title: '행사가 취소됐어요', body: '약속이 자동으로 끝났어요. 신뢰 단계에 영향이 없어요.' };
    default:
      return { title: '끝난 약속이에요', body: '' };
  }
}

/** 홈 '오늘 할 일' 카드 글 */
export function todoText(a: AppointmentView, today?: string): { title: string; body: string } | null {
  if (a.actions.confirm) return { title: `${whenWord(a, today)} 약속, 갈 수 있는지 알려 주세요`, body: `${a.event.name} · ${formatSeoulShort(a.confirm.deadline)}까지` };
  if (a.actions.reconfirm && a.reschedule) return { title: a.reschedule.reason === 'MEMBERS_CHANGED' ? '함께하는 사람이 바뀌었어요' : '행사 일정이 바뀌었어요', body: `${formatSeoulShort(a.reschedule.deadline)}까지 다시 확인해 주세요` };
  if (a.actions.reportNoShow) return { title: '상대가 아직 도착하지 않았어요', body: `${a.event.name} · 상황을 확인해 주세요` };
  if (a.actions.arrive) return { title: "도착하면 '도착했어요'를 눌러 주세요", body: `${a.meetingSpot.name} · ${formatSeoulShort(a.startsAt)}` };
  return null;
}

/** 홈에 보여 줄 약속 (끝난 약속은 빼고, 가까운 순서) */
export function upcomingAppointments(list: AppointmentView[]): AppointmentView[] {
  return list
    .filter((a) => ['PENDING_CONFIRM', 'CONFIRMED', 'IN_PROGRESS', 'RESCHEDULING', 'ON_HOLD'].includes(a.status))
    .sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}
