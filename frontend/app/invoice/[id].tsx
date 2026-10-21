import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductPicker } from "@/src/components/products";
import { Badge, Button, Card, Empty, Field, Header, Icon, Row, Segmented, SectionTitle, SelectField, useScreenStyles, useUI } from "@/src/components/ui";
import {
  addPayment, cancelInvoice, customerOutstanding, deleteDraft, duplicateInvoice, finalizeInvoice, newDraft, saveCustomer, saveDraft,
} from "@/src/db/ops";
import { getDB, Invoice, InvItem, nowISO, Product, uid, useDB } from "@/src/db/store";
import { outputPdf } from "@/src/lib/files";
import { calcInvoice, fmt, fmtQty, GSTIN_RE, paiseToInput, STATES, toPaise } from "@/src/lib/money";
import { invoiceHtml } from "@/src/lib/pdf";
import { setPreview } from "@/src/lib/preview";
import { safeName, stamp } from "@/src/lib/excel";
import { font, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const MODES = ["Cash", "UPI", "Card", "Bank transfer", "Cheque", "Credit"];
const blankItem = (gst: number, unit: string): InvItem => ({ id: uid(), productId: null, name: "", description: "", hsn: "", qty: 1, unit, rate: 0, discount: 0, gstRate: gst, serial: "", warranty: "", condition: "" });

function ItemSheet({ item, onSave, onClose, onDelete }: { item: InvItem | null; onSave: (i: InvItem) => void; onClose: () => void; onDelete: () => void }) {
  const ss = useScreenStyles();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const db = useDB();
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (item) setF({ ...item, qtyT: fmtQty(item.qty), rateT: paiseToInput(item.rate), discT: paiseToInput(item.discount) });
  }, [item]);
  if (!item || !f) return null;
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const save = () => {
    const qty = Number(String(f.qtyT).replace(",", "."));
    if (!f.name.trim()) return ui.toast("Item name is required", "error");
    if (!(qty > 0)) return ui.toast("Quantity must be more than 0", "error");
    if (f.rateT === "" || !(Number(f.rateT) >= 0)) return ui.toast("Enter your rate (₹)", "error");
    if (f.hsn && !/^\d{4,8}$/.test(f.hsn)) return ui.toast("HSN/SAC must be 4–8 digits", "error");
    const { qtyT, rateT, discT, ...rest } = f;
    onSave({ ...rest, name: f.name.trim(), qty, rate: toPaise(rateT), discount: toPaise(discT) });
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[ss.screen, { paddingTop: insets.top }]} testID="item-sheet">
        <View style={[ss.row, { justifyContent: "space-between", padding: spacing.lg }]}>
          <Text style={ss.strong}>Invoice item</Text>
          <Button small testID="item-sheet-close" variant="ghost" title="Close" onPress={onClose} />
        </View>
        <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingTop: 0, paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
          <Field testID="item-name-input" label="Product name *" value={f.name} onChangeText={(t) => set("name", t)} />
          <Field testID="item-description-input" label="Description" value={f.description} onChangeText={(t) => set("description", t)} placeholder="e.g. 500 GB / Refurbished" />
          <View style={ss.row}>
            <Field style={{ flex: 1 }} testID="item-qty-input" label="Qty *" keyboardType="decimal-pad" value={f.qtyT} onChangeText={(t) => set("qtyT", t)} />
            <SelectField testID="item-unit-select" label="Unit" value={f.unit} onPress={async () => { const v = await ui.pick("Unit", db.settings.units.map((u) => ({ value: u, label: u }))); if (v) set("unit", v); }} />
          </View>
          <View style={ss.row}>
            <Field style={{ flex: 1 }} testID="item-rate-input" label="My rate (₹) *" keyboardType="decimal-pad" value={f.rateT} onChangeText={(t) => set("rateT", t)} />
            <Field style={{ flex: 1 }} testID="item-discount-input" label="Item discount (₹)" keyboardType="decimal-pad" value={f.discT} onChangeText={(t) => set("discT", t)} />
          </View>
          <View style={ss.row}>
            <Field style={{ flex: 1 }} testID="item-hsn-input" label="HSN / SAC" keyboardType="number-pad" value={f.hsn} onChangeText={(t) => set("hsn", t.replace(/\s/g, ""))} />
            <SelectField testID="item-gst-select" label="GST rate" value={`${f.gstRate}%`} onPress={async () => { const v = await ui.pick<number>("GST rate", db.settings.taxRates.map((r) => ({ value: r, label: `${r}%` }))); if (v !== null) set("gstRate", v); }} />
          </View>
          <Field testID="item-serial-input" label="Serial no. / IMEI" value={f.serial} onChangeText={(t) => set("serial", t)} />
          <View style={ss.row}>
            <Field style={{ flex: 1 }} testID="item-warranty-input" label="Warranty" value={f.warranty} onChangeText={(t) => set("warranty", t)} placeholder="6 months" />
            <SelectField testID="item-condition-select" label="Condition" value={f.condition || "—"} onPress={async () => { const v = await ui.pick("Condition", ["", "New", "Refurbished", "Used"].map((c) => ({ value: c, label: c || "Not shown" }))); if (v !== null) set("condition", v); }} />
          </View>
          <Button testID="item-save-button" title="Save item" icon="check" onPress={save} />
          <Button style={{ marginTop: spacing.sm }} testID="item-delete-button" variant="ghost" icon="delete-outline" title="Remove item" onPress={onDelete} />
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useDB();
  const ss = useScreenStyles();
  const created = useRef(false);

  useEffect(() => {
    if (id === "new" && !created.current) {
      created.current = true;
      const d = newDraft();
      router.replace(`/invoice/${d.id}`);
    }
  }, [id, router]);

  const stored = db.invoices.find((x) => x.id === id);
  if (id === "new") return <View style={ss.screen}><Header title="New invoice" /></View>;
  if (!stored) return (<View style={ss.screen}><Header title="Invoice" /><Empty title="Invoice not found" testID="invoice-not-found" /></View>);
  return stored.status === "draft" ? <DraftEditor key={stored.id} initial={stored} /> : <InvoiceView inv={stored} />;
}

function DraftEditor({ initial }: { initial: Invoice }) {
  const router = useRouter();
  const db = useDB();
  const ss = useScreenStyles();
  const s = useStyles();
  const { colors } = useTheme();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [inv, setInv] = useState<Invoice>(() => JSON.parse(JSON.stringify(initial)));
  const [editing, setEditing] = useState<InvItem | null>(null);
  const [picker, setPicker] = useState(false);
  const [shipSame, setShipSame] = useState(!initial.shipTo.name && !initial.shipTo.address);
  const [deduct, setDeduct] = useState(true);
  const [txt, setTxt] = useState({ disc: paiseToInput(inv.invoiceDiscount), charges: paiseToInput(inv.charges), prev: paiseToInput(inv.previousBalance), paid: paiseToInput(inv.payments[0]?.amount ?? null) });
  const c = calcInvoice(inv);
  const st = getDB().settings;

  useEffect(() => { saveDraft(inv); }, [inv]);
  const up = (patch: Partial<Invoice>) => setInv((x) => {
    const n = { ...x, ...patch };
    if (patch.placeOfSupply !== undefined && st.business.state) n.supplyType = patch.placeOfSupply === st.business.state ? "intra" : "inter";
    return n;
  });
  const upBill = (patch: Partial<Invoice["billTo"]>) => setInv((x) => ({ ...x, billTo: { ...x.billTo, ...patch } }));

  const chooseCustomer = async () => {
    if (!db.customers.length) return ui.toast("No saved customers yet — type the details below", "info");
    const cid = await ui.pick("Select customer", db.customers.map((cu) => ({ value: cu.id, label: cu.name, sub: [cu.mobile, cu.gstin].filter(Boolean).join(" · ") })));
    if (!cid) return;
    const cu = db.customers.find((x) => x.id === cid)!;
    const pos = cu.state || inv.placeOfSupply;
    up({ customerId: cu.id, billTo: { name: cu.name, address: cu.billingAddress, mobile: cu.mobile, gstin: cu.gstin, state: cu.state }, shipTo: { name: cu.name, address: cu.shippingAddress || cu.billingAddress }, placeOfSupply: pos });
    setShipSame(!cu.shippingAddress || cu.shippingAddress === cu.billingAddress);
  };

  const addFromCatalogue = (ps: Product[]) => {
    const items = ps.map((p) => ({
      ...blankItem(p.gstRate ?? st.defaults.gstRate, p.unit), productId: p.id, name: p.name + (p.variant ? ` [${p.variant}]` : ""), hsn: p.hsn,
      rate: p.sellingPrice ?? 0, condition: p.condition !== "New" ? p.condition : "",
    }));
    setInv((x) => ({ ...x, items: [...x.items, ...items] }));
    if (items.length === 1) setEditing(items[0]);
    if (ps.some((p) => p.sellingPrice === null)) ui.toast("Enter your rate — no selling price set for this product", "info");
  };

  const setMoney = (k: keyof typeof txt, v: string) => {
    setTxt((x) => ({ ...x, [k]: v }));
    if (k === "disc") up({ invoiceDiscount: toPaise(v) });
    if (k === "charges") up({ charges: toPaise(v) });
    if (k === "prev") up({ previousBalance: toPaise(v) });
    if (k === "paid") up({ payments: toPaise(v) > 0 ? [{ id: inv.payments[0]?.id || uid(), amount: toPaise(v), mode: inv.paymentMode, date: inv.date, note: "At billing" }] : [] });
  };

  const validate = () => {
    if (!inv.billTo.name.trim()) return "Customer name is required";
    if (!inv.items.length) return "Add at least one item";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inv.date) || isNaN(Date.parse(inv.date))) return "Invoice date must be YYYY-MM-DD";
    if (inv.billTo.gstin && !GSTIN_RE.test(inv.billTo.gstin)) return "Customer GSTIN format looks wrong";
    if (inv.billTo.mobile && !/^\+?\d{10,13}$/.test(inv.billTo.mobile.replace(/\s/g, ""))) return "Mobile number looks wrong";
    if (c.grand < 0) return "Total cannot be negative";
    return null;
  };

  const preview = async () => {
    const html = invoiceHtml(inv, st);
    if (Platform.OS === "web") { await outputPdf("preview.pdf", html, "print"); return; }
    setPreview(html, inv.number || "Draft preview");
    router.push("/preview");
  };

  const finalize = async () => {
    const err = validate();
    if (err) return ui.toast(err, "error");
    const noHsn = inv.docType === "tax" && inv.items.some((i) => !i.hsn);
    const ok = await ui.confirm({
      title: "Finalize invoice?",
      message: `${fmt(c.grand)} for ${inv.billTo.name}. An invoice number is assigned and the invoice can no longer be edited (only cancelled).${noHsn ? "\n\nWarning: some items have no HSN code." : ""}${deduct ? "\n\nCatalogue items will be deducted from shop stock." : ""}`,
      confirmText: "Finalize",
    });
    if (!ok) return;
    let customerId = inv.customerId;
    if (!customerId) {
      customerId = uid();
      saveCustomer({ id: customerId, name: inv.billTo.name.trim(), mobile: inv.billTo.mobile, billingAddress: inv.billTo.address, shippingAddress: shipSame ? "" : inv.shipTo.address, gstin: inv.billTo.gstin, state: inv.billTo.state, email: "", notes: "", createdAt: nowISO() });
    }
    const final = { ...inv, customerId, shipTo: shipSame ? { name: inv.billTo.name, address: inv.billTo.address } : inv.shipTo, payments: inv.payments.map((p) => ({ ...p, mode: inv.paymentMode, date: inv.date })) };
    saveDraft(final);
    const num = finalizeInvoice(inv.id, { deductStock: deduct });
    ui.toast(`Invoice ${num} finalized`);
  };

  const removeDraft = async () => {
    if (!(await ui.confirm({ title: "Delete this draft?", danger: true, confirmText: "Delete" }))) return;
    deleteDraft(inv.id);
    router.back();
  };

  return (
    <View style={ss.screen}>
      <Header title="Draft invoice" subtitle="Auto-saved · number assigned on finalize"
        right={<Pressable testID="preview-invoice-button" onPress={preview} style={s.hdrBtn}><Icon name="eye-outline" color={colors.brandPrimary} /></Pressable>} />
      <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Segmented testID="doc-type" value={inv.docType} onChange={(v) => up({ docType: v })} options={[{ value: "tax", label: "Tax Invoice" }, { value: "bos", label: "Bill of Supply" }]} />
        <Field style={{ marginTop: spacing.md }} testID="invoice-date-input" label="Invoice date (YYYY-MM-DD)" value={inv.date} onChangeText={(t) => up({ date: t })} keyboardType="numbers-and-punctuation" />

        <SectionTitle title="Bill to" right={<Text style={ss.link} onPress={chooseCustomer} testID="select-customer-button">Select existing</Text>} />
        {inv.customerId ? <Badge label="Saved customer" tone="brand" /> : <Text style={ss.muted}>New customers are saved automatically on finalize.</Text>}
        <Field style={{ marginTop: spacing.sm }} testID="bill-name-input" label="Customer name *" value={inv.billTo.name} onChangeText={(t) => upBill({ name: t })} />
        <View style={ss.row}>
          <Field style={{ flex: 1 }} testID="bill-mobile-input" label="Mobile" keyboardType="phone-pad" value={inv.billTo.mobile} onChangeText={(t) => upBill({ mobile: t })} />
          <Field style={{ flex: 1 }} testID="bill-gstin-input" label="GSTIN" autoCapitalize="characters" value={inv.billTo.gstin} onChangeText={(t) => upBill({ gstin: t.toUpperCase().trim() })} />
        </View>
        <Field testID="bill-address-input" label="Billing address" value={inv.billTo.address} onChangeText={(t) => upBill({ address: t })} multiline />
        <View style={[ss.row, { justifyContent: "space-between", marginBottom: spacing.sm }]}>
          <Text style={ss.text}>Ship to same as billing</Text>
          <Switch testID="ship-same-switch" value={shipSame} onValueChange={setShipSame} />
        </View>
        {!shipSame && (
          <>
            <Field testID="ship-name-input" label="Ship to name" value={inv.shipTo.name} onChangeText={(t) => up({ shipTo: { ...inv.shipTo, name: t } })} />
            <Field testID="ship-address-input" label="Shipping address" value={inv.shipTo.address} onChangeText={(t) => up({ shipTo: { ...inv.shipTo, address: t } })} multiline />
          </>
        )}
        <View style={ss.row}>
          <SelectField testID="place-of-supply-select" label="Place of supply" value={inv.placeOfSupply} onPress={async () => { const v = await ui.pick("Place of supply", STATES.map((x) => ({ value: x, label: x }))); if (v) { up({ placeOfSupply: v }); if (!inv.billTo.state) upBill({ state: v }); } }} />
        </View>
        {inv.docType === "tax" && (
          <>
            <Segmented testID="supply-type" value={inv.supplyType} onChange={(v) => up({ supplyType: v })} options={[{ value: "intra", label: "Intra-state CGST+SGST" }, { value: "inter", label: "Inter-state IGST" }]} />
            <Text style={[ss.muted, { marginTop: spacing.xs }]}>{st.business.state ? `Auto-set from your state (${st.business.state}) vs place of supply. Change if needed.` : "Set your business state in Settings to auto-select."}</Text>
          </>
        )}

        <SectionTitle title={`Items (${inv.items.length})`} />
        {inv.items.map((it, i) => {
          const l = c.lines[i];
          return (
            <Card key={it.id} style={{ marginBottom: spacing.sm }} onPress={() => setEditing(it)} testID={`invoice-item-${i}`}>
              <Text style={ss.text} numberOfLines={2}>{i + 1}. {it.name || "(unnamed)"}</Text>
              <Text style={ss.muted}>{fmtQty(it.qty)} {it.unit} × {fmt(it.rate)}{it.discount ? ` − ${fmt(it.discount)}` : ""} · HSN {it.hsn || "missing"}{inv.docType === "tax" ? ` · GST ${it.gstRate}%` : ""}</Text>
              <Text style={[ss.strong, { textAlign: "right" }]}>{fmt(l.total)}</Text>
            </Card>
          );
        })}
        <View style={ss.row}>
          <Button style={{ flex: 1 }} testID="add-catalogue-item-button" icon="magnify" title="From catalogue" onPress={() => setPicker(true)} />
          <Button style={{ flex: 1 }} testID="add-custom-item-button" icon="plus" variant="secondary" title="Custom item" onPress={() => { const it = blankItem(st.defaults.gstRate, st.defaults.unit); setInv((x) => ({ ...x, items: [...x.items, it] })); setEditing(it); }} />
        </View>
        {inv.docType === "tax" && (
          <View style={[ss.row, { justifyContent: "space-between", marginTop: spacing.md }]}>
            <Text style={ss.text}>Rates include GST</Text>
            <Switch testID="rates-include-tax-switch" value={inv.ratesIncludeTax} onValueChange={(v) => up({ ratesIncludeTax: v })} />
          </View>
        )}

        <SectionTitle title="Discounts, charges & payment" />
        <View style={ss.row}>
          <Field style={{ flex: 1 }} testID="invoice-discount-input" label="Invoice discount ₹" hint="After tax" keyboardType="decimal-pad" value={txt.disc} onChangeText={(t) => setMoney("disc", t)} />
          <Field style={{ flex: 1 }} testID="charges-input" label="Extra charges ₹" keyboardType="decimal-pad" value={txt.charges} onChangeText={(t) => setMoney("charges", t)} />
        </View>
        {inv.charges ? <Field testID="charges-label-input" label="Charges label" value={inv.chargesLabel} onChangeText={(t) => up({ chargesLabel: t })} /> : null}
        <View style={[ss.row, { justifyContent: "space-between", marginBottom: spacing.md }]}>
          <Text style={ss.text}>Round off to nearest rupee</Text>
          <Switch testID="round-off-switch" value={inv.roundOff} onValueChange={(v) => up({ roundOff: v })} />
        </View>
        <View style={ss.row}>
          <Field style={{ flex: 1 }} testID="previous-balance-input" label="Previous balance ₹" keyboardType="decimal-pad" value={txt.prev} onChangeText={(t) => setMoney("prev", t)} />
          <View style={{ flex: 1, paddingTop: 18 }}>
            <Button small testID="use-outstanding-button" variant="ghost" title="Use outstanding" disabled={!inv.customerId}
              onPress={() => setMoney("prev", paiseToInput(customerOutstanding(inv.customerId!)) || "0")} />
          </View>
        </View>
        <View style={ss.row}>
          <Field style={{ flex: 1 }} testID="amount-received-input" label="Amount received ₹" keyboardType="decimal-pad" value={txt.paid} onChangeText={(t) => setMoney("paid", t)} />
          <SelectField testID="payment-mode-select" label="Payment mode" value={inv.paymentMode} onPress={async () => { const v = await ui.pick("Payment mode", MODES.map((m) => ({ value: m, label: m }))); if (v) up({ paymentMode: v }); }} />
        </View>
        <Field testID="invoice-notes-input" label="Notes on invoice" value={inv.notes} onChangeText={(t) => up({ notes: t })} multiline />

        <Card testID="invoice-totals-card">
          <Row label="Taxable value" value={fmt(c.taxable)} testID="total-taxable" />
          {inv.supplyType === "intra" ? (<><Row label="CGST" value={fmt(c.cgst)} testID="total-cgst" /><Row label="SGST" value={fmt(c.sgst)} testID="total-sgst" /></>) : <Row label="IGST" value={fmt(c.igst)} testID="total-igst" />}
          {inv.charges ? <Row label={inv.chargesLabel} value={fmt(inv.charges)} /> : null}
          {inv.invoiceDiscount ? <Row label="Discount" value={"- " + fmt(inv.invoiceDiscount)} /> : null}
          {c.roundOff ? <Row label="Round off" value={fmt(c.roundOff)} testID="total-roundoff" /> : null}
          <Row label="Grand total" value={fmt(c.grand)} bold testID="total-grand" />
          <Row label="Received" value={fmt(c.paid)} />
          <Row label="Balance payable" value={fmt(c.balance)} bold testID="total-balance" />
          <Row label="Current balance (incl. previous)" value={fmt(c.currentBalance)} />
        </Card>

        <View style={[ss.row, { justifyContent: "space-between", marginTop: spacing.md }]}>
          <Text style={ss.text}>Deduct catalogue items from shop stock</Text>
          <Switch testID="deduct-stock-switch" value={deduct} onValueChange={setDeduct} />
        </View>
        <Button style={{ marginTop: spacing.md }} testID="finalize-invoice-button" icon="check-decagram" title="Finalize invoice" onPress={finalize} />
        <View style={[ss.row, { marginTop: spacing.sm }]}>
          <Button style={{ flex: 1 }} testID="preview-draft-button" variant="secondary" icon="eye-outline" title="Preview" onPress={preview} />
          <Button style={{ flex: 1 }} testID="save-draft-button" variant="secondary" icon="content-save-outline" title="Save draft" onPress={() => { saveDraft(inv); ui.toast("Draft saved"); }} />
        </View>
        <Button style={{ marginTop: spacing.sm }} testID="delete-draft-button" variant="ghost" icon="delete-outline" title="Delete draft" onPress={removeDraft} />
      </KeyboardAwareScrollView>
      <ItemSheet item={editing} onClose={() => setEditing(null)}
        onDelete={() => { setInv((x) => ({ ...x, items: x.items.filter((i) => i.id !== editing?.id) })); setEditing(null); }}
        onSave={(it) => { setInv((x) => ({ ...x, items: x.items.map((i) => (i.id === it.id ? it : i)) })); setEditing(null); }} />
      <ProductPicker visible={picker} multi title="Add items from catalogue" onClose={() => setPicker(false)} onPick={addFromCatalogue} />
    </View>
  );
}

function InvoiceView({ inv }: { inv: Invoice }) {
  const router = useRouter();
  const db = useDB();
  const ss = useScreenStyles();
  const s = useStyles();
  const { colors } = useTheme();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const c = calcInvoice(inv);
  const st = db.settings;
  const name = `invoice-${safeName(inv.number || "draft")}-${stamp()}.pdf`;
  const run = async (mode: "share" | "save" | "print") => {
    try { ui.toast(await outputPdf(name, invoiceHtml(inv, st), mode)); } catch (e: any) { if (!/cancel/i.test(e?.message || "")) ui.toast(e?.message || "PDF failed", "error"); }
  };
  const preview = async () => {
    if (Platform.OS === "web") return run("print");
    setPreview(invoiceHtml(inv, st), inv.number || "");
    router.push("/preview");
  };
  const pay = async () => {
    const v = await ui.prompt({ title: "Record payment", message: `Balance payable ${fmt(c.balance)}`, keyboardType: "decimal-pad", initial: paiseToInput(Math.max(0, c.balance)), confirmText: "Next" });
    if (v === null) return;
    const amt = toPaise(v);
    if (amt <= 0) return ui.toast("Enter a valid amount", "error");
    if (amt > c.balance && !(await ui.confirm({ title: "Amount is more than the balance", message: "Record it anyway (advance / overpayment)?" }))) return;
    const mode = await ui.pick("Payment mode", MODES.map((m) => ({ value: m, label: m })));
    if (!mode) return;
    addPayment(inv.id, amt, mode, "");
    ui.toast("Payment recorded");
  };
  const cancel = async () => {
    const reason = await ui.prompt({ title: "Cancel invoice", message: "The invoice stays in records marked CANCELLED. Stock deducted by it is returned.", placeholder: "Reason (required)", confirmText: "Cancel invoice" });
    if (!reason?.trim()) return reason === null ? undefined : ui.toast("A reason is required", "error");
    cancelInvoice(inv.id, reason.trim());
    ui.toast("Invoice cancelled");
  };
  const dup = () => {
    const d = duplicateInvoice(inv.id);
    if (d) router.replace(`/invoice/${d.id}`);
  };
  return (
    <View style={ss.screen}>
      <Header title={inv.number || "Invoice"} subtitle={`${inv.billTo.name} · ${inv.date.split("-").reverse().join("/")}`} />
      <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={[ss.row, { marginBottom: spacing.md }]}>
          <Badge testID="invoice-status-badge" label={inv.status === "cancelled" ? "CANCELLED" : c.balance > 0 ? "PAYMENT DUE" : "PAID"} tone={inv.status === "cancelled" ? "error" : c.balance > 0 ? "accent" : "success"} />
          <Badge label={inv.docType === "tax" ? "TAX INVOICE" : "BILL OF SUPPLY"} tone="brand" />
          <Badge label={inv.supplyType === "intra" ? "CGST+SGST" : "IGST"} />
        </View>
        {inv.status === "cancelled" && <Text style={[ss.text, { color: colors.error, marginBottom: spacing.md }]}>Reason: {inv.cancelReason}</Text>}
        <Card>
          {inv.items.map((it, i) => (
            <View key={it.id} style={{ paddingVertical: 6 }}>
              <Text style={ss.text}>{i + 1}. {it.name}</Text>
              <Text style={ss.muted}>{fmtQty(it.qty)} {it.unit} × {fmt(it.rate)} · HSN {it.hsn || "—"} · {it.gstRate}%{it.serial ? ` · S/N ${it.serial}` : ""}</Text>
            </View>
          ))}
          <View style={ss.divider} />
          <Row label="Taxable" value={fmt(c.taxable)} />
          <Row label="Tax" value={fmt(c.tax)} />
          <Row label="Grand total" value={fmt(c.grand)} bold testID="view-grand-total" />
          <Row label="Received" value={fmt(c.paid)} />
          <Row label="Balance" value={fmt(c.balance)} bold testID="view-balance" />
        </Card>
        <View style={[ss.wrap, { marginTop: spacing.md }]}>
          <Button style={s.half} testID="invoice-preview-button" icon="eye-outline" title="Preview" onPress={preview} />
          <Button style={s.half} testID="invoice-share-button" icon="share-variant" title="Share PDF" onPress={() => run("share")} />
          <Button style={s.half} testID="invoice-save-button" variant="secondary" icon="content-save-outline" title="Save PDF" onPress={() => run("save")} />
          <Button style={s.half} testID="invoice-print-button" variant="secondary" icon="printer" title="Print" onPress={() => run("print")} />
        </View>
        {inv.status === "final" && <Button style={{ marginTop: spacing.sm }} testID="record-payment-button" variant="accent" icon="cash-plus" title="Record payment" onPress={pay} />}
        <Button style={{ marginTop: spacing.sm }} testID="duplicate-invoice-button" variant="ghost" icon="content-copy" title="Duplicate as new draft" onPress={dup} />
        {inv.status === "final" && <Button style={{ marginTop: spacing.sm }} testID="cancel-invoice-button" variant="ghost" icon="cancel" title="Cancel invoice" onPress={cancel} />}
        <SectionTitle title="Payments" />
        {inv.payments.length === 0 ? <Text style={ss.muted}>No payments recorded.</Text> : inv.payments.map((p) => (
          <Text key={p.id} style={ss.text}>{p.date.split("-").reverse().join("/")} · {p.mode} · {fmt(p.amount)}</Text>
        ))}
        <Text style={[ss.muted, { marginTop: spacing.lg }]}>Finalized {inv.finalizedAt ? new Date(inv.finalizedAt).toLocaleString() : ""}. Finalized invoices cannot be edited — duplicate or cancel instead.</Text>
      </KeyboardAwareScrollView>
    </View>
  );
}


const useStyles = makeStyles((c) => ({
  hdrBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  half: { width: "48.5%" },
  big: { fontSize: font.xl, color: c.onSurface, borderRadius: radius.md },
}));
