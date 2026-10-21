import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, Icon, IconName, SectionTitle, useScreenStyles } from "@/src/components/ui";
import { getProducts, shopStatus } from "@/src/db/catalogue";
import { awaitingIds } from "@/src/db/ops";
import { todayStr, useDB } from "@/src/db/store";
import { calcInvoice, fmt } from "@/src/lib/money";
import { usesNativeTabs } from "@/src/navigation";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const ACTIONS: { label: string; icon: IconName; href: string; id: string; accent?: boolean }[] = [
  { label: "Create Invoice", icon: "file-plus", href: "/invoice/new", id: "create-invoice", accent: true },
  { label: "Search Products", icon: "magnify", href: "/catalogue", id: "search-products" },
  { label: "Inventory", icon: "warehouse", href: "/inventory", id: "inventory" },
  { label: "Low Stock", icon: "alert-circle-outline", href: "/inventory?filter=low", id: "low-stock" },
  { label: "Supplier Requests", icon: "truck-delivery-outline", href: "/orders", id: "supplier-requests" },
  { label: "Customers", icon: "account-group-outline", href: "/customers", id: "customers" },
  { label: "Invoice History", icon: "history", href: "/invoices", id: "invoice-history" },
  { label: "Reports", icon: "chart-box-outline", href: "/reports", id: "reports" },
  { label: "Import / Export", icon: "file-excel-outline", href: "/import", id: "import-export" },
  { label: "Settings & Backup", icon: "cog-outline", href: "/more", id: "settings-backup" },
];

export default function Dashboard() {
  const db = useDB();
  const ss = useScreenStyles();
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const stats = useMemo(() => {
    const products = getProducts();
    let inStock = 0, low = 0, out = 0;
    for (const rec of Object.values(db.inventory)) {
      const st = shopStatus(rec);
      if (st === "in") inStock++;
      else if (st === "low") { low++; inStock++; }
      else if (st === "out") out++;
    }
    const today = todayStr();
    const todays = db.invoices.filter((i) => i.status === "final" && i.date === today);
    const sales = todays.reduce((a, i) => a + calcInvoice(i).grand, 0);
    const due = db.invoices.filter((i) => i.status === "final").reduce((a, i) => a + Math.max(0, calcInvoice(i).balance), 0);
    return { total: products.length, tracked: Object.keys(db.inventory).length, inStock, low, out, awaiting: awaitingIds().size, sales, count: todays.length, due };
  }, [db]);

  const statTiles: { label: string; value: string; id: string; href: string; tone?: string }[] = [
    { label: "Catalogue records", value: String(stats.total), id: "stat-total-products", href: "/catalogue" },
    { label: "In shop stock", value: String(stats.inStock), id: "stat-in-stock", href: "/inventory?filter=in", tone: colors.success },
    { label: "Low stock", value: String(stats.low), id: "stat-low-stock", href: "/inventory?filter=low", tone: colors.accent },
    { label: "Out of stock", value: String(stats.out), id: "stat-out-of-stock", href: "/inventory?filter=out", tone: colors.error },
    { label: "Awaiting replenishment", value: String(stats.awaiting), id: "stat-awaiting", href: "/orders", tone: colors.info },
    { label: "Outstanding dues", value: fmt(stats.due), id: "stat-outstanding", href: "/reports?tab=outstanding" },
  ];

  return (
    <View style={ss.screen}>
      <View style={[s.hero, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={s.heroSub}>{db.settings.business.parent || " "}</Text>
        <Text style={s.heroTitle} testID="dashboard-business-name">{db.settings.business.name || "TechronixHub India"}</Text>
        <View style={s.heroRow}>
          <View>
            <Text style={s.heroLabel}>Today&apos;s sales</Text>
            <Text style={s.heroValue} testID="dashboard-today-sales">{fmt(stats.sales)}</Text>
          </View>
          <View>
            <Text style={s.heroLabel}>Invoices today</Text>
            <Text style={s.heroValue}>{stats.count}</Text>
          </View>
          <View style={s.offline}>
            <Icon name="cloud-off-outline" size={14} color={colors.onBrandPrimary} />
            <Text style={s.offlineText}>Offline</Text>
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={[ss.body, { paddingBottom: bottomChrome + spacing.xl }]} testID="dashboard-scroll">
        <View style={s.grid}>
          {statTiles.map((t) => (
            <Pressable key={t.id} testID={t.id} onPress={() => router.push(t.href as any)} style={({ pressed }) => [s.stat, pressed && { opacity: 0.8 }]}>
              <Text style={[s.statValue, t.tone ? { color: t.tone } : null]} numberOfLines={1}>{t.value}</Text>
              <Text style={s.statLabel} numberOfLines={2}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <SectionTitle title="Quick actions" />
        <View style={s.grid}>
          {ACTIONS.map((a) => (
            <Pressable key={a.id} testID={`quick-${a.id}`} onPress={() => router.push(a.href as any)}
              style={({ pressed }) => [s.action, a.accent && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }, pressed && { opacity: 0.8 }]}>
              <Icon name={a.icon} size={26} color={a.accent ? colors.onBrandPrimary : colors.brandPrimary} />
              <Text style={[s.actionText, a.accent && { color: colors.onBrandPrimary }]} numberOfLines={2}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
        <SectionTitle title="Recent stock movements" right={<Text style={ss.link} onPress={() => router.push("/reports?tab=movements")} testID="view-all-movements">View all</Text>} />
        <Card>
          {db.movements.length === 0 ? (
            <Text style={ss.muted}>No stock movements yet. Open a product and tap “Receive stock” to start tracking your shop inventory.</Text>
          ) : (
            db.movements.slice(0, 6).map((m) => (
              <Pressable key={m.id} style={s.move} onPress={() => router.push(`/product/${encodeURIComponent(m.productId)}`)} testID={`movement-${m.id}`}>
                <Text style={[s.moveDelta, { color: m.delta >= 0 ? colors.success : colors.error }]}>{m.delta > 0 ? "+" : ""}{m.delta}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={ss.text} numberOfLines={1}>{m.productName}</Text>
                  <Text style={ss.muted}>{m.type.toUpperCase()} · bal {m.balance} · {new Date(m.at).toLocaleString()}</Text>
                </View>
              </Pressable>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  hero: { backgroundColor: c.surfaceInverse, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  heroSub: { color: c.accent, fontSize: font.sm, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  heroTitle: { color: c.onSurfaceInverse, fontSize: font.xxl, fontWeight: "800", marginTop: 2 },
  heroRow: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.lg, alignItems: "flex-end" },
  heroLabel: { color: c.onSurfaceInverse, opacity: 0.7, fontSize: font.sm },
  heroValue: { color: c.onSurfaceInverse, fontSize: font.xl, fontWeight: "800", marginTop: 2 },
  offline: { marginLeft: "auto", flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: c.brandPrimary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  offlineText: { color: c.onBrandPrimary, fontSize: 11, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stat: { width: "31.8%", backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: c.border, minHeight: 84 },
  statValue: { fontSize: font.xl, fontWeight: "800", color: c.onSurface },
  statLabel: { fontSize: 11, color: c.muted, marginTop: 4, fontWeight: "600" },
  action: { width: "48.7%", minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: c.borderStrong },
  actionText: { flex: 1, fontSize: font.base, fontWeight: "700", color: c.onSurface },
  move: { flexDirection: "row", gap: spacing.md, alignItems: "center", paddingVertical: spacing.sm },
  moveDelta: { width: 48, fontWeight: "800", fontSize: font.lg, textAlign: "right" },
}));
