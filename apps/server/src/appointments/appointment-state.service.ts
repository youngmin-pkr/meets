import { Injectable } from '@nestjs/common';
import type { AppointmentStatus } from '@meets/shared';
import { AppError } from '../common/app-error';
import type { Prisma } from '../generated/prisma/client';
import { assertAppointmentTransition } from './appointment-transitions';

/**
 * 약속 상태를 DB에 쓰는 유일한 곳 (CLAUDE.md 규칙 2)
 * 다른 코드는 Appointment.status를 직접 바꾸지 말고 여기를 거칩니다.
 */
@Injectable()
export class AppointmentStateService {
  /** 제안이 수락되면 만들어지는 약속의 첫 상태: 확정 대기 */
  async create(tx: Prisma.TransactionClient, data: Omit<Prisma.AppointmentUncheckedCreateInput, 'status'>) {
    return tx.appointment.create({ data: { ...data, status: 'PENDING_CONFIRM' } });
  }

  /**
   * 상태를 바꿉니다. 표에 없는 전이는 거절하고,
   * 그사이 다른 사람이 상태를 바꿨으면(현재 상태가 다르면) 거절합니다.
   */
  async transition(
    tx: Prisma.TransactionClient,
    id: string,
    from: AppointmentStatus,
    to: AppointmentStatus,
    data: Omit<Prisma.AppointmentUncheckedUpdateManyInput, 'status'> = {},
  ) {
    assertAppointmentTransition(from, to);
    const updated = await tx.appointment.updateMany({ where: { id, status: from }, data: { ...data, status: to } });
    if (updated.count !== 1) {
      throw new AppError('APPOINTMENT_STATE', '약속 상태가 그사이 바뀌었어요. 새로고침해 주세요.');
    }
  }
}
