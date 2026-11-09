/**
 * 행사 탭 (아래쪽 메뉴 '행사')
 * 사진 대신 그림 카드와 사실 정보(날짜, 유형, 이름, 장소)를 보여 줍니다. (정리문서 2장 "행사")
 * 행사를 누르면 같이 갈 사람 찾기(일정 입력)로 이어집니다.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  describeEventDateRange,
  EVENT_CATEGORY_LABELS,
  EVENT_TYPE_LABELS,
  type EventCategory,
  type EventSummary,
} from '@meets/shared';
import { api } from '../api';
import { EventArt } from '../EventArt';
import { colors } from '../theme';
import { Body, ErrorText, keepWords, Page, styles, TabBar, Title, type Tab } from '../ui';

const CATEGORIES: Array<{ key: EventCategory | undefined; label: string }> = [
  { key: undefined, label: '전체' },
  { key: 'PERFORMANCE', label: EVENT_CATEGORY_LABELS.PERFORMANCE },
  { key: 'EXHIBITION', label: EVENT_CATEGORY_LABELS.EXHIBITION },
];

export function EventListScreen(props: {
  /** 홈에서 종류를 골라 들어오면 그 종류만 보여 줍니다 */
  initialCategory?: EventCategory;
  /** 홈 검색창에서 들어오면 검색칸에 바로 커서를 둡니다 */
  focusSearch?: boolean;
  onNext: (event: EventSummary) => void;
  onReport: () => void;
  onTab: (t: Tab) => void;
  flowError?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EventCategory | undefined>(props.initialCategory);
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatUnread, setChatUnread] = useState(0);

  useEffect(() => {
    api.listChats().then((c) => setChatUnread(c.reduce((n, x) => n + x.unread, 0)), () => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .listEvents({ q: query, category })
        .then((list) => {
          if (cancelled) return;
          setEvents(list);
          setError(null);
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, category]);

  return (
    <Page tabBar={<TabBar current="EVENTS" onChange={props.onTab} chatUnread={chatUnread} />}>
      <Title>행사</Title>
      <Body>행사를 고르면, 같은 행사에 가는 사람들만 보여드려요.</Body>

      <TextInput
        value={query}
        onChangeText={setQuery}
        autoFocus={props.focusSearch}
        placeholder="행사·장소 검색"
        accessibilityLabel="행사 또는 장소 검색"
        style={[styles.input, { borderWidth: 1.5, borderColor: colors.border }]}
      />

      {/* 종류 탭 (시안 2의 위쪽 탭 모양) */}
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.border }}>
        {CATEGORIES.map((c) => {
          const on = c.key === category;
          return (
            <Pressable
              key={c.label}
              onPress={() => setCategory(c.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flex: c.key ? 1.4 : 0.8, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: on ? colors.ink : 'transparent' }}
            >
              <Text style={[{ fontSize: 13, fontWeight: on ? '900' : '600', color: on ? colors.white : colors.ink, textAlign: 'center' }, keepWords]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 12 }}>
        {events === null && !error ? <Body>불러오는 중이에요…</Body> : null}
        {events?.length === 0 ? <Body>조건에 맞는 행사가 없어요.</Body> : null}
        {events?.map((e) => <EventRow key={e.id} event={e} onPress={() => props.onNext(e)} />)}
      </View>
      <ErrorText message={error ?? props.flowError ?? null} />

      <Pressable
        onPress={props.onReport}
        accessibilityRole="button"
        style={{
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: colors.muted,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>찾는 행사가 없나요?</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>제보하기 ›</Text>
      </Pressable>
    </Page>
  );
}

function EventRow(props: { event: EventSummary; onPress: () => void }) {
  const { event } = props;
  const range = describeEventDateRange(event.days.map((d) => d.date));
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.name}, ${EVENT_TYPE_LABELS[event.type]}, ${range}, ${event.venue}. 같이 갈 사람 찾기`}
      style={{ flexDirection: 'row', gap: 14, padding: 12, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border }}
    >
      <EventArt event={event} width={92} height={92} />
      <View style={{ flex: 1, gap: 3, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{EVENT_TYPE_LABELS[event.type]}</Text>
          {event.changed ? (
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.white, backgroundColor: colors.ink, paddingHorizontal: 6, borderRadius: 4 }}>일정 변경</Text>
          ) : null}
        </View>
        <Text style={[{ fontSize: 15, fontWeight: '900', lineHeight: 20, color: colors.ink }, keepWords]} numberOfLines={2}>
          {event.name}
        </Text>
        <Text style={{ fontSize: 12, color: colors.body }} numberOfLines={1}>{`${range} · ${event.venue}`}</Text>
        <View style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, height: 26, justifyContent: 'center', borderRadius: 13, backgroundColor: colors.ink }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.white }}>같이 갈 사람 찾기</Text>
        </View>
      </View>
    </Pressable>
  );
}
