import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import { useRouter } from "expo-router";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export type IconName = React.ComponentProps<typeof MaterialDesignIcons>["name"];
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <MaterialDesignIcons name={name} size={size} color={color || colors.onSurface} />;
}

// ---------- Header ----------
export function Header({ title, subtitle, back = true, right, testID }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode; testID?: string }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[s.header, { paddingTop: insets.top + spacing.sm }]} testID={testID || "screen-header"}>
      {back && (
        <Pressable testID="header-back-button" hitSlop={8} style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
          <Icon name="arrow-left" />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function HeaderAction({ icon, onPress, testID, label }: { icon: IconName; onPress: () => void; testID: string; label?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={6} style={({ pressed }) => [s.headerAction, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} color={colors.brandPrimary} />
      {label ? <Text style={s.headerActionText}>{label}</Text> : null}
    </Pressable>
  );
}

// ---------- Buttons ----------
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "accent";
export function Button({ title, onPress, variant = "primary", icon, loading, disabled, testID, style, small }: {
  title: string; onPress: () => any; variant?: BtnVariant; icon?: IconName; loading?: boolean; disabled?: boolean; testID: string; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const busy = useRef(false);
  const [running, setRunning] = useState(false);
  const bg = { primary: colors.brandPrimary, secondary: colors.brandTertiary, ghost: "transparent", danger: colors.error, accent: colors.accent }[variant];
  const fg = { primary: colors.onBrandPrimary, secondary: colors.onBrandTertiary, ghost: colors.brandPrimary, danger: colors.onError, accent: colors.onAccent }[variant];
  const press = async () => {
    if (busy.current) return; // prevent repeated taps
    busy.current = true;
    setRunning(true);
    try {
      await onPress();
    } finally {
      busy.current = false;
      setRunning(false);
    }
  };
  const isLoading = loading || running;
  return (
    <Pressable
      testID={testID}
      disabled={disabled || isLoading}
      onPress={press}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, variant === "ghost" && s.btnGhost, style]}
    >
      {isLoading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={small ? 18 : 20} color={fg} /> : null}
      <Text style={[s.btnText, small && { fontSize: font.base }, { color: fg }]} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}

// ---------- Inputs ----------
export function Field({ label, error, hint, style, testID, ...props }: TextInputProps & { label?: string; error?: string; hint?: string; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.field, style as any]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        style={[s.input, props.multiline && { minHeight: 80, textAlignVertical: "top", paddingTop: spacing.md }, error ? { borderColor: colors.error } : null]}
        {...props}
      />
      {error ? <Text style={s.error} testID={testID + "-error"}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder, testID, autoFocus }: { value: string; onChangeText: (t: string) => void; placeholder: string; testID: string; autoFocus?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.search}>
      <Icon name="magnify" color={colors.muted} />
      <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted}
        style={s.searchInput} autoCorrect={false} autoCapitalize="none" returnKeyType="search" autoFocus={autoFocus} />
      {value ? (
        <Pressable testID={testID + "-clear"} onPress={() => onChangeText("")} hitSlop={8}>
          <Icon name="close-circle" color={colors.muted} size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------- Chips ----------
export function Chip({ label, active, onPress, testID, icon }: { label: string; active?: boolean; onPress: () => void; testID: string; icon?: IconName }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={[s.chip, active && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
      {icon ? <Icon name={icon} size={16} color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary} /> : null}
      <Text style={[s.chipText, active && { color: colors.onBrandPrimary }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.chipRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRowContent} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange, testID }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; testID: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.seg} testID={testID}>
      {options.map((o) => (
        <Pressable key={o.value} testID={`${testID}-${o.value}`} onPress={() => onChange(o.value)} style={[s.segItem, value === o.value && { backgroundColor: colors.surface }]}>
          <Text style={[s.segText, value === o.value && { color: colors.brandPrimary, fontWeight: "700" }]} numberOfLines={1}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- Display ----------
export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string }) {
  const s = useStyles();
  if (onPress)
    return (
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  return <View testID={testID} style={[s.card, style]}>{children}</View>;
}

export function Badge({ label, tone = "neutral", testID }: { label: string; tone?: "neutral" | "success" | "warning" | "error" | "info" | "brand" | "accent"; testID?: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const map = {
    neutral: [colors.surfaceTertiary, colors.onSurfaceTertiary], success: [colors.success, colors.onSuccess], warning: [colors.warning, colors.onWarning],
    error: [colors.error, colors.onError], info: [colors.info, colors.onInfo], brand: [colors.brandTertiary, colors.onBrandTertiary], accent: [colors.accent, colors.onAccent],
  }[tone];
  return (
    <View testID={testID} style={[s.badge, { backgroundColor: map[0] }]}>
      <Text style={[s.badgeText, { color: map[1] }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>{title}</Text>
      {right}
    </View>
  );
}

export function Row({ label, value, testID, bold }: { label: string; value: string; testID?: string; bold?: boolean }) {
  const s = useStyles();
  return (
    <View style={s.kv}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={[s.kvValue, bold && { fontWeight: "800" }]} testID={testID} selectable>{value || "—"}</Text>
    </View>
  );
}

export function Empty({ icon = "package-variant", title, text, testID, action }: { icon?: IconName; title: string; text?: string; testID?: string; action?: React.ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.empty} testID={testID || "empty-state"}>
      <Icon name={icon} size={44} color={colors.muted} />
      <Text style={s.emptyTitle}>{title}</Text>
      {text ? <Text style={s.emptyText}>{text}</Text> : null}
      {action}
    </View>
  );
}

// ---------- Global UI: toast, confirm, picker sheet, prompt ----------
type ConfirmOpts = { title: string; message?: string; confirmText?: string; danger?: boolean; cancelText?: string };
type PickOpt<T> = { value: T; label: string; sub?: string };
type PromptOpts = { title: string; message?: string; placeholder?: string; initial?: string; keyboardType?: TextInputProps["keyboardType"]; confirmText?: string };
type UIApi = {
  toast: (msg: string, tone?: "success" | "error" | "info") => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  pick: <T>(title: string, options: PickOpt<T>[]) => Promise<T | null>;
  prompt: (o: PromptOpts) => Promise<string | null>;
};
const UICtx = createContext<UIApi | null>(null);
export const useUI = () => useContext(UICtx)!;

export function UIProvider({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; tone: string } | null>(null);
  const [confirmState, setConfirm] = useState<(ConfirmOpts & { resolve: (b: boolean) => void }) | null>(null);
  const [pickState, setPick] = useState<{ title: string; options: PickOpt<any>[]; resolve: (v: any) => void } | null>(null);
  const [promptState, setPrompt] = useState<(PromptOpts & { resolve: (v: string | null) => void }) | null>(null);
  const [promptVal, setPromptVal] = useState("");
  const [pickFilter, setPickFilter] = useState("");
  const timer = useRef<any>(null);

  const api: UIApi = {
    toast: useCallback((msg, tone = "success") => {
      setToast({ msg, tone });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 3200);
    }, []),
    confirm: (o) => new Promise((resolve) => setConfirm({ ...o, resolve })),
    pick: (title, options) => new Promise((resolve) => { setPickFilter(""); setPick({ title, options, resolve }); }),
    prompt: (o) => new Promise((resolve) => { setPromptVal(o.initial || ""); setPrompt({ ...o, resolve }); }),
  };
  const toneBg = toast?.tone === "error" ? colors.error : toast?.tone === "info" ? colors.surfaceInverse : colors.success;
  const toneFg = toast?.tone === "error" ? colors.onError : toast?.tone === "info" ? colors.onSurfaceInverse : colors.onSuccess;
  const filtered = pickState ? pickState.options.filter((o) => !pickFilter || (o.label + " " + (o.sub || "")).toLowerCase().includes(pickFilter.toLowerCase())) : [];

  return (
    <UICtx.Provider value={api}>
      {children}
      {toast && (
        <View pointerEvents="none" style={[s.toast, { bottom: insets.bottom + 90, backgroundColor: toneBg }]} testID="toast-message">
          <Text style={[s.toastText, { color: toneFg }]}>{toast.msg}</Text>
        </View>
      )}
      <Modal visible={!!confirmState} transparent animationType="fade" onRequestClose={() => { confirmState?.resolve(false); setConfirm(null); }}>
        <View style={s.backdropCenter}>
          <View style={s.dialog} testID="confirm-dialog">
            <Text style={s.dialogTitle}>{confirmState?.title}</Text>
            {confirmState?.message ? <Text style={s.dialogMsg}>{confirmState.message}</Text> : null}
            <View style={s.dialogActions}>
              <Button small testID="confirm-cancel-button" variant="ghost" title={confirmState?.cancelText || "Cancel"} onPress={() => { confirmState?.resolve(false); setConfirm(null); }} />
              <Button small testID="confirm-ok-button" variant={confirmState?.danger ? "danger" : "primary"} title={confirmState?.confirmText || "Confirm"} onPress={() => { confirmState?.resolve(true); setConfirm(null); }} />
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!promptState} transparent animationType="fade" onRequestClose={() => { promptState?.resolve(null); setPrompt(null); }}>
        <View style={s.backdropCenter}>
          <View style={s.dialog} testID="prompt-dialog">
            <Text style={s.dialogTitle}>{promptState?.title}</Text>
            {promptState?.message ? <Text style={s.dialogMsg}>{promptState.message}</Text> : null}
            <Field testID="prompt-input" value={promptVal} onChangeText={setPromptVal} placeholder={promptState?.placeholder} keyboardType={promptState?.keyboardType} autoFocus />
            <View style={s.dialogActions}>
              <Button small testID="prompt-cancel-button" variant="ghost" title="Cancel" onPress={() => { promptState?.resolve(null); setPrompt(null); }} />
              <Button small testID="prompt-ok-button" title={promptState?.confirmText || "OK"} onPress={() => { promptState?.resolve(promptVal); setPrompt(null); }} />
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!pickState} transparent animationType="slide" onRequestClose={() => { pickState?.resolve(null); setPick(null); }}>
        <Pressable style={s.backdrop} onPress={() => { pickState?.resolve(null); setPick(null); }} testID="picker-backdrop" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="picker-sheet">
          <Text style={s.dialogTitle}>{pickState?.title}</Text>
          {(pickState?.options.length || 0) > 8 && <SearchBar testID="picker-search" value={pickFilter} onChangeText={setPickFilter} placeholder="Filter…" />}
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {filtered.map((o, i) => (
              <Pressable key={i} testID={`picker-option-${i}`} style={({ pressed }) => [s.option, pressed && { backgroundColor: colors.surfaceTertiary }]}
                onPress={() => { pickState?.resolve(o.value); setPick(null); }}>
                <Text style={s.optionText}>{o.label}</Text>
                {o.sub ? <Text style={s.hint}>{o.sub}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </UICtx.Provider>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  headerTitle: { fontSize: font.xl, fontWeight: "800", color: c.onSurface },
  headerSub: { fontSize: font.sm, color: c.muted, marginTop: 2 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -spacing.sm },
  headerAction: { minWidth: 44, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  headerActionText: { color: c.brandPrimary, fontWeight: "700", fontSize: font.base },
  btn: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  btnSmall: { minHeight: 40, paddingHorizontal: spacing.md },
  btnGhost: { borderWidth: 1, borderColor: c.borderStrong },
  btnText: { fontSize: font.lg, fontWeight: "700" },
  field: { marginBottom: spacing.md },
  label: { fontSize: font.sm, fontWeight: "700", color: c.onSurfaceTertiary, marginBottom: spacing.xs, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { minHeight: 48, borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: font.lg, color: c.onSurface, backgroundColor: c.surface },
  error: { color: c.error, fontSize: font.sm, marginTop: spacing.xs },
  hint: { color: c.muted, fontSize: font.sm, marginTop: 2 },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 48, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontSize: font.lg, color: c.onSurface, height: 48 },
  chipRow: { height: 56, flexShrink: 0 },
  chipRowContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center", height: 56 },
  chip: { height: 36, flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface },
  chipText: { fontSize: font.base, color: c.onSurfaceTertiary, fontWeight: "600" },
  seg: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, paddingHorizontal: 4 },
  segText: { fontSize: font.base, color: c.onSurfaceTertiary, fontWeight: "600" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border },
  badge: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "800" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  section: { fontSize: font.sm, fontWeight: "800", color: c.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 6 },
  kvLabel: { color: c.muted, fontSize: font.base, flexShrink: 0 },
  kvValue: { color: c.onSurface, fontSize: font.base, fontWeight: "600", flex: 1, textAlign: "right" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: font.lg, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  emptyText: { fontSize: font.base, color: c.muted, textAlign: "center" },
  toast: { position: "absolute", left: spacing.lg, right: spacing.lg, padding: spacing.md, borderRadius: radius.md },
  toastText: { fontSize: font.base, fontWeight: "700", textAlign: "center" },
  backdrop: { flex: 1, backgroundColor: c.overlay },
  backdropCenter: { flex: 1, backgroundColor: c.overlay, justifyContent: "center", padding: spacing.xl },
  dialog: { backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  dialogTitle: { fontSize: font.xl, fontWeight: "800", color: c.onSurface, marginBottom: spacing.sm },
  dialogMsg: { fontSize: font.base, color: c.onSurfaceSecondary, lineHeight: 20 },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  option: { paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.divider, minHeight: 48, justifyContent: "center" },
  optionText: { fontSize: font.lg, color: c.onSurface },
}));

export const useScreenStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  body: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  h1: { fontSize: font.xxl, fontWeight: "800", color: c.onSurface },
  text: { fontSize: font.base, color: c.onSurface },
  muted: { fontSize: font.sm, color: c.muted },
  strong: { fontSize: font.lg, fontWeight: "700", color: c.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  listItem: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface, gap: 4 },
  itemTitle: { fontSize: font.lg, fontWeight: "600", color: c.onSurface },
  link: { color: c.brandPrimary, fontWeight: "700", fontSize: font.base },
  divider: { height: 1, backgroundColor: c.border, marginVertical: spacing.md },
  notice: { backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: spacing.md },
  noticeText: { color: c.onBrandTertiary, fontSize: font.sm, lineHeight: 18 },
}));

export function SelectField({ label, value, onPress, testID }: { label: string; value: string; onPress: () => void; testID: string }) {
  const s = useSelStyles();
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md, flex: 1 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable testID={testID} onPress={onPress} style={s.box}>
        <Text style={s.val} numberOfLines={1}>{value || "Select…"}</Text>
        <Icon name="chevron-down" color={colors.muted} />
      </Pressable>
    </View>
  );
}
const useSelStyles = makeStyles((c) => ({
  label: { fontSize: 12, fontWeight: "700", color: c.onSurfaceTertiary, marginBottom: spacing.xs, textTransform: "uppercase", letterSpacing: 0.4 },
  box: { minHeight: 48, borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", backgroundColor: c.surface },
  val: { flex: 1, fontSize: 16, color: c.onSurface },
}));

