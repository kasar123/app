import { useRouter } from "expo-router";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Header, Icon, IconName, Segmented, SectionTitle, useScreenStyles, useUI } from "@/src/components/ui";
import { mutate, useDB } from "@/src/db/store";
import { safeExit } from "@/src/lib/exit";
import { usesNativeTabs } from "@/src/navigation";
import { font, makeStyles, radius, setColorScheme, spacing, useTheme } from "@/src/theme";

const GROUPS: { title: string; items: { label: string; icon: IconName; href: string; id: string; sub?: string }[] }[] = [
  {
    title: "Stock",
    items: [
      { label: "Inventory", icon: "warehouse", href: "/inventory", id: "inventory", sub: "Physical shop stock" },
      { label: "Low / out of stock", icon: "alert-circle-outline", href: "/inventory?filter=low", id: "low-stock" },
      { label: "Supplier requests", icon: "truck-delivery-outline", href: "/orders", id: "orders", sub: "Replenishment PDF / Excel" },
      { label: "Suppliers", icon: "domain", href: "/suppliers", id: "suppliers" },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Customers", icon: "account-group-outline", href: "/customers", id: "customers" },
      { label: "Reports", icon: "chart-box-outline", href: "/reports", id: "reports" },
    ],
  },
  {
    title: "Data",
    items: [
      { label: "Import Excel catalogue", icon: "file-excel-outline", href: "/import", id: "import", sub: "Prices are never imported" },
      { label: "Duplicate review", icon: "content-duplicate", href: "/duplicates", id: "duplicates" },
      { label: "Backup & restore", icon: "backup-restore", href: "/backup", id: "backup" },
      { label: "Business settings", icon: "cog-outline", href: "/settings", id: "settings", sub: "Logo, GSTIN, bank, UPI, terms" },
    ],
  },
];

export default function More() {
  const db = useDB();
  const ss = useScreenStyles();
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const ui = useUI();
  const insets = useSafeAreaInsets();

  const exit = async () => {
    const ok = await ui.confirm({ title: "Exit TechronixHub?", message: "All records are saved on this phone before the app closes.", confirmText: "Save & Exit" });
    if (!ok) return;
    const r = await safeExit();
    if (r === "save-failed") ui.toast("Could not save data — app not closed. Check free storage.", "error");
    else if (r === "unsupported") ui.toast("All data saved. On this platform, close the app with the system gesture.", "info");
  };

  return (
    <View style={ss.screen}>
      <Header title="More" back={false} />
      <ScrollView contentContainerStyle={[ss.body, { paddingBottom: (usesNativeTabs ? insets.bottom : 0) + spacing.xl }]}>
        {GROUPS.map((g) => (
          <View key={g.title}>
            <SectionTitle title={g.title} />
            <View style={s.group}>
              {g.items.map((it, i) => (
                <Pressable key={it.id} testID={`more-${it.id}`} onPress={() => router.push(it.href as any)}
                  style={({ pressed }) => [s.item, i > 0 && s.itemBorder, pressed && { backgroundColor: colors.surfaceTertiary }]}>
                  <Icon name={it.icon} color={colors.brandPrimary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemText}>{it.label}</Text>
                    {it.sub ? <Text style={ss.muted}>{it.sub}</Text> : null}
                  </View>
                  <Icon name="chevron-right" color={colors.muted} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <SectionTitle title="Appearance" />
        <Segmented testID="theme-toggle" value={db.settings.theme}
          options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]}
          onChange={(v) => {
            mutate((d) => { d.settings.theme = v; });
            setColorScheme(v === "system" ? null : v);
          }} />
        <Pressable testID="exit-app-button" onPress={exit} style={({ pressed }) => [s.exit, pressed && { opacity: 0.8 }]}>
          <Icon name="exit-to-app" color={colors.onError} />
          <Text style={s.exitText}>Exit app</Text>
        </Pressable>
        <Text style={[ss.muted, { marginTop: spacing.sm, textAlign: "center" }]}>
          {Platform.OS === "android" ? "Exit saves all data and closes the app's screens. Android may keep the process cached on its own." : "All data is stored only on this device."}
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  group: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 56, paddingVertical: spacing.sm },
  itemBorder: { borderTopWidth: 1, borderTopColor: c.border },
  itemText: { fontSize: font.lg, color: c.onSurface, fontWeight: "600" },
  exit: { marginTop: spacing.xl, backgroundColor: c.error, borderRadius: radius.md, minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  exitText: { color: c.onError, fontSize: font.lg, fontWeight: "800" },
}));
