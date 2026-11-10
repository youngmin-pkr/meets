/** 여러 화면에서 같이 쓰는 버튼·제목 같은 조각 */
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import { colors } from './theme';
import { timeOptions } from './timeOptions';

/**
 * 키보드가 화면을 가리는 높이를 알려 줍니다. (키보드가 없으면 0)
 * - 아이폰: 키보드가 올라오기 시작하는 순간에 바로 알려 줘서 입력 칸이 늦게 올라오지 않습니다.
 * - 안드로이드: 키보드가 다 올라온 뒤에 알려 줍니다.
 * - 웹(휴대폰 브라우저): 화면에서 실제로 보이는 영역(visualViewport)의 변화를 읽습니다.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return undefined;
      const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
      update();
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      };
    }
    const ios = Platform.OS === 'ios';
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillChangeFrame' : 'keyboardDidShow', (e) => {
        const top = e.endCoordinates.screenY;
        setInset(ios ? Math.max(0, Dimensions.get('screen').height - top) : e.endCoordinates.height);
      }),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setInset(0)),
    ];
    return () => subs.forEach((x) => x.remove());
  }, []);
  return inset;
}

/** 키보드 높이만큼 아래를 비워서, 안쪽 내용(입력 칸·다음 버튼)이 키보드 위로 올라오게 합니다. */
export function KeyboardLift({ children }: { children: ReactNode }) {
  const inset = useKeyboardInset();
  return <View style={{ flex: 1, paddingBottom: inset }}>{children}</View>;
}

export function Page({ children, footer, tabBar }: { children: ReactNode; footer?: ReactNode; tabBar?: ReactNode }) {
  const inset = useKeyboardInset();
  const open = inset > 0;
  return (
    <View style={[styles.page, { paddingBottom: inset }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {/* 키보드가 열려 있으면 '다음' 버튼이 키보드 바로 위에 붙도록 아래 여백을 줄입니다. */}
      {footer ? <View style={[styles.footer, open && { paddingBottom: 12 }]}>{footer}</View> : null}
      {open ? null : tabBar}
    </View>
  );
}

/** 가로로 넘기는 영역(홈 이미지 등) 안에서 시작한 손동작은 화면 넘기기로 보지 않도록 표시합니다. */
export const swipeGuard = { blocked: false };
export const swipeGuardProps = {
  onTouchStart: () => {
    swipeGuard.blocked = true;
  },
  onTouchEnd: () => {
    swipeGuard.blocked = false;
  },
  onTouchCancel: () => {
    swipeGuard.blocked = false;
  },
};

/** 화면을 옆으로 밀면 다른 화면으로 넘어가게 합니다. (왼쪽으로 밀기=onSwipeLeft, 오른쪽으로 밀기=onSwipeRight) */
export function SwipeNav(props: { onSwipeLeft?: () => void; onSwipeRight?: () => void; children: ReactNode }) {
  const handlers = useRef(props);
  handlers.current = props;
  const pan = useMemo(
    () =>
      PanResponder.create({
        // 세로 스크롤은 그대로 두고, 확실히 가로로 움직일 때만 가져옵니다.
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          !swipeGuard.blocked && Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_e, g) => {
          const far = Math.abs(g.dx) > 70 || Math.abs(g.vx) > 0.6;
          if (!far || Math.abs(g.dx) < 40 || Math.abs(g.dx) < Math.abs(g.dy) * 2) return;
          if (g.dx < 0) handlers.current.onSwipeLeft?.();
          else handlers.current.onSwipeRight?.();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      {props.children}
    </View>
  );
}

export type Tab = 'HOME' | 'EVENTS' | 'CHATS' | 'ME';

/** 아래쪽 메뉴 (홈·행사·채팅·나) */
export function TabBar(props: { current: Tab; onChange: (t: Tab) => void; chatUnread?: number }) {
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'HOME', label: '홈' },
    { key: 'EVENTS', label: '행사' },
    { key: 'CHATS', label: '채팅' },
    { key: 'ME', label: '나' },
  ];
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', height: 64, borderTopWidth: 1.5, borderTopColor: colors.border, backgroundColor: colors.white }}>
      {tabs.map((t) => {
        const on = t.key === props.current;
        const badge = t.key === 'CHATS' && props.chatUnread ? props.chatUnread : 0;
        return (
          <Pressable
            key={t.key}
            onPress={() => props.onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={badge ? `${t.label}, 안 읽은 메시지 ${badge}개` : t.label}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <View style={{ width: 22, height: 4, borderRadius: 2, backgroundColor: on ? colors.primary : 'transparent' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: on ? '900' : '500', color: on ? colors.primary : colors.muted }}>{t.label}</Text>
              {badge ? (
                <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: colors.white }}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TopBar({ label, onBack }: { label?: string; onBack?: () => void }) {
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="이전 화면" style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      ) : null}
      {label ? <Text style={styles.topLabel}>{label}</Text> : null}
    </View>
  );
}

/** 웹에서 한국어가 단어 중간에서 줄바꿈되지 않도록 합니다. (휴대폰 앱에서는 기본 동작이 이미 같음) */
export const keepWords = (Platform.OS === 'web' ? { wordBreak: 'keep-all' } : {}) as TextStyle;

export function Title({ children }: { children: ReactNode }) {
  return <Text style={[styles.title, keepWords]}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={[styles.body, keepWords]}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  dark?: boolean;
}) {
  const disabled = props.disabled || props.loading;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[styles.primary, props.dark && { backgroundColor: colors.ink }, disabled && styles.disabled]}
    >
      {props.loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.primaryText}>{props.label}</Text>
      )}
    </Pressable>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.textButton}>
      <Text style={styles.textButtonText}>{label}</Text>
    </Pressable>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text style={styles.error} accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 56, gap: 20 },
  footer: { padding: 20, paddingBottom: 36, gap: 8 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 },
  backText: { fontSize: 32, color: colors.ink, lineHeight: 34 },
  topLabel: { fontSize: 12, fontWeight: '700', color: colors.muted },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '900', color: colors.ink },
  body: { fontSize: 14, lineHeight: 22, color: colors.muted },
  card: {
    gap: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  primary: {
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  textButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { fontSize: 13, fontWeight: '700', color: colors.body },
  error: { fontSize: 13, lineHeight: 20, color: colors.primary, fontWeight: '700' },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 12,
    backgroundColor: colors.white,
    fontSize: 16,
    color: colors.ink,
  },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  small: { fontSize: 12, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

/** 입력 흐름 위쪽: 이전 버튼 + 진행 막대 + "n / 5" */
export function StepHeader({ step, total, onBack }: { step: number; total: number; onBack?: () => void }) {
  return (
    <View style={[styles.row, { minHeight: 44 }]}>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="이전 단계" style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
      ) : null}
      <View style={{ flex: 1, flexDirection: 'row', gap: 4 }} accessibilityLabel={`${total}단계 중 ${step}단계`}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step ? colors.primary : colors.border }} />
        ))}
      </View>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}>{`${step} / ${total}`}</Text>
    </View>
  );
}

/** 고르는 버튼 (하나 고르기 또는 여러 개 고르기) */
export function ChoiceRow(props: { label: string; selected: boolean; onPress: () => void; multi?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole={props.multi ? 'checkbox' : 'radio'}
      accessibilityState={props.multi ? { checked: props.selected } : { selected: props.selected }}
      style={{
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: props.selected ? 2 : 1.5,
        borderColor: props.selected ? colors.ink : colors.border,
        backgroundColor: props.selected ? colors.warnBg : colors.white,
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: props.multi ? 4 : 9,
          borderWidth: 2,
          borderColor: colors.primary,
          backgroundColor: props.selected ? colors.primary : colors.white,
        }}
      />
      <Text style={[{ flex: 1, fontSize: 14, fontWeight: props.selected ? '700' : '400', color: colors.ink }, keepWords]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/** 둥근 칩 버튼 */
export function Pill(props: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected, disabled: props.disabled }}
      style={{
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderRadius: 22,
        borderWidth: props.selected ? 2 : 1.5,
        borderColor: props.selected ? colors.ink : colors.border,
        backgroundColor: props.selected ? colors.warnBg : colors.white,
        opacity: props.disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: props.selected ? '700' : '500', color: colors.ink }}>{props.label}</Text>
    </Pressable>
  );
}

const ROW = 44;
const ROWS_SHOWN = 5;
/**
 * 시간 고르기: 칸을 누르면 아래에서 메뉴가 올라오고, 시간을 위아래로 밀어서 고릅니다. (30분 단위)
 */
export function TimeField(props: { label: string; value: string; min: string; max: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => timeOptions(props.min, props.max, props.value), [props.min, props.max, props.value]);
  const [picked, setPicked] = useState(props.value);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  function show() {
    setPicked(props.value);
    setOpen(true);
  }
  function moveTo(t: string, animated: boolean) {
    scroll.current?.scrollTo({ y: options.indexOf(t) * ROW, animated });
  }
  function confirm() {
    props.onChange(picked);
    setOpen(false);
  }

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.body }}>{props.label}</Text>
      <Pressable
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={`${props.label} ${props.value}, 눌러서 바꾸기`}
        style={{ height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 }}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{props.value}</Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} accessibilityLabel="닫기" />
          <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: 28, gap: 12 }}>
            <Text style={{ textAlign: 'center', fontSize: 15, fontWeight: '900', color: colors.ink }}>{props.label}</Text>
            <View style={{ height: ROW * ROWS_SHOWN }}>
              {/* 가운데 선택 띠 */}
              <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, top: ROW * 2, height: ROW, borderRadius: 12, backgroundColor: colors.background }} />
              <ScrollView
                ref={scroll}
                showsVerticalScrollIndicator={false}
                snapToInterval={ROW}
                decelerationRate="fast"
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingVertical: ROW * 2 }}
                contentOffset={{ x: 0, y: Math.max(0, options.indexOf(props.value)) * ROW }}
                onLayout={() => moveTo(picked, false)}
                onScroll={(e) => {
                  const i = Math.min(options.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ROW)));
                  setPicked(options[i]);
                }}
              >
                {options.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => {
                      setPicked(t);
                      moveTo(t, true);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: t === picked }}
                    style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: t === picked ? 22 : 17, fontWeight: t === picked ? '900' : '500', color: t === picked ? colors.ink : colors.muted }}>{t}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <View style={{ paddingHorizontal: 20 }}>
              <PrimaryButton label={`${picked} 로 정하기`} onPress={confirm} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
