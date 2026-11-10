/**
 * 나 탭 · 내 신뢰 단계 · 차단한 사람 (시안: MyPage, TrustLevel, BlockList)
 * 신뢰 단계는 단계만 보여 주고 숫자 점수는 보여 주지 않습니다.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatSeoulShort, TRUST_LEVELS, type AppointmentView, type BlockView, type TrustLevel, type TrustView } from '@meets/shared';
import { api } from '../api';
import { colors } from '../theme';
import { Body, ErrorText, keepWords, Page, PrimaryButton, styles, TabBar, TextButton, Title, TopBar, type Tab } from '../ui';
import { Avatar } from './ProposalScreens';

function Note({ children }: { children: ReactNode }) {
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
      <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>{children}</Text>
    </View>
  );
}

function MenuRow(props: { label: string; value?: string; onPress: () => void; last?: boolean; tone?: 'danger' }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      style={[styles.row, { minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: props.last ? 0 : 1, borderBottomColor: colors.border }]}
    >
      <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: props.tone === 'danger' ? colors.primary : colors.ink }}>{props.label}</Text>
      {props.value ? <Text style={{ fontSize: 12, color: colors.muted }}>{props.value}</Text> : null}
      <Text style={{ fontSize: 18, color: colors.muted }}>›</Text>
    </Pressable>
  );
}

// ───────────────────────── 나 탭 ─────────────────────────

export function MyPageScreen(props: {
  nickname: string;
  avatarInitial: string | null;
  onTab: (t: Tab) => void;
  onTrust: () => void;
  onBlocks: () => void;
  onProposals: () => void;
  onNotifications: () => void;
  onSafety: () => void;
}) {
  const [trust, setTrust] = useState<TrustView | null>(null);
  const [blocks, setBlocks] = useState<BlockView[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getTrust(), api.listBlocks(), api.listChats()]).then(
      ([t, b, chats]) => {
        setTrust(t);
        setBlocks(b);
        setUnread(chats.reduce((n, c) => n + c.unread, 0));
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  return (
    <Page tabBar={<TabBar current="ME" onChange={props.onTab} chatUnread={unread} />}>
      <View style={[styles.row, { gap: 14, paddingTop: 8 }]}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: colors.lime }}>{props.avatarInitial ?? props.nickname.slice(0, 1)}</Text>
        </View>
        <Text style={[{ flex: 1, fontSize: 22, fontWeight: '900', color: colors.ink }, keepWords]}>{props.nickname}</Text>
      </View>

      <Pressable onPress={props.onTrust} accessibilityRole="button" style={[styles.row, { padding: 16, borderRadius: 14, backgroundColor: colors.ink }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.lime }}>내 신뢰 단계</Text>
          <Text style={{ fontSize: 16, fontWeight: '900', color: colors.white }}>{trust?.label ?? ' '}</Text>
        </View>
        <Text style={{ fontSize: 18, color: colors.white }}>›</Text>
      </Pressable>

      <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white }}>
        <MenuRow label="받은 제안 · 보낸 제안" onPress={props.onProposals} />
        <MenuRow label="알림" onPress={props.onNotifications} />
        <MenuRow label="안전 설정" onPress={props.onSafety} last />
      </View>

      <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white }}>
        <MenuRow label="차단한 사람" value={blocks ? `${blocks.length}명` : undefined} onPress={props.onBlocks} last />
      </View>
      <ErrorText message={error} />
    </Page>
  );
}

// ───────────────────────── 신뢰 단계 ─────────────────────────

export function TrustLevelScreen(props: { onBack: () => void; onEvents: () => void }) {
  const [trust, setTrust] = useState<TrustView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getTrust().then(setTrust, (e: Error) => setError(e.message));
  }, []);

  return (
    <Page footer={<PrimaryButton label="행사 보러 가기" onPress={props.onEvents} />}>
      <TopBar label="내 신뢰 단계" onBack={props.onBack} />
      {trust ? (
        <>
          <View style={{ gap: 10, padding: 18, borderRadius: 16, backgroundColor: colors.ink }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.lime }}>지금 단계</Text>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.white }}>{trust.label}</Text>
            {trust.next ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: '#D6D3DC' }}>{`다음 단계: ${trust.next.label}`}</Text>
                  {trust.next.reviewsToGo !== null ? <Text style={{ fontSize: 12, color: '#D6D3DC' }}>{`후기 ${trust.next.reviewsToGo}개 더`}</Text> : null}
                </View>
                {trust.next.progress !== null ? (
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.body, overflow: 'hidden' }} accessibilityLabel={`다음 단계까지 ${Math.round(trust.next.progress * 100)}%`}>
                    <View style={{ width: `${Math.round(trust.next.progress * 100)}%`, height: 8, backgroundColor: colors.lime }} />
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: '#D6D3DC' }}>가장 높은 단계예요.</Text>
            )}
          </View>

          <View style={{ gap: 8 }}>
            {([1, 2, 3, 4] as TrustLevel[]).map((lv) => {
              const now = lv === trust.level;
              return (
                <View
                  key={lv}
                  style={[
                    styles.row,
                    {
                      alignItems: 'flex-start',
                      padding: 14,
                      borderRadius: 14,
                      borderWidth: now ? 2 : 1.5,
                      borderColor: now ? colors.ink : colors.border,
                      borderStyle: lv === 4 && !now ? 'dashed' : 'solid',
                      backgroundColor: now ? colors.lime : colors.white,
                    },
                  ]}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: now ? colors.ink : colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: now ? colors.lime : colors.ink }}>{lv}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: now ? '900' : '700', color: colors.ink }}>{now ? `${TRUST_LEVELS[lv].label} · 지금 여기` : TRUST_LEVELS[lv].label}</Text>
                    <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.ink }, keepWords]}>{TRUST_LEVELS[lv].description}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, gap: 6, padding: 12, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>오르는 경우</Text>
              <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>참석 예정·티켓 인증, 만난 뒤 좋은 후기 받기</Text>
            </View>
            <View style={{ flex: 1, gap: 6, padding: 12, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>내려가는 경우</Text>
              <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.body }, keepWords]}>최근에 임박 취소·무응답·연락 없이 안 나온 일이 반복될 때</Text>
            </View>
          </View>
          <Note>점수 숫자는 보이지 않아요. 개별 후기 내용도 나나 상대에게 공개되지 않고, 단계만 보여요.</Note>
        </>
      ) : (
        <Body>불러오는 중이에요…</Body>
      )}
      <ErrorText message={error} />
    </Page>
  );
}

// ───────────────────────── 차단한 사람 ─────────────────────────

export function BlockListScreen(props: { onBack: () => void; onReport: (a: AppointmentView) => void }) {
  const [blocks, setBlocks] = useState<BlockView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listBlocks().then(setBlocks, (e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  async function unblock(userId: string) {
    setError(null);
    try {
      await api.unblockUser(userId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    }
  }

  async function report(b: BlockView) {
    if (!b.lastAppointmentId) return;
    try {
      props.onReport(await api.getAppointment(b.lastAppointmentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    }
  }

  return (
    <Page>
      <TopBar label="차단한 사람" onBack={props.onBack} />
      <Title>{`차단한 사람 ${blocks?.length ?? 0}명`}</Title>
      {blocks?.length === 0 ? <Body>차단한 사람이 없어요.</Body> : null}
      <View style={{ gap: 10 }}>
        {blocks?.map((b) => (
          <View key={b.userId} style={{ gap: 6, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white }}>
            <View style={styles.row}>
              <Avatar c={{ userId: b.userId, nickname: b.nickname, avatarInitial: b.avatarInitial, avatarColor: b.avatarColor }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{b.nickname}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{`${formatSeoulShort(b.blockedAt).replace(/ \d\d:\d\d$/, '')} 차단 · ${b.sourceLabel}`}</Text>
              </View>
              <Pressable
                onPress={() => void unblock(b.userId)}
                accessibilityRole="button"
                accessibilityLabel={`${b.nickname} 차단 해제`}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: colors.ink }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.ink }}>해제</Text>
              </Pressable>
            </View>
            {b.lastAppointmentId ? <TextButton label="이 사람도 신고하고 싶어요" onPress={() => void report(b)} /> : null}
          </View>
        ))}
      </View>
      <View style={{ gap: 8, padding: 14, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.ink }}>차단하면 이렇게 돼요</Text>
        <Text style={[{ fontSize: 12, lineHeight: 20, color: colors.body }, keepWords]}>
          {'서로 후보 목록에서 보이지 않아요.\n상대는 차단된 사실을 알림으로 받지 않아요.\n진행 중인 약속은 종료되고, 답을 기다리던 제안은 취소돼요.\n차단을 풀어도 이전 약속이 살아나지는 않아요.'}
        </Text>
      </View>
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.warnBg }}>
        <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.ink }, keepWords]}>차단과 신고는 별개예요. 차단을 풀어도 이미 접수한 신고는 운영팀이 계속 확인해요.</Text>
      </View>
      <ErrorText message={error} />
    </Page>
  );
}
