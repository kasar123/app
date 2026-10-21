// Precise money math in integer paise. All amounts stored as integers (paise).
import type { Invoice } from "@/src/db/store";

export function toPaise(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[,₹\s]/g, ""));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function paiseToInput(p: number | null | undefined): string {
  if (p === null || p === undefined) return "";
  return (p / 100).toFixed(2).replace(/\.00$/, "");
}

function groupIndian(intStr: string) {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return rest + "," + last3;
}

export function fmt(p: number, symbol = true): string {
  const neg = p < 0;
  const abs = Math.abs(Math.round(p));
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  const s = groupIndian(String(rupees)) + "." + String(paise).padStart(2, "0");
  return (neg ? "-" : "") + (symbol ? "₹ " : "") + s;
}

export function fmtQty(q: number) {
  return Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number) {
  if (n < 20) return ones[n];
  return (tens[Math.floor(n / 10)] + " " + ones[n % 10]).trim();
}
function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? ones[h] + " Hundred" : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}
function intWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(intWords(crore) + " Crore");
  if (lakh) parts.push(twoDigits(lakh) + " Lakh");
  if (thousand) parts.push(twoDigits(thousand) + " Thousand");
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}

export function amountInWords(p: number): string {
  const abs = Math.abs(Math.round(p));
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  let s = intWords(rupees) + " Rupees";
  if (paise) s += " and " + twoDigits(paise) + " Paise";
  return (p < 0 ? "Minus " : "") + s + " Only";
}

export type CalcLine = { gross: number; discount: number; taxable: number; cgst: number; sgst: number; igst: number; total: number; rate: number };
export type HsnRow = { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number };

export function calcInvoice(inv: Invoice) {
  const taxed = inv.docType === "tax";
  const lines: CalcLine[] = inv.items.map((it) => {
    const gross = Math.round((it.qty || 0) * (it.rate || 0));
    const discount = Math.min(Math.max(0, it.discount || 0), gross);
    const net = gross - discount;
    const r = taxed ? it.gstRate || 0 : 0;
    const taxable = inv.ratesIncludeTax && r ? Math.round((net * 100) / (100 + r)) : net;
    let cgst = 0, sgst = 0, igst = 0;
    if (r) {
      if (inv.supplyType === "intra") {
        cgst = Math.round((taxable * r) / 200);
        sgst = cgst;
        if (inv.ratesIncludeTax) sgst = net - taxable - cgst; // keep line total equal to entered inclusive amount
      } else {
        igst = inv.ratesIncludeTax ? net - taxable : Math.round((taxable * r) / 100);
      }
    }
    return { gross, discount, taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst, rate: r };
  });
  const sum = (k: keyof CalcLine) => lines.reduce((a, l) => a + (l[k] as number), 0);
  const taxable = sum("taxable");
  const cgst = sum("cgst");
  const sgst = sum("sgst");
  const igst = sum("igst");
  const itemDiscount = sum("discount");
  const qty = inv.items.reduce((a, i) => a + (i.qty || 0), 0);
  const beforeRound = taxable + cgst + sgst + igst + (inv.charges || 0) - (inv.invoiceDiscount || 0);
  const grand = inv.roundOff ? Math.round(beforeRound / 100) * 100 : beforeRound;
  const roundOff = grand - beforeRound;
  const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
  const balance = grand - paid;

  const map = new Map<string, HsnRow>();
  inv.items.forEach((it, i) => {
    const l = lines[i];
    const key = (it.hsn || "-") + "@" + l.rate;
    const row = map.get(key) || { hsn: it.hsn || "-", rate: l.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
    row.taxable += l.taxable;
    row.cgst += l.cgst;
    row.sgst += l.sgst;
    row.igst += l.igst;
    row.tax += l.cgst + l.sgst + l.igst;
    map.set(key, row);
  });
  // tax lines grouped by rate (like the reference invoice)
  const rates = new Map<number, { cgst: number; sgst: number; igst: number }>();
  lines.forEach((l) => {
    if (!l.rate) return;
    const r = rates.get(l.rate) || { cgst: 0, sgst: 0, igst: 0 };
    r.cgst += l.cgst;
    r.sgst += l.sgst;
    r.igst += l.igst;
    rates.set(l.rate, r);
  });
  return {
    lines, taxable, cgst, sgst, igst, tax: cgst + sgst + igst, itemDiscount, qty,
    beforeRound, roundOff, grand, paid, balance,
    currentBalance: (inv.previousBalance || 0) + balance,
    hsn: [...map.values()],
    taxByRate: [...rates.entries()].sort((a, b) => a[0] - b[0]),
  };
}

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];
