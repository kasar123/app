import * as DocumentPicker from "expo-document-picker";
import { useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, Card, Chip, Header, Row, SectionTitle, useScreenStyles, useUI } from "@/src/components/ui";
import { getProduct } from "@/src/db/catalogue";
import { audit, mutate, nowISO, uid, useDB } from "@/src/db/store";
import { autoMap, Field as MapField, FIELDS, ImportPlan, MappedRow, mappedRows, MAX_IMPORT_BYTES, planImport, PRICE_RE, readWorkbook, Workbook } from "@/src/lib/excel";
import { readPickedFile } from "@/src/lib/files";
import { spacing, useTheme } from "@/src/theme";

type Step = "pick" | "map" | "review" | "importing" | "done";

export default function ImportScreen() {
  const db = useDB();
  const ss = useScreenStyles();
  const { colors } = useTheme();
  const ui = useUI();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState("");
  const [wb, setWb] = useState<Workbook | null>(null);
  const [sheet, setSheet] = useState("");
  const [map, setMap] = useState<Partial<Record<MapField, number>>>({});
  const [supplierId, setSupplierId] = useState(db.suppliers[0]?.id || "");
  const [sample, setSample] = useState<MappedRow[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [progress, setProgress] = useState(0);
  const cancelled = useRef(false);
  const sh = wb?.sheets.find((x) => x.name === sheet);

  const reset = () => { setStep("pick"); setWb(null); setPlan(null); setSample([]); setFile(""); };

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/octet-stream"],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if (!/\.(xlsx|xls)$/i.test(a.name)) return ui.toast("Please choose an .xlsx or .xls file", "error");
    if (a.size && a.size > MAX_IMPORT_BYTES) return ui.toast("File is larger than 25 MB — split it and import in parts", "error");
    setBusy(true);
    try {
      const { base64 } = await readPickedFile(a.uri);
      await new Promise((res) => setTimeout(res, 30));
      const w = readWorkbook(base64);
      setWb(w);
      setFile(a.name);
      const first = w.sheets.find((x) => x.rowCount > 0) || w.sheets[0];
      selectSheet(w, first.name);
      const guess = /dna/i.test(a.name) ? "dnatech" : /robodo/i.test(a.name) ? "robodo" : supplierId;
      if (db.suppliers.some((s) => s.id === guess)) setSupplierId(guess);
      setStep("map");
    } catch (e: any) {
      ui.toast("Could not read this workbook: " + (e?.message || "invalid file"), "error");
    } finally { setBusy(false); }
  };

  const selectSheet = (w: Workbook, name: string) => {
    setSheet(name);
    const s = w.sheets.find((x) => x.name === name)!;
    const m = autoMap(s.header);
    setMap(m);
    setSample(mappedRows(w, name, m, 5));
  };

  const setField = async (f: MapField) => {
    if (!sh) return;
    const opts = [{ value: -1, label: "— Not mapped —" }, ...sh.header.map((h, i) => ({ value: i, label: h || `Column ${i + 1}`, sub: PRICE_RE.test(h) ? "Price/cost column — cannot be imported" : undefined }))];
    const v = await ui.pick<number>(`Column for “${FIELDS.find((x) => x.key === f)!.label}”`, opts);
    if (v === null) return;
    if (v >= 0 && PRICE_RE.test(sh.header[v])) return ui.toast("Price and cost columns are never imported", "error");
    const m = { ...map };
    if (v < 0) delete m[f]; else m[f] = v;
    setMap(m);
    setSample(mappedRows(wb!, sheet, m, 5));
  };

  const validate = async () => {
    if (map.name === undefined) return ui.toast("Map the Product name column first", "error");
    if (!supplierId) return ui.toast("Choose the supplier for this catalogue", "error");
    setBusy(true);
    await new Promise((res) => setTimeout(res, 30));
    try {
      const rows = mappedRows(wb!, sheet, map);
      setPlan(planImport(rows, supplierId, getProduct));
      setStep("review");
    } catch (e: any) { ui.toast("Validation failed: " + (e?.message || ""), "error"); } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!plan) return;
    const ok = await ui.confirm({ title: "Import now?", message: `${plan.added.length} new and ${plan.updated.length} updated records for ${db.suppliers.find((s) => s.id === supplierId)?.name}. Shop stock, HSN codes and your prices are not changed.`, confirmText: "Import" });
    if (!ok) return;
    cancelled.current = false;
    setStep("importing");
    // Stage in memory in chunks (cancellable), then commit everything at once.
    const staged: Record<string, any> = {};
    const all = [...plan.added.map((p) => ({ id: p.id, patch: p as any })), ...plan.updated];
    for (let i = 0; i < all.length; i += 500) {
      if (cancelled.current) { setStep("review"); return ui.toast("Import cancelled — nothing was changed", "info"); }
      all.slice(i, i + 500).forEach((x) => (staged[x.id] = x.patch));
      setProgress(Math.min(1, (i + 500) / Math.max(1, all.length)));
      await new Promise((res) => setTimeout(res, 0));
    }
    mutate((d) => {
      for (const [id, patch] of Object.entries(staged)) {
        d.overrides[id] = { ...d.overrides[id], ...patch, updatedAt: nowISO() };
        d.deleted = d.deleted.filter((x) => x !== id);
      }
      d.importHistory.unshift({ id: uid(), at: nowISO(), file, supplierId, sheet, total: plan.total, added: plan.added.length, updated: plan.updated.length, unchanged: plan.unchanged, duplicates: plan.duplicates, skipped: plan.skipped, errors: plan.errors.length });
      audit("import", "catalogue", file, `${plan.added.length} added, ${plan.updated.length} updated`);
    }, { catalogue: true });
    setStep("done");
  };

  return (
    <View style={ss.screen}>
      <Header title="Import Excel catalogue" subtitle="Parsed on this phone · prices are never imported" />
      <KeyboardAwareScrollView contentContainerStyle={[ss.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        {step === "pick" && (
          <>
            <View style={ss.notice}><Text style={ss.noticeText}>Choose a supplier .xlsx / .xls file. Only product name, SKU, URL, category, subcategory, variant, supplier stock, description and HSN columns are read. Price, cost, MRP, GST and rate columns are skipped while reading and never stored.</Text></View>
            <Button style={{ marginTop: spacing.lg }} testID="pick-excel-button" icon="file-excel-outline" title="Select Excel file" loading={busy} onPress={pick} />
            <SectionTitle title="Import history" />
            {db.importHistory.map((h) => (
              <Card key={h.id} style={{ marginBottom: spacing.sm }} testID={`import-history-${h.id}`}>
                <Text style={ss.strong} numberOfLines={1}>{h.file}</Text>
                <Text style={ss.muted}>{db.suppliers.find((s) => s.id === h.supplierId)?.name} · {new Date(h.at).toLocaleString()}</Text>
                <Text style={ss.text}>Rows {h.total} · added {h.added} · updated {h.updated} · unchanged {h.unchanged} · duplicates {h.duplicates} · skipped {h.skipped} · errors {h.errors}</Text>
              </Card>
            ))}
          </>
        )}

        {step === "map" && wb && sh && (
          <>
            <Card><Row label="File" value={file} testID="import-file-name" /><Row label="Worksheets" value={String(wb.sheets.length)} /><Row label="Rows in sheet" value={String(sh.rowCount)} testID="import-row-count" /></Card>
            <SectionTitle title="Worksheet" />
            <View style={ss.wrap}>{wb.sheets.map((x, i) => <Chip key={x.name} testID={`sheet-chip-${i}`} label={`${x.name} (${x.rowCount})`} active={x.name === sheet} onPress={() => selectSheet(wb, x.name)} />)}</View>
            <SectionTitle title="Supplier for this file" />
            <View style={ss.wrap}>{db.suppliers.map((s) => <Chip key={s.id} testID={`import-supplier-${s.id}`} label={s.name} active={supplierId === s.id} onPress={() => setSupplierId(s.id)} />)}</View>
            <SectionTitle title="Column mapping" />
            <Card>
              {FIELDS.map((f) => (
                <View key={f.key} style={[ss.row, { justifyContent: "space-between", paddingVertical: 4 }]}>
                  <Text style={ss.text}>{f.label}{f.required ? " *" : ""}</Text>
                  <Button small testID={`map-${f.key}`} variant={map[f.key] !== undefined ? "secondary" : "ghost"} title={map[f.key] !== undefined ? sh.header[map[f.key]!] || `Col ${map[f.key]! + 1}` : "Not mapped"} onPress={() => setField(f.key)} />
                </View>
              ))}
              {sh.priceCols.length > 0 && (
                <View style={{ marginTop: spacing.sm, flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  <Text style={[ss.muted, { color: colors.error }]}>Excluded price columns:</Text>
                  {sh.priceCols.map((i) => <Badge key={i} label={sh.header[i]} tone="error" />)}
                </View>
              )}
            </Card>
            <SectionTitle title="Sample rows (mapped fields only)" />
            {sample.map((r) => (
              <Card key={r.row} style={{ marginBottom: spacing.sm }} testID={`sample-row-${r.row}`}>
                <Text style={ss.text} numberOfLines={2}>{r.name || "(no name — will be skipped)"}</Text>
                <Text style={ss.muted}>SKU {r.sku || "—"} · {r.category || "—"}{r.subcategory ? " › " + r.subcategory : ""}{r.variant ? ` · ${r.variant}` : ""} · supplier stock {r.stockStatus || "?"}{r.stockQty !== null ? ` (${r.stockQty})` : ""}</Text>
              </Card>
            ))}
            <Button style={{ marginTop: spacing.md }} testID="validate-import-button" title="Validate data" icon="check-all" loading={busy} onPress={validate} />
            <Button style={{ marginTop: spacing.sm }} testID="cancel-import-button" variant="ghost" title="Cancel" onPress={reset} />
          </>
        )}
        {(step === "review" || step === "importing" || step === "done") && plan && (
          <>
            <Card testID="import-summary">
              <Text style={[ss.strong, { marginBottom: spacing.sm }]}>{step === "done" ? "Import complete" : "Validation summary"}</Text>
              <Row label="Total rows" value={String(plan.total)} testID="summary-total" />
              <Row label="New products" value={String(plan.added.length)} testID="summary-added" />
              <Row label="Updated (name/category/stock info)" value={String(plan.updated.length)} testID="summary-updated" />
              <Row label="Already up to date" value={String(plan.unchanged)} testID="summary-unchanged" />
              <Row label="Duplicate rows in file" value={String(plan.duplicates)} testID="summary-duplicates" />
              <Row label="Skipped (no name)" value={String(plan.skipped)} testID="summary-skipped" />
              <Row label="Errors" value={String(plan.errors.length)} testID="summary-errors" />
            </Card>
            {plan.errors.slice(0, 20).map((e, i) => <Text key={i} style={[ss.muted, { color: colors.error }]}>{e}</Text>)}
            {step === "review" && (
              <>
                <Button style={{ marginTop: spacing.lg }} testID="confirm-import-button" title="Confirm import" icon="database-import" disabled={!plan.added.length && !plan.updated.length} onPress={commit} />
                <Button style={{ marginTop: spacing.sm }} testID="back-to-mapping-button" variant="ghost" title="Back to mapping" onPress={() => setStep("map")} />
              </>
            )}
            {step === "importing" && (
              <View style={{ alignItems: "center", marginTop: spacing.lg, gap: spacing.sm }}>
                <ActivityIndicator color={colors.brandPrimary} />
                <Text style={ss.text} testID="import-progress">{Math.round(progress * 100)}%</Text>
                <Button testID="abort-import-button" variant="ghost" title="Cancel import" onPress={() => { cancelled.current = true; }} />
              </View>
            )}
            {step === "done" && <Button style={{ marginTop: spacing.lg }} testID="import-another-button" title="Import another file" onPress={reset} />}
          </>
        )}
      </KeyboardAwareScrollView>

    </View>
  );
}
