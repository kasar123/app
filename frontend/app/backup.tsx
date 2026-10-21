import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, Header, Row, SectionTitle, useScreenStyles, useUI } from "@/src/components/ui";
import { BackupPreview, countsOf, flushSave, getDB, makeBackup, restoreBackup, validateBackup } from "@/src/db/store";
import { stamp } from "@/src/lib/excel";
import { outputText, readPickedFile } from "@/src/lib/files";
import { setColorScheme, spacing, useTheme } from "@/src/theme";

export default function Backup() {
  const ss = useScreenStyles();
  const { colors } = useTheme();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const counts = countsOf(getDB());

  const backup = async (mode: "share" | "save") => {
    try {
      await flushSave();
      ui.toast(await outputText(`techronixhub-backup-${stamp()}.json`, makeBackup(), "application/json", mode));
    } catch (e: any) {
      if (!/cancel/i.test(e?.message || "")) ui.toast("Backup failed: " + (e?.message || "check free storage"), "error");
    }
  };

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "application/octet-stream"], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    if (r.assets[0].size && r.assets[0].size > 200 * 1024 * 1024) return ui.toast("File too large to be a backup", "error");
    try {
      const f = await readPickedFile(r.assets[0].uri);
      setPreview(validateBackup(await f.text()));
    } catch (e: any) { ui.toast("Could not read file: " + (e?.message || ""), "error"); }
  };

  const restore = async () => {
    if (!preview?.ok) return;
    const ok = await ui.confirm({ title: "Replace all current data?", message: "Everything on this phone (products edits, inventory, customers, invoices, requests, settings) is replaced by the backup. A safety copy of the current data is kept first.", danger: true, confirmText: "Restore" });
    if (!ok) return;
    try {
      await restoreBackup(preview.data);
      const t = preview.data.settings.theme;
      setColorScheme(t === "system" ? null : t);
      setPreview(null);
      ui.toast("Backup restored");
    } catch (e: any) { ui.toast("Restore failed — existing data kept. " + (e?.message || ""), "error"); }
  };

  return (
    <View style={ss.screen}>
      <Header title="Backup & restore" subtitle="Separate from report exports" />
      <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={ss.notice}><Text style={ss.noticeText}>Your data lives only on this phone. Make a backup regularly and keep it on another device, pen drive or cloud drive of your choice. Backups never contain supplier catalogue prices.</Text></View>
        <SectionTitle title="Current data" />
        <Card>{Object.entries(counts).map(([k, v]) => <Row key={k} label={k} value={String(v)} />)}</Card>
        <View style={[ss.row, { marginTop: spacing.md }]}>
          <Button style={{ flex: 1 }} testID="backup-save-button" icon="folder-download-outline" title="Save backup" onPress={() => backup("save")} />
          <Button style={{ flex: 1 }} testID="backup-share-button" icon="share-variant" variant="secondary" title="Share backup" onPress={() => backup("share")} />
        </View>
        <SectionTitle title="Restore" />
        <Button testID="restore-pick-button" icon="backup-restore" variant="ghost" title="Choose backup file…" onPress={pick} />
        {preview && !preview.ok && <Text style={{ color: colors.error, marginTop: spacing.md }} testID="restore-error">{preview.error}</Text>}
        {preview?.ok && (
          <Card style={{ marginTop: spacing.md }} testID="restore-preview">
            <Text style={ss.strong}>Backup from {new Date(preview.createdAt).toLocaleString()}</Text>
            {Object.entries(preview.counts).map(([k, v]) => <Row key={k} label={k} value={String(v)} />)}
            <Button style={{ marginTop: spacing.md }} testID="restore-confirm-button" variant="danger" icon="database-refresh" title="Restore this backup" onPress={restore} />
            <Button style={{ marginTop: spacing.sm }} testID="restore-cancel-button" variant="ghost" title="Cancel" onPress={() => setPreview(null)} />
          </Card>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
