/** 시간 고르기 메뉴에 보여 줄 시간 목록 */
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** 고를 수 있는 시간 목록 (30분 단위, 지금 값이 목록에 없으면 함께 넣어 줍니다) */
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function timeOptions(min: string, max: string, current: string): string[] {
  const list: number[] = [];
  for (let m = toMin(min); m <= toMin(max); m += 30) list.push(m);
  const cur = toMin(current);
  if (!list.includes(cur)) list.push(cur);
  return list.sort((a, b) => a - b).map(toTime);
}

