/** 8단계 테스트 도우미: 공연(또는 굿즈 줄) 구간 약속을 만들고 둘 다 전날 확인까지 마친 상태로 돌려줍니다. */
import type { INestApplication } from '@nestjs/common';
import { auth, http } from './helpers';
import { fixtures, kst } from './appointment-fixtures';

export { kst };

// 같은 앱에서는 도우미 하나를 계속 써야 예약 번호가 겹치지 않습니다.
const cache = new WeakMap<object, ReturnType<typeof fixtures>>();

export async function appoint2(
  app: INestApplication,
  clock: { current: Date },
  opts: { people?: [string, string]; seg?: 0 | 1; skipClock?: boolean; ev?: Awaited<ReturnType<ReturnType<typeof fixtures>['createEvent']>> } = {},
) {
  const fx = cache.get(app) ?? fixtures(app);
  cache.set(app, fx);
  const [pa, pb] = opts.people ?? ['a', 'b'];
  const before = clock.current;
  clock.current = kst('2026-11-07T12:00:00');
  let ev = opts.ev;
  const members = [];
  if (!ev) {
    const made = await fx.setup([pa, pb]);
    ev = made.ev;
    members.push(...made.members);
  } else {
    for (const p of [pa, pb]) {
      const m = await fx.member(p);
      await fx.ready(m, ev);
      members.push(m);
    }
  }
  const [a, b] = members;
  const id = await fx.appoint(a, b, ev, 0, opts.seg ?? 1);
  if (!opts.skipClock) {
    clock.current = kst('2026-12-11T18:00:00');
    for (const m of [a, b]) await http(app).post(`/appointments/${id}/confirm`).set(auth(m.token)).send({}).expect(200);
  }
  if (opts.skipClock) clock.current = before; // 다른 약속을 만드느라 시계를 되돌렸다면 원래대로
  return { id, a, b, ev };
}
