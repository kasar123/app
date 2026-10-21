// Local Excel (.xlsx/.xls) parsing and generation (SheetJS). No network.
import * as XLSX from "xlsx";

import { productKey } from "@/src/db/catalogue";
import type { Product } from "@/src/db/store";

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

// Any column that looks like a price/cost is excluded and can never be mapped.
export const PRICE_RE = /(price|cost|mrp|rate|amount|value|inr|₹|rs\.?\b|purchase|selling|discount|tax|gst)/i;

export type Field = "name" | "sku" | "url" | "category" | "subcategory" | "variant" | "stockStatus" | "stockQty" | "description" | "hsn";
export const FIELDS: { key: Field; label: string; required?: boolean; synonyms: string[] }[] = [
  { key: "name", label: "Product name", required: true, synonyms: ["product_name", "product name", "name", "title", "item name", "product"] },
  { key: "sku", label: "SKU / product code", synonyms: ["sku", "sku / product code", "product code", "code", "item code", "part number", "model"] },
  { key: "url", label: "Product URL", synonyms: ["product_url", "product url", "url", "link"] },
  { key: "category", label: "Category", synonyms: ["category", "main category"] },
  { key: "subcategory", label: "Subcategory", synonyms: ["subcategory", "sub category", "sub-category"] },
  { key: "variant", label: "Variant", synonyms: ["variant", "option", "variation"] },
  { key: "stockStatus", label: "Supplier stock status", synonyms: ["stock_status", "stock status", "availability", "status"] },
  { key: "stockQty", label: "Supplier stock qty", synonyms: ["stock_quantity", "stock quantity", "qty", "quantity", "stock"] },
  { key: "description", label: "Description", synonyms: ["description", "details"] },
  { key: "hsn", label: "HSN code", synonyms: ["hsn", "hsn code", "hsn/sac"] },
];

const clean = (v: any) => {
  if (v === null || v === undefined) return "";
  const s = String(v).normalize("NFKC").replace(/\s+/g, " ").trim();
  return ["none", "nan", "null", "-", "n/a"].includes(s.toLowerCase()) ? "" : s;
};

export type SheetInfo = { name: string; header: string[]; rowCount: number; priceCols: number[] };
export type Workbook = { wb: XLSX.WorkBook; sheets: SheetInfo[] };

export function readWorkbook(base64: string): Workbook {
  const wb = XLSX.read(base64, { type: "base64", dense: true, cellHTML: false, cellFormula: false, cellStyles: false });
  if (!wb.SheetNames.length) throw new Error("The workbook has no worksheets.");
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    const first = (XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: "" }) as any[][])[0] || [];
    const header = first.map((h) => clean(h));
    return { name, header, rowCount: ref ? ref.e.r : 0, priceCols: header.map((h, i) => (PRICE_RE.test(h) ? i : -1)).filter((i) => i >= 0) };
  });
  return { wb, sheets };
}

export function autoMap(header: string[]): Partial<Record<Field, number>> {
  const m: Partial<Record<Field, number>> = {};
  const lower = header.map((h) => h.toLowerCase());
  for (const f of FIELDS) {
    const i = lower.findIndex((h, idx) => f.synonyms.includes(h) && !PRICE_RE.test(header[idx]));
    if (i >= 0) m[f.key] = i;
  }
  return m;
}

export type MappedRow = { row: number; name: string; sku: string; url: string; category: string; subcategory: string; variant: string; stockStatus: "in" | "out" | ""; stockQty: number | null; description: string; hsn: string };

// Reads only mapped (non-price) cells; price columns are never copied out of the workbook.
export function mappedRows(wb: Workbook, sheet: string, map: Partial<Record<Field, number>>, limit?: number): MappedRow[] {
  const ws = wb.wb.Sheets[sheet];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false }) as any[][];
  const out: MappedRow[] = [];
  const g = (r: any[], f: Field) => (map[f] === undefined ? "" : clean(r[map[f]!]));
  const end = limit ? Math.min(raw.length, limit + 1) : raw.length;
  for (let i = 1; i < end; i++) {
    const r = raw[i];
    const st = g(r, "stockStatus").toLowerCase();
    const q = g(r, "stockQty");
    const qn = q === "" ? null : Number(q);
    out.push({
      row: i + 1, name: g(r, "name"), sku: g(r, "sku"), url: g(r, "url"), category: g(r, "category"), subcategory: g(r, "subcategory"),
      variant: g(r, "variant"), description: g(r, "description"), hsn: g(r, "hsn").replace(/\s/g, ""),
      stockStatus: /out|unavailable|no/.test(st) ? "out" : /in stock|available|yes|^in$/.test(st) ? "in" : "",
      stockQty: qn !== null && isFinite(qn) ? Math.round(qn) : null,
    });
  }
  raw.length = 0;
  return out;
}

export type ImportPlan = {
  added: Product[]; updated: { id: string; patch: Partial<Product> }[]; unchanged: number; duplicates: number; skipped: number; errors: string[]; total: number;
};

export function planImport(rows: MappedRow[], supplierId: string, existing: (id: string) => Product | undefined): ImportPlan {
  const plan: ImportPlan = { added: [], updated: [], unchanged: 0, duplicates: 0, skipped: 0, errors: [], total: rows.length };
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.name) {
      plan.skipped++;
      if (plan.errors.length < 50 && (r.sku || r.url)) plan.errors.push(`Row ${r.row}: missing product name — skipped`);
      continue;
    }
    if (r.url && !/^https?:\/\//i.test(r.url)) r.url = "";
    const id = productKey(supplierId, r.sku, r.name, r.variant);
    if (seen.has(id)) {
      plan.duplicates++;
      continue;
    }
    seen.add(id);
    const ex = existing(id);
    const info = { name: r.name, sku: r.sku, url: r.url, category: r.category, subcategory: r.subcategory, variant: r.variant, supplierStock: r.stockStatus, supplierQty: r.stockQty } as Partial<Product>;
    if (r.description) info.description = r.description;
    if (!ex) {
      plan.added.push({
        id, supplierId, ...info, hsn: r.hsn, hsnVerified: false, description: r.description, unit: "PCS", condition: "New", gstRate: null, sellingPrice: null, source: "import",
      } as Product);
      continue;
    }
    const patch: Partial<Product> = {};
    (Object.keys(info) as (keyof Product)[]).forEach((k) => {
      if ((info as any)[k] !== (ex as any)[k] && !((info as any)[k] === "" && !(ex as any)[k])) (patch as any)[k] = (info as any)[k];
    });
    if (r.hsn && !ex.hsn) patch.hsn = r.hsn; // never overwrite a manually assigned HSN
    if (Object.keys(patch).length) plan.updated.push({ id, patch });
    else plan.unchanged++;
  }
  return plan;
}

export function buildXlsx(sheets: { name: string; rows: (string | number | null)[][]; widths?: number[] }[]): string {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.widths) ws["!cols"] = s.widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet");
  }
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

export const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
export const safeName = (s: string) => s.replace(/[^A-Za-z0-9-_]+/g, "_");
