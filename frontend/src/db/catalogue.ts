// Unified product catalogue = bundled seed (prices stripped at build time) + local edits/imports.
import { getCatalogueRev, getDB, ImportRecord, InvRecord, Product, Supplier } from "./store";

type SeedRow = [string, string, string, string, string, string, "in" | "out" | "", number | null];
type SeedFile = {
  generatedAt: string;
  suppliers: { id: string; name: string; urlBase: string; rows: SeedRow[]; report: any }[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const seed: SeedFile = require("../../assets/data/catalogue.json");

export const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();

export const productKey = (supplierId: string, sku: string, name: string, variant: string) =>
  `${supplierId}:${(sku || "").trim().toLowerCase() || "n-" + norm(name).replace(/ /g, "")}${variant ? "#" + variant.trim().toLowerCase() : ""}`;

export const seedSuppliers: Supplier[] = seed.suppliers.map((s) => ({ id: s.id, name: s.name, urlBase: s.urlBase }));
export const seedImports: ImportRecord[] = seed.suppliers.map((s) => ({
  id: "seed-" + s.id, at: seed.generatedAt, file: s.report.file + " (pre-loaded)", supplierId: s.id, sheet: s.report.sheets?.[0]?.name || "",
  total: s.report.total, added: s.report.imported, updated: 0, unchanged: 0, duplicates: s.report.duplicates, skipped: s.report.skipped, errors: s.report.errors,
}));

export const blankProduct = (p: Partial<Product>): Product => ({
  id: "", supplierId: "", sku: "", name: "", url: "", category: "", subcategory: "", variant: "",
  supplierStock: "", supplierQty: null, hsn: "", hsnVerified: false, description: "", unit: "PCS",
  condition: "New", gstRate: null, sellingPrice: null, source: "manual", ...p,
});

let baseList: Product[] | null = null;
function base(): Product[] {
  if (baseList) return baseList;
  const out: Product[] = [];
  for (const s of seed.suppliers) {
    for (const r of s.rows) {
      const [sku, name, url, category, subcategory, variant, st, qty] = r;
      out.push(blankProduct({
        id: productKey(s.id, sku, name, variant), supplierId: s.id, sku, name,
        url: url.startsWith("~") ? s.urlBase + url.slice(1) : url,
        category, subcategory, variant, supplierStock: st, supplierQty: qty, source: "seed",
      }));
    }
  }
  baseList = out;
  return out;
}

type Cache = { rev: number; list: Product[]; byId: Map<string, Product>; hay: string[] };
let cache: Cache = { rev: -1, list: [], byId: new Map(), hay: [] };

function build(): Cache {
  const rev = getCatalogueRev();
  if (cache.rev === rev) return cache;
  const db = getDB();
  const deleted = new Set(db.deleted);
  const supName = new Map(db.suppliers.map((s) => [s.id, s.name]));
  const byId = new Map<string, Product>();
  const list: Product[] = [];
  for (const p of base()) {
    if (deleted.has(p.id)) continue;
    const o = db.overrides[p.id];
    const full = o ? { ...p, ...o } : p;
    byId.set(full.id, full);
    list.push(full);
  }
  for (const [id, o] of Object.entries(db.overrides)) {
    if (byId.has(id) || deleted.has(id) || o.source === "seed") continue;
    const full = blankProduct({ ...o, id });
    byId.set(id, full);
    list.push(full);
  }
  const hay = list.map((p) =>
    " " + norm([p.name, p.sku, p.hsn, p.category, p.subcategory, p.variant, supName.get(p.supplierId) || "", p.description].join(" ")) + " " +
    (p.sku || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  cache = { rev, list, byId, hay };
  vocab = null;
  return cache;
}

export const getProducts = () => build().list;
export const getProduct = (id: string) => build().byId.get(id);

// --- fuzzy helpers (for common typing mistakes) ---
let vocab: Map<string, number[]> | null = null;
function getVocab() {
  if (vocab) return vocab;
  const c = build();
  vocab = new Map();
  c.hay.forEach((h, i) => {
    for (const w of new Set(h.split(" "))) {
      if (w.length < 3) continue;
      let arr = vocab!.get(w);
      if (!arr) vocab!.set(w, (arr = []));
      arr.push(i);
    }
  });
  return vocab;
}
function within1(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2; } // transposition
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export type ShopStatus = "untracked" | "in" | "low" | "out";
export function shopStatus(inv?: InvRecord): ShopStatus {
  if (!inv) return "untracked";
  if (inv.qty <= 0) return "out";
  if (inv.qty <= inv.minStock) return "low";
  return "in";
}

export type Filters = {
  supplierId?: string;
  category?: string;
  stock?: "all" | "shop-in" | "shop-low" | "shop-out" | "tracked" | "sup-in" | "sup-out" | "no-hsn" | "hsn";
};

export function searchProducts(q: string, f: Filters): { items: Product[]; fuzzy: boolean } {
  const c = build();
  const inv = getDB().inventory;
  const tokens = norm(q).split(" ").filter(Boolean);
  const compact = q.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pass = (p: Product) => {
    if (f.supplierId && p.supplierId !== f.supplierId) return false;
    if (f.category && p.category !== f.category) return false;
    const st = f.stock || "all";
    if (st === "all") return true;
    if (st === "no-hsn") return !p.hsn;
    if (st === "hsn") return !!p.hsn;
    if (st === "sup-in") return p.supplierStock === "in";
    if (st === "sup-out") return p.supplierStock === "out";
    const s = shopStatus(inv[p.id]);
    if (st === "tracked") return s !== "untracked";
    if (st === "shop-in") return s === "in" || s === "low";
    if (st === "shop-low") return s === "low";
    return s === "out";
  };
  const items: Product[] = [];
  for (let i = 0; i < c.list.length; i++) {
    const h = c.hay[i];
    if (tokens.length && !tokens.every((t) => h.includes(t)) && !(compact.length >= 4 && h.includes(compact))) continue;
    if (pass(c.list[i])) items.push(c.list[i]);
  }
  if (items.length || !tokens.length) return { items, fuzzy: false };
  // fuzzy fallback: each token may be off by one character
  const v = getVocab();
  let hits: Set<number> | undefined;
  for (const t of tokens) {
    const set = new Set<number>();
    if (t.length >= 4) {
      for (const [w, idx] of v) if (within1(t, w) || (w.startsWith(t.slice(0, -1)) && t.length >= 5)) idx.forEach((i) => set.add(i));
    } else c.hay.forEach((h, i) => h.includes(t) && set.add(i));
    const prev: Set<number> | undefined = hits;
    hits = prev ? new Set([...prev].filter((x) => set.has(x))) : set;
  }
  const out = [...(hits || [])].map((i) => c.list[i]).filter(pass);
  return { items: out, fuzzy: true };
}

export function categories(supplierId?: string) {
  const m = new Map<string, number>();
  for (const p of build().list) {
    if (supplierId && p.supplierId !== supplierId) continue;
    if (p.category) m.set(p.category, (m.get(p.category) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// Potential duplicates: identical normalized name across different suppliers, or same SKU.
export function duplicateGroups() {
  const c = build();
  const db = getDB();
  const dismissed = new Set(db.dismissedDupes);
  const linkedOf = new Map<string, string>();
  Object.entries(db.links).forEach(([g, ids]) => ids.forEach((id) => linkedOf.set(id, g)));
  const byName = new Map<string, Product[]>();
  for (const p of c.list) {
    const k = norm(p.name + " " + p.variant);
    if (!k) continue;
    const arr = byName.get(k);
    if (arr) arr.push(p);
    else byName.set(k, [p]);
  }
  const groups: { key: string; reason: string; items: Product[]; linked: boolean }[] = [];
  for (const [k, arr] of byName) {
    if (arr.length < 2) continue;
    const key = "name:" + k;
    if (dismissed.has(key)) continue;
    const linked = arr.every((p) => linkedOf.has(p.id) && linkedOf.get(p.id) === linkedOf.get(arr[0].id));
    groups.push({ key, reason: new Set(arr.map((p) => p.supplierId)).size > 1 ? "Same name at different suppliers" : "Same name, same supplier", items: arr, linked });
  }
  return groups;
}

export function linkedProducts(id: string): Product[] {
  const db = getDB();
  for (const ids of Object.values(db.links)) if (ids.includes(id)) return ids.filter((x) => x !== id).map(getProduct).filter(Boolean) as Product[];
  return [];
}
