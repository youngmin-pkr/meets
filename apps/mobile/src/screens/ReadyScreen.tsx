/** 준비 완료. 알림 권한은 여기서 한 번만 묻습니다. */
import { useState } from 'react';
import { Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api, type Me } from '../api';
import { colors } from '../theme';
import { Body, Card, ErrorText, Page, PrimaryButton, Title } from '../ui';

export function ReadyScreen(props: { me: Me; onDone: (me: Me) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function choose(wantsNotifications: boolean) {
    setError(null);
    setLoading(true);
    try {
      let granted = false;
      if (wantsNotifications) {
        const result = await Notifications.requestPermissionsAsync();
        granted = result.granted;
      }
      props.onDone(await api.setNotificationChoice(granted));
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page>
      <Title>{`${props.me.nickname ?? ''}님, 준비됐어요`}</Title>
      <Body>이제 같이 갈 행사를 골라 볼까요?</Body>
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '900' }}>알림을 켤까요?</Text>
        <Body>제안이 오거나 약속 전날 확인할 때만 알려 드려요. 같은 일로 여러 번 보내지 않아요.</Body>
        <View style={{ gap: 8 }}>
          <PrimaryButton dark label="알림 켜기" onPress={() => choose(true)} loading={loading} />
          <PrimaryButton label="나중에" onPress={() => choose(false)} disabled={loading} />
        </View>
      </Card>
      <View style={{ gap: 6, padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
        <Text style={{ fontSize: 12, fontWeight: '700' }}>처음 만나기 전에</Text>
        <Body>{'공개된 장소에서 만나요.\n연락처는 앱 안에서 교환하지 않아도 돼요.\n불편하면 언제든 도움 요청을 쓸 수 있어요.'}</Body>
      </View>
      <ErrorText message={error} />
    </Page>
  );
}
