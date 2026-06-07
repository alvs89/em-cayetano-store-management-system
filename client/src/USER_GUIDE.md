# E.M. Cayetano Store Management System
## User Manual

---

## 1. System Overview

The E.M. Cayetano Store Management System supports daily hardware store operations for authorized users. It provides role-based access to inventory, sales, purchases, reports, alerts, archive records, maintenance tools, audit trail review, and help resources.

The system is designed to keep store records accurate by saving official transactions through controlled workflows. Sales reduce stock, purchases and stock-in activities increase stock, non-sales stock-out records explain manual deductions, and sensitive actions are recorded for review.

---

## 2. User Roles

### Admin / Owner
The Admin / Owner has full access to management functions, including user accounts, inventory master data, approvals, reports, archive restore, sales cancellation, maintenance, backup, restore, and audit review.

### Sales Encoder
The Sales Encoder records customer sales, checks item availability, processes item refunds when allowed, and reviews sales-related information.

### Inventory Staff
Inventory Staff can monitor inventory, record Stock In and Stock Out, receive supplier deliveries, review archived items, generate inventory-related reports, and prepare add/edit item requests for Admin review.

### Sales Encoder + Inventory Staff
This combined role is for staff who may need to help with both sales encoding and inventory work. It is useful for temporary coverage when another staff member is absent or when one employee is assigned both responsibilities.

---

## 3. Login and Account Security

1. Open the system in a supported browser.
2. Enter your assigned username and password.
3. Complete the verification step when required.
4. Confirm that your role and branch are correct after login.
5. Use only your own account.
6. Log out after use, especially on shared devices.

Passwords and verification codes must not be shared. If access is no longer needed, the Admin should deactivate the account instead of deleting operational history.

---

## 4. Dashboard

The Dashboard shows role-based business information and shortcuts. It may include sales activity, stock alerts, manual items for review, pending requests, and operational reminders depending on the signed-in role. Profit indicators and Actual Earnings information are shown only to Admin / Owner users.

Dashboard values are based on saved records. Drafts and unfinished forms are not included in official totals.

---

## 5. Inventory Module

The Inventory Module is used to review active items, stock levels, supplier details, pricing, stock status, and reorder information.

### Common Inventory Actions

- Search active inventory by item name, item code, supplier, category, or other item details.
- Filter items by category, supplier, and stock status.
- Sort inventory columns to organize the list.
- View stock level, stock status, selling price, cost price, and suggested reorder information.
- Record Stock In and Stock Out when permitted by role.
- Prepare Add Item or Edit Item requests when Admin approval is required.

### Add and Edit Item Requests

Inventory Staff can prepare add or edit item requests. These requests do not immediately change official inventory records. The item becomes official only after Admin approval.

Admin users can review pending requests from Inventory Approval Requests. The review screen shows the item name, requester, request date, and changed fields. Approved requests update the official inventory record. Rejected requests do not change inventory.

### Concurrency and Record Protection

When saving inventory edits, the system checks whether the item was changed by another user while the form was open. If the item was already updated, the system prevents the older save and asks the user to review the latest details.

---

## 6. Stock In and Stock Out

Stock In increases item quantity. Stock Out reduces item quantity for non-sales reasons. Inventory Staff and Admin users may perform these actions when allowed by role.

### Stock In

Use Stock In for corrections or operational stock additions, including stock received from a sister company or related store. For supplier deliveries, use Purchase Entry when supplier document details must be recorded.

### Stock Out

Use Stock Out for non-sales deductions such as damage, missing item, transfer, correction, or other approved operational reasons.

Before saving, review the current stock, quantity change, and resulting stock balance.

---

## 7. Sales Module

The Sales Module records customer transactions using official sales invoice details.

### Standard Sales Workflow

1. Enter the official Sales Invoice number.
2. Choose the customer type.
3. Add inventory items or approved manual items.
4. Review quantity, unit price, discount, delivery charge, payment method, amount received, and total.
5. Save the sale only after checking the transaction details.

Completed sales deduct tracked inventory and create stock movement records.

Delivery charges are included in overall sales totals because they are part of the amount collected from the customer. Product-level report rows remain item-focused so users can still review product performance clearly.

### Refunds

Refunds are recorded from completed sales. Select the refundable item, enter the refund quantity, choose or type a clear refund reason, and confirm the refund.

Quick refund reason chips help standardize common reasons. Users may still edit the refund note or type a custom explanation.

### Sale Cancellation

Cancelling an entire sale is an Admin action. Use refund when only selected items are returned. Use cancellation only when the full transaction must be voided.

---

## 8. Purchases Module

The Purchases Module records supplier deliveries and purchase entries. It also helps staff monitor supplier payment due dates for credit purchases.

1. Select or enter the supplier.
2. Enter the supplier document details, such as DR, SI, OR, or other reference.
3. Choose the payment term.
4. If the purchase is on credit, choose the correct credit term such as 15, 30, 60, 90, or 120 days.
5. Add received items.
6. Enter quantity and unit cost.
7. Review stock impact, subtotal, and payment due date.
8. Save the purchase when all details are correct.

Saved purchase entries increase stock for tracked items and keep supplier receiving records available for reports.

For credit purchases, the system calculates the payment due date from the transaction date and selected credit term. Alerts can remind staff when payment is approaching or overdue. After the supplier has been paid, open the purchase record and mark the payment as paid.

---

## 9. Reports Module

Reports help users review business activity based on role access.

Common report areas include:

- Inventory Summary
- Detailed Inventory
- Low Stock Alert
- Supplier Reorder
- Category Analysis
- Purchases
- Stock Movement History
- Sales-Based Stock Movement
- Actual Earnings for Admin users
- Untracked Sales Items

Report values are calculated from saved official records. Drafts, unfinished forms, and unapproved requests are not included in official report totals.

Overall sales and Actual Earnings include delivery charges. Item-level sales and profitability rows remain based on sold items so product performance is not mixed with delivery fees.

CSV exports are intended for spreadsheet review and filtering. PDF exports are intended for printable summaries and formal review copies.

---

## 10. Alerts and Notifications

Alerts notify users about important operational items such as low stock, out of stock, supplier payment reminders, pending review items, maintenance events, and other system reminders.

Use filters to focus on the alert type or workflow area that needs attention. Mark alerts as read after reviewing them.

---

## 11. Archive Module

Archived items are inactive inventory records kept for review. Archiving removes an item from active inventory without deleting its history.

Admin users can restore archived items when appropriate. Inventory Staff can review archived records and ask an Admin when an item should return to active inventory.

If another browser still shows old archive information after a restore, refresh or revisit the page to load the latest database state.

---

## 12. Maintenance Module

The Maintenance Module is available to Admin users for system care and data safety.

Common maintenance functions include:

- Database backup
- Database restore
- Data integrity check
- Database optimization
- Selective data export
- System log review and cleanup

### Maintenance Actions in Simple Terms

Database backup saves a copy of the system records that can be kept for safekeeping. Store backup files securely and do not share them through unsecured messages.

Database restore replaces the current system records with records from a selected backup file. Use restore only when the selected system-generated SQL backup is correct and replacing the current records is intended.

Selective data export downloads selected records for review. It is useful when an Admin needs a controlled copy of business data without downloading a full database backup.

Clear System Logs removes only eligible old, non-critical system notes. It does not delete inventory, sales, purchases, users, reports, archived records, backups, security logs, or audit trail records.

Optimize Database helps the system load and read saved records smoothly. It cares for records used by both branches. It does not change item quantities, sales totals, purchase records, users, reports, or archive records.

Check Data Integrity reviews both Manggahan and San Rafael records for possible relationship issues, such as missing linked records or invalid saved details. This check is read-only. It reports issues when found, but it does not repair, delete, or overwrite records by itself.

Before running any maintenance action, read the confirmation message, run only the action needed, wait for the result message, and review the audit trail when needed.

---

## 13. Draft Recovery

Some operational forms can save unfinished work as drafts. Drafts help prevent accidental data loss caused by browser refresh, tab closure, power interruption, or session interruption.

Drafts are not official records. They do not deduct stock, add stock, create sales, create purchases, affect reports, or appear in dashboard totals.

When a draft is detected, the user may resume editing or discard it.

---

## 14. Multi-User Work

The system supports multiple users working at the same time. Important actions are validated by the server before saving.

When a record is being updated, the system uses database transactions, row locking, and timestamp checks where needed to protect official records. If another user updates the same item first, the system may ask the current user to review the latest record before saving.

---

## 15. Help Module

The Help Module provides role-based guides, FAQs, troubleshooting steps, support contact information, and a downloadable user manual PDF.

Use the search field to find a topic quickly. The downloaded manual includes the workflows and reminders available to the signed-in role.

---

## 16. User Management

User Management is available to Admin users. Admins can create accounts, assign branches, deactivate users, and update user roles.

When staffing coverage is needed, an Admin can assign the combined Sales Encoder + Inventory Staff role. This allows one user to help with both customer sales and inventory receiving tasks without giving full Admin access.

---

## 17. Best Practices

- Check your branch before saving records.
- Search before creating a new item.
- Use clear item names and supplier names.
- Review totals and stock impact before confirming.
- For credit purchases, choose the correct supplier payment term before saving.
- Use standard reasons where available.
- Keep backup files secure.
- Report incorrect access or suspicious activity to an Admin.
- Do not refresh repeatedly during final transaction submission.
- Wait for the success or error message before clicking again.

---

## 18. Troubleshooting

### A menu or button is not visible
The action may not be included in your role. Ask an Admin to review your access if your job assignment changed.

### A record looks outdated in another browser
The other browser may still be showing data loaded earlier. Refresh the module or return to the page to reload the latest records.

### An inventory save is blocked because the item changed
Another user updated the item while the form was open. Reload the latest item details, review the current values, and save again if still needed.

### A backup restore fails
Use only SQL backups generated by this system. Confirm that the file is complete and belongs to the correct deployment.

### Search shows no results
Clear filters, check spelling, or use a shorter keyword.

### A supplier payment alert still appears
Open the related purchase record and confirm whether the supplier payment has already been settled. Mark the payment as paid only after confirming that the supplier has been paid.

---

## 19. Support

For help, use the Help Module or contact support using the official contact details shown inside the system.

Do not send passwords, verification codes, or confidential backup files through unsecured messages.
