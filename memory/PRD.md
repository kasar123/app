# TechronixHub India — PRD

## Original problem statement
Offline Android business app for TechronixHub India (SK Enterprises): unified catalogue from two supplier Excel files (Robodo, DNA Tech India) with all supplier prices excluded; search; shop inventory kept separate from supplier availability; supplier replenishment requests (PDF/Excel with no prices); GST invoices that follow the reference invoice layout; customers; reports; Excel import; duplicate review; backup/restore; business settings; one-tap safe exit. The full brief is in the conversation history.

## User choices
- Expo React Native app that stores everything on the device (no backend, no login, no cloud)
- Both catalogues pre-loaded with prices stripped, plus an import screen for later updates
- Full core flow in v1
- Light theme (navy/blue/orange) with optional dark mode

## Architecture
- Data: one JSON database file in the app's private documents folder (expo-file-system). Every write goes to a temp file first and is then moved into place, so an interrupted write cannot corrupt the database. Saves are debounced and also forced when the app goes to the background or exits. The web preview uses browser storage instead.
- Catalogue: `assets/data/catalogue.json` is built by `/app/scripts/build_catalogue.py`. The script reads only whitelisted columns, so price columns are never read. Products in the app = this seed + local overrides (edits, imports, manual products). Physical stock lives in a separate `inventory` map.
- Invoice amounts use integer paise. Invoices save snapshots of their items. Finalized invoices can't be edited; they can only be cancelled, and that is logged in the audit log.
- PDF: expo-print with HTML templates and a QR code generated on the phone (qrcode-generator). Excel: SheetJS (xlsx). Share/save: expo-sharing and the Android folder picker (SAF via Directory.pickDirectoryAsync).

## Implemented (2026-06)
- Dashboard (stats + quick actions), 4 tabs (Home, Products, Invoices, More)
- 10,997 catalogue records (Robodo 4,824 + DNA 6,173; 2 duplicate Robodo rows skipped). Search is case-insensitive and tolerates typos, with supplier, category, stock and HSN filters
- Product detail: manual HSN marked as verified; receive/sale/return/adjust stock; thresholds, location, serials, optional valuation rate; movement history; add/edit/delete products
- Inventory filters (in/low/out/awaiting), Excel export, bulk add to supplier requests
- Supplier requests: drafts per supplier, statuses, qty/remarks, receive into stock, PDF/Excel (all or selected items, one sheet per supplier), no prices
- Invoices: Tax Invoice / Bill of Supply, CGST+SGST vs IGST set automatically by state, rates with or without GST, item and invoice discounts, extra charges, round-off, previous/current balance, payments, HSN summary, amount in words, bank details, UPI QR for the specific invoice (only when UPI ID and payee are set), static QR image, terms/warranty/signatory, FY numbering (TXH/26-27/001), preview/print/share/save, duplicate, cancel, search, Excel register
- Customers with history and outstanding balances; reports (9 types) with Excel export
- Excel import: file picker, sheet preview, column mapping (price columns blocked), sample rows, validation summary, cancellable staged import, import history
- Duplicate review (keep both / link / unlink), backup/restore (validated, version check, preview, safety copy), settings, dark mode, Exit button

## Backlog
- P1: tap-to-pick product images; barcode scanning of SKUs (camera)
- P1: credit notes for returns against finalized invoices
- P2: per-product price lists / customer-specific rates; thermal printer receipt layout
- P2: automatic reminder to back up
