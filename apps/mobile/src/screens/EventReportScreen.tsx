/**
 * 행사 제보 (시안: 행사 제보) — 공식 링크 필수, 개인 모임 제외
 */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  checkEventReport,
  EVENT_CATEGORY_LABELS,
  EVENT_REPORT_PROBLEM_MESSAGES,
  type EventCategory,
  type EventReportInput,
  type EventReportResult,
} from '@meets/shared';
import { api } from '../api';
import { colors } from '../theme';
import { Body, ErrorText, keepWords, Page, PrimaryButton, styles, Title, TopBar } from '../ui';

export function EventReportScreen(props: {
  onBack: () => void;
  onDone: (input: EventReportInput, result: EventReportResult) => void;
}) {
  const [category, setCategory] = useState<EventCategory>('PERFORMANCE');
  const [name, setName] = useState('');
  const [dateText, setDateText] = useState('');
  const [placeText, setPlaceText] = useState('');
  const [officialUrl, setOfficialUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const input: EventReportInput = { category, name, dateText, placeText, officialUrl };
  const check = checkEventReport(input);
  // 입력을 시작한 칸만 미리 안내합니다.
  const hint =
    !check.ok && (name || officialUrl) && !(check.problem === 'NAME_REQUIRED' && !name) && !(check.problem === 'OFFICIAL_URL_INVALID' && !officialUrl)
      ? EVENT_REPORT_PROBLEM_MESSAGES[check.problem]
      : null;

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      props.onDone(input, await api.reportEvent(input));
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, strong = false) => (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={set}
        placeholder={placeholder}
        autoCapitalize="none"
        style={[styles.input, { height: 48, fontSize: 14 }, strong ? null : { borderWidth: 1.5, borderColor: colors.border }]}
      />
    </View>
  );

  return (
    <Page footer={<PrimaryButton label="제보하기" onPress={submit} disabled={!check.ok} loading={loading} />}>
      <TopBar label="행사 제보" onBack={props.onBack} />
      <Title>{'찾는 행사가\n없나요?'}</Title>
      <Body>알려 주시면 확인한 뒤 등록하고, 등록되면 가장 먼저 알려 드려요.</Body>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(Object.keys(EVENT_CATEGORY_LABELS) as EventCategory[]).map((c) => {
          const on = c === category;
          return (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                flex: 1,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                borderWidth: on ? 2 : 1.5,
                borderColor: on ? colors.ink : colors.border,
                backgroundColor: on ? colors.warnBg : colors.white,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: on ? '700' : '400', color: colors.ink }}>{EVENT_CATEGORY_LABELS[c]}</Text>
            </Pressable>
          );
        })}
      </View>

      {field('행사 이름', name, setName, '예: 테스트 밴드 단독 콘서트')}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {field('날짜 (기간)', dateText, setDateText, '12.13 – 12.14')}
        {field('장소', placeText, setPlaceText, '행사장 이름')}
      </View>
      <View style={{ gap: 6 }}>
        {field('공식 링크 (필수)', officialUrl, setOfficialUrl, '공식 공지나 예매 페이지 주소', true)}
        <Text style={styles.small}>운영팀이 사실인지 확인하는 데 써요.</Text>
        <ErrorText message={error ?? hint} />
      </View>

      <View style={{ padding: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
        <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>
          공식 링크가 없는 개인 모임은 등록하지 않아요. 포스터나 사진은 올리지 않아도 돼요.
        </Text>
      </View>
    </Page>
  );
}

/** 제보 접수 (시안: 제보 접수) */
export function EventReportedScreen(props: { input: EventReportInput; result: EventReportResult; onDone: () => void }) {
  const { result, input } = props;
  const title = !result.merged
    ? '제보가 접수됐어요'
    : result.progress === 'REGISTERED'
      ? '이미 등록된 행사예요'
      : '이미 제보된 행사예요';
  const sub = !result.merged
    ? '공식 링크를 확인한 뒤 등록하고, 등록되면 알려 드려요.'
    : result.progress === 'REGISTERED'
      ? '행사 목록에서 찾아볼 수 있어요.'
      : '다른 분의 제보와 하나로 합쳤어요. 등록되면 함께 알려 드려요.';
  const steps: Array<{ label: string; done: boolean }> = [
    { label: '접수됨', done: true },
    { label: '검토 중', done: result.progress === 'REVIEWING' || result.progress === 'REGISTERED' },
    { label: '등록 완료', done: result.progress === 'REGISTERED' },
  ];

  return (
    <Page footer={<PrimaryButton label="다른 행사 둘러보기" onPress={props.onDone} />}>
      <TopBar onBack={props.onDone} />
      <Title>{title}</Title>
      <Body>{sub}</Body>
      <View style={{ gap: 6, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white }}>
        <Text style={[{ fontSize: 15, fontWeight: '900', color: colors.ink }, keepWords]}>{input.name}</Text>
        {input.dateText || input.placeText ? (
          <Text style={{ fontSize: 13, color: colors.body }}>{[input.dateText, input.placeText].filter(Boolean).join(' · ')}</Text>
        ) : null}
      </View>
      {result.progress === 'NOT_REGISTERED' ? (
        <Body>이 행사는 등록되지 않았어요. 공식 링크를 다시 확인해 주세요.</Body>
      ) : (
        <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white }}>
          {steps.map((s, i) => (
            <View
              key={s.label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: s.done ? colors.lime : colors.white,
                  borderWidth: s.done ? 0 : 1.5,
                  borderColor: colors.muted,
                }}
              />
              <Text style={{ fontSize: 14, fontWeight: s.done ? '700' : '400', color: s.done ? colors.ink : colors.muted }}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={[styles.small, keepWords]}>
        같은 행사를 다른 분이 이미 제보했다면 하나로 합쳐져요. 확인이 어려운 제보는 이유와 함께 알려 드려요.
      </Text>
    </Page>
  );
}
