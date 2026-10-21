// Business operations on the local database.
import { getProduct, getProducts, shopStatus } from "./catalogue";
import {
  audit, Customer, getDB, Invoice, InvRecord, mutate, MovementType, nextNumber, nowISO, OrderItem, OrderStatus,
  Product, SupplierOrder, todayStr, uid,
} from "./store";
import { calcInvoice } from "@/src/lib/money";

export function newInv(productId: string): InvRecord {
  return { productId, qty: 0, minStock: 0, reorderQty: 0, location: "", serials: "", notes: "", valueRate: null, updatedAt: nowISO() };
}

export function updateProduct(id: string, patch: Partial<Product>) {
  mutate((d) => {
    d.overrides[id] = { ...d.overrides[id], ...patch, updatedAt: nowISO() };
    audit("edit", "product", id, Object.keys(patch).join(","));
  }, { catalogue: true });
}

export function addProduct(p: Product) {
  mutate((d) => {
    d.overrides[p.id] = { ...p, source: p.source || "manual", updatedAt: nowISO() };
    audit("add", "product", p.id);
  }, { catalogue: true });
}

export function deleteProduct(id: string) {
  mutate((d) => {
    if (!d.deleted.includes(id)) d.deleted.push(id);
    delete d.inventory[id];
    audit("delete", "product", id);
  }, { catalogue: true });
}

export function saveInv(productId: string, patch: Partial<InvRecord>) {
  mutate((d) => {
    d.inventory[productId] = { ...(d.inventory[productId] || newInv(productId)), ...patch, updatedAt: nowISO() };
  });
}

// type receive/return: +qty, sale: -qty, adjust: qty is the signed delta
export function moveStock(productId: string, type: MovementType, qty: number, ref = "", note = "") {
  const delta = type === "sale" ? -Math.abs(qty) : type === "adjust" ? qty : Math.abs(qty);
  mutate((d) => {
    const rec = d.inventory[productId] || newInv(productId);
    rec.qty = Math.round((rec.qty + delta) * 1000) / 1000;
    rec.updatedAt = nowISO();
    d.inventory[productId] = rec;
    d.movements.unshift({
      id: uid(), productId, productName: getProduct(productId)?.name || productId, type, delta, balance: rec.qty, ref, note, at: nowISO(),
    });
  });
}

// ---------- Supplier orders ----------
const OPEN: OrderStatus[] = ["Draft", "Requested", "Confirmed", "Partially Received"];
export function awaitingIds(): Set<string> {
  const s = new Set<string>();
  getDB().orders.forEach((o) => {
    if (OPEN.includes(o.status)) o.items.forEach((i) => i.qty > i.postedQty && s.add(i.productId));
  });
  return s;
}

function orderItemFor(p: Product): OrderItem {
  const inv = getDB().inventory[p.id];
  const cur = inv?.qty ?? 0;
  const min = inv?.minStock ?? 0;
  const suggested = inv?.reorderQty || Math.max(1, min - cur + 1);
  return {
    id: uid(), productId: p.id, name: p.name + (p.variant ? ` [${p.variant}]` : ""), sku: p.sku, url: p.url, unit: p.unit,
    qty: suggested, currentStock: cur, requiredStock: min, remarks: "", receivedQty: 0, postedQty: 0,
  };
}

// Adds products to the current Draft request of each product's supplier. Returns touched order ids.
export function addToDraftOrders(productIds: string[]): string[] {
  const touched = new Set<string>();
  mutate((d) => {
    for (const pid of productIds) {
      const p = getProduct(pid);
      if (!p) continue;
      let order = d.orders.find((o) => o.supplierId === p.supplierId && o.status === "Draft");
      if (!order) {
        const date = todayStr();
        order = {
          id: uid(), number: nextNumber("pr", date, (n) => d.orders.some((o) => o.number === n)), supplierId: p.supplierId,
          status: "Draft", date, urgency: "Normal", remarks: "", items: [], history: [{ status: "Draft", at: nowISO() }],
          createdAt: nowISO(), updatedAt: nowISO(),
        };
        d.orders.unshift(order);
      }
      if (!order.items.find((i) => i.productId === pid)) order.items.push(orderItemFor(p));
      order.updatedAt = nowISO();
      touched.add(order.id);
    }
  });
  return [...touched];
}

export function setOrderStatus(o: SupplierOrder, status: OrderStatus) {
  mutate(() => {
    o.status = status;
    o.history.push({ status, at: nowISO() });
    o.updatedAt = nowISO();
    audit("status", "supplier-order", o.number, status);
  });
}

export function postReceived(o: SupplierOrder) {
  let posted = 0;
  for (const it of o.items) {
    const delta = it.receivedQty - it.postedQty;
    if (delta > 0) {
      moveStock(it.productId, "receive", delta, o.number, "Received against supplier request");
      it.postedQty = it.receivedQty;
      posted++;
    }
  }
  const all = o.items.every((i) => i.postedQty >= i.qty);
  const any = o.items.some((i) => i.postedQty > 0);
  if (all) setOrderStatus(o, "Received");
  else if (any && o.status !== "Partially Received") setOrderStatus(o, "Partially Received");
  else mutate(() => {});
  return posted;
}

export function lowStockIds(kind: "low" | "out" | "both") {
  const inv = getDB().inventory;
  return getProducts()
    .filter((p) => {
      const s = shopStatus(inv[p.id]);
      return kind === "both" ? s === "low" || s === "out" : s === kind;
    })
    .map((p) => p.id);
}

// ---------- Customers ----------
export function saveCustomer(c: Customer) {
  mutate((d) => {
    const i = d.customers.findIndex((x) => x.id === c.id);
    if (i >= 0) d.customers[i] = c;
    else d.customers.unshift(c);
  });
}

export function customerOutstanding(customerId: string) {
  return getDB().invoices
    .filter((i) => i.customerId === customerId && i.status === "final")
    .reduce((a, i) => a + calcInvoice(i).balance, 0);
}

// ---------- Invoices ----------
export function newDraft(): Invoice {
  const s = getDB().settings;
  const inv: Invoice = {
    id: uid(), number: null, status: "draft", docType: s.invoice.defaultDocType, date: todayStr(), customerId: null,
    billTo: { name: "", address: "", mobile: "", gstin: "", state: s.business.state }, shipTo: { name: "", address: "" },
    placeOfSupply: s.business.state, supplyType: "intra", ratesIncludeTax: false, items: [], invoiceDiscount: 0, charges: 0,
    chargesLabel: "Additional charges", roundOff: true, previousBalance: 0, payments: [], paymentMode: "Cash", notes: "",
    cancelReason: "", createdAt: nowISO(), finalizedAt: null, stockPosted: false,
  };
  mutate((d) => {
    d.invoices.unshift(inv);
  });
  return inv;
}

export function saveDraft(inv: Invoice) {
  mutate((d) => {
    const i = d.invoices.findIndex((x) => x.id === inv.id);
    if (i < 0) return;
    if (d.invoices[i].status !== "draft") throw new Error("Finalized invoices cannot be edited");
    d.invoices[i] = inv;
  });
}

export function finalizeInvoice(id: string, opts: { deductStock: boolean }) {
  const d = getDB();
  const inv = d.invoices.find((x) => x.id === id);
  if (!inv || inv.status !== "draft") throw new Error("Only drafts can be finalized");
  mutate((db) => {
    inv.number = nextNumber("inv", inv.date, (n) => db.invoices.some((x) => x.number === n));
    inv.status = "final";
    inv.finalizedAt = nowISO();
    audit("finalize", "invoice", inv.number, "");
  });
  if (opts.deductStock) {
    inv.items.forEach((it) => it.productId && moveStock(it.productId, "sale", it.qty, inv.number!, "Invoice"));
    mutate(() => {
      inv.stockPosted = true;
    });
  }
  return inv.number!;
}

export function cancelInvoice(id: string, reason: string) {
  const inv = getDB().invoices.find((x) => x.id === id);
  if (!inv || inv.status !== "final") return;
  if (inv.stockPosted) inv.items.forEach((it) => it.productId && moveStock(it.productId, "return", it.qty, inv.number!, "Invoice cancelled"));
  mutate(() => {
    inv.status = "cancelled";
    inv.cancelReason = reason;
    inv.stockPosted = false;
    audit("cancel", "invoice", inv.number || "", reason);
  });
}

export function duplicateInvoice(id: string) {
  const src = getDB().invoices.find((x) => x.id === id);
  if (!src) return null;
  const copy: Invoice = {
    ...JSON.parse(JSON.stringify(src)), id: uid(), number: null, status: "draft", date: todayStr(), payments: [],
    cancelReason: "", createdAt: nowISO(), finalizedAt: null, stockPosted: false,
  };
  copy.items.forEach((i) => (i.id = uid()));
  mutate((d) => {
    d.invoices.unshift(copy);
  });
  return copy;
}

export function addPayment(id: string, amount: number, mode: string, note: string, date = todayStr()) {
  mutate((d) => {
    const inv = d.invoices.find((x) => x.id === id);
    if (!inv) return;
    inv.payments.push({ id: uid(), amount, mode, note, date });
    audit("payment", "invoice", inv.number || inv.id, mode);
  });
}

export function deleteDraft(id: string) {
  mutate((d) => {
    d.invoices = d.invoices.filter((x) => !(x.id === id && x.status === "draft"));
  });
}
