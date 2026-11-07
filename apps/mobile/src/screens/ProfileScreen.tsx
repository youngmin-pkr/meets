/** 별명과 색 정하기. 규칙 검사는 서버가 최종으로 하고, 화면은 미리 알려 주기만 합니다. */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { avatarInitial, checkNickname, nicknameLength, NICKNAME_PROBLEM_MESSAGES } from '@meets/shared';
import { api, type Me, type SignupConfig } from '../api';
import { colors } from '../theme';
import { Body, ErrorText, Page, PrimaryButton, styles, Title, TopBar } from '../ui';

export function ProfileScreen(props: { config: SignupConfig; onDone: (me: Me) => void }) {
  const { config } = props;
  const colorKeys = Object.keys(config.avatarColors);
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState(colorKeys[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const limits = { minLength: config.nicknameMinLength, maxLength: config.nicknameMaxLength };
  const check = checkNickname(nickname, limits);
  const hint = nickname && !check.ok ? NICKNAME_PROBLEM_MESSAGES[check.problem] : null;

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      props.onDone(await api.updateProfile(nickname, color));
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page footer={<PrimaryButton label="다음" onPress={submit} disabled={!check.ok} loading={loading} />}>
      <TopBar label="가입 2/3" />
      <Title>뭐라고 불러 드릴까요?</Title>
      <Body>다른 사람에게는 이 별명만 보여요. 실명은 공개되지 않아요.</Body>

      <View style={{ alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: config.avatarColors[color],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 36, fontWeight: '900', color: colors.lime }}>
            {nickname ? avatarInitial(nickname.trim()) : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {colorKeys.map((key) => (
            <Pressable
              key={key}
              onPress={() => setColor(key)}
              accessibilityRole="radio"
              accessibilityLabel={`색 ${key}`}
              accessibilityState={{ selected: color === key }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: config.avatarColors[key],
                borderWidth: color === key ? 3 : 0,
                borderColor: colors.lime,
              }}
            />
          ))}
        </View>
        <Text style={styles.small}>사진 대신 첫 글자와 색깔로 표시돼요</Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>별명</Text>
        <TextInput value={nickname} onChangeText={setNickname} style={styles.input} autoCorrect={false} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Text style={[styles.small, { flex: 1 }]}>
            {`${config.nicknameMinLength}~${config.nicknameMaxLength}자 · 특수문자, 연락처, SNS 아이디는 쓸 수 없어요`}
          </Text>
          <Text style={styles.small}>{`${nicknameLength(nickname.trim())}/${config.nicknameMaxLength}`}</Text>
        </View>
        <ErrorText message={error ?? hint} />
      </View>
    </Page>
  );
}
