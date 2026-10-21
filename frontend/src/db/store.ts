// Local business database: in-memory state persisted to one JSON file on the device.
// Supplier catalogue prices are NEVER part of this schema.
import { useSyncExternalStore } from "react";

import { readDB, writeDB, writeSafetyCopy } from "./persist";

export const DB_VERSION = 1;

export type StockFlag = "in" | "out" | "";
export type Condition = "New" | "Refurbished" | "Used";

export type Supplier = {
  id: string;
  name: string;
  urlBase?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
};

export type Product = {
  id: string;
  supplierId: string;
  sku: string; // supplier SKU / product code, as in source
  name: string;
  url: string;
  category: string;
  subcategory: string;
  variant: string;
  supplierStock: StockFlag; // supplier-reported, informational only
  supplierQty: number | null; // supplier-reported, informational only
  hsn: string;
  hsnVerified: boolean;
  description: string;
  unit: string;
  condition: Condition;
  gstRate: number | null; // my configured GST %
  sellingPrice: number | null; // MY selling price in paise (never from supplier files)
  source: "seed" | "import" | "manual";
  updatedAt?: string;
};

export type InvRecord = {
  productId: string;
  qty: number; // physical shop stock
  minStock: number;
  reorderQty: number;
  location: string;
  serials: string;
  notes: string;
  valueRate: number | null; // optional manual valuation rate (paise)
  updatedAt: string;
};

export type MovementType = "receive" | "sale" | "return" | "adjust";
export type Movement = {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  delta: number;
  balance: number;
  ref: string;
  note: string;
  at: string;
};

export type Customer = {
  id: string;
  name: string;
  mobile: string;
  billingAddress: string;
  shippingAddress: string;
  gstin: string;
  state: string;
  email: string;
  notes: string;
  createdAt: string;
};

export type InvItem = {
  id: string;
  productId: string | null;
  name: string;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number; // paise
  discount: number; // paise, item-level
  gstRate: number;
  serial: string;
  warranty: string;
  condition: string;
};

export type Payment = { id: string; amount: number; mode: string; date: string; note: string };

export type Invoice = {
  id: string;
  number: string | null;
  status: "draft" | "final" | "cancelled";
  docType: "tax" | "bos";
  date: string; // yyyy-mm-dd
  customerId: string | null;
  billTo: { name: string; address: string; mobile: string; gstin: string; state: string };
  shipTo: { name: string; address: string };
  placeOfSupply: string;
  supplyType: "intra" | "inter";
  ratesIncludeTax: boolean;
  items: InvItem[];
  invoiceDiscount: number; // paise, applied after tax
  charges: number; // paise, additional charges
  chargesLabel: string;
  roundOff: boolean;
  previousBalance: number; // paise
  payments: Payment[];
  paymentMode: string;
  notes: string;
  cancelReason: string;
  createdAt: string;
  finalizedAt: string | null;
  stockPosted: boolean;
};

export type OrderStatus = "Draft" | "Requested" | "Confirmed" | "Partially Received" | "Received" | "Cancelled";
export type OrderItem = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  url: string;
  unit: string;
  qty: number;
  currentStock: number;
  requiredStock: number;
  remarks: string;
  receivedQty: number;
  postedQty: number;
};
export type SupplierOrder = {
  id: string;
  number: string;
  supplierId: string;
  status: OrderStatus;
  date: string;
  urgency: "Normal" | "Urgent";
  remarks: string;
  items: OrderItem[];
  history: { status: OrderStatus; at: string }[];
  createdAt: string;
  updatedAt: string;
};

export type Settings = {
  business: {
    name: string; parent: string; tagline: string; address: string; state: string;
    phone: string; email: string; gstin: string; pan: string; logo: string;
  };
  invoice: {
    prefix: string; prPrefix: string; defaultDocType: "tax" | "bos"; terms: string; warranty: string;
    paymentInstructions: string; footer: string; signatory: string; showCustomerSign: boolean; signature: string;
  };
  bank: { holder: string; bankName: string; account: string; ifsc: string; branch: string; upi: string; payee: string; qrImage: string };
  defaults: { unit: string; gstRate: number };
  taxRates: number[];
  units: string[];
  theme: "light" | "dark" | "system";
};

export type ImportRecord = {
  id: string; at: string; file: string; supplierId: string; sheet: string;
  total: number; added: number; updated: number; unchanged: number; duplicates: number; skipped: number; errors: number;
};
export type AuditEntry = { at: string; action: string; entity: string; ref: string; detail: string };

export type DB = {
  version: number;
  suppliers: Supplier[];
  overrides: Record<string, Partial<Product>>; // edits to seed products + full non-seed products
  deleted: string[];
  links: Record<string, string[]>; // manual links: groupId -> product ids
  dismissedDupes: string[];
  inventory: Record<string, InvRecord>;
  movements: Movement[];
  customers: Customer[];
  invoices: Invoice[];
  orders: SupplierOrder[];
  settings: Settings;
  importHistory: ImportRecord[];
  audit: AuditEntry[];
  counters: Record<string, number>;
};

export const defaultSettings = (): Settings => ({
  business: { name: "TechronixHub India", parent: "SK Enterprises", tagline: "", address: "", state: "", phone: "", email: "", gstin: "", pan: "", logo: "" },
  invoice: {
    prefix: "TXH", prPrefix: "PR", defaultDocType: "tax",
    terms: "1. Goods once sold will not be taken back or exchanged.\n2. Please check items at the time of delivery.",
    warranty: "", paymentInstructions: "", footer: "Thank you for your business!", signatory: "", showCustomerSign: true, signature: "",
  },
  bank: { holder: "", bankName: "", account: "", ifsc: "", branch: "", upi: "", payee: "", qrImage: "" },
  defaults: { unit: "PCS", gstRate: 18 },
  taxRates: [0, 5, 12, 18, 28],
  units: ["PCS", "NOS", "SET", "BOX", "METRE", "PAIR", "KG"],
  theme: "light",
});

const emptyDB = (): DB => ({
  version: DB_VERSION,
  suppliers: [],
  overrides: {},
  deleted: [],
  links: {},
  dismissedDupes: [],
  inventory: {},
  movements: [],
  customers: [],
  invoices: [],
  orders: [],
  settings: defaultSettings(),
  importHistory: [],
  audit: [],
  counters: {},
});

let db: DB = emptyDB();
let loaded = false;
let catalogueRev = 0;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveError: string | null = null;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const nowISO = () => new Date().toISOString();
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function getDB() {
  return db;
}
export function getCatalogueRev() {
  return catalogueRev;
}
export function getSaveError() {
  return saveError;
}

function emit() {
  db = { ...db };
  listeners.forEach((l) => l());
}

export function useDB(): DB {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => db,
    () => db,
  );
}

// Mutate the database. Pass catalogue=true when product data changes.
export function mutate(fn: (d: DB) => void, opts: { catalogue?: boolean } = {}) {
  fn(db);
  if (opts.catalogue) catalogueRev++;
  emit();
  scheduleSave();
}

export function audit(action: string, entity: string, ref: string, detail = "") {
  db.audit.unshift({ at: nowISO(), action, entity, ref, detail });
  if (db.audit.length > 3000) db.audit.length = 3000;
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushSave();
  }, 400);
}

let saving: Promise<void> = Promise.resolve();
export async function flushSave(): Promise<boolean> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const json = JSON.stringify(db);
  saving = saving.then(async () => {
    try {
      await writeDB(json);
      saveError = null;
    } catch (e: any) {
      saveError = e?.message || "Save failed";
      console.warn("[db] save failed");
    }
  });
  await saving;
  return saveError === null;
}

function migrate(data: any): DB {
  const base = emptyDB();
  const out: DB = { ...base, ...data };
  out.settings = {
    ...base.settings,
    ...data.settings,
    business: { ...base.settings.business, ...data.settings?.business },
    invoice: { ...base.settings.invoice, ...data.settings?.invoice },
    bank: { ...base.settings.bank, ...data.settings?.bank },
    defaults: { ...base.settings.defaults, ...data.settings?.defaults },
  };
  out.version = DB_VERSION;
  return out;
}

export function isLoaded() {
  return loaded;
}

export async function initDB(seedSuppliers: Supplier[], seedImports: ImportRecord[]) {
  const raw = await readDB();
  if (raw) {
    db = migrate(JSON.parse(raw));
  } else {
    db = emptyDB();
    db.suppliers = seedSuppliers;
    db.importHistory = seedImports;
    audit("init", "database", "", "Pre-loaded catalogues (prices excluded)");
    await writeDB(JSON.stringify(db));
  }
  for (const s of seedSuppliers) if (!db.suppliers.find((x) => x.id === s.id)) db.suppliers.push(s);
  loaded = true;
  catalogueRev++;
  emit();
}

// ---------- Backup / restore ----------
export const BACKUP_FORMAT = "techronixhub-backup";

export function makeBackup() {
  return JSON.stringify({ format: BACKUP_FORMAT, version: DB_VERSION, createdAt: nowISO(), data: db });
}

export type BackupPreview = { ok: true; createdAt: string; data: DB; counts: Record<string, number> } | { ok: false; error: string };

export function validateBackup(text: string): BackupPreview {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not a valid backup (cannot be read)." };
  }
  if (parsed?.format !== BACKUP_FORMAT) return { ok: false, error: "This file is not a TechronixHub backup." };
  if (typeof parsed.version !== "number" || parsed.version > DB_VERSION)
    return { ok: false, error: `Backup version ${parsed.version} is newer than this app supports (${DB_VERSION}). Update the app first.` };
  const d = parsed.data;
  const arrays = ["suppliers", "movements", "customers", "invoices", "orders"];
  for (const k of arrays) if (!Array.isArray(d?.[k])) return { ok: false, error: `Backup is damaged: missing ${k}.` };
  if (typeof d.inventory !== "object" || typeof d.settings !== "object") return { ok: false, error: "Backup is damaged: missing inventory/settings." };
  return {
    ok: true,
    createdAt: parsed.createdAt,
    data: migrate(d),
    counts: countsOf(d),
  };
}

export function countsOf(d: DB) {
  return {
    "Edited / added products": Object.keys(d.overrides || {}).length,
    "Inventory items": Object.keys(d.inventory || {}).length,
    "Stock movements": d.movements.length,
    Customers: d.customers.length,
    Invoices: d.invoices.length,
    "Supplier requests": d.orders.length,
    Suppliers: d.suppliers.length,
  };
}

export async function restoreBackup(data: DB) {
  await writeSafetyCopy(JSON.stringify(db));
  const previous = db;
  db = data;
  audit("restore", "database", "", "Restored from backup");
  try {
    await writeDB(JSON.stringify(db));
  } catch (e) {
    db = previous; // keep existing data if restore cannot be written
    throw e;
  }
  catalogueRev++;
  emit();
}

// ---------- Numbering ----------
export function financialYear(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(y % 100).padStart(2, "0")}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export function nextNumber(kind: "inv" | "pr", dateStr: string, exists: (n: string) => boolean) {
  const fy = financialYear(dateStr);
  const prefix = kind === "inv" ? db.settings.invoice.prefix || "INV" : db.settings.invoice.prPrefix || "PR";
  const key = `${kind}:${prefix}:${fy}`;
  let seq = (db.counters[key] || 0) + 1;
  let num = `${prefix}/${fy}/${String(seq).padStart(3, "0")}`;
  while (exists(num)) {
    seq++;
    num = `${prefix}/${fy}/${String(seq).padStart(3, "0")}`;
  }
  db.counters[key] = seq;
  return num;
}
