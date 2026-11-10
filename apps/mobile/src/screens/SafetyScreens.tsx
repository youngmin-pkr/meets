/**
 * 만남 중 안전 (정리문서 2장 "안전")
 * - 약속 화면의 안전 영역: 안전 확인 답, '벗어나고 싶어요', 믿는 사람에게 알리기
 * - 안전 설정 화면: 안전 확인 받기, 믿는 사람 알림
 */
import { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import {
  SHARED_ALERT_LABELS,
  SHARED_STATUS_LABELS,
  type AppointmentView,
  type SafetySettings,
  type ShareLinkView,
} from '@meets/shared';
import { api } from '../api';
import { colors } from '../theme';
import { Body, Card, ErrorText, keepWords, Page, PrimaryButton, styles, TextButton, Title, TopBar } from '../ui';

function Note({ children }: { children: string }) {
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
      <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>{children}</Text>
    </View>
  );
}

/** 믿는 사람 링크 화면이 받는 사람에게 보이는 모습 (미리보기) */
function SharedPreview({ link }: { link: ShareLinkView }) {
  const p = link.preview;
  return (
    <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.lime, gap: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>받는 사람에게는 이렇게 보여요</Text>
      <Text style={[{ fontSize: 15, fontWeight: '900', color: colors.ink }, keepWords]}>{p.eventName}</Text>
      <Text style={[{ fontSize: 13, color: colors.ink }, keepWords]}>{`${p.when} · ${p.spotName}`}</Text>
      <Text style={[{ fontSize: 13, color: colors.ink }, keepWords]}>{`함께하는 사람: ${p.companion}님`}</Text>
      {p.status ? <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>{SHARED_STATUS_LABELS[p.status]}</Text> : null}
      {p.alert ? <Text style={{ fontSize: 13, fontWeight: '900', color: colors.primary }}>{SHARED_ALERT_LABELS[p.alert.kind]}</Text> : null}
    </View>
  );
}

/** 약속 화면 안의 안전 영역 */
export function SafetySection(props: { appointment: AppointmentView; helped: boolean; onHelped: () => void; onChanged: (a: AppointmentView) => void }) {
  const a = props.appointment;
  const [links, setLinks] = useState<ShareLinkView[]>([]);
  const [showStatus, setShowStatus] = useState(true);
  const [askHelp, setAskHelp] = useState(false);
  const [askHelpFromCheck, setAskHelpFromCheck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canShare = a.status === 'PENDING_CONFIRM' || a.status === 'CONFIRMED' || a.status === 'IN_PROGRESS';
  const loadLinks = useCallback(() => {
    if (!canShare) return;
    api.listShareLinks(a.id).then(setLinks, (e: Error) => setError(e.message));
  }, [a.id, canShare]);
  useEffect(loadLinks, [loadLinks]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  const sendHelp = () =>
    run(async () => {
      await api.requestHelp(a.id);
      props.onHelped();
      setAskHelp(false);
      props.onChanged(await api.getAppointment(a.id));
    });

  if (props.helped) {
    return (
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink }}>도움 요청을 받았어요</Text>
        <Body>만남을 끝냈고 운영팀에 가장 먼저 알렸어요. 상대에게는 이유 없이 약속이 취소됐다고만 보여요. 지금 위험하다면 112에 바로 연락하세요.</Body>
      </Card>
    );
  }

  const check = a.safety.pendingCheck;
  if (!canShare && !check && !a.safety.canRequestHelp) return null;

  return (
    <View style={{ gap: 12 }}>
      {check ? (
        <View style={{ padding: 16, borderRadius: 14, backgroundColor: colors.ink, gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '900', color: colors.white }}>잘 만나고 계세요?</Text>
          <Text style={[{ fontSize: 13, lineHeight: 19, color: colors.white }, keepWords]}>
            {`만남이 시작되고 ${check.minutesSinceStart}분이 지났어요. 상대에게는 보이지 않아요. 답하지 않아도 괜찮아요.`}
          </Text>
          {askHelpFromCheck ? (
            <>
              <Text style={[{ fontSize: 13, lineHeight: 19, color: colors.lime }, keepWords]}>
                만남을 바로 끝내고 운영팀에 알려요. 상대에게는 이유 없이 약속이 취소됐다고만 보여요.
              </Text>
              <PrimaryButton label="네, 만남을 끝낼게요" loading={busy} onPress={sendHelp} />
              <TextButton label="아니에요" onPress={() => setAskHelpFromCheck(false)} />
            </>
          ) : (
            <>
              <PrimaryButton
                label="네, 괜찮아요"
                loading={busy}
                onPress={() => run(async () => props.onChanged((await api.answerSafetyCheck(a.id, check.id, 'OK')) as AppointmentView))}
              />
              <TextButton label="도움이 필요해요" onPress={() => setAskHelpFromCheck(true)} />
            </>
          )}
        </View>
      ) : null}

      {a.safety.canRequestHelp && !check ? (
        <Card>
          <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink }}>불편하거나 위험하게 느껴지나요?</Text>
          {askHelp ? (
            <>
              <Body>
                만남이 바로 끝나고 채팅이 닫혀요. 운영팀에 가장 먼저 알리고, 상대에게는 이유 없이 약속이 취소됐다고만 보여요. 상대를 차단하지는 않아요. 지금 위험하다면 112에 바로 연락하세요.
              </Body>
              <PrimaryButton dark label="네, 만남을 끝낼게요" loading={busy} onPress={sendHelp} />
              <TextButton label="아니에요" onPress={() => setAskHelp(false)} />
            </>
          ) : (
            <>
              <Body>누르면 이유를 말하지 않아도 바로 만남을 끝낼 수 있어요.</Body>
              <TextButton label="벗어나고 싶어요" onPress={() => setAskHelp(true)} />
            </>
          )}
        </Card>
      ) : null}

      {canShare ? (
        <Card>
          <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink }}>믿는 사람에게 알리기</Text>
          <Body>링크 하나로 행사·시간·장소·함께하는 사람의 별명만 알려 줘요. 연락처는 받지 않고, 약속이 끝나고 몇 시간 뒤 링크가 사라져요.</Body>
          {links.map((l) => (
            <View key={l.id} style={{ gap: 8 }}>
              <SharedPreview link={l} />
              <Text selectable style={[{ fontSize: 12, color: colors.body }, keepWords]}>{l.url}</Text>
              <TextButton label="이 링크 끄기" onPress={() => run(async () => { await api.revokeShareLink(l.id); loadLinks(); })} />
            </View>
          ))}
          {links.length === 0 ? (
            <>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <Text style={[{ flex: 1, fontSize: 14, color: colors.ink }, keepWords]}>도착·종료 상태도 보여 주기</Text>
                <Switch value={showStatus} onValueChange={setShowStatus} accessibilityLabel="도착·종료 상태도 보여 주기" />
              </View>
              <PrimaryButton label="링크 만들기" loading={busy} onPress={() => run(async () => { await api.createShareLink(a.id, showStatus); loadLinks(); })} />
            </>
          ) : null}
          <Note>실제 서비스에서는 이 링크를 메신저나 문자로 보낼 수 있어요. 지금은 링크 화면까지만 미리 볼 수 있어요.</Note>
        </Card>
      ) : null}
      <ErrorText message={error} />
    </View>
  );
}

/** 안전 설정 (마이 > 안전 설정) */
export function SafetySettingsScreen(props: { onBack: () => void }) {
  const [s, setS] = useState<SafetySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getSafetySettings().then(setS, (e: Error) => setError(e.message));
  }, []);
  const change = (patch: Partial<SafetySettings>) => {
    setError(null);
    if (s) setS({ ...s, ...patch });
    api.updateSafetySettings(patch).then(setS, (e: Error) => setError(e.message));
  };
  return (
    <Page footer={<PrimaryButton label="확인" onPress={props.onBack} />}>
      <TopBar label="안전 설정" onBack={props.onBack} />
      <Title>만남 중 안전</Title>
      <Card>
        <View style={[styles.row, { justifyContent: 'space-between', gap: 12 }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink }}>안전 확인 받기</Text>
            <Body>만남이 시작되고 1시간쯤 뒤 '잘 만나고 계세요?' 하고 짧게 물어봐요. 상대에게는 보이지 않아요.</Body>
          </View>
          <Switch value={s?.checkEnabled ?? true} onValueChange={(v) => change({ checkEnabled: v })} accessibilityLabel="안전 확인 받기" />
        </View>
      </Card>
      <Card>
        <View style={[styles.row, { justifyContent: 'space-between', gap: 12 }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink }}>믿는 사람에게도 알리기</Text>
            <Body>
              도움 요청을 하거나 안전 확인에 답이 없을 때, 내가 만든 링크 화면에 '연락해 보세요' 안내가 떠요. 링크를 만들어 둔 약속에서만 쓰여요.
            </Body>
          </View>
          <Switch value={s?.alertTrusted ?? false} onValueChange={(v) => change({ alertTrusted: v })} accessibilityLabel="믿는 사람에게도 알리기" />
        </View>
      </Card>
      <Note>안전 확인은 푸시 알림이 아직 연결되지 않아, 앱을 열어 둘 때 보여요. 위험하다고 느끼면 언제든 112에 연락하세요.</Note>
      <ErrorText message={error} />
    </Page>
  );
}
