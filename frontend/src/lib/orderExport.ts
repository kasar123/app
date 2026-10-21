// Supplier replenishment exports (PDF + Excel). Deliberately contain no prices, rates, taxes or totals.
import { getDB, OrderStatus, SupplierOrder } from "@/src/db/store";
import { buildXlsx, safeName, stamp } from "./excel";
import { Output, outputBase64, outputPdf } from "./files";
import { orderHtml } from "./pdf";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function orderSheet(o: SupplierOrder, itemIds?: string[]) {
  const db = getDB();
  const sup = db.suppliers.find((s) => s.id === o.supplierId);
  const b = db.settings.business;
  const items = itemIds ? o.items.filter((i) => itemIds.includes(i.id)) : o.items;
  const rows: (string | number | null)[][] = [
    [b.name + (b.parent ? ` (${b.parent})` : "")],
    ["STOCK REPLENISHMENT REQUEST — not a purchase invoice"],
    ["Request No", o.number, "", "Date", o.date],
    ["Supplier", sup?.name || o.supplierId, "", "Status", o.status],
    ["Supplier contact", [sup?.contactPerson, sup?.phone, sup?.email].filter(Boolean).join(" / "), "", "Urgency", o.urgency],
    ["Remarks", o.remarks],
    [],
    ["S.No", "Product name", "Supplier SKU / code", "Qty requested", "Unit", "Current stock", "Required stock", "Remarks", "Product URL"],
    ...items.map((it, i) => [i + 1, it.name, it.sku, it.qty, it.unit, it.currentStock, it.requiredStock, it.remarks, it.url]),
    [],
    ["", "Total items", items.length, items.reduce((a, i) => a + i.qty, 0)],
    [],
    ["", "Authorised person / signature:"],
  ];
  return { name: (sup?.name || o.supplierId).slice(0, 24) + " " + o.number.split("/").pop(), rows, widths: [6, 60, 20, 12, 7, 12, 13, 24, 60] };
}

export async function exportOrderXlsx(orders: SupplierOrder[], mode: Output, itemIds?: string[], label = "") {
  const b64 = buildXlsx(orders.map((o) => orderSheet(o, itemIds)));
  const name = orders.length === 1 ? `supplier-request-${safeName(orders[0].number)}${label}-${stamp()}.xlsx` : `supplier-requests${label}-${stamp()}.xlsx`;
  return outputBase64(name, b64, XLSX_MIME, mode);
}

export async function exportOrderPdf(o: SupplierOrder, mode: Output | "print", itemIds?: string[]) {
  const db = getDB();
  const html = orderHtml(o, db.suppliers.find((s) => s.id === o.supplierId), db.settings, itemIds);
  return outputPdf(`supplier-request-${safeName(o.number)}-${stamp()}.pdf`, html, mode);
}

export const STATUSES: OrderStatus[] = ["Draft", "Requested", "Confirmed", "Partially Received", "Received", "Cancelled"];
export const statusTone = (s: OrderStatus) =>
  (({ Draft: "warning", Requested: "info", Confirmed: "brand", "Partially Received": "accent", Received: "success", Cancelled: "neutral" }) as const)[s];

