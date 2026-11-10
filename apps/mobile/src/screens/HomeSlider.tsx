/**
 * 홈 맨 위 넘기는 이미지 (첫 장은 서비스 안내, 다음부터는 곧 열리는 행사) (2026-11-09 사용자 확인)
 */
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { describeEventDateRange, type EventSummary } from '@meets/shared';
import { EventArt } from '../EventArt';
import { colors } from '../theme';
import { keepWords, swipeGuardProps } from '../ui';

const HEIGHT = 196;

export function HomeSlider(props: { events: EventSummary[]; onOpenEvent: (e: EventSummary) => void; onIntro: () => void }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const count = props.events.length + 1;

  function go(i: number) {
    setIndex(i);
    scroll.current?.scrollTo({ x: i * width, animated: true });
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: 10 }}>
      <View style={{ height: HEIGHT, borderRadius: 18, overflow: 'hidden' }} {...swipeGuardProps}>
        {width > 0 ? (
          <ScrollView
            ref={scroll}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            <Pressable
              onPress={props.onIntro}
              accessibilityRole="button"
              accessibilityLabel="연락처 없이도 만날 수 있어요. 공개된 장소에서, 약속한 구간만 함께해요. 행사 둘러보기"
              style={{ width, height: HEIGHT, padding: 22, justifyContent: 'space-between', backgroundColor: colors.ink }}
            >
              <View style={{ position: 'absolute', right: -40, bottom: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.primary }} />
              <View style={{ position: 'absolute', right: 34, top: 26, width: 46, height: 46, borderRadius: 23, backgroundColor: colors.lime }} />
              <Text style={{ fontSize: 12, fontWeight: '900', color: colors.lime }}>처음이라면</Text>
              <View style={{ gap: 6 }}>
                <Text style={[{ fontSize: 24, lineHeight: 31, fontWeight: '900', color: colors.white }, keepWords]}>{'연락처 없이도\n만날 수 있어요'}</Text>
                <Text style={[{ fontSize: 13, color: colors.white }, keepWords]}>공개된 장소에서, 약속한 구간만 함께해요</Text>
              </View>
            </Pressable>
            {props.events.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => props.onOpenEvent(e)}
                accessibilityRole="button"
                accessibilityLabel={`곧 열리는 행사: ${e.name}, ${describeEventDateRange(e.days.map((d) => d.date))}, ${e.venue}`}
                style={{ width, height: HEIGHT }}
              >
                <EventArt event={e} width={width} height={HEIGHT - 78} radius={0} showDate />
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingTop: 12, backgroundColor: colors.ink, gap: 2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: colors.lime }}>곧 열리는 행사</Text>
                  <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '900', color: colors.white }}>{e.name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: colors.white }}>{`${describeEventDateRange(e.days.map((d) => d.date))} · ${e.venue}`}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {Array.from({ length: count }, (_, i) => (
          <Pressable
            key={i}
            onPress={() => go(i)}
            accessibilityRole="button"
            accessibilityLabel={`${count}장 중 ${i + 1}번째 보기`}
            accessibilityState={{ selected: i === index }}
            hitSlop={8}
            style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.ink : colors.border }}
          />
        ))}
      </View>
    </View>
  );
}
