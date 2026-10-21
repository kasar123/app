import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Share, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, Card, Empty, Field, Header, HeaderAction, Row, SectionTitle, useScreenStyles, useUI } from "@/src/components/ui";
import { getProduct, linkedProducts, shopStatus } from "@/src/db/catalogue";
import { addToDraftOrders, deleteProduct, moveStock, saveInv, updateProduct } from "@/src/db/ops";
import { MovementType, useDB } from "@/src/db/store";
import { fmt, paiseToInput, toPaise } from "@/src/lib/money";
import { spacing, useTheme } from "@/src/theme";

export default function ProductDetail() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = decodeURIComponent(rawId || "");
  const db = useDB();
  const ss = useScreenStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const p = getProduct(id);
  const inv = db.inventory[id];
  const [edit, setEdit] = useState<null | { minStock: string; reorderQty: string; location: string; serials: string; notes: string; valueRate: string }>(null);

  if (!p) return (<View style={ss.screen}><Header title="Product" /><Empty title="Product not found" text="It may have been deleted." testID="product-not-found" /></View>);
  const sup = db.suppliers.find((s) => s.id === p.supplierId);
  const st = shopStatus(inv);
  const linked = linkedProducts(id);
  const movements = db.movements.filter((m) => m.productId === id).slice(0, 30);

  const stockAction = async (type: MovementType) => {
    const labels = { receive: "Receive stock", sale: "Record sale / deduction", return: "Record customer return", adjust: "Stock adjustment" };
    const v = await ui.prompt({
      title: labels[type], keyboardType: type === "adjust" ? "numbers-and-punctuation" : "decimal-pad", confirmText: "Save",
      message: type === "adjust" ? "Enter the change, e.g. 5 or -2 (use for counting corrections)." : `Quantity in ${p.unit}. Current shop stock: ${inv?.qty ?? 0}`,
      placeholder: type === "adjust" ? "-2" : "1",
    });
    if (v === null) return;
    const n = Number(v.replace(",", "."));
    if (!isFinite(n) || n === 0 || (type !== "adjust" && n < 0)) return ui.toast("Enter a valid quantity", "error");
    if (type === "sale" && (inv?.qty ?? 0) - n < 0) return ui.toast(`Only ${inv?.qty ?? 0} in stock — cannot deduct ${n}`, "error");
    const note = type === "adjust" ? (await ui.prompt({ title: "Reason (optional)", placeholder: "Stock count correction" })) || "" : "";
    moveStock(id, type, n, "", note);
    ui.toast("Stock updated");
  };

  const setHsn = async () => {
    const v = await ui.prompt({ title: "HSN / SAC code", message: "Enter the code you have verified for this product. It will not be copied to other products.", initial: p.hsn, keyboardType: "number-pad" });
    if (v === null) return;
    const code = v.replace(/\s/g, "");
    if (code && !/^\d{4,8}$/.test(code)) return ui.toast("HSN must be 4–8 digits", "error");
    updateProduct(id, { hsn: code, hsnVerified: !!code });
    ui.toast(code ? "HSN saved as verified" : "HSN cleared");
  };

  const saveSettings = () => {
    if (!edit) return;
    const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
    const min = num(edit.minStock), re = num(edit.reorderQty);
    if (!isFinite(min) || min < 0 || !isFinite(re) || re < 0) return ui.toast("Thresholds must be zero or more", "error");
    saveInv(id, { minStock: min, reorderQty: re, location: edit.location.trim(), serials: edit.serials.trim(), notes: edit.notes.trim(), valueRate: edit.valueRate.trim() ? toPaise(edit.valueRate) : null });
    setEdit(null);
    ui.toast("Stock settings saved");
  };

  const addToRequest = () => {
    addToDraftOrders([id]);
    ui.toast(`Added to ${sup?.name || "supplier"} draft request`);
  };

  const remove = async () => {
    const ok = await ui.confirm({ title: "Delete product?", message: "The product and its shop-stock record will be removed. Past invoices keep their own copy of the item details.", danger: true, confirmText: "Delete" });
    if (!ok) return;
    deleteProduct(id);
    router.back();
  };

  return (
    <View style={ss.screen}>
      <Header title={p.name} subtitle={`${sup?.name || p.supplierId} · ${p.sku || "no SKU"}`}
        right={<HeaderAction testID="edit-product-button" icon="pencil" onPress={() => router.push(`/product/edit?id=${encodeURIComponent(id)}`)} />} />
      <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Card testID="shop-stock-card">
          <View style={[ss.row, { justifyContent: "space-between" }]}>
            <Text style={ss.muted}>MY SHOP STOCK</Text>
            {st === "untracked" ? <Badge label="Not tracked yet" /> : <Badge label={st === "in" ? "In stock" : st === "low" ? "Low stock" : "Out of stock"} tone={st === "in" ? "success" : st === "low" ? "accent" : "error"} />}
          </View>
          <Text style={[ss.h1, { marginVertical: spacing.sm }]} testID="shop-stock-qty">{inv?.qty ?? 0} <Text style={ss.muted}>{p.unit}</Text></Text>
          <Text style={ss.muted}>Min {inv?.minStock ?? 0} · Reorder {inv?.reorderQty ?? 0}{inv?.location ? ` · ${inv.location}` : ""}</Text>
          <View style={[ss.wrap, { marginTop: spacing.md }]}>
            <Button small testID="receive-stock-button" icon="plus-box" title="Receive" onPress={() => stockAction("receive")} />
            <Button small testID="sale-stock-button" icon="minus-box" variant="secondary" title="Sale" onPress={() => stockAction("sale")} />
            <Button small testID="return-stock-button" icon="keyboard-return" variant="secondary" title="Return" onPress={() => stockAction("return")} />
            <Button small testID="adjust-stock-button" icon="tune-vertical" variant="ghost" title="Adjust" onPress={() => stockAction("adjust")} />
          </View>
          {!edit ? (
            <Button small style={{ marginTop: spacing.sm }} testID="stock-settings-button" variant="ghost" icon="cog-outline" title="Thresholds, location, serials"
              onPress={() => setEdit({ minStock: String(inv?.minStock ?? 0), reorderQty: String(inv?.reorderQty ?? 0), location: inv?.location || "", serials: inv?.serials || "", notes: inv?.notes || "", valueRate: paiseToInput(inv?.valueRate) })} />
          ) : (
            <View style={{ marginTop: spacing.md }}>
              <View style={ss.row}>
                <Field style={{ flex: 1 }} testID="min-stock-input" label="Min stock" keyboardType="decimal-pad" value={edit.minStock} onChangeText={(t) => setEdit({ ...edit, minStock: t })} />
                <Field style={{ flex: 1 }} testID="reorder-qty-input" label="Reorder qty" keyboardType="decimal-pad" value={edit.reorderQty} onChangeText={(t) => setEdit({ ...edit, reorderQty: t })} />
              </View>
              <Field testID="location-input" label="Storage location" value={edit.location} onChangeText={(t) => setEdit({ ...edit, location: t })} placeholder="Rack A2" />
              <Field testID="serials-input" label="Serial numbers / IMEI" value={edit.serials} onChangeText={(t) => setEdit({ ...edit, serials: t })} multiline placeholder="One per line" />
              <Field testID="valuation-rate-input" label="Valuation rate per unit (optional, ₹)" hint="Your own value for stock valuation. Leave blank to skip." keyboardType="decimal-pad" value={edit.valueRate} onChangeText={(t) => setEdit({ ...edit, valueRate: t })} />
              <Field testID="inventory-notes-input" label="Notes" value={edit.notes} onChangeText={(t) => setEdit({ ...edit, notes: t })} multiline />
              <View style={ss.row}>
                <Button style={{ flex: 1 }} testID="stock-settings-cancel" variant="ghost" title="Cancel" onPress={() => setEdit(null)} />
                <Button style={{ flex: 1 }} testID="stock-settings-save" title="Save" onPress={saveSettings} />
              </View>
            </View>
          )}
        </Card>

        <Button style={{ marginTop: spacing.md }} testID="add-to-request-button" variant="accent" icon="truck-plus-outline" title="Add to supplier request" onPress={addToRequest} />

        <SectionTitle title="HSN & billing" />
        <Card>
          <View style={[ss.row, { justifyContent: "space-between" }]}>
            <View>
              <Text style={ss.muted}>HSN / SAC</Text>
              <Text style={ss.strong} testID="product-hsn">{p.hsn || "Missing"}</Text>
            </View>
            {p.hsn ? <Badge label={p.hsnVerified ? "VERIFIED" : "UNVERIFIED"} tone={p.hsnVerified ? "success" : "warning"} /> : <Badge label="NOT ASSIGNED" tone="warning" />}
            <Button small testID="set-hsn-button" variant="secondary" title={p.hsn ? "Edit" : "Assign"} onPress={setHsn} />
          </View>
          <View style={ss.divider} />
          <Row label="My selling price" value={p.sellingPrice !== null ? fmt(p.sellingPrice) : "Not set"} testID="product-selling-price" />
          <Row label="GST rate" value={p.gstRate !== null ? `${p.gstRate}%` : "Not set"} />
          <Row label="Unit" value={p.unit} />
          <Row label="Condition" value={p.condition} />
        </Card>

        <SectionTitle title="Supplier catalogue info" />
        <Card>
          <Row label="Supplier" value={sup?.name || p.supplierId} />
          <Row label="Supplier SKU" value={p.sku} testID="product-sku" />
          <Row label="Category" value={[p.category, p.subcategory].filter(Boolean).join(" › ")} />
          <Row label="Variant" value={p.variant} />
          <Row label="Supplier availability" value={(p.supplierStock === "in" ? "In stock" : p.supplierStock === "out" ? "Out of stock" : "Unknown") + (p.supplierQty !== null ? ` (${p.supplierQty})` : "")} />
          <Text style={[ss.muted, { marginTop: spacing.xs }]}>Supplier availability is informational and never counted as your shop stock.</Text>
          {p.description ? <Text style={[ss.text, { marginTop: spacing.sm }]}>{p.description}</Text> : null}
          {p.url ? (
            <View style={[ss.row, { marginTop: spacing.md }]}>
              <Button small style={{ flex: 1 }} testID="open-url-button" variant="ghost" icon="open-in-new" title="Open link" onPress={() => Linking.openURL(p.url).catch(() => ui.toast("No internet / browser available", "error"))} />
              <Button small style={{ flex: 1 }} testID="share-url-button" variant="ghost" icon="share-variant" title="Share link" onPress={() => Share.share({ message: p.url })} />
            </View>
          ) : null}
        </Card>

        {linked.length > 0 && (
          <>
            <SectionTitle title="Same product at other suppliers" />
            {linked.map((l) => (
              <Card key={l.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push(`/product/${encodeURIComponent(l.id)}`)} testID={`linked-${l.id}`}>
                <Text style={ss.text}>{db.suppliers.find((s) => s.id === l.supplierId)?.name} · {l.sku}</Text>
              </Card>
            ))}
          </>
        )}

        <SectionTitle title="Stock movement history" />
        {movements.length === 0 ? <Text style={ss.muted}>No movements yet.</Text> : (
          <Card>
            {movements.map((m) => (
              <View key={m.id} style={[ss.row, { paddingVertical: 6 }]}>
                <Text style={{ width: 56, fontWeight: "800", color: m.delta >= 0 ? colors.success : colors.error }}>{m.delta > 0 ? "+" : ""}{m.delta}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={ss.text}>{m.type.toUpperCase()}{m.ref ? ` · ${m.ref}` : ""} · bal {m.balance}</Text>
                  <Text style={ss.muted}>{new Date(m.at).toLocaleString()}{m.note ? ` · ${m.note}` : ""}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}
        <Button style={{ marginTop: spacing.xl }} testID="delete-product-button" variant="ghost" icon="delete-outline" title="Delete product" onPress={remove} />
      </KeyboardAwareScrollView>
    </View>
  );
}
