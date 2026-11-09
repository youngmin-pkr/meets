/** 행사 그림 카드의 색과 도형을 고르는 규칙 (화면 코드와 분리해서 테스트합니다) */
import type { EventType } from '@meets/shared';
import { colors } from './theme';

export interface Palette {
  bg: string;
  shape: string;
  accent: string;
  text: string;
}

/** 행사 종류별 색 (시안의 색만 사용) */
export const EVENT_ART_PALETTES: Record<EventType, Palette> = {
  CONCERT: { bg: colors.ink, shape: colors.primary, accent: colors.lime, text: colors.white },
  FESTIVAL: { bg: colors.primary, shape: colors.lime, accent: colors.ink, text: colors.white },
  EXHIBITION: { bg: colors.lime, shape: colors.ink, accent: colors.white, text: colors.ink },
  POPUP: { bg: colors.warnBg, shape: colors.primary, accent: colors.ink, text: colors.ink },
  EXPO: { bg: colors.white, shape: colors.ink, accent: colors.primary, text: colors.ink },
};

/** 행사 이름으로 도형 배치를 고릅니다. (같은 행사는 항상 같은 그림, 어느 기기에서나 같음) */
export function artVariant(key: string): number {
  let h = 2166136261;
  for (const ch of key) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 3;
}

