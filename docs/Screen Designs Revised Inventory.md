# Screen Designs Revised Inventory

This section presents the recommended screen design inventory for the final version of the E.M. Cayetano Store Management System. The figures are arranged according to a practical user journey: system access, dashboard entry, account administration, shared search, inventory operations, archive review, sales processing, purchase receiving, reporting, alerts, maintenance, audit review, help, and session exit. Navigation-only layout states, such as the desktop sidebar and mobile drawer, are excluded because they are supporting interface structures rather than separate business screens.

## System Access And Account Security

### Figure 1 Login Interface
This screen serves as the first access point of the system for authorized users. It verifies the user's credentials before allowing entry to the role-based workspace, ensuring that inventory, sales, purchase, report, and administrative records are protected from unauthorized access. This screen is essential because all succeeding workflows depend on secure identification of the user before system functions become available.

### Figure 2 Two-Factor Authentication Interface
This screen verifies the identity of the user through a One-Time Password sent to the registered email address after the login credentials are accepted. Successful verification confirms that the person attempting to access the account is the legitimate user. This adds a second layer of account protection before the user can access business records and role-specific modules.

### Figure 3 Forgot Password Interface
This screen supports account recovery when a user cannot access the system because of a forgotten password. It begins a verified reset process using the user's registered account information rather than allowing direct password replacement. This helps restore access for legitimate users while keeping recovery controlled and secure.

### Figure 4 Set New Password Interface
This screen completes the password recovery process by allowing a verified user to create a new password. It confirms the reset code and applies password requirements before the account can be used again. This ensures that recovered accounts return to operation with valid and secure credentials.

### Figure 5 Required Password Change Dialog
This dialog appears when a user must replace a temporary or required-change password before continuing into the system. It ensures that newly created or reset accounts are secured by the actual user before operational work begins. This supports accountability because the account is no longer dependent on temporary credentials issued during setup or recovery.

## Dashboard And Initial Workspace

### Figure 6 Admin Dashboard Interface
This screen serves as the main operational overview for the Admin or Owner after successful login. It summarizes business-critical information such as sales performance, inventory condition, profit-related indicators, pending user or inventory tasks, and important alerts. The dashboard helps the owner monitor store operations and move quickly to administrative or decision-making workflows.

### Figure 7 Sales Encoder Dashboard Interface
This screen presents the dashboard view for users responsible for encoding sales transactions. It emphasizes sales activity, transaction access, recent sales review, daily sales monitoring, and stock-checking support. By focusing on sales-related work, the screen helps Sales Encoders perform their duties efficiently without exposing administrative or inventory-maintenance functions outside their authority.

### Figure 8 Inventory Staff Dashboard Interface
This screen presents the dashboard view for Inventory Staff. It highlights stock conditions, replenishment concerns, purchase-related tasks, physical stock verification, and stock movement activities. This helps inventory personnel identify operational issues and proceed to the correct workflow for monitoring, receiving, or adjusting stock.

### Figure 9 Sales and Inventory Staff Dashboard Interface
This screen presents the dashboard for users assigned both sales and inventory responsibilities. It combines access to sales recording, stock monitoring, purchase receiving, inventory actions, reports, and alerts needed by staff with mixed duties. This supports flexible staffing while still excluding owner-only features such as maintenance, audit trail, and sensitive financial controls.

### Figure 10 Daily Sales Target Dialog
This dialog allows the Admin or Owner to define the daily sales target used in dashboard monitoring. The target provides a reference point for comparing actual sales against expected daily performance. This supports management review by helping the owner evaluate whether the store is meeting its sales goals.

### Figure 11 Verify Physical Stock Dialog
This dialog supports the comparison of actual physical stock with the quantity recorded in the system. It guides authorized users from stock verification to the proper Stock In or Stock Out workflow when a discrepancy is found. This strengthens inventory reliability by ensuring that physical count differences are reviewed and corrected through documented movement processes.

## User Account Administration

### Figure 12 User Management Interface
This Admin screen supports centralized management of system user accounts. It allows the Admin to review active, inactive, pending, and setup-required users and to manage their roles, branch assignments, and access status. This screen is important because proper user administration ensures that only authorized personnel can perform sales, inventory, purchase, reporting, and maintenance tasks.

### Figure 13 Create User Account Dialog
This dialog supports the creation of a new user account by the Admin. It establishes the user's identity, assigned role, and branch context before the account becomes part of the system. This workflow supports secure onboarding by ensuring that every user begins with the correct access level and operational scope.

### Figure 14 Temporary Password Generated Dialog
This dialog appears after temporary credentials are generated for a new or setup-required account. It informs the Admin that the user can begin initial access and complete password setup. This supports controlled onboarding because the temporary credential is only a starting point before the user secures the account personally.

### Figure 15 Accounts Requiring Setup Dialog
This dialog lists users who still need to complete initial account setup. It helps the Admin monitor which accounts have been created but are not yet fully ready for normal use. This reduces confusion during onboarding and helps ensure that employees complete access preparation before performing operational tasks.

### Figure 16 Edit Account Details Dialog
This dialog supports the correction or maintenance of user profile information. It allows the Admin to keep account details accurate while preserving the user's connection to historical activity. Accurate account information is important for accountability, communication, and audit review.

### Figure 17 Edit User Role Dialog
This dialog supports updates to a user's role assignment. The selected role determines which modules, reports, and workflows are available to the user based on their job responsibility. This function is essential for enforcing separation of duties between sales encoding, inventory work, and administrative control.

### Figure 18 Confirm Role Change Dialog
This dialog confirms the Admin's intention to apply a role change. It prevents accidental permission updates that could grant excessive access or remove access needed for assigned work. This confirmation supports secure and deliberate access management.

### Figure 19 Edit User Branch Dialog
This dialog supports reassignment of a user to the correct store branch. Branch assignment affects the operational context in which sales, inventory, purchases, and reports are created or reviewed. This screen helps ensure that user activity is connected to the proper business location.

### Figure 20 Confirm Branch Transfer Dialog
This dialog confirms that a user's branch assignment should be changed. It gives the Admin an opportunity to review the transfer before the user's operational scope is updated. This prevents incorrect branch access and protects branch-based record accuracy.

### Figure 21 Deactivate User Account Dialog
This dialog supports removal of active system access for a user who should no longer use the system. It preserves historical records while preventing future login or operational activity from the account. This workflow is important when employees leave, change assignments, or no longer require system access.

### Figure 22 Reactivate User Account Dialog
This dialog supports reinstatement of a previously deactivated account. It allows the Admin to restore access when the user is again authorized to use the system. The confirmation step ensures that reactivation is intentional and properly controlled.

## Centralized Search

### Figure 23 System Search Interface
This screen provides a centralized search facility for locating important records across the system. Users access it when they need to find inventory items, archived records, sales, purchases, suppliers, customers, invoice references, or related stored information. The screen improves productivity by reducing the need to manually browse separate modules.

### Figure 24 Search Results Interface
This screen presents the records returned by the system based on the user's search criteria. It helps users review matched information and proceed to the related module or record when further action is needed. This connects broad lookup activity with specific operational records and improves the speed of daily work.

### Figure 25 Search Empty State Interface
This screen appears when the search criteria do not match any available records. It informs the user that no relevant data was found and indicates that the search terms or selected filters may need adjustment. This improves usability by making unsuccessful searches clear and understandable.

## Inventory Management Workflow

### Figure 26 Admin Inventory Management Interface
This screen allows the Admin or Owner to manage active inventory records and monitor current stock conditions. It supports the creation, editing, archiving, searching, filtering, request review, and stock adjustment workflows needed to maintain accurate item records. This screen is central to the system because inventory data affects sales, purchases, reports, alerts, and business decisions.

### Figure 27 Inventory Staff Inventory Interface
This screen allows Inventory Staff to monitor product records, review quantities, perform stock movement tasks, and prepare item-change requests when direct editing requires approval. It supports daily stock handling while preserving administrative control over official item master data. This balance allows staff to work efficiently without weakening inventory governance.

### Figure 28 Sales Encoder Inventory View
This screen provides Sales Encoder users with limited inventory visibility for checking product availability before recording customer transactions. It helps sales personnel confirm item details, stock status, and available quantity without granting authority to modify stock records. This supports accurate sales encoding while preserving separation of duties.

### Figure 29 Add Item Form
This form is used to create a new inventory record or submit a request for a new item, depending on the user's role. It captures essential product, supplier, pricing, cost, and stock-planning details needed before an item can be monitored and used in operations. This workflow supports complete and consistent inventory records from the time an item is introduced.

### Figure 30 Edit Item Details Form
This form is used to update important information about an existing inventory item. It supports corrections or changes to item identity, category, supplier, pricing, cost, and reorder-related details while keeping quantity changes separate through stock movement workflows. This protects stock accountability by ensuring that item edits do not silently alter inventory balances.

### Figure 31 Inventory Approval Requests Dialog
This dialog allows the Admin to review inventory changes submitted by staff before they become official records. It supports approval or rejection of add-item and edit-item requests based on the proposed changes and requester information. This workflow prevents unreviewed changes from affecting product records and helps maintain inventory data quality.

### Figure 32 My Inventory Requests Dialog
This dialog allows staff to monitor the status of their own submitted inventory requests. It helps users know whether their requested item additions or edits are still pending review. This improves transparency in the approval process without granting staff the authority to approve their own changes.

### Figure 33 Stock In Dialog
This dialog is used to record an increase in the quantity of an existing inventory item. It supports controlled stock additions by requiring the user to document the item, quantity, reason, and relevant transaction timing. This ensures that stock increases are traceable and properly reflected in stock movement history.

### Figure 34 Stock Out Dialog
This dialog is used to record a non-sales reduction in stock quantity. It supports documented deductions for operational reasons such as damage, loss, correction, transfer, or supplier return. This helps maintain accurate inventory balances by ensuring that manual stock decreases are justified and recorded.

### Figure 35 Batch Stock In Dialog
This dialog allows authorized users to record stock increases for multiple items in one workflow. It is useful when several items require verified stock additions from the same operational activity or adjustment process. This improves efficiency while still preserving movement records for each affected item.

### Figure 36 Batch Non-Sales Stock Out Dialog
This dialog allows authorized users to deduct stock from multiple items for non-sales reasons in a controlled process. It supports bulk adjustments for verified damage, loss, transfer, or correction while keeping these movements separate from customer sales. This helps maintain accurate stock balances when several items are affected by the same operational event.

### Figure 37 Dashboard Stock Action Item Picker
This dialog connects dashboard shortcut actions to the correct inventory movement workflow. It allows the user to choose the item that requires Stock In or Stock Out before the detailed adjustment form is opened. This reduces the risk of adjusting the wrong item and keeps shortcut-driven actions consistent with the full inventory process.

### Figure 38 Archive Item Dialog
This dialog is used to move an active inventory item into the archive when it should no longer appear in active stock records. It requires the user to confirm the reason for archiving and review the item before removal from active inventory. This keeps the active inventory list current while preserving the record for future reference.

### Figure 39 Duplicate Item Warning Dialog
This dialog appears when the system detects that a new or edited item may duplicate an existing active or archived item. It helps users review the possible match before deciding whether to revise the entry, restore an archived item, or continue with a separate record. This reduces duplicate product records and supports cleaner inventory data.

### Figure 40 Inventory Draft Recovery Dialog
This dialog appears when the system finds unfinished inventory work saved from a previous or interrupted workflow. It allows the user to resume or discard the draft while clarifying that no official inventory record or stock movement has been created yet. This protects user work from accidental loss without affecting official stock data prematurely.

## Archive Review And Restoration

### Figure 41 Admin Archive Interface
This screen allows the Admin or Owner to review items removed from active inventory. It supports searching, filtering, reviewing archive reasons, and restoring items when they become relevant again. The screen preserves historical inventory information while keeping the active item list focused on current products.

### Figure 42 Inventory Staff Archive Interface
This screen allows Inventory Staff to view archived inventory records for reference. It helps staff confirm whether an item has already been archived without giving them unauthorized restoration access. This supports coordination with the Admin when an archived item needs to be reviewed or returned to active inventory.

### Figure 43 Restore Item Dialog
This dialog confirms the restoration of an archived item to active inventory. It allows the Admin to review the archived record before returning it to the operational item list. This ensures that inactive records are reactivated only when appropriate and with deliberate confirmation.

## Sales Transaction Workflow

### Figure 44 Sales Transaction Interface
This screen supports the complete recording of customer sales transactions. It allows authorized users to encode invoice details, customer information, sold items, discounts, delivery charges, payment information, and transaction totals before saving the sale. This workflow is essential because completed sales update sales history, deduct tracked inventory, and contribute to reports and dashboard summaries.

### Figure 45 Sales Item Selection Panel
This screen area supports the selection of inventory items to be sold in a transaction. It helps the user confirm item availability and add valid products to the sales record before completion. This contributes to inventory accuracy because tracked items sold through this workflow reduce stock automatically.

### Figure 46 Add Non-Inventory Item Dialog
This dialog is used when a sold item is not yet part of the official inventory catalog. It allows the transaction to continue while still recording the manual item as part of the sale. This supports business flexibility and provides data that can later be reviewed as untracked sales items.

### Figure 47 Sales Invoice and Customer Details Section
This screen section documents the official sales reference and customer information needed for a valid transaction record. It supports accurate receipt generation, customer identification, and invoice sequence monitoring. This information strengthens transaction traceability and helps maintain reliable sales documentation.

### Figure 48 Sales Payment Details Section
This screen section supports financial validation of a sales transaction before it is saved. It records payment method, payment amount, discounts, delivery charges, VAT-related values, and total amount due. This helps ensure that the saved sale reflects the correct amount collected from the customer.

### Figure 49 Payment Confirmation Control
This screen state supports verification of non-cash payments such as GCash or bank transfer. It requires confirmation that the payment has been received and matched with the sale before completion. This prevents sales from being saved as paid when the actual payment has not yet been verified.

### Figure 50 Completed Sale Receipt Dialog
This dialog presents the official receipt view after a sale has been saved. It summarizes customer details, sold items, payment information, VAT values, and transaction totals for printing or downloading. This supports receipt issuance and provides a formal record for both customer service and internal documentation.

### Figure 51 Sales History Interface
This screen allows authorized users to review saved sales transactions after completion. It supports searching, reviewing, downloading, refunding, and, for Admin users, cancelling transactions when appropriate. The screen provides accountability by preserving transaction history and allowing controlled post-sale actions.

### Figure 52 Sales History Detail View
This view presents the complete details of a selected sales record. It allows users to review invoice information, customer details, sold items, payment information, refund activity, cancellation status, and transaction metadata. This supports auditability by showing the complete saved context of a sale.

### Figure 53 Record Customer Refund Dialog
This dialog supports processing returned items and customer refunds from completed sales. It allows the user to identify refundable items, record the refund quantity and amount, document the reason, and save the refund transaction. This protects sales and inventory accuracy by creating a separate refund record and returning eligible tracked items to stock.

### Figure 54 Cancel Entire Sale Dialog
This Admin-only dialog supports the complete voiding of an incorrectly encoded sales transaction. It restores tracked inventory from the original sale and marks the transaction as cancelled for recordkeeping. The workflow is separated from refunds because cancellation applies to the whole sale, while refunds apply to returned items.

### Figure 55 Sales Draft Recovery Dialog
This dialog appears when the system detects unfinished sales data from an interrupted transaction. It allows the user to continue the saved draft or discard it before starting again. This protects unsaved work while ensuring that drafts do not affect official sales totals or inventory quantities.

### Figure 56 Clear Sales Form Confirmation Dialog
This dialog confirms the removal of unsaved information from the current sales form. It helps prevent accidental loss of entered invoice, customer, iDoestem, and payment details during transaction encoding. This confirmation supports careful handling of incomplete sales entries.

## Purchase Receiving Workflow

### Figure 57 Purchase Entry Interface
This screen supports the recording of supplier deliveries and purchase receiving transactions. It allows authorized users to document supplier information, delivery references, payment terms, received items, quantities, unit costs, and stock impact before saving the purchase. This workflow is important because saved purchases increase inventory and provide records for supplier receiving and payment follow-up.

### Figure 58 Supplier and Receipt Details Section
This screen section captures the supplier and document information required to identify a purchase entry. It supports traceability by recording the supplier, document type, document reference, payment terms, and purchase date. This information helps the business connect received stock to supplier records and payment obligations.

### Figure 59 Purchase Item Selection Panel
This screen area supports the selection of inventory items included in a supplier delivery. It helps users locate the correct items to receive and add them to the purchase worksheet. This contributes to accurate receiving because only selected and reviewed items are included in the saved purchase entry.

### Figure 60 Purchase Items Worksheet
This worksheet is used to review the items included in a purchase before saving. It shows the received items, quantities, costs, totals, and resulting stock impact so the user can verify the transaction. This helps prevent receiving errors by allowing the user to confirm purchase details before inventory is increased.

### Figure 61 Purchase Confirmation Dialog
This dialog confirms the purchase entry before it becomes an official record. It summarizes the supplier, document reference, payment terms, quantity received, and purchase total so the user can review the transaction. This helps prevent incorrect purchase records and unintended stock increases.

### Figure 62 Purchase History Dialog
This dialog allows users to review saved supplier receiving records. It supports searching for purchase entries, reviewing credit payment status, and opening purchase details for follow-up. The screen helps maintain supplier transaction history and supports monitoring of unpaid credit purchases.

### Figure 63 Purchase History Detail View
This view presents the complete information for a selected purchase transaction. It shows supplier documentation, received items, quantities, payment terms, due date when applicable, and payment status. This supports accountability by showing how each purchase affected inventory and supplier obligations.

### Figure 64 Supplier Payment Follow-Up Control
This screen state supports tracking of payment status for credit purchases. It allows authorized users to mark a supplier payment as paid or unpaid after confirming the actual payment condition. This helps the business monitor outstanding supplier obligations and maintain accurate payment records.

### Figure 65 Supplier Reorder Draft Banner
This banner connects the Supplier Reorder Report to the Purchase Entry workflow. It indicates that reorder items prepared from the report can be loaded into the purchase worksheet for receiving preparation. This reduces repeated data entry and supports a smoother transition from stock analysis to purchasing action.

### Figure 66 Purchase Draft Recovery Dialog
This dialog appears when unfinished purchase receiving data is available from an interrupted workflow. It allows the user to resume or discard the draft while confirming that no official purchase or stock increase has been created. This protects incomplete supplier and item data without affecting inventory until the purchase is saved.

### Figure 67 Clear Purchase Draft Dialog
This dialog confirms whether the user wants to remove the current unsaved purchase entry. It helps prevent accidental loss of supplier, document, item, quantity, cost, and payment information before the transaction is saved. This confirmation supports careful handling of purchase drafts.

## Reporting And Generated Outputs

### Figure 68 Report Configuration Interface
This screen allows users to define the report type, reporting period, and scope before viewing or exporting report data. It ensures that report previews and generated outputs reflect the selected time range, category, and role-permitted report options. This supports informed decision-making by allowing users to prepare reports that match a specific review purpose.

### Figure 69 Inventory Summary Report Preview
This screen presents an overview of current inventory conditions. It summarizes stock status, item counts, category distribution, and low-stock or out-of-stock concerns within the selected scope. This helps users quickly assess whether inventory levels are sufficient for store operations.

### Figure 70 Detailed Inventory Report Preview
This screen presents item-level inventory data for detailed review. It supports verification of product records, quantities, statuses, and update history before the information is exported or used for decision-making. This report is valuable for formal inventory checking and documentation.

### Figure 71 Low Stock Alert Report Preview
This screen identifies inventory items that require replenishment or closer monitoring. It supports purchasing decisions by showing which products are below acceptable stock levels or already depleted. This helps reduce the risk of stockouts that may affect sales and customer service.

### Figure 72 Supplier Reorder Report Preview
This screen organizes replenishment needs by supplier. It helps users prepare purchasing decisions by identifying which supplier-related items should be reordered and in what quantity. This report supports efficient procurement planning and can connect directly to purchase draft preparation.

### Figure 73 Untracked Sales Items Report Preview
This screen shows manual sales items that were sold without being part of the official inventory catalog. It helps the business identify recurring items that may need to be converted into tracked inventory records. This supports better inventory completeness by turning sales observations into catalog improvement opportunities.

### Figure 74 Convert Untracked Item Dialog
This dialog supports the conversion of an untracked sales item into a formal inventory record. It allows the user to define the item, supplier, category, stock, and pricing details before saving the new record. This workflow helps align sales data with inventory tracking and reduces repeated manual item encoding.

### Figure 75 Category Analysis Report Preview
This screen presents inventory performance and stock condition by product category. It helps users evaluate which categories have sufficient stock and which categories require attention. This supports planning decisions by organizing inventory data according to product groupings.

### Figure 76 Purchase Report Preview
This screen summarizes purchase activity within the selected reporting scope. It helps users review supplier receiving, quantity added, purchase values, document references, and payment terms. This provides a formal view of incoming stock and supports purchasing analysis.

### Figure 77 Stock Movement History Report Preview
This screen presents the history of inventory quantity changes. It explains how stock was increased or decreased through sales, purchases, adjustments, and other movement reasons. This supports accountability by documenting the source and purpose of each stock movement.

### Figure 78 Actual Earnings Report Preview
This Admin-only screen presents financial performance information based on completed sales and related cost data. It helps the owner review sales, costs, profit, and profitability for the selected period. This report is restricted because it contains sensitive financial information intended for management-level decision-making.

### Figure 79 Sales-Based Stock Movement Report Preview
This screen explains how completed sales affected inventory deductions. It connects sales transactions, sold items, payment information, and stock reduction details within the selected period. This supports reconciliation between sales activity and inventory movement.

### Figure 80 Sales-Based Stock Movement Export Dialog
This dialog allows the user to choose the type of PDF output needed for the Sales-Based Stock Movement Report. It supports either a full report for management review or a focused deductions-only version for detailed stock review. This helps users generate an output appropriate to the documentation or audit purpose.

### Figure 81 Generated Inventory Summary PDF Output
This output presents the exported Inventory Summary Report in a formal printable format. It includes the report scope, generation details, and summarized inventory condition. This supports filing, review, and inclusion in documentation or presentations.

### Figure 82 Generated Detailed Inventory PDF Output
This output presents detailed item-level inventory information in PDF form. It supports formal documentation of current stock records and provides a printable reference for review. This is useful for inventory validation and academic documentation.

### Figure 83 Generated Low Stock PDF Output
This output presents low-stock and out-of-stock items in a formal report format. It supports purchasing preparation by documenting which items require replenishment. This provides evidence of how the system identifies stock concerns.

### Figure 84 Generated Supplier Reorder PDF Output
This output presents reorder recommendations grouped by supplier. It supports procurement planning by documenting which supplier-related items need replenishment and the suggested quantities. This can be used for review, filing, or supplier coordination.

### Figure 85 Generated Purchase Report PDF Output
This output presents purchase records and receiving activity in a formal PDF format. It documents supplier, document, quantity, payment, and purchase value information for the selected report scope. This supports purchasing review and historical recordkeeping.

### Figure 86 Generated Stock Movement PDF Output
This output presents stock movement history in a formal report format. It documents when stock changed, which items were affected, and the reasons or references behind the movement. This supports inventory auditing and accountability.

### Figure 87 Generated Actual Earnings PDF Output
This Admin-only output presents actual earnings information in a formal report format. It supports owner-level financial review by documenting sales, cost, and profit-related values for the selected period. Because the information is sensitive, this output should be captured only using authorized Admin access.

### Figure 88 Generated Sales-Based Movement PDF Output
This output presents sales-related stock deductions in PDF form. It documents how completed sales reduced inventory quantities and provides supporting transaction details. This supports reconciliation between sales records and inventory movement history.

## Alerts And Operational Follow-Up

### Figure 89 Alerts and Notifications Interface
This screen presents important system notifications that require user awareness or follow-up. It helps users monitor low stock, out-of-stock items, supplier payment reminders, pending reviews, maintenance events, and other operational concerns. This supports timely action by bringing critical reminders into one alert center.

### Figure 90 Alert Filtering and Read Status Controls
This screen state shows how users organize and manage alert follow-up. It allows alerts to be reviewed according to type, status, or workflow relevance so users can focus on the most urgent notifications. This supports operational efficiency by helping users distinguish reviewed alerts from items that still need attention.

### Figure 91 Alert Dismissal Confirmation Dialog
This dialog confirms the removal of an alert from the notification list. It ensures that users do not accidentally dismiss important reminders without reviewing the action. This supports responsible alert management and preserves awareness of operational issues.

## System Maintenance And Accountability

### Figure 92 System Maintenance Interface
This Admin screen supports system care, data safety, and administrative maintenance. It provides access to backup, restore, selective export, system information, log cleanup, optimization, and integrity checking workflows. The screen is restricted to Admin users because these actions can affect the reliability, availability, and protection of business records.

### Figure 93 Database Backup Confirmation Dialog
This dialog confirms the creation of a database backup. It supports data protection by allowing the Admin to generate a recoverable copy of system records before major changes or as part of routine safekeeping. The confirmation ensures that backup creation is intentional and performed by an authorized user.

### Figure 94 Database Restore Confirmation Dialog
This dialog supports restoration of the system database from a selected backup file. It warns the Admin that restoration may overwrite current business records, including inventory, sales, purchases, users, archive records, and logs. This workflow protects the system by requiring deliberate confirmation before a high-impact recovery action is executed.

### Figure 95 Selective Data Export Panel
This panel supports controlled export of selected business records for review, reporting, or evaluation. It allows the Admin to define the dataset, branch scope, date range, and level of detail before generating a CSV file. This provides a safer alternative to full backup download when only specific records are needed.

### Figure 96 Clear System Logs Confirmation Dialog
This dialog confirms cleanup of eligible old system logs. It supports maintenance by removing non-critical log records while preserving important business, security, and audit data. The confirmation ensures that log cleanup is performed intentionally and with awareness of its scope.

### Figure 97 Optimize Database Confirmation Dialog
This dialog confirms the database optimization action. It supports system performance and database organization without changing business transactions, stock quantities, or user records. The confirmation helps the Admin understand that the action is maintenance-oriented rather than data-altering.

### Figure 98 Data Integrity Check Confirmation Dialog
This dialog confirms the execution of a read-only data integrity check. It allows the Admin to review possible relationship issues across records and branches without automatically modifying stored data. This supports quality assurance by identifying concerns that may require further review.

### Figure 99 Maintenance Result Message
This screen state presents the result of a completed maintenance action. It informs the Admin whether backup, restore, export, log cleanup, optimization, or integrity checking succeeded or failed. This supports administrative verification by confirming the outcome of sensitive maintenance workflows.

### Figure 100 Audit Trail Interface
This screen presents a record of important user and system actions for accountability. It allows the Admin to review activity related to login, inventory, sales, purchases, maintenance, user management, and other significant workflows. This supports governance by helping the business trace who performed actions and when they occurred.

### Figure 101 Audit Trail Custom Date Filter
This screen state supports focused review of audit records within a selected date range. It is used when the Admin needs to investigate activity during a specific period or prepare evidence for reporting. This improves audit review by narrowing records to the timeframe relevant to the inquiry.

## Help, Support, And Session Exit

### Figure 102 Help and Support Interface
This screen provides in-system guidance for users based on their assigned role. It contains role-relevant help topics, task guides, troubleshooting information, glossary content, support contact information, and user manual access. This supports user training and reduces dependency on external assistance during daily operations.

### Figure 103 Help Topic Detail View
This view presents the complete explanation or procedure for a selected help topic. It allows users to study a specific workflow, question, troubleshooting concern, or glossary term without leaving the Help module. This supports self-service learning by making system guidance available inside the application.

### Figure 104 Downloadable User Manual Output
This output presents the role-filtered user manual generated from the Help module. It provides formal guidance on system access, workflows, troubleshooting, glossary terms, and support details relevant to the signed-in user. This supports training, documentation, and capstone presentation requirements.

### Figure 105 Session Timeout Warning Dialog
This dialog appears during an active logged-in session when the user has been inactive for a set period. It warns that the session may expire and gives the user an opportunity to continue working or allow the session to end. Placing this figure near the end of the flow reflects that timeout is a session-management state that occurs after the user has already entered the system.

### Figure 106 Logout Confirmation Dialog
This dialog confirms the user's intention to end the current session after using the system. It supports secure closure of the account and prevents accidental logout while work is still in progress. This figure is placed at the end of the sequence because logout is normally performed after the user has completed system tasks.

## Quality Assurance Coverage Summary

The revised sequence follows the system from secure access, dashboard entry, account administration, shared search, inventory management, archive handling, sales processing, purchase receiving, reporting, alerts, maintenance, audit review, help, and session exit. Navigation-only screenshots were removed because they do not represent independent business workflows and would add unnecessary figures. The descriptions remain concise but complete by explaining each screen's purpose, workflow contribution, and business value rather than merely naming visible interface elements.
