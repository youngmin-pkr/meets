/** 여러 화면에서 같이 쓰는 버튼·제목 같은 조각 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { colors } from './theme';

export function Page({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
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

/** 30분 단위로 시간 고르기 */
export function TimeStepper(props: { label: string; value: string; min: string; max: string; onChange: (v: string) => void }) {
  const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const toT = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const v = toM(props.value);
  const step = (d: number) => props.onChange(toT(Math.min(toM(props.max), Math.max(toM(props.min), v + d))));
  const btn = (text: string, d: number, label: string, disabled: boolean) => (
    <Pressable
      onPress={() => step(d)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}
    >
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.body }}>{props.label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 48,
          borderRadius: 12,
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: colors.white,
        }}
      >
        {btn('−', -30, `${props.label} 30분 앞으로`, v <= toM(props.min))}
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>{props.value}</Text>
        {btn('+', 30, `${props.label} 30분 뒤로`, v >= toM(props.max))}
      </View>
    </View>
  );
}
