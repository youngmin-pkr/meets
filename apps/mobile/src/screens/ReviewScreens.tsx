/**
 * 후기 · 신고 (시안: ReviewStart, ReviewPick, ReviewAgain, ReviewDone, ReviewReport)
 * 후기 내용은 상대에게 보이지 않습니다. 점수 없이 상황 칩만 고릅니다.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  POLICY_DEFAULTS,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_CODES,
  REVIEW_AGAIN_CODES,
  REVIEW_AGAIN_LABELS,
  REVIEW_BAD_TAGS,
  REVIEW_BAD_TAG_CODES,
  REVIEW_GOOD_TAGS,
  REVIEW_GOOD_TAG_CODES,
  REVIEW_OVERALL,
  REVIEW_OVERALL_CODES,
  type AppointmentView,
  type ReportCategory,
  type ReviewOverall,
} from '@meets/shared';
import { api } from '../api';
import { colors } from '../theme';
import { Body, ErrorText, keepWords, Page, PrimaryButton, StepHeader, styles, TextButton, Title, TopBar } from '../ui';
import { setAgain, setHideTarget, toggleBad, toggleGood, toReviewInput, uncomfortableReview, type ReviewDraft } from '../reviewFlow';
import { Avatar } from './ProposalScreens';

function Note({ children }: { children: ReactNode }) {
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
      <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>{children}</Text>
    </View>
  );
}

function Chip(props: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.selected }}
      style={{
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderRadius: 22,
        borderWidth: props.selected ? 2 : 1.5,
        borderColor: props.selected ? colors.ink : colors.border,
        backgroundColor: props.selected ? colors.lime : colors.white,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: props.selected ? '700' : '500', color: colors.ink }}>{props.label}</Text>
    </Pressable>
  );
}

/** 어땠어요? */
export function ReviewStartScreen(props: {
  appointment: AppointmentView;
  onChoose: (overall: ReviewOverall) => void;
  onLater: () => void;
}) {
  const a = props.appointment;
  return (
    <Page footer={<TextButton label="나중에 할게요" onPress={props.onLater} />}>
      <View style={[styles.row, { justifyContent: 'space-between', minHeight: 44 }]}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>만남 후기</Text>
        <Pressable onPress={props.onLater} accessibilityRole="button" accessibilityLabel="후기 닫기" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22, color: colors.ink }}>✕</Text>
        </Pressable>
      </View>
      <View style={[styles.row, { padding: 14, borderRadius: 14, backgroundColor: colors.ink }]}>
        <Avatar c={a.counterpart} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[{ fontSize: 15, fontWeight: '700', color: colors.white }, keepWords]}>{`${a.counterpart.nickname}님과 함께한 시간이 끝났어요`}</Text>
          <Text style={[{ fontSize: 12, color: '#D6D3DC' }, keepWords]}>{a.event.name}</Text>
        </View>
      </View>
      <Title>어땠어요?</Title>
      <View style={{ gap: 10 }}>
        {REVIEW_OVERALL_CODES.map((code) => {
          const strong = code === 'GREAT';
          const warn = code === 'UNCOMFORTABLE';
          return (
            <Pressable
              key={code}
              onPress={() => props.onChoose(code)}
              accessibilityRole="button"
              style={[
                styles.row,
                {
                  minHeight: 64,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 16,
                  borderWidth: strong || warn ? 2 : 1.5,
                  borderColor: warn ? colors.primary : strong ? colors.ink : colors.border,
                  backgroundColor: warn ? colors.warnBg : strong ? colors.lime : colors.white,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: strong || warn ? '900' : '700', color: colors.ink }}>{REVIEW_OVERALL[code].label}</Text>
                <Text style={[{ fontSize: 12, color: colors.body }, keepWords]}>{REVIEW_OVERALL[code].hint}</Text>
              </View>
              <Text style={{ fontSize: 18, color: warn ? colors.primary : colors.ink }}>›</Text>
            </Pressable>
          );
        })}
      </View>
      <Note>{`내가 남긴 후기는 ${a.counterpart.nickname}님에게 보이지 않아요.`}</Note>
    </Page>
  );
}

/** 어떤 점이 기억에 남아요? (칩, 건너뛰어도 돼요) */
export function ReviewPickScreen(props: {
  draft: ReviewDraft;
  onChange: (d: ReviewDraft) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const d = props.draft;
  return (
    <Page footer={<PrimaryButton label="다음" onPress={props.onNext} />}>
      <StepHeader step={1} total={2} onBack={props.onBack} />
      <View style={{ gap: 8 }}>
        <Title>{'어떤 점이\n기억에 남아요?'}</Title>
        <Body>해당하는 것을 모두 골라 주세요. 없으면 건너뛰어도 돼요.</Body>
      </View>
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>좋았던 점</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REVIEW_GOOD_TAG_CODES.map((t) => (
            <Chip key={t} label={REVIEW_GOOD_TAGS[t]} selected={d.goodTags.includes(t)} onPress={() => props.onChange(toggleGood(d, t))} />
          ))}
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>아쉬웠던 점</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REVIEW_BAD_TAG_CODES.map((t) => (
            <Chip key={t} label={REVIEW_BAD_TAGS[t]} selected={d.badTags.includes(t)} onPress={() => props.onChange(toggleBad(d, t))} />
          ))}
        </View>
      </View>
      <Note>고른 내용은 다음 추천에 반영돼요. 어떤 항목을 골랐는지는 상대에게 보이지 않아요.</Note>
    </Page>
  );
}

function Radio(props: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: props.selected }}
      style={[
        styles.row,
        {
          minHeight: 52,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 12,
          borderWidth: props.selected ? 2 : 1.5,
          borderColor: props.selected ? colors.ink : colors.border,
          backgroundColor: props.selected ? colors.lime : colors.white,
        },
      ]}
    >
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.primary, backgroundColor: props.selected ? colors.primary : colors.white }} />
      <Text style={[{ flex: 1, fontSize: 15, fontWeight: props.selected ? '700' : '400', color: colors.ink }, keepWords]}>{props.label}</Text>
    </Pressable>
  );
}

function CheckRow(props: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="checkbox" accessibilityState={{ checked: props.checked }} style={[styles.row, { minHeight: 44 }]}>
      <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: colors.primary, backgroundColor: props.checked ? colors.primary : colors.white, alignItems: 'center', justifyContent: 'center' }}>
        {props.checked ? <Text style={{ fontSize: 12, fontWeight: '900', color: colors.white }}>✓</Text> : null}
      </View>
      <Text style={[{ flex: 1, fontSize: 13, color: colors.body }, keepWords]}>{props.label}</Text>
    </Pressable>
  );
}

/** 또 같이 가고 싶어요? */
export function ReviewAgainScreen(props: {
  appointment: AppointmentView;
  draft: ReviewDraft;
  onChange: (d: ReviewDraft) => void;
  onBack: () => void;
  onSent: (result: { mutual: boolean }) => void;
}) {
  const nick = `${props.appointment.counterpart.nickname}님`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = props.draft;

  async function send() {
    const input = toReviewInput(d);
    if (!input) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api.submitReview(props.appointment.id, input);
      props.onSent({ mutual: r.mutual });
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page footer={<PrimaryButton label="후기 보내기" onPress={send} loading={busy} />}>
      <StepHeader step={2} total={2} onBack={props.onBack} />
      <View style={{ gap: 8 }}>
        <Title>{`${nick}과\n또 같이 가고 싶어요?`}</Title>
        <Body>서로 원할 때만 연결돼요.</Body>
      </View>
      <View style={{ gap: 8 }}>
        {REVIEW_AGAIN_CODES.map((c) => (
          <Radio key={c} label={REVIEW_AGAIN_LABELS[c]} selected={d.again === c} onPress={() => props.onChange(setAgain(d, c))} />
        ))}
      </View>
      <View style={{ gap: 10, padding: 16, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>이렇게 이어져요</Text>
        {["둘 다 '네'를 고르면 서로에게 알려요.", '다음에 같은 행사에 가면 후보 맨 위에 먼저 보여 드려요. 채팅도 계속 열려 있어요.', "한쪽만 '네'라면 상대에게는 아무것도 알려지지 않아요."].map((t, i) => (
          <View key={t} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: colors.white }}>{i + 1}</Text>
            </View>
            <Text style={[{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.ink }, keepWords]}>{t}</Text>
          </View>
        ))}
      </View>
      <CheckRow label={`앞으로 ${nick}이 추천에 나오지 않게 해 주세요`} checked={d.hideTarget} onPress={() => props.onChange(setHideTarget(d, !d.hideTarget))} />
      {d.hideTarget ? <Text style={[styles.small, keepWords]}>차단과 같아요. 서로 보이지 않고, 상대에게는 알림이 가지 않아요.</Text> : null}
      <ErrorText message={error} />
    </Page>
  );
}

/** 후기를 보냈어요 / 신고를 접수했어요 */
export function ReviewDoneScreen(props: {
  appointment: AppointmentView;
  result: { mutual: boolean; reported: boolean };
  onTrust: () => void;
  onEvents: () => void;
}) {
  const { result } = props;
  const nick = `${props.appointment.counterpart.nickname}님`;
  return (
    <Page
      footer={
        <>
          <PrimaryButton label="내 신뢰 단계 보기" onPress={props.onTrust} />
          <TextButton label="행사 더 보기" onPress={props.onEvents} />
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: 16, paddingTop: 32 }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 44, fontWeight: '900', color: colors.ink }}>✓</Text>
        </View>
        <Title>{result.reported ? '신고를 접수했어요' : '후기를 보냈어요'}</Title>
        <Text style={[{ textAlign: 'center', fontSize: 14, lineHeight: 22, color: colors.muted }, keepWords]}>
          {result.reported ? '운영팀이 확인하고 있어요. 신고한 분의 정보는 상대에게 공개되지 않아요.' : '남겨 주신 내용은 다음 추천에 반영할게요.'}
        </Text>
      </View>
      {result.mutual ? (
        <View style={{ gap: 6, padding: 16, borderRadius: 16, backgroundColor: colors.lime, borderWidth: 2, borderColor: colors.ink }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>서로 또 같이 가고 싶어 해요</Text>
          <Text style={[{ fontSize: 13, lineHeight: 19, color: colors.ink }, keepWords]}>{`${nick}도 '또 같이 가고 싶어요'를 골랐어요. 다음에 같은 행사에 가면 먼저 보여 드리고, 채팅도 계속 열려 있어요.`}</Text>
        </View>
      ) : !result.reported ? (
        <View style={{ padding: 16, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border }}>
          <Text style={[{ fontSize: 13, lineHeight: 19, color: colors.ink }, keepWords]}>{`${nick}도 '또 같이 가고 싶어요'를 골랐다면 알려 드릴게요.`}</Text>
        </View>
      ) : null}
    </Page>
  );
}

/** 불편했어요 → 신고 / 채팅 규칙의 '이 대화 신고하기' / 차단한 사람의 '신고하고 싶어요' */
export function ReportScreen(props: {
  appointment: AppointmentView;
  /** 후기에서 넘어왔으면, 신고와 함께 '불편했어요' 후기도 남깁니다 */
  fromReview: boolean;
  onBack: () => void;
  onSent: (r: { blocked: boolean }) => void;
}) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nick = `${props.appointment.counterpart.nickname}님`;

  async function submit() {
    if (!category) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api.sendReport({ appointmentId: props.appointment.id, category, detail: detail.trim() || undefined, alsoBlock });
      // 후기에서 왔으면 '불편했어요' 후기도 함께 남깁니다. (이미 남겼거나 기간이 지났으면 신고만 접수)
      if (props.fromReview) await api.submitReview(props.appointment.id, uncomfortableReview()).catch(() => undefined);
      props.onSent({ blocked: r.blocked });
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page footer={<PrimaryButton label="신고 접수하기" onPress={submit} disabled={!category} loading={busy} />}>
      <TopBar label="신고" onBack={props.onBack} />
      <View style={{ gap: 8 }}>
        <Title>{'어떤 일이 있었는지\n알려 주세요'}</Title>
        <Body>신고하신 분의 정보는 상대에게 공개되지 않아요.</Body>
      </View>
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.warnBg, borderWidth: 2, borderColor: colors.primary }}>
        <Text style={[{ fontSize: 13, lineHeight: 19, color: colors.ink }, keepWords]}>지금 위험한 상황이라면 신고보다 먼저 112에 연락해 주세요.</Text>
      </View>
      <View style={{ gap: 8 }}>
        {REPORT_CATEGORY_CODES.map((c) => (
          <Radio key={c} label={REPORT_CATEGORIES[c]} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>자세한 내용 (선택)</Text>
        <TextInput
          value={detail}
          onChangeText={setDetail}
          placeholder="기억나는 대로 적어 주세요"
          accessibilityLabel="자세한 내용"
          multiline
          maxLength={POLICY_DEFAULTS.REPORT_DETAIL_MAX_LENGTH}
          style={{ minHeight: 88, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, fontSize: 14, lineHeight: 21, color: colors.ink, textAlignVertical: 'top' }}
        />
      </View>
      <CheckRow label={`${nick}을 차단하고, 서로 보이지 않게 해 주세요`} checked={alsoBlock} onPress={() => setAlsoBlock(!alsoBlock)} />
      <ErrorText message={error} />
    </Page>
  );
}
