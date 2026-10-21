import { useLocalSearchParams, useRouter } from "expo-router";
import { useDeferredValue, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, Card, Empty, Field, Header, HeaderAction, Row, SearchBar, SectionTitle, SelectField, useScreenStyles, useUI } from "@/src/components/ui";
import { customerOutstanding, saveCustomer } from "@/src/db/ops";
import { Customer, nowISO, uid, useDB } from "@/src/db/store";
import { calcInvoice, fmt, GSTIN_RE, STATES } from "@/src/lib/money";
import { spacing } from "@/src/theme";

export function CustomerList() {
  const db = useDB();
  const ss = useScreenStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.toLowerCase().trim());
  const list = useMemo(() => db.customers.filter((c) => !dq || [c.name, c.mobile, c.gstin, c.billingAddress].join(" ").toLowerCase().includes(dq)), [db.customers, dq]);
  return (
    <View style={ss.screen}>
      <Header title="Customers" subtitle={`${db.customers.length} saved on this phone`} right={<HeaderAction testID="add-customer-button" icon="account-plus" label="Add" onPress={() => router.push("/customers/new")} />} />
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <SearchBar testID="customer-search-input" value={q} onChangeText={setQ} placeholder="Name, mobile, GSTIN…" />
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        renderItem={({ item, index }) => {
          const due = customerOutstanding(item.id);
          return (
            <Pressable testID={`customer-row-${index}`} onPress={() => router.push(`/customers/${item.id}`)} style={({ pressed }) => [ss.listItem, pressed && { opacity: 0.7 }]}>
              <View style={[ss.row, { justifyContent: "space-between" }]}>
                <Text style={ss.itemTitle}>{item.name}</Text>
                {due > 0 ? <Badge label={`Due ${fmt(due)}`} tone="accent" /> : null}
              </View>
              <Text style={ss.muted}>{[item.mobile, item.gstin].filter(Boolean).join(" · ") || "No contact"}</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Empty icon="account-group-outline" title="No customers yet" text="Customers are added here or saved automatically when you finalize an invoice." testID="customers-empty" />}
      />
    </View>
  );
}

export function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDB();
  const ss = useScreenStyles();
  const router = useRouter();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const existing = db.customers.find((c) => c.id === id);
  const [f, setF] = useState<Customer>(existing || { id: uid(), name: "", mobile: "", billingAddress: "", shippingAddress: "", gstin: "", state: db.settings.business.state, email: "", notes: "", createdAt: nowISO() });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof Customer, v: string) => setF((x) => ({ ...x, [k]: v }));
  const invoices = db.invoices.filter((i) => i.customerId === f.id && i.status !== "draft");
  const due = existing ? customerOutstanding(f.id) : 0;
  const total = invoices.filter((i) => i.status === "final").reduce((a, i) => a + calcInvoice(i).grand, 0);

  const save = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Name is required";
    if (f.mobile && !/^\+?\d{10,13}$/.test(f.mobile.replace(/\s/g, ""))) e.mobile = "Enter a valid mobile number";
    if (f.gstin && !GSTIN_RE.test(f.gstin)) e.gstin = "GSTIN format looks wrong (15 characters)";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = "Enter a valid email";
    setErr(e);
    if (Object.keys(e).length) return ui.toast("Please fix the highlighted fields", "error");
    saveCustomer({ ...f, name: f.name.trim() });
    ui.toast("Customer saved");
    if (!existing) router.replace(`/customers/${f.id}`);
  };

  return (
    <View style={ss.screen}>
      <Header title={existing ? existing.name : "New customer"} />
      <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        {existing && (
          <Card style={{ marginBottom: spacing.lg }}>
            <Row label="Outstanding balance" value={fmt(due)} bold testID="customer-outstanding" />
            <Row label="Total billed" value={fmt(total)} />
            <Row label="Invoices" value={String(invoices.length)} />
          </Card>
        )}
        <Field testID="customer-name-input" label="Name *" value={f.name} onChangeText={(t) => set("name", t)} error={err.name} />
        <View style={ss.row}>
          <Field style={{ flex: 1 }} testID="customer-mobile-input" label="Mobile" keyboardType="phone-pad" value={f.mobile} onChangeText={(t) => set("mobile", t)} error={err.mobile} />
          <Field style={{ flex: 1 }} testID="customer-gstin-input" label="GSTIN" autoCapitalize="characters" value={f.gstin} onChangeText={(t) => set("gstin", t.toUpperCase().trim())} error={err.gstin} />
        </View>
        <Field testID="customer-billing-input" label="Billing address" value={f.billingAddress} onChangeText={(t) => set("billingAddress", t)} multiline />
        <Field testID="customer-shipping-input" label="Shipping address" hint="Leave blank if same as billing" value={f.shippingAddress} onChangeText={(t) => set("shippingAddress", t)} multiline />
        <View style={ss.row}>
          <SelectField testID="customer-state-select" label="State" value={f.state} onPress={async () => { const v = await ui.pick("State", STATES.map((x) => ({ value: x, label: x }))); if (v) set("state", v); }} />
        </View>
        <Field testID="customer-email-input" label="Email" keyboardType="email-address" autoCapitalize="none" value={f.email} onChangeText={(t) => set("email", t)} error={err.email} />
        <Field testID="customer-notes-input" label="Notes" value={f.notes} onChangeText={(t) => set("notes", t)} multiline />
        <Button testID="save-customer-button" icon="content-save" title="Save customer" onPress={save} />
        {existing && (
          <>
            <SectionTitle title="Invoice & purchase history" />
            {invoices.length === 0 ? <Text style={ss.muted}>No invoices yet.</Text> : invoices.map((i, idx) => {
              const c = calcInvoice(i);
              return (
                <Card key={i.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push(`/invoice/${i.id}`)} testID={`customer-invoice-${idx}`}>
                  <View style={[ss.row, { justifyContent: "space-between" }]}>
                    <Text style={ss.strong}>{i.number}</Text>
                    <Text style={ss.strong}>{fmt(c.grand)}</Text>
                  </View>
                  <Text style={ss.muted} numberOfLines={2}>{i.date.split("-").reverse().join("/")} · {i.status === "cancelled" ? "CANCELLED" : c.balance > 0 ? `Due ${fmt(c.balance)}` : "Paid"} · {i.items.map((x) => x.name).join(", ")}</Text>
                </Card>
              );
            })}
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
