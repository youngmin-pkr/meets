/**
 * 티켓 인증 (시안: VerifyIntro, VerifyUpload, VerifyMask, VerifyCheck, VerifyDone, VerifyFail)
 * 안내 → 1/4 캡처 올리기 → 2/4 개인정보 가리기 → 3/4 내용 확인 → 4/4 결과
 */
import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  ATTENDANCE_GRADE_LABELS,
  describeEventDate,
  TICKET_FAIL_MESSAGES,
  type EventDetail,
  type MaskBox,
  type TicketConfirmResult,
  type TicketKind,
} from '@meets/shared';
import { api } from '../api';
import { rectFromDrag, toPickedImage, type PickedImage } from '../ticketFlow';
import { colors } from '../theme';
import { Body, Card, ChoiceRow, ErrorText, keepWords, Page, Pill, PrimaryButton, StepHeader, styles, TextButton, Title, TopBar } from '../ui';
import { EventStrip } from './InputFlowScreens';

const shortDate = (iso: string) => {
  const { month, day, weekday } = describeEventDate(iso);
  return `${month}.${day} ${weekday}`;
};

const Notice = ({ text }: { text: string }) => (
  <View style={{ padding: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted, backgroundColor: colors.white }}>
    <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>{text}</Text>
  </View>
);

export function TicketIntroScreen(props: {
  event: EventDetail;
  canPlan: boolean;
  onBack: () => void;
  onStart: (kind: TicketKind) => void;
  onPlan: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [kind, setKind] = useState<TicketKind>(props.event.ticketRequired ? 'TICKET' : 'RESERVATION');
  return (
    <Page
      footer={
        <>
          <PrimaryButton label="인증 시작하기" onPress={() => props.onStart(kind)} loading={props.busy} />
          <TextButton label="나중에 할게요 (후보 구경만 하기)" onPress={props.onBack} />
        </>
      }
    >
      <TopBar label="티켓 인증" onBack={props.onBack} />
      <Title>{'같은 행사에 가는\n사람끼리만 만나요'}</Title>
      <Body>제안을 보내기 전에, 이 행사에 가는 사람이 맞는지 한 번만 확인할게요.</Body>
      {['예매 내역 캡처를 올려요', '이름·전화번호·결제 정보는 가려요', '확인이 끝나면 이미지는 삭제해요'].map((t, i) => (
        <View key={t} style={[styles.row, { padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white }]}>
          <Text style={{ width: 28, height: 28, lineHeight: 28, borderRadius: 14, overflow: 'hidden', textAlign: 'center', backgroundColor: colors.ink, color: colors.white, fontWeight: '900' }}>
            {i + 1}
          </Text>
          <Text style={{ fontSize: 14, color: colors.ink }}>{t}</Text>
        </View>
      ))}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>내가 가는 행사는…</Text>
        <ChoiceRow label="티켓이 있어요 (콘서트·페스티벌·유료 전시)" selected={kind === 'TICKET'} onPress={() => setKind('TICKET')} />
        <ChoiceRow label="예약제·무료예요 (팝업·박람회) — 예약 확인 화면으로 인증" selected={kind === 'RESERVATION'} onPress={() => setKind('RESERVATION')} />
      </View>
      {props.canPlan ? (
        <Card>
          <Text style={{ fontSize: 14, fontWeight: '700' }}>티켓이 없는 행사예요</Text>
          <Body>인증 없이 '참석 예정'으로 시작할 수도 있어요. 상대에게는 '참석 예정' 배지가 보이고, 인증한 사람보다 뒤에 보여요.</Body>
          <TextButton label="'참석 예정'으로 시작하기" onPress={props.onPlan} />
        </Card>
      ) : null}
      <ErrorText message={props.error} />
    </Page>
  );
}

export function TicketUploadScreen(props: {
  event: EventDetail;
  picked: PickedImage | null;
  onPick: (img: PickedImage) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  async function pick() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const img = toPickedImage(result.assets[0]);
    if (!img) setError('이미지를 읽지 못했어요. 다른 사진을 골라 주세요.');
    else props.onPick(img);
  }
  return (
    <Page footer={<PrimaryButton label="다음" onPress={props.onNext} disabled={!props.picked} />}>
      <StepHeader step={1} total={4} onBack={props.onBack} />
      <Title>{'예매 내역을\n올려 주세요'}</Title>
      <Body>예매처 앱의 예매 내역 상세 화면을 캡처하면 돼요.</Body>
      <EventStrip event={props.event} />
      <View style={{ alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 200, padding: 12, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.muted, backgroundColor: colors.white }}>
        {props.picked ? (
          <Image source={{ uri: props.picked.uri }} style={{ width: 160, height: (160 * props.picked.height) / props.picked.width, maxHeight: 280 }} resizeMode="contain" accessibilityLabel="고른 캡처" />
        ) : null}
        <Pressable onPress={pick} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 22, backgroundColor: colors.ink }}>
          <Text style={{ color: colors.white, fontSize: 14, fontWeight: '700' }}>{props.picked ? '다른 사진 고르기' : '사진에서 고르기'}</Text>
        </Pressable>
        <Text style={styles.small}>캡처 한 장이면 충분해요</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Card>
            <Text style={{ fontSize: 13, fontWeight: '700' }}>보여야 해요</Text>
            <Body>{'✓ 행사명\n✓ 날짜\n✓ 예매번호'}</Body>
          </Card>
        </View>
        <View style={{ flex: 1 }}>
          <Card>
            <Text style={{ fontSize: 13, fontWeight: '700' }}>가려도 돼요</Text>
            <Body>{'✕ 이름\n✕ 전화번호\n✕ 결제 정보'}</Body>
          </Card>
        </View>
      </View>
      <Text style={[styles.small, keepWords]}>가리는 건 다음 화면에서 해요. 지금은 원본 그대로 골라도 괜찮아요.</Text>
      <ErrorText message={error} />
    </Page>
  );
}

/** 손가락(마우스)으로 끌어서 가릴 곳에 검은 네모를 그립니다. */
export function TicketMaskScreen(props: {
  picked: PickedImage;
  masks: MaskBox[];
  onChange: (m: MaskBox[]) => void;
  onBack: () => void;
  onNext: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [draft, setDraft] = useState<MaskBox | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const masksRef = useRef(props.masks);
  masksRef.current = props.masks;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          start.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        },
        onPanResponderMove: (_e, g) => {
          if (!start.current || !size) return;
          setDraft(rectFromDrag(start.current, { x: start.current.x + g.dx, y: start.current.y + g.dy }, size));
        },
        onPanResponderRelease: (_e, g) => {
          if (start.current && size) {
            const rect = rectFromDrag(start.current, { x: start.current.x + g.dx, y: start.current.y + g.dy }, size);
            if (rect) props.onChange([...masksRef.current, rect]);
          }
          start.current = null;
          setDraft(null);
        },
      }),
    [size, props],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    setSize({ width, height: (width * props.picked.height) / props.picked.width });
  };
  const box = (m: MaskBox, key: string, faded = false) =>
    size ? (
      <View
        key={key}
        pointerEvents="none"
        style={{ position: 'absolute', left: m.x * size.width, top: m.y * size.height, width: m.w * size.width, height: m.h * size.height, backgroundColor: faded ? 'rgba(27,26,34,0.6)' : colors.ink }}
      />
    ) : null;

  return (
    <Page footer={<PrimaryButton label="이대로 올리기" onPress={props.onNext} loading={props.busy} />}>
      <StepHeader step={2} total={4} onBack={props.onBack} />
      <Title>{'민감한 정보는\n가려서 보내요'}</Title>
      <Body>이름·전화번호·결제 정보 위를 끌어서 검게 가려 주세요. 행사명·날짜·예매번호는 보이게 두세요.</Body>
      <View onLayout={onLayout} style={{ width: '100%' }}>
        {size ? (
          <View {...responder.panHandlers} style={{ width: size.width, height: size.height }} accessibilityLabel="캡처 이미지. 끌어서 가릴 곳을 표시해요">
            <Image source={{ uri: props.picked.uri }} style={{ width: size.width, height: size.height }} />
            {props.masks.map((m, i) => box(m, `m${i}`))}
            {draft ? box(draft, 'draft', true) : null}
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {props.masks.map((_, i) => (
          <Pill key={i} label={`가린 곳 ${i + 1} ✕`} selected onPress={() => props.onChange(props.masks.filter((__, j) => j !== i))} />
        ))}
        {props.masks.length === 0 ? <Text style={styles.small}>아직 가린 곳이 없어요.</Text> : null}
      </View>
      <Notice text="가린 이미지만 확인에 쓰고, 확인이 끝나면 지워요. 원본은 저장하지 않고, 사진 속 위치 정보도 지워요." />
      <ErrorText message={props.error} />
    </Page>
  );
}

export function TicketCheckScreen(props: {
  event: EventDetail;
  onBack: () => void;
  onSubmit: (reservationNumber: string, admissibleDayIds: string[]) => void;
  busy: boolean;
  error: string | null;
}) {
  const multi = props.event.days.length > 1;
  const [number, setNumber] = useState('');
  const [days, setDays] = useState<string[]>(multi ? [] : [props.event.days[0].id]);
  const ready = number.replace(/[\s-]/g, '').length >= 4 && days.length > 0;
  return (
    <Page
      footer={
        <>
          <PrimaryButton label="맞아요, 인증 요청" onPress={() => props.onSubmit(number, days)} disabled={!ready} loading={props.busy} />
          <TextButton label="틀렸어요, 다시 올릴게요" onPress={props.onBack} />
        </>
      }
    >
      <StepHeader step={3} total={4} onBack={props.onBack} />
      <Title>{'캡처에 있는 내용을\n적어 주세요'}</Title>
      <Body>캡처와 다르면 인증이 안 될 수 있어요. 일부는 사람이 한 번 더 확인해요.</Body>
      <View style={{ gap: 12, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>행사명</Text>
        <Text style={[{ fontSize: 16, fontWeight: '700', color: colors.ink }, keepWords]}>{props.event.name}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>예매번호</Text>
        <TextInput value={number} onChangeText={setNumber} placeholder="예: T1234-5678" autoCapitalize="characters" style={styles.input} />
      </View>
      {multi ? (
        <Card>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>이 티켓으로 입장할 수 있는 날</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {props.event.days.map((d) => {
              const on = days.includes(d.id);
              return <Pill key={d.id} label={`${shortDate(d.date)}${on ? ' ✓' : ''}`} selected={on} onPress={() => setDays(on ? days.filter((x) => x !== d.id) : [...days, d.id])} />;
            })}
          </View>
          <Text style={[styles.small, keepWords]}>1일권이면 그날만, 전 일정권이면 모든 날을 골라 주세요. 고른 날에만 후보가 열려요.</Text>
        </Card>
      ) : null}
      <Notice text="보통 바로 끝나요. 일부는 사람이 한 번 더 확인해서 하루 정도 걸릴 수 있어요." />
      <ErrorText message={props.error} />
    </Page>
  );
}

export function TicketResultScreen(props: {
  event: EventDetail;
  nickname: string;
  result: TicketConfirmResult;
  canPlan: boolean;
  onDone: () => void;
  onRetry: () => void;
  onPlan: () => void;
}) {
  const { result } = props;
  if (result.status === 'VERIFIED') {
    return (
      <Page footer={<PrimaryButton label="후보 다시 보기" onPress={props.onDone} />}>
        <StepHeader step={4} total={4} />
        <Title>인증이 끝났어요</Title>
        <Body>후보 목록에 '티켓 인증' 배지가 붙고, 인증하지 않은 사람보다 먼저 보여요. 제안 보내기는 다음 단계에서 열려요.</Body>
        <Card>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>상대에게는 이렇게 보여요</Text>
          <Text style={{ fontSize: 15, fontWeight: '700' }}>{props.nickname}</Text>
          <Text style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.lime }}>
            {`✓ ${ATTENDANCE_GRADE_LABELS.VERIFIED} · ${props.event.name}`}
          </Text>
        </Card>
        <Body>올린 이미지는 삭제됐어요. 이 인증은 이 행사에서만 쓰여요.</Body>
      </Page>
    );
  }
  if (result.status === 'REVIEW_PENDING') {
    return (
      <Page footer={<PrimaryButton label="후보 다시 보기" onPress={props.onDone} />}>
        <StepHeader step={4} total={4} />
        <Title>{'한 번 더\n확인하고 있어요'}</Title>
        <Body>
          {result.checks.notUsedElsewhere
            ? '일부 인증은 운영팀이 직접 확인해요. 보통 하루 안에 끝나요.'
            : '다른 계정에서 같은 예매번호가 쓰였어요. 운영팀이 확인한 뒤 알려 드려요.'}
        </Body>
        <Body>확인이 끝나면 가린 이미지도 바로 지워요.</Body>
      </Page>
    );
  }
  const msg = TICKET_FAIL_MESSAGES[result.failReason ?? 'OTHER'];
  return (
    <Page footer={<PrimaryButton label="다시 올리기" onPress={props.onRetry} />}>
      <TopBar label="티켓 인증" onBack={props.onDone} />
      <Title>{'인증이\n잘 안 됐어요'}</Title>
      <Card>
        <Text style={{ fontSize: 14, fontWeight: '700' }}>{msg.title}</Text>
        <Body>{msg.body}</Body>
      </Card>
      {props.canPlan ? (
        <Card>
          <Text style={{ fontSize: 14, fontWeight: '700' }}>티켓이 없는 행사인가요?</Text>
          <Body>인증 없이 '참석 예정'으로 시작할 수 있어요.</Body>
          <TextButton label="'참석 예정'으로 시작하기" onPress={props.onPlan} />
        </Card>
      ) : null}
    </Page>
  );
}
