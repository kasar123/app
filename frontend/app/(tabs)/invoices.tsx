import { useRouter } from "expo-router";
import { useDeferredValue, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, Chip, ChipRow, Empty, Header, HeaderAction, SearchBar, useScreenStyles, useUI } from "@/src/components/ui";
import { Invoice, useDB } from "@/src/db/store";
import { buildXlsx, stamp } from "@/src/lib/excel";
import { outputBase64 } from "@/src/lib/files";
import { calcInvoice, fmt } from "@/src/lib/money";
import { usesNativeTabs } from "@/src/navigation";
import { spacing, useTheme } from "@/src/theme";

type F = "all" | "draft" | "final" | "due" | "cancelled";

export function invoiceRegisterRows(list: Invoice[]) {
  const rows: (string | number | null)[][] = [["Invoice No", "Date", "Status", "Type", "Customer", "Mobile", "GSTIN", "Place of supply", "Supply", "Taxable", "CGST", "SGST", "IGST", "Grand total", "Received", "Balance", "Items"]];
  for (const i of list) {
    const c = calcInvoice(i);
    rows.push([i.number || "DRAFT", i.date, i.status, i.docType === "tax" ? "Tax Invoice" : "Bill of Supply", i.billTo.name, i.billTo.mobile, i.billTo.gstin, i.placeOfSupply,
      i.supplyType, c.taxable / 100, c.cgst / 100, c.sgst / 100, c.igst / 100, c.grand / 100, c.paid / 100, c.balance / 100, i.items.map((x) => `${x.name} x${x.qty}`).join("; ")]);
  }
  return rows;
}

export default function Invoices() {
  const db = useDB();
  const ss = useScreenStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [f, setF] = useState<F>("all");
  const dq = useDeferredValue(q.trim().toLowerCase());

  const list = useMemo(() => db.invoices.filter((i) => {
    if (f === "draft" && i.status !== "draft") return false;
    if (f === "final" && i.status !== "final") return false;
    if (f === "cancelled" && i.status !== "cancelled") return false;
    if (f === "due" && !(i.status === "final" && calcInvoice(i).balance > 0)) return false;
    if (!dq) return true;
    const dmy = i.date.split("-").reverse().join("/");
    return [i.number, i.date, dmy, i.billTo.name, i.billTo.mobile, ...i.items.map((x) => x.name + " " + x.hsn)].join(" ").toLowerCase().includes(dq);
  }), [db.invoices, f, dq]);

  const exportXlsx = async () => {
    try {
      const b64 = buildXlsx([{ name: "Invoice Register", rows: invoiceRegisterRows(list), widths: [18, 11, 10, 13, 24, 13, 17, 16, 8, 11, 10, 10, 10, 12, 11, 11, 50] }]);
      ui.toast(await outputBase64(`invoice-register-${stamp()}.xlsx`, b64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "share"));
    } catch (e: any) {
      ui.toast(e?.message || "Export failed", "error");
    }
  };

  return (
    <View style={ss.screen}>
      <Header title="Invoices" subtitle={`${list.length} shown`} back={false}
        right={<HeaderAction testID="export-invoices-button" icon="file-excel-outline" onPress={exportXlsx} />} />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}>
        <Button testID="new-invoice-button" title="New invoice" icon="plus" onPress={() => router.push("/invoice/new")} />
        <SearchBar testID="invoice-search-input" value={q} onChangeText={setQ} placeholder="Number, date, customer, product…" />
      </View>
      <ChipRow>
        {(["all", "draft", "final", "due", "cancelled"] as F[]).map((x) => (
          <Chip key={x} testID={`invoice-filter-${x}`} label={{ all: "All", draft: "Drafts", final: "Finalized", due: "Payment due", cancelled: "Cancelled" }[x]} active={f === x} onPress={() => setF(x)} />
        ))}
      </ChipRow>
      <FlatList
        testID="invoice-list"
        data={list}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: (usesNativeTabs ? insets.bottom : 0) + spacing.xl }}
        renderItem={({ item, index }) => {
          const c = calcInvoice(item);
          return (
            <Pressable testID={`invoice-row-${index}`} onPress={() => router.push(`/invoice/${item.id}`)} style={({ pressed }) => [ss.listItem, pressed && { opacity: 0.7 }]}>
              <View style={[ss.row, { justifyContent: "space-between" }]}>
                <Text style={ss.itemTitle}>{item.number || "Draft"}</Text>
                <Text style={[ss.strong, item.status === "cancelled" && { textDecorationLine: "line-through", color: colors.muted }]}>{fmt(c.grand)}</Text>
              </View>
              <View style={[ss.row, { justifyContent: "space-between" }]}>
                <Text style={ss.muted} numberOfLines={1}>{item.billTo.name || "No customer"} · {item.date.split("-").reverse().join("/")}</Text>
                <Badge label={item.status === "draft" ? "DRAFT" : item.status === "cancelled" ? "CANCELLED" : c.balance > 0 ? `DUE ${fmt(c.balance)}` : "PAID"}
                  tone={item.status === "draft" ? "warning" : item.status === "cancelled" ? "neutral" : c.balance > 0 ? "accent" : "success"} />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Empty icon="file-document-outline" title="No invoices" text="Tap “New invoice” to bill a customer." testID="invoice-list-empty" />}
      />
    </View>
  );
}
