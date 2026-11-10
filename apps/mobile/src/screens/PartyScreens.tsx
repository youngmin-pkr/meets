/**
 * 일행 (정리문서 2장 "일행"): 만들기·초대·전원 입력·후보, 초대 링크로 합류
 * 일행은 성인 2~4명이고, 전원이 입력을 마치면 후보가 열려요.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, Text, TextInput, View } from 'react-native';
import {
  PARTY_STATUS_LABELS,
  type CandidateCard,
  type CandidatesResponse,
  type PartyInvitePreview,
  type PartyView,
} from '@meets/shared';
import { api } from '../api';
import { colors } from '../theme';
import { Body, Card, ErrorText, keepWords, Page, PrimaryButton, styles, TextButton, Title, TopBar } from '../ui';
import { CandidateCardView } from './CandidateScreens';

function Dot({ initial, color }: { initial: string; color: string }) {
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 16, fontWeight: '900', color: colors.lime }}>{initial}</Text>
    </View>
  );
}

function ReadyBadge({ ready }: { ready: boolean }) {
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: ready ? colors.lime : colors.warnBg,
        color: colors.ink,
      }}
    >
      {ready ? '입력 마침' : '입력 전'}
    </Text>
  );
}

function Note({ children }: { children: string }) {
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
      <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>{children}</Text>
    </View>
  );
}

/** 행사 하나의 일행: 없으면 만들기, 있으면 구성원·초대·진행 상태 */
export function PartyScreen(props: {
  eventId: string;
  onBack: () => void;
  /** 내 일정·스타일 입력, 티켓 인증으로 */
  onInput: (eventId: string) => void;
  onCandidates: (party: PartyView) => void;
}) {
  const [party, setParty] = useState<PartyView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'LEAVE' | 'DISBAND' | null>(null);

  const reload = useCallback(() => {
    api.getEventParty(props.eventId).then(
      (r) => setParty(r.party),
      (e: Error) => setError(e.message),
    );
  }, [props.eventId]);
  useEffect(reload, [reload]);
  // 친구가 합류하거나 입력을 마치면 바로 바뀌어 보이도록 가끔 다시 불러옵니다.
  useEffect(() => {
    const timer = setInterval(reload, 4000);
    return () => clearInterval(timer);
  }, [reload]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      setConfirm(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  if (party === undefined) {
    return (
      <Page>
        <TopBar label="일행" onBack={props.onBack} />
        <ErrorText message={error} />
      </Page>
    );
  }

  if (party === null) {
    return (
      <Page footer={<PrimaryButton label="일행 만들기" loading={busy} onPress={() => run(() => api.createParty(props.eventId))} />}>
        <TopBar label="일행" onBack={props.onBack} />
        <Title>친구와 같이 가나요?</Title>
        <Body>일행을 만들면 친구와 함께 같이 갈 사람을 찾을 수 있어요. 일행은 성인 2~4명이에요.</Body>
        <Card>
          <Text style={{ fontSize: 14, fontWeight: '900', color: colors.ink }}>이렇게 진행돼요</Text>
          <Body>1. 초대 링크를 친구에게 보내요. 연락처는 필요 없어요.</Body>
          <Body>2. 친구가 합류해서 각자 일정·스타일을 입력하고, 티켓 인증(또는 참석 예정)을 해요.</Body>
          <Body>3. 전원이 마치면 같이 볼 수 있는 시간으로 후보를 찾아요.</Body>
        </Card>
        <Note>누가 빠져도 남은 사람끼리 계속할 수 있어요. 한 명만 남으면 일행이 풀려요.</Note>
        <ErrorText message={error} />
      </Page>
    );
  }

  const me = party.members.find((m) => m.isMe)!;
  let footer = null;
  if (party.actions.candidates) {
    footer = <PrimaryButton label="일행 후보 보기" onPress={() => props.onCandidates(party)} />;
  } else if (!me.ready) {
    footer = <PrimaryButton label="내 일정·티켓 입력하러 가기" onPress={() => props.onInput(party.event.id)} />;
  } else if (party.actions.proceedWithout) {
    footer = <PrimaryButton dark label="입력 안 한 친구 빼고 진행" loading={busy} onPress={() => run(() => api.proceedParty(party.id))} />;
  }

  return (
    <Page footer={footer}>
      <TopBar label="일행" onBack={props.onBack} />
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Title>{party.event.name}</Title>
      </View>
      <Text style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.ink, color: colors.lime }}>
        {PARTY_STATUS_LABELS[party.status]}
      </Text>
      <Body>{party.guide}</Body>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700' }}>{`일행 ${party.members.length} / ${party.maxSize}명`}</Text>
        {party.members.map((m) => (
          <View key={m.userId} style={[styles.row, { gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white }]}>
            <Dot initial={m.avatarInitial} color={m.avatarColor} />
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 15, fontWeight: '700', color: colors.ink }, keepWords]}>{`${m.nickname}${m.isMe ? ' (나)' : ''}`}</Text>
              {m.isLeader ? <Text style={styles.small}>대표</Text> : null}
            </View>
            <ReadyBadge ready={m.ready} />
          </View>
        ))}
      </View>

      {party.invite ? (
        <Card>
          <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink }}>친구 초대하기</Text>
          <Body>링크를 친구에게 보내 주세요. 링크로 합류하면 일행이 돼요.</Body>
          <Text selectable style={[{ fontSize: 12, color: colors.body }, keepWords]}>{party.invite.url}</Text>
          <TextButton
            label="링크 보내기"
            onPress={() => {
              // 웹에서 공유창을 지원하지 않으면 위의 링크를 길게 눌러 복사해 주세요.
              Share.share({ message: `같이 가요! 일행 초대 링크: ${party.invite!.url}` }).catch(() => undefined);
            }}
          />
          <Text style={styles.small}>{`초대는 ${new Date(party.invite.expiresAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}까지 열려 있어요. 실제 서비스에서는 메신저로 바로 보낼 수 있어요.`}</Text>
        </Card>
      ) : null}

      {confirm === 'LEAVE' ? (
        <Card>
          <Body>일행에서 빠질까요? 남은 사람끼리 계속해요. 한 명만 남으면 일행이 풀려요.</Body>
          <PrimaryButton dark label="네, 빠질게요" loading={busy} onPress={() => run(async () => { await api.leaveParty(party.id); props.onBack(); })} />
          <TextButton label="아니에요" onPress={() => setConfirm(null)} />
        </Card>
      ) : confirm === 'DISBAND' ? (
        <Card>
          <Body>일행을 풀까요? 모든 사람이 일행에서 나가게 돼요.</Body>
          <PrimaryButton dark label="네, 풀게요" loading={busy} onPress={() => run(async () => { await api.disbandParty(party.id); props.onBack(); })} />
          <TextButton label="아니에요" onPress={() => setConfirm(null)} />
        </Card>
      ) : (
        <>
          <TextButton label="일행에서 빠지기" onPress={() => setConfirm('LEAVE')} />
          {party.actions.disband ? <TextButton label="일행 풀기" onPress={() => setConfirm('DISBAND')} /> : null}
        </>
      )}
      <Note>일행 후보는 전원이 겹치는 시간, 가장 여유 있는 템포, 가장 낮은 몰입도를 기준으로 찾아요. 일행으로 제안을 보내는 기능은 다음 단계에서 열려요.</Note>
      <ErrorText message={error} />
    </Page>
  );
}

/** 일행 후보 (일행 전원이 입력을 마친 뒤) */
export function PartyCandidatesScreen(props: { party: PartyView; onBack: () => void }) {
  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string | null>(null);

  useEffect(() => {
    api.getPartyCandidates(props.party.id, { sort: 'RECOMMENDED' }).then(setData, (e: Error) => setError(e.message));
  }, [props.party.id]);

  function show(c: CandidateCard) {
    setOpen(c.userId);
    setReasons(null);
    api.getPartyCandidate(props.party.id, c.userId).then(
      (d) => setReasons([d.reasons.tempo, d.reasons.immersion, d.reasons.time].filter(Boolean).join('\n')),
      (e: Error) => setError(e.message),
    );
  }

  return (
    <Page>
      <TopBar label="일행 후보" onBack={props.onBack} />
      <Title>{data ? `일행과 함께할 후보 ${data.total}명` : '후보를 찾는 중이에요…'}</Title>
      <Body>{`${props.party.members.map((m) => m.nickname).join(', ')}님이 모두 겹치는 시간으로 찾았어요.`}</Body>
      <View style={{ gap: 12 }}>
        {data?.candidates.map((c, i) => (
          <View key={c.userId} style={{ gap: 6 }}>
            <CandidateCardView c={c} multiDay={false} highlight={i === 0} onPress={() => show(c)} />
            {open === c.userId && reasons ? (
              <Pressable onPress={() => setOpen(null)} style={{ padding: 12, borderRadius: 12, backgroundColor: colors.lime }}>
                <Text style={[{ fontSize: 13, lineHeight: 20, color: colors.ink }, keepWords]}>{reasons}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {data && data.total === 0 ? <Body>전원이 겹치는 시간에 맞는 후보가 아직 없어요. 일행 인원을 줄이거나 시간을 조정하면 늘어날 수 있어요.</Body> : null}
      <Note>일행으로 제안을 보내는 기능은 다음 단계에서 열려요.</Note>
      <ErrorText message={error} />
    </Page>
  );
}

/** 내 일행 목록과 초대 링크로 합류하기 (나 탭) */
export function PartyListScreen(props: { onBack: () => void; onOpen: (party: PartyView) => void; onJoin: () => void }) {
  const [list, setList] = useState<PartyView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.listParties().then(setList, (e: Error) => setError(e.message));
  }, []);
  return (
    <Page footer={<PrimaryButton label="초대 링크로 합류하기" onPress={props.onJoin} />}>
      <TopBar label="일행" onBack={props.onBack} />
      <Title>내 일행</Title>
      {list && list.length === 0 ? <Body>아직 일행이 없어요. 행사의 후보 화면에서 일행을 만들거나, 친구가 보낸 링크로 합류할 수 있어요.</Body> : null}
      {list?.map((p) => (
        <Pressable key={p.id} onPress={() => props.onOpen(p)} accessibilityRole="button" style={[styles.row, { padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[{ fontSize: 15, fontWeight: '900', color: colors.ink }, keepWords]}>{p.event.name}</Text>
            <Text style={styles.small}>{`${PARTY_STATUS_LABELS[p.status]} · ${p.members.map((m) => m.nickname).join(', ')}`}</Text>
          </View>
          <Text style={{ fontSize: 18, color: colors.ink }}>›</Text>
        </Pressable>
      ))}
      <ErrorText message={error} />
    </Page>
  );
}

/** 초대 링크를 붙여 넣어 합류 */
export function PartyJoinScreen(props: { onBack: () => void; onJoined: (party: PartyView) => void }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<PartyInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** 주소 전체를 붙여 넣어도 되고, 뒤의 코드만 붙여 넣어도 됩니다. */
  const tokenOf = (raw: string) => {
    const t = raw.trim();
    const i = t.lastIndexOf('/party-invite/');
    return i >= 0 ? t.slice(i + '/party-invite/'.length) : t;
  };

  async function look() {
    setError(null);
    setPreview(null);
    setBusy(true);
    try {
      setPreview(await api.previewPartyInvite(tokenOf(text)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setError(null);
    setBusy(true);
    try {
      props.onJoined(await api.joinParty(tokenOf(text)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      footer={
        preview?.joinable ? (
          <PrimaryButton label="합류하기" loading={busy} onPress={join} />
        ) : (
          <PrimaryButton label="초대 확인하기" disabled={text.trim().length === 0} loading={busy} onPress={look} />
        )
      }
    >
      <TopBar label="일행" onBack={props.onBack} />
      <Title>초대 링크로 합류하기</Title>
      <Body>친구가 보낸 초대 링크를 붙여 넣어 주세요.</Body>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          setPreview(null);
        }}
        placeholder="초대 링크"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="초대 링크"
        style={[styles.input]}
      />
      {preview ? (
        <Card>
          <Text style={[{ fontSize: 15, fontWeight: '900', color: colors.ink }, keepWords]}>{preview.event.name}</Text>
          <Body>{`${preview.leaderNickname}님의 일행 · ${preview.memberCount} / ${preview.maxSize}명`}</Body>
          {preview.problem ? <Text style={[{ fontSize: 13, color: colors.primary, fontWeight: '700' }, keepWords]}>{preview.problem}</Text> : null}
        </Card>
      ) : null}
      <ErrorText message={error} />
    </Page>
  );
}
