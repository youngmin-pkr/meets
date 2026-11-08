/**
 * 약속 상태 전이 표 (정리문서 5장 "약속"). 표 자체는 서버와 데모가 같이 쓰도록 @meets/shared에 있습니다.
 * 표에 있는 전이만 허용하고 나머지는 거절합니다. (CLAUDE.md 규칙 2)
 */
import { canTransitionAppointment, type AppointmentStatus } from '@meets/shared';
import { AppError } from '../common/app-error';

export { APPOINTMENT_STATUSES, APPOINTMENT_TRANSITIONS } from '@meets/shared';

export function assertAppointmentTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransitionAppointment(from, to)) {
    throw new AppError('INVALID_TRANSITION', `약속 상태를 ${from}에서 ${to}(으)로 바꿀 수 없어요.`);
  }
}
