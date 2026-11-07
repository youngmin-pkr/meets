/**
 * 운영자가 보낸 행사 정보의 내용 검사 (형식 검사는 DTO가 먼저 합니다)
 */
import { EVENT_TYPE_CATEGORY, officialUrlKey, parseCalendarDate } from '@meets/shared';
import { AppError } from '../common/app-error';
import type { EventInputDto } from './events.dto';

export function validateEventInput(input: EventInputDto): { urlKey: string } {
  const urlKey = officialUrlKey(input.officialUrl);
  if (!urlKey) throw new AppError('EVENT_INVALID', '공식 링크가 올바르지 않아요.', { field: 'officialUrl' });

  const dates = new Set<string>();
  for (const day of input.days) {
    if (!parseCalendarDate(day.date)) {
      throw new AppError('EVENT_INVALID', '없는 날짜가 있어요.', { field: 'days.date' });
    }
    if (dates.has(day.date)) {
      throw new AppError('EVENT_INVALID', '같은 날짜가 두 번 있어요.', { field: 'days.date' });
    }
    dates.add(day.date);
    if (day.startTime >= day.endTime) {
      throw new AppError('EVENT_INVALID', '시작 시각이 끝 시각보다 앞이어야 해요.', { field: 'days.time' });
    }
    for (const seg of day.segments) {
      if (seg.startTime >= seg.endTime || seg.startTime < day.startTime || seg.endTime > day.endTime) {
        throw new AppError('EVENT_INVALID', '같이 볼 구간은 그날 행사 시간 안이어야 해요.', {
          field: 'days.segments',
        });
      }
    }
  }
  if (!input.meetingSpots.some((s) => s.isPublicPlace)) {
    // 만날 장소는 공개된 곳이어야 합니다. (정리문서 2장 안전 조건)
    throw new AppError('EVENT_INVALID', '공개된 만날 장소가 하나 이상 있어야 해요.', { field: 'meetingSpots' });
  }
  return { urlKey };
}

export function categoryOf(input: EventInputDto) {
  return EVENT_TYPE_CATEGORY[input.type];
}

/** 일정(날짜·시간·구간)을 비교할 수 있는 글로 바꿉니다. */
export function scheduleFingerprint(
  days: Array<{
    date: string;
    startTime: string;
    endTime: string;
    segments: Array<{ label: string; startTime: string; endTime: string }>;
  }>,
): string {
  return JSON.stringify(
    [...days]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => [d.date, d.startTime, d.endTime, d.segments.map((s) => [s.label, s.startTime, s.endTime])]),
  );
}
