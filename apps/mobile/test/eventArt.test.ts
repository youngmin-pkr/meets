import { EVENT_TYPES, sampleEvents } from '@meets/shared';
import { artVariant, EVENT_ART_PALETTES } from '../src/eventArtRules';

describe('행사 그림 카드', () => {
  test('모든 행사 종류에 색이 있다', () => {
    for (const t of EVENT_TYPES) expect(EVENT_ART_PALETTES[t]).toBeDefined();
  });

  test('같은 행사는 항상 같은 그림, 도형은 3가지 중 하나', () => {
    for (const e of sampleEvents({ year: 2026, month: 11, day: 9 })) {
      const v = artVariant(e.name);
      expect(v).toBe(artVariant(e.name));
      expect([0, 1, 2]).toContain(v);
    }
  });
});
