/**
 * 즉석 동행 '지금 갈래요' (정리문서 2장 "즉석 동행")
 * 행사 당일 '지금 행사장에 있어요'를 직접 켜면 60분 동안 후보 풀에 들어가요. 위치는 받지 않아요.
 * 나를 뺀 대기 인원이 5명이 되면 후보 목록이 열려요.
 */
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  immersionQuestions,
  TEMPO_QUESTIONS,
  type AnswerValue,
  type CandidatesResponse,
  type EventDetail,
  type InstantStatusView,
} from '@meets/shared';
import { api } from '../api';
import { colors } from '../theme';
import { Body, Card, ChoiceRow, ErrorText, keepWords, Page, PrimaryButton, styles, TextButton, Title, TopBar } from '../ui';
import { CandidateCardView } from './CandidateScreens';

const hm = (iso: string) => {
  const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
};

function Note({ children }: { children: string }) {
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
      <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>{children}</Text>
    </View>
  );
}

/** 사람 수 표시: ●●●○○ 4 / 5명 */
function Dots({ count, min }: { count: number; min: number }) {
  return (
    <View style={[styles.row, { gap: 6 }]}>
      {Array.from({ length: min }, (_, i) => (
        <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < count ? colors.primary : colors.border }} />
      ))}
      <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '700', color: colors.ink }}>{`${Math.min(count, min)} / ${min}명`}</Text>
    </View>
  );
}

/** 저장된 입력이 없을 때 간단히 묻는 스타일 질문 (템포 3개, 몰입도 2개) */
function QuickStyle(props: { event: EventDetail; busy: boolean; onDone: (a: { tempo: AnswerValue[]; immersion: AnswerValue[] }) => void }) {
  const tempo = TEMPO_QUESTIONS;
  const imm = immersionQuestions(props.event.category);
  const [t, setT] = useState<Array<AnswerValue | null>>(tempo.map(() => null));
  const [m, setM] = useState<Array<AnswerValue | null>>(imm.map(() => null));
  const ready = t.every(Boolean) && m.every(Boolean);
  return (
    <View style={{ gap: 14 }}>
      <Body>입력해 둔 일정·스타일이 없어서, 간단히 다섯 가지만 물어볼게요.</Body>
      {[...tempo.map((q, i) => ({ q, i, kind: 't' as const })), ...imm.map((q, i) => ({ q, i, kind: 'm' as const }))].map(({ q, i, kind }) => (
        <View key={`${kind}${q.id}`} style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{q.title}</Text>
          {q.options.map((o) => (
            <ChoiceRow
              key={o.value}
              label={o.text}
              selected={(kind === 't' ? t[i] : m[i]) === o.value}
              onPress={() => (kind === 't' ? setT(t.map((x, j) => (j === i ? o.value : x))) : setM(m.map((x, j) => (j === i ? o.value : x))))}
            />
          ))}
        </View>
      ))}
      <PrimaryButton label="지금 행사장에 있어요" disabled={!ready} loading={props.busy} onPress={() => props.onDone({ tempo: t as AnswerValue[], immersion: m as AnswerValue[] })} />
    </View>
  );
}

export function InstantScreen(props: { eventId: string; onBack: () => void }) {
  const [status, setStatus] = useState<InstantStatusView | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [list, setList] = useState<CandidatesResponse | null>(null);
  const [askStyle, setAskStyle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.getInstantStatus(props.eventId).then(
      async (s) => {
        setStatus(s);
        if (s.mine.active && s.waiting.open) setList(await api.getInstantCandidates(props.eventId).catch(() => null));
        else setList(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [props.eventId]);
  useEffect(reload, [reload]);
  useEffect(() => {
    api.getEvent(props.eventId).then(setEvent, () => undefined);
  }, [props.eventId]);
  // 대기 인원이 늘면 바로 보이도록 가끔 다시 불러옵니다.
  useEffect(() => {
    const timer = setInterval(reload, 4000);
    return () => clearInterval(timer);
  }, [reload]);

  async function run(fn: () => Promise<InstantStatusView>) {
    setError(null);
    setBusy(true);
    try {
      setStatus(await fn());
      setAskStyle(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <Page>
        <TopBar label="지금 갈래요" onBack={props.onBack} />
        <ErrorText message={error} />
      </Page>
    );
  }

  const { mine, waiting } = status;
  return (
    <Page>
      <TopBar label="지금 갈래요" onBack={props.onBack} />
      <Title>{status.event.name}</Title>
      <Text style={styles.small}>{status.event.venue}</Text>

      {!status.available ? (
        <Card>
          <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink }}>지금은 쓸 수 없어요</Text>
          <Body>{status.closedMessage ?? ''}</Body>
        </Card>
      ) : !mine.active ? (
        <>
          <Body>
            {`지금 행사장에 있다면 알려 주세요. ${status.window ? `${status.window.from}부터 ${status.window.minutes}분 동안` : ''} 같이 갈 사람을 찾아요. 위치 정보는 받지 않고, 60분 뒤 자동으로 꺼져요.`}
          </Body>
          {askStyle && event ? (
            <QuickStyle event={event} busy={busy} onDone={(a) => run(() => api.turnOnInstant(props.eventId, { tempoAnswers: a.tempo as Array<1 | 2 | 3>, immersionAnswers: a.immersion as Array<1 | 2 | 3> }))} />
          ) : (
            <PrimaryButton
              label="지금 행사장에 있어요"
              loading={busy}
              onPress={() => (status.needsStyle ? setAskStyle(true) : run(() => api.turnOnInstant(props.eventId)))}
            />
          )}
          <Note>켜 두면 같은 행사장에 있는 사람들과 서로 후보로 보여요. 언제든 끌 수 있어요. 이름·연락처는 후보가 열렸을 때 별명만 보여요.</Note>
        </>
      ) : (
        <>
          <Card>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>행사장에 있다고 알렸어요</Text>
            <Text style={styles.small}>{`${hm(mine.until!)}까지 켜져 있어요`}</Text>
            <Dots count={waiting.count} min={waiting.min} />
            <Body>{waiting.open ? '지금 만날 수 있는 사람이 모였어요.' : `지금 만날 수 있는 사람이 ${waiting.min}명이 되면 후보를 보여 드려요. 알림으로도 알려 드릴게요.`}</Body>
          </Card>
          {waiting.open && list ? (
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink }}>{`지금 만날 수 있는 후보 ${list.total}명`}</Text>
              {list.candidates.map((c, i) => (
                <CandidateCardView key={c.userId} c={c} multiDay={false} highlight={i === 0} showGrade={false} onPress={() => undefined} />
              ))}
              {list.total === 0 ? <Body>지금 시간이 겹치는 후보가 아직 없어요. 잠시 뒤 다시 볼까요?</Body> : null}
              <Note>짧은 제안과 즉석 약속은 다음 단계에서 열려요.</Note>
            </View>
          ) : null}
          <TextButton label="이제 끌게요" onPress={() => run(() => api.turnOffInstant(props.eventId))} />
          <PrimaryButton dark label="한 번 더 60분 켜기" loading={busy} onPress={() => run(() => api.turnOnInstant(props.eventId))} />
        </>
      )}
      <ErrorText message={error} />
    </Page>
  );
}
