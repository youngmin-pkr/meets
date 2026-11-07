/**
 * 고른 행사 확인. 일정·같이 볼 구간 고르기는 3단계(입력 흐름)에서 이어집니다.
 */
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { describeEventDate, EVENT_TYPE_LABELS, type EventDetail, type EventSummary } from '@meets/shared';
import { api } from '../api';
import { colors } from '../theme';
import { Body, Card, ErrorText, keepWords, Page, PrimaryButton, Title, TopBar } from '../ui';

export function EventSelectedScreen(props: { event: EventSummary; onBack: () => void }) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getEvent(props.event.id).then(setDetail, (e: Error) => setError(e.message));
  }, [props.event.id]);

  const e = detail ?? props.event;
  return (
    <Page footer={<PrimaryButton dark label="다른 행사 고르기" onPress={props.onBack} />}>
      <TopBar label="고른 행사" onBack={props.onBack} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
        {EVENT_TYPE_LABELS[e.type]}
        {e.changed ? ' · 일정이 바뀐 행사예요' : ''}
      </Text>
      <Title>{e.name}</Title>
      <Body>{e.venue}</Body>

      <Card>
        <Text style={{ fontSize: 13, fontWeight: '700' }}>날짜와 시간</Text>
        {e.days.map((d) => {
          const { month, day, weekday } = describeEventDate(d.date);
          const segments = detail?.days.find((x) => x.id === d.id)?.segments ?? [];
          return (
            <View key={d.id} style={{ gap: 2 }}>
              <Text style={{ fontSize: 14, color: colors.ink }}>{`${month}월 ${day}일 (${weekday}) ${d.startTime}–${d.endTime}`}</Text>
              {segments.length > 0 ? (
                <Text style={[{ fontSize: 12, color: colors.muted }, keepWords]}>
                  {`같이 볼 수 있는 구간: ${segments.map((s) => `${s.label} ${s.startTime}–${s.endTime}`).join(', ')}`}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Card>

      {detail && detail.meetingSpots.length > 0 ? (
        <Card>
          <Text style={{ fontSize: 13, fontWeight: '700' }}>만날 수 있는 곳 (공개된 장소)</Text>
          {detail.meetingSpots.map((s) => (
            <Body key={s.id}>{s.name}</Body>
          ))}
        </Card>
      ) : null}

      <Card>
        <Body>{e.ticketRequired ? '티켓이 필요한 행사예요.' : '티켓 없이 들어갈 수 있는 행사예요.'}</Body>
        <Pressable onPress={() => Linking.openURL(e.officialUrl)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>공식 안내 보기 ›</Text>
        </Pressable>
      </Card>

      <View style={{ padding: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
        <Body>일정과 같이 볼 구간 고르기는 다음 단계에서 만들어요.</Body>
      </View>
      <ErrorText message={error} />
    </Page>
  );
}
