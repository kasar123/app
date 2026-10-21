import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductPicker } from "@/src/components/products";
import { Badge, Button, Card, Empty, Field, Header, Icon, Segmented, SectionTitle, useScreenStyles, useUI } from "@/src/components/ui";
import { addToDraftOrders, postReceived, setOrderStatus } from "@/src/db/ops";
import { audit, mutate, nowISO, OrderItem, uid, useDB } from "@/src/db/store";
import { fmtQty } from "@/src/lib/money";
import { exportOrderPdf, exportOrderXlsx, STATUSES, statusTone } from "@/src/lib/orderExport";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDB();
  const ss = useScreenStyles();
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [picker, setPicker] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const o = db.orders.find((x) => x.id === id);
  if (!o) return (<View style={ss.screen}><Header title="Request" /><Empty title="Request not found" testID="order-not-found" /></View>);
  const sup = db.suppliers.find((x) => x.id === o.supplierId);
  const editable = o.status === "Draft" || o.status === "Requested";
  const receiving = o.status === "Confirmed" || o.status === "Partially Received" || o.status === "Requested";

  const upd = (fn: () => void) => mutate(() => { fn(); o.updatedAt = nowISO(); });
  const updItem = (it: OrderItem, patch: Partial<OrderItem>) => upd(() => Object.assign(it, patch));
  const num = (t: string) => { const n = Number(t.replace(",", ".")); return isFinite(n) && n >= 0 ? n : 0; };

  const addProducts = (ps: { id: string; supplierId: string }[]) => {
    const own = ps.filter((p) => p.supplierId === o.supplierId);
    const other = ps.filter((p) => p.supplierId !== o.supplierId);
    if (own.length) {
      const ownIds = own.map((p) => p.id).filter((pid) => !o.items.some((i) => i.productId === pid));
      // reuse the helper's item builder by temporarily targeting this order
      if (o.status === "Draft") addToDraftOrders(ownIds);
      else {
        upd(() => ownIds.forEach((pid) => {
          const inv = db.inventory[pid];
          const p = own.find((x) => x.id === pid) as any;
          o.items.push({ id: uid(), productId: pid, name: p.name, sku: p.sku, url: p.url, unit: p.unit, qty: inv?.reorderQty || 1, currentStock: inv?.qty ?? 0, requiredStock: inv?.minStock ?? 0, remarks: "", receivedQty: 0, postedQty: 0 });
        }));
      }
    }
    if (other.length) {
      addToDraftOrders(other.map((p) => p.id));
      ui.toast(`${other.length} product(s) belong to another supplier — added to that supplier's draft`, "info");
    } else ui.toast("Products added");
  };

  const changeStatus = async () => {
    const v = await ui.pick("Change status", STATUSES.filter((x) => x !== o.status).map((x) => ({ value: x, label: x })));
    if (!v) return;
    if (v === "Cancelled" && !(await ui.confirm({ title: "Cancel this request?", danger: true, confirmText: "Cancel request", cancelText: "Keep" }))) return;
    setOrderStatus(o, v);
  };

  const run = async (fn: () => Promise<string>) => {
    try { ui.toast(await fn()); } catch (e: any) { if (!/cancel/i.test(e?.message || "")) ui.toast(e?.message || "Export failed", "error"); }
  };

  const exportMenu = async (kind: "pdf" | "xlsx") => {
    if (!o.items.length) return ui.toast("Add products first", "error");
    const opts: { value: string; label: string; sub?: string }[] = [
      { value: "share", label: "Share…", sub: "WhatsApp, email, Drive, etc." },
      { value: "save", label: "Save to a folder…", sub: "Choose a location on this phone" },
    ];
    if (kind === "pdf") opts.push({ value: "print", label: "Print" });
    const mode = await ui.pick(kind === "pdf" ? "Request PDF" : "Request Excel", opts);
    if (!mode) return;
    const ids = selected.length ? selected : undefined;
    await run(() => (kind === "pdf" ? exportOrderPdf(o, mode as any, ids) : exportOrderXlsx([o], mode as any, ids)));
  };

  const receive = async () => {
    const ok = await ui.confirm({ title: "Post received quantities to stock?", message: "Only the newly received difference is added to your shop stock.", confirmText: "Post to stock" });
    if (!ok) return;
    const n = postReceived(o);
    ui.toast(n ? `Stock updated for ${n} item(s)` : "Nothing new to post", n ? "success" : "info");
  };

  const remove = async () => {
    if (!(await ui.confirm({ title: "Delete draft request?", danger: true, confirmText: "Delete" }))) return;
    mutate((d) => { d.orders = d.orders.filter((x) => x.id !== o.id); audit("delete", "supplier-order", o.number); });
    router.back();
  };

  return (
    <View style={ss.screen}>
      <Header title={o.number} subtitle={sup?.name} />
      <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={[ss.row, { justifyContent: "space-between" }]}>
            <Badge label={o.status.toUpperCase()} tone={statusTone(o.status)} testID="order-status-badge" />
            <Button small testID="change-status-button" variant="secondary" title="Change status" onPress={changeStatus} />
          </View>
          <Text style={[ss.muted, { marginTop: spacing.sm }]}>Supplier: {sup?.name} {sup?.phone ? `· ${sup.phone}` : ""} · Date {o.date.split("-").reverse().join("/")}</Text>
          <View style={{ marginTop: spacing.md }}>
            <Segmented testID="order-urgency" value={o.urgency} onChange={(v) => upd(() => (o.urgency = v))} options={[{ value: "Normal", label: "Normal" }, { value: "Urgent", label: "Urgent" }]} />
          </View>
          <Field style={{ marginTop: spacing.md }} testID="order-remarks-input" label="Remarks" value={o.remarks} onChangeText={(t) => upd(() => (o.remarks = t))} multiline placeholder="Delivery by Friday, call before dispatch…" />
        </Card>

        <View style={[ss.row, { marginTop: spacing.md }]}>
          <Button style={{ flex: 1 }} testID="export-pdf-button" icon="file-pdf-box" title="PDF" onPress={() => exportMenu("pdf")} />
          <Button style={{ flex: 1 }} testID="export-excel-button" icon="file-excel-outline" variant="secondary" title="Excel" onPress={() => exportMenu("xlsx")} />
        </View>
        <Text style={[ss.muted, { marginTop: spacing.xs }]}>
          {selected.length ? `Exporting ${selected.length} selected item(s). ` : "Exports all items. Tap the box on items to export only selected. "}No prices, costs or taxes are included.
        </Text>

        <SectionTitle title={`Items (${o.items.length})`} right={editable ? <Text style={ss.link} onPress={() => setPicker(true)} testID="add-order-items-button">+ Add products</Text> : null} />
        {o.items.length === 0 && <Empty title="No items yet" text="Tap “+ Add products” to choose from the catalogue." testID="order-items-empty" />}
        {o.items.map((it, i) => {
          const on = selected.includes(it.id);
          return (
            <Card key={it.id} style={{ marginBottom: spacing.sm }} testID={`order-item-${i}`}>
              <View style={[ss.row, { alignItems: "flex-start" }]}>
                <Pressable testID={`order-item-select-${i}`} hitSlop={8} onPress={() => setSelected((x) => (on ? x.filter((y) => y !== it.id) : [...x, it.id]))}>
                  <Icon name={on ? "checkbox-marked" : "checkbox-blank-outline"} color={on ? colors.brandPrimary : colors.muted} />
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/product/${encodeURIComponent(it.productId)}`)}>
                  <Text style={ss.text} numberOfLines={2}>{it.name}</Text>
                  <Text style={ss.muted}>SKU {it.sku || "—"} · Current {fmtQty(it.currentStock)} · Required {fmtQty(it.requiredStock)}</Text>
                </Pressable>
                {editable && (
                  <Pressable testID={`order-item-remove-${i}`} hitSlop={8} onPress={() => upd(() => (o.items = o.items.filter((x) => x.id !== it.id)))}>
                    <Icon name="close" color={colors.muted} />
                  </Pressable>
                )}
              </View>
              <View style={[ss.row, { marginTop: spacing.sm }]}>
                <View style={s.qtyBox}>
                  <Text style={ss.muted}>Qty ({it.unit})</Text>
                  <View style={ss.row}>
                    <Pressable testID={`order-item-minus-${i}`} disabled={!editable} style={s.step} onPress={() => updItem(it, { qty: Math.max(1, it.qty - 1) })}><Icon name="minus" /></Pressable>
                    <TextInput testID={`order-item-qty-${i}`} editable={editable} style={s.qty} keyboardType="decimal-pad" value={String(it.qty)} onChangeText={(t) => updItem(it, { qty: num(t) })} />
                    <Pressable testID={`order-item-plus-${i}`} disabled={!editable} style={s.step} onPress={() => updItem(it, { qty: it.qty + 1 })}><Icon name="plus" /></Pressable>
                  </View>
                </View>
                {receiving && (
                  <View style={s.qtyBox}>
                    <Text style={ss.muted}>Received (posted {fmtQty(it.postedQty)})</Text>
                    <TextInput testID={`order-item-received-${i}`} style={[s.qty, { flex: 0, width: "100%" }]} keyboardType="decimal-pad" value={String(it.receivedQty)}
                      onChangeText={(t) => updItem(it, { receivedQty: Math.max(it.postedQty, num(t)) })} />
                  </View>
                )}
              </View>
              <TextInput testID={`order-item-remarks-${i}`} placeholder="Item remarks" placeholderTextColor={colors.muted} style={s.remarks} value={it.remarks} onChangeText={(t) => updItem(it, { remarks: t })} />
            </Card>
          );
        })}
        {receiving && o.items.length > 0 && <Button style={{ marginTop: spacing.sm }} testID="post-received-button" icon="package-down" variant="accent" title="Post received qty to stock" onPress={receive} />}
        {o.status === "Draft" && (
          <>
            <Button style={{ marginTop: spacing.md }} testID="mark-requested-button" icon="send-check" title="Mark as Requested" onPress={() => setOrderStatus(o, "Requested")} disabled={!o.items.length} />
            <Button style={{ marginTop: spacing.sm }} testID="delete-order-button" variant="ghost" icon="delete-outline" title="Delete draft" onPress={remove} />
          </>
        )}
        <SectionTitle title="Status history" />
        {o.history.map((h, i) => <Text key={i} style={ss.muted}>{new Date(h.at).toLocaleString()} — {h.status}</Text>)}
      </KeyboardAwareScrollView>
      <ProductPicker visible={picker} multi title={`Add products for ${sup?.name}`} onClose={() => setPicker(false)} onPick={addProducts} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  qtyBox: { flex: 1, gap: 4 },
  step: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  qty: { flex: 1, height: 44, borderWidth: 1, borderColor: c.borderStrong, borderRadius: radius.md, textAlign: "center", fontSize: font.lg, fontWeight: "700", color: c.onSurface, backgroundColor: c.surface },
  remarks: { marginTop: spacing.sm, minHeight: 44, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: c.onSurface, fontSize: font.base },
}));
