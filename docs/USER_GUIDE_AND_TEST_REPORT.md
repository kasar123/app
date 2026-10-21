# TechronixHub India — Installation, User Guide & Test Report

## Installation
1. In Emergent, click **Publish** (top right), then generate an **Android build** to get an installable APK/AAB.
2. Copy the APK to the phone, allow "Install unknown apps" for your file manager, and install it.
3. Open the app. You don't need to log in or be online. Both supplier catalogues are already loaded (with no prices).

## Daily use
- **First setup**: More → Business settings. Enter your address, state (needed for GST), phone, GSTIN/PAN, logo, bank, UPI ID + payee name, terms and invoice prefix. Leave anything you don't have blank.
- **Find a product**: Products tab. Type a name, SKU, HSN, category or variant, and use the chips to filter.
- **Assign HSN / your price / GST rate**: open the product → Assign HSN, or tap ✏️ to edit. HSN codes are never assigned automatically.
- **Shop stock**: open the product → Receive / Sale / Return / Adjust. Set the minimum stock and reorder qty under "Thresholds". Supplier availability is shown for information only.
- **Low stock → supplier**: Home → Low Stock → "Add to supplier requests". Or open any product → "Add to supplier request". Under Supplier requests, open a draft, adjust quantities, then export PDF/Excel (Share or Save to a folder). Mark it Requested → Confirmed, enter the received qty, then "Post received qty to stock".
- **Invoice**: Create Invoice → pick an existing customer or type a new one → add items from the catalogue or as custom items (enter your own rate) → set discounts, charges and the payment received → Preview → Finalize. Once finalized, you can Share/Save/Print the PDF, record payments, duplicate or cancel the invoice.
- **Import updated catalogue**: More → Import Excel catalogue. Select the file, check the sheet, supplier and column mapping (price columns are blocked), validate, then confirm. Existing records are updated, not duplicated. Your HSN codes, stock and prices are never overwritten.
- **Backup**: More → Backup & restore → Save backup (pick a folder) or Share. To restore, choose a backup file, check the preview, then Restore. A safety copy of your current data is kept first.
- **Exit**: More → Exit app. All data is saved first, then the app closes its own screens.

## Test report (automated web-preview run, iteration 1)
Passed: dashboard counts (10,997), search by partial name/SKU/DNA code/typo, supplier/HSN filters, no price values anywhere, HSN assignment and search by HSN, receive/sale/adjust stock, low-stock thresholds and over-sale protection, supplier request flow (draft → requested → confirmed, export buttons), invoice maths matching the reference invoice (₹2,966.10 + 9%+9% − ₹500 = ₹3,000.00; IGST ₹533.90), Bill of Supply, GST-inclusive rates, finalize numbering TXH/26-27/001, payment/duplicate/cancel, customers with GSTIN validation, 9 reports, import screen, duplicate review, backup download, settings validation and saving, data still there after reload, dark mode, exit confirmation.

Not yet verified (needs a real Android build): Android share sheet, saving to a chosen folder, native print dialog, PDF preview WebView, picking an Excel file from phone storage, airplane-mode run, low-storage behaviour, the Exit button closing the task, and the Back gesture. Test these on the phone after installing the APK.

Known limitations:
- The app stores data in an atomic JSON database file, not SQLite/Room.
- On Android 12+, Exit closes the app's screens, but the operating system may keep the process cached.
- The PDF layout uses the phone's built-in print engine, so fonts can differ slightly between devices.
