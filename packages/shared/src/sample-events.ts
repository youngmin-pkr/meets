/**
 * 개발·데모용 예시 행사 (모두 지어낸 이름이고, 링크는 시험용 주소 example.com입니다)
 * 날짜는 오늘을 기준으로 계산해서 항상 앞으로 열릴 행사가 되게 합니다.
 */
import type { CalendarDate } from './age';
import type { EventType } from './events';

export interface SampleEvent {
  name: string;
  type: EventType;
  venue: string;
  officialUrl: string;
  ticketRequired: boolean;
  days: Array<{
    date: string;
    startTime: string;
    endTime: string;
    segments: Array<{ label: string; startTime: string; endTime: string }>;
  }>;
  meetingSpots: Array<{ name: string; isPublicPlace: boolean }>;
}

function addDays(today: CalendarDate, n: number): string {
  const d = new Date(Date.UTC(today.year, today.month - 1, today.day + n));
  return d.toISOString().slice(0, 10);
}

export function sampleEvents(today: CalendarDate): SampleEvent[] {
  const concertDay = addDays(today, 12);
  return [
    {
      name: '테스트 밴드 단독 콘서트',
      type: 'CONCERT',
      venue: '테스트 아레나',
      officialUrl: 'https://example.com/test-band-live',
      ticketRequired: true,
      days: [
        {
          date: concertDay,
          startTime: '15:00',
          endTime: '21:00',
          segments: [
            { label: '굿즈 줄', startTime: '15:00', endTime: '17:00' },
            { label: '입장 대기', startTime: '17:00', endTime: '18:00' },
            { label: '공연', startTime: '18:00', endTime: '20:30' },
          ],
        },
      ],
      meetingSpots: [
        { name: '테스트 아레나 정문 안내판 앞', isPublicPlace: true },
        { name: '굿즈 부스 옆 광장', isPublicPlace: true },
      ],
    },
    {
      name: '테스트 캐릭터 팝업스토어',
      type: 'POPUP',
      venue: '테스트 백화점 1층',
      officialUrl: 'https://example.com/test-character-popup',
      ticketRequired: false,
      days: [0, 1, 2, 3, 4].map((i) => ({
        date: addDays(today, 13 + i),
        startTime: '10:30',
        endTime: '20:00',
        segments: [
          { label: '오전 입장', startTime: '10:30', endTime: '13:00' },
          { label: '오후 입장', startTime: '13:00', endTime: '17:00' },
        ],
      })),
      meetingSpots: [{ name: '테스트 백화점 1층 정문', isPublicPlace: true }],
    },
    {
      name: '테스트 일러스트 기획전',
      type: 'EXHIBITION',
      venue: '테스트 미술관',
      officialUrl: 'https://example.com/test-illust-exhibition',
      ticketRequired: true,
      days: [0, 1, 2].map((i) => ({
        date: addDays(today, 19 + i),
        startTime: '10:00',
        endTime: '19:00',
        segments: [{ label: '전시 관람', startTime: '11:00', endTime: '13:00' }],
      })),
      meetingSpots: [{ name: '테스트 미술관 매표소 앞', isPublicPlace: true }],
    },
    {
      name: '테스트 록 페스티벌',
      type: 'FESTIVAL',
      venue: '테스트 공원 잔디마당',
      officialUrl: 'https://example.com/test-rock-festival',
      ticketRequired: true,
      days: [0, 1, 2].map((i) => ({
        date: addDays(today, 26 + i),
        startTime: '12:00',
        endTime: '22:00',
        segments: [
          { label: '낮 무대', startTime: '12:00', endTime: '17:00' },
          { label: '헤드라이너', startTime: '19:30', endTime: '21:30' },
        ],
      })),
      meetingSpots: [
        { name: '테스트 공원 입구 매표소', isPublicPlace: true },
        { name: '푸드트럭 존', isPublicPlace: true },
      ],
    },
  ];
}
