import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Chip, ChipRow, Empty, Header, Segmented, useScreenStyles, useUI } from "@/src/components/ui";
import { getProduct, shopStatus } from "@/src/db/catalogue";
import { getDB, useDB } from "@/src/db/store";
import { buildXlsx, stamp } from "@/src/lib/excel";
import { outputBase64 } from "@/src/lib/files";
import { calcInvoice, fmt } from "@/src/lib/money";
import { orderSheet } from "@/src/lib/orderExport";
import { spacing } from "@/src/theme";
import { invoiceRegisterRows } from "./(tabs)/invoices";

type Tab = "inventory" | "low" | "out" | "replenish" | "sales" | "register" | "outstanding" | "movements" | "productsales";
const TABS: { v: Tab; l: string }[] = [
  { v: "sales", l: "Sales" }, { v: "inventory", l: "Inventory" }, { v: "low", l: "Low stock" }, { v: "out", l: "Out of stock" },
  { v: "replenish", l: "Replenishment" }, { v: "register", l: "Invoice register" }, { v: "outstanding", l: "Outstanding" },
  { v: "movements", l: "Stock movements" }, { v: "productsales", l: "Product sales" },
];
type Cell = string | number | null;

function weekKey(d: string) {
  const dt = new Date(d + "T00:00:00");
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  return "Week of " + dt.toISOString().slice(0, 10);
}

function build(tab: Tab, period: "day" | "week" | "month"): { head: string[]; rows: Cell[][]; money?: number[] } {
  const db = getDB();
  const sup = new Map(db.suppliers.map((s) => [s.id, s.name]));
  const finals = db.invoices.filter((i) => i.status === "final");
  const invRows = (kind: "all" | "low" | "out") => Object.values(db.inventory).map((r) => ({ r, p: getProduct(r.productId) })).filter(({ r, p }) => {
    if (!p) return false;
    const st = shopStatus(r);
    return kind === "all" || (kind === "low" ? st === "low" : st === "out");
  });
  switch (tab) {
    case "inventory":
    case "low":
    case "out":
      return { head: ["Product", "Supplier", "SKU", "HSN", "Qty", "Min", "Reorder", "Status", "Location"],
        rows: invRows(tab === "inventory" ? "all" : tab).map(({ r, p }) => [p!.name, sup.get(p!.supplierId) || "", p!.sku, p!.hsn, r.qty, r.minStock, r.reorderQty, shopStatus(r), r.location]) };
    case "replenish": {
      const rows: Cell[][] = [];
      db.orders.filter((o) => !["Received", "Cancelled"].includes(o.status)).forEach((o) => o.items.forEach((it) => rows.push([it.name, sup.get(o.supplierId) || "", o.number, o.status, it.sku, it.qty, it.unit, it.currentStock, it.requiredStock])));
      rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
      return { head: ["Product", "Supplier", "Request", "Status", "Supplier SKU", "Qty", "Unit", "Current", "Required"], rows };
    }
    case "sales": {
      const m = new Map<string, { n: number; taxable: number; tax: number; total: number; paid: number }>();
      finals.forEach((i) => {
        const k = period === "day" ? i.date : period === "month" ? i.date.slice(0, 7) : weekKey(i.date);
        const c = calcInvoice(i);
        const e = m.get(k) || { n: 0, taxable: 0, tax: 0, total: 0, paid: 0 };
        e.n++; e.taxable += c.taxable; e.tax += c.tax; e.total += c.grand; e.paid += c.paid;
        m.set(k, e);
      });
      return { head: ["Period", "Invoices", "Taxable", "Tax", "Total", "Received"], money: [2, 3, 4, 5],
        rows: [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, e]) => [k, e.n, e.taxable, e.tax, e.total, e.paid]) };
    }
    case "register": {
      const r = invoiceRegisterRows(db.invoices.filter((i) => i.status !== "draft"));
      return { head: r[0] as string[], rows: r.slice(1) };
    }
    case "outstanding": {
      const m = new Map<string, { name: string; mobile: string; due: number; n: number }>();
      finals.forEach((i) => {
        const b = calcInvoice(i).balance;
        if (b <= 0) return;
        const k = i.customerId || i.billTo.name;
        const e = m.get(k) || { name: i.billTo.name, mobile: i.billTo.mobile, due: 0, n: 0 };
        e.due += b; e.n++;
        m.set(k, e);
      });
      return { head: ["Customer", "Mobile", "Invoices due", "Outstanding"], money: [3], rows: [...m.values()].sort((a, b) => b.due - a.due).map((e) => [e.name, e.mobile, e.n, e.due]) };
    }
    case "movements":
      return { head: ["Product", "Type", "Change", "Balance", "Ref", "Note", "Date"], rows: db.movements.map((m) => [m.productName, m.type, m.delta, m.balance, m.ref, m.note, new Date(m.at).toLocaleString()]) };
    case "productsales": {
      const m = new Map<string, { name: string; hsn: string; qty: number; amount: number }>();
      finals.forEach((i) => {
        const c = calcInvoice(i);
        i.items.forEach((it, idx) => {
          const k = it.productId || it.name.toLowerCase();
          const e = m.get(k) || { name: it.name, hsn: it.hsn, qty: 0, amount: 0 };
          e.qty += it.qty; e.amount += c.lines[idx].taxable;
          m.set(k, e);
        });
      });
      return { head: ["Product", "HSN", "Qty sold", "Taxable value"], money: [3], rows: [...m.values()].sort((a, b) => b.amount - a.amount).map((e) => [e.name, e.hsn, e.qty, e.amount]) };
    }
  }
}

export default function Reports() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const db = useDB();
  const ss = useScreenStyles();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(params.tab || "sales");
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const rep = useMemo(() => build(tab, period), [tab, period, db]);
  const show = (r: Cell[], i: number) => (rep.money?.includes(i) && typeof r[i] === "number" ? fmt(r[i] as number) : String(r[i] ?? ""));

  const exportX = async () => {
    try {
      if (tab === "replenish") {
        const open = getDB().orders.filter((o) => !["Received", "Cancelled"].includes(o.status));
        if (!open.length) return ui.toast("No open requests", "info");
        ui.toast(await outputBase64(`replenishment-by-supplier-${stamp()}.xlsx`, buildXlsx(open.map((o) => orderSheet(o))), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "share"));
        return;
      }
      const rows: Cell[][] = [rep.head, ...rep.rows.map((r) => r.map((c, i) => (rep.money?.includes(i) && typeof c === "number" ? c / 100 : c)))];
      ui.toast(await outputBase64(`report-${tab}-${stamp()}.xlsx`, buildXlsx([{ name: TABS.find((t) => t.v === tab)!.l, rows, widths: rep.head.map((_, i) => (i === 0 ? 45 : 14)) }]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "share"));
    } catch (e: any) { ui.toast(e?.message || "Export failed", "error"); }
  };

  return (
    <View style={ss.screen}>
      <Header title="Reports" subtitle="Based on your invoices and stock records only" />
      <ChipRow>{TABS.map((t) => <Chip key={t.v} testID={`report-tab-${t.v}`} label={t.l} active={tab === t.v} onPress={() => setTab(t.v)} />)}</ChipRow>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }}>
        {tab === "sales" && <Segmented testID="sales-period" value={period} onChange={setPeriod} options={[{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />}
        <Button small testID="export-report-button" icon="file-excel-outline" variant="secondary" title={`Export to Excel (${rep.rows.length} rows)`} onPress={exportX} />
      </View>
      <FlatList
        testID="report-list"
        data={rep.rows}
        keyExtractor={(_, i) => String(i)}
        initialNumToRender={20}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        renderItem={({ item, index }) => (
          <View style={ss.listItem} testID={`report-row-${index}`}>
            <Text style={ss.itemTitle} numberOfLines={2}>{show(item, 0)}</Text>
            <Text style={ss.muted} numberOfLines={3}>{rep.head.slice(1).map((h, i) => `${h}: ${show(item, i + 1) || "—"}`).join(" · ")}</Text>
          </View>
        )}
        ListEmptyComponent={<Empty icon="chart-box-outline" title="No data for this report yet" testID="report-empty" />}
      />
    </View>
  );
}
