/**
 * 테스트용 본인 확인의 생년월일 입력 읽기
 *
 * 받는 형식: 000501(6자리), 20000501(8자리), 2000-05-01, 2000.05.01, 2000 05 01
 * 6자리는 앞 두 자리를 연도로 보고, 올해보다 미래가 되면 1900년대로 봅니다.
 * (예: 올해가 2026년이면 260101 → 2026년, 270101 → 1927년)
 * 실제 본인 확인 업체가 붙으면 업체가 생년월일을 주므로 이 입력은 사라집니다.
 */
import { parseCalendarDate } from '@meets/shared';

export function parseBirthInput(text: string, currentYear: number): string | null {
  const digits = text.replace(/[\s.\-/]/g, '');
  if (!/^\d+$/.test(digits)) return null;

  let iso: string;
  if (digits.length === 8) {
    iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  } else if (digits.length === 6) {
    const yy = Number(digits.slice(0, 2));
    const century = 2000 + yy > currentYear ? 1900 : 2000;
    iso = `${century + yy}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
  } else {
    return null;
  }
  return parseCalendarDate(iso) ? iso : null;
}

/** '2000-05-01' → '2000년 5월 1일' */
export function describeIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}
