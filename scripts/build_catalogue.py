"""Build the pre-loaded catalogue seed for TechronixHub India.

Reads the two supplier workbooks and writes a compact JSON seed.
PRICE COLUMNS ARE NEVER READ: only whitelisted columns are extracted, so
supplier prices never reach the app, its database, backups or logs.

Usage: python3 build_catalogue.py robodo.xlsx dna.xlsx out.json
"""
import json, re, sys, unicodedata, datetime
import openpyxl

WHITELIST = {
    "name": ["product_name", "product name"],
    "sku": ["sku", "sku / product code", "product code"],
    "url": ["product_url", "product url", "url"],
    "category": ["category"],
    "subcategory": ["subcategory", "sub category"],
    "stockQty": ["stock_quantity", "stock quantity"],
    "stockStatus": ["stock_status", "stock status"],
    "variant": ["variant"],
}
BASES = {"robodo": "https://robodo.in/products/", "dnatech": "https://www.dnatechindia.com/"}


def clean(v):
    if v is None:
        return ""
    s = unicodedata.normalize("NFKC", str(v))
    s = re.sub(r"\s+", " ", s).strip()
    return "" if s.lower() in ("none", "nan", "null", "-") else s


def read(path, supplier):
    wb = openpyxl.load_workbook(path, read_only=True)
    rows, report = [], {"file": path, "sheets": [], "total": 0, "imported": 0, "duplicates": 0, "skipped": 0, "errors": 0}
    seen = set()
    for ws in wb.worksheets:
        it = ws.iter_rows(values_only=True)
        header = [clean(h).lower() for h in next(it, [])]
        idx = {}
        for field, names in WHITELIST.items():
            for i, h in enumerate(header):
                if h in names:
                    idx[field] = i
                    break
        report["sheets"].append({"name": ws.title, "mappedColumns": sorted(idx.keys()), "ignoredColumns": len(header) - len(idx)})
        if "name" not in idx:
            continue
        for r in it:
            report["total"] += 1
            g = lambda f: clean(r[idx[f]]) if f in idx and idx[f] < len(r) else ""
            name = g("name")
            if not name:
                report["skipped"] += 1
                continue
            sku, variant = g("sku"), g("variant")
            key = (sku.lower() or "n:" + re.sub(r"[^a-z0-9]", "", name.lower())) + "#" + variant.lower()
            if key in seen:
                report["duplicates"] += 1
                continue
            seen.add(key)
            url = g("url")
            base = BASES[supplier]
            if url.startswith(base):
                url = "~" + url[len(base):]
            qty = g("stockQty")
            try:
                qty = int(float(qty)) if qty != "" else None
            except ValueError:
                qty = None
            st = g("stockStatus")
            st = "in" if st.lower() == "in stock" else ("out" if st.lower() == "out of stock" else "")
            rows.append([sku, name, url, g("category"), g("subcategory"), variant, st, qty])
            report["imported"] += 1
    return rows, report


if __name__ == "__main__":
    rob, rr = read(sys.argv[1], "robodo")
    dna, dr = read(sys.argv[2], "dnatech")
    out = {
        "version": 1,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "suppliers": [
            {"id": "robodo", "name": "Robodo", "urlBase": BASES["robodo"], "rows": rob, "report": rr},
            {"id": "dnatech", "name": "DNA Tech India", "urlBase": BASES["dnatech"], "rows": dna, "report": dr},
        ],
    }
    with open(sys.argv[3], "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(json.dumps([rr, dr], indent=1))
