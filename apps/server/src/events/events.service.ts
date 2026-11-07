import { Inject, Injectable } from '@nestjs/common';
import {
  checkEventReport,
  EVENT_REPORT_PROBLEM_MESSAGES,
  todayInSeoul,
  type EventCategory,
  type EventDetail,
  type EventReportResult,
  type EventSummary,
} from '@meets/shared';
import { AppError } from '../common/app-error';
import { CLOCK, type Clock } from '../common/clock';
import type { EventStatus, Prisma } from '../generated/prisma/client';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';
import { EventStateService } from './event-state.service';
import type { EventReportDto } from './events.dto';

/** 사용자에게 보이는 상태: 등록되었거나 일정이 바뀐 행사 */
const VISIBLE: EventStatus[] = ['REGISTERED', 'CHANGED'];

function todayIso(now: Date): string {
  const t = todayInSeoul(now);
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

const withDays = {
  days: { orderBy: { date: 'asc' }, include: { segments: { orderBy: { sortOrder: 'asc' } } } },
} satisfies Prisma.EventInclude;

type EventWithDays = Prisma.EventGetPayload<{ include: typeof withDays }>;

function toSummary(e: EventWithDays): EventSummary {
  return {
    id: e.id,
    name: e.name,
    category: e.category,
    type: e.type!,
    venue: e.venue ?? '',
    officialUrl: e.officialUrl,
    ticketRequired: e.ticketRequired,
    changed: e.status === 'CHANGED',
    days: e.days.map((d) => ({ id: d.id, date: d.date, startTime: d.startTime, endTime: d.endTime })),
  };
}

function reportProgress(status: EventStatus): EventReportResult['progress'] {
  switch (status) {
    case 'REPORTED':
      return 'RECEIVED';
    case 'REVIEWING':
      return 'REVIEWING';
    case 'REGISTERED':
    case 'CHANGED':
      return 'REGISTERED';
    default:
      return 'NOT_REGISTERED';
  }
}

/** 사용자 앱의 행사 기능: 행사 선택, 행사 제보 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventState: EventStateService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** 아직 끝나지 않은 등록 행사 목록 (가장 빠른 날짜 순) */
  async list(query: { q?: string; category?: EventCategory }): Promise<EventSummary[]> {
    const today = todayIso(this.clock.now());
    const q = (query.q ?? '').trim().slice(0, 50);
    const events = await this.prisma.event.findMany({
      where: {
        status: { in: VISIBLE },
        days: { some: { date: { gte: today } } },
        ...(query.category ? { category: query.category } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { venue: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: withDays,
      take: 100,
    });
    return events
      .map(toSummary)
      .sort((a, b) => (a.days[0]?.date ?? '').localeCompare(b.days[0]?.date ?? '') || a.name.localeCompare(b.name));
  }

  async detail(id: string): Promise<EventDetail> {
    const e = await this.prisma.event.findFirst({
      where: { id, status: { in: VISIBLE } },
      include: { ...withDays, meetingSpots: { where: { isPublicPlace: true }, orderBy: { name: 'asc' } } },
    });
    if (!e) throw new AppError('NOT_FOUND', '행사를 찾을 수 없어요.');
    return {
      ...toSummary(e),
      days: e.days.map((d) => ({
        id: d.id,
        date: d.date,
        startTime: d.startTime,
        endTime: d.endTime,
        segments: d.segments.map((s) => ({ id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime })),
      })),
      meetingSpots: e.meetingSpots.map((s) => ({ id: s.id, name: s.name })),
    };
  }

  /** 행사 제보. 같은 공식 링크로 이미 들어온 행사가 있으면 하나로 합칩니다. */
  async report(userId: string, input: EventReportDto): Promise<EventReportResult> {
    const check = checkEventReport(input);
    if (!check.ok) {
      throw new AppError('EVENT_REPORT_INVALID', EVENT_REPORT_PROBLEM_MESSAGES[check.problem], {
        problem: check.problem,
      });
    }
    const reportData = {
      reporterId: userId,
      category: input.category,
      name: input.name.trim(),
      dateText: input.dateText?.trim() || null,
      placeText: input.placeText?.trim() || null,
      officialUrl: input.officialUrl.trim(),
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = await this.prisma.event.findUnique({ where: { officialUrlKey: check.urlKey } });
      if (existing) {
        await this.prisma.eventReport.upsert({
          where: { reporterId_eventId: { reporterId: userId, eventId: existing.id } },
          update: {},
          create: { ...reportData, eventId: existing.id },
        });
        return { merged: true, progress: reportProgress(existing.status) };
      }
      try {
        await this.prisma.event.create({
          data: {
            name: reportData.name,
            category: input.category,
            venue: reportData.placeText,
            officialUrl: reportData.officialUrl,
            officialUrlKey: check.urlKey,
            // 제보로 만들어지는 행사의 첫 상태 (정리문서 5장: 제보됨)
            status: this.eventState.reportedStatus,
            reports: {
              create: {
                reporter: { connect: { id: userId } },
                category: reportData.category,
                name: reportData.name,
                dateText: reportData.dateText,
                placeText: reportData.placeText,
                officialUrl: reportData.officialUrl,
              },
            },
          },
        });
        return { merged: false, progress: 'RECEIVED' };
      } catch (error) {
        // 같은 링크로 동시에 제보된 경우: 한 번 더 찾아서 합칩니다.
        if (isUniqueViolation(error, 'officialUrlKey') && attempt === 0) continue;
        throw error;
      }
    }
    throw new AppError('EVENT_REPORT_INVALID', '잠시 후 다시 시도해 주세요.');
  }
}
