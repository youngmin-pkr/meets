/**
 * 약속에서 나를 뺀 사람들의 순서: 내가 만나는 상대 쪽(일행이 아닌 쪽) 먼저, 그다음 같은 일행. 같은 쪽 안에서는 사용자 번호 순.
 * 1:1이면 상대 한 명뿐이라 달라지는 것이 없습니다. (화면의 '대표 상대'는 이 순서의 첫 사람)
 */
export function orderedOthers<T extends { userId: string; side: string; leftAt?: Date | null }>(participants: T[], me: string, opts: { includeLeft?: boolean } = {}): T[] {
  const mine = participants.find((p) => p.userId === me);
  const mySide = mine?.side ?? 'A';
  return participants
    .filter((p) => p.userId !== me && (opts.includeLeft || !p.leftAt))
    .sort((x, y) => Number(x.side === mySide) - Number(y.side === mySide) || x.userId.localeCompare(y.userId));
}
