import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Field, Header, Segmented, SelectField, useScreenStyles, useUI } from "@/src/components/ui";
import { blankProduct, getProduct, productKey } from "@/src/db/catalogue";
import { addProduct, updateProduct } from "@/src/db/ops";
import { Condition, Product, useDB } from "@/src/db/store";
import { paiseToInput, toPaise } from "@/src/lib/money";
import { spacing } from "@/src/theme";

export default function ProductEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = id ? getProduct(decodeURIComponent(id)) : undefined;
  const db = useDB();
  const ss = useScreenStyles();
  const router = useRouter();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState(() => {
    const p = existing || blankProduct({ supplierId: db.suppliers[0]?.id || "", unit: db.settings.defaults.unit });
    return { ...p, sellingPriceText: paiseToInput(p.sellingPrice) };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));

  const save = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Product name is required";
    if (!f.supplierId) e.supplier = "Choose a supplier";
    if (f.hsn && !/^\d{4,8}$/.test(f.hsn)) e.hsn = "HSN must be 4–8 digits";
    if (f.sellingPriceText && !(Number(f.sellingPriceText) >= 0)) e.price = "Enter a valid amount";
    if (f.url && !/^https?:\/\//i.test(f.url)) e.url = "URL must start with http:// or https://";
    const newId = existing ? existing.id : productKey(f.supplierId, f.sku, f.name, f.variant);
    if (!existing && getProduct(newId)) e.sku = "A product with this supplier + SKU already exists";
    setErrors(e);
    if (Object.keys(e).length) return ui.toast("Please fix the highlighted fields", "error");
    const { sellingPriceText, ...rest } = f;
    const data: Product = { ...rest, name: f.name.trim(), sku: f.sku.trim(), sellingPrice: sellingPriceText.trim() ? toPaise(sellingPriceText) : null, id: newId };
    if (existing) {
      const patch: Partial<Product> = {};
      (Object.keys(data) as (keyof Product)[]).forEach((k) => { if ((data as any)[k] !== (existing as any)[k]) (patch as any)[k] = data[k]; });
      if (patch.hsn !== undefined && patch.hsnVerified === undefined) patch.hsnVerified = !!patch.hsn;
      updateProduct(existing.id, patch);
    } else addProduct({ ...data, hsnVerified: !!data.hsn, source: "manual" });
    ui.toast("Product saved");
    router.replace(`/product/${encodeURIComponent(newId)}`);
  };

  const pickSupplier = async () => {
    const v = await ui.pick("Supplier", db.suppliers.map((s) => ({ value: s.id, label: s.name })));
    if (v) set("supplierId", v);
  };
  const pickUnit = async () => {
    const v = await ui.pick("Unit", db.settings.units.map((u) => ({ value: u, label: u })));
    if (v) set("unit", v);
  };
  const pickGst = async () => {
    const v = await ui.pick<number | -1>("GST rate", [{ value: -1, label: "Not set" }, ...db.settings.taxRates.map((r) => ({ value: r, label: `${r}%` }))]);
    if (v !== null) set("gstRate", v === -1 ? null : v);
  };

  return (
    <View style={ss.screen}>
      <Header title={existing ? "Edit product" : "Add product"} />
      <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Field testID="product-name-input" label="Product name *" value={f.name} onChangeText={(t) => set("name", t)} error={errors.name} />
        <View style={ss.row}>
          <SelectField testID="product-supplier-select" label="Supplier *" value={db.suppliers.find((s) => s.id === f.supplierId)?.name || ""} onPress={pickSupplier} />
          <Field style={{ flex: 1 }} testID="product-sku-input" label="SKU / code" value={f.sku} onChangeText={(t) => set("sku", t)} error={errors.sku} autoCapitalize="characters" editable={!existing || existing.source === "manual"} />
        </View>
        {errors.supplier ? <Text style={{ color: "red" }}>{errors.supplier}</Text> : null}
        <View style={ss.row}>
          <Field style={{ flex: 1 }} testID="product-category-input" label="Category" value={f.category} onChangeText={(t) => set("category", t)} />
          <Field style={{ flex: 1 }} testID="product-subcategory-input" label="Subcategory" value={f.subcategory} onChangeText={(t) => set("subcategory", t)} />
        </View>
        <Field testID="product-variant-input" label="Variant" value={f.variant} onChangeText={(t) => set("variant", t)} editable={!existing || existing.source === "manual"} />
        <Field testID="product-description-input" label="Description" value={f.description} onChangeText={(t) => set("description", t)} multiline />
        <View style={ss.row}>
          <Field style={{ flex: 1 }} testID="product-hsn-input" label="HSN / SAC" value={f.hsn} onChangeText={(t) => set("hsn", t.replace(/\s/g, ""))} keyboardType="number-pad" error={errors.hsn} hint="Leave blank if unknown" />
          <SelectField testID="product-gst-select" label="GST rate" value={f.gstRate === null ? "Not set" : `${f.gstRate}%`} onPress={pickGst} />
        </View>
        <View style={ss.row}>
          <Field style={{ flex: 1 }} testID="product-price-input" label="My selling price (₹)" value={f.sellingPriceText} onChangeText={(t) => set("sellingPriceText", t)} keyboardType="decimal-pad" error={errors.price} />
          <SelectField testID="product-unit-select" label="Unit" value={f.unit} onPress={pickUnit} />
        </View>
        <Text style={[ss.muted, { marginBottom: spacing.xs }]}>CONDITION</Text>
        <Segmented<Condition> testID="product-condition" value={f.condition} onChange={(v) => set("condition", v)}
          options={[{ value: "New", label: "New" }, { value: "Refurbished", label: "Refurbished" }, { value: "Used", label: "Used" }]} />
        <Field style={{ marginTop: spacing.md }} testID="product-url-input" label="Product URL" value={f.url} onChangeText={(t) => set("url", t)} autoCapitalize="none" keyboardType="url" error={errors.url} />
        <Button testID="save-product-button" title="Save product" icon="content-save" onPress={save} />
      </KeyboardAwareScrollView>
    </View>
  );
}
