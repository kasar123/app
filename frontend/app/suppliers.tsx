import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, Field, Header, HeaderAction, useScreenStyles, useUI } from "@/src/components/ui";
import { mutate, Supplier, useDB } from "@/src/db/store";
import { spacing } from "@/src/theme";

export default function Suppliers() {
  const db = useDB();
  const ss = useScreenStyles();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [edit, setEdit] = useState<Supplier | null>(null);

  const add = async () => {
    const name = await ui.prompt({ title: "New supplier", placeholder: "Supplier name" });
    if (!name?.trim()) return;
    const id = "sup-" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
    if (db.suppliers.some((s) => s.id === id)) return ui.toast("Supplier already exists", "error");
    mutate((d) => { d.suppliers.push({ id, name: name.trim() }); }, { catalogue: true });
  };

  const save = () => {
    if (!edit) return;
    if (!edit.name.trim()) return ui.toast("Name is required", "error");
    if (edit.email && !/^\S+@\S+\.\S+$/.test(edit.email)) return ui.toast("Email looks wrong", "error");
    mutate((d) => { d.suppliers = d.suppliers.map((s) => (s.id === edit.id ? { ...edit, name: edit.name.trim() } : s)); }, { catalogue: true });
    setEdit(null);
    ui.toast("Supplier saved");
  };

  return (
    <View style={ss.screen}>
      <Header title="Suppliers" subtitle="Contact details used on request PDFs" right={<HeaderAction testID="add-supplier-button" icon="plus" label="Add" onPress={add} />} />
      <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        {db.suppliers.map((s, i) => (
          <Card key={s.id} style={{ marginBottom: spacing.sm }} testID={`supplier-card-${i}`}>
            {edit?.id === s.id ? (
              <>
                <Field testID="supplier-name-input" label="Name" value={edit.name} onChangeText={(t) => setEdit({ ...edit, name: t })} />
                <Field testID="supplier-contact-input" label="Contact person" value={edit.contactPerson || ""} onChangeText={(t) => setEdit({ ...edit, contactPerson: t })} />
                <Field testID="supplier-phone-input" label="Phone" keyboardType="phone-pad" value={edit.phone || ""} onChangeText={(t) => setEdit({ ...edit, phone: t })} />
                <Field testID="supplier-email-input" label="Email" keyboardType="email-address" autoCapitalize="none" value={edit.email || ""} onChangeText={(t) => setEdit({ ...edit, email: t })} />
                <Field testID="supplier-gstin-input" label="GSTIN" autoCapitalize="characters" value={edit.gstin || ""} onChangeText={(t) => setEdit({ ...edit, gstin: t.toUpperCase() })} />
                <Field testID="supplier-address-input" label="Address" multiline value={edit.address || ""} onChangeText={(t) => setEdit({ ...edit, address: t })} />
                <View style={ss.row}>
                  <Button style={{ flex: 1 }} testID="supplier-cancel-button" variant="ghost" title="Cancel" onPress={() => setEdit(null)} />
                  <Button style={{ flex: 1 }} testID="supplier-save-button" title="Save" onPress={save} />
                </View>
              </>
            ) : (
              <View style={[ss.row, { justifyContent: "space-between" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={ss.strong}>{s.name}</Text>
                  <Text style={ss.muted}>{[s.contactPerson, s.phone, s.email].filter(Boolean).join(" · ") || "No contact details yet"}</Text>
                </View>
                <Button small testID={`supplier-edit-${i}`} variant="secondary" title="Edit" onPress={() => setEdit({ ...s })} />
              </View>
            )}
          </Card>
        ))}
      </KeyboardAwareScrollView>
    </View>
  );
}
