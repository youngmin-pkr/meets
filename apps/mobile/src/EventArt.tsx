/**
 * 행사 그림 카드
 *
 * 정리 문서 2장 "포스터·사진 미사용, 사실 정보만" 규칙에 따라 사진 대신 그림을 씁니다. (2026-11-09 사용자 확인)
 * 행사 종류별 색과 도형, 그리고 날짜(사실 정보)로 만듭니다. 같은 행사는 항상 같은 그림이 나옵니다.
 * 나중에 사진을 쓰기로 하면 이 컴포넌트만 바꾸면 됩니다.
 */
import { Text, View } from 'react-native';
import { describeEventDate, EVENT_TYPE_LABELS, type EventType } from '@meets/shared';
import { colors } from './theme';

import { artVariant, EVENT_ART_PALETTES } from './eventArtRules';

export function EventArt(props: {
  event: { id: string; name: string; type: EventType; days: Array<{ date: string }> };
  width: number;
  height: number;
  /** 큰 그림(홈 슬라이드)에서는 날짜를 크게 보여 줍니다 */
  showDate?: boolean;
  radius?: number;
}) {
  const { event, width, height } = props;
  const p = EVENT_ART_PALETTES[event.type];
  const v = artVariant(event.name);
  const s = Math.min(width, height);
  const first = event.days[0] ? describeEventDate(event.days[0].date) : null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: props.radius ?? 12, backgroundColor: p.bg, overflow: 'hidden', borderWidth: event.type === 'EXPO' ? 1.5 : 0, borderColor: colors.border }}
    >
      {v === 0 ? (
        <>
          <View style={{ position: 'absolute', width: s * 0.9, height: s * 0.9, borderRadius: s, backgroundColor: p.shape, right: -s * 0.25, bottom: -s * 0.3 }} />
          <View style={{ position: 'absolute', width: s * 0.32, height: s * 0.32, borderRadius: s, backgroundColor: p.accent, right: s * 0.12, top: s * 0.12 }} />
        </>
      ) : v === 1 ? (
        <>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ position: 'absolute', left: -s * 0.2, right: -s * 0.2, height: s * 0.12, top: height * (0.35 + i * 0.2), backgroundColor: i === 1 ? p.accent : p.shape, transform: [{ rotate: '-18deg' }] }} />
          ))}
        </>
      ) : (
        <>
          <View style={{ position: 'absolute', width: s * 0.6, height: s * 0.6, backgroundColor: p.shape, right: -s * 0.08, top: -s * 0.1, transform: [{ rotate: '20deg' }], borderRadius: s * 0.08 }} />
          <View style={{ position: 'absolute', width: s * 0.36, height: s * 0.36, borderRadius: s, borderWidth: s * 0.06, borderColor: p.accent, left: s * 0.1, bottom: s * 0.1 }} />
        </>
      )}
      <View style={{ position: 'absolute', left: Math.max(8, s * 0.1), top: Math.max(8, s * 0.1), gap: 2 }}>
        <Text style={{ fontSize: Math.max(10, s * 0.11), fontWeight: '900', color: p.text, backgroundColor: p.bg, paddingHorizontal: 2 }}>{EVENT_TYPE_LABELS[event.type]}</Text>
        {props.showDate && first ? (
          <Text style={{ fontSize: s * 0.22, fontWeight: '900', color: p.text, backgroundColor: p.bg, paddingHorizontal: 2 }}>{`${first.month}.${first.day}`}</Text>
        ) : null}
      </View>
    </View>
  );
}
