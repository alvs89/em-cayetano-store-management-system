// Help module: provides in-app guidance for common workflows and staff support.
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileText,
  Headphones,
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
import { isAdminRole } from '../utils/roles';

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

// Official support channels displayed in the Help module. Keeping these values
// in one list prevents the main card and full-view dialog from drifting apart.
const supportContacts = [
  {
    id: 'email',
    label: 'Email Support',
    value: supportEmail,
    helper: 'Send system concerns, access questions, or report details by email.',
    href: mailtoHref,
    Icon: Mail,
    tone: 'email',
  },
  {
    id: 'telephone',
    label: 'Telephone Number',
    value: supportTelephone,
    helper: 'Use this landline number for store or office support.',
    href: telephoneHref,
    Icon: Phone,
    tone: 'telephone',
  },
  {
    id: 'cellphone',
    label: 'Cellphone Number',
    value: supportCellphone,
    helper: 'Use this mobile number when cellphone contact is preferred.',
    href: cellphoneHref,
    Icon: Phone,
    tone: 'cellphone',
  },
];

const faqs = [
  {
    id: 'add-inventory-item',
    question: 'How do I add a new inventory item?',
    answer: 'Go to the Inventory page and select Add New Item. Enter the item name, choose the category, supplier if known, initial stock quantity, selling price, and manual low-stock threshold. Use "Other" only if the item does not fit any available category.',
  },
  {
    id: 'stock-records',
    question: 'How do I update stock-in and stock-out records?',
    answer: 'Open the Inventory page, select the item, then choose Stock In to add new deliveries or Stock Out to deduct released, sold, damaged, expired, or adjusted items. Always select the reason and review the quantity before saving.',
  },
  {
    id: 'reports',
    question: 'How do I generate reports?',
    answer: 'Go to the Reports page, select the report period, then choose the report type such as Summary, Detailed Inventory, Low Stock, or Category Analysis. If available, use Export to PDF to save a copy of the report.',
  },
  {
    id: '2fa-expired',
    question: 'What should I do if my 2FA code expires?',
    answer: 'Click Resend Code to request a new verification code. Use the newest code sent to your email and enter it before the timer expires.',
  },
  {
    id: 'restore-archive',
    question: 'How do I restore an archived item?',
    answer: 'Go to the Archive page, search for the archived item, and select Restore if you are authorized. Restoring the item will return it to the active inventory list.',
  },
  {
    id: 'admin-features',
    question: 'Why cannot I access some admin features?',
    answer: 'Some features are only available to admin users, such as user management, backup, restore, role editing, and account deactivation. Contact the system admin if you believe your access should be updated.',
    adminRelated: true,
  },
  {
    id: 'low-stock',
    question: 'Why is an item marked as low stock?',
    answer: 'An item is marked as low stock when its quantity reaches the manual low-stock threshold set for that item. Review low-stock alerts regularly.',
  },
  {
    id: 'duplicate-archive',
    question: 'Can I create a duplicate item if it already exists in the archive?',
    answer: 'No. If the same item already exists in the archive, restore the archived item instead of creating a duplicate record. This helps keep inventory data clean and accurate.',
  },
];

const guides = [
  {
    id: 'adding-new-item',
    title: 'Adding a New Item',
    summary: 'Learn how to add a new inventory item.',
    steps: [
      'Open the Inventory page.',
      'Click Add New Item.',
      'Enter the item name.',
      'Select the category that best describes the item.',
      'Enter the initial stock quantity.',
      'Set the manual low-stock threshold.',
      'Review the details.',
      'Click Add Item.',
    ],
  },
  {
    id: 'updating-stock',
    title: 'Updating Stock Levels',
    summary: 'Record stock-in and stock-out transactions.',
    steps: [
      'Open the Inventory page.',
      'Search or select the item.',
      'Choose Stock In for new deliveries or Stock Out for released items.',
      'Enter the quantity.',
      'Select the stock movement reason.',
      'Review the updated stock value.',
      'Save the transaction.',
    ],
  },
  {
    id: 'searching-products',
    title: 'Searching Products',
    summary: 'Find products using keywords and filters.',
    steps: [
      'Open the Search page or Inventory page.',
      'Enter the item name or keyword.',
      'Use category filters if needed.',
      'Review the matching results.',
      'Open the item details if more information is needed.',
    ],
  },
  {
    id: 'generating-reports',
    title: 'Generating Reports',
    summary: 'Create and export inventory reports.',
    steps: [
      'Open the Reports page.',
      'Select the report period.',
      'Choose the report type.',
      'Review the generated report.',
      'Export the report as PDF if needed.',
    ],
  },
  {
    id: 'archived-items',
    title: 'Managing Archived Items',
    summary: 'Archive, restore, and review inactive items.',
    steps: [
      'Open the Archive page.',
      'Search or filter archived items.',
      'Review the item details.',
      'Select Restore if the item should return to active inventory.',
      'Confirm the restore action.',
    ],
  },
  {
    id: 'managing-users',
    title: 'Managing Users',
    summary: 'Approve users, assign roles, and manage access.',
    adminOnly: true,
    steps: [
      'Open the User Management page.',
      'Review active, pending, or inactive users.',
      'Approve pending users if valid.',
      'Edit roles or branch access when needed.',
      'Deactivate users who should no longer access the system.',
    ],
  },
];

const guidelines = [
  { id: 'accurate-names', text: 'Use accurate item names and categories.' },
  { id: 'check-records', text: 'Check existing active and archived records before adding new items.' },
  { id: 'other-category', text: 'Use "Other" only when no category fits.' },
  { id: 'credentials', text: 'Do not share account credentials.' },
  { id: 'low-stock-alerts', text: 'Review low-stock alerts regularly.' },
  { id: 'transactions', text: 'Record stock-in and stock-out quantities with the correct movement reason.' },
  { id: 'backups', text: 'Create backups before performing restore actions.', adminRelated: true },
  { id: 'admin-features', text: 'Admin-only features should be used only by authorized users.', adminRelated: true },
];

const troubleshooting = [
  {
    id: 'login-reset',
    title: 'Login issue or password reset',
    cause: 'The username, password, or registered email may be incorrect.',
    solution: 'Check your login details. If you forgot your password, use the Forgot Password option and follow the reset instructions sent to your registered email.',
  },
  {
    id: '2fa-not-received',
    title: '2FA code not received or expired',
    cause: 'The code may have expired or the email may be delayed.',
    solution: 'Click Resend Code and use the newest verification code. Also check your spam or junk folder.',
  },
  {
    id: 'search-no-results',
    title: 'Item search shows no results',
    cause: 'The item name may be misspelled, filtered incorrectly, or not yet recorded.',
    solution: 'Clear filters, check spelling, or search using a shorter keyword. Also check the Archive page if the item is inactive.',
  },
  {
    id: 'report-export',
    title: 'Report not generating or exporting',
    cause: 'Required filters may be missing, or there may be no data for the selected period.',
    solution: 'Select a valid report period and report type. If there is still no result, check whether inventory records exist for that period.',
  },
  {
    id: 'low-stock-missing',
    title: 'Low-stock alert not showing',
    cause: 'The manual low-stock threshold may not be set correctly, or the item quantity is still above the threshold.',
    solution: 'Check the item current quantity and manual low-stock threshold from the Inventory page.',
  },
  {
    id: 'admin-access',
    title: 'Cannot access user management or maintenance',
    cause: 'The account may not have admin permission.',
    solution: 'Contact the system admin to verify your role and access level.',
    adminRelated: true,
  },
];

const includesQuery = (item, query, fields) => {
  if (!query) return true;
  return fields.some(field => String(item[field] || '').toLowerCase().includes(query));
};

function SectionTitle({ icon, tone = 'blue', title, subtitle, onViewAll }) {
  return (
    <div className="help-section-title">
      <div className={`help-section-icon help-section-icon-${tone}`}>{icon}</div>
      <div className="min-w-0">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {onViewAll && (
        <button type="button" className="help-view-all" onClick={onViewAll}>
          View All
        </button>
      )}
    </div>
  );
}

function AdminBadge() {
  return <span className="help-admin-badge">Admin only</span>;
}

function SupportContactList({ showAction = false }) {
  return (
    <div className="help-contact-list" aria-label="Official support contact information">
      {supportContacts.map(({ id, label, value, helper, href, Icon, tone }) => (
        <div className={`help-contact-card help-contact-card-${tone}`} key={id}>
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

export function HelpModule({ user }) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const [openFaq, setOpenFaq] = useState(null);
  const [openGuide, setOpenGuide] = useState(null);
  const [openTrouble, setOpenTrouble] = useState(null);
  const [fullView, setFullView] = useState(null);
  const normalizedQuery = query.trim().toLowerCase();
  const isAdmin = isAdminRole(user?.role);

  const visibleGuides = useMemo(() => {
    return guides
      .filter(item => isAdmin || !item.adminOnly)
      .filter(item => includesQuery(item, normalizedQuery, ['title', 'summary']));
  }, [isAdmin, normalizedQuery]);

  const visibleFaqs = useMemo(() => {
    return faqs.filter(item => includesQuery(item, normalizedQuery, ['question', 'answer']));
  }, [normalizedQuery]);

  const visibleGuidelines = useMemo(() => {
    return guidelines.filter(item => includesQuery(item, normalizedQuery, ['text']));
  }, [normalizedQuery]);

  const visibleTroubleshooting = useMemo(() => {
    return troubleshooting.filter(item => includesQuery(item, normalizedQuery, ['title', 'cause', 'solution']));
  }, [normalizedQuery]);

  const contactSearchValues = [
    'contact support',
    'support information',
    'email support',
    'telephone number',
    'cellphone number',
    'phone support',
    ...supportContacts.flatMap(contact => [contact.label, contact.value, contact.helper])
  ];
  const contactMatches = !normalizedQuery || contactSearchValues
    .some(value => value.toLowerCase().includes(normalizedQuery));

  const showFaqs = (topic === 'all' || topic === 'faqs') && visibleFaqs.length > 0;
  const showGuides = (topic === 'all' || topic === 'guides') && visibleGuides.length > 0;
  const showGuidelines = (topic === 'all' || topic === 'guidelines') && visibleGuidelines.length > 0;
  const showTroubleshooting = (topic === 'all' || topic === 'troubleshooting') && visibleTroubleshooting.length > 0;
  const showContact = (topic === 'all' || topic === 'contact') && contactMatches;
  const hasAnyResults = showFaqs || showGuides || showGuidelines || showTroubleshooting || showContact;

  const clearSearch = () => setQuery('');
  const fullViewTitle = {
    faqs: 'All Frequently Asked Questions',
    guides: 'All Step-by-Step Guides',
    guidelines: 'All System Guidelines',
    troubleshooting: 'All Troubleshooting Topics',
    contact: 'Contact Support Details',
  }[fullView];
  const fullViewDescription = {
    faqs: 'Review complete answers to common questions about using the system.',
    guides: 'Follow detailed instructions for common inventory and account tasks.',
    guidelines: 'Review the recommended practices for keeping system records accurate and secure.',
    troubleshooting: 'Find practical causes and solutions for common system issues.',
    contact: 'Use the available support channels when you need additional assistance.',
  }[fullView];

  return (
    <div className="help-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .help-page {
          color: #172033;
        }

        .help-search-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 210px;
          gap: 12px;
        }

        .help-search {
          position: relative;
        }

        .help-search input {
          height: 48px;
          width: 100%;
          border: 1px solid rgba(226, 232, 240, 0.95);
          border-radius: 10px;
          background: #ffffff;
          padding: 0 46px;
          color: #172033;
          font-size: 14px;
          outline: none;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        .help-search input:focus {
          border-color: #facc15;
          box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.28), 0 10px 24px rgba(15, 23, 42, 0.08);
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

        .help-topic-trigger {
          height: 48px;
          border-radius: 10px;
          border-color: rgba(226, 232, 240, 0.95);
          background: #ffffff;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        .help-grid {
          margin-top: 24px;
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(340px, 0.82fr);
          gap: 22px;
          align-items: start;
        }

        .help-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 22px;
          align-items: start;
        }

        .help-column {
          display: grid;
          gap: 22px;
        }

        .help-card {
          border-color: #e5e7eb;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
        }

        .help-card-faq {
          grid-column: 1;
          grid-row: 1;
        }

        .help-card-guides {
          grid-column: 2;
          grid-row: 1;
        }

        .help-card-faq,
        .help-card-guides {
          align-self: start;
        }

        .help-card-guidelines {
          grid-column: 1 / span 2;
          grid-row: 2;
        }

        .help-column-side {
          grid-column: 2;
          grid-row: 1;
        }

        .help-card-content {
          padding: 20px;
        }

        .help-section-title {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) auto;
          gap: 14px;
          align-items: start;
          margin-bottom: 18px;
        }

        .help-section-title h2 {
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.25;
        }

        .help-section-title p {
          margin-top: 5px;
          font-size: 13px;
          color: #111827;
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
        .help-section-icon-orange { background: #fff7ed; color: #fb923c; }

        .help-view-all {
          color: #2563eb;
          font-size: 12px;
          font-weight: 700;
          padding-top: 2px;
        }

        .help-view-all:hover {
          text-decoration: underline;
        }

        .help-fullview-backdrop {
          position: fixed;
          inset: 0;
          z-index: 60;
          display: grid;
          place-items: center;
          background: rgba(15, 23, 42, 0.58);
          padding: 24px;
        }

        .help-fullview-panel {
          width: min(940px, 100%);
          max-height: min(760px, calc(100vh - 48px));
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
          color: #111827;
          font-size: 14px;
          line-height: 1.5;
        }

        .help-fullview-body {
          display: grid;
          gap: 16px;
          padding: 22px 24px 26px;
        }

        .help-fullview-item {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #f8fafc;
          padding: 16px;
        }

        .help-fullview-item h3 {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          color: #0f172a;
          font-size: 15px;
          font-weight: 850;
          line-height: 1.4;
        }

        .help-fullview-item p {
          margin-top: 9px;
          color: #111827;
          font-size: 13px;
          line-height: 1.65;
        }

        .help-fullview-steps {
          margin-top: 12px;
          display: grid;
          gap: 10px;
        }

        .help-list {
          display: grid;
        }

        .help-row {
          width: 100%;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: center;
          border-top: 1px solid #edf2f7;
          padding: 15px 0;
          text-align: left;
        }

        .help-row:first-child {
          border-top: 0;
        }

        .help-row-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #172033;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.45;
        }

        .help-row-summary {
          margin-top: 4px;
          color: #111827;
          font-size: 12px;
          line-height: 1.5;
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

        .help-answer {
          border-top: 1px solid #edf2f7;
          padding: 0 0 16px;
          color: #111827;
          font-size: 13px;
          line-height: 1.65;
        }

        .help-guide-row {
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr) auto;
          gap: 14px;
          align-items: center;
          border-top: 1px solid #edf2f7;
          padding: 15px 0;
          width: 100%;
          text-align: left;
        }

        .help-guide-row:first-child {
          border-top: 0;
        }

        .help-guide-icon {
          display: grid;
          height: 38px;
          width: 38px;
          place-items: center;
          border-radius: 9px;
          background: #eff6ff;
          color: #2563eb;
        }

        .help-guide-panel {
          margin-top: 1px;
          border-radius: 12px;
          border: 1px solid #dbeafe;
          background: #f8fbff;
          padding: 16px;
        }

        .help-guide-steps {
          margin-top: 12px;
          display: grid;
          gap: 10px;
        }

        .help-guide-step {
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr);
          gap: 12px;
          align-items: center;
          min-height: 34px;
          color: #111827;
          font-size: 13px;
          line-height: 1.45;
        }

        .help-guide-step-number {
          display: grid;
          width: 28px;
          height: 28px;
          place-items: center;
          border-radius: 999px;
          background: #2563eb;
          color: #ffffff;
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
          box-shadow: 0 6px 14px rgba(37, 99, 235, 0.18);
        }

        .help-empty-guide {
          margin-top: 16px;
          border-radius: 10px;
          border: 1px dashed #cbd5e1;
          background: #f8fafc;
          padding: 14px;
          color: #111827;
          font-size: 13px;
        }

        .help-guidelines {
          column-count: 2;
          column-gap: 36px;
        }

        .help-guideline {
          display: grid;
          grid-template-columns: 20px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          break-inside: avoid;
          color: #111827;
          font-size: 13px;
          line-height: 1.55;
          margin-bottom: 14px;
        }

        .help-guideline:last-child {
          margin-bottom: 0;
        }

        .help-admin-badge {
          border-radius: 999px;
          background: #fff7ed;
          color: #c2410c;
          font-size: 11px;
          font-weight: 800;
          padding: 3px 8px;
          white-space: nowrap;
        }

        .help-trouble-row {
          display: grid;
          grid-template-columns: 22px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          width: 100%;
          border-top: 1px solid #edf2f7;
          padding: 14px 0;
          text-align: left;
        }

        .help-trouble-row:first-child {
          border-top: 0;
        }

        .help-trouble-panel {
          border-top: 1px solid #edf2f7;
          padding: 0 0 15px 34px;
          color: #111827;
          font-size: 13px;
          line-height: 1.6;
        }

        .help-trouble-panel strong {
          color: #0f172a;
        }

        .help-contact-card {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr);
          gap: 14px;
          align-items: start;
          border-radius: 10px;
          padding: 16px;
          min-width: 0;
        }

        .help-contact-list {
          display: grid;
          gap: 14px;
          margin-top: 14px;
        }

        .help-contact-card-email,
        .help-contact-card-telephone {
          border: 1px solid #e9d5ff;
          background: #faf5ff;
        }

        .help-contact-card-cellphone {
          border: 1px solid #bbf7d0;
          background: #f0fdf4;
        }

        .help-contact-icon {
          display: grid;
          height: 44px;
          width: 44px;
          place-items: center;
          border-radius: 10px;
          background: #ffffff;
        }

        .help-contact-icon-email,
        .help-contact-icon-telephone {
          color: #7e22ce;
        }

        .help-contact-icon-cellphone {
          color: #15803d;
        }

        .help-contact-details {
          min-width: 0;
        }

        .help-contact-card h3 {
          color: #0f172a;
          font-size: 14px;
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .help-contact-card a {
          display: block;
          margin-top: 5px;
          font-size: 13px;
          font-weight: 700;
          color: #6d28d9;
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .help-contact-card-cellphone a {
          color: #15803d;
        }

        .help-contact-card p {
          margin-top: 5px;
          color: #111827;
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .help-contact-action {
          margin-top: 2px;
          width: fit-content;
          background: #f97316;
          color: #ffffff;
        }

        .help-contact-action:hover {
          background: #ea580c;
        }

        .help-empty-state {
          margin-top: 24px;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
          background: #ffffff;
          padding: 36px;
          text-align: center;
          color: #111827;
        }

        .help-empty-state h2 {
          color: #0f172a;
          font-size: 18px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        @media (max-width: 1240px) {
          .help-grid {
            grid-template-columns: 1fr;
          }

          .help-column-side {
            grid-column: 1 / -1;
            grid-row: auto;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          }
        }

        @media (max-width: 760px) {
          .help-search-row,
          .help-grid,
          .help-main-grid,
          .help-column-side {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .help-column,
          .help-main-grid,
          .help-column-side {
            display: contents;
          }

          .help-card {
            width: 100%;
            min-width: 0;
            border-radius: 12px;
          }

          .help-card-faq,
          .help-card-guides,
          .help-card-troubleshooting,
          .help-card-guidelines,
          .help-card-contact {
            grid-column: 1 / -1;
            grid-row: auto;
          }

          .help-card-faq { order: 1; }
          .help-card-guides { order: 2; }
          .help-card-troubleshooting { order: 3; }
          .help-card-guidelines { order: 4; }
          .help-card-contact { order: 5; }

          .help-card-content {
            padding: 16px;
          }

          .help-section-title {
            grid-template-columns: 44px minmax(0, 1fr) auto;
            gap: 12px;
            margin-bottom: 14px;
          }

          .help-section-title h2 {
            font-size: 15px;
            overflow-wrap: anywhere;
          }

          .help-section-title p {
            font-size: 12px;
          }

          .help-row,
          .help-guide-row,
          .help-trouble-row {
            gap: 12px;
            padding: 13px 0;
          }

          .help-guide-row {
            grid-template-columns: 38px minmax(0, 1fr) auto;
          }

          .help-row-title {
            font-size: 13px;
          }

          .help-guidelines {
            column-count: 1;
          }

        }

        @media (max-width: 420px) {
          .help-search-row {
            gap: 10px;
          }

          .help-card-content {
            padding: 14px;
          }

          .help-section-title {
            grid-template-columns: 40px minmax(0, 1fr);
          }

          .help-view-all {
            grid-column: 2;
            justify-self: start;
            padding-top: 0;
          }

          .help-section-icon {
            height: 40px;
            width: 40px;
          }

          .help-guide-row {
            grid-template-columns: 36px minmax(0, 1fr) auto;
          }

          .help-guide-icon {
            height: 36px;
            width: 36px;
          }

          .help-contact-card {
            grid-template-columns: 42px minmax(0, 1fr);
            padding: 14px;
          }

          .help-contact-icon {
            height: 40px;
            width: 40px;
          }

          .help-contact-action {
            width: 100%;
          }
        }
      `}</style>

      <PageHeader
        title="Help & Support"
        subtitle="Find answers, guides, and support information for using the store management system."
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
              placeholder="Search for help topics..."
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

      {!hasAnyResults && (
        <div className="help-empty-state">
          <h2>No help topics found.</h2>
          <p>Try searching for another keyword.</p>
          <Button type="button" className="mt-5" variant="outline" onClick={() => {
            setQuery('');
            setTopic('all');
          }}>
            Clear Search
          </Button>
        </div>
      )}

      {hasAnyResults && (
        <div className="help-grid">
          <div className="help-main-grid">
            {showFaqs && (
              <Card className="help-card help-card-faq">
                <CardContent className="help-card-content">
                  <SectionTitle
                    icon={<CircleHelp className="h-5 w-5" />}
                    title="Frequently Asked Questions"
                    subtitle="Find quick answers to common questions."
                    onViewAll={() => setFullView('faqs')}
                  />
                  <div className="help-list">
                    {visibleFaqs.map(item => {
                      const isOpen = openFaq === item.id;
                      return (
                        <div key={item.id}>
                          <button type="button" className="help-row" onClick={() => setOpenFaq(isOpen ? null : item.id)}>
                            <span className="help-row-title">
                              {item.question}
                              {item.adminRelated && !isAdmin && <AdminBadge />}
                            </span>
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
              <Card className="help-card help-card-guides">
                <CardContent className="help-card-content">
                  <SectionTitle
                    icon={<BookOpen className="h-5 w-5" />}
                    title="Step-by-Step Guides"
                    subtitle="Detailed tutorials for common tasks."
                    onViewAll={() => setFullView('guides')}
                  />
                  <div>
                    {visibleGuides.map(item => {
                      const isOpen = openGuide === item.id;
                      return (
                        <div key={item.id}>
                          <button type="button" className="help-guide-row" onClick={() => setOpenGuide(isOpen ? null : item.id)}>
                            <span className="help-guide-icon">
                              {item.id === 'managing-users' ? <UserCog className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                            </span>
                            <span>
                              <span className="help-row-title">
                                {item.title}
                                {item.adminOnly && <AdminBadge />}
                              </span>
                              <span className="help-row-summary">{item.summary}</span>
                            </span>
                            <ChevronDown className={`help-chevron ${isOpen ? 'help-chevron-open' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="help-guide-panel">
                              <h3 className="font-bold text-slate-950">{item.title}</h3>
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
              <Card className="help-card help-card-guidelines">
                <CardContent className="help-card-content">
                  <SectionTitle
                    icon={<ShieldCheck className="h-5 w-5" />}
                    tone="green"
                    title="System Guidelines"
                    subtitle="Best practices for using the system."
                  />
                  <div className="help-guidelines">
                    {visibleGuidelines.map(item => (
                      <div className="help-guideline" key={item.id}>
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                        <span>
                          {item.text} {item.adminRelated && !isAdmin && <AdminBadge />}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="help-column help-column-side">
            {showTroubleshooting && (
              <Card className="help-card help-card-troubleshooting">
                <CardContent className="help-card-content">
                  <SectionTitle
                    icon={<Wrench className="h-5 w-5" />}
                    tone="amber"
                    title="Troubleshooting"
                    subtitle="Solutions to common issues."
                    onViewAll={() => setFullView('troubleshooting')}
                  />
                  <div>
                    {visibleTroubleshooting.map(item => {
                      const isOpen = openTrouble === item.id;
                      return (
                        <div key={item.id}>
                          <button type="button" className="help-trouble-row" onClick={() => setOpenTrouble(isOpen ? null : item.id)}>
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                            <span className="help-row-title">
                              {item.title}
                              {item.adminRelated && !isAdmin && <AdminBadge />}
                            </span>
                            <ChevronDown className={`help-chevron ${isOpen ? 'help-chevron-open' : ''}`} />
                          </button>
                          {isOpen && (
                            <div className="help-trouble-panel">
                              <p><strong>Possible Cause:</strong> {item.cause}</p>
                              <p className="mt-2"><strong>Solution:</strong> {item.solution}</p>
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
              <Card className="help-card help-card-contact">
                <CardContent className="help-card-content">
                  <SectionTitle
                    icon={<Headphones className="h-5 w-5" />}
                    tone="purple"
                    title="Contact Support"
                    subtitle="Official support information for E.M. Cayetano Trading."
                  />

                  <SupportContactList />
                </CardContent>
              </Card>
            )}

            {topic === 'contact' && !contactMatches && (
              <Card className="help-card help-card-contact">
                <CardContent className="help-card-content">
                  <div className="help-empty-guide">Support contact details are not available. Please contact the system administrator.</div>
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
                <p>{fullViewDescription}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setFullView(null)}>
                Close
              </Button>
            </div>
            <div className="help-fullview-body">
              {fullView === 'faqs' && faqs.map(item => (
                <div className="help-fullview-item" key={item.id}>
                  <h3>{item.question}{item.adminRelated && !isAdmin && <AdminBadge />}</h3>
                  <p>{item.answer}</p>
                </div>
              ))}

              {fullView === 'guides' && guides.filter(item => isAdmin || !item.adminOnly).map(item => (
                <div className="help-fullview-item" key={item.id}>
                  <h3>{item.title}{item.adminOnly && <AdminBadge />}</h3>
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

              {fullView === 'guidelines' && guidelines.map(item => (
                <div className="help-guideline help-fullview-item" key={item.id}>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                  <span>{item.text} {item.adminRelated && !isAdmin && <AdminBadge />}</span>
                </div>
              ))}

              {fullView === 'troubleshooting' && troubleshooting.map(item => (
                <div className="help-fullview-item" key={item.id}>
                  <h3>{item.title}{item.adminRelated && !isAdmin && <AdminBadge />}</h3>
                  <p><strong>Possible Cause:</strong> {item.cause}</p>
                  <p><strong>Solution:</strong> {item.solution}</p>
                </div>
              ))}

              {fullView === 'contact' && (
                <SupportContactList showAction />
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
