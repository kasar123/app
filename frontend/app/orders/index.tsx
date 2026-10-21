import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, Chip, ChipRow, Empty, Header, HeaderAction, useScreenStyles, useUI } from "@/src/components/ui";
import { addToDraftOrders, lowStockIds } from "@/src/db/ops";
import { mutate, nextNumber, nowISO, OrderStatus, todayStr, uid, useDB } from "@/src/db/store";
import { exportOrderXlsx, STATUSES, statusTone } from "@/src/lib/orderExport";
import { spacing } from "@/src/theme";

export default function Orders() {
  const db = useDB();
  const ss = useScreenStyles();
  const router = useRouter();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [sup, setSup] = useState<string | undefined>();
  const [st, setSt] = useState<OrderStatus | "Open" | "All">("Open");
  const supName = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s.name])), [db.suppliers]);

  const list = useMemo(() => db.orders.filter((o) => {
    if (sup && o.supplierId !== sup) return false;
    if (st === "All") return true;
    if (st === "Open") return !["Received", "Cancelled"].includes(o.status);
    return o.status === st;
  }), [db.orders, sup, st]);

  const create = async () => {
    const supplierId = await ui.pick("Request for supplier", db.suppliers.map((s) => ({ value: s.id, label: s.name })));
    if (!supplierId) return;
    const id = uid();
    mutate((d) => {
      const date = todayStr();
      d.orders.unshift({ id, number: nextNumber("pr", date, (n) => d.orders.some((o) => o.number === n)), supplierId, status: "Draft", date, urgency: "Normal",
        remarks: "", items: [], history: [{ status: "Draft", at: nowISO() }], createdAt: nowISO(), updatedAt: nowISO() });
    });
    router.push(`/orders/${id}`);
  };

  const addLow = async () => {
    const ids = lowStockIds("both");
    if (!ids.length) return ui.toast("No low or out-of-stock products. Set minimum stock on products first.", "info");
    const ok = await ui.confirm({ title: `Add ${ids.length} low / out-of-stock products?`, message: "They are added to each supplier's draft request. Nothing is sent automatically.", confirmText: "Add" });
    if (!ok) return;
    const touched = addToDraftOrders(ids);
    ui.toast(`Updated ${touched.length} draft request(s)`);
  };

  const exportAll = async () => {
    if (!list.length) return ui.toast("No requests to export", "info");
    try {
      ui.toast(await exportOrderXlsx(list, "share", undefined, sup ? "-" + (supName.get(sup) || "") : ""));
    } catch (e: any) { ui.toast(e?.message || "Export failed", "error"); }
  };

  return (
    <View style={ss.screen}>
      <Header title="Supplier requests" subtitle="Stock replenishment — no prices"
        right={<HeaderAction testID="export-all-requests-button" icon="file-excel-outline" onPress={exportAll} />} />
      <View style={[ss.row, { paddingHorizontal: spacing.lg, paddingTop: spacing.md }]}>
        <Button style={{ flex: 1 }} testID="new-request-button" icon="plus" title="New request" onPress={create} />
        <Button style={{ flex: 1 }} testID="add-low-stock-button" variant="accent" icon="alert-circle-outline" title="Add low stock" onPress={addLow} />
      </View>
      <ChipRow>
        <Chip testID="orders-supplier-all" label="All suppliers" active={!sup} onPress={() => setSup(undefined)} />
        {db.suppliers.map((s) => <Chip key={s.id} testID={`orders-supplier-${s.id}`} label={s.name} active={sup === s.id} onPress={() => setSup(s.id)} />)}
      </ChipRow>
      <ChipRow>
        {(["Open", "All", ...STATUSES] as const).map((x) => <Chip key={x} testID={`orders-status-${x.replace(/ /g, "-").toLowerCase()}`} label={x} active={st === x} onPress={() => setSt(x)} />)}
      </ChipRow>
      <FlatList
        testID="orders-list"
        data={list}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        renderItem={({ item, index }) => (
          <Pressable testID={`order-row-${index}`} onPress={() => router.push(`/orders/${item.id}`)} style={({ pressed }) => [ss.listItem, pressed && { opacity: 0.7 }]}>
            <View style={[ss.row, { justifyContent: "space-between" }]}>
              <Text style={ss.itemTitle}>{item.number}</Text>
              <Badge label={item.status.toUpperCase()} tone={statusTone(item.status)} />
            </View>
            <Text style={ss.muted}>{supName.get(item.supplierId)} · {item.items.length} items · {item.date.split("-").reverse().join("/")}{item.urgency === "Urgent" ? " · URGENT" : ""}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Empty icon="truck-outline" title="No supplier requests" text="Add low-stock products or start a new request for a supplier." testID="orders-empty" />}
      />
    </View>
  );
}
