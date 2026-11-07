/**
 * 행사 관련 공통 규칙 (정리문서 2장 "행사")
 *
 * - 행사는 예매처 연동 없이 운영팀이 등록하고, 사용자 제보를 검수합니다.
 * - 공식 링크는 반드시 있어야 하고, 개인 모임은 등록하지 않습니다.
 * - 포스터·사진은 쓰지 않고 사실 정보만 보여 줍니다.
 */
import { detectContact } from './contact-detector';

/** 화면의 분류 칩 (콘서트·페스티벌 / 전시·팝업·박람회) */
export type EventCategory = 'PERFORMANCE' | 'EXHIBITION';

/** 세부 유형 */
export type EventType = 'CONCERT' | 'FESTIVAL' | 'EXHIBITION' | 'POPUP' | 'EXPO';

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  PERFORMANCE: '콘서트·페스티벌',
  EXHIBITION: '전시·팝업·박람회',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  CONCERT: '콘서트',
  FESTIVAL: '페스티벌',
  EXHIBITION: '전시',
  POPUP: '팝업',
  EXPO: '박람회',
};

export const EVENT_TYPE_CATEGORY: Record<EventType, EventCategory> = {
  CONCERT: 'PERFORMANCE',
  FESTIVAL: 'PERFORMANCE',
  EXHIBITION: 'EXHIBITION',
  POPUP: 'EXHIBITION',
  EXPO: 'EXHIBITION',
};

export const EVENT_CATEGORIES = Object.keys(EVENT_CATEGORY_LABELS) as EventCategory[];
export const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];

/** 흔히 붙는 추적용 주소 값. 같은 행사인지 비교할 때 지웁니다. */
const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|ref|igshid|si)$/i;

/**
 * 공식 링크를 비교용 값으로 바꿉니다. 형식이 틀리면 null.
 * 예) https://www.Example.com/show/?utm_source=x#top → example.com/show
 */
export function officialUrlKey(raw: string): string | null {
  // 휴대폰 앱 실행 환경(React Native)의 URL 기능이 일부만 있어서, 직접 나눠서 읽습니다.
  const m = /^(https?):\/\/([^/?#\s]+)([^?#\s]*)(\?[^#\s]*)?(#\S*)?$/i.exec(raw.trim());
  if (!m) return null;
  const host = m[2].toLowerCase().replace(/^www\./, '');
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(host)) return null;
  const hostname = host.replace(/:\d+$/, '');
  if (!hostname.includes('.') || hostname.startsWith('.') || hostname.endsWith('.')) return null;
  const params = (m[4] ?? '')
    .slice(1)
    .split('&')
    .filter((pair) => pair !== '')
    .map((pair) => {
      const i = pair.indexOf('=');
      return i < 0 ? ([pair, ''] as const) : ([pair.slice(0, i), pair.slice(i + 1)] as const);
    })
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${params.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
  const path = m[3].replace(/\/+$/, '');
  return `${host}${path}${query}`;
}

/** 행사 제보 입력 */
export interface EventReportInput {
  category: EventCategory;
  name: string;
  dateText?: string;
  placeText?: string;
  officialUrl: string;
}

export type EventReportProblem =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'OFFICIAL_URL_INVALID'
  | 'TEXT_TOO_LONG'
  | 'CONTAINS_CONTACT';

export const EVENT_REPORT_LIMITS = { nameMax: 80, textMax: 60 } as const;

export const EVENT_REPORT_PROBLEM_MESSAGES: Record<EventReportProblem, string> = {
  NAME_REQUIRED: '행사 이름을 적어 주세요.',
  NAME_TOO_LONG: '행사 이름이 너무 길어요.',
  OFFICIAL_URL_INVALID: '공식 링크를 http:// 또는 https://로 시작하는 주소로 적어 주세요.',
  TEXT_TOO_LONG: '날짜나 장소가 너무 길어요.',
  CONTAINS_CONTACT: '연락처나 SNS 아이디는 적을 수 없어요.',
};

/** '2026-12-13' → { month: 12, day: 13, weekday: '토' } (날짜 문자열만 쓰므로 시간대 영향 없음) */
export function describeEventDate(iso: string): { month: number; day: number; weekday: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { month: m, day: d, weekday };
}

/** 행사 날짜 범위 글: '12.13 (토)' 또는 '12.13 (토) – 12.15 (월)' */
export function describeEventDateRange(dates: string[]): string {
  if (dates.length === 0) return '';
  const sorted = [...dates].sort();
  const fmt = (iso: string) => {
    const { month, day, weekday } = describeEventDate(iso);
    return `${month}.${day} (${weekday})`;
  };
  return sorted.length === 1 ? fmt(sorted[0]) : `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1])}`;
}

/** 사용자에게 보여 주는 행사 요약 (앱·데모 서버 공통 모양) */
export interface EventSummary {
  id: string;
  name: string;
  category: EventCategory;
  type: EventType;
  venue: string;
  officialUrl: string;
  ticketRequired: boolean;
  /** 일정이 바뀐 적이 있는 행사 */
  changed: boolean;
  days: Array<{ id: string; date: string; startTime: string; endTime: string }>;
}

export interface EventDetail extends EventSummary {
  days: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    segments: Array<{ id: string; label: string; startTime: string; endTime: string }>;
  }>;
  meetingSpots: Array<{ id: string; name: string }>;
}

/** 제보 결과 */
export interface EventReportResult {
  /** 이미 같은 공식 링크로 들어온 행사에 합쳐졌는지 */
  merged: boolean;
  /** 합쳐진(또는 새로 만든) 행사의 진행 상황 */
  progress: 'RECEIVED' | 'REVIEWING' | 'REGISTERED' | 'NOT_REGISTERED';
}

/** 제보 입력을 검사합니다. (서버와 데모 서버가 같이 씀) */
export function checkEventReport(
  input: EventReportInput,
): { ok: true; urlKey: string } | { ok: false; problem: EventReportProblem } {
  const name = input.name.trim();
  if (!name) return { ok: false, problem: 'NAME_REQUIRED' };
  if ([...name].length > EVENT_REPORT_LIMITS.nameMax) return { ok: false, problem: 'NAME_TOO_LONG' };
  const extras = [input.dateText ?? '', input.placeText ?? ''];
  if (extras.some((t) => [...t.trim()].length > EVENT_REPORT_LIMITS.textMax)) {
    return { ok: false, problem: 'TEXT_TOO_LONG' };
  }
  const urlKey = officialUrlKey(input.officialUrl);
  if (!urlKey) return { ok: false, problem: 'OFFICIAL_URL_INVALID' };
  // 이름·장소에 연락처를 적는 것은 막습니다. (공식 링크는 주소라서 검사하지 않음)
  if ([name, input.placeText ?? ''].some((t) => detectContact(t).detected)) {
    return { ok: false, problem: 'CONTAINS_CONTACT' };
  }
  return { ok: true, urlKey };
}
