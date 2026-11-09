import { Injectable } from '@nestjs/common';
import { APPROVAL } from '../admin/approval-status';
import { AuditService } from '../admin/audit.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AppError } from '../common/app-error';
import type { EventStatus, Prisma } from '../generated/prisma/client';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';
import { categoryOf, scheduleFingerprint, validateEventInput } from './event-input';
import { EventStateService } from './event-state.service';
import type { EventInputDto } from './events.dto';

const fullInclude = {
  days: { orderBy: { date: 'asc' }, include: { segments: { orderBy: { sortOrder: 'asc' } } } },
  meetingSpots: { orderBy: { name: 'asc' } },
  reports: {
    orderBy: { createdAt: 'asc' },
    // 제보자 정보는 보여 주지 않고 제보 내용만 보여 줍니다.
    select: { id: true, name: true, dateText: true, placeText: true, officialUrl: true, createdAt: true },
  },
} satisfies Prisma.EventInclude;

/**
 * 운영 콘솔의 행사 기능 (행사 등록·수정, 제보 검수, 행사 취소)
 * 운영 콘솔 화면은 아직 없고, 서버 기능과 규칙만 먼저 만들었습니다.
 */
@Injectable()
export class AdminEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventState: EventStateService,
    private readonly audit: AuditService,
    private readonly appointments: AppointmentsService,
  ) {}

  async list(adminId: string, status?: EventStatus) {
    const events = await this.prisma.event.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { days: { orderBy: { date: 'asc' }, select: { date: true } }, _count: { select: { reports: true } } },
    });
    await this.audit.record({ actorId: adminId, action: 'EVENT_LIST_VIEW', targetType: 'Event', reason: status });
    return events.map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      category: e.category,
      type: e.type,
      venue: e.venue,
      dates: e.days.map((d) => d.date),
      reportCount: e._count.reports,
    }));
  }

  async get(adminId: string, id: string) {
    const event = await this.prisma.event.findUnique({ where: { id }, include: fullInclude });
    if (!event) throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');
    await this.audit.record({ actorId: adminId, action: 'EVENT_VIEW', targetType: 'Event', targetId: id });
    return event;
  }

  private nestedWrites(input: EventInputDto) {
    return {
      days: {
        create: input.days.map((d) => ({
          date: d.date,
          startTime: d.startTime,
          endTime: d.endTime,
          segments: {
            create: d.segments.map((s, i) => ({ label: s.label, startTime: s.startTime, endTime: s.endTime, sortOrder: i })),
          },
        })),
      },
      meetingSpots: { create: input.meetingSpots.map((s) => ({ name: s.name, isPublicPlace: s.isPublicPlace })) },
    };
  }

  /** 날짜는 날짜로, 구간은 이름으로 맞춰서 고칩니다. 없어진 날·구간만 지웁니다. */
  private async syncDays(
    tx: Prisma.TransactionClient,
    eventId: string,
    current: Array<{ id: string; date: string; segments: Array<{ id: string; label: string }> }>,
    days: EventInputDto['days'],
  ) {
    for (const d of days) {
      const existing = current.find((c) => c.date === d.date);
      if (!existing) {
        await tx.eventDay.create({
          data: {
            eventId,
            date: d.date,
            startTime: d.startTime,
            endTime: d.endTime,
            segments: { create: d.segments.map((x, i) => ({ label: x.label, startTime: x.startTime, endTime: x.endTime, sortOrder: i })) },
          },
        });
        continue;
      }
      await tx.eventDay.update({ where: { id: existing.id }, data: { startTime: d.startTime, endTime: d.endTime } });
      const kept = new Set<string>();
      for (const [i, x] of d.segments.entries()) {
        const same = existing.segments.find((c) => c.label === x.label && !kept.has(c.id));
        if (same) {
          kept.add(same.id);
          await tx.eventSegment.update({ where: { id: same.id }, data: { startTime: x.startTime, endTime: x.endTime, sortOrder: i } });
        } else {
          const created = await tx.eventSegment.create({
            data: { eventDayId: existing.id, label: x.label, startTime: x.startTime, endTime: x.endTime, sortOrder: i },
          });
          kept.add(created.id);
        }
      }
      await tx.eventSegment.deleteMany({ where: { eventDayId: existing.id, id: { notIn: [...kept] } } });
    }
    const dates = days.map((d) => d.date);
    await tx.eventDay.deleteMany({ where: { eventId, date: { notIn: dates } } });
  }

  /** 만날 장소는 이름으로 맞춰서 고칩니다. 없어진 장소만 지웁니다. (제안·약속에는 장소 이름이 남아 있음) */
  private async syncMeetingSpots(
    tx: Prisma.TransactionClient,
    eventId: string,
    current: Array<{ id: string; name: string }>,
    spots: EventInputDto['meetingSpots'],
  ) {
    const kept = new Set<string>();
    for (const sp of spots) {
      const name = sp.name.trim();
      const same = current.find((c) => c.name === name && !kept.has(c.id));
      if (same) {
        kept.add(same.id);
        await tx.meetingSpot.update({ where: { id: same.id }, data: { isPublicPlace: sp.isPublicPlace } });
      } else {
        const created = await tx.meetingSpot.create({ data: { eventId, name, isPublicPlace: sp.isPublicPlace } });
        kept.add(created.id);
      }
    }
    await tx.meetingSpot.deleteMany({ where: { eventId, id: { notIn: [...kept] } } });
  }

  /** 운영자가 행사를 직접 등록합니다. */
  async create(adminId: string, input: EventInputDto) {
    const { urlKey } = validateEventInput(input);
    try {
      const event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            name: input.name.trim(),
            category: categoryOf(input),
            type: input.type,
            venue: input.venue.trim(),
            officialUrl: input.officialUrl.trim(),
            officialUrlKey: urlKey,
            ticketRequired: input.ticketRequired,
            status: this.eventState.registeredStatus,
            ...this.nestedWrites(input),
          },
        });
        await this.audit.record({ actorId: adminId, action: 'EVENT_CREATE', targetType: 'Event', targetId: created.id }, tx);
        return created;
      });
      return this.prisma.event.findUniqueOrThrow({ where: { id: event.id }, include: fullInclude });
    } catch (error) {
      if (isUniqueViolation(error, 'officialUrlKey')) {
        throw new AppError('EVENT_DUPLICATE', '같은 공식 링크의 행사가 이미 있어요.');
      }
      throw error;
    }
  }

  /**
   * 행사 수정. 등록된 행사의 일정이 바뀌면 먼저 확인(CONFIRM_REQUIRED)을 돌려주고,
   * confirmed=true로 다시 보내면 저장하면서 '변경됨'으로 바꿉니다.
   */
  async update(adminId: string, id: string, input: EventInputDto, confirmed: boolean) {
    const { urlKey } = validateEventInput(input);
    const current = await this.prisma.event.findUnique({ where: { id }, include: fullInclude });
    if (!current) throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');
    if (current.status === 'REJECTED' || current.status === 'CANCELLED') {
      throw new AppError('EVENT_CLOSED', '반려되었거나 취소된 행사는 고칠 수 없어요.');
    }

    const scheduleChanged =
      current.days.length > 0 && scheduleFingerprint(current.days) !== scheduleFingerprint(input.days);
    const needsChangedState = scheduleChanged && (current.status === 'REGISTERED' || current.status === 'CHANGED');

    if (needsChangedState && !confirmed) {
      // 수정 저장 전 확인 (정리문서 5장). 화면은 이 값을 보여 주고 확인을 받습니다.
      throw new AppError('CONFIRM_REQUIRED', '일정이 바뀌어요. 약속한 사람들에게 안내가 나가요. 저장할까요?', {
        affectedAppointments: await this.appointments.countAffectedBySchedule(id, input.days),
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (needsChangedState) {
          // 표에 따라 '등록 → 변경됨' 또는 '변경됨 → 변경됨'
          await this.eventState.transition(tx, id, current.status, 'CHANGED');
        }
        // 날짜·구간·만날 장소는 지우고 새로 만들지 않고, 같은 날짜·같은 이름이면 그대로 고쳐 씁니다.
        // (사용자가 고른 날·구간, 티켓으로 입장할 수 있는 날, 제안·약속이 계속 같은 날을 가리키도록)
        if (scheduleChanged || current.days.length === 0) await this.syncDays(tx, id, current.days, input.days);
        await this.syncMeetingSpots(tx, id, current.meetingSpots, input.meetingSpots);
        await tx.event.update({
          where: { id },
          data: {
            name: input.name.trim(),
            category: categoryOf(input),
            type: input.type,
            venue: input.venue.trim(),
            officialUrl: input.officialUrl.trim(),
            officialUrlKey: urlKey,
            ticketRequired: input.ticketRequired,
          },
        });
        if (needsChangedState) {
          // 시간이 달라진 약속은 '다시 정하기'로 바꾸고 약속한 사람들에게 안내합니다. (정리문서 5장)
          await this.appointments.onEventScheduleChanged(tx, id);
        }
        await this.audit.record(
          {
            actorId: adminId,
            action: needsChangedState ? 'EVENT_SCHEDULE_CHANGE' : 'EVENT_UPDATE',
            targetType: 'Event',
            targetId: id,
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error, 'officialUrlKey')) {
        throw new AppError('EVENT_DUPLICATE', '같은 공식 링크의 행사가 이미 있어요.');
      }
      throw error;
    }
    return this.prisma.event.findUniqueOrThrow({ where: { id }, include: fullInclude });
  }

  /** 제보 검수 시작 (제보됨 → 검수 중) */
  async startReview(adminId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.eventState.transition(tx, id, 'REPORTED', 'REVIEWING');
      await this.audit.record({ actorId: adminId, action: 'EVENT_REVIEW_START', targetType: 'Event', targetId: id }, tx);
    });
    return this.get(adminId, id);
  }

  /** 제보 승인 (검수 중 → 등록). 유형·장소·날짜·공개된 만날 장소가 채워져 있어야 합니다. */
  async approve(adminId: string, id: string) {
    const event = await this.prisma.event.findUnique({ where: { id }, include: fullInclude });
    if (!event) throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');
    if (!event.type || !event.venue || event.days.length === 0 || !event.meetingSpots.some((s) => s.isPublicPlace)) {
      throw new AppError('EVENT_INCOMPLETE', '유형, 장소, 날짜, 공개된 만날 장소를 먼저 채워 주세요.');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.eventState.transition(tx, id, event.status, 'REGISTERED');
      await this.audit.record({ actorId: adminId, action: 'EVENT_APPROVE', targetType: 'Event', targetId: id }, tx);
    });
    // TODO(4단계): 제보한 사람들에게 '행사 등록 안내'를 모아서 보냅니다. (정리문서 8장)
    return this.get(adminId, id);
  }

  /** 제보 반려 (검수 중 → 반려). 링크가 없거나 개인 모임일 때. */
  async reject(adminId: string, id: string, reason: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');
    await this.prisma.$transaction(async (tx) => {
      await this.eventState.transition(tx, id, event.status, 'REJECTED', { reason });
      await this.audit.record({ actorId: adminId, action: 'EVENT_REJECT', targetType: 'Event', targetId: id, reason }, tx);
    });
    return this.get(adminId, id);
  }

  /** 행사 취소 제안 (행사 담당). 다른 관리자가 확정해야 취소됩니다. */
  async proposeCancel(adminId: string, id: string, reason: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');
    if (event.status !== 'REGISTERED' && event.status !== 'CHANGED') {
      throw new AppError('INVALID_TRANSITION', '등록된 행사만 취소할 수 있어요.');
    }
    const pending = await this.prisma.adminApproval.findFirst({
      where: { kind: 'EVENT_CANCEL', targetId: id, status: APPROVAL.PENDING },
    });
    if (pending) throw new AppError('APPROVAL_INVALID', '이미 취소 제안이 있어요.');
    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.adminApproval.create({
        data: { kind: 'EVENT_CANCEL', targetId: id, reason, proposedById: adminId },
      });
      await this.audit.record(
        { actorId: adminId, action: 'EVENT_CANCEL_PROPOSE', targetType: 'Event', targetId: id, reason },
        tx,
      );
      return approval;
    });
  }

  /** 행사 취소 확정 (관리자). 제안한 사람과 다른 사람이어야 합니다. */
  async confirmCancel(adminId: string, approvalId: string) {
    const approval = await this.prisma.adminApproval.findUnique({ where: { id: approvalId } });
    if (!approval || approval.kind !== 'EVENT_CANCEL') throw new AppError('NOT_FOUND', '취소 제안을 찾을 수 없어요.');
    if (approval.status !== 'PENDING') throw new AppError('APPROVAL_INVALID', '이미 처리된 제안이에요.');
    const event = await this.prisma.event.findUnique({ where: { id: approval.targetId } });
    if (!event) throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');

    await this.prisma.$transaction(async (tx) => {
      // 두 명 확인은 상태 전이 표에서 검사합니다. (제안자 ≠ 확정자)
      await this.eventState.transition(tx, event.id, event.status, 'CANCELLED', {
        reason: approval.reason,
        approval: { proposedBy: approval.proposedById, confirmedBy: adminId },
      });
      const done = await tx.adminApproval.updateMany({
        where: { id: approvalId, status: APPROVAL.PENDING },
        data: { status: APPROVAL.CONFIRMED, confirmedById: adminId, decidedAt: new Date() },
      });
      if (done.count !== 1) throw new AppError('APPROVAL_INVALID', '이미 처리된 제안이에요.');
      // 이 행사의 약속은 모두 자동 종료하고, 후기 요청 없이 취소 안내를 보냅니다. (정리문서 5장)
      await this.appointments.onEventCancelled(tx, event.id);
      await this.audit.record(
        { actorId: adminId, action: 'EVENT_CANCEL_CONFIRM', targetType: 'Event', targetId: event.id, reason: approval.reason },
        tx,
      );
    });
    return this.get(adminId, event.id);
  }
}
