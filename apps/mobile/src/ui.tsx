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
