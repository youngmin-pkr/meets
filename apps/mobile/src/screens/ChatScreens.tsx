/**
 * 앱 안 채팅 · 연락처 교환 경고 · 채팅 규칙 · 대화 목록 (시안: Chat, ChatWarn, ChatRules)
 *
 * 새 메시지는 채팅 화면이 열려 있는 동안 몇 초마다 서버에 물어봐서 가져옵니다. (2026-11-09 사용자 확인)
 * 나중에 실시간 연결로 바꿀 때는 useChatMessages만 고치면 됩니다.
 */
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  CHAT_QUICK_LATE,
  detectContact,
  formatSeoulShort,
  POLICY_DEFAULTS,
  type AppointmentView,
  type ChatMessageView,
  type ChatSummary,
  type ChatView,
} from '@meets/shared';
import { api, ApiError } from '../api';
import { colors } from '../theme';
import { Body, ErrorText, keepWords, Page, PrimaryButton, styles, TabBar, TextButton, Title, TopBar, type Tab } from '../ui';
import { Avatar, dateText } from './ProposalScreens';

/** 새 메시지를 확인하는 간격 */
export const CHAT_POLL_MS = 3000;

const timeOf = (iso: string) => formatSeoulShort(iso).split(' ').pop() ?? '';

/** 채팅 메시지를 가져오고, 화면이 열려 있는 동안 새 메시지를 이어서 받습니다. */
function useChatMessages(appointmentId: string) {
  const [chat, setChat] = useState<ChatView | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastSeq = useRef<number | undefined>(undefined);

  const merge = useCallback((incoming: ChatMessageView[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...incoming.filter((m) => !seen.has(m.id))].sort((a, b) => a.seq - b.seq);
    });
    lastSeq.current = Math.max(lastSeq.current ?? 0, ...incoming.map((m) => m.seq));
  }, []);

  const refresh = useCallback(() => {
    api.getChat(appointmentId, lastSeq.current).then(
      (c) => {
        setChat(c);
        merge(c.messages);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [appointmentId, merge]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, CHAT_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { chat, messages, error, setError, merge, refresh };
}

function Bubble({ m }: { m: ChatMessageView }) {
  if (m.kind === 'SYSTEM') {
    return <Text style={[{ alignSelf: 'center', textAlign: 'center', fontSize: 11, lineHeight: 16, color: colors.muted, paddingHorizontal: 12 }, keepWords]}>{m.body}</Text>;
  }
  return (
    <View style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '78%', gap: 3, alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 16,
          borderBottomRightRadius: m.mine ? 4 : 16,
          borderBottomLeftRadius: m.mine ? 16 : 4,
          backgroundColor: m.mine ? colors.ink : colors.white,
          borderWidth: m.mine ? 0 : 1.5,
          borderColor: colors.border,
        }}
      >
        <Text style={[{ fontSize: 14, lineHeight: 21, color: m.mine ? colors.white : colors.ink }, keepWords]}>{m.body}</Text>
      </View>
      <Text style={{ fontSize: 10, color: m.flagged ? colors.primary : colors.muted, fontWeight: m.flagged ? '700' : '400' }}>
        {m.flagged ? `연락처가 들어 있어 기록됐어요 · ${timeOf(m.createdAt)}` : timeOf(m.createdAt)}
      </Text>
    </View>
  );
}

function Chip({ label, onPress, strong }: { label: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, borderColor: strong ? colors.ink : colors.border, backgroundColor: colors.white }}
    >
      <Text style={{ fontSize: 13, fontWeight: strong ? '700' : '500', color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

/** 앱 안 채팅 */
export function ChatScreen(props: { appointmentId: string; onBack: () => void; onRules: () => void }) {
  const { chat, messages, error, setError, merge, refresh } = useChatMessages(props.appointmentId);
  const [appointment, setAppointment] = useState<AppointmentView | null>(null);
  const [text, setText] = useState('');
  const [warn, setWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    api.getAppointment(props.appointmentId).then(setAppointment, () => undefined);
  }, [props.appointmentId, messages.length]);

  async function send(body: string, confirmContact = false) {
    setError(null);
    setBusy(true);
    try {
      merge([await api.sendChat(props.appointmentId, body, confirmContact)]);
      setText('');
      setWarn(false);
    } catch (e) {
      // 서버에서도 연락처를 찾으면 같은 경고를 보여 줍니다.
      if (e instanceof ApiError && e.code === 'CONTACT_DETECTED') setWarn(true);
      else setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  function trySend() {
    if (!text.trim()) return;
    // 보내기 전에 먼저 멈춥니다. (CLAUDE.md 규칙 7)
    if (detectContact(text).detected) setWarn(true);
    else void send(text);
  }

  async function arrive() {
    setError(null);
    try {
      setAppointment(await api.arriveAppointment(props.appointmentId));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
    }
  }

  const open = chat?.open ?? true;
  const meeting = appointment && (appointment.status === 'CONFIRMED' || appointment.status === 'IN_PROGRESS');
  const max = POLICY_DEFAULTS.CHAT_MESSAGE_MAX_LENGTH;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: colors.border, backgroundColor: colors.white }}>
        <Pressable onPress={props.onBack} accessibilityRole="button" accessibilityLabel="이전 화면" style={[styles.back, { marginLeft: -10 }]}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        {chat ? <Avatar c={chat.counterpart} size={36} /> : null}
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink }}>{chat ? `${chat.counterpart.nickname}님` : ' '}</Text>
          <Text numberOfLines={1} style={{ fontSize: 11, color: colors.muted }}>{chat ? `${chat.event.name} · ${dateText(chat.date)} 약속` : ''}</Text>
        </View>
        <Pressable onPress={props.onRules} accessibilityRole="button" accessibilityLabel="채팅 규칙" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink, lineHeight: 22 }}>⋯</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.warnBg }}>
        <Text style={[{ flex: 1, fontSize: 12, lineHeight: 18, color: colors.ink }, keepWords]}>연락처·SNS는 서로 알려 주지 않아도 만날 수 있어요.</Text>
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 10 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
      </ScrollView>
      <ErrorText message={error} />

      {warn ? (
        <View style={{ margin: 16, gap: 12, padding: 20, borderRadius: 20, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.white }} accessibilityLiveRegion="polite">
          <Text style={{ fontSize: 16, fontWeight: '900', color: colors.ink }}>⚠ 번호나 SNS가 들어 있어요</Text>
          <Text style={[{ fontSize: 13, lineHeight: 20, color: colors.body }, keepWords]}>
            처음 만나기 전에는 연락처를 주고받지 않는 게 안전해요. 약속 당일에는 앱 안 채팅과 '도착했어요' 버튼으로 충분히 만날 수 있어요.
          </Text>
          <PrimaryButton
            label="내용을 지우고 다시 쓸게요"
            onPress={() => {
              setText('');
              setWarn(false);
            }}
          />
          <TextButton label="그래도 보낼게요 (기록이 남아요)" onPress={() => void send(text, true)} />
        </View>
      ) : open ? (
        <View style={{ backgroundColor: colors.white, borderTopWidth: 1.5, borderTopColor: colors.border }}>
          {meeting ? (
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 10 }}>
              {appointment.actions.arrive ? <Chip strong label="도착했어요" onPress={arrive} /> : null}
              <Chip label="조금 늦어요" onPress={() => void send(CHAT_QUICK_LATE)} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="메시지 입력"
              accessibilityLabel="메시지 입력"
              maxLength={max}
              multiline
              style={{ flex: 1, minHeight: 48, maxHeight: 120, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background, fontSize: 14, color: colors.ink }}
            />
            <Pressable
              onPress={trySend}
              disabled={busy || !text.trim()}
              accessibilityRole="button"
              accessibilityLabel="보내기"
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: busy || !text.trim() ? 0.4 : 1 }}
            >
              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.white }}>→</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ padding: 20, paddingBottom: 32, borderTopWidth: 1.5, borderTopColor: colors.border, backgroundColor: colors.white }}>
          <Text style={[{ textAlign: 'center', fontSize: 13, color: colors.body }, keepWords]}>채팅이 닫혔어요. 지난 대화는 읽을 수 있어요.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** 채팅 규칙 · 이 대화 신고하기 · 상대 차단하고 약속 취소 */
export function ChatRulesScreen(props: {
  appointmentId: string;
  onBack: () => void;
  onReport: (a: AppointmentView) => void;
  /** 차단하고 나면 채팅이 닫히므로 목록으로 돌아갑니다 */
  onBlocked: () => void;
}) {
  const [appointment, setAppointment] = useState<AppointmentView | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAppointment(props.appointmentId).then(setAppointment, (e: Error) => setError(e.message));
  }, [props.appointmentId]);

  async function block() {
    setError(null);
    setBusy(true);
    try {
      await api.blockCounterpart(props.appointmentId);
      props.onBlocked();
    } catch (e) {
      setError(e instanceof Error ? e.message : '다시 시도해 주세요.');
      setBusy(false);
    }
  }

  const nick = appointment ? `${appointment.counterpart.nickname}님` : '상대';
  const rules = [
    ['수락한 뒤에만 열려요', '제안을 수락하기 전에는 대화할 수 없어요.'],
    ['번호·SNS는 보내기 전에 멈춰요', '그래도 보내면 기록이 남고, 반복되면 이용이 제한될 수 있어요.'],
    ['사진과 위치는 보낼 수 없어요', '만날 장소는 약속 카드에 적힌 공개된 곳으로만 정해요.'],
    [`만남이 끝나고 ${POLICY_DEFAULTS.CHAT_CLOSE_HOURS_AFTER_END}시간 뒤 닫혀요`, "약속이 취소되면 바로 닫혀요. 서로 '또 같이 가고 싶어요'를 누르면 계속 이어갈 수 있어요."],
  ];
  return (
    <Page
      footer={
        confirming ? (
          <>
            <Text style={[{ textAlign: 'center', fontSize: 13, lineHeight: 20, color: colors.ink }, keepWords]}>
              {`${nick}을 차단하면 약속이 취소되고 서로 보이지 않아요. ${nick}에게는 차단했다는 알림이 가지 않아요.`}
            </Text>
            <PrimaryButton dark label="네, 차단하고 약속을 취소할게요" loading={busy} onPress={block} />
            <TextButton label="아니요" onPress={() => setConfirming(false)} />
          </>
        ) : (
          <PrimaryButton label="대화로 돌아가기" onPress={props.onBack} />
        )
      }
    >
      <TopBar label="채팅 규칙과 신고" onBack={props.onBack} />
      <Title>{'안전한 대화를 위한\n채팅 규칙'}</Title>
      <View style={{ borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white }}>
        {rules.map(([title, text], i) => (
          <View key={title} style={{ flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: colors.ink }}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>{title}</Text>
              <Text style={[{ fontSize: 12, lineHeight: 18, color: colors.muted }, keepWords]}>{text}</Text>
            </View>
          </View>
        ))}
      </View>
      {appointment ? (
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => props.onReport(appointment)}
            accessibilityRole="button"
            style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.warnBg }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>이 대화 신고하기</Text>
          </Pressable>
          {!confirming ? (
            <Pressable
              onPress={() => setConfirming(true)}
              accessibilityRole="button"
              style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: colors.ink }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }}>상대 차단하고 약속 취소</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={[{ textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.primary }, keepWords]}>위험하다고 느끼면 먼저 112에 연락하세요.</Text>
      <ErrorText message={error} />
    </Page>
  );
}

/** 대화 목록 (아래쪽 메뉴의 '채팅') */
export function ChatListScreen(props: { onOpen: (appointmentId: string) => void; onTab: (t: Tab) => void }) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => api.listChats().then(setChats, (e: Error) => setError(e.message));
    load();
    const timer = setInterval(load, CHAT_POLL_MS * 2);
    return () => clearInterval(timer);
  }, []);

  const unread = chats?.reduce((n, c) => n + c.unread, 0) ?? 0;
  return (
    <Page tabBar={<TabBar current="CHATS" onChange={props.onTab} chatUnread={unread} />}>
      <Title>채팅</Title>
      {chats === null && !error ? <Body>불러오는 중이에요…</Body> : null}
      {chats?.length === 0 ? <Body>제안을 수락해 약속이 생기면, 여기에서 대화할 수 있어요.</Body> : null}
      <View style={{ gap: 8 }}>
        {chats?.map((c) => (
          <Pressable
            key={c.appointmentId}
            onPress={() => props.onOpen(c.appointmentId)}
            accessibilityRole="button"
            style={[styles.row, { padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: c.unread ? colors.ink : colors.border, backgroundColor: colors.white, opacity: c.open ? 1 : 0.7 }]}
          >
            <Avatar c={c.counterpart} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: colors.ink }}>{`${c.counterpart.nickname}님`}</Text>
                {!c.open ? <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted }}>닫힘</Text> : null}
              </View>
              <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted }}>{`${c.event.name} · ${dateText(c.date)}`}</Text>
              {c.lastMessage ? (
                <Text numberOfLines={1} style={{ fontSize: 13, color: colors.body }}>{`${c.lastMessage.mine ? '나: ' : ''}${c.lastMessage.body}`}</Text>
              ) : null}
            </View>
            {c.unread ? (
              <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '900', color: colors.white }}>{c.unread}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
      <ErrorText message={error} />
    </Page>
  );
}
