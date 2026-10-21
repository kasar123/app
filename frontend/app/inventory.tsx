import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Chip, ChipRow, Empty, Header, HeaderAction, SearchBar, useScreenStyles, useUI } from "@/src/components/ui";
import { getProduct, norm, shopStatus } from "@/src/db/catalogue";
import { addToDraftOrders, awaitingIds } from "@/src/db/ops";
import { useDB } from "@/src/db/store";
import { buildXlsx, stamp } from "@/src/lib/excel";
import { outputBase64 } from "@/src/lib/files";
import { fmt } from "@/src/lib/money";
import { spacing } from "@/src/theme";
import { ProductRow } from "@/src/components/products";

type F = "all" | "in" | "low" | "out" | "awaiting";

export default function Inventory() {
  const params = useLocalSearchParams<{ filter?: F }>();
  const db = useDB();
  const ss = useScreenStyles();
  const router = useRouter();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState<F>(params.filter || "all");
  const [q, setQ] = useState("");
  const supName = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s.name])), [db.suppliers]);

  const list = useMemo(() => {
    const aw = awaitingIds();
    const nq = norm(q);
    return Object.values(db.inventory)
      .map((r) => ({ r, p: getProduct(r.productId) }))
      .filter(({ r, p }) => {
        if (!p) return false;
        const st = shopStatus(r);
        if (f === "in" && !(st === "in" || st === "low")) return false;
        if (f === "low" && st !== "low" && st !== "out") return false;
        if (f === "out" && st !== "out") return false;
        if (f === "awaiting" && !aw.has(p.id)) return false;
        return !nq || norm(p.name + " " + p.sku + " " + p.hsn).includes(nq);
      })
      .sort((a, b) => a.r.qty - b.r.qty);
  }, [db, f, q]);

  const valuation = useMemo(() => {
    let v = 0, n = 0;
    Object.values(db.inventory).forEach((r) => { if (r.valueRate !== null && r.qty > 0) { v += Math.round(r.qty * r.valueRate); n++; } });
    return { v, n };
  }, [db.inventory]);

  const requestAll = async () => {
    const ids = list.map((x) => x.p!.id);
    if (!ids.length) return;
    const ok = await ui.confirm({ title: `Add ${ids.length} products to supplier requests?`, message: "Each product goes to the draft request of its own supplier. Nothing is sent automatically.", confirmText: "Add" });
    if (!ok) return;
    addToDraftOrders(ids);
    ui.toast("Added to draft requests");
    router.push("/orders");
  };

  const exportXlsx = async () => {
    const rows: (string | number | null)[][] = [["Product", "Supplier", "Supplier SKU", "HSN", "Unit", "Condition", "Shop qty", "Min stock", "Reorder qty", "Status", "Location", "Serials", "Valuation rate", "Valuation"]];
    list.forEach(({ r, p }) => rows.push([p!.name, supName.get(p!.supplierId) || "", p!.sku, p!.hsn, p!.unit, p!.condition, r.qty, r.minStock, r.reorderQty, shopStatus(r), r.location, r.serials,
      r.valueRate !== null ? r.valueRate / 100 : null, r.valueRate !== null ? Math.round(r.qty * r.valueRate) / 100 : null]));
    try {
      ui.toast(await outputBase64(`inventory-${f}-${stamp()}.xlsx`, buildXlsx([{ name: "Inventory", rows, widths: [50, 16, 16, 10, 7, 11, 9, 9, 9, 9, 12, 20, 12, 12] }]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "share"));
    } catch (e: any) { ui.toast(e?.message || "Export failed", "error"); }
  };

  return (
    <View style={ss.screen}>
      <Header title="Inventory" subtitle={`${list.length} items${valuation.n ? ` · valuation ${fmt(valuation.v)} (${valuation.n} valued)` : ""}`}
        right={<HeaderAction testID="export-inventory-button" icon="file-excel-outline" onPress={exportXlsx} />} />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <SearchBar testID="inventory-search-input" value={q} onChangeText={setQ} placeholder="Search my stock…" />
      </View>
      <ChipRow>
        {(["all", "in", "low", "out", "awaiting"] as F[]).map((x) => (
          <Chip key={x} testID={`inventory-filter-${x}`} active={f === x} onPress={() => setF(x)}
            label={{ all: "All tracked", in: "In stock", low: "Low + out", out: "Out of stock", awaiting: "Awaiting replenishment" }[x]} />
        ))}
      </ChipRow>
      {(f === "low" || f === "out") && list.length > 0 && (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <Button testID="request-low-stock-button" variant="accent" icon="truck-plus-outline" title={`Add ${list.length} to supplier requests`} onPress={requestAll} />
        </View>
      )}
      <FlatList
        testID="inventory-list"
        data={list}
        keyExtractor={(x) => x.r.productId}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        renderItem={({ item, index }) => (
          <ProductRow p={item.p!} supplierName={supName.get(item.p!.supplierId) || ""} testID={`inventory-row-${index}`} onPress={() => router.push(`/product/${encodeURIComponent(item.p!.id)}`)} />
        )}
        ListEmptyComponent={
          <Empty icon="warehouse" title="Nothing here yet" testID="inventory-empty"
            text="Shop stock is tracked separately from supplier availability. Open any product from the catalogue and tap “Receive” to add it to your inventory."
            action={<Text style={ss.link} onPress={() => router.push("/catalogue")} testID="inventory-go-catalogue">Open catalogue</Text>} />
        }
      />
    </View>
  );
}
