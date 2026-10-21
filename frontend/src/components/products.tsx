import { useDeferredValue, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, Empty, SearchBar, useScreenStyles } from "@/src/components/ui";
import { searchProducts, shopStatus } from "@/src/db/catalogue";
import { Product, useDB } from "@/src/db/store";
import { fmt } from "@/src/lib/money";
import { makeStyles, spacing } from "@/src/theme";

export function ProductRow({ p, onPress, supplierName, testID }: { p: Product; onPress: () => void; supplierName: string; testID: string }) {
  const ss = useScreenStyles();
  const db = useDB();
  const inv = db.inventory[p.id];
  const st = shopStatus(inv);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ss.listItem, pressed && { opacity: 0.7 }]} testID={testID}>
      <Text style={ss.itemTitle} numberOfLines={2}>{p.name}{p.variant ? ` [${p.variant}]` : ""}</Text>
      <Text style={ss.muted} numberOfLines={1}>{supplierName} · SKU {p.sku || "—"} · {p.category || "Uncategorised"}{p.subcategory ? " › " + p.subcategory : ""}</Text>
      <View style={[ss.row, { flexWrap: "wrap", marginTop: 2 }]}>
        {st === "untracked" ? <Badge label="Not in shop stock" /> : <Badge label={`Shop: ${inv!.qty} ${p.unit}`} tone={st === "in" ? "success" : st === "low" ? "accent" : "error"} />}
        <Badge label={p.supplierStock === "in" ? "Supplier: in stock" : p.supplierStock === "out" ? "Supplier: out" : "Supplier: unknown"} tone="brand" />
        {p.hsn ? <Badge label={`HSN ${p.hsn}${p.hsnVerified ? " ✓" : ""}`} tone={p.hsnVerified ? "info" : "neutral"} /> : <Badge label="HSN missing" tone="warning" />}
        {p.sellingPrice !== null ? <Badge label={`My price ${fmt(p.sellingPrice)}`} tone="neutral" /> : null}
      </View>
    </Pressable>
  );
}

// Full-screen product search used by invoice and supplier-request screens.
export function ProductPicker({ visible, onClose, onPick, title, multi }: {
  visible: boolean; onClose: () => void; onPick: (p: Product[]) => void; title: string; multi?: boolean;
}) {
  const db = useDB();
  const ss = useScreenStyles();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Product[]>([]);
  const dq = useDeferredValue(q);
  const items = useMemo(() => (visible ? searchProducts(dq, {}).items.slice(0, 300) : []), [dq, visible, db]);
  const supName = useMemo(() => new Map(db.suppliers.map((x) => [x.id, x.name])), [db.suppliers]);
  const close = () => { setSel([]); setQ(""); onClose(); };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[ss.screen, { paddingTop: insets.top }]} testID="product-picker">
        <View style={s.top}>
          <Text style={ss.strong}>{title}</Text>
          <Button small testID="product-picker-close" variant="ghost" title="Close" onPress={close} />
        </View>
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <SearchBar testID="product-picker-search" value={q} onChangeText={setQ} placeholder="Search name, SKU, HSN…" autoFocus />
        </View>
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => {
            const on = sel.some((x) => x.id === item.id);
            return (
              <View style={on ? s.selected : undefined}>
                <ProductRow p={item} supplierName={(on ? "✓ " : "") + (supName.get(item.supplierId) || "")} testID={`picker-product-${index}`}
                  onPress={() => {
                    if (!multi) { onPick([item]); close(); return; }
                    setSel((x) => (on ? x.filter((y) => y.id !== item.id) : [...x, item]));
                  }} />
              </View>
            );
          }}
          ListEmptyComponent={<Empty title="No products found" testID="product-picker-empty" />}
        />
        {multi && (
          <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg }}>
            <Button testID="product-picker-confirm" title={`Add ${sel.length} selected`} disabled={!sel.length} onPress={() => { onPick(sel); close(); }} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg },
  selected: { borderLeftWidth: 4, borderLeftColor: c.brandPrimary },
}));
