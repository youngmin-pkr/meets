import { Injectable } from '@nestjs/common';
import { AuditService } from '../admin/audit.service';
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

/** 행사가 바뀌면 영향을 받는 약속 수. 약속은 4단계에서 생깁니다. */
// TODO(4단계): 이 행사의 진행 중 약속 수를 세고, 저장 후 '다시 정하기'로 바꾸고 안내합니다.
const affectedAppointmentCount = async (_eventId: string) => 0;

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
        affectedAppointments: await affectedAppointmentCount(id),
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (needsChangedState) {
          // 표에 따라 '등록 → 변경됨' 또는 '변경됨 → 변경됨'
          await this.eventState.transition(tx, id, current.status, 'CHANGED');
        }
        await tx.eventDay.deleteMany({ where: { eventId: id } });
        await tx.meetingSpot.deleteMany({ where: { eventId: id } });
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
            ...this.nestedWrites(input),
          },
        });
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
      where: { kind: 'EVENT_CANCEL', targetId: id, status: 'PENDING' },
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
        where: { id: approvalId, status: 'PENDING' },
        data: { status: 'CONFIRMED', confirmedById: adminId, decidedAt: new Date() },
      });
      if (done.count !== 1) throw new AppError('APPROVAL_INVALID', '이미 처리된 제안이에요.');
      await this.audit.record(
        { actorId: adminId, action: 'EVENT_CANCEL_CONFIRM', targetType: 'Event', targetId: event.id, reason: approval.reason },
        tx,
      );
    });
    // TODO(4단계): 이 행사의 약속을 모두 자동 종료하고, 후기 요청 없이 취소 안내를 보냅니다.
    return this.get(adminId, event.id);
  }
}
