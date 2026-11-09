/**
 * 개발·데모용 예시 행사 (모두 지어낸 이름이고, 링크는 시험용 주소 example.com입니다)
 * 날짜는 오늘을 기준으로 계산해서 항상 앞으로 열릴 행사가 되게 합니다.
 */
import type { CalendarDate } from './age';
import type { EventCategory, EventType } from './events';

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
    {
      // 내일 열리는 행사. 데모에서 '전날 확인'을 바로 해 볼 수 있도록 예시 약속이 이 행사로 잡혀 있습니다.
      name: '테스트 아티스트 생일 카페',
      type: 'POPUP',
      venue: '테스트 카페 거리',
      officialUrl: 'https://example.com/test-artist-birthday-cafe',
      ticketRequired: false,
      days: [
        {
          date: addDays(today, 1),
          startTime: '11:00',
          endTime: '20:00',
          segments: [
            { label: '오전 입장', startTime: '11:00', endTime: '14:00' },
            { label: '오후 입장', startTime: '14:00', endTime: '18:00' },
          ],
        },
      ],
      meetingSpots: [{ name: '테스트 카페 거리 입구 안내판', isPublicPlace: true }],
    },
  ];
}

/**
 * 개발·데모용 예시 사용자 (모두 지어낸 별명). sampleEvents()의 순서(index)를 기준으로 일정을 정합니다.
 * plans: [행사 index, 고를 날 index 목록, 도착, 귀가, 같이할 구간 index 목록]
 */
export interface SamplePerson {
  key: string;
  nickname: string;
  avatarColor: 'ink' | 'red' | 'gray' | 'green';
  gender: 'M' | 'F';
  age: number;
  tempoAnswers: [1 | 2 | 3, 1 | 2 | 3, 1 | 2 | 3];
  /** [공연 질문, 전시 질문, 함께 즐길 때 질문] — 행사 종류에 맞는 두 개를 sampleImmersionAnswers()로 꺼내 씁니다 */
  immersionAnswers: [1 | 2 | 3, 1 | 2 | 3, 1 | 2 | 3];
  mustGender: 'ANY' | 'SAME';
  mustAge: 'ANY' | 'WITHIN_3' | 'WITHIN_5';
  promises: Array<'PUNCTUAL' | 'PHOTO_CONSENT' | 'NO_ALCOHOL_SMOKING' | 'IN_APP_CONTACT_ONLY'>;
  /** 샘플 팬덤 이름 중 고른 것 */
  fandoms: string[];
  fandomPublic: boolean;
  /** 쌓인 신뢰(4단계)를 가진 예시 사용자 (데모에서 후보 카드의 '쌓인 신뢰' 표시를 보여 주려고) */
  trusted?: boolean;
  /** ticket: 티켓 인증(VERIFIED, 고른 날 모두 입장 가능) / 참석 예정(PLANNED, 티켓이 필요 없는 행사만) */
  plans: Array<{ event: number; days: number[]; arrive: string; leave: string; together: number[]; ticket?: 'VERIFIED' | 'PLANNED' }>;
}

export const SAMPLE_PEOPLE: SamplePerson[] = [
  {
    key: 'sky', nickname: '하늘', avatarColor: 'ink', gender: 'F', age: 26,
    tempoAnswers: [2, 1, 2], immersionAnswers: [2, 2, 2], mustGender: 'ANY', mustAge: 'ANY',
    promises: ['PUNCTUAL', 'PHOTO_CONSENT', 'IN_APP_CONTACT_ONLY'], fandoms: ['테스트 밴드'], fandomPublic: true, trusted: true,
    plans: [
      { event: 0, days: [0], arrive: '15:00', leave: '21:00', together: [0, 1, 2], ticket: 'VERIFIED' },
      { event: 3, days: [0, 2], arrive: '12:00', leave: '22:00', together: [0, 1] },
    ],
  },
  {
    key: 'jiwoo', nickname: '지우', avatarColor: 'green', gender: 'F', age: 24,
    tempoAnswers: [2, 2, 2], immersionAnswers: [3, 2, 2], mustGender: 'ANY', mustAge: 'ANY',
    promises: ['PUNCTUAL', 'PHOTO_CONSENT'], fandoms: [], fandomPublic: false,
    plans: [
      { event: 0, days: [0], arrive: '17:00', leave: '21:00', together: [1, 2] },
      { event: 1, days: [0, 1], arrive: '10:30', leave: '17:00', together: [0, 1], ticket: 'PLANNED' },
    ],
  },
  {
    key: 'mint', nickname: '민트', avatarColor: 'red', gender: 'M', age: 29,
    tempoAnswers: [3, 2, 2], immersionAnswers: [1, 2, 1], mustGender: 'ANY', mustAge: 'ANY',
    promises: ['PUNCTUAL', 'PHOTO_CONSENT', 'NO_ALCOHOL_SMOKING', 'IN_APP_CONTACT_ONLY'], fandoms: ['테스트 밴드', '테스트 페스티벌'], fandomPublic: false,
    plans: [
      { event: 0, days: [0], arrive: '15:00', leave: '18:00', together: [0, 1], ticket: 'VERIFIED' },
      { event: 3, days: [0, 1, 2], arrive: '12:00', leave: '22:00', together: [0, 1] },
    ],
  },
  {
    key: 'dal', nickname: '달빛', avatarColor: 'gray', gender: 'F', age: 31,
    tempoAnswers: [1, 1, 1], immersionAnswers: [2, 3, 2], mustGender: 'SAME', mustAge: 'WITHIN_5',
    promises: ['PUNCTUAL'], fandoms: ['테스트 전시 시리즈'], fandomPublic: true,
    plans: [
      { event: 2, days: [0, 1], arrive: '10:00', leave: '16:00', together: [0], ticket: 'VERIFIED' },
      { event: 1, days: [2], arrive: '13:00', leave: '20:00', together: [1] },
    ],
  },
  {
    key: 'bom', nickname: '봄비', avatarColor: 'green', gender: 'M', age: 23,
    tempoAnswers: [3, 3, 3], immersionAnswers: [3, 1, 3], mustGender: 'ANY', mustAge: 'WITHIN_5',
    promises: [], fandoms: ['테스트 페스티벌'], fandomPublic: true,
    plans: [
      { event: 3, days: [0, 1, 2], arrive: '12:00', leave: '22:00', together: [0, 1], ticket: 'VERIFIED' },
      { event: 0, days: [0], arrive: '15:00', leave: '21:00', together: [0, 1, 2] },
    ],
  },
  {
    key: 'nuri', nickname: '누리', avatarColor: 'ink', gender: 'F', age: 27,
    tempoAnswers: [2, 2, 3], immersionAnswers: [2, 2, 2], mustGender: 'ANY', mustAge: 'ANY',
    promises: ['PUNCTUAL', 'PHOTO_CONSENT'], fandoms: ['테스트 아티스트 A'], fandomPublic: false,
    plans: [
      { event: 1, days: [0], arrive: '10:30', leave: '20:00', together: [0, 1], ticket: 'PLANNED' },
      { event: 2, days: [0], arrive: '10:00', leave: '19:00', together: [0] },
      { event: 0, days: [0], arrive: '16:00', leave: '21:00', together: [2] },
    ],
  },
  {
    key: 'seol', nickname: '설레임', avatarColor: 'red', gender: 'F', age: 25,
    tempoAnswers: [2, 3, 2], immersionAnswers: [2, 3, 1], mustGender: 'ANY', mustAge: 'ANY',
    promises: ['PUNCTUAL', 'PHOTO_CONSENT', 'IN_APP_CONTACT_ONLY'], fandoms: [], fandomPublic: false,
    plans: [
      { event: 2, days: [1, 2], arrive: '10:00', leave: '19:00', together: [0] },
      { event: 3, days: [1], arrive: '12:00', leave: '20:00', together: [0] },
    ],
  },
];

/** 예시 사용자의 몰입도 답 중 행사 종류에 맞는 두 개 */
export function sampleImmersionAnswers(p: SamplePerson, category: EventCategory): Array<1 | 2 | 3> {
  const [q4, q5, q6] = p.immersionAnswers;
  return category === 'PERFORMANCE' ? [q4, q6] : [q5, q6];
}
