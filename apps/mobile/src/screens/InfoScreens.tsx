/** 안내만 하는 화면들: 시작, 가입 불가, 청소년 준비 중, 이용할 수 없는 계정, 홈(임시) */
import { Text, View } from 'react-native';
import { colors } from '../theme';
import { Body, Card, Page, PrimaryButton, TextButton, Title, TopBar } from '../ui';

export function WelcomeScreen(props: { onStart: () => void; onLogin: () => void }) {
  return (
    <Page
      footer={
        <>
          <PrimaryButton label="시작하기" onPress={props.onStart} />
          <TextButton label="이미 계정이 있어요" onPress={props.onLogin} />
        </>
      }
    >
      <Title>{'같이 가고,\n원하는 만큼만\n함께해요'}</Title>
      <Body>같은 행사에 가는 사람과 일정, 템포, 몰입도를 맞춰 보고 원하는 구간만 함께해요.</Body>
      <Card>
        {[
          '행사와 일정을 고르고 스타일을 알려 주세요',
          '잘 맞는 후보와 같이 볼 구간만 정해요',
          '공개된 장소에서 만나고, 끝나면 후기를 남겨요',
        ].map((line, i) => (
          <View key={line} style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ fontWeight: '900', color: colors.ink }}>{i + 1}</Text>
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 20, color: colors.ink }}>{line}</Text>
          </View>
        ))}
      </Card>
    </Page>
  );
}

export function UnderMinAgeScreen(props: { signupMinAge: number; onDone: () => void }) {
  return (
    <Page footer={<PrimaryButton dark label="확인했어요" onPress={props.onDone} />}>
      <TopBar label="가입" onBack={props.onDone} />
      <Title>{'아직은\n가입할 수 없어요'}</Title>
      <Body>
        이 서비스는 만 {props.signupMinAge}세 이상부터 이용할 수 있어요. 가입은 완료되지 않았고, 계정은 만들어지지
        않았어요.
      </Body>
      <Card>
        <Text style={{ fontSize: 13, fontWeight: '700' }}>행사에 가고 싶다면</Text>
        <Body>가족이나 아는 친구와 함께 가는 걸 추천해요.</Body>
        <Body>모르는 사람과 만나기 전에는 꼭 보호자에게 알려 주세요.</Body>
      </Card>
    </Page>
  );
}

/**
 * 청소년 확인 결과일 때. 시안에는 청소년 모드 안내 화면이 있지만,
 * 법률 검토가 끝나기 전까지 청소년 가입을 막습니다. (CLAUDE.md 규칙 10)
 */
export function TeenNotYetScreen(props: { onDone: () => void }) {
  return (
    <Page footer={<PrimaryButton dark label="확인했어요" onPress={props.onDone} />}>
      <TopBar label="가입" onBack={props.onDone} />
      <Title>{'청소년은 아직\n이용할 수 없어요'}</Title>
      <Body>
        더 안전하게 쓸 수 있도록 청소년용 기능을 준비하고 있어요. 가입은 완료되지 않았고, 계정은
        만들어지지 않았어요.
      </Body>
    </Page>
  );
}

export function AccountUnavailableScreen(props: { onDone: () => void }) {
  return (
    <Page footer={<PrimaryButton dark label="확인했어요" onPress={props.onDone} />}>
      <Title>{'지금은 이 계정을\n쓸 수 없어요'}</Title>
      <Body>이용이 정지되었거나 탈퇴한 계정이에요. 궁금한 점은 운영팀에 문의해 주세요.</Body>
    </Page>
  );
}
