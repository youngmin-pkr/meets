/**
 * 약관 동의 + 휴대폰 본인 확인
 *
 * 지금은 업체가 정해지지 않아 '테스트용 본인 확인' 칸이 보입니다.
 * 업체가 정해지면 이 칸 대신 업체 화면을 띄우고, 받은 결과 토큰을 서버로 보냅니다.
 * 나이는 화면에서 판단하지 않고 서버가 정합니다.
 */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { IdentityResult } from '@meets/shared';
import { api, ApiError, type SignupConfig } from '../api';
import { allRequiredChecked } from '../signupFlow';
import { colors } from '../theme';
import { Body, Card, ErrorText, Page, PrimaryButton, styles, Title, TopBar } from '../ui';

export function VerifyScreen(props: {
  config: SignupConfig;
  mode: 'signup' | 'login';
  onBack: () => void;
  onResult: (result: IdentityResult) => void;
}) {
  const { config } = props;
  // 동의는 사용자가 직접 체크해야 하므로 처음에는 모두 비어 있습니다.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [showTerms, setShowTerms] = useState(props.mode === 'signup');
  const [testPerson, setTestPerson] = useState('');
  const [testBirth, setTestBirth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const termsOk = !showTerms || allRequiredChecked(config.terms, checked);
  const testOk = /^[A-Za-z0-9_-]{1,40}$/.test(testPerson) && /^\d{4}-\d{2}-\d{2}$/.test(testBirth);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const token = `fake:${testPerson}:${testBirth}`;
      const agreed = showTerms
        ? config.terms.filter((t) => checked[t.code]).map((t) => ({ code: t.code, version: t.version }))
        : [];
      props.onResult(await api.verifyIdentity(token, agreed));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TERMS_REQUIRED') {
        // 처음 가입하는 사람이 '이미 계정이 있어요'로 들어온 경우
        setShowTerms(true);
        setError('처음 오셨네요. 약관에 동의해 주세요.');
      } else {
        setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page
      footer={
        <PrimaryButton
          label="휴대폰으로 본인 확인"
          onPress={submit}
          disabled={!termsOk || !testOk}
          loading={loading}
        />
      }
    >
      <TopBar label="가입" onBack={props.onBack} />
      <Title>{'휴대폰으로\n본인 확인을 할게요'}</Title>
      <Body>안전한 만남을 위해 나이대를 확인해요. 나이는 직접 입력하지 않고, 본인 확인 결과로만 정해져요.</Body>
      <Card>
        <Text style={{ fontSize: 13, fontWeight: '700' }}>이렇게 쓰여요</Text>
        <Body>같은 나이대의 사람끼리만 서로 보여요.</Body>
        <Body>나이대에 맞는 안전 규칙이 자동으로 적용돼요.</Body>
        <Body>다른 사용자에게는 이름과 나이가 공개되지 않아요.</Body>
      </Card>

      {showTerms ? (
        <View>
          {config.terms.map((t) => (
            <Pressable
              key={t.code}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: checked[t.code] === true }}
              onPress={() => setChecked((c) => ({ ...c, [t.code]: !c[t.code] }))}
              style={[styles.row, { minHeight: 44 }]}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: colors.primary,
                  backgroundColor: checked[t.code] ? colors.primary : colors.white,
                }}
              />
              <Text style={{ fontSize: 14, color: colors.ink }}>
                {`[${t.title}]에 동의해요${t.required ? ' (필수)' : ''}`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {config.identityProvider === 'fake' ? (
        <View style={{ gap: 8, padding: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>
            테스트용 본인 확인 · 실제 서비스에서는 보이지 않아요
          </Text>
          <Text style={styles.label}>테스트 사용자 번호</Text>
          <TextInput
            value={testPerson}
            onChangeText={setTestPerson}
            placeholder="예: tester1"
            autoCapitalize="none"
            style={styles.input}
          />
          <Text style={styles.label}>생년월일</Text>
          <TextInput
            value={testBirth}
            onChangeText={setTestBirth}
            placeholder="예: 2000-05-01"
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
        </View>
      ) : null}

      <ErrorText message={error} />
    </Page>
  );
}
