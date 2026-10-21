import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, Field, Header, HeaderAction, Segmented, SectionTitle, SelectField, useScreenStyles, useUI } from "@/src/components/ui";
import { audit, mutate, Settings, useDB } from "@/src/db/store";
import { GSTIN_RE, STATES } from "@/src/lib/money";
import { spacing } from "@/src/theme";

export default function SettingsScreen() {
  const db = useDB();
  const ss = useScreenStyles();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [f, setF] = useState<Settings>(() => JSON.parse(JSON.stringify(db.settings)));
  const [rates, setRates] = useState(f.taxRates.join(", "));
  const [units, setUnits] = useState(f.units.join(", "));
  const b = (k: keyof Settings["business"], v: string) => setF((x) => ({ ...x, business: { ...x.business, [k]: v } }));
  const iv = (k: keyof Settings["invoice"], v: any) => setF((x) => ({ ...x, invoice: { ...x.invoice, [k]: v } }));
  const bk = (k: keyof Settings["bank"], v: string) => setF((x) => ({ ...x, bank: { ...x.bank, [k]: v } }));

  const pickImage = async (apply: (uri: string) => void) => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, base64: true, allowsEditing: false });
    if (r.canceled || !r.assets?.[0]?.base64) return;
    const a = r.assets[0];
    if (a.base64!.length > 1_500_000) return ui.toast("Image is too large — choose a smaller image (under ~1 MB)", "error");
    apply(`data:${a.mimeType || "image/jpeg"};base64,${a.base64}`);
  };

  const save = () => {
    if (f.business.gstin && !GSTIN_RE.test(f.business.gstin)) return ui.toast("Business GSTIN format looks wrong", "error");
    if (f.business.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(f.business.pan)) return ui.toast("PAN format looks wrong", "error");
    if (f.bank.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.bank.ifsc)) return ui.toast("IFSC format looks wrong", "error");
    if (f.bank.upi && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(f.bank.upi)) return ui.toast("UPI ID format looks wrong (name@bank)", "error");
    if (!f.invoice.prefix.trim() || /[^A-Za-z0-9-]/.test(f.invoice.prefix)) return ui.toast("Invoice prefix: letters, numbers or - only", "error");
    const tr = rates.split(",").map((x) => Number(x.trim())).filter((x) => isFinite(x) && x >= 0 && x <= 100);
    const un = units.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
    if (!tr.length || !un.length) return ui.toast("Add at least one tax rate and unit", "error");
    const next = { ...f, taxRates: [...new Set(tr)].sort((a, c) => a - c), units: [...new Set(un)] };
    if (!next.taxRates.includes(next.defaults.gstRate)) next.defaults.gstRate = next.taxRates[0];
    if (!next.units.includes(next.defaults.unit)) next.defaults.unit = next.units[0];
    mutate((d) => { d.settings = { ...next, theme: d.settings.theme }; audit("edit", "settings", ""); });
    ui.toast("Settings saved");
  };

  return (
    <View style={ss.screen}>
      <Header title="Business settings" right={<HeaderAction testID="settings-save-header" icon="content-save" label="Save" onPress={save} />} />
      <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <View style={ss.notice}><Text style={ss.noticeText}>Leave anything you don&apos;t have blank. Nothing here is pre-filled from other businesses.</Text></View>
        <SectionTitle title="Business" />
        <Card>
          <View style={[ss.row, { marginBottom: spacing.md }]}>
            {f.business.logo ? <Image source={{ uri: f.business.logo }} style={{ width: 64, height: 64 }} contentFit="contain" /> : null}
            <Button small testID="pick-logo-button" variant="secondary" icon="image-outline" title={f.business.logo ? "Change logo" : "Add logo"} onPress={() => pickImage((u) => b("logo", u))} />
            {f.business.logo ? <Button small testID="remove-logo-button" variant="ghost" title="Remove" onPress={() => b("logo", "")} /> : null}
          </View>
          <Field testID="business-name-input" label="Business name" value={f.business.name} onChangeText={(t) => b("name", t)} />
          <Field testID="business-parent-input" label="Parent business" value={f.business.parent} onChangeText={(t) => b("parent", t)} />
          <Field testID="business-tagline-input" label="Tagline" value={f.business.tagline} onChangeText={(t) => b("tagline", t)} />
          <Field testID="business-address-input" label="Shop address" multiline value={f.business.address} onChangeText={(t) => b("address", t)} />
          <View style={ss.row}><SelectField testID="business-state-select" label="State (for GST)" value={f.business.state} onPress={async () => { const v = await ui.pick("State", STATES.map((x) => ({ value: x, label: x }))); if (v) b("state", v); }} /></View>
          <View style={ss.row}>
            <Field style={{ flex: 1 }} testID="business-phone-input" label="Phone" keyboardType="phone-pad" value={f.business.phone} onChangeText={(t) => b("phone", t)} />
            <Field style={{ flex: 1 }} testID="business-email-input" label="Email" keyboardType="email-address" autoCapitalize="none" value={f.business.email} onChangeText={(t) => b("email", t)} />
          </View>
          <View style={ss.row}>
            <Field style={{ flex: 1 }} testID="business-gstin-input" label="GSTIN" autoCapitalize="characters" value={f.business.gstin} onChangeText={(t) => b("gstin", t.toUpperCase().trim())} />
            <Field style={{ flex: 1 }} testID="business-pan-input" label="PAN" autoCapitalize="characters" value={f.business.pan} onChangeText={(t) => b("pan", t.toUpperCase().trim())} />
          </View>
        </Card>

        <SectionTitle title="Invoice" />
        <Card>
          <View style={ss.row}>
            <Field style={{ flex: 1 }} testID="invoice-prefix-input" label="Invoice prefix" hint="e.g. TXH → TXH/26-27/001" autoCapitalize="characters" value={f.invoice.prefix} onChangeText={(t) => iv("prefix", t.toUpperCase())} />
            <Field style={{ flex: 1 }} testID="request-prefix-input" label="Request prefix" autoCapitalize="characters" value={f.invoice.prPrefix} onChangeText={(t) => iv("prPrefix", t.toUpperCase())} />
          </View>
          <Text style={[ss.muted, { marginBottom: spacing.xs }]}>DEFAULT DOCUMENT TYPE</Text>
          <Segmented testID="default-doc-type" value={f.invoice.defaultDocType} onChange={(v) => iv("defaultDocType", v)} options={[{ value: "tax", label: "Tax Invoice" }, { value: "bos", label: "Bill of Supply" }]} />
          <Field style={{ marginTop: spacing.md }} testID="terms-input" label="Terms & conditions" multiline value={f.invoice.terms} onChangeText={(t) => iv("terms", t)} />
          <Field testID="warranty-input" label="Warranty / return policy" multiline value={f.invoice.warranty} onChangeText={(t) => iv("warranty", t)} />
          <Field testID="payment-instructions-input" label="Payment instructions" multiline value={f.invoice.paymentInstructions} onChangeText={(t) => iv("paymentInstructions", t)} />
          <Field testID="footer-input" label="Invoice footer" value={f.invoice.footer} onChangeText={(t) => iv("footer", t)} />
          <Field testID="signatory-input" label="Authorised signatory name" value={f.invoice.signatory} onChangeText={(t) => iv("signatory", t)} />
          <View style={[ss.row, { marginBottom: spacing.md }]}>
            <Button small testID="pick-signature-button" variant="secondary" icon="draw" title={f.invoice.signature ? "Change signature image" : "Add signature image"} onPress={() => pickImage((u) => iv("signature", u))} />
            {f.invoice.signature ? <Button small testID="remove-signature-button" variant="ghost" title="Remove" onPress={() => iv("signature", "")} /> : null}
          </View>
          <View style={[ss.row, { justifyContent: "space-between" }]}>
            <Text style={ss.text}>Customer signature space</Text>
            <Switch testID="customer-sign-switch" value={f.invoice.showCustomerSign} onValueChange={(v) => iv("showCustomerSign", v)} />
          </View>
        </Card>

        <SectionTitle title="Bank & UPI" />
        <Card>
          <Field testID="bank-holder-input" label="Account holder name" value={f.bank.holder} onChangeText={(t) => bk("holder", t)} />
          <Field testID="bank-name-input" label="Bank name" value={f.bank.bankName} onChangeText={(t) => bk("bankName", t)} />
          <Field testID="bank-account-input" label="Account number" keyboardType="number-pad" value={f.bank.account} onChangeText={(t) => bk("account", t.replace(/\s/g, ""))} />
          <View style={ss.row}>
            <Field style={{ flex: 1 }} testID="bank-ifsc-input" label="IFSC" autoCapitalize="characters" value={f.bank.ifsc} onChangeText={(t) => bk("ifsc", t.toUpperCase().trim())} />
            <Field style={{ flex: 1 }} testID="bank-branch-input" label="Branch" value={f.bank.branch} onChangeText={(t) => bk("branch", t)} />
          </View>
          <Field testID="upi-id-input" label="UPI ID" autoCapitalize="none" value={f.bank.upi} onChangeText={(t) => bk("upi", t.trim())} />
          <Field testID="upi-payee-input" label="UPI payee name" hint="UPI ID + payee name enable an invoice-specific payment QR" value={f.bank.payee} onChangeText={(t) => bk("payee", t)} />
          <View style={ss.row}>
            {f.bank.qrImage ? <Image source={{ uri: f.bank.qrImage }} style={{ width: 64, height: 64 }} contentFit="contain" /> : null}
            <Button small testID="pick-qr-button" variant="secondary" icon="qrcode" title={f.bank.qrImage ? "Change static QR" : "Add static QR image"} onPress={() => pickImage((u) => bk("qrImage", u))} />
            {f.bank.qrImage ? <Button small testID="remove-qr-button" variant="ghost" title="Remove" onPress={() => bk("qrImage", "")} /> : null}
          </View>
        </Card>

        <SectionTitle title="Tax rates & units" />
        <Card>
          <Field testID="tax-rates-input" label="GST rates (%)" hint="Comma separated. Set each product's rate yourself." value={rates} onChangeText={setRates} keyboardType="numbers-and-punctuation" />
          <View style={ss.row}>
            <SelectField testID="default-gst-select" label="Default GST rate" value={`${f.defaults.gstRate}%`} onPress={async () => { const v = await ui.pick<number>("Default GST", f.taxRates.map((r) => ({ value: r, label: `${r}%` }))); if (v !== null) setF((x) => ({ ...x, defaults: { ...x.defaults, gstRate: v } })); }} />
            <SelectField testID="default-unit-select" label="Default unit" value={f.defaults.unit} onPress={async () => { const v = await ui.pick("Default unit", f.units.map((u) => ({ value: u, label: u }))); if (v) setF((x) => ({ ...x, defaults: { ...x.defaults, unit: v } })); }} />
          </View>
          <Field testID="units-input" label="Units" hint="Comma separated" value={units} onChangeText={setUnits} autoCapitalize="characters" />
        </Card>
        <Button style={{ marginTop: spacing.lg }} testID="save-settings-button" icon="content-save" title="Save settings" onPress={save} />
      </KeyboardAwareScrollView>
    </View>
  );
}
