/**
 * 행사 선택 (시안: 행사 선택)
 * 포스터·사진 없이 사실 정보(날짜, 유형, 이름, 장소)만 보여 줍니다.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  describeEventDate,
  describeEventDateRange,
  EVENT_CATEGORY_LABELS,
  EVENT_TYPE_LABELS,
  type EventCategory,
  type EventSummary,
} from '@meets/shared';
import { api } from '../api';
import { colors } from '../theme';
import { Body, ErrorText, keepWords, Page, PrimaryButton, StepHeader, styles, Title } from '../ui';

export function EventListScreen(props: { onNext: (event: EventSummary) => void; onReport: () => void; flowError?: string | null }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EventCategory | undefined>(undefined);
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [selected, setSelected] = useState<EventSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const chips: Array<{ key: EventCategory | undefined; label: string }> = [
    { key: undefined, label: '전체' },
    { key: 'PERFORMANCE', label: EVENT_CATEGORY_LABELS.PERFORMANCE },
    { key: 'EXHIBITION', label: EVENT_CATEGORY_LABELS.EXHIBITION },
  ];

  return (
    <Page
      footer={
        <PrimaryButton label="다음" onPress={() => selected && props.onNext(selected)} disabled={!selected} />
      }
    >
      <StepHeader step={1} total={5} />
      <Title>{'어떤 행사에\n함께 가고 싶으세요?'}</Title>
      <Body>행사를 고르면, 같은 행사에 가는 사람들만 보여드려요.</Body>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="행사·장소 검색"
        accessibilityLabel="행사 또는 장소 검색"
        style={[styles.input, { borderWidth: 1.5, borderColor: colors.border }]}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chips.map((c) => {
          const on = c.key === category;
          return (
            <Pressable
              key={c.label}
              onPress={() => setCategory(c.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: 14,
                borderRadius: 22,
                backgroundColor: on ? colors.ink : colors.white,
                borderWidth: on ? 0 : 1.5,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? colors.white : colors.ink }}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 10 }}>
        {events === null && !error ? <Body>불러오는 중이에요…</Body> : null}
        {events?.length === 0 ? <Body>조건에 맞는 행사가 없어요.</Body> : null}
        {events?.map((e) => (
          <EventCard key={e.id} event={e} selected={selected?.id === e.id} onPress={() => setSelected(e)} />
        ))}
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

function EventCard(props: { event: EventSummary; selected: boolean; onPress: () => void }) {
  const { event, selected } = props;
  const first = describeEventDate(event.days[0].date);
  const multi = event.days.length > 1;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${event.name}, ${describeEventDateRange(event.days.map((d) => d.date))}, ${event.venue}`}
      style={{
        flexDirection: 'row',
        borderRadius: 14,
        borderWidth: selected ? 2 : 1.5,
        borderColor: selected ? colors.ink : colors.border,
        backgroundColor: selected ? colors.warnBg : colors.white,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: 72,
          paddingVertical: 14,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          borderRightWidth: 2,
          borderStyle: 'dashed',
          borderRightColor: selected ? colors.ink : colors.border,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: selected ? colors.ink : colors.muted }}>
          {`${first.month}월`}
        </Text>
        <Text style={{ fontSize: 26, fontWeight: '900', color: colors.ink }}>{first.day}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: selected ? colors.ink : colors.muted }}>
          {first.weekday}
        </Text>
      </View>
      <View style={{ flex: 1, padding: 14, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{EVENT_TYPE_LABELS[event.type]}</Text>
          {event.changed ? (
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.white, backgroundColor: colors.ink, paddingHorizontal: 6, borderRadius: 4 }}>
              일정 변경
            </Text>
          ) : null}
        </View>
        <Text style={[{ fontSize: 15, fontWeight: '700', lineHeight: 20, color: colors.ink }, keepWords]}>{event.name}</Text>
        <Text style={{ fontSize: 12, color: colors.body }}>{event.venue}</Text>
        {multi ? (
          <Text style={{ fontSize: 12, color: colors.body }}>{describeEventDateRange(event.days.map((d) => d.date))}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
