// Help module: role-aware in-app guidance and user manual generation.
import React, { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Download,
  FileText,
  Headphones,
  LockKeyhole,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  UserCog,
  Wrench,
  X,
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { PageHeader } from './PageHeader';
import { getRoleLabel, isAdminRole, normalizeRole, ROLE_VALUES } from '../utils/roles';

const HELP_ROLES = {
  ALL: [ROLE_VALUES.ADMIN, ROLE_VALUES.SALES_ENCODER, ROLE_VALUES.INVENTORY_STAFF],
  ADMIN: [ROLE_VALUES.ADMIN],
  SALES: [ROLE_VALUES.ADMIN, ROLE_VALUES.SALES_ENCODER],
  INVENTORY: [ROLE_VALUES.ADMIN, ROLE_VALUES.INVENTORY_STAFF],
};

const topicOptions = [
  { value: 'all', label: 'All Topics' },
  { value: 'faqs', label: 'FAQs' },
  { value: 'guides', label: 'Guides' },
  { value: 'troubleshooting', label: 'Troubleshooting' },
  { value: 'guidelines', label: 'System Guidelines' },
  { value: 'contact', label: 'Contact Support' },
];

const supportEmail = 'emcayetanotrading@gmail.com';
const supportTelephone = '8285-9611';
const supportCellphone = '(0918) 930-6300';
const mailtoHref = `mailto:${supportEmail}?subject=${encodeURIComponent('Help Request - E.M. Cayetano Inventory System')}&body=${encodeURIComponent('Hello, I need assistance with the inventory system. Issue:\n')}`;
const telephoneHref = `tel:${supportTelephone.replace(/\D/g, '')}`;
const cellphoneHref = `tel:${supportCellphone.replace(/\D/g, '')}`;

const supportContacts = [
  {
    id: 'email',
    label: 'Email Support',
    value: supportEmail,
    helper: 'Send system concerns, access questions, or report details by email.',
    href: mailtoHref,
    Icon: Mail,
    tone: 'purple',
  },
  {
    id: 'telephone',
    label: 'Telephone Number',
    value: supportTelephone,
    helper: 'Use this landline number for store or office support.',
    href: telephoneHref,
    Icon: Phone,
    tone: 'purple',
  },
  {
    id: 'cellphone',
    label: 'Cellphone Number',
    value: supportCellphone,
    helper: 'Use this mobile number when cellphone contact is preferred.',
    href: cellphoneHref,
    Icon: Phone,
    tone: 'green',
  },
];

const roleHelpAccess = {
  [ROLE_VALUES.ADMIN]: {
    title: 'Admin / Owner Guide',
    description: 'Complete store management guide for users, inventory, sales, reports, maintenance, and audit review.',
    modules: [
      'Dashboard',
      'Search Products',
      'Inventory',
      'Archive',
      'Reports',
      'Sales',
      'Purchases',
      'Alerts',
      'Maintenance',
      'User Management',
      'Audit Trail',
      'Help',
    ],
    tasks: [
      'Manage users, roles, branches, and account access.',
      'Add and edit inventory items, stock thresholds, categories, and supplier details.',
      'Record sales, refunds, cancellations, stock in, stock out, purchases, and delivery receiving.',
      'Review all reports, including Actual Earnings and Sales-Based Stock Movement.',
      'Use maintenance, backup, restore, and audit trail tools.',
    ],
  },
  [ROLE_VALUES.SALES_ENCODER]: {
    title: 'Sales Encoder Guide',
    description: 'Sales-focused guide for recording customer transactions and checking item availability.',
    modules: ['Dashboard', 'Search Products', 'Inventory', 'Sales', 'Alerts', 'Help'],
    tasks: [
      'Search products and check available stock.',
      'Record customer sales using the official Sales Invoice number.',
      'Add inventory items and approved manual items to a sale.',
      'Process sales refunds when needed.',
      'Review alerts that are relevant to daily sales work.',
    ],
  },
  [ROLE_VALUES.INVENTORY_STAFF]: {
    title: 'Inventory Staff Guide',
    description: 'Inventory-focused guide for stock movement, purchases, archive review, and inventory reports.',
    modules: ['Dashboard', 'Search Products', 'Inventory', 'Archive', 'Reports', 'Purchases', 'Alerts', 'Help'],
    tasks: [
      'Search products and review current stock levels.',
      'Record stock in, stock out, and batch stock adjustments.',
      'Receive supplier deliveries and record purchases.',
      'Review archived items and ask an Admin when an item must be restored.',
      'Generate inventory, purchase, low-stock, supplier reorder, and stock movement reports.',
    ],
  },
};

const faqs = [
  {
    id: 'login-2fa',
    roles: HELP_ROLES.ALL,
    question: 'What should I do if my 2FA code expires?',
    answer: 'Select Resend Code and use the newest verification code sent to your email. Do not reuse an old code.',
  },
  {
    id: 'dashboard-purpose',
    roles: HELP_ROLES.ALL,
    question: 'What is the Dashboard for?',
    answer: 'The Dashboard shows the most important information for your role, such as sales, profit, stock alerts, quick actions, and today\'s activity.',
  },
  {
    id: 'search-products',
    roles: HELP_ROLES.ALL,
    question: 'How do I find an item?',
    answer: 'Use Search Products or Inventory, then type a product name, keyword, category, color, size, or brand detail. Use shorter words if the first search has no result.',
  },
  {
    id: 'sales-invoice-number',
    roles: HELP_ROLES.SALES,
    question: 'What Sales Invoice number should I enter?',
    answer: 'Enter the number printed on the official Sales Invoice booklet. The system checks duplicates and warns you if the number skips the expected sequence.',
  },
  {
    id: 'invoice-duplicate',
    roles: HELP_ROLES.SALES,
    question: 'Why does the system block a duplicate Sales Invoice number?',
    answer: 'Each official Sales Invoice number can be used only once per branch. This prevents duplicate records and protects the store during checking or reconciliation.',
  },
  {
    id: 'record-sale',
    roles: HELP_ROLES.SALES,
    question: 'How do I record a customer sale?',
    answer: 'Open Sales, enter the official Sales Invoice number, choose the customer type, add items, review totals, then save the transaction.',
  },
  {
    id: 'refund-sale',
    roles: HELP_ROLES.SALES,
    question: 'How do I process a refund?',
    answer: 'Open Sales History, choose the sale, select the refundable items, enter the refund quantity and reason, then confirm. Refunded stock and totals are updated by the system.',
  },
  {
    id: 'cancel-sale',
    roles: HELP_ROLES.ADMIN,
    question: 'Who can cancel a completed sale?',
    answer: 'Only an Admin can cancel an entire completed sale. This protects official records and keeps the audit trail clear.',
  },
  {
    id: 'add-inventory-item',
    roles: HELP_ROLES.ADMIN,
    question: 'How do I add a new inventory item?',
    answer: 'Open Inventory, select Add New Item, enter item details, set the stock threshold, review for duplicates, then save.',
  },
  {
    id: 'stock-records',
    roles: HELP_ROLES.INVENTORY,
    question: 'How do I update stock-in and stock-out records?',
    answer: 'Open Inventory, select the item, choose Stock In or Stock Out, enter the quantity and reason, review the result, then save.',
  },
  {
    id: 'receive-delivery',
    roles: HELP_ROLES.INVENTORY,
    question: 'How do I receive supplier deliveries?',
    answer: 'Open Purchases, record the supplier delivery, review the items and quantities, then save so stock levels update properly.',
  },
  {
    id: 'reports',
    roles: HELP_ROLES.INVENTORY,
    question: 'Which reports can I generate?',
    answer: 'You can generate inventory-related reports such as Summary, Detailed Inventory, Low Stock Alert, Supplier Reorder, Category Analysis, Purchases, and Stock Movement History.',
  },
  {
    id: 'actual-earnings',
    roles: HELP_ROLES.ADMIN,
    question: 'Who can see Actual Earnings?',
    answer: 'Actual Earnings is Admin-only because it includes sales, cost of goods sold, actual profit, and margin values used for business decisions.',
  },
  {
    id: 'archive-review',
    roles: HELP_ROLES.INVENTORY,
    question: 'Can I review archived items?',
    answer: 'Admin and Inventory Staff can review archived items. Restoring an archived item is Admin-only.',
  },
  {
    id: 'restore-archive',
    roles: HELP_ROLES.ADMIN,
    question: 'How do I restore an archived item?',
    answer: 'Open Archive, find the item, review its details, then select Restore. The item returns to the active inventory list.',
  },
  {
    id: 'manage-users',
    roles: HELP_ROLES.ADMIN,
    question: 'Who can manage user accounts?',
    answer: 'Only an Admin can create accounts, assign roles, transfer branches, deactivate users, and update access.',
  },
];

const guides = [
  {
    id: 'daily-start',
    roles: HELP_ROLES.ALL,
    title: 'Starting Your Work',
    summary: 'Check your branch, alerts, and available actions before working.',
    steps: [
      'Log in using your assigned account.',
      'Confirm that the branch shown in the sidebar is correct.',
      'Open Dashboard to review important reminders.',
      'Use only the actions shown for your role.',
    ],
  },
  {
    id: 'searching-products',
    roles: HELP_ROLES.ALL,
    title: 'Searching Products',
    summary: 'Find products using simple keywords.',
    steps: [
      'Open Search Products or Inventory.',
      'Type the product name, brand, color, size, category, or other known detail.',
      'Use filters only when needed.',
      'Open the item details to check stock, price, or status.',
    ],
  },
  {
    id: 'record-sale',
    roles: HELP_ROLES.SALES,
    title: 'Recording a Sale',
    summary: 'Save a customer sale using the official SI number.',
    steps: [
      'Open Sales.',
      'Enter the Sales Invoice number printed on the SI booklet.',
      'Choose the customer type.',
      'Add inventory items and approved manual items.',
      'Review quantity, price, discount, total, and payment details.',
      'Save the sale only after checking the information.',
    ],
  },
  {
    id: 'refund-sale',
    roles: HELP_ROLES.SALES,
    title: 'Processing a Refund',
    summary: 'Return selected items from a completed sale.',
    steps: [
      'Open Sales History.',
      'Select the completed sale.',
      'Choose the item or items to refund.',
      'Enter the refund quantity and reason.',
      'Review the refund summary.',
      'Confirm the refund.',
    ],
  },
  {
    id: 'cancel-sale',
    roles: HELP_ROLES.ADMIN,
    title: 'Cancelling a Sale',
    summary: 'Cancel a completed sale when correction is required.',
    steps: [
      'Open Sales History.',
      'Select the completed sale.',
      'Review the sale details and reason for cancellation.',
      'Confirm the cancellation only if the record must be voided.',
      'Review the audit trail entry after saving.',
    ],
  },
  {
    id: 'adding-new-item',
    roles: HELP_ROLES.ADMIN,
    title: 'Adding a New Item',
    summary: 'Create a clean inventory record.',
    steps: [
      'Open Inventory.',
      'Select Add New Item.',
      'Enter the item name, category, supplier, unit, cost, selling price, stock, and threshold.',
      'Check if the item already exists in active or archived records.',
      'Save the item after reviewing all details.',
    ],
  },
  {
    id: 'updating-stock',
    roles: HELP_ROLES.INVENTORY,
    title: 'Recording Stock In or Stock Out',
    summary: 'Keep stock quantities accurate.',
    steps: [
      'Open Inventory.',
      'Search for the item.',
      'Choose Stock In for received stock or Stock Out for non-sales deduction.',
      'Enter the quantity and reason.',
      'Review the new stock value.',
      'Save the movement.',
    ],
  },
  {
    id: 'receive-delivery',
    roles: HELP_ROLES.INVENTORY,
    title: 'Receiving Supplier Delivery',
    summary: 'Record delivered items from suppliers.',
    steps: [
      'Open Purchases.',
      'Select Receive Delivery.',
      'Choose or enter the supplier.',
      'Add delivered items and quantities.',
      'Review costs, totals, and stock changes.',
      'Save the delivery record.',
    ],
  },
  {
    id: 'inventory-reports',
    roles: HELP_ROLES.INVENTORY,
    title: 'Generating Inventory Reports',
    summary: 'Review stock, purchases, and movement information.',
    steps: [
      'Open Reports.',
      'Choose the report period.',
      'Select the report type available to your role.',
      'Review the generated data.',
      'Export to PDF if a copy is needed.',
    ],
  },
  {
    id: 'actual-earnings-report',
    roles: HELP_ROLES.ADMIN,
    title: 'Checking Actual Earnings',
    summary: 'Review sales, cost of goods sold, actual profit, and margin.',
    steps: [
      'Open Reports.',
      'Select Actual Earnings.',
      'Choose the period and category if needed.',
      'Review Sales, Cost of Goods Sold, Actual Profit, and Margin.',
      'Export the report if needed for business review.',
    ],
  },
  {
    id: 'archive-review',
    roles: HELP_ROLES.INVENTORY,
    title: 'Reviewing Archived Items',
    summary: 'Check inactive item records.',
    steps: [
      'Open Archive.',
      'Search or filter archived items.',
      'Review the item information.',
      'Ask an Admin if an item needs to be restored.',
    ],
  },
  {
    id: 'restore-archive',
    roles: HELP_ROLES.ADMIN,
    title: 'Restoring Archived Items',
    summary: 'Return an inactive item to active inventory.',
    steps: [
      'Open Archive.',
      'Search for the archived item.',
      'Review the item details.',
      'Select Restore.',
      'Confirm the restore action.',
    ],
  },
  {
    id: 'managing-users',
    roles: HELP_ROLES.ADMIN,
    title: 'Managing Users',
    summary: 'Create accounts and maintain access.',
    steps: [
      'Open User Management.',
      'Review active, pending, or inactive users.',
      'Create or update accounts only for authorized staff.',
      'Assign the correct role and branch.',
      'Deactivate users who should no longer access the system.',
    ],
  },
  {
    id: 'maintenance',
    roles: HELP_ROLES.ADMIN,
    title: 'Using Maintenance Tools',
    summary: 'Run admin-only system checks and data safety tools.',
    steps: [
      'Open Maintenance.',
      'Review the available admin tools.',
      'Read the confirmation message before running any tool.',
      'Run only the action needed.',
      'Check the result and audit trail after completion.',
    ],
  },
];

const guidelines = [
  { id: 'credentials', roles: HELP_ROLES.ALL, text: 'Do not share your username, password, or 2FA code.' },
  { id: 'branch-check', roles: HELP_ROLES.ALL, text: 'Always check that you are working in the correct branch.' },
  { id: 'accurate-search', roles: HELP_ROLES.ALL, text: 'Use clear product names and short keywords when searching.' },
  { id: 'sales-invoice', roles: HELP_ROLES.SALES, text: 'Enter the Sales Invoice number exactly as printed on the official SI booklet.' },
  { id: 'sale-review', roles: HELP_ROLES.SALES, text: 'Review item quantity, price, discount, and total before saving a sale.' },
  { id: 'refund-reason', roles: HELP_ROLES.SALES, text: 'Enter a clear refund reason so the record is easy to review later.' },
  { id: 'stock-reason', roles: HELP_ROLES.INVENTORY, text: 'Record stock movement with the correct quantity and reason.' },
  { id: 'delivery-check', roles: HELP_ROLES.INVENTORY, text: 'Compare supplier delivery records with the actual delivered items before saving.' },
  { id: 'low-stock-alerts', roles: HELP_ROLES.INVENTORY, text: 'Review low-stock and out-of-stock alerts regularly.' },
  { id: 'duplicate-items', roles: HELP_ROLES.ADMIN, text: 'Check active and archived records before creating a new inventory item.' },
  { id: 'user-access', roles: HELP_ROLES.ADMIN, text: 'Give each staff member only the role and branch access needed for their work.' },
  { id: 'audit-review', roles: HELP_ROLES.ADMIN, text: 'Review audit trail records after sensitive actions such as user updates, cancellations, and maintenance tasks.' },
];

const troubleshooting = [
  {
    id: 'login-reset',
    roles: HELP_ROLES.ALL,
    title: 'Login issue or password reset',
    cause: 'The username, password, or registered email may be incorrect.',
    solution: 'Check your login details. If needed, use Forgot Password and follow the email instructions.',
  },
  {
    id: '2fa-not-received',
    roles: HELP_ROLES.ALL,
    title: '2FA code not received or expired',
    cause: 'The code may have expired or the email may be delayed.',
    solution: 'Select Resend Code and use the newest code. Also check your spam or junk folder.',
  },
  {
    id: 'module-not-visible',
    roles: HELP_ROLES.ALL,
    title: 'A menu or button is not visible',
    cause: 'The action may not be included in your assigned role.',
    solution: 'Use the menus available to your role. If your job assignment changed, ask an Admin to review your access.',
  },
  {
    id: 'search-no-results',
    roles: HELP_ROLES.ALL,
    title: 'Item search shows no results',
    cause: 'The item name may be misspelled, filtered incorrectly, inactive, or not yet recorded.',
    solution: 'Clear filters, use a shorter keyword, or check with the staff member responsible for the item record.',
  },
  {
    id: 'invoice-duplicate',
    roles: HELP_ROLES.SALES,
    title: 'Sales Invoice number is already used',
    cause: 'The same official SI number was already saved for the branch.',
    solution: 'Check the SI booklet and Sales History. Enter the correct unused SI number before saving.',
  },
  {
    id: 'invoice-sequence-warning',
    roles: HELP_ROLES.SALES,
    title: 'Sales Invoice sequence warning appears',
    cause: 'The entered SI number skips one or more expected booklet numbers.',
    solution: 'Check the physical SI booklet. Continue only when the skipped number has a valid reason, such as a cancelled or spoiled page.',
  },
  {
    id: 'item-out-of-stock',
    roles: HELP_ROLES.SALES,
    title: 'Item cannot be sold because stock is not enough',
    cause: 'The requested quantity is higher than the available stock.',
    solution: 'Reduce the quantity or ask inventory staff to verify the stock level.',
  },
  {
    id: 'stock-movement-failed',
    roles: HELP_ROLES.INVENTORY,
    title: 'Stock movement is not saving',
    cause: 'The quantity, movement reason, or item selection may be missing or invalid.',
    solution: 'Review the item, quantity, and reason. Save again only after the new stock value looks correct.',
  },
  {
    id: 'report-empty',
    roles: HELP_ROLES.INVENTORY,
    title: 'Report has no results',
    cause: 'The selected period, category, or report type may not have matching records.',
    solution: 'Change the period or filter, then generate the report again.',
  },
  {
    id: 'restore-not-available',
    roles: [ROLE_VALUES.INVENTORY_STAFF],
    title: 'Restore button is not available in Archive',
    cause: 'Inventory Staff can review archived items, but restoring items is Admin-only.',
    solution: 'Ask an Admin to review and restore the item if it should return to active inventory.',
  },
  {
    id: 'maintenance-access',
    roles: HELP_ROLES.ADMIN,
    title: 'Maintenance tool did not complete',
    cause: 'The action may need valid confirmation, active connection, or correct system state.',
    solution: 'Review the message shown by the system, run only the required tool, then check the audit trail.',
  },
];

const manualIntroduction = {
  purpose: 'This manual explains how to use the E.M. Cayetano Store Management System during daily store operations. It is written for non-technical users and focuses on the actions available to the signed-in role.',
  overview: [
    'Monitor branch inventory and stock status.',
    'Search products and review item details.',
    'Record stock movement, sales, purchases, refunds, and reports based on role access.',
    'Receive alerts and review important store activity.',
    'Keep records accurate through role-based permissions and audit-friendly workflows.',
  ],
};

const manualRequirements = [
  'Use a desktop, laptop, tablet, or mobile device with a modern browser such as Google Chrome, Microsoft Edge, or Mozilla Firefox.',
  'Use an active internet connection when accessing the system.',
  'Log in using the account, role, and branch assigned by the Admin.',
  'Keep access to the registered email because verification codes, password reset, and account notices may be sent there.',
  'For best readability during office work, use a desktop or laptop screen when reviewing reports or large inventory tables.',
];

const interfaceOverview = [
  'Sidebar menu: shows only the modules available to your role.',
  'Dashboard: gives a quick summary of branch activity and shortcuts for common tasks.',
  'Search fields: help find products, records, or reports using keywords.',
  'Tables and lists: show inventory, sales, purchases, reports, alerts, or user records depending on your role.',
  'Action buttons: perform tasks such as saving, editing, stock in, stock out, refunding, exporting, or opening details when allowed.',
  'Dialogs and confirmation messages: ask you to review important actions before saving changes.',
  'Alerts: notify users about stock issues, system reminders, or other important updates.',
];

const manualWorkflows = [
  {
    id: 'login-workflow',
    roles: HELP_ROLES.ALL,
    title: 'Login and Start Work',
    steps: [
      'Open the system link.',
      'Enter your username and password.',
      'Complete the verification step if required.',
      'Check that your branch and role are correct.',
      'Open the module needed for your task.',
    ],
  },
  {
    id: 'search-workflow',
    roles: HELP_ROLES.ALL,
    title: 'Search Product Workflow',
    steps: [
      'Open Search Products or Inventory.',
      'Type an item name, code, category, supplier, color, size, or short keyword.',
      'Review the matching results.',
      'Open the item details if more information is needed.',
    ],
  },
  {
    id: 'sale-workflow',
    roles: HELP_ROLES.SALES,
    title: 'Recording a Sale Workflow',
    steps: [
      'Open Sales.',
      'Enter the official Sales Invoice number from the printed SI booklet.',
      'Select customer type and enter customer details if needed.',
      'Add items, quantities, prices, discounts, delivery charge, and payment details.',
      'Review the final total and save the transaction.',
      'Print or download the receipt if needed.',
    ],
  },
  {
    id: 'refund-workflow',
    roles: HELP_ROLES.SALES,
    title: 'Refund Workflow',
    steps: [
      'Open Sales History.',
      'Select the completed sale.',
      'Choose the item and quantity to refund.',
      'Enter a clear refund reason.',
      'Review and confirm the refund.',
    ],
  },
  {
    id: 'stock-in-workflow',
    roles: HELP_ROLES.INVENTORY,
    title: 'Receiving New Stock Workflow',
    steps: [
      'Open Purchases or Inventory.',
      'Select the supplier or item.',
      'Enter delivered items, quantities, and costs.',
      'Review the stock increase.',
      'Save the purchase or stock-in record.',
    ],
  },
  {
    id: 'stock-out-workflow',
    roles: HELP_ROLES.INVENTORY,
    title: 'Manual Stock-Out Workflow',
    steps: [
      'Open Inventory.',
      'Select the item.',
      'Choose Stock Out.',
      'Enter the quantity and reason.',
      'Review the stock deduction and save.',
    ],
  },
  {
    id: 'report-workflow',
    roles: HELP_ROLES.INVENTORY,
    title: 'Generating a Report Workflow',
    steps: [
      'Open Reports.',
      'Choose the report type available to your role.',
      'Select the period and filters.',
      'Review the report results.',
      'Export the report if a PDF copy is needed.',
    ],
  },
  {
    id: 'admin-workflow',
    roles: HELP_ROLES.ADMIN,
    title: 'Admin Access Management Workflow',
    steps: [
      'Open User Management.',
      'Create or select the user account.',
      'Assign the correct role and branch.',
      'Review the change before saving.',
      'Check the account status and audit trail when needed.',
    ],
  },
];

const dataEntryRules = [
  { id: 'required-fields', roles: HELP_ROLES.ALL, text: 'Fill in required fields before saving.' },
  { id: 'whole-quantities', roles: HELP_ROLES.ALL, text: 'Enter quantities as valid whole numbers.' },
  { id: 'money-values', roles: HELP_ROLES.ALL, text: 'Enter prices, costs, discounts, delivery charge, and payment amounts as valid money values.' },
  { id: 'branch-records', roles: HELP_ROLES.ALL, text: 'Record transactions under the correct branch.' },
  { id: 'si-number', roles: HELP_ROLES.SALES, text: 'Use the official Sales Invoice number from the printed SI booklet.' },
  { id: 'no-duplicate-si', roles: HELP_ROLES.SALES, text: 'Do not reuse a Sales Invoice number that already exists for the branch.' },
  { id: 'stock-limit', roles: HELP_ROLES.SALES, text: 'Do not sell more than the available stock for tracked inventory items.' },
  { id: 'stock-movement-rule', roles: HELP_ROLES.INVENTORY, text: 'Stock-out quantity must not exceed available stock unless the system explicitly allows a valid adjustment.' },
  { id: 'supplier-documents', roles: HELP_ROLES.INVENTORY, text: 'Enter supplier document numbers carefully when recording purchases or deliveries.' },
  { id: 'product-names', roles: HELP_ROLES.ADMIN, text: 'Use specific product names and avoid duplicate item records.' },
  { id: 'admin-sensitive', roles: HELP_ROLES.ADMIN, text: 'Review confirmation messages before saving user, maintenance, cancellation, restore, or backup-related actions.' },
];

const securityReminders = [
  { id: 'passwords', roles: HELP_ROLES.ALL, text: 'Do not share usernames, passwords, or verification codes.' },
  { id: 'logout', roles: HELP_ROLES.ALL, text: 'Log out after using the system, especially on shared devices.' },
  { id: 'email-security', roles: HELP_ROLES.ALL, text: 'Keep your email secure because password reset and verification messages may be sent there.' },
  { id: 'report-issue', roles: HELP_ROLES.ALL, text: 'Report suspicious account activity or incorrect access to an Admin.' },
  { id: 'role-control', roles: HELP_ROLES.ADMIN, text: 'Assign the lowest role needed for each staff member to protect business records.' },
  { id: 'maintenance-care', roles: HELP_ROLES.ADMIN, text: 'Use maintenance and backup tools only when needed and after reading the confirmation message.' },
];

const glossaryTerms = [
  { term: '2FA Code', roles: HELP_ROLES.ALL, definition: 'A verification code used after login to confirm that the account owner is signing in.' },
  { term: 'Actual Earnings', roles: HELP_ROLES.ADMIN, definition: 'A report view showing sales, Cost of Goods Sold, Actual Profit, and margin for business review.' },
  { term: 'Actual Profit', roles: HELP_ROLES.ADMIN, definition: 'Sales less Cost of Goods Sold for the selected records.' },
  { term: 'Archive', roles: HELP_ROLES.INVENTORY, definition: 'A place for inactive item records. Archived records are kept for reference and are not permanently deleted.' },
  { term: 'Audit Trail', roles: HELP_ROLES.ADMIN, definition: 'A record of important user actions, used for accountability and review.' },
  { term: 'Backdated Transaction', roles: HELP_ROLES.SALES, definition: 'A transaction encoded today but dated earlier based on the actual business document date.' },
  { term: 'Low Stock', roles: HELP_ROLES.ALL, definition: 'An item quantity has reached or fallen below its set threshold.' },
  { term: 'Batch Stock Adjustment', roles: HELP_ROLES.INVENTORY, definition: 'A stock update applied to multiple inventory items in one controlled action.' },
  { term: 'Branch', roles: HELP_ROLES.ALL, definition: 'The store location where records and transactions are assigned.' },
  { term: 'Cancelled Sale', roles: HELP_ROLES.ADMIN, definition: 'A completed sale marked as cancelled by an Admin when the full transaction must be voided.' },
  { term: 'Category', roles: HELP_ROLES.ALL, definition: 'A product grouping such as roofing, paint, electrical, steel, or plumbing used for searching and reports.' },
  { term: 'Cost of Goods Sold', roles: HELP_ROLES.ADMIN, definition: 'The saved item cost multiplied by the sold quantity.' },
  { term: 'Daily Quota', roles: [ROLE_VALUES.ADMIN, ROLE_VALUES.SALES_ENCODER], definition: 'The sales target used to compare today\'s sales against the branch goal.' },
  { term: 'Delivery Charge', roles: HELP_ROLES.SALES, definition: 'An added amount charged to the customer when delivery is part of the sale.' },
  { term: 'Discount', roles: HELP_ROLES.SALES, definition: 'An amount deducted from the sale total before payment is completed.' },
  { term: 'Document Number', roles: HELP_ROLES.INVENTORY, definition: 'The supplier document reference used when recording purchases or deliveries.' },
  { term: 'Inventory Status', roles: HELP_ROLES.ALL, definition: 'The stock condition of an item, such as In Stock, Low Stock, or Out of Stock.' },
  { term: 'Manual Item', roles: HELP_ROLES.SALES, definition: 'A sold item entered manually because it is not yet tracked as a regular inventory item.' },
  { term: 'Manual Low-Stock Threshold', roles: HELP_ROLES.INVENTORY, definition: 'The item-specific quantity level that triggers a low-stock warning.' },
  { term: 'Non-Inventory Item', roles: HELP_ROLES.SALES, definition: 'An item sold during a transaction but not yet tracked as a regular inventory item.' },
  { term: 'Out of Stock', roles: HELP_ROLES.ALL, definition: 'An item has zero available quantity.' },
  { term: 'Payment Method', roles: HELP_ROLES.SALES, definition: 'The way a customer pays, such as cash, GCash, bank transfer, or another accepted option.' },
  { term: 'Profit Margin', roles: HELP_ROLES.ADMIN, definition: 'The percentage that compares Actual Profit against Sales for the selected records.' },
  { term: 'Purchase Entry', roles: HELP_ROLES.INVENTORY, definition: 'A record of supplier delivery or purchase details that can increase inventory quantity.' },
  { term: 'Refund', roles: HELP_ROLES.SALES, definition: 'A return or correction for selected items from a completed sale.' },
  { term: 'Report Period', roles: HELP_ROLES.INVENTORY, definition: 'The selected date range used when generating reports.' },
  { term: 'Restore', roles: HELP_ROLES.ADMIN, definition: 'Returning an archived item back to the active inventory list.' },
  { term: 'Sales-Based Stock Movement', roles: HELP_ROLES.ADMIN, definition: 'A report that connects completed sales to the stock deductions created by those sales.' },
  { term: 'Sales Invoice Number', roles: HELP_ROLES.SALES, definition: 'The official number printed on the store Sales Invoice booklet.' },
  { term: 'Sales Invoice Sequence Warning', roles: HELP_ROLES.SALES, definition: 'A warning shown when the entered SI number skips expected booklet numbers.' },
  { term: 'Stock In', roles: HELP_ROLES.INVENTORY, definition: 'Adding quantity to inventory, usually from delivery or correction.' },
  { term: 'Stock Movement', roles: HELP_ROLES.INVENTORY, definition: 'A saved record showing how and why item quantity changed.' },
  { term: 'Stock Out', roles: HELP_ROLES.INVENTORY, definition: 'Reducing quantity from inventory for non-sales reasons such as damage, release, or adjustment.' },
  { term: 'Supplier Reorder Report', roles: HELP_ROLES.INVENTORY, definition: 'A report that helps identify items that may need restocking from suppliers.' },
  { term: 'TIN', roles: HELP_ROLES.SALES, definition: 'The Tax Identification Number entered for customers who need invoice details.' },
  { term: 'Untracked Sales Item', roles: HELP_ROLES.INVENTORY, definition: 'A sold manual item that may need review before becoming a regular inventory record.' },
  { term: 'User Role', roles: HELP_ROLES.ALL, definition: 'The access level assigned to a user, such as Admin, Sales Encoder, or Inventory Staff.' },
];

const roleFallback = roleHelpAccess[ROLE_VALUES.INVENTORY_STAFF];

const itemAllowedForRole = (item, role) => {
  const allowedRoles = item.roles || HELP_ROLES.ALL;
  return allowedRoles.includes(role);
};

const getItemText = item => {
  return [
    item.question,
    item.answer,
    item.title,
    item.summary,
    item.cause,
    item.solution,
    item.text,
    Array.isArray(item.steps) ? item.steps.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const matchesQuery = (item, query) => !query || getItemText(item).includes(query);

const slugify = value => String(value || 'user')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

function createUserManualPdf({
  roleLabel,
  roleAccess,
  visibleFaqs,
  visibleGuides,
  visibleGuidelines,
  visibleTroubleshooting,
  visibleWorkflows,
  visibleDataEntryRules,
  visibleSecurityReminders,
  visibleGlossaryTerms,
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  const brandRed = [239, 68, 68];
  const brandOrange = [249, 115, 22];
  const darkText = [15, 23, 42];
  const bodyText = [31, 41, 55];
  const mutedText = [71, 85, 105];
  let y = margin;
  let sectionNumber = 0;

  const drawPageAccent = () => {
    doc.setFillColor(...brandRed);
    doc.rect(0, 0, 14, pageHeight, 'F');
    doc.setFillColor(...brandOrange);
    doc.rect(14, 0, 8, pageHeight, 'F');
  };

  const addManualPage = () => {
    doc.addPage();
    drawPageAccent();
    y = margin;
  };

  const ensureSpace = needed => {
    if (y + needed <= pageHeight - margin - 8) return;
    addManualPage();
  };

  const estimateTextHeight = (text, { size = 10.5, style = 'normal', indent = 0, lineHeight = 14 } = {}) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text || ''), contentWidth - indent);
    return Math.max(lineHeight, lines.length * lineHeight);
  };

  const addText = (text, { size = 10.5, style = 'normal', color = bodyText, gap = 8, indent = 0, lineHeight = 14 } = {}) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(text || ''), contentWidth - indent);
    ensureSpace(lines.length * lineHeight + gap);
    doc.text(lines, margin + indent, y);
    y += lines.length * lineHeight + gap;
  };

  const addBulletText = (text, { size = 10.5, color = bodyText, gap = 6, indent = 0, lineHeight = 14 } = {}) => {
    const bulletX = margin + indent;
    const textX = bulletX + 14;
    const textValue = String(text || '');
    const labelMatch = textValue.match(/^([^:]{1,70}:)\s+(.+)$/);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const availableWidth = contentWidth - indent - 14;
    let lines = doc.splitTextToSize(textValue, availableWidth);
    if (labelMatch) {
      doc.setFont('helvetica', 'bold');
      const labelWidth = doc.getTextWidth(`${labelMatch[1]} `);
      doc.setFont('helvetica', 'normal');
      const firstDefinitionLines = doc.splitTextToSize(labelMatch[2], Math.max(80, availableWidth - labelWidth));
      const remainingDefinitionText = firstDefinitionLines.slice(1).join(' ');
      lines = [
        {
          label: labelMatch[1],
          value: firstDefinitionLines[0] || '',
          labelWidth,
        },
        ...doc.splitTextToSize(remainingDefinitionText, availableWidth).filter(Boolean),
      ];
    }
    ensureSpace(lines.length * lineHeight + gap);
    doc.setFillColor(...brandOrange);
    doc.circle(bulletX + 3, y - 3, 2.2, 'F');
    doc.setTextColor(...color);
    if (labelMatch && typeof lines[0] === 'object') {
      doc.setFont('helvetica', 'bold');
      doc.text(`${lines[0].label} `, textX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(lines[0].value, textX + lines[0].labelWidth, y);
      if (lines.length > 1) {
        doc.text(lines.slice(1), textX, y + lineHeight);
      }
    } else {
      doc.text(lines, textX, y);
    }
    y += lines.length * lineHeight + gap;
  };

  const addTermBullet = (term, definition) => {
    const bulletX = margin;
    const textX = bulletX + 14;
    const label = `${term}: `;
    const lineHeight = 14;
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(label);
    const definitionLines = doc.splitTextToSize(String(definition || ''), contentWidth - 14 - labelWidth);
    ensureSpace(Math.max(lineHeight, definitionLines.length * lineHeight) + 8);
    doc.setFillColor(...brandOrange);
    doc.circle(bulletX + 3, y - 3, 2.2, 'F');
    doc.setTextColor(...darkText);
    doc.text(label, textX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...bodyText);
    doc.text(definitionLines, textX + labelWidth, y);
    y += definitionLines.length * lineHeight + 8;
  };

  const addLabeledText = (label, value, { indent = 0, gap = 6, lineHeight = 14 } = {}) => {
    const textX = margin + indent;
    const labelText = `${label}: `;
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(labelText);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(String(value || ''), contentWidth - indent - labelWidth);
    ensureSpace(Math.max(lineHeight, valueLines.length * lineHeight) + gap);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkText);
    doc.text(labelText, textX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...bodyText);
    doc.text(valueLines, textX + labelWidth, y);
    y += valueLines.length * lineHeight + gap;
  };

  const addCoverPage = () => {
    drawPageAccent();
    doc.setFillColor(255, 247, 237);
    doc.roundedRect(margin, 74, pageWidth - margin * 2, 210, 16, 16, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...brandOrange);
    doc.text('OFFICIAL USER GUIDE', margin + 26, 116);

    doc.setFontSize(24);
    doc.setTextColor(...darkText);
    doc.text('E.M. Cayetano Store', margin + 26, 156);
    doc.text('Management System', margin + 26, 186);

    doc.setFontSize(16);
    doc.text(`${roleLabel} User Manual`, margin + 26, 232);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...mutedText);
    doc.text('Prepared for E.M. Cayetano Trading daily store operations.', margin + 26, 258);

    y = 336;
    addText('This manual is role-based. It includes only the modules, instructions, workflows, and reminders that match the signed-in user role.', {
      size: 11,
      color: bodyText,
      lineHeight: 15,
      gap: 18,
    });

    const metaRows = [
      ['Document', 'User Manual'],
      ['System', 'E.M. Cayetano Store Management System'],
      ['Business', 'E.M. Cayetano Trading'],
      ['Role', roleLabel],
    ];

    metaRows.forEach(([label, value]) => {
      ensureSpace(26);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y - 14, contentWidth, 22, 6, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...mutedText);
      doc.text(label, margin + 12, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkText);
      doc.text(value, margin + 126, y);
      y += 30;
    });
  };

  const addTableOfContents = sections => {
    addManualPage();
    const tocPage = doc.internal.getCurrentPageInfo().pageNumber;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...darkText);
    doc.text('Table of Contents', margin, y);
    return sections.map((title, index) => ({ title, index: index + 1, page: tocPage }));
  };

  const drawTableOfContents = entries => {
    const tocPage = entries[0]?.page;
    if (!tocPage) return;
    doc.setPage(tocPage);
    drawPageAccent();
    doc.setFillColor(255, 255, 255);
    doc.rect(margin - 2, margin - 8, contentWidth + 4, pageHeight - margin * 2 + 16, 'F');

    let tocY = margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...darkText);
    doc.text('Table of Contents', margin, tocY);
    tocY += 30;

    entries.forEach(entry => {
      const targetPage = sectionPageMap.get(entry.title);
      if (!targetPage) return;
      const indexText = `${entry.index}.`;
      const titleX = margin + 28;
      const pageColumnX = pageWidth - margin - 18;
      const pageText = String(targetPage);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(...bodyText);
      doc.text(indexText, margin, tocY);
      doc.text(entry.title, titleX, tocY);

      const titleWidth = doc.getTextWidth(entry.title);
      const dotStartX = titleX + titleWidth + 10;
      const dotEndX = pageColumnX - 14;
      let dots = '';
      while (doc.getTextWidth(dots) < Math.max(0, dotEndX - dotStartX)) {
        dots += '.';
      }
      doc.setTextColor(148, 163, 184);
      doc.text(dots, dotStartX, tocY);
      doc.setTextColor(...bodyText);
      doc.text(pageText, pageColumnX, tocY, { align: 'right' });
      doc.link(margin, tocY - 12, contentWidth, 18, { pageNumber: targetPage });
      tocY += 22;
    });
  };

  const startContent = () => {
    addManualPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...darkText);
    doc.text('E.M. Cayetano Store Management System', margin, y);
    y += 24;
    doc.setFontSize(14);
    doc.text(`${roleLabel} User Manual`, margin, y);
    y += 18;
    addText('Clear role-based instructions for daily store use.', {
      size: 10.5,
      color: mutedText,
      gap: 14,
    });
  };

  const sectionPageMap = new Map();
  const addSection = (title, minimumFollowingSpace = 72) => {
    sectionNumber += 1;
    ensureSpace(42 + minimumFollowingSpace);
    y += sectionNumber === 1 ? 0 : 8;
    sectionPageMap.set(title, doc.internal.getCurrentPageInfo().pageNumber);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...darkText);
    doc.text(`${sectionNumber}. ${title}`, margin, y);
    doc.setDrawColor(...brandOrange);
    doc.setLineWidth(1);
    doc.line(margin, y + 6, pageWidth - margin, y + 6);
    y += 18;
  };

  const addBulletList = (items, { previewCount = 2 } = {}) => {
    const previewHeight = items.slice(0, previewCount).reduce((sum, item) => (
      sum + estimateTextHeight(item, { indent: 22 }) + 6
    ), 0);
    ensureSpace(Math.max(28, previewHeight));
    items.forEach(item => addBulletText(item, { indent: 8 }));
    y += 4;
  };

  const addNumberedSteps = steps => {
    const previewHeight = steps.slice(0, 2).reduce((sum, step, stepIndex) => (
      sum + estimateTextHeight(`${stepIndex + 1}. ${step}`, { indent: 12 }) + 3
    ), 0);
    ensureSpace(Math.max(28, previewHeight));
    steps.forEach((step, stepIndex) => {
      addText(`${stepIndex + 1}. ${step}`, { indent: 12, gap: 3 });
    });
  };

  const addLabelAndBulletList = (label, items) => {
    const previewItems = items.slice(0, 2);
    const needed = 18 + previewItems.reduce((sum, item) => (
      sum + estimateTextHeight(item, { indent: 22 }) + 6
    ), 0);
    ensureSpace(needed);
    addText(label, { style: 'bold', gap: 5 });
    addBulletList(items);
  };

  const addGuideBlock = (heading, body, steps = []) => {
    const firstStep = steps[0] ? estimateTextHeight(`1. ${steps[0]}`, { indent: 12 }) : 0;
    const needed = estimateTextHeight(heading, { style: 'bold', size: 11 }) +
      (body ? estimateTextHeight(body, { size: 10.5 }) : 0) +
      firstStep + 22;
    ensureSpace(Math.max(58, needed));
    addText(heading, { style: 'bold', size: 11, gap: 5 });
    if (body) addText(body, { color: mutedText, gap: 5 });
    if (steps.length > 0) addNumberedSteps(steps);
    y += 4;
  };

  const sectionTitles = [
    'Introduction and System Overview',
    'System Requirements and Getting Started',
    'Interface Overview',
    'Role Access Summary',
    'Common Workflows',
    'Step-by-Step Module Guides',
    'Frequently Asked Questions',
    'Troubleshooting',
    'System Guidelines',
    'Data Entry Rules',
    'Security Reminders',
    'Glossary of Terms',
    'Contact Support',
  ];

  addCoverPage();
  const tocEntries = addTableOfContents(sectionTitles);
  startContent();

  addSection('Introduction and System Overview');
  addText(manualIntroduction.purpose);
  addLabelAndBulletList('The system helps the store perform these daily operations:', manualIntroduction.overview);

  addSection('System Requirements and Getting Started');
  addBulletList(manualRequirements);
  addText('Basic start-up steps:', { style: 'bold', gap: 5 });
  addNumberedSteps([
    'Open the system link in a supported browser.',
    'Log in with the account provided by the Admin.',
    'Complete verification if requested.',
    'Confirm that the branch and role shown in the system are correct.',
    'Use the sidebar menu to open the module needed for your task.',
  ]);

  addSection('Interface Overview');
  addBulletList(interfaceOverview);

  addSection('Role Access Summary');
  addText(roleAccess.description);
  addLabelAndBulletList('Modules you can use:', roleAccess.modules);
  addLabelAndBulletList('Main tasks allowed for your role:', roleAccess.tasks);

  addSection('Common Workflows');
  visibleWorkflows.forEach((workflow, workflowIndex) => {
    addGuideBlock(`${sectionNumber}.${workflowIndex + 1} ${workflow.title}`, '', workflow.steps);
  });

  addSection('Step-by-Step Module Guides');
  visibleGuides.forEach((guide, guideIndex) => {
    addGuideBlock(`${sectionNumber}.${guideIndex + 1} ${guide.title}`, guide.summary, guide.steps);
  });

  addSection('Frequently Asked Questions');
  visibleFaqs.forEach((item, index) => {
    ensureSpace(estimateTextHeight(item.question, { style: 'bold', size: 11 }) + estimateTextHeight(item.answer, { indent: 10 }) + 18);
    addText(`${index + 1}. ${item.question}`, { style: 'bold', size: 11, gap: 5 });
    addText(item.answer, { indent: 10, gap: 6 });
  });

  addSection('Troubleshooting');
  visibleTroubleshooting.forEach((item, index) => {
    ensureSpace(
      estimateTextHeight(item.title, { style: 'bold', size: 11 }) +
      estimateTextHeight(item.cause, { indent: 10 }) +
      estimateTextHeight(item.solution, { indent: 10 }) +
      26
    );
    addText(`${index + 1}. ${item.title}`, { style: 'bold', size: 11, gap: 5 });
    addLabeledText('Possible cause', item.cause, { indent: 10, gap: 4 });
    addLabeledText('What to do', item.solution, { indent: 10, gap: 6 });
  });

  addSection('System Guidelines');
  addBulletList(visibleGuidelines.map(item => item.text));

  addSection('Data Entry Rules');
  addBulletList(visibleDataEntryRules.map(item => item.text));

  addSection('Security Reminders');
  addBulletList(visibleSecurityReminders.map(item => item.text));

  addSection('Glossary of Terms');
  visibleGlossaryTerms.forEach(item => {
    addTermBullet(item.term, item.definition);
  });

  addSection('Contact Support');
  supportContacts.forEach(contact => {
    ensureSpace(
      estimateTextHeight(`${contact.label}: ${contact.value}`, { style: 'bold', indent: 14 }) +
      estimateTextHeight(contact.helper, { indent: 28 }) +
      18
    );
    addTermBullet(contact.label, contact.value);
    addText(contact.helper, { indent: 28, color: mutedText, gap: 8 });
  });

  drawTableOfContents(tocEntries);

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: 'right' });
  }

  doc.save(`em-cayetano-${slugify(roleLabel)}-user-manual.pdf`);
}

function SectionTitle({ icon, tone = 'blue', title, subtitle, onShowAll }) {
  return (
    <div className="help-section-title">
      <div className={`help-section-icon help-section-icon-${tone}`}>{icon}</div>
      <div className="min-w-0">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {onShowAll && (
        <button type="button" className="help-show-all" onClick={onShowAll}>
          Show All
        </button>
      )}
    </div>
  );
}

function SupportContactList({ showAction = false }) {
  return (
    <div className="help-contact-list" aria-label="Official support contact information">
      {supportContacts.map(({ id, label, value, helper, href, Icon, tone }) => (
        <div className={`help-contact-card help-contact-${tone}`} key={id}>
          <div className={`help-contact-icon help-contact-icon-${tone}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="help-contact-details">
            <h3>{label}</h3>
            <a href={href}>{value}</a>
            <p>{helper}</p>
          </div>
        </div>
      ))}

      {showAction && (
        <Button type="button" className="help-contact-action" asChild>
          <a href={mailtoHref}>Contact Support</a>
        </Button>
      )}
    </div>
  );
}

function EmptyCard({ title = 'No help topics found.', message = 'Try another keyword or choose All Topics.' }) {
  return (
    <div className="help-empty-state">
      <CircleHelp className="h-8 w-8 text-slate-500" />
      <h2>{title}</h2>
      <p>{message}</p>
    </div>
  );
}

export function HelpModule({ user }) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [openFaq, setOpenFaq] = useState(null);
  const [openGuide, setOpenGuide] = useState(null);
  const [openTrouble, setOpenTrouble] = useState(null);
  const [fullView, setFullView] = useState(null);
  const normalizedRole = normalizeRole(user?.role) || ROLE_VALUES.INVENTORY_STAFF;
  const roleLabel = getRoleLabel(normalizedRole);
  const roleAccess = roleHelpAccess[normalizedRole] || roleFallback;
  const isAdmin = isAdminRole(normalizedRole);
  const normalizedQuery = query.trim().toLowerCase();

  const visibleFaqs = useMemo(() => {
    return faqs
      .filter(item => itemAllowedForRole(item, normalizedRole))
      .filter(item => matchesQuery(item, normalizedQuery));
  }, [normalizedQuery, normalizedRole]);

  const visibleGuides = useMemo(() => {
    return guides
      .filter(item => itemAllowedForRole(item, normalizedRole))
      .filter(item => matchesQuery(item, normalizedQuery));
  }, [normalizedQuery, normalizedRole]);

  const visibleGuidelines = useMemo(() => {
    return guidelines
      .filter(item => itemAllowedForRole(item, normalizedRole))
      .filter(item => matchesQuery(item, normalizedQuery));
  }, [normalizedQuery, normalizedRole]);

  const visibleTroubleshooting = useMemo(() => {
    return troubleshooting
      .filter(item => itemAllowedForRole(item, normalizedRole))
      .filter(item => matchesQuery(item, normalizedQuery));
  }, [normalizedQuery, normalizedRole]);

  const contactSearchValues = [
    'contact support',
    'support information',
    'email support',
    'telephone number',
    'cellphone number',
    'phone support',
    ...supportContacts.flatMap(contact => [contact.label, contact.value, contact.helper]),
  ];
  const contactMatches = !normalizedQuery || contactSearchValues.some(value => value.toLowerCase().includes(normalizedQuery));

  const showFaqs = (topic === 'all' || topic === 'faqs') && visibleFaqs.length > 0;
  const showGuides = (topic === 'all' || topic === 'guides') && visibleGuides.length > 0;
  const showGuidelines = (topic === 'all' || topic === 'guidelines') && visibleGuidelines.length > 0;
  const showTroubleshooting = (topic === 'all' || topic === 'troubleshooting') && visibleTroubleshooting.length > 0;
  const showContact = (topic === 'all' || topic === 'contact') && contactMatches;
  const hasAnyResults = showFaqs || showGuides || showGuidelines || showTroubleshooting || showContact;

  const fullViewContent = {
    faqs: visibleFaqs,
    guides: visibleGuides,
    guidelines: visibleGuidelines,
    troubleshooting: visibleTroubleshooting,
    contact: supportContacts,
  };

  const fullViewTitle = {
    faqs: 'Frequently Asked Questions',
    guides: 'Step-by-Step Guides',
    guidelines: 'System Guidelines',
    troubleshooting: 'Troubleshooting',
    contact: 'Contact Support',
  }[fullView];

  const handleDownloadManual = () => {
    const isAllowed = item => itemAllowedForRole(item, normalizedRole);
    const sortByTerm = (a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' });
    createUserManualPdf({
      roleLabel,
      roleAccess,
      visibleFaqs: faqs.filter(isAllowed),
      visibleGuides: guides.filter(isAllowed),
      visibleGuidelines: guidelines.filter(isAllowed),
      visibleTroubleshooting: troubleshooting.filter(isAllowed),
      visibleWorkflows: manualWorkflows.filter(isAllowed),
      visibleDataEntryRules: dataEntryRules.filter(isAllowed),
      visibleSecurityReminders: securityReminders.filter(isAllowed),
      visibleGlossaryTerms: glossaryTerms.filter(isAllowed).sort(sortByTerm),
    });
  };

  const clearSearch = () => {
    setQuery('');
    setTopic('all');
  };

  return (
    <div className="help-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .help-page {
          color: #172033;
        }

        .help-search-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(170px, 210px);
          gap: 12px;
          align-items: stretch;
        }

        .help-search {
          position: relative;
          min-width: 0;
        }

        .help-search input,
        .help-topic-trigger {
          min-height: 48px;
          border-radius: 10px;
          border: 1px solid rgba(226, 232, 240, 0.95);
          background: #ffffff;
          color: #172033;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        .help-search input {
          width: 100%;
          padding: 0 46px;
          font-size: 14px;
          outline: none;
        }

        .help-search input:focus,
        .help-topic-trigger:focus {
          border-color: #facc15;
          box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.28), 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        .help-search input::-webkit-search-cancel-button,
        .help-search input::-webkit-search-decoration {
          appearance: none;
          display: none;
        }

        .help-search-icon,
        .help-clear-search {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
        }

        .help-search-icon {
          left: 16px;
          height: 18px;
          width: 18px;
        }

        .help-clear-search {
          right: 12px;
          display: grid;
          height: 28px;
          width: 28px;
          place-items: center;
          border-radius: 999px;
        }

        .help-clear-search:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .help-role-card {
          margin-top: 24px;
          border-color: #dbeafe;
          border-radius: 14px;
          background: linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
        }

        .help-role-content {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr) auto;
          gap: 20px;
          align-items: center;
          padding: 20px;
        }

        .help-role-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #2563eb;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .help-role-content h2 {
          margin-top: 8px;
          color: #0f172a;
          font-size: 22px;
          font-weight: 850;
          line-height: 1.18;
        }

        .help-role-content p {
          margin-top: 6px;
          color: #334155;
          font-size: 14px;
          line-height: 1.55;
        }

        .help-role-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .help-role-pill {
          border: 1px solid #dbeafe;
          border-radius: 999px;
          background: #ffffff;
          color: #1e293b;
          font-size: 12px;
          font-weight: 750;
          padding: 7px 10px;
          white-space: nowrap;
        }

        .help-manual-button {
          min-height: 48px;
          gap: 8px;
          border-radius: 10px;
          background: #f97316;
          color: #ffffff;
          font-weight: 800;
          white-space: nowrap;
        }

        .help-manual-button:hover {
          background: #ea580c;
        }

        .help-grid {
          margin-top: 22px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 0.52fr);
          gap: 18px;
          align-items: start;
        }

        .help-main-grid,
        .help-side-grid {
          display: grid;
          gap: 18px;
          align-items: start;
        }

        .help-main-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .help-card {
          min-width: 0;
          height: 100%;
          border-color: #e2e8f0;
          border-radius: 12px;
          background: #ffffff;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
        }

        .help-card-wide {
          grid-column: 1 / -1;
        }

        .help-card-content {
          padding: 20px;
        }

        .help-section-title {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) auto;
          gap: 14px;
          align-items: start;
          margin-bottom: 16px;
        }

        .help-section-title h2 {
          color: #0f172a;
          font-size: 16px;
          font-weight: 850;
          line-height: 1.25;
        }

        .help-section-title p {
          margin-top: 5px;
          color: #334155;
          font-size: 13px;
          line-height: 1.5;
        }

        .help-section-icon {
          display: grid;
          height: 44px;
          width: 44px;
          place-items: center;
          border-radius: 10px;
        }

        .help-section-icon-blue { background: #eff6ff; color: #2563eb; }
        .help-section-icon-green { background: #ecfdf5; color: #16a34a; }
        .help-section-icon-amber { background: #fff7ed; color: #f59e0b; }
        .help-section-icon-purple { background: #faf5ff; color: #7c3aed; }
        .help-section-icon-red { background: #fef2f2; color: #dc2626; }

        .help-show-all {
          color: #2563eb;
          font-size: 12px;
          font-weight: 800;
          padding-top: 2px;
        }

        .help-show-all:hover {
          text-decoration: underline;
        }

        .help-list {
          display: grid;
          gap: 2px;
        }

        .help-row,
        .help-guide-row,
        .help-trouble-row {
          display: grid;
          width: 100%;
          border-top: 1px solid #edf2f7;
          text-align: left;
        }

        .help-row:first-child,
        .help-guide-row:first-child,
        .help-trouble-row:first-child {
          border-top: 0;
        }

        .help-row {
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 14px 0;
        }

        .help-guide-row,
        .help-trouble-row {
          grid-template-columns: 40px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 14px 0;
        }

        .help-row-title {
          display: block;
          color: #0f172a;
          font-size: 13px;
          font-weight: 850;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .help-row-summary {
          display: block;
          margin-top: 4px;
          color: #334155;
          font-size: 12px;
          line-height: 1.45;
        }

        .help-guide-icon {
          display: grid;
          height: 40px;
          width: 40px;
          place-items: center;
          border-radius: 10px;
          background: #eff6ff;
          color: #2563eb;
        }

        .help-chevron {
          height: 17px;
          width: 17px;
          color: #64748b;
          transition: transform 160ms ease;
        }

        .help-chevron-open {
          transform: rotate(180deg);
        }

        .help-answer,
        .help-guide-panel,
        .help-trouble-panel {
          border-radius: 10px;
          background: #f8fafc;
          color: #1e293b;
          font-size: 13px;
          line-height: 1.6;
          padding: 14px;
          margin-bottom: 8px;
        }

        .help-guide-panel h3 {
          color: #0f172a;
          font-size: 14px;
          font-weight: 850;
        }

        .help-guide-steps,
        .help-fullview-steps {
          display: grid;
          gap: 9px;
          margin-top: 12px;
        }

        .help-guide-step {
          display: grid;
          grid-template-columns: 24px minmax(0, 1fr);
          gap: 9px;
          align-items: start;
        }

        .help-guide-step-number {
          display: grid;
          height: 22px;
          width: 22px;
          place-items: center;
          border-radius: 999px;
          background: #2563eb;
          color: #ffffff;
          font-size: 11px;
          font-weight: 850;
          line-height: 1;
        }

        .help-guidelines {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 18px;
        }

        .help-guideline {
          display: grid;
          grid-template-columns: 20px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          color: #1e293b;
          font-size: 13px;
          line-height: 1.55;
        }

        .help-contact-list {
          display: grid;
          gap: 12px;
        }

        .help-contact-card {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          border-radius: 10px;
          padding: 14px;
          min-width: 0;
        }

        .help-contact-purple {
          border: 1px solid #e9d5ff;
          background: #faf5ff;
        }

        .help-contact-green {
          border: 1px solid #bbf7d0;
          background: #f0fdf4;
        }

        .help-contact-icon {
          display: grid;
          height: 42px;
          width: 42px;
          place-items: center;
          border-radius: 10px;
          background: #ffffff;
        }

        .help-contact-icon-purple { color: #7e22ce; }
        .help-contact-icon-green { color: #15803d; }

        .help-contact-details {
          min-width: 0;
        }

        .help-contact-card h3 {
          color: #0f172a;
          font-size: 13px;
          font-weight: 850;
        }

        .help-contact-card a {
          display: block;
          margin-top: 4px;
          max-width: 100%;
          color: #6d28d9;
          font-size: 13px;
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .help-contact-green a {
          color: #15803d;
        }

        .help-contact-card p {
          margin-top: 5px;
          color: #334155;
          font-size: 12px;
          line-height: 1.45;
        }

        .help-contact-action {
          width: fit-content;
          background: #f97316;
          color: #ffffff;
        }

        .help-contact-action:hover {
          background: #ea580c;
        }

        .help-empty-state {
          display: grid;
          place-items: center;
          min-height: 220px;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
          background: #ffffff;
          padding: 32px;
          text-align: center;
          color: #334155;
        }

        .help-empty-state h2 {
          margin-top: 10px;
          color: #0f172a;
          font-size: 17px;
          font-weight: 850;
        }

        .help-empty-state p {
          margin-top: 6px;
          font-size: 13px;
        }

        .help-fullview-backdrop {
          position: fixed;
          inset: 0;
          z-index: 60;
          display: grid;
          place-items: center;
          background: rgba(15, 23, 42, 0.58);
          padding: 22px;
        }

        .help-fullview-panel {
          width: min(940px, 100%);
          max-height: min(760px, calc(100vh - 44px));
          overflow: auto;
          border-radius: 16px;
          background: #ffffff;
          box-shadow: 0 28px 70px rgba(15, 23, 42, 0.32);
        }

        .help-fullview-header {
          position: sticky;
          top: 0;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: start;
          border-bottom: 1px solid #e5e7eb;
          background: #ffffff;
          padding: 22px 24px;
        }

        .help-fullview-header h2 {
          color: #0f172a;
          font-size: 22px;
          font-weight: 850;
          line-height: 1.2;
        }

        .help-fullview-header p {
          margin-top: 6px;
          color: #334155;
          font-size: 14px;
          line-height: 1.5;
        }

        .help-fullview-body {
          display: grid;
          gap: 14px;
          padding: 22px 24px 24px;
        }

        .help-fullview-item {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #ffffff;
          padding: 16px;
        }

        .help-fullview-item h3 {
          color: #0f172a;
          font-size: 15px;
          font-weight: 850;
        }

        .help-fullview-item p {
          margin-top: 7px;
          color: #334155;
          font-size: 13px;
          line-height: 1.6;
        }

        @media (max-width: 1180px) {
          .help-role-content,
          .help-grid,
          .help-main-grid {
            grid-template-columns: 1fr;
          }

          .help-manual-button {
            width: fit-content;
          }
        }

        @media (max-width: 760px) {
          .help-page {
            padding: 14px;
          }

          .help-search-row {
            grid-template-columns: 1fr;
          }

          .help-role-content {
            padding: 16px;
            gap: 16px;
          }

          .help-role-content h2 {
            font-size: 19px;
          }

          .help-manual-button {
            width: 100%;
          }

          .help-grid,
          .help-main-grid,
          .help-side-grid {
            gap: 14px;
          }

          .help-card-content {
            padding: 16px;
          }

          .help-section-title {
            grid-template-columns: 40px minmax(0, 1fr) auto;
            gap: 12px;
          }

          .help-section-icon {
            height: 40px;
            width: 40px;
          }

          .help-guidelines {
            grid-template-columns: 1fr;
          }

          .help-fullview-backdrop {
            padding: 12px;
          }

          .help-fullview-header,
          .help-fullview-body {
            padding: 16px;
          }
        }

        @media (max-width: 430px) {
          .help-section-title {
            grid-template-columns: 40px minmax(0, 1fr);
          }

          .help-show-all {
            grid-column: 2;
            justify-self: start;
          }

          .help-role-list {
            gap: 6px;
          }

          .help-role-pill {
            white-space: normal;
          }
        }
      `}</style>

      <PageHeader
        title="Help & Support"
        subtitle="Find role-based guides, answers, and support information for using the store management system."
        icon={<CircleHelp className="h-8 w-8" />}
      >
        <div className="help-search-row">
          <div className="help-search">
            <Search className="help-search-icon" />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') event.preventDefault();
              }}
              placeholder="Search help topics..."
              aria-label="Search help topics"
            />
            {query && (
              <button type="button" className="help-clear-search" onClick={clearSearch} aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger className="help-topic-trigger">
              <SelectValue placeholder="All Topics" />
            </SelectTrigger>
            <SelectContent>
              {topicOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <Card className="help-role-card">
        <CardContent className="help-role-content">
          <div>
            <span className="help-role-kicker">
              <LockKeyhole className="h-4 w-4" />
              Your Role-Based Guide
            </span>
            <h2>{roleAccess.title}</h2>
            <p>{roleAccess.description}</p>
          </div>

          <div className="help-role-list" aria-label={`Modules available to ${roleLabel}`}>
            {roleAccess.modules.map(moduleName => (
              <span className="help-role-pill" key={moduleName}>{moduleName}</span>
            ))}
          </div>

          <Button type="button" className="help-manual-button" onClick={handleDownloadManual}>
            <Download className="h-4 w-4" />
            Download My User Manual PDF
          </Button>
        </CardContent>
      </Card>

      {!hasAnyResults && (
        <div className="mt-5">
          <EmptyCard />
        </div>
      )}

      {hasAnyResults && (
        <div className="help-grid">
          <div className="help-main-grid">
            {showFaqs && (
              <Card className="help-card">
                <CardContent className="help-card-content">
                  <SectionTitle
                    icon={<CircleHelp className="h-5 w-5" />}
                    title="Frequently Asked Questions"
                    subtitle="Quick answers based on your role."
                    onShowAll={() => setFullView('faqs')}
                  />
                  <div className="help-list">
                    {visibleFaqs.slice(0, 8).map(item => {
                      const isOpen = openFaq === item.id;
                      return (
                        <div key={item.id}>
                          <button type="button" className="help-row" onClick={() => setOpenFaq(isOpen ? null : item.id)}>
                            <span className="help-row-title">{item.question}</span>
                            <ChevronDown className={`help-chevron ${isOpen ? 'help-chevron-open' : ''}`} />
                          </button>
                          {isOpen && <div className="help-answer">{item.answer}</div>}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {showGuides && (
              <Card className="help-card">
                <CardContent className="help-card-content">
                  <SectionTitle
                    icon={<BookOpen className="h-5 w-5" />}
                    title="Step-by-Step Guides"
                    subtitle="Clear task steps you are allowed to perform."
                    onShowAll={() => setFullView('guides')}
                  />
                  <div className="help-list">
                    {visibleGuides.slice(0, 7).map(item => {
                      const isOpen = openGuide === item.id;
                      return (
                        <div key={item.id}>
                          <button type="button" className="help-guide-row" onClick={() => setOpenGuide(isOpen ? null : item.id)}>
                            <span className="help-guide-icon">
                              {item.id === 'managing-users' ? <UserCog className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                            </span>
                            <span>
                              <span className="help-row-title">{item.title}</span>
                              <span className="help-row-summary">{item.summary}</span>
                            </span>
                            <ChevronDown className={`help-chevron ${isOpen ? 'help-chevron-open' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="help-guide-panel">
                              <h3>{item.title}</h3>
                              <div className="help-guide-steps">
                                {item.steps.map((step, index) => (
                                  <div className="help-guide-step" key={step}>
                                    <span className="help-guide-step-number">{index + 1}</span>
                                    <span>{step}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {showGuidelines && (
              <Card className="help-card help-card-wide">
                <CardContent className="help-card-content">
                  <SectionTitle
                    icon={<ShieldCheck className="h-5 w-5" />}
                    tone="green"
                    title="System Guidelines"
                    subtitle="Simple rules for clean and accurate records."
                    onShowAll={() => setFullView('guidelines')}
                  />
                  <div className="help-guidelines">
                    {visibleGuidelines.map(item => (
                      <div className="help-guideline" key={item.id}>
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="help-side-grid">
            {showTroubleshooting && (
              <Card className="help-card">
                <CardContent className="help-card-content">
                  <SectionTitle
                    icon={<Wrench className="h-5 w-5" />}
                    tone="amber"
                    title="Troubleshooting"
                    subtitle="Common issues and what to do next."
                    onShowAll={() => setFullView('troubleshooting')}
                  />
                  <div className="help-list">
                    {visibleTroubleshooting.slice(0, 7).map(item => {
                      const isOpen = openTrouble === item.id;
                      return (
                        <div key={item.id}>
                          <button type="button" className="help-trouble-row" onClick={() => setOpenTrouble(isOpen ? null : item.id)}>
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                            <span className="help-row-title">{item.title}</span>
                            <ChevronDown className={`help-chevron ${isOpen ? 'help-chevron-open' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="help-trouble-panel">
                              <p><strong>Possible Cause:</strong> {item.cause}</p>
                              <p className="mt-2"><strong>What to do:</strong> {item.solution}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {showContact && (
              <Card className="help-card">
                <CardContent className="help-card-content">
                  <SectionTitle
                    icon={<Headphones className="h-5 w-5" />}
                    tone="purple"
                    title="Contact Support"
                    subtitle="Official support information for E.M. Cayetano Trading."
                    onShowAll={() => setFullView('contact')}
                  />
                  <SupportContactList />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {fullView && (
        <div className="help-fullview-backdrop" role="dialog" aria-modal="true" aria-label={fullViewTitle}>
          <div className="help-fullview-panel">
            <div className="help-fullview-header">
              <div>
                <h2>{fullViewTitle}</h2>
                <p>{isAdmin ? 'Complete role-based guidance for your account.' : 'Only topics available to your role are shown here.'}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setFullView(null)}>
                Close
              </Button>
            </div>
            <div className="help-fullview-body">
              {fullView === 'faqs' && fullViewContent.faqs.map(item => (
                <div className="help-fullview-item" key={item.id}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </div>
              ))}

              {fullView === 'guides' && fullViewContent.guides.map(item => (
                <div className="help-fullview-item" key={item.id}>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <div className="help-fullview-steps">
                    {item.steps.map((step, index) => (
                      <div className="help-guide-step" key={step}>
                        <span className="help-guide-step-number">{index + 1}</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {fullView === 'guidelines' && fullViewContent.guidelines.map(item => (
                <div className="help-fullview-item" key={item.id}>
                  <div className="help-guideline">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                    <span>{item.text}</span>
                  </div>
                </div>
              ))}

              {fullView === 'troubleshooting' && fullViewContent.troubleshooting.map(item => (
                <div className="help-fullview-item" key={item.id}>
                  <h3>{item.title}</h3>
                  <p><strong>Possible Cause:</strong> {item.cause}</p>
                  <p><strong>What to do:</strong> {item.solution}</p>
                </div>
              ))}

              {fullView === 'contact' && <SupportContactList showAction />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
