// HTML templates rendered to A4 PDF locally (expo-print). No network resources used.
import { calcInvoice, amountInWords, fmt, fmtQty } from "./money";
import type { Invoice, Settings, Supplier, SupplierOrder } from "@/src/db/store";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const qrcode = require("qrcode-generator");

const esc = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl = (s: string) => esc(s).replace(/\n/g, "<br/>");
const dmy = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const baseCss = `
*{box-sizing:border-box} body{font-family:Helvetica,Arial,sans-serif;color:#0B132B;font-size:11px;margin:0}
.page{padding:22px 26px} table{width:100%;border-collapse:collapse} td,th{padding:5px 6px;vertical-align:top}
.box{border:1px solid #9AA5B8} .b{font-weight:700} .r{text-align:right} .c{text-align:center} .muted{color:#55607A}
.hdr td{border:1px solid #9AA5B8} th{background:#E8EEF9;border:1px solid #9AA5B8;font-size:10px;text-transform:uppercase}
.items td{border-left:1px solid #9AA5B8;border-right:1px solid #9AA5B8} .items tr.line td{border-bottom:1px solid #E2E6EE}
.items tr.tot td{border:1px solid #9AA5B8;font-weight:700;background:#F4F6FA}
.title{font-size:17px;font-weight:800;color:#1D4ED8} .tag{font-size:9px;border:1px solid #F97316;color:#C2410C;padding:2px 6px;border-radius:3px}
.sec td{border:1px solid #9AA5B8} .qr{width:120px;height:120px;border:1px dashed #9AA5B8;display:flex;align-items:center;justify-content:center;color:#8A94A8;font-size:9px;text-align:center}
`;

function logoHtml(s: Settings) {
  return s.business.logo ? `<img src="${s.business.logo}" style="max-height:64px;max-width:120px"/>` : "";
}

export function upiString(s: Settings, amountPaise: number, ref: string) {
  if (!s.bank.upi || !s.bank.payee) return null;
  const am = (amountPaise / 100).toFixed(2);
  return `upi://pay?pa=${encodeURIComponent(s.bank.upi)}&pn=${encodeURIComponent(s.bank.payee)}&am=${am}&cu=INR&tn=${encodeURIComponent("Invoice " + ref)}`;
}

function qrSvg(data: string) {
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
}

export function invoiceHtml(inv: Invoice, s: Settings) {
  const c = calcInvoice(inv);
  const b = s.business;
  const title = inv.docType === "tax" ? "TAX INVOICE" : "BILL OF SUPPLY";
  const number = inv.number || "DRAFT";
  const intra = inv.supplyType === "intra";
  const taxed = inv.docType === "tax";

  const rows = inv.items.map((it, i) => {
    const l = c.lines[i];
    const extra = [
      it.description && esc(it.description),
      it.condition && it.condition !== "New" ? "Condition: " + esc(it.condition) : "",
      it.serial && "Serial No: " + esc(it.serial),
      it.warranty && "Warranty: " + esc(it.warranty),
      l.discount ? "Discount: " + fmt(l.discount) : "",
      taxed && l.rate ? `GST ${l.rate}%` : "",
    ].filter(Boolean).join("<br/>");
    return `<tr class="line"><td class="c">${i + 1}</td><td><span class="b">${esc(it.name)}</span>${extra ? `<div class="muted" style="font-size:9.5px">${extra}</div>` : ""}</td>
    <td class="c">${esc(it.hsn || "-")}</td><td class="r">${fmtQty(it.qty)} ${esc(it.unit)}</td><td class="r">${fmt(it.rate, false)}</td><td class="r">${fmt(l.taxable, false)}</td></tr>`;
  }).join("");

  const taxRows = taxed ? c.taxByRate.map(([rate, t]) => intra
    ? `<tr><td></td><td class="r muted">CGST @${rate / 2}%</td><td></td><td></td><td></td><td class="r">${fmt(t.cgst)}</td></tr><tr><td></td><td class="r muted">SGST @${rate / 2}%</td><td></td><td></td><td></td><td class="r">${fmt(t.sgst)}</td></tr>`
    : `<tr><td></td><td class="r muted">IGST @${rate}%</td><td></td><td></td><td></td><td class="r">${fmt(t.igst)}</td></tr>`).join("") : "";
  const misc = [
    inv.charges ? `<tr><td></td><td class="r muted">${esc(inv.chargesLabel || "Additional charges")}</td><td></td><td></td><td></td><td class="r">${fmt(inv.charges)}</td></tr>` : "",
    inv.invoiceDiscount ? `<tr><td></td><td class="r muted">Discount</td><td></td><td></td><td></td><td class="r">- ${fmt(inv.invoiceDiscount)}</td></tr>` : "",
    c.roundOff ? `<tr><td></td><td class="r muted">Round off</td><td></td><td></td><td></td><td class="r">${fmt(c.roundOff)}</td></tr>` : "",
  ].join("");

  const hsnHead = intra
    ? `<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable Value</th><th colspan="2">CGST</th><th colspan="2">SGST</th><th rowspan="2">Total Tax</th></tr><tr><th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th></tr>`
    : `<tr><th rowspan="2">HSN/SAC</th><th rowspan="2">Taxable Value</th><th colspan="2">IGST</th><th rowspan="2">Total Tax</th></tr><tr><th>Rate</th><th>Amount</th></tr>`;
  const hsnRows = c.hsn.map((h) => intra
    ? `<tr><td>${esc(h.hsn)}</td><td class="r">${fmt(h.taxable, false)}</td><td class="r">${h.rate / 2}%</td><td class="r">${fmt(h.cgst, false)}</td><td class="r">${h.rate / 2}%</td><td class="r">${fmt(h.sgst, false)}</td><td class="r">${fmt(h.tax)}</td></tr>`
    : `<tr><td>${esc(h.hsn)}</td><td class="r">${fmt(h.taxable, false)}</td><td class="r">${h.rate}%</td><td class="r">${fmt(h.igst, false)}</td><td class="r">${fmt(h.tax)}</td></tr>`).join("");
  const hsnTotal = intra
    ? `<tr class="b"><td>Total</td><td class="r">${fmt(c.taxable, false)}</td><td></td><td class="r">${fmt(c.cgst, false)}</td><td></td><td class="r">${fmt(c.sgst, false)}</td><td class="r">${fmt(c.tax)}</td></tr>`
    : `<tr class="b"><td>Total</td><td class="r">${fmt(c.taxable, false)}</td><td></td><td class="r">${fmt(c.igst, false)}</td><td class="r">${fmt(c.tax)}</td></tr>`;

  const bk = s.bank;
  const bankLines = [
    bk.holder && `Name: ${esc(bk.holder)}`, bk.ifsc && `IFSC Code: ${esc(bk.ifsc)}`, bk.account && `Account No: ${esc(bk.account)}`,
    (bk.bankName || bk.branch) && `Bank: ${esc([bk.bankName, bk.branch].filter(Boolean).join(", "))}`,
  ].filter(Boolean).join("<br/>") || `<span class="muted">Bank details not configured</span>`;

  const due = Math.max(0, c.balance);
  const upi = inv.status === "final" && due > 0 ? upiString(s, due, number) : null;
  let qr = `<div class="qr">Payment QR<br/>not configured</div>`;
  if (upi) qr = `<div style="width:120px;height:120px">${qrSvg(upi)}</div><div class="muted" style="font-size:9px">Scan to pay ${fmt(due)}</div>`;
  else if (bk.qrImage) qr = `<img src="${bk.qrImage}" style="width:120px;height:120px;object-fit:contain"/><div class="muted" style="font-size:9px">Static payment QR</div>`;

  const paid = inv.payments.length
    ? `<tr><td class="r muted" colspan="5">AMOUNT RECEIVED${inv.payments.length === 1 ? ` (${esc(inv.payments[0].mode)})` : ""}</td><td class="r">${fmt(c.paid)}</td></tr>` : "";

  return `<html><head><meta charset="utf-8"/><style>${baseCss}@page{size:A4;margin:0}</style></head><body><div class="page">
  ${inv.status === "cancelled" ? `<div style="color:#DC2626;font-weight:800;font-size:16px;text-align:center;border:2px solid #DC2626;padding:4px;margin-bottom:8px">CANCELLED — ${esc(inv.cancelReason)}</div>` : ""}
  ${inv.status === "draft" ? `<div style="color:#B45309;font-weight:800;text-align:center;border:2px dashed #B45309;padding:4px;margin-bottom:8px">DRAFT — NOT A VALID INVOICE</div>` : ""}
  <table><tr><td style="padding:0"><span class="b" style="font-size:14px">${title}</span> <span class="tag">ORIGINAL FOR RECIPIENT</span></td></tr></table>
  <table class="hdr" style="margin-top:6px"><tr>
    <td rowspan="3" style="width:60%"><table><tr><td style="padding:0;width:1px">${logoHtml(s)}</td><td style="padding:0 0 0 8px">
      <div class="title">${esc(b.name)}</div>${b.parent ? `<div class="muted">(A unit of ${esc(b.parent)})</div>` : ""}${b.tagline ? `<div class="muted">${esc(b.tagline)}</div>` : ""}
      <div>${nl(b.address)}</div>
      ${b.gstin ? `<div><span class="b">GSTIN:</span> ${esc(b.gstin)}</div>` : ""}${b.pan ? `<div><span class="b">PAN Number:</span> ${esc(b.pan)}</div>` : ""}
      ${b.phone ? `<div><span class="b">Mobile:</span> ${esc(b.phone)}</div>` : ""}${b.email ? `<div><span class="b">Email:</span> ${esc(b.email)}</div>` : ""}
    </td></tr></table></td>
    <td><div class="muted">Invoice No.</div><div class="b">${esc(number)}</div></td><td><div class="muted">Invoice Date</div><div class="b">${dmy(inv.date)}</div></td></tr>
    <tr><td colspan="2"><div class="muted">Place of Supply</div><div class="b">${esc(inv.placeOfSupply || "-")}</div></td></tr>
    <tr><td colspan="2"><div class="muted">Supply type</div><div>${intra ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"}${inv.ratesIncludeTax ? "<br/>Rates inclusive of GST" : ""}</div></td></tr>
  </table>
  <table class="sec" style="margin-top:6px"><tr><th style="text-align:left">Bill To</th><th style="text-align:left">Ship To</th></tr><tr>
    <td><div class="b">${esc(inv.billTo.name)}</div>${inv.billTo.address ? `<div>Address: ${nl(inv.billTo.address)}</div>` : ""}
      ${inv.billTo.mobile ? `<div>Mobile: ${esc(inv.billTo.mobile)}</div>` : ""}${inv.billTo.gstin ? `<div>GSTIN: ${esc(inv.billTo.gstin)}</div>` : ""}${inv.billTo.state ? `<div>State: ${esc(inv.billTo.state)}</div>` : ""}</td>
    <td><div class="b">${esc(inv.shipTo.name || inv.billTo.name)}</div><div>${inv.shipTo.address || inv.billTo.address ? "Address: " + nl(inv.shipTo.address || inv.billTo.address) : ""}</div></td>
  </tr></table>
  <table class="items" style="margin-top:6px"><tr><th style="width:34px">S.No.</th><th style="text-align:left">Items</th><th>HSN/SAC</th><th>Qty.</th><th>Rate</th><th>Amount</th></tr>
    ${rows}${taxRows}${misc}
    <tr class="tot"><td></td><td>TOTAL</td><td></td><td class="r">${fmtQty(c.qty)}</td><td></td><td class="r">${fmt(c.grand)}</td></tr>
    ${paid}
    <tr><td class="r muted" colspan="5">BALANCE PAYABLE</td><td class="r b">${fmt(c.balance)}</td></tr>
    <tr><td class="r muted" colspan="5">PREVIOUS BALANCE</td><td class="r">${fmt(inv.previousBalance)}</td></tr>
    <tr class="tot"><td class="r" colspan="5">CURRENT BALANCE</td><td class="r">${fmt(c.currentBalance)}</td></tr>
  </table>
  ${taxed && c.hsn.length ? `<table class="sec" style="margin-top:6px">${hsnHead}${hsnRows}${hsnTotal}</table>` : ""}
  <table class="sec" style="margin-top:6px"><tr><td><span class="muted">Total Amount (in words)</span><br/><span class="b">${amountInWords(c.grand)}</span></td></tr></table>
  <table class="sec" style="margin-top:6px"><tr><th style="text-align:left">Bank Details</th><th style="text-align:left;width:170px">Payment QR Code</th></tr><tr>
    <td>${bankLines}${bk.upi ? `<br/>UPI ID: ${esc(bk.upi)}` : ""}${s.invoice.paymentInstructions ? `<div style="margin-top:6px">${nl(s.invoice.paymentInstructions)}</div>` : ""}</td>
    <td>${qr}</td></tr></table>
  <table class="sec" style="margin-top:6px"><tr><td style="width:60%"><div class="b">Terms and Conditions</div><div>${nl(s.invoice.terms)}</div>
    ${s.invoice.warranty ? `<div class="b" style="margin-top:4px">Warranty / Returns</div><div>${nl(s.invoice.warranty)}</div>` : ""}
    ${inv.notes ? `<div class="b" style="margin-top:4px">Notes</div><div>${nl(inv.notes)}</div>` : ""}</td>
    <td class="r" style="vertical-align:bottom">${s.invoice.signature ? `<img src="${s.invoice.signature}" style="max-height:50px"/><br/>` : "<br/><br/><br/>"}
      <div class="b">Authorised Signatory For</div><div>${esc(b.name)}</div>${s.invoice.signatory ? `<div class="muted">${esc(s.invoice.signatory)}</div>` : ""}</td></tr>
    ${s.invoice.showCustomerSign ? `<tr><td colspan="2" style="height:46px;vertical-align:bottom" class="muted">Customer acknowledgement / signature</td></tr>` : ""}
  </table>
  ${s.invoice.footer ? `<div class="c muted" style="margin-top:8px">${esc(s.invoice.footer)}</div>` : ""}
  </div></body></html>`;
}

// Supplier replenishment request — deliberately contains NO prices, rates, taxes or totals.
export function orderHtml(o: SupplierOrder, sup: Supplier | undefined, s: Settings, itemIds?: string[]) {
  const items = itemIds ? o.items.filter((i) => itemIds.includes(i.id)) : o.items;
  const b = s.business;
  const rows = items.map((it, i) => `<tr class="line"><td class="c">${i + 1}</td><td><span class="b">${esc(it.name)}</span>${it.url ? `<div class="muted" style="font-size:8.5px;word-break:break-all">${esc(it.url)}</div>` : ""}</td>
    <td>${esc(it.sku)}</td><td class="r b">${fmtQty(it.qty)}</td><td class="c">${esc(it.unit)}</td><td class="r">${fmtQty(it.currentStock)}</td><td class="r">${fmtQty(it.requiredStock)}</td><td>${esc(it.remarks)}</td></tr>`).join("");
  return `<html><head><meta charset="utf-8"/><style>${baseCss}@page{size:A4;margin:0}</style></head><body><div class="page">
  <table class="hdr"><tr><td style="width:62%"><table><tr><td style="padding:0;width:1px">${logoHtml(s)}</td><td style="padding:0 0 0 8px">
    <div class="title">${esc(b.name)}</div>${b.parent ? `<div class="muted">(A unit of ${esc(b.parent)})</div>` : ""}<div>${nl(b.address)}</div>
    ${b.phone ? `<div>Mobile: ${esc(b.phone)}</div>` : ""}${b.email ? `<div>Email: ${esc(b.email)}</div>` : ""}${b.gstin ? `<div>GSTIN: ${esc(b.gstin)}</div>` : ""}</td></tr></table></td>
    <td><div class="b" style="font-size:14px">STOCK REPLENISHMENT REQUEST</div><div class="muted">Not a purchase invoice</div>
      <div style="margin-top:6px">Request No: <span class="b">${esc(o.number)}</span></div><div>Date: <span class="b">${dmy(o.date)}</span></div>
      <div>Status: ${esc(o.status)}</div>${o.urgency === "Urgent" ? `<div class="tag" style="display:inline-block;margin-top:4px">URGENT</div>` : ""}</td></tr></table>
  <table class="sec" style="margin-top:6px"><tr><th style="text-align:left">Supplier</th></tr><tr><td><div class="b">${esc(sup?.name || o.supplierId)}</div>
    ${sup?.contactPerson ? `<div>Contact: ${esc(sup.contactPerson)}</div>` : ""}${sup?.phone ? `<div>Phone: ${esc(sup.phone)}</div>` : ""}${sup?.email ? `<div>Email: ${esc(sup.email)}</div>` : ""}${sup?.address ? `<div>${nl(sup.address)}</div>` : ""}</td></tr></table>
  <table class="items" style="margin-top:6px"><tr><th>S.No.</th><th style="text-align:left">Product</th><th>Supplier SKU</th><th>Qty Req.</th><th>Unit</th><th>Current Stock</th><th>Required Stock</th><th>Remarks</th></tr>
    ${rows}<tr class="tot"><td></td><td>Total items: ${items.length}</td><td></td><td class="r">${fmtQty(items.reduce((a, i) => a + i.qty, 0))}</td><td colspan="4"></td></tr></table>
  ${o.remarks ? `<table class="sec" style="margin-top:6px"><tr><td><span class="b">Remarks:</span> ${nl(o.remarks)}</td></tr></table>` : ""}
  <table style="margin-top:40px"><tr><td class="muted">Please confirm availability and expected delivery.</td><td class="r"><br/><br/>______________________<br/><span class="b">Authorised Person</span><br/>${esc(b.name)}${s.invoice.signatory ? `<br/>${esc(s.invoice.signatory)}` : ""}</td></tr></table>
  </div></body></html>`;
}
