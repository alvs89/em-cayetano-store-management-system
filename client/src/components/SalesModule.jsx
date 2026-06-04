// Sales module: handles POS checkout, receipt/invoice printing, sales history,
// refunds, and inventory deductions for tracked items.
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Minus, ReceiptText, Trash2, ShoppingCart, History, CheckCircle, Info, PackageCheck, AlertTriangle, TrendingUp, User, Coins, ClipboardList, Search, CalendarDays, Clock, Tag, Wallet, MessageSquareText, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, Pencil, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { PageHeader } from './PageHeader';
import { useData } from './DataContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { binarySearch, mergeSort } from '../utils/algorithms';
import { createNumericInputGuards } from '../utils/numericInputGuards';
import { canRecordSales, isAdminRole } from '../utils/roles';

const emptySaleLine = () => ({
  inventoryId: '',
  isManual: false,
  itemName: '',
  category: 'Other',
  categoryNote: '',
  quantity: '',
  unitPrice: ''
});

const PRODUCT_PAGE_SIZE = 10;
const DEFAULT_NON_INVENTORY_DRAFT = {
  itemName: '',
  category: 'Other',
  categoryNote: '',
  quantity: '1',
  unitPrice: ''
};
const OFFICIAL_SALES_CATEGORIES = [
  'Roofing',
  'PVC Pipe / Fittings',
  'Steel',
  'Kiln Dry',
  'Plywood',
  'Electricals',
  'Paints',
  'Other'
];
const VAGUE_NON_INVENTORY_NAMES = new Set(['other', 'others', 'misc', 'miscellaneous']);
const normalizeSalesInventoryIdentityName = value =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’']/g, '')
    .replace(/(\d+(?:\/\d+)?)\s*"/g, '$1 in')
    .replace(/\bby\b/g, 'x')
    .replace(/(\d)\s*(?:x|×|\*)\s*(\d)/gi, '$1x$2')
    .replace(/([a-z])-([a-z])/g, '$1 $2')
    .replace(/(\d+)\s*\/\s*(\d+)/g, '$1/$2')
    .replace(/#\s*(\d+)/g, '#$1')
    .replace(/[^a-z0-9#./-]+/g, ' ')
    .replace(/(\d)([a-z]+)/g, '$1 $2')
    .replace(/([a-z]+)(\d)/g, '$1 $2')
    .replace(/(\d)\s*[x×]\s*(\d)/gi, '$1x$2')
    .replace(/(\d+x\d+)\s*x\s*(\d)/gi, '$1x$2')
    .split(' ')
    .filter(Boolean)
    .join(' ');

const toTransactionDateInputValue = value => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

const getDatePartFromDateTime = value => String(value || '').slice(0, 10);
const getTimePartFromDateTime = value => String(value || '').slice(11, 16);
const getCurrentDateTimeInputValue = () => toTransactionDateInputValue(new Date());
const getCurrentDatePart = () => getCurrentDateTimeInputValue().slice(0, 10);
const getCurrentTimePart = () => getCurrentDateTimeInputValue().slice(11, 16);
const combineActualTransactionDateTime = (datePart, timePart) =>
  datePart && timePart ? `${datePart}T${timePart}` : '';

const isPastTransactionDate = value => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now() - 60 * 1000;
};

const isBackdatedRecord = record => {
  if (!record?.createdAt || !record?.encodedAt) return false;
  const transactionDate = new Date(record.createdAt);
  const encodedDate = new Date(record.encodedAt);
  if (Number.isNaN(transactionDate.getTime()) || Number.isNaN(encodedDate.getTime())) return false;
  return encodedDate.getTime() - transactionDate.getTime() > 60 * 1000 || Boolean(record.backdateReason);
};

const customerTypeLabels = {
  walk_in: 'Walk-in Customer',
  sister_company: 'Sister Company',
  hardware_reseller: 'Other Hardware / Reseller',
  regular: 'Regular Customer',
  contractor: 'Contractor / Project Buyer'
};

const paymentMethodLabels = {
  cash: 'Cash',
  gcash: 'GCash',
  bank_transfer: 'Bank Transfer',
  credit: 'Store Credit'
};

const discountOptions = {
  none: { label: 'No Discount', rate: 0, manual: false },
  custom_amount: { label: 'Manual Amount', rate: null, manual: true }
};

const getDiscountLabel = sale =>
  sale?.discountLabel || discountOptions[sale?.discountType]?.label || (Number(sale?.discountAmount || 0) > 0 ? 'Manual Discount' : 'No Discount');

const isNonInventorySaleItem = item =>
  item?.isInventoryItem === false || item?.itemType === 'non_inventory' || item?.item_type === 'non_inventory';

const getSaleItemNotes = sale =>
  (sale?.items || [])
    .map(item => String(item.categoryNote || item.category_note || '').trim())
    .filter(Boolean);

const getSaleRemarksText = sale =>
  String(sale?.remarks || '').trim() || getSaleItemNotes(sale).join('\n');

const requiresPaymentConfirmation = paymentMethod => ['gcash', 'bank_transfer'].includes(paymentMethod);
const VAT_RATE = 0.12;

const computeVatBreakdown = taxableAmount => {
  const gross = Number(taxableAmount || 0);
  const vatableSales = Number((gross / (1 + VAT_RATE)).toFixed(2));
  const vatAmount = Number((gross - vatableSales).toFixed(2));
  return { vatableSales, vatAmount };
};

const getTaxableSalesAmount = sale => {
  const subtotal = Number(sale?.subtotalAmount ?? sale?.subtotal_amount ?? 0);
  const discount = Number(sale?.discountAmount ?? sale?.discount_amount ?? 0);
  return Math.max(Number((subtotal - discount).toFixed(2)), 0);
};

const getReceiptVatBreakdown = sale => {
  const storedVatableSales = Number(sale?.vatableSales ?? sale?.vatable_sales ?? 0);
  const storedVatAmount = Number(sale?.vatAmount ?? sale?.vat_amount ?? 0);

  if (storedVatableSales > 0 || storedVatAmount > 0) {
    return { vatableSales: storedVatableSales, vatAmount: storedVatAmount };
  }

  return computeVatBreakdown(getTaxableSalesAmount(sale));
};

const escapeReceiptText = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatCurrency = value =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(Number(value || 0));

const formatDateTime = value => {
  if (!value) return 'No date recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString();
};

const formatHistoryDateParts = value => {
  if (!value) {
    return { date: 'No date recorded', time: '' };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: 'Invalid date', time: '' };
  }
  return {
    date: date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }),
    time: date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    })
  };
};

const formatReceiptDateOnly = value => {
  if (!value) return 'No date recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleDateString();
};

const RECEIPT_BUSINESS_INFO = {
  businessName: 'E.M. CAYETANO TRADING',
  tin: 'VAT Reg. TIN 176-665-005-00000',
  proprietor: 'EDNA M. CAYETANO - Prop.',
  contact: 'Tel No. 8285-9611 Cell. No. (0918) 930-6300',
  addresses: {
    manggahan: '196 J.P Rizal Avenue, Manggahan 1860\nRodriguez, Rizal, Philippines',
    san_rafael: '482 MH del Pilar St, Rodriguez, 1860 Rizal'
  }
};

const getReceiptBranchAddress = branch => {
  const normalizedBranch = String(branch || '').toLowerCase().replace(/\s+/g, '_');
  if (normalizedBranch.includes('san_rafael') || normalizedBranch.includes('sanrafael')) {
    return RECEIPT_BUSINESS_INFO.addresses.san_rafael;
  }
  return RECEIPT_BUSINESS_INFO.addresses.manggahan;
};

const normalizeReceiptCustomerText = value => String(value || '').trim().replace(/\s+/g, ' ');
const getReceiptCustomerName = sale => normalizeReceiptCustomerText(sale?.customerName) || 'C';
const getReceiptCustomerTin = sale => normalizeReceiptCustomerText(sale?.customerTin);
const getReceiptCustomerAddress = sale => normalizeReceiptCustomerText(sale?.customerAddress) || 'C';
const getReceiptAddressLines = address => String(address || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
const formatReceiptAddressHtml = address => getReceiptAddressLines(address).map(escapeReceiptText).join('<br>');
function isRefundSalesRecord(sale) {
  return sale?.transactionType === 'refund'
    || Number(sale?.totalAmount || 0) < 0
    || Number(sale?.totalQuantity || 0) < 0
    || (sale?.items || []).some(item => Number(item?.quantitySold || 0) < 0);
}
const getTransactionRecordLabel = sale => (isRefundSalesRecord(sale) ? 'Refund Record' : 'Sales Record');
const getTransactionDocumentName = sale => (isRefundSalesRecord(sale) ? 'Refund Receipt' : 'Receipt');
const OFFICIAL_INVOICE_NUMBER_PATTERN = /^\d{6}$/;
const OFFICIAL_INVOICE_MIN_SEQUENCE = 1;
const OFFICIAL_INVOICE_MAX_SEQUENCE = 999999;
const LEGACY_SALES_INVOICE_NUMBER_PATTERN = /^SI-\d{4}-(\d{6})$/i;
const extractLegacyOfficialInvoiceNumber = value => {
  const match = String(value || '').trim().match(LEGACY_SALES_INVOICE_NUMBER_PATTERN);
  return match ? match[1] : '';
};
const normalizeOfficialInvoiceDisplayNumber = (officialInvoiceNumber, fallbackSalesNumber) => {
  const cleanOfficialInvoiceNumber = String(officialInvoiceNumber || '').trim();
  if (OFFICIAL_INVOICE_NUMBER_PATTERN.test(cleanOfficialInvoiceNumber)) {
    return cleanOfficialInvoiceNumber;
  }
  return extractLegacyOfficialInvoiceNumber(cleanOfficialInvoiceNumber)
    || extractLegacyOfficialInvoiceNumber(fallbackSalesNumber)
    || cleanOfficialInvoiceNumber;
};
const isLegacySalesInvoiceReference = value => LEGACY_SALES_INVOICE_NUMBER_PATTERN.test(String(value || '').trim());
const getOfficialInvoiceNumber = sale =>
  normalizeOfficialInvoiceDisplayNumber(
    sale?.officialInvoiceNumber || sale?.official_invoice_number,
    sale?.salesNumber || sale?.sales_number
  );
const getSystemReferenceNumber = sale => {
  const systemReferenceNumber = sale?.salesNumber || sale?.sales_number || '';
  return isLegacySalesInvoiceReference(systemReferenceNumber) ? '' : systemReferenceNumber;
};
const getReferenceOfficialInvoiceNumber = sale =>
  normalizeOfficialInvoiceDisplayNumber(
    sale?.referenceOfficialInvoiceNumber || sale?.reference_official_invoice_number,
    sale?.referenceSalesNumber || sale?.reference_sales_number
  );
const getReferenceSystemNumber = sale => {
  const referenceSystemNumber = sale?.referenceSalesNumber || sale?.reference_sales_number || '';
  return isLegacySalesInvoiceReference(referenceSystemNumber) ? '' : referenceSystemNumber;
};
const getPrimaryDocumentNumber = sale => {
  if (isRefundSalesRecord(sale)) {
    return getSystemReferenceNumber(sale) || getTransactionRecordLabel(sale);
  }
  return getOfficialInvoiceNumber(sale) || getSystemReferenceNumber(sale) || getTransactionRecordLabel(sale);
};
const getSalesHistoryTitleNumber = sale =>
  isRefundSalesRecord(sale)
    ? getSystemReferenceNumber(sale) || getTransactionRecordLabel(sale)
    : getOfficialInvoiceNumber(sale) || getSystemReferenceNumber(sale) || getTransactionRecordLabel(sale);
const getDisplayQuantity = value => Math.abs(Number(value || 0));
const sanitizeTinInput = value => {
  const rawValue = String(value || '');
  const cleaned = rawValue.replace(/[^0-9-]/g, '');
  if (rawValue !== cleaned) {
    toast.warning('TIN must contain numbers and dashes only.', {
      id: 'sales-tin-numbers-dashes-only',
      description: 'Please use a format like 000-000-000-000.',
      duration: 2500
    });
  }
  return cleaned;
};

const downloadSaleTransactionSummary = sale => {
  if (!sale) return;

  const isRefund = isRefundSalesRecord(sale);
  const documentName = getTransactionDocumentName(sale);
  const documentPrefix = isRefund ? 'REFUND' : 'SALES';
  const documentTitle = isRefund ? 'RECEIPT' : 'INVOICE';
  const documentNumber = getPrimaryDocumentNumber(sale);
  const originalInvoiceNumber = getReferenceOfficialInvoiceNumber(sale);
  const originalSystemNumber = getReferenceSystemNumber(sale);
  const items = sale.items || [];
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const receiptX = 2;
  const receiptY = 2;
  const receiptWidth = pageWidth - (receiptX * 2);
  const receiptHeight = pageHeight - (receiptY * 2);
  const margin = receiptX + 6;
  const contentWidth = receiptWidth - 12;
  const money = value => `P${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
  const paymentLabel = paymentMethodLabels[sale.paymentMethod] || 'Cash';
  const customerName = getReceiptCustomerName(sale);
  const branchAddress = getReceiptBranchAddress(sale.branch);
  const receiptVat = getReceiptVatBreakdown(sale);
  const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const formattedDate = Number.isNaN(saleDate.getTime())
    ? formatDateTime(sale.createdAt)
    : formatReceiptDateOnly(sale.createdAt);
  const encodedDate = isBackdatedRecord(sale) ? formatDateTime(sale.encodedAt) : '';
  const normalizePdfText = value =>
    String(value ?? '')
      .replace(/₱/g, 'PHP ')
      .replace(/₱/g, 'PHP ')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  const drawText = (text, x, y, options = {}) => {
    if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
    doc.text(normalizePdfText(text), x, y, options);
  };
  const drawBox = (x, y, w, h, fill = false) => {
    if (fill) {
      doc.setFillColor(fill);
      doc.rect(x, y, w, h, 'FD');
      return;
    }
    doc.rect(x, y, w, h);
  };

  doc.setProperties({
    title: `${documentNumber} ${documentName}`,
    subject: isRefund ? 'Customer refund transaction receipt' : 'Sales transaction invoice-style receipt',
    author: sale.soldByName || 'System',
    creator: 'E.M. Cayetano Trading POS-Integrated Inventory System'
  });

  doc.setDrawColor(17, 24, 39);
  doc.setLineWidth(0.35);
  doc.rect(receiptX, receiptY, receiptWidth, receiptHeight);

  let y = receiptY + 14;
  const headerLeftWidth = contentWidth - 66;
  const headerLeftCenter = margin + (headerLeftWidth / 2);
  const invoiceRightX = receiptX + receiptWidth - 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  drawText(RECEIPT_BUSINESS_INFO.businessName, headerLeftCenter, y, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  drawText(RECEIPT_BUSINESS_INFO.tin, headerLeftCenter, y + 7, { align: 'center' });
  doc.setFontSize(10);
  drawText(RECEIPT_BUSINESS_INFO.proprietor, headerLeftCenter, y + 13, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  getReceiptAddressLines(branchAddress).forEach((lineText, index) => {
    drawText(lineText, headerLeftCenter, y + 19 + (index * 4), { align: 'center' });
  });
  drawText(RECEIPT_BUSINESS_INFO.contact, headerLeftCenter, y + 28, { align: 'center' });

  doc.setDrawColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(55, 65, 81);
  doc.setFontSize(10);
  drawText(documentPrefix, invoiceRightX, y + 3, { align: 'right' });
  doc.setFontSize(23);
  drawText(documentTitle, invoiceRightX, y + 14, { align: 'right' });
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(11);
  drawText(`${isRefund ? 'Refund Ref.' : 'No.'}: ${documentNumber}`, invoiceRightX, y + 27, { align: 'right' });
  if (isRefund && (originalInvoiceNumber || originalSystemNumber)) {
    doc.setFontSize(8);
    drawText(`Original Invoice: ${originalInvoiceNumber || originalSystemNumber}`, invoiceRightX, y + 31, { align: 'right' });
    doc.setFontSize(11);
  }
  doc.setTextColor(17, 24, 39);
  doc.setLineWidth(0.45);
  const headerBottomY = receiptY + 46;
  doc.line(receiptX, headerBottomY, receiptX + receiptWidth, headerBottomY);

  y = headerBottomY + 12;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const drawCheckbox = (x, boxY, checked) => {
    doc.rect(x, boxY, 3.5, 3.5);
    if (checked) {
      doc.setLineWidth(0.35);
      doc.line(x + 0.7, boxY + 1.9, x + 1.5, boxY + 2.8);
      doc.line(x + 1.5, boxY + 2.8, x + 3, boxY + 0.8);
    }
  };
  drawCheckbox(margin + 10, y - 3, sale.paymentMethod !== 'credit');
  drawText('CASH SALES', margin + 16, y);
  drawCheckbox(margin + 10, y + 2, sale.paymentMethod === 'credit');
  drawText('CHARGE SALES', margin + 16, y + 5);
  const dateBoxWidth = 80;
  const dateBoxX = receiptX + receiptWidth - 6 - dateBoxWidth;
  drawBox(dateBoxX, y - 7, dateBoxWidth, 13);
  doc.line(dateBoxX + 26, y - 7, dateBoxX + 26, y + 6);
  doc.setFont('helvetica', 'bold');
  drawText('Date:', dateBoxX + 3, y + 1.2);
  doc.setFont('helvetica', 'normal');
  drawText(formattedDate, dateBoxX + 53, y + 1.2, { align: 'center' });
  if (encodedDate) {
    doc.setFontSize(7);
    drawText(`Encoded: ${encodedDate}`, receiptX + receiptWidth - 6, y + 11, { align: 'right' });
    doc.setFontSize(9);
  }

  y = headerBottomY + 21;
  drawBox(margin, y, contentWidth, 27);
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  drawText('SOLD TO:', margin + 2, y + 4.2);
  doc.setFont('helvetica', 'normal');
  drawText('Registered Name :', margin + 8, y + 12);
  drawText(customerName, margin + 52, y + 12);
  drawText('TIN             :', margin + 8, y + 18);
  drawText(getReceiptCustomerTin(sale), margin + 52, y + 18);
  drawText('Business Address:', margin + 8, y + 24);
  drawText(getReceiptCustomerAddress(sale), margin + 52, y + 24);

  y += 38;
  const tableX = margin;
  const tableWidth = contentWidth;
  const colWidths = [108, 28, 35, tableWidth - 108 - 28 - 35];
  const headerHeight = 10;
  const rowHeight = 8;
  const minimumRows = 10;
  const rowCount = Math.max(minimumRows, items.length);
  const tableHeight = headerHeight + (rowCount * rowHeight);
  drawBox(tableX, y, tableWidth, tableHeight);
  doc.setFillColor(229, 231, 235);
  doc.rect(tableX, y, tableWidth, headerHeight, 'F');
  let colX = tableX;
  colWidths.forEach(width => {
    doc.line(colX, y, colX, y + tableHeight);
    colX += width;
  });
  doc.line(tableX + tableWidth, y, tableX + tableWidth, y + tableHeight);
  doc.line(tableX, y + headerHeight, tableX + tableWidth, y + headerHeight);
  for (let row = 1; row <= rowCount; row += 1) {
    const rowY = y + headerHeight + (row * rowHeight);
    doc.line(tableX, rowY, tableX + tableWidth, rowY);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  drawText('Item Description /', tableX + colWidths[0] / 2, y + 3.8, { align: 'center' });
  drawText('Nature of Service', tableX + colWidths[0] / 2, y + 7.4, { align: 'center' });
  drawText('Quantity', tableX + colWidths[0] + colWidths[1] / 2, y + 6.4, { align: 'center' });
  drawText('Unit Price', tableX + colWidths[0] + colWidths[1] + colWidths[2] / 2, y + 6.4, { align: 'center' });
  drawText('Amount', tableX + tableWidth - colWidths[3] / 2, y + 6.4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  items.forEach((item, index) => {
    const rowTop = y + headerHeight + (index * rowHeight);
    const itemDescription = `${item.itemName || 'Inventory item'}${isNonInventorySaleItem(item) ? ' (Non-Inventory)' : ''}`;
    const nameLines = doc.splitTextToSize(itemDescription, colWidths[0] - 5).slice(0, 2);
    drawText(nameLines[0] || 'Inventory item', tableX + 2, rowTop + 3.4);
    if (nameLines[1]) drawText(nameLines[1], tableX + 2, rowTop + 6.6);
    drawText(String(item.quantitySold || 0), tableX + colWidths[0] + colWidths[1] / 2, rowTop + 5.2, { align: 'center' });
    drawText(money(item.unitPrice), tableX + colWidths[0] + colWidths[1] + colWidths[2] / 2, rowTop + 5.2, { align: 'center' });
    drawText(money(item.subtotal), tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] / 2, rowTop + 5.2, { align: 'center' });
  });

  y += tableHeight + 7;
  const taxBoxWidth = 78;
  const totalsBoxWidth = 88;
  const boxRowHeight = 8;
  const totalsX = margin + contentWidth - totalsBoxWidth;
  const taxableSalesAmount = getTaxableSalesAmount(sale);
  const leftRows = [
    ['VATable Sales', money(receiptVat.vatableSales)],
    ['VAT', money(receiptVat.vatAmount)],
    ['Zero-Rated Sales', money(0)],
    ['VAT-Exempt Sales', money(0)]
  ];
  const rightRows = [
    ['Sales Subtotal', money(sale.subtotalAmount ?? sale.totalAmount)],
    [`Less: Discount`, money(sale.discountAmount)],
    ['Total Sales (VAT Inclusive)', money(taxableSalesAmount)],
    ['Less: VAT', money(receiptVat.vatAmount)],
    ['Amount: Net of VAT', money(receiptVat.vatableSales)],
    ['Add: VAT', money(receiptVat.vatAmount)],
    ['Add: Delivery Charge', money(sale.deliveryCharge)],
    ['TOTAL AMOUNT DUE', money(sale.totalAmount)],
    ['Change', money(sale.changeAmount)]
  ];
  drawBox(margin, y, taxBoxWidth, leftRows.length * boxRowHeight);
  leftRows.forEach(([label, value], index) => {
    const rowY = y + (index * boxRowHeight);
    if (index > 0) doc.line(margin, rowY, margin + taxBoxWidth, rowY);
    doc.line(margin + 45, rowY, margin + 45, rowY + boxRowHeight);
    drawText(label, margin + 43, rowY + 5.2, { align: 'right' });
    drawText(value, margin + taxBoxWidth - 2, rowY + 5.2, { align: 'right' });
  });
  drawBox(totalsX, y, totalsBoxWidth, rightRows.length * boxRowHeight);
  rightRows.forEach(([label, value], index) => {
    const rowY = y + (index * boxRowHeight);
    if (index > 0) doc.line(totalsX, rowY, totalsX + totalsBoxWidth, rowY);
    const isTotalRow = label === 'TOTAL AMOUNT DUE';
    doc.line(totalsX + 54, rowY, totalsX + 54, rowY + boxRowHeight);
    doc.setFont('helvetica', isTotalRow ? 'bold' : 'normal');
    drawText(label, totalsX + 52, rowY + 5.2, { align: 'right' });
    drawText(value, totalsX + totalsBoxWidth - 2, rowY + 5.2, { align: 'right' });
  });
  doc.setFont('helvetica', 'normal');
  y += leftRows.length * boxRowHeight + 7;

  drawText(`Received the amount of ${money(sale.amountReceived ?? sale.totalAmount)} via ${paymentLabel}.`, margin, y);
  if (sale.paymentReference) drawText(`Payment Reference: ${String(sale.paymentReference).slice(0, 40)}`, margin, y + 5);
  const remarksText = getSaleRemarksText(sale);
  if (remarksText) {
    doc.setFont('helvetica', 'bold');
    drawText('Remarks:', margin, y + 12);
    doc.setFont('helvetica', 'normal');
    doc.splitTextToSize(remarksText, contentWidth).slice(0, 3).forEach((lineText, index) => {
      drawText(lineText, margin, y + 17 + (index * 4));
    });
  }

  doc.save(`${documentNumber}_${isRefund ? 'refund_receipt' : 'sales_invoice'}.pdf`);
};

const openReceiptPrintWindow = () => {
  const receiptWindow = window.open('', '_blank', 'width=420,height=720');
  if (!receiptWindow) return null;

  receiptWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Preparing Receipt</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            color: #334155;
            font-family: Arial, sans-serif;
            font-size: 14px;
          }
        </style>
      </head>
      <body>Preparing receipt...</body>
    </html>
  `);
  receiptWindow.document.close();
  return receiptWindow;
};

const printSaleTransactionReceipt = (sale, existingWindow = null) => {
  if (!sale) return;

  const receiptWindow = existingWindow || openReceiptPrintWindow();
  if (!receiptWindow) {
    toast.error('Allow pop-ups to print the receipt.');
    return false;
  }

  const items = sale.items || [];
  const isRefund = isRefundSalesRecord(sale);
  const documentNumber = getPrimaryDocumentNumber(sale);
  const safeDocumentNumber = escapeReceiptText(documentNumber);
  const originalInvoiceNumber = getReferenceOfficialInvoiceNumber(sale);
  const originalSystemNumber = getReferenceSystemNumber(sale);
  const documentName = getTransactionDocumentName(sale);
  const documentPrefix = isRefund ? 'REFUND' : 'SALES';
  const documentTitle = isRefund ? 'RECEIPT' : 'INVOICE';
  const documentNumberLabel = isRefund ? 'Refund Ref.' : 'No.';
  const originalSaleLine = isRefund && (originalInvoiceNumber || originalSystemNumber)
    ? `<div class="reference-number">Original Invoice: ${escapeReceiptText(originalInvoiceNumber || originalSystemNumber)}</div>`
    : '';
  const minimumReceiptRows = 10;
  const itemRows = [
    ...items.map(item => `
      <tr>
        <td>
          ${escapeReceiptText(item.itemName || 'Inventory item')}
          ${isNonInventorySaleItem(item) ? '<br><small class="item-note">Non-Inventory</small>' : ''}
        </td>
        <td class="center-cell">${escapeReceiptText(getDisplayQuantity(item.quantitySold))}</td>
        <td class="amount-cell">${escapeReceiptText(formatCurrency(item.unitPrice))}</td>
        <td class="amount-cell">${escapeReceiptText(formatCurrency(item.subtotal))}</td>
      </tr>
    `),
    ...Array.from({ length: Math.max(0, minimumReceiptRows - items.length) }, () => `
      <tr>
        <td>&nbsp;</td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `)
  ].join('');
  const customerName = escapeReceiptText(getReceiptCustomerName(sale));
  const branchAddress = formatReceiptAddressHtml(getReceiptBranchAddress(sale.branch));
  const receiptVat = getReceiptVatBreakdown(sale);
  const taxableSalesAmount = getTaxableSalesAmount(sale);
  const receiptDate = escapeReceiptText(formatReceiptDateOnly(sale.createdAt));
  const receiptEncodedDate = isBackdatedRecord(sale) ? escapeReceiptText(formatDateTime(sale.encodedAt)) : '';
  const cashChecked = sale.paymentMethod === 'credit' ? '' : 'checked';
  const chargeChecked = sale.paymentMethod === 'credit' ? 'checked' : '';

  receiptWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${safeDocumentNumber} ${escapeReceiptText(documentName)}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 10mm;
            color: #111827;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            line-height: 1.35;
          }
          .receipt {
            width: 190mm;
            margin: 0 auto;
            border: 1px solid #111827;
            background: #fff;
          }
          .header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 58mm;
            gap: 14mm;
            align-items: start;
            padding: 16px 22px 12px;
            border-bottom: 2px solid #111827;
          }
          .brand { text-align: center; }
          .brand-name {
            font-size: 23px;
            font-weight: 800;
            letter-spacing: .01em;
            line-height: 1.05;
          }
          .tin {
            margin-top: 4px;
            font-weight: 700;
          }
          .proprietor {
            margin-top: 2px;
            font-size: 14px;
            font-weight: 800;
          }
          .address {
            margin: 2px auto 0;
            font-size: 11px;
            line-height: 1.25;
          }
          .contact {
            margin-top: 3px;
            font-size: 11px;
            line-height: 1.25;
          }
          .invoice-block {
            text-align: right;
            color: #374151;
          }
          .sales-label {
            font-size: 15px;
            font-weight: 800;
            font-style: italic;
            line-height: 1;
          }
          .invoice-title {
            margin-top: 4px;
            color: #374151;
            font-size: 34px;
            font-weight: 800;
            text-align: right;
            line-height: 1.05;
          }
          .invoice-number {
            margin-top: 10px;
            color: #374151;
            font-size: 16px;
            font-weight: 700;
            text-align: right;
          }
          .reference-number {
            margin-top: 5px;
            color: #4b5563;
            font-size: 11px;
            font-weight: 700;
            text-align: right;
          }
          .meta-row {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: end;
            padding: 0 22px;
            margin: 12px 0;
            gap: 16px;
          }
          .check-lines {
            width: 45%;
            padding-left: 8px;
          }
          .check-line {
            display: flex;
            gap: 8px;
            align-items: center;
          }
          .box {
            width: 12px;
            height: 12px;
            border: 1px solid #111827;
            display: inline-grid;
            place-items: center;
            font-size: 10px;
            line-height: 1;
          }
          .date-box {
            flex: 1 1 62mm;
            max-width: 78mm;
            border: 1px solid #111827;
            display: grid;
            grid-template-columns: minmax(30mm, 36%) minmax(0, 1fr);
            min-height: 30px;
          }
          .date-box strong,
          .date-box span {
            min-width: 0;
            padding: 7px 10px;
            overflow-wrap: anywhere;
            word-break: normal;
          }
          .date-box strong {
            border-right: 1px solid #111827;
            line-height: 1.15;
            display: flex;
            align-items: center;
          }
          .date-box span {
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1.25;
            text-align: center;
          }
          .sold-to {
            margin: 0 22px;
            border: 1px solid #111827;
          }
          .sold-to-title,
          .section-title {
            border-bottom: 1px solid #111827;
            background: #f3f4f6;
            padding: 4px 8px;
            font-weight: 800;
          }
          .sold-to-body {
            padding: 8px 16px 12px;
            min-height: 58px;
          }
          .sold-line {
            display: grid;
            grid-template-columns: 132px 1fr;
            gap: 10px;
            margin: 7px 0;
          }
          table {
            width: calc(100% - 44px);
            margin: 14px 22px 0;
            border-collapse: collapse;
          }
          th,
          td {
            border: 1px solid #111827;
            padding: 6px 8px;
            vertical-align: top;
          }
          th {
            background: #e5e7eb;
            text-align: center;
            font-weight: 700;
          }
          .item-note {
            color: #64748b;
            font-size: 10px;
            font-weight: 700;
          }
          tbody tr { height: 29px; }
          .center-cell { text-align: center; }
          .amount-cell { text-align: center; white-space: nowrap; }
          .bottom-grid {
            display: grid;
            grid-template-columns: 78mm 1fr;
            gap: 18mm;
            padding: 16px 22px 14px;
            align-items: start;
          }
          .summary-table {
            width: 100%;
            margin: 0;
          }
          .summary-table td {
            height: 25px;
            padding: 5px 8px;
          }
          .summary-table td:first-child {
            text-align: right;
            font-weight: 600;
          }
          .summary-table td:last-child {
            text-align: right;
            white-space: nowrap;
          }
          .total-row td {
            font-weight: 800;
            font-size: 13px;
          }
          .received {
            margin-top: 16px;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <main class="receipt">
          <header class="header">
            <div class="brand">
              <div class="brand-name">${escapeReceiptText(RECEIPT_BUSINESS_INFO.businessName)}</div>
              <div class="tin">${escapeReceiptText(RECEIPT_BUSINESS_INFO.tin)}</div>
              <div class="proprietor">${escapeReceiptText(RECEIPT_BUSINESS_INFO.proprietor)}</div>
              <div class="address">${branchAddress}</div>
              <div class="contact">${escapeReceiptText(RECEIPT_BUSINESS_INFO.contact)}</div>
            </div>
            <div class="invoice-block">
              <div class="sales-label">${escapeReceiptText(documentPrefix)}</div>
              <div class="invoice-title">${escapeReceiptText(documentTitle)}</div>
              <div class="invoice-number">${escapeReceiptText(documentNumberLabel)}: ${safeDocumentNumber}</div>
              ${originalSaleLine}
            </div>
          </header>

          <section class="meta-row">
            <div class="check-lines">
              <div class="check-line"><span class="box">${cashChecked ? '&#10003;' : ''}</span> CASH SALES</div>
              <div class="check-line"><span class="box">${chargeChecked ? '&#10003;' : ''}</span> CHARGE SALES</div>
            </div>
            <div class="date-box"><strong>Date:</strong><span>${receiptDate}</span></div>
            ${receiptEncodedDate ? `<div class="date-box"><strong>Encoded Date:</strong><span>${receiptEncodedDate}</span></div>` : ''}
          </section>

          <section class="sold-to">
            <div class="sold-to-title">SOLD TO:</div>
            <div class="sold-to-body">
              <div class="sold-line"><span>Registered Name :</span><strong>${customerName}</strong></div>
              <div class="sold-line"><span>TIN :</span><span>${escapeReceiptText(getReceiptCustomerTin(sale))}</span></div>
              <div class="sold-line"><span>Business Address :</span><span>${escapeReceiptText(getReceiptCustomerAddress(sale))}</span></div>
            </div>
          </section>

          <table aria-label="Sold items">
            <thead>
              <tr>
                <th>Item Description /<br>Nature of Service</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          <section class="bottom-grid">
            <div>
              <table class="summary-table">
                <tbody>
                  <tr><td>VATable Sales</td><td>${escapeReceiptText(formatCurrency(receiptVat.vatableSales))}</td></tr>
                  <tr><td>VAT</td><td>${escapeReceiptText(formatCurrency(receiptVat.vatAmount))}</td></tr>
                  <tr><td>Zero-Rated Sales</td><td>${escapeReceiptText(formatCurrency(0))}</td></tr>
                  <tr><td>VAT-Exempt Sales</td><td>${escapeReceiptText(formatCurrency(0))}</td></tr>
                </tbody>
              </table>
              <div class="received">Received the amount of ${escapeReceiptText(formatCurrency(sale.amountReceived ?? sale.totalAmount))} via ${escapeReceiptText(paymentMethodLabels[sale.paymentMethod] || 'Cash')}.</div>
            </div>
            <div>
              <table class="summary-table">
                <tbody>
                  <tr><td>Sales Subtotal</td><td>${escapeReceiptText(formatCurrency(sale.subtotalAmount ?? sale.totalAmount))}</td></tr>
                  <tr><td>Less: Discount</td><td>${escapeReceiptText(formatCurrency(sale.discountAmount))}</td></tr>
                  <tr><td>Total Sales<br><small>(VAT Inclusive)</small></td><td>${escapeReceiptText(formatCurrency(taxableSalesAmount))}</td></tr>
                  <tr><td>Less: VAT</td><td>${escapeReceiptText(formatCurrency(receiptVat.vatAmount))}</td></tr>
                  <tr><td>Amount: Net of VAT</td><td>${escapeReceiptText(formatCurrency(receiptVat.vatableSales))}</td></tr>
                  <tr><td>Add: VAT</td><td>${escapeReceiptText(formatCurrency(receiptVat.vatAmount))}</td></tr>
                  <tr><td>Add: Delivery Charge</td><td>${escapeReceiptText(formatCurrency(sale.deliveryCharge))}</td></tr>
                  <tr class="total-row"><td>TOTAL AMOUNT DUE</td><td>${escapeReceiptText(formatCurrency(sale.totalAmount))}</td></tr>
                  <tr><td>Change</td><td>${escapeReceiptText(formatCurrency(sale.changeAmount))}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          ${getSaleRemarksText(sale) ? `
            <section style="padding: 0 22px 14px;">
              <strong>Remarks:</strong> ${escapeReceiptText(getSaleRemarksText(sale))}
            </section>
          ` : ''}
        </main>
        <script>
          window.addEventListener('load', () => {
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>
  `);
  receiptWindow.document.close();
  return true;
};

const getSalePrimaryItemText = sale => {
  if (!sale?.items?.length) return 'No item details recorded';
  const firstItem = sale.items[0];
  const extraCount = sale.items.length - 1;
  const quantityLabel = isRefundSalesRecord(sale) ? 'refunded' : 'sold';
  return `${firstItem.itemName} (${getDisplayQuantity(firstItem.quantitySold)} ${quantityLabel})${extraCount > 0 ? `, +${extraCount} more` : ''}`;
};

const getRemainingRefundQuantity = item =>
  Math.max(0, Number(item?.quantitySold || 0) - Number(item?.refundedQuantity || 0));

const getRemainingRefundAmount = item =>
  Math.max(0, Number((Number(item?.subtotal || 0) - Number(item?.refundedAmount || 0)).toFixed(2)));

const hasRefundedSaleItems = sale =>
  (sale?.items || []).some(item => Number(item?.refundedQuantity || 0) > 0 || Number(item?.refundedAmount || 0) > 0);

// Centralizes refund limit wording so real-time validation and final checks stay consistent.
const getRefundableQuantityLimitMessage = maxQuantity =>
  `Only ${maxQuantity} unit${Number(maxQuantity) === 1 ? ' is' : 's are'} refundable for this item.`;

const getRefundAmountForQuantity = (line, quantity) => {
  const cleanQuantity = Math.max(0, Number(quantity || 0));
  if (cleanQuantity <= 0) return '';
  const computedAmount = Math.min(Number(line.maxAmount || 0), Number((cleanQuantity * Number(line.unitPrice || 0)).toFixed(2)));
  return computedAmount > 0 ? computedAmount.toFixed(2) : '';
};

const notifyNumbersOnly = (fieldName, toastId) => {
  toast.warning(`${fieldName} accepts numbers only.`, {
    id: toastId,
    duration: 2500
  });
};

const sanitizeWholeNumberInput = (value, fieldName, toastId) => {
  const rawValue = String(value || '');
  const cleaned = rawValue.replace(/\D/g, '');
  if (rawValue !== cleaned) {
    notifyNumbersOnly(fieldName, toastId);
  }
  return cleaned;
};

const sanitizeDecimalInput = (value, fieldName, toastId) => {
  const rawValue = String(value || '');
  if (/[^0-9.]/.test(rawValue) || (rawValue.match(/\./g) || []).length > 1) {
    notifyNumbersOnly(fieldName, toastId);
  }
  const cleaned = String(value || '').replace(/[^\d.]/g, '');
  const [whole = '', ...decimalParts] = cleaned.split('.');
  const decimals = decimalParts.join('').slice(0, 2);
  return decimalParts.length > 0 ? `${whole}.${decimals}` : whole;
};

const sanitizePriceInput = value =>
  sanitizeDecimalInput(value, 'Unit price', 'sales-unit-price-numbers-only');

const sanitizePaymentReferenceInput = value => {
  const rawValue = String(value || '');
  if (/[^A-Za-z0-9 ._#/-]/.test(rawValue)) {
    toast.warning('Payment reference may only contain letters, numbers, spaces, dash, slash, period, underscore, or #.', {
      id: 'sales-payment-reference-characters'
    });
  }
  return rawValue.replace(/[^A-Za-z0-9 ._#/-]/g, '').slice(0, 120);
};

const sanitizeInvoiceNumberInput = value =>
  String(value || '').replace(/\D/g, '').slice(0, 6);

const getOfficialInvoiceSequence = value => {
  const cleanValue = String(value || '').trim();
  if (!OFFICIAL_INVOICE_NUMBER_PATTERN.test(cleanValue)) return null;
  const sequence = Number.parseInt(cleanValue, 10);
  return sequence >= OFFICIAL_INVOICE_MIN_SEQUENCE && sequence <= OFFICIAL_INVOICE_MAX_SEQUENCE
    ? sequence
    : null;
};

const formatInvoiceRange = (startInvoiceNumber, endSequenceNumber) => {
  const cleanStart = sanitizeInvoiceNumberInput(startInvoiceNumber);
  const cleanEnd = String(Number(endSequenceNumber || 0)).padStart(6, '0');
  if (!OFFICIAL_INVOICE_NUMBER_PATTERN.test(cleanStart) || !OFFICIAL_INVOICE_NUMBER_PATTERN.test(cleanEnd)) {
    return cleanStart || cleanEnd;
  }
  return cleanStart === cleanEnd ? cleanStart : `${cleanStart}–${cleanEnd}`;
};

const isValidMoneyText = value =>
  String(value || '').trim() === '' || /^\d+(\.\d{0,2})?$/.test(String(value).trim());

const normalizeProductSearchText = value =>
  String(value || '')
    .toLowerCase()
    .replace(/[°]/g, ' ')
    .replace(/[^a-z0-9./#&"+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getSaleProductSearchText = item =>
  normalizeProductSearchText([
    item.itemCode,
    item.name,
    item.category,
    item.supplierName,
    item.status,
    item.defaultSellingPrice
  ].filter(Boolean).join(' '));

export function SalesModule({ user }) {
  const { inventory, salesTransactions, recordSale, refundSale, cancelSale, getNextSalesInvoiceNumber } = useData();
  const [officialInvoiceNumber, setOfficialInvoiceNumber] = useState('');
  const [invoiceSequenceExceptionReason, setInvoiceSequenceExceptionReason] = useState('');
  const [suggestedOfficialInvoiceNumber, setSuggestedOfficialInvoiceNumber] = useState('');
  const [isLoadingInvoiceSuggestion, setIsLoadingInvoiceSuggestion] = useState(false);
  const [hasManualInvoiceEntry, setHasManualInvoiceEntry] = useState(false);
  const [autoFilledInvoiceNumber, setAutoFilledInvoiceNumber] = useState('');
  const [customerType, setCustomerType] = useState('walk_in');
  const [isCustomerTypeOpen, setIsCustomerTypeOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerTin, setCustomerTin] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountType, setDiscountType] = useState('none');
  const [discountAmount, setDiscountAmount] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentConfirmedAmount, setPaymentConfirmedAmount] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [actualTransactionAt, setActualTransactionAt] = useState('');
  const [backdateReason, setBackdateReason] = useState('');
  const [saleLines, setSaleLines] = useState([emptySaleLine()]);
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isInvoiceSequenceConfirmOpen, setIsInvoiceSequenceConfirmOpen] = useState(false);
  const [isNonInventoryDialogOpen, setIsNonInventoryDialogOpen] = useState(false);
  const [nonInventoryDraft, setNonInventoryDraft] = useState(DEFAULT_NON_INVENTORY_DRAFT);
  const [nonInventorySessionCount, setNonInventorySessionCount] = useState(0);
  const [editingNonInventoryLineIndex, setEditingNonInventoryLineIndex] = useState(null);
  const [saleToCancel, setSaleToCancel] = useState(null);
  const [saleToRefund, setSaleToRefund] = useState(null);
  const [refundLines, setRefundLines] = useState([]);
  const [refundReason, setRefundReason] = useState('');
  const [refundActualTransactionAt, setRefundActualTransactionAt] = useState('');
  const [refundBackdateReason, setRefundBackdateReason] = useState('');
  const [completedSale, setCompletedSale] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancellingSale, setIsCancellingSale] = useState(false);
  const [isRefundingSale, setIsRefundingSale] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('all');
  const [productSort, setProductSort] = useState('name_az');
  const [productPage, setProductPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState('all');
  const [selectedHistorySaleId, setSelectedHistorySaleId] = useState('');
  const [isClearItemsConfirmOpen, setIsClearItemsConfirmOpen] = useState(false);
  const canCancelSales = isAdminRole(user?.role);
  const canRefundSales = canRecordSales(user?.role);
  const findInventoryItemByExactSalesName = itemName => {
    const normalizedItemName = normalizeSalesInventoryIdentityName(itemName);
    if (!normalizedItemName) return null;
    return inventory.find(item => normalizeSalesInventoryIdentityName(item.name) === normalizedItemName) || null;
  };

  const handleActualTransactionAtChange = value => {
    setActualTransactionAt(value);
    if (isPastTransactionDate(value)) {
      toast.info('This sale will be saved as a backdated transaction.', {
        description: 'Reports will use the transaction date. Audit trail will keep the encoded date.'
      });
    }
  };

  useEffect(() => {
    const applyHistoryTarget = ({ period } = {}) => {
      const safePeriod = ['all', 'today', 'week', 'month'].includes(period) ? period : 'all';
      setHistoryPeriod(safePeriod);
      setHistorySearch('');
      setSelectedHistorySaleId('');
      setIsHistoryOpen(true);
    };

    const storedPeriod = localStorage.getItem('sales_history_target_period');
    if (storedPeriod) {
      applyHistoryTarget({ period: storedPeriod });
      localStorage.removeItem('sales_history_target_period');
    }

    const handleHistoryTarget = event => {
      applyHistoryTarget(event.detail || {});
      localStorage.removeItem('sales_history_target_period');
    };

    window.addEventListener('sales-history-target-view', handleHistoryTarget);
    return () => window.removeEventListener('sales-history-target-view', handleHistoryTarget);
  }, []);

  useEffect(() => {
    const applyEntryTarget = () => {
      localStorage.removeItem('sales_history_target_period');
      setIsHistoryOpen(false);
      setHistorySearch('');
      setSelectedHistorySaleId('');
    };

    if (localStorage.getItem('sales_entry_target') === 'true') {
      applyEntryTarget();
      localStorage.removeItem('sales_entry_target');
    }

    const handleEntryTarget = () => {
      applyEntryTarget();
      localStorage.removeItem('sales_entry_target');
    };

    window.addEventListener('sales-entry-target-view', handleEntryTarget);
    return () => window.removeEventListener('sales-entry-target-view', handleEntryTarget);
  }, []);

  const activeInventory = useMemo(
    () => mergeSort(
      inventory.filter(item => Number(item.quantity || 0) > 0),
      (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    ),
    [inventory]
  );

  const inventorySortedById = useMemo(
    () => mergeSort([...inventory], (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true })),
    [inventory]
  );

  const productCategories = useMemo(() => {
    const inventoryCategories = activeInventory
      .map(item => item.category || 'Uncategorized')
      .filter(Boolean);
    const categorySet = new Set([...OFFICIAL_SALES_CATEGORIES, ...inventoryCategories]);
    return ['all', ...Array.from(categorySet).sort((a, b) => {
      const aIndex = OFFICIAL_SALES_CATEGORIES.indexOf(a);
      const bIndex = OFFICIAL_SALES_CATEGORIES.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }
      return a.localeCompare(b);
    })];
  }, [activeInventory]);

  const filteredSaleInventory = useMemo(() => {
    const searchTerms = normalizeProductSearchText(productSearch).split(' ').filter(Boolean);

    const filteredItems = activeInventory.filter(item => {
      const matchesCategory = productCategory === 'all' || (item.category || 'Uncategorized') === productCategory;
      if (!matchesCategory) return false;
      if (searchTerms.length === 0) return true;

      const searchableText = getSaleProductSearchText(item);
      return searchTerms.every(term => searchableText.includes(term));
    });

    const sorters = {
      name_az: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }),
      name_za: (a, b) => String(b.name || '').localeCompare(String(a.name || ''), undefined, { numeric: true, sensitivity: 'base' }),
      stock_low: (a, b) => Number(a.quantity || 0) - Number(b.quantity || 0),
      stock_high: (a, b) => Number(b.quantity || 0) - Number(a.quantity || 0),
      price_low: (a, b) => Number(a.defaultSellingPrice || 0) - Number(b.defaultSellingPrice || 0),
      price_high: (a, b) => Number(b.defaultSellingPrice || 0) - Number(a.defaultSellingPrice || 0)
    };

    return mergeSort(filteredItems, sorters[productSort] || sorters.name_az);
  }, [activeInventory, productCategory, productSearch, productSort]);

  const productPageCount = Math.max(1, Math.ceil(filteredSaleInventory.length / PRODUCT_PAGE_SIZE));
  const safeProductPage = Math.min(productPage, productPageCount);
  const productPageStartIndex = (safeProductPage - 1) * PRODUCT_PAGE_SIZE;
  const paginatedSaleInventory = filteredSaleInventory.slice(productPageStartIndex, productPageStartIndex + PRODUCT_PAGE_SIZE);
  const productItemStart = filteredSaleInventory.length === 0 ? 0 : productPageStartIndex + 1;
  const productItemEnd = Math.min(productPageStartIndex + PRODUCT_PAGE_SIZE, filteredSaleInventory.length);
  const productPageNumbers = useMemo(() => {
    const maxVisiblePages = 5;
    const endPage = Math.min(productPageCount, Math.max(maxVisiblePages, safeProductPage + 2));
    const startPage = Math.max(1, Math.min(safeProductPage - 2, endPage - maxVisiblePages + 1));
    const adjustedEndPage = Math.min(productPageCount, startPage + maxVisiblePages - 1);

    return Array.from({ length: adjustedEndPage - startPage + 1 }, (_, index) => startPage + index);
  }, [productPageCount, safeProductPage]);

  useEffect(() => {
    setProductPage(1);
  }, [productSearch, productCategory, productSort]);

  useEffect(() => {
    setProductPage(currentPage => Math.min(currentPage, productPageCount));
  }, [productPageCount]);

  const getInventoryById = inventoryId => {
    if (!inventoryId) return null;
    const foundIndex = binarySearch(
      inventorySortedById,
      String(inventoryId),
      (item, target) => String(item.id).localeCompare(String(target), undefined, { numeric: true })
    );
    return foundIndex >= 0 ? inventorySortedById[foundIndex] : null;
  };

  const selectedLineDetails = saleLines.map(line => {
    const item = line.isManual ? null : getInventoryById(line.inventoryId);
    const quantity = line.quantity === '' ? 0 : Number(line.quantity);
    const unitPrice = line.unitPrice === '' ? 0 : Number(line.unitPrice);
    return {
      ...line,
      item,
      itemName: line.isManual ? String(line.itemName || '').trim() : item?.name || '',
      category: line.isManual ? line.category || 'Other' : item?.category || '',
      quantity,
      unitPrice,
      subtotal: Number.isFinite(quantity) && Number.isFinite(unitPrice)
        ? quantity * unitPrice
        : 0
    };
  });
  const cartLines = selectedLineDetails.filter(line => line.isManual ? line.itemName : (line.inventoryId && line.item));

  const totalQuantity = selectedLineDetails.reduce((sum, line) => sum + (Number.isFinite(line.quantity) ? line.quantity : 0), 0);
  const subtotalAmount = selectedLineDetails.reduce((sum, line) => sum + (Number.isFinite(line.subtotal) ? line.subtotal : 0), 0);
  const selectedDiscountOption = discountOptions[discountType] || discountOptions.none;
  const parsedCustomDiscountAmount = discountAmount === '' ? 0 : Number(discountAmount);
  const safeCustomDiscountAmount = Number.isFinite(parsedCustomDiscountAmount) ? parsedCustomDiscountAmount : 0;
  const safeDiscountAmount = selectedDiscountOption.manual
    ? safeCustomDiscountAmount
    : Number((subtotalAmount * selectedDiscountOption.rate).toFixed(2));
  const parsedDeliveryCharge = deliveryCharge === '' ? 0 : Number(deliveryCharge);
  const safeDeliveryCharge = Number.isFinite(parsedDeliveryCharge) ? parsedDeliveryCharge : 0;
  const taxableSalesAmount = Math.max(Number((subtotalAmount - safeDiscountAmount).toFixed(2)), 0);
  const totalAmount = Math.max(Number((taxableSalesAmount + safeDeliveryCharge).toFixed(2)), 0);
  const { vatableSales, vatAmount } = computeVatBreakdown(taxableSalesAmount);
  const parsedAmountReceived = amountReceived === '' ? 0 : Number(amountReceived);
  const safeAmountReceived = Number.isFinite(parsedAmountReceived) ? parsedAmountReceived : 0;
  const needsPaymentConfirmation = requiresPaymentConfirmation(paymentMethod);
  const changeAmount = paymentMethod === 'cash' && safeAmountReceived >= totalAmount
    ? safeAmountReceived - totalAmount
    : 0;

  useEffect(() => {
    if (!needsPaymentConfirmation || !paymentConfirmed || paymentConfirmedAmount === null) return;

    const verifiedAmount = Number(paymentConfirmedAmount);
    const currentAmountDue = Number(totalAmount.toFixed(2));
    if (verifiedAmount !== currentAmountDue) {
      setPaymentConfirmed(false);
      setPaymentConfirmedAmount(null);
    }
  }, [needsPaymentConfirmation, paymentConfirmed, paymentConfirmedAmount, totalAmount]);

  const sortedSales = useMemo(
    () => [...(salesTransactions || [])]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [salesTransactions]
  );
  const cleanOfficialInvoiceNumber = officialInvoiceNumber.trim();
  const cleanInvoiceSequenceExceptionReason = invoiceSequenceExceptionReason.trim();
  useEffect(() => {
    let isMounted = true;

    const loadNextInvoiceNumber = async () => {
      if (typeof getNextSalesInvoiceNumber !== 'function') return;
      setIsLoadingInvoiceSuggestion(true);
      try {
        const invoiceNumber = sanitizeInvoiceNumberInput(await getNextSalesInvoiceNumber());
        if (isMounted) {
          setSuggestedOfficialInvoiceNumber(OFFICIAL_INVOICE_NUMBER_PATTERN.test(invoiceNumber) ? invoiceNumber : '');
        }
      } catch (error) {
        console.error('Failed to load suggested Sales Invoice Number:', error);
        if (isMounted) {
          setSuggestedOfficialInvoiceNumber('');
        }
      } finally {
        if (isMounted) {
          setIsLoadingInvoiceSuggestion(false);
        }
      }
    };

    loadNextInvoiceNumber();
    return () => {
      isMounted = false;
    };
  }, [getNextSalesInvoiceNumber, salesTransactions.length]);

  useEffect(() => {
    const currentInvoiceNumber = officialInvoiceNumber.trim();
    if (
      isSaving ||
      hasManualInvoiceEntry ||
      !OFFICIAL_INVOICE_NUMBER_PATTERN.test(suggestedOfficialInvoiceNumber)
    ) {
      return;
    }

    if (currentInvoiceNumber && currentInvoiceNumber !== autoFilledInvoiceNumber) {
      return;
    }

    if (currentInvoiceNumber === suggestedOfficialInvoiceNumber) {
      setAutoFilledInvoiceNumber(suggestedOfficialInvoiceNumber);
      return;
    }

    setOfficialInvoiceNumber(suggestedOfficialInvoiceNumber);
    setAutoFilledInvoiceNumber(suggestedOfficialInvoiceNumber);
  }, [autoFilledInvoiceNumber, hasManualInvoiceEntry, isSaving, officialInvoiceNumber, suggestedOfficialInvoiceNumber]);

  const suggestedInvoiceSequenceNumber = getOfficialInvoiceSequence(suggestedOfficialInvoiceNumber);
  const enteredInvoiceSequenceNumber = getOfficialInvoiceSequence(cleanOfficialInvoiceNumber);
  const isOfficialInvoiceBehindSequence = Boolean(
    suggestedInvoiceSequenceNumber &&
    enteredInvoiceSequenceNumber &&
    enteredInvoiceSequenceNumber < suggestedInvoiceSequenceNumber
  );
  const isOfficialInvoiceSkippingSequence = Boolean(
    suggestedInvoiceSequenceNumber &&
    enteredInvoiceSequenceNumber &&
    enteredInvoiceSequenceNumber > suggestedInvoiceSequenceNumber
  );
  const skippedInvoiceCount = isOfficialInvoiceSkippingSequence
    ? enteredInvoiceSequenceNumber - suggestedInvoiceSequenceNumber
    : 0;
  const skippedInvoiceRangeText = isOfficialInvoiceSkippingSequence
    ? skippedInvoiceCount === 1
      ? suggestedOfficialInvoiceNumber
      : formatInvoiceRange(suggestedOfficialInvoiceNumber, enteredInvoiceSequenceNumber - 1)
    : '';

  useEffect(() => {
    if (!isOfficialInvoiceSkippingSequence && invoiceSequenceExceptionReason) {
      setInvoiceSequenceExceptionReason('');
    }
  }, [invoiceSequenceExceptionReason, isOfficialInvoiceSkippingSequence]);

  const duplicateOfficialInvoiceSale = useMemo(() => {
    if (!OFFICIAL_INVOICE_NUMBER_PATTERN.test(cleanOfficialInvoiceNumber)) return null;
    return (salesTransactions || []).find(sale =>
      sale.transactionType !== 'refund' &&
      String(sale.officialInvoiceNumber || '').trim() === cleanOfficialInvoiceNumber
    ) || null;
  }, [cleanOfficialInvoiceNumber, salesTransactions]);
  const hasDuplicateOfficialInvoiceNumber = Boolean(duplicateOfficialInvoiceSale);
  const expectedOfficialInvoiceNumber = OFFICIAL_INVOICE_NUMBER_PATTERN.test(suggestedOfficialInvoiceNumber)
    ? suggestedOfficialInvoiceNumber
    : '';
  const isExpectedInvoiceSelected = Boolean(expectedOfficialInvoiceNumber) && cleanOfficialInvoiceNumber === expectedOfficialInvoiceNumber;
  const invoiceNumberGuidanceText = isLoadingInvoiceSuggestion
    ? 'Checking the next Sales Invoice No. for this branch...'
    : hasDuplicateOfficialInvoiceNumber
      ? 'This SI number is already recorded. Enter the correct unused number from the physical booklet.'
      : expectedOfficialInvoiceNumber
      ? isExpectedInvoiceSelected
        ? `Auto-filled next expected SI No. ${expectedOfficialInvoiceNumber}. Confirm it matches the physical booklet.`
        : `Next expected SI No. is ${expectedOfficialInvoiceNumber}. Continue only if the physical booklet shows a different valid number.`
      : 'Enter the 6-digit SI number printed on the physical booklet.';
  const shouldShowInvoiceSequenceNote = isOfficialInvoiceSkippingSequence && !hasDuplicateOfficialInvoiceNumber;
  useEffect(() => {
    if (!shouldShowInvoiceSequenceNote && invoiceSequenceExceptionReason) {
      setInvoiceSequenceExceptionReason('');
    }
  }, [invoiceSequenceExceptionReason, shouldShowInvoiceSequenceNote]);
  const hasManualOfficialInvoiceValue =
    officialInvoiceNumber.trim() !== '' &&
    (hasManualInvoiceEntry || officialInvoiceNumber.trim() !== autoFilledInvoiceNumber);

  const hasSalesFormInput = useMemo(() => (
    hasManualOfficialInvoiceValue ||
    invoiceSequenceExceptionReason.trim() !== '' ||
    customerType !== 'walk_in' ||
    customerName.trim() !== '' ||
    customerTin.trim() !== '' ||
    customerAddress.trim() !== '' ||
    remarks.trim() !== '' ||
    paymentMethod !== 'cash' ||
    discountType !== 'none' ||
    String(discountAmount || '').trim() !== '' ||
    String(deliveryCharge || '').trim() !== '' ||
    String(amountReceived || '').trim() !== '' ||
    String(paymentReference || '').trim() !== '' ||
    paymentConfirmed ||
    saleLines.some(line => (
      String(line.inventoryId || '').trim() !== '' ||
      String(line.itemName || '').trim() !== '' ||
      String(line.quantity || '').trim() !== '' ||
      String(line.unitPrice || '').trim() !== ''
    ))
  ), [amountReceived, customerAddress, customerName, customerTin, customerType, deliveryCharge, discountAmount, discountType, hasManualOfficialInvoiceValue, invoiceSequenceExceptionReason, paymentConfirmed, paymentMethod, paymentReference, remarks, saleLines]);

  const filteredSalesHistory = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const matchesPeriod = sale => {
      if (historyPeriod === 'all') return true;
      const saleDate = new Date(sale.createdAt || 0);
      if (Number.isNaN(saleDate.getTime())) return false;
      if (historyPeriod === 'today') return saleDate >= startOfToday;
      if (historyPeriod === 'week') return saleDate >= startOfWeek;
      if (historyPeriod === 'month') return saleDate >= startOfMonth;
      return true;
    };

    const periodFilteredSales = sortedSales.filter(matchesPeriod);
    const query = historySearch.trim().toLowerCase();
    if (!query) return periodFilteredSales;

    return periodFilteredSales.filter(sale => {
      const searchableText = [
        sale.salesNumber,
        sale.officialInvoiceNumber,
        sale.referenceOfficialInvoiceNumber,
        sale.referenceSalesNumber,
        customerTypeLabels[sale.customerType],
        sale.customerName,
        sale.customerTin,
        sale.customerAddress,
        paymentMethodLabels[sale.paymentMethod],
        sale.discountLabel,
        getDiscountLabel(sale),
        sale.soldByName,
        sale.remarks,
        sale.subtotalAmount,
        sale.discountAmount,
        sale.totalAmount,
        sale.amountReceived,
        sale.changeAmount,
        sale.paymentReference,
        sale.paymentConfirmedBy,
        formatDateTime(sale.createdAt),
        formatDateTime(sale.encodedAt),
        sale.backdateReason,
        ...(sale.items || []).flatMap(item => [
          item.itemName,
          item.category,
          item.categoryNote,
          item.quantitySold,
          item.subtotal
        ])
      ]
        .filter(value => value !== null && value !== undefined)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [historyPeriod, historySearch, sortedSales]);

  const selectedHistorySale = useMemo(() => {
    if (!selectedHistorySaleId) return null;
    return filteredSalesHistory.find(sale => sale.id === selectedHistorySaleId) || null;
  }, [filteredSalesHistory, selectedHistorySaleId]);

  const updateLine = (index, key, value) => {
    setSaleLines(prev => prev.map((line, lineIndex) => (
      lineIndex === index ? { ...line, [key]: value } : line
    )));
  };

  const updateLineQuantity = (index, rawValue) => {
    setSaleLines(prev => prev.map((line, lineIndex) => {
      if (lineIndex !== index) return line;

      if (rawValue === '') {
        return { ...line, quantity: '' };
      }

      const selectedItem = line.isManual ? null : activeInventory.find(item => String(item.id) === String(line.inventoryId));
      if (line.isManual) {
        const requestedQuantity = Number(rawValue);
        if (Number.isFinite(requestedQuantity) && requestedQuantity <= 0) {
          toast.warning('Quantity must be at least 1.', { id: `sales-manual-min-quantity-${index}` });
          return { ...line, quantity: '1' };
        }
        return { ...line, quantity: rawValue };
      }
      if (!selectedItem) {
        toast.info('Select an item before entering quantity.');
        return line;
      }

      const availableStock = Number(selectedItem.quantity || 0);
      const requestedQuantity = Number(rawValue);

      if (Number.isFinite(requestedQuantity) && requestedQuantity <= 0) {
        toast.warning('Quantity must be at least 1. Use the remove button if the item is not being sold.', {
          id: `sales-min-quantity-${selectedItem.id}`
        });
        return {
          ...line,
          quantity: '1'
        };
      }

      if (Number.isFinite(requestedQuantity) && requestedQuantity > availableStock) {
        toast.warning(`${selectedItem.name} has only ${availableStock} unit${availableStock === 1 ? '' : 's'} available.`, {
          id: `sales-stock-limit-${selectedItem.id}`
        });
        return {
          ...line,
          quantity: String(availableStock)
        };
      }

      return { ...line, quantity: rawValue };
    }));
  };

  const updateLineInventoryItem = (index, inventoryId) => {
    const selectedItem = activeInventory.find(item => String(item.id) === String(inventoryId));
    const defaultPrice = Number(selectedItem?.defaultSellingPrice || 0);

    setSaleLines(prev => prev.map((line, lineIndex) => (
      lineIndex === index
        ? {
            ...line,
          inventoryId,
          isManual: false,
          itemName: '',
          category: selectedItem?.category || 'Other',
          categoryNote: selectedItem?.categoryNote || '',
          unitPrice: defaultPrice > 0 ? defaultPrice.toFixed(2) : ''
          }
        : line
    )));
  };

  const updateLineUnitPrice = (index, rawValue) => {
    const nextValue = sanitizePriceInput(rawValue);
    setSaleLines(prev => prev.map((line, lineIndex) => (
      lineIndex === index ? { ...line, unitPrice: nextValue } : line
    )));
  };

  const normalizeLineUnitPrice = index => {
    const line = saleLines[index];
    if (!line) return;

    const rawPrice = String(line.unitPrice || '').trim();
    if (!rawPrice) return;

    if (!isValidMoneyText(rawPrice)) {
      toast.error('Unit price must be a valid amount with up to 2 decimal places.');
      return;
    }

    const parsedPrice = Number(rawPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      toast.error('Unit price must be greater than zero.');
      return;
    }

    const normalizedPrice = parsedPrice.toFixed(2);
    setSaleLines(prev => prev.map((currentLine, lineIndex) => (
      lineIndex === index ? { ...currentLine, unitPrice: normalizedPrice } : currentLine
    )));

    if (!line.isManual) {
      const selectedItem = getInventoryById(line.inventoryId);
      const defaultPrice = Number(selectedItem?.defaultSellingPrice || 0);
      if (defaultPrice > 0 && Math.abs(defaultPrice - parsedPrice) > 0.009) {
        toast.info('Unit price adjusted for this sale only.', {
          id: `sales-price-adjusted-${line.inventoryId || index}`,
          description: 'Inventory SRP will stay unchanged unless it is edited from Inventory.'
        });
      }
    }
  };

  const addLine = () => {
    setSaleLines(prev => [...prev, emptySaleLine()]);
  };

  const getNonInventoryCategories = () => (
    productCategories
      .filter(category => category !== 'all')
      .concat(productCategories.includes('Other') ? [] : ['Other'])
  );

  const openNonInventoryDialog = () => {
    const typedSearch = productSearch.trim().replace(/\s+/g, ' ').slice(0, 150);
    setNonInventoryDraft({
      ...DEFAULT_NON_INVENTORY_DRAFT,
      itemName: typedSearch,
      category: productCategory !== 'all' ? productCategory : 'Other'
    });
    setNonInventorySessionCount(0);
    setEditingNonInventoryLineIndex(null);
    setIsNonInventoryDialogOpen(true);
  };

  const addManualLine = () => {
    openNonInventoryDialog();
  };

  const closeNonInventoryDialog = () => {
    setIsNonInventoryDialogOpen(false);
    setNonInventoryDraft(DEFAULT_NON_INVENTORY_DRAFT);
    setNonInventorySessionCount(0);
    setEditingNonInventoryLineIndex(null);
  };

  const handleNonInventoryDialogOpenChange = open => {
    if (open) {
      setIsNonInventoryDialogOpen(true);
      return;
    }
    closeNonInventoryDialog();
  };

  const openEditNonInventoryLine = index => {
    const line = saleLines[index];
    if (!line?.isManual || isSaving) return;

    setNonInventoryDraft({
      itemName: String(line.itemName || '').trim(),
      category: line.category || 'Other',
      categoryNote: line.category === 'Other' ? line.categoryNote || '' : '',
      quantity: String(line.quantity || '1'),
      unitPrice: String(line.unitPrice || '')
    });
    setNonInventorySessionCount(0);
    setEditingNonInventoryLineIndex(index);
    setIsNonInventoryDialogOpen(true);
  };

  const updateNonInventoryDraft = (key, value) => {
    setNonInventoryDraft(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const confirmAddNonInventoryItem = ({ keepOpen = false } = {}) => {
    const isEditingNonInventoryItem = editingNonInventoryLineIndex !== null;
    const itemName = nonInventoryDraft.itemName.trim().replace(/\s+/g, ' ');
    const normalizedName = itemName.toLowerCase();
    const quantity = Number(nonInventoryDraft.quantity);
    const unitPrice = Number(nonInventoryDraft.unitPrice);

    if (!itemName) {
      toast.error('Enter the non-inventory item description.');
      return;
    }

    if (itemName.length > 150) {
      toast.error('Item description must be 150 characters or fewer.');
      return;
    }

    if (VAGUE_NON_INVENTORY_NAMES.has(normalizedName)) {
      toast.error('Use the specific item name, not only "Other".');
      return;
    }

    if (!/[A-Za-z0-9]/.test(itemName)) {
      toast.error('Item description must include letters or numbers.');
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error('Quantity must be a whole number greater than zero.');
      return;
    }

    if (!isValidMoneyText(nonInventoryDraft.unitPrice) || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      toast.error('Unit price must be a valid amount greater than zero.');
      return;
    }

    const existingInventoryItem = findInventoryItemByExactSalesName(itemName);
    if (existingInventoryItem) {
      const isOutOfStock = Number(existingInventoryItem.quantity || 0) <= 0 || existingInventoryItem.status === 'Out of Stock';
      toast.error('This item already exists in Inventory', {
        description: isOutOfStock
          ? `"${existingInventoryItem.name}" is currently out of stock. Use Stock In or Purchase Entry before selling it, instead of adding it as non-inventory.`
          : `"${existingInventoryItem.name}" is an inventory item. Add it from Select Items so stock is deducted correctly.`
      });
      return;
    }

    const preparedLine = {
      ...emptySaleLine(),
      isManual: true,
      itemName,
      category: nonInventoryDraft.category || 'Other',
      categoryNote: (nonInventoryDraft.category || 'Other') === 'Other'
        ? String(nonInventoryDraft.categoryNote || '').trim().slice(0, 240)
        : '',
      quantity: String(quantity),
      unitPrice: unitPrice.toFixed(2)
    };

    if (isEditingNonInventoryItem) {
      setSaleLines(prev => prev.map((line, lineIndex) => (
        lineIndex === editingNonInventoryLineIndex ? preparedLine : line
      )));
      closeNonInventoryDialog();
      toast.success('Non-inventory item updated.', {
        description: 'The selected item was corrected without re-entering the sale.'
      });
      return;
    }

    setSaleLines(prev => {
      const emptyIndex = prev.findIndex(line => (
        !String(line.inventoryId || '').trim() &&
        !String(line.itemName || '').trim() &&
        !String(line.quantity || '').trim() &&
        !String(line.unitPrice || '').trim()
      ));

      if (emptyIndex >= 0) {
        return prev.map((line, lineIndex) => lineIndex === emptyIndex ? preparedLine : line);
      }
      return [...prev, preparedLine];
    });

    if (keepOpen) {
      setNonInventorySessionCount(count => count + 1);
      setNonInventoryDraft({
        ...DEFAULT_NON_INVENTORY_DRAFT,
        category: nonInventoryDraft.category || 'Other',
        categoryNote: (nonInventoryDraft.category || 'Other') === 'Other'
          ? nonInventoryDraft.categoryNote || ''
          : ''
      });
      toast.success('Non-inventory item added.', {
        description: 'Enter the next manual item or tap Done when finished.'
      });
      return;
    }

    closeNonInventoryDialog();
    toast.success('Non-inventory item added to selected items.', {
      description: 'It will be counted in sales without deducting inventory stock.'
    });
  };

  const addInventoryItemToSale = item => {
    if (!item || isSaving) return;

    const inventoryId = String(item.id);
    const existingLine = saleLines.find(line => String(line.inventoryId) === inventoryId);
    if (existingLine) {
      toast.info('This item has already been added. Adjust the quantity in Selected Items.', {
        id: `sales-item-already-added-${inventoryId}`
      });
      return;
    }

    const availableStock = Number(item.quantity || 0);
    if (availableStock <= 0) {
      toast.warning(`${item.name} is out of stock and cannot be added to the sale.`);
      return;
    }

    const defaultPrice = Number(item.defaultSellingPrice || 0);
    const preparedLine = {
      inventoryId,
      quantity: '1',
      unitPrice: defaultPrice > 0 ? defaultPrice.toFixed(2) : ''
    };

    setSaleLines(prev => {
      const emptyIndex = prev.findIndex(line => (
        !String(line.inventoryId || '').trim() &&
        !String(line.itemName || '').trim() &&
        !String(line.quantity || '').trim() &&
        !String(line.unitPrice || '').trim()
      ));

      if (emptyIndex >= 0) {
        return prev.map((line, lineIndex) => lineIndex === emptyIndex ? preparedLine : line);
      }

      return [...prev, preparedLine];
    });
  };

  const adjustLineQuantity = (index, change) => {
    setSaleLines(prev => prev.map((line, lineIndex) => {
      if (lineIndex !== index) return line;

      const selectedItem = line.isManual ? null : activeInventory.find(item => String(item.id) === String(line.inventoryId));
      if (line.isManual) {
        const currentQuantity = Number(line.quantity || 0);
        return { ...line, quantity: String(Math.max(1, currentQuantity + change)) };
      }
      if (!selectedItem) {
        toast.info('Select an item before changing the quantity.');
        return line;
      }

      const availableStock = Number(selectedItem.quantity || 0);
      const currentQuantity = Number(line.quantity || 0);
      const nextQuantity = Math.max(1, currentQuantity + change);

      if (nextQuantity > availableStock) {
        toast.warning(`${selectedItem.name} has only ${availableStock} unit${availableStock === 1 ? '' : 's'} available.`, {
          id: `sales-stock-limit-${selectedItem.id}`
        });
        return line;
      }

      return { ...line, quantity: String(nextQuantity) };
    }));
  };

  const removeLine = index => {
    setSaleLines(prev => {
      if (prev.length === 1) {
        return [emptySaleLine()];
      }
      return prev.filter((_, lineIndex) => lineIndex !== index);
    });
  };

  const resetForm = () => {
    setOfficialInvoiceNumber('');
    setHasManualInvoiceEntry(false);
    setAutoFilledInvoiceNumber('');
    setInvoiceSequenceExceptionReason('');
    setCustomerType('walk_in');
    setCustomerName('');
    setCustomerTin('');
    setCustomerAddress('');
    setPaymentMethod('cash');
    setDiscountType('none');
    setDiscountAmount('');
    setDeliveryCharge('');
    setAmountReceived('');
    setPaymentReference('');
    setPaymentConfirmed(false);
    setPaymentConfirmedAmount(null);
    setRemarks('');
    setActualTransactionAt('');
    setBackdateReason('');
    setSaleLines([emptySaleLine()]);
    setIsNonInventoryDialogOpen(false);
    setNonInventoryDraft(DEFAULT_NON_INVENTORY_DRAFT);
    setNonInventorySessionCount(0);
    setEditingNonInventoryLineIndex(null);
    setIsInvoiceSequenceConfirmOpen(false);
  };

  const handlePaymentMethodChange = value => {
    setPaymentMethod(value);
    setPaymentReference('');
    setPaymentConfirmed(false);
    setPaymentConfirmedAmount(null);
    if (value !== 'cash') {
      setAmountReceived('');
    }
  };

  const handleDiscountTypeChange = value => {
    setDiscountType(value);
    if (!discountOptions[value]?.manual) {
      setDiscountAmount('');
    }
  };

  const handleClearFormRequest = () => {
    if (isSaving) return;
    if (!hasSalesFormInput) {
      resetForm();
      return;
    }
    setIsClearConfirmOpen(true);
  };

  const confirmClearForm = () => {
    resetForm();
    setIsClearConfirmOpen(false);
    toast.success('Sales form cleared.');
  };

  const handleClearSelectedItemsRequest = () => {
    if (isSaving) return;
    if (cartLines.length === 0) {
      toast.info('No selected items to clear.');
      return;
    }
    setIsClearItemsConfirmOpen(true);
  };

  const confirmClearSelectedItems = () => {
    setSaleLines([emptySaleLine()]);
    setIsClearItemsConfirmOpen(false);
    toast.success('Selected items cleared.');
  };

  const validateSale = () => {
    const usedItems = new Set();

    if (!/^\d{6}$/.test(cleanOfficialInvoiceNumber)) {
      toast.error('Enter the 6-digit Sales Invoice Number from the booklet.', {
        description: 'Use the exact number printed on the Sales Invoice.'
      });
      return false;
    }

    if (!enteredInvoiceSequenceNumber) {
      toast.error('Enter a valid Sales Invoice Number from 000001 to 999999.');
      return false;
    }

    if (duplicateOfficialInvoiceSale) {
      toast.error(`Sales Invoice Number ${cleanOfficialInvoiceNumber} has already been used.`);
      return false;
    }

    if (isOfficialInvoiceBehindSequence) {
      toast.error(`Sales Invoice Number ${cleanOfficialInvoiceNumber} is behind the current sequence.`, {
        description: `Use ${suggestedOfficialInvoiceNumber} or confirm the physical booklet before continuing.`
      });
      return false;
    }

    if (isOfficialInvoiceSkippingSequence && cleanInvoiceSequenceExceptionReason.length < 5) {
      toast.error('Add a short note for the skipped invoice number.', {
        description: `This entry skips Sales Invoice No. ${skippedInvoiceRangeText}.`
      });
      return false;
    }

    for (let index = 0; index < selectedLineDetails.length; index += 1) {
      const line = selectedLineDetails[index];
      const lineLabel = `Line ${index + 1}`;

      if (line.isManual) {
        if (!line.itemName || line.itemName.length > 150) {
          toast.error(`${lineLabel}: enter an item description for the non-inventory item.`);
          return false;
        }
        if (VAGUE_NON_INVENTORY_NAMES.has(line.itemName.trim().toLowerCase())) {
          toast.error(`${lineLabel}: use the specific item name, not only "Other".`);
          return false;
        }
        if (!/[A-Za-z0-9]/.test(line.itemName)) {
          toast.error(`${lineLabel}: item description must include letters or numbers.`);
          return false;
        }
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
          toast.error(`${line.itemName}: quantity sold must be a whole number greater than zero.`);
          return false;
        }
        if (String(line.unitPrice || '').trim() === '' || !isValidMoneyText(line.unitPrice) || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) <= 0) {
          toast.error(`${line.itemName}: unit price must be a valid amount greater than zero.`);
          return false;
        }
        const existingInventoryItem = findInventoryItemByExactSalesName(line.itemName);
        if (existingInventoryItem) {
          const isOutOfStock = Number(existingInventoryItem.quantity || 0) <= 0 || existingInventoryItem.status === 'Out of Stock';
          toast.error(`${line.itemName} already exists in Inventory`, {
            description: isOutOfStock
              ? 'This tracked item is out of stock. Record Stock In or Purchase Entry first before selling it.'
              : 'Add this item from Select Items so inventory stock is deducted correctly.'
          });
          return false;
        }
        continue;
      }

      if (!line.inventoryId || !line.item) {
        toast.error(`${lineLabel}: please select an inventory item.`);
        return false;
      }

      if (usedItems.has(line.inventoryId)) {
        toast.error(`${line.item.name} is already selected. Use one line per item.`);
        return false;
      }
      usedItems.add(line.inventoryId);

      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        toast.error(`${line.item.name}: quantity sold must be a whole number greater than zero.`);
        return false;
      }

      if (line.quantity > Number(line.item.quantity || 0)) {
        toast.error(`${line.item.name} has only ${line.item.quantity} unit${Number(line.item.quantity) === 1 ? '' : 's'} available.`);
        return false;
      }

      if (String(line.unitPrice || '').trim() === '' || !isValidMoneyText(line.unitPrice) || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) <= 0) {
        toast.error(`${line.item.name}: unit price must be a valid amount greater than zero.`);
        return false;
      }
    }

    if (customerName.trim().length > 160) {
      toast.error('Registered name must be 160 characters or fewer.');
      return false;
    }

    if (customerTin.trim().length > 80) {
      toast.error('TIN must be 80 characters or fewer.');
      return false;
    }

    if (customerTin.trim() && !/^[0-9-]+$/.test(customerTin.trim())) {
      toast.error('TIN must contain numbers and dashes only.');
      return false;
    }

    if (customerAddress.trim().length > 240) {
      toast.error('Business address must be 240 characters or fewer.');
      return false;
    }

    if (!discountOptions[discountType]) {
      toast.error('Please select a valid discount option.');
      return false;
    }

    if (discountType !== 'none' && subtotalAmount <= 0) {
      toast.error('Add sold items before applying a discount.');
      return false;
    }

    if (selectedDiscountOption.manual && !isValidMoneyText(discountAmount)) {
      toast.error('Manual discount must be a valid amount.');
      return false;
    }

    if (selectedDiscountOption.manual && String(discountAmount || '').trim() === '') {
      toast.error('Enter the manual discount amount or choose No Discount.');
      return false;
    }

    if (selectedDiscountOption.manual && safeDiscountAmount <= 0) {
      toast.error('Manual discount must be greater than zero, or choose No Discount.');
      return false;
    }

    if (safeDiscountAmount < 0 || safeDiscountAmount > subtotalAmount) {
      toast.error('Discount must not be greater than the sales subtotal.');
      return false;
    }

    if (!isValidMoneyText(deliveryCharge) || safeDeliveryCharge < 0) {
      toast.error('Delivery charge must be a valid amount or blank.');
      return false;
    }

    if (paymentMethod === 'cash' && totalAmount > 0 && String(amountReceived || '').trim() === '') {
      toast.error('Enter the cash amount received before saving the sale.');
      return false;
    }

    if (paymentMethod === 'cash' && !isValidMoneyText(amountReceived)) {
      toast.error('Amount received must be a valid cash amount.');
      return false;
    }

    if (paymentMethod === 'cash' && totalAmount > 0 && safeAmountReceived < totalAmount) {
      toast.error('Cash received is lower than the amount due.');
      return false;
    }

    if (needsPaymentConfirmation && !paymentConfirmed) {
      toast.error('Confirm that the GCash or bank transfer payment was received before completing the sale.');
      return false;
    }

    if (needsPaymentConfirmation && paymentConfirmedAmount !== null && Number(paymentConfirmedAmount) !== Number(totalAmount.toFixed(2))) {
      toast.error('Payment total changed. Please confirm the GCash or bank transfer payment again.');
      return false;
    }

    if (needsPaymentConfirmation && paymentReference.trim().length > 120) {
      toast.error('Payment reference must be 120 characters or fewer.');
      return false;
    }

    if (actualTransactionAt) {
      const selectedDate = new Date(actualTransactionAt);
      if (Number.isNaN(selectedDate.getTime())) {
        toast.error('Actual transaction date must be valid.');
        return false;
      }
      if (selectedDate.getTime() > Date.now() + 60 * 1000) {
        toast.error('Actual transaction date cannot be in the future.');
        return false;
      }
    }

    return true;
  };

  const submitRecordSale = async () => {
    const receiptPrintWindow = openReceiptPrintWindow();
    setIsSaving(true);
    try {
      const sale = await recordSale({
        officialInvoiceNumber: cleanOfficialInvoiceNumber,
        invoiceSequenceExceptionReason: isOfficialInvoiceSkippingSequence ? cleanInvoiceSequenceExceptionReason : '',
        customerType,
        customerName: customerName.trim() || 'C',
        customerTin: customerTin.trim(),
        customerAddress: customerAddress.trim() || 'C',
        remarks: remarks.trim(),
        paymentMethod,
        discountType,
        discountAmount: safeDiscountAmount,
        deliveryCharge: safeDeliveryCharge,
        amountReceived: paymentMethod === 'cash' ? safeAmountReceived : totalAmount,
        paymentReference: needsPaymentConfirmation ? paymentReference.trim() : '',
        paymentConfirmed: needsPaymentConfirmation || paymentMethod === 'cash',
        actualTransactionAt: actualTransactionAt || '',
        backdateReason: isPastTransactionDate(actualTransactionAt) ? backdateReason.trim() : '',
        items: selectedLineDetails.map(line => ({
          inventoryId: line.inventoryId,
          isManual: Boolean(line.isManual),
          itemName: line.itemName,
          category: line.category,
          categoryNote: line.categoryNote,
          quantity: line.quantity,
          unitPrice: line.unitPrice
        }))
      });
      toast.success('Sale recorded successfully.', {
        description: `${getPrimaryDocumentNumber(sale)} saved and inventory was updated.`
      });
      const printStarted = printSaleTransactionReceipt(sale, receiptPrintWindow);
      if (!printStarted) {
        setCompletedSale(sale);
      }
      resetForm();
    } catch (err) {
      receiptPrintWindow?.close();
      toast.error('Failed to record sale', {
        description: err?.response?.data?.error || err.message || 'No inventory was deducted.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecordSale = async () => {
    if (!validateSale()) return;
    if (isOfficialInvoiceSkippingSequence) {
      setIsInvoiceSequenceConfirmOpen(true);
      return;
    }
    await submitRecordSale();
  };

  const confirmInvoiceSequenceException = async () => {
    if (!validateSale()) return;
    setIsInvoiceSequenceConfirmOpen(false);
    await submitRecordSale();
  };

  const handleDownloadSaleSummary = sale => {
    downloadSaleTransactionSummary(sale);
    toast.success('Transaction receipt downloaded.');
  };

  const openCancelSaleDialog = sale => {
    setSaleToCancel(sale);
    setCancelReason('');
  };

  const closeCancelSaleDialog = () => {
    if (isCancellingSale) return;
    setSaleToCancel(null);
    setCancelReason('');
  };

  const openRefundSaleDialog = sale => {
    const refundableItems = (sale?.items || [])
      .filter(item => Number(item.quantitySold || 0) > 0 && getRemainingRefundQuantity(item) > 0)
      .map(item => ({
        salesItemId: item.id,
        itemName: item.itemName,
        category: item.category,
        isInventoryItem: item.isInventoryItem,
        maxQuantity: getRemainingRefundQuantity(item),
        maxAmount: getRemainingRefundAmount(item),
        unitPrice: Number(item.unitPrice || 0),
        quantity: '',
        refundAmount: ''
      }));

    if (refundableItems.length === 0) {
      toast.info('No refundable item quantity remains for this sale.');
      return;
    }

    setSaleToRefund(sale);
    setRefundLines(refundableItems);
    setRefundReason('');
    setRefundActualTransactionAt('');
    setRefundBackdateReason('');
  };

  const closeRefundSaleDialog = () => {
    if (isRefundingSale) return;
    setSaleToRefund(null);
    setRefundLines([]);
    setRefundReason('');
    setRefundActualTransactionAt('');
    setRefundBackdateReason('');
  };

  const updateRefundLine = (salesItemId, field, value) => {
    setRefundLines(prev => prev.map(line => {
      if (String(line.salesItemId) !== String(salesItemId)) return line;

      if (field === 'quantity') {
        const quantityText = sanitizeWholeNumberInput(value, 'Refund quantity', 'sales-refund-quantity-numbers-only');
        const attemptedQuantity = Number(quantityText || 0);
        const maxQuantity = Number(line.maxQuantity || 0);
        if (attemptedQuantity > maxQuantity) {
          toast.warning(getRefundableQuantityLimitMessage(maxQuantity), {
            id: `sales-refund-quantity-limit-${line.salesItemId}`,
            duration: 2600
          });
          return line;
        }
        return {
          ...line,
          quantity: attemptedQuantity > 0 ? quantityText : '',
          refundAmount: getRefundAmountForQuantity(line, attemptedQuantity)
        };
      }

      if (field === 'refundAmount') {
        const amountText = sanitizeDecimalInput(value, 'Refund amount', 'sales-refund-amount-numbers-only');
        const attemptedAmount = Number(amountText || 0);
        const maxAmount = Number(line.maxAmount || 0);
        if (attemptedAmount > maxAmount) {
          toast.warning(`Refund amount cannot exceed ${formatCurrency(maxAmount)} for this item.`, {
            id: `sales-refund-amount-limit-${line.salesItemId}`,
            duration: 2600
          });
        }
        return {
          ...line,
          refundAmount: attemptedAmount > maxAmount ? maxAmount.toFixed(2) : amountText
        };
      }

      return line;
    }));
  };

  const fillAllRefundableQuantities = () => {
    setRefundLines(prev => prev.map(line => {
      const maxQuantity = Number(line.maxQuantity || 0);
      return {
        ...line,
        quantity: maxQuantity > 0 ? String(maxQuantity) : '',
        refundAmount: getRefundAmountForQuantity(line, maxQuantity)
      };
    }));
    toast.success('All remaining refundable quantities were selected.');
  };

  const clearRefundQuantities = () => {
    setRefundLines(prev => prev.map(line => ({
      ...line,
      quantity: '',
      refundAmount: ''
    })));
    toast.info('Refund quantities cleared.');
  };

  const handleRefundActualTransactionAtChange = value => {
    setRefundActualTransactionAt(value);
    if (isPastTransactionDate(value)) {
      toast.info('This refund will be saved as a backdated transaction.', {
        description: 'Reports will use the refund date. Audit trail will keep the encoded date.'
      });
    }
  };

  const confirmRefundSale = async () => {
    if (!saleToRefund) return;

    const selectedRefundLines = refundLines
      .map(line => ({
        ...line,
        quantityValue: Number(line.quantity || 0),
        refundAmountValue: Number(line.refundAmount || 0)
      }))
      .filter(line => line.quantityValue > 0 || line.refundAmountValue > 0);

    if (selectedRefundLines.length === 0) {
      toast.error('Enter at least one refund quantity.');
      return;
    }

    for (const line of selectedRefundLines) {
      if (!Number.isInteger(line.quantityValue) || line.quantityValue <= 0) {
        toast.error(`Refund quantity for ${line.itemName} must be a whole number greater than zero.`);
        return;
      }
      if (line.quantityValue > line.maxQuantity) {
        toast.error(getRefundableQuantityLimitMessage(line.maxQuantity), {
          description: line.itemName
        });
        return;
      }
      if (!Number.isFinite(line.refundAmountValue) || line.refundAmountValue <= 0) {
        toast.error(`Refund amount for ${line.itemName} must be greater than zero.`);
        return;
      }
      if (line.refundAmountValue > line.maxAmount + 0.009) {
        toast.error(`Refund amount for ${line.itemName} cannot exceed ${formatCurrency(line.maxAmount)}.`);
        return;
      }
    }

    const cleanReason = refundReason.trim();
    if (cleanReason.length < 5) {
      toast.error('Enter a clear refund reason before continuing.');
      return;
    }

    if (refundActualTransactionAt) {
      const selectedDate = new Date(refundActualTransactionAt);
      if (Number.isNaN(selectedDate.getTime())) {
        toast.error('Refund transaction date must be valid.');
        return;
      }
      if (selectedDate.getTime() > Date.now() + 60 * 1000) {
        toast.error('Refund transaction date cannot be in the future.');
        return;
      }
    }

    setIsRefundingSale(true);
    try {
      const refundRecord = await refundSale({
        saleId: saleToRefund.id,
        refundReason: cleanReason,
        actualTransactionAt: refundActualTransactionAt || '',
        backdateReason: isPastTransactionDate(refundActualTransactionAt) ? refundBackdateReason.trim() : '',
        items: selectedRefundLines.map(line => ({
          salesItemId: line.salesItemId,
          quantity: line.quantityValue,
          refundAmount: Number(line.refundAmountValue.toFixed(2))
        }))
      });
      toast.success('Refund recorded and stock restored.', {
        description: `${getPrimaryDocumentNumber(refundRecord)} was saved.`
      });
      setSaleToRefund(null);
      setRefundLines([]);
      setRefundReason('');
      setRefundActualTransactionAt('');
      setRefundBackdateReason('');
    } catch (err) {
      toast.error('Failed to record refund', {
        description: err?.response?.data?.error || err.message || 'No inventory was restored.'
      });
    } finally {
      setIsRefundingSale(false);
    }
  };

  const confirmCancelSale = async () => {
    const cleanReason = cancelReason.trim();
    if (!saleToCancel) return;

    if (cleanReason.length < 5) {
      toast.error('Enter a clear cancellation reason before continuing.');
      return;
    }

    setIsCancellingSale(true);
    try {
      const cancelledSale = await cancelSale(saleToCancel.id, cleanReason);
      toast.success('Sale cancelled and stock restored.', {
        description: `${getPrimaryDocumentNumber(cancelledSale || saleToCancel)} was marked as cancelled.`
      });
      setSaleToCancel(null);
      setCancelReason('');
    } catch (err) {
      toast.error('Failed to cancel sale', {
        description: err?.response?.data?.error || err.message || 'Inventory was not restored.'
      });
    } finally {
      setIsCancellingSale(false);
    }
  };

  return (
    <div className="sales-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .sales-screen {
          min-height: 0;
          max-width: 100%;
          overflow-x: hidden;
        }

        .sales-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(340px, 410px);
          gap: 1.25rem;
          align-items: start;
          min-width: 0;
        }

        .sales-page {
          margin-top: -0.25rem;
        }

        .sales-product-panel {
          display: none;
        }

        .sales-native-select {
          display: flex;
          width: 100%;
          min-height: 2.75rem;
          align-items: center;
          border: 1px solid #e2e8f0;
          border-radius: 0.65rem;
          background: #f8fafc;
          padding: 0 0.85rem;
          color: #0f172a;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
        }

        .sales-native-select:focus {
          border-color: #f4f400;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(244, 244, 0, 0.28);
        }

        .sales-native-select:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .sales-side-panel {
          display: grid;
          gap: 1rem;
          min-width: 0;
          max-width: 100%;
          position: sticky;
          top: 1rem;
        }

        .sales-record-card {
          border-color: #e2e8f0;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
        }

        .sales-record-header {
          padding: 1rem 1rem 0.6rem;
        }

        .sales-record-content {
          display: grid;
          gap: 0.9rem;
          padding: 0 1rem 1rem;
        }

        .sales-form-section {
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
          background: #ffffff;
          padding: 1rem;
        }

        .sales-section-heading {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.85rem;
        }

        .sales-section-icon {
          display: inline-flex;
          width: 2.15rem;
          height: 2.15rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 0.7rem;
          background: #f8fafc;
          color: #475569;
        }

        .sales-section-icon-accent {
          background: #eff6ff;
          color: #2563eb;
        }

        .sales-section-title {
          font-size: 1rem;
          line-height: 1.35;
          font-weight: 750;
          color: #0f172a;
        }

        .sales-page-toolbar {
          display: none;
          justify-content: flex-end;
          margin-bottom: 1rem;
        }

        .sales-customer-section {
          padding: 0.95rem;
        }

        .sales-customer-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }

        .sales-readonly-user {
          display: flex;
          min-height: 3.5rem;
          align-items: center;
          gap: 0.65rem;
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 0.65rem;
          background: #f8fafc;
          padding: 0 0.85rem;
          color: #334155;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .sales-readonly-user svg {
          flex: 0 0 auto;
        }

        .sales-readonly-user-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sales-checkout-card .sales-readonly-user-name {
          overflow: visible;
          text-overflow: clip;
          white-space: normal;
          overflow-wrap: anywhere;
          line-height: 1.3;
        }

        .sales-customer-control {
          width: 100%;
          min-width: 0;
          min-height: 3.5rem;
          overflow: hidden;
          color: #0f172a;
        }

        .sales-customer-control [data-slot="select-value"] {
          display: flex;
          flex: 1 1 auto;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sales-checkout-card .sales-customer-control {
          height: auto;
          min-height: 3.25rem;
          align-items: center;
          padding-block: 0.55rem;
        }

        .sales-checkout-card .sales-customer-control [data-slot="select-value"] {
          overflow: visible;
          text-overflow: clip;
          white-space: normal;
          overflow-wrap: anywhere;
          line-height: 1.3;
        }

        .sales-transaction-date-input {
          min-height: 3.75rem;
          border: 1.5px solid #94a3b8;
          background: #ffffff;
          color: #0f172a;
          font-size: 1rem;
          font-weight: 600;
          cursor: text;
          box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.03);
        }

        .sales-transaction-date-input:hover {
          border-color: #2563eb;
          background: #f8fbff;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
        }

        .sales-transaction-date-input:focus,
        .sales-transaction-date-input:focus-visible {
          border-color: #2563eb;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.14);
        }

        .sales-transaction-date-input::-webkit-calendar-picker-indicator {
          cursor: pointer;
          opacity: 0.8;
          padding: 0.35rem;
        }

        .sales-transaction-date-input::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }

        .sales-payment-input-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.5rem;
          align-items: center;
        }

        .sales-exact-cash-button {
          min-height: 2.75rem;
          border-color: #cbd5e1;
          color: #334155;
          font-weight: 650;
        }

        .sales-exact-cash-button:hover,
        .sales-exact-cash-button:focus-visible {
          border-color: #94a3b8;
          background: #f8fafc;
          color: #0f172a;
        }

        .sales-payment-helper {
          font-size: 0.75rem;
          line-height: 1.35;
          color: #64748b;
        }

        .sales-payment-confirmation {
          display: flex;
          width: 100%;
          min-height: 3.5rem;
          align-items: center;
          gap: 0.7rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.65rem;
          background: #ffffff;
          padding: 0.75rem 0.85rem;
          color: #334155;
          font-size: 0.875rem;
          font-weight: 650;
          text-align: left;
          cursor: pointer;
          transition: border-color 160ms ease, background-color 160ms ease;
        }

        .sales-payment-confirmation:hover,
        .sales-payment-confirmation:focus-visible {
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        .sales-payment-confirmation:focus-visible {
          outline: 3px solid rgba(34, 197, 94, 0.24);
          outline-offset: 2px;
        }

        .sales-payment-confirmation:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .sales-payment-confirmation-box {
          display: inline-flex;
          width: 1.65rem;
          height: 1.65rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #ffffff;
          color: #047857;
        }

        .sales-payment-confirmation-checked {
          border-color: #86efac;
          background: #f0fdf4;
          color: #14532d;
        }

        .sales-payment-confirmation-checked .sales-payment-confirmation-box {
          border-color: #22c55e;
          background: #dcfce7;
        }

        .sales-payment-confirmation-text {
          display: grid;
          min-width: 0;
          gap: 0.1rem;
        }

        .sales-payment-confirmation-text small {
          color: #64748b;
          font-size: 0.75rem;
          font-weight: 500;
          line-height: 1.35;
        }

        .sales-payment-confirmation-checked .sales-payment-confirmation-text small {
          color: #166534;
        }

        .sales-digital-payment-note {
          grid-column: 1 / -1;
          display: flex;
          gap: 0.65rem;
          border: 1px solid #bfdbfe;
          border-radius: 0.75rem;
          background: #eff6ff;
          padding: 0.8rem 0.9rem;
          color: #334155;
          font-size: 0.8125rem;
          line-height: 1.45;
        }

        .sales-digital-payment-note svg {
          margin-top: 0.1rem;
          flex-shrink: 0;
          color: #2563eb;
        }

        .sales-readonly-user svg {
          width: 1rem;
          height: 1rem;
          color: #64748b;
        }

        .sales-readonly-price {
          display: flex;
          min-height: 2.75rem;
          align-items: center;
          justify-content: flex-end;
          border: 1px solid #e2e8f0;
          border-radius: 0.65rem;
          background: #f8fafc;
          padding: 0 0.85rem;
          color: #0f172a;
          font-size: 0.95rem;
          font-weight: 750;
          line-height: 1.25rem;
          white-space: nowrap;
        }

        .sales-payment-warning {
          border-color: #fecaca;
          background: #fef2f2;
          color: #991b1b;
        }

        .sales-line-card {
          border-radius: 0.9rem;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 0.9rem;
          transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
        }

        .sales-line-card:hover {
          border-color: #cbd5e1;
        }

        .sales-action-button {
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .sales-action-button:not(:disabled):hover,
        .sales-action-button:not(:disabled):focus-visible {
          background-color: #f1f5f9;
          border-color: #cbd5e1;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
        }

        .sales-save-sale-button {
          border: 1px solid #dc2626;
          background: #ff0000;
          color: #ffffff;
          font-weight: 750;
          box-shadow: 0 10px 18px rgba(220, 38, 38, 0.16);
        }

        .sales-save-sale-button:not(:disabled):hover,
        .sales-save-sale-button:not(:disabled):focus-visible {
          border-color: #b91c1c;
          background: #dc2626;
          color: #ffffff;
          box-shadow: 0 12px 22px rgba(220, 38, 38, 0.22);
        }

        .sales-save-sale-button:disabled,
        .sales-save-sale-button:disabled:hover,
        .sales-save-sale-button:disabled:focus-visible {
          border-color: #e2e8f0 !important;
          background: #f1f5f9 !important;
          color: #94a3b8 !important;
          box-shadow: none !important;
          opacity: 1;
        }

        .sales-view-all-button {
          background: #ffffff;
          border-color: #bfdbfe;
          color: #1d4ed8;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .sales-view-all-button:hover,
        .sales-view-all-button:focus-visible,
        .sales-view-all-button:active {
          background: #eff6ff;
          border-color: #60a5fa;
          color: #1e40af;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
        }

        .sales-transaction-summary-button {
          border-color: #cbd5e1;
          color: #334155;
          font-weight: 650;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .sales-transaction-summary-button:hover,
        .sales-transaction-summary-button:focus-visible {
          border-color: #94a3b8;
          background: #f8fafc;
          color: #0f172a;
        }

        .sales-cancel-sale-button {
          border-color: #fecaca;
          color: #b91c1c;
          font-weight: 650;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .sales-cancel-sale-button:hover,
        .sales-cancel-sale-button:focus-visible {
          border-color: #f87171;
          background: #fef2f2;
          color: #991b1b;
        }

        .sales-history-detail-header {
          display: flex;
          flex-direction: column;
          gap: 0.95rem;
          margin-bottom: 1.1rem;
          padding-bottom: 1.05rem;
          border-bottom: 1px solid #e2e8f0;
        }

        .sales-history-detail-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          min-width: 0;
        }

        .sales-history-detail-label {
          display: block;
          color: #64748b;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          line-height: 1.2;
          text-transform: uppercase;
        }

        .sales-history-detail-number {
          margin-top: 0.25rem;
          color: #0f172a;
          font-size: clamp(1.1rem, 2vw, 1.35rem);
          font-weight: 900;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }

        .sales-history-detail-date-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
          gap: 0.65rem;
          min-width: 0;
        }

        .sales-history-detail-date-card {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 0.65rem;
          align-items: center;
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          background: #f8fafc;
          padding: 0.7rem 0.8rem;
        }

        .sales-history-detail-date-card-warning {
          border-color: #fde68a;
          background: #fffbeb;
        }

        .sales-history-detail-date-card span {
          display: block;
          color: #64748b;
          font-size: 0.72rem;
          font-weight: 800;
          line-height: 1.15;
          text-transform: uppercase;
        }

        .sales-history-detail-date-card strong {
          display: block;
          margin-top: 0.2rem;
          color: #0f172a;
          font-size: 0.93rem;
          font-weight: 850;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .sales-history-detail-date-card em {
          justify-self: end;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #ffffff;
          color: #334155;
          font-size: 0.78rem;
          font-style: normal;
          font-weight: 800;
          line-height: 1;
          padding: 0.45rem 0.6rem;
          white-space: nowrap;
        }

        .sales-history-detail-actions {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(7.75rem, 1fr));
          align-items: stretch;
          gap: 0.55rem;
          min-width: 0;
        }

        .sales-history-action-button {
          min-height: 2.65rem;
          justify-content: center;
          gap: 0.5rem;
          border-radius: 0.7rem;
          font-size: 0.88rem;
          font-weight: 850;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 120ms ease;
        }

        .sales-history-action-button:hover,
        .sales-history-action-button:focus-visible {
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
        }

        .sales-history-action-button:active {
          transform: translateY(1px);
        }

        .sales-history-action-button-disabled,
        .sales-history-action-button-disabled:disabled {
          cursor: not-allowed;
          border-color: #e2e8f0;
          background: #f8fafc;
          color: #64748b;
          opacity: 1;
          box-shadow: none;
          transform: none;
        }

        .sales-history-receipt-button {
          border-color: #cbd5e1;
          background: #ffffff;
          color: #334155;
        }

        .sales-history-receipt-button:hover,
        .sales-history-receipt-button:focus-visible {
          border-color: #94a3b8;
          background: #f8fafc;
          color: #0f172a;
        }

        .sales-history-refund-button {
          border-color: #cbd5e1;
          background: #ffffff;
          color: #334155;
        }

        .sales-history-refund-button:hover,
        .sales-history-refund-button:focus-visible {
          border-color: #94a3b8;
          background: #f8fafc;
          color: #0f172a;
        }

        .sales-history-cancel-button {
          border-color: #fecaca;
          background: #ffffff;
          color: #b91c1c;
        }

        .sales-history-cancel-button:hover,
        .sales-history-cancel-button:focus-visible {
          border-color: #f87171;
          background: #fef2f2;
          color: #991b1b;
        }

        .sales-history-action-note {
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          border: 1px solid #bfdbfe;
          border-radius: 0.75rem;
          background: #eff6ff;
          color: #1e3a8a;
          padding: 0.7rem 0.8rem;
          font-size: 0.8rem;
          line-height: 1.45;
        }

        .sales-history-action-note svg {
          margin-top: 0.05rem;
          flex-shrink: 0;
          color: #2563eb;
        }

        .sales-history-status-badge {
          min-height: 2.55rem;
          flex-shrink: 0;
          border-radius: 999px;
          padding: 0 1rem;
          gap: 0.45rem;
          font-weight: 850;
          white-space: nowrap;
        }

        .sales-cancel-dialog {
          width: min(100% - 2rem, 42rem);
          max-width: min(100% - 2rem, 42rem) !important;
          max-height: calc(100dvh - 2rem);
          overflow-y: auto;
          border-radius: 1rem;
        }

        .sales-cancel-content {
          display: flex;
          flex-direction: column;
          gap: 1.35rem;
          padding: clamp(1.25rem, 2.2vw, 1.75rem);
        }

        .sales-cancel-header {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .sales-cancel-copy {
          min-width: 0;
          padding-top: 0.1rem;
        }

        .sales-cancel-description {
          margin-top: 0.6rem;
          color: #111827;
        }

        .sales-cancel-sale-number {
          font-weight: 750;
          color: #0f172a;
        }

        .sales-cancel-reason-group {
          display: grid;
          gap: 0.55rem;
        }

        .sales-cancel-reason-label {
          color: #111827;
          font-size: 0.9rem;
          font-weight: 650;
          line-height: 1.25;
        }

        .sales-cancel-reason-input {
          min-height: 5.75rem;
          border-radius: 0.75rem;
          background: #f8fafc;
          color: #111827;
          line-height: 1.5;
          padding: 0.85rem 1rem;
        }

        .sales-cancel-helper {
          color: #111827;
          font-size: 0.78rem;
          line-height: 1.45;
        }

        .sales-cancel-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          margin-top: 0.1rem;
        }

        .sales-cancel-actions button {
          min-height: 2.75rem;
          border-radius: 0.75rem;
          padding-inline: 1.15rem;
        }

        @media (max-width: 640px) {
          .sales-cancel-dialog {
            width: min(100% - 1.25rem, 28rem);
            max-width: min(100% - 1.25rem, 28rem) !important;
            border-radius: 0.9rem;
          }

          .sales-cancel-content {
            gap: 1rem;
            padding: 1rem;
          }

          .sales-cancel-header {
            gap: 0.85rem;
          }

          .sales-cancel-icon {
            width: 3.1rem;
            height: 3.1rem;
          }

          .sales-cancel-description {
            margin-top: 0.5rem;
            font-size: 0.92rem;
            line-height: 1.45;
          }

          .sales-cancel-reason-input {
            min-height: 5rem;
            padding: 0.8rem 0.9rem;
            font-size: 0.95rem;
          }

          .sales-cancel-actions {
            flex-direction: column-reverse;
            gap: 0.65rem;
          }

          .sales-cancel-actions button {
            width: 100%;
            min-height: 2.75rem;
          }
        }

        .sales-refund-dialog {
          width: min(100% - 2rem, 74rem);
          max-width: min(100% - 2rem, 74rem) !important;
          height: min(92dvh, 48rem);
          max-height: min(92dvh, 48rem);
          overflow: hidden;
          border-radius: 1rem;
        }

        .sales-refund-content {
          display: flex;
          min-height: 0;
          height: 100%;
          max-height: min(92dvh, 48rem);
          flex-direction: column;
          background: #ffffff;
        }

        .sales-refund-header {
          border-bottom: 1px solid #e5e7eb;
          padding: 1.15rem 1.4rem 1rem;
        }

        .sales-refund-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .sales-refund-heading {
          display: flex;
          min-width: 0;
          align-items: flex-start;
          gap: 0.9rem;
        }

        .sales-refund-icon {
          display: inline-flex;
          width: 2.85rem;
          height: 2.85rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 0.85rem;
          background: #fff1f2;
          color: #ef0000;
        }

        .sales-refund-title {
          color: #111827;
          font-size: 1.18rem;
          font-weight: 800;
          line-height: 1.25;
        }

        .sales-refund-description {
          margin-top: 0.45rem;
          color: #111827;
          font-size: 0.9rem;
          line-height: 1.5;
        }

        .sales-refund-close-button {
          display: inline-flex;
          width: 2.55rem;
          height: 2.55rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border: 1px solid #e2e8f0;
          border-radius: 0.7rem;
          background: #ffffff;
          color: #334155;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .sales-refund-close-button:hover,
        .sales-refund-close-button:focus-visible {
          border-color: #fecaca;
          background: #fef2f2;
          color: #dc2626;
          box-shadow: 0 8px 18px rgba(220, 38, 38, 0.12);
          outline: 0;
        }

        .sales-refund-close-button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .sales-refund-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(23rem, 27rem);
          gap: 1.25rem;
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
          padding: 1rem 1.15rem;
        }

        .sales-refund-main {
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          height: 100%;
          min-height: 0;
          min-width: 0;
          overflow: hidden;
        }

        .sales-refund-section-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.15rem;
          color: #111827;
          font-size: 0.9rem;
          font-weight: 850;
          line-height: 1.2;
        }

        .sales-refund-section-heading > div:first-child {
          display: flex;
          min-width: 0;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem 0.6rem;
          min-height: 2.25rem;
        }

        .sales-refund-section-heading strong {
          color: #64748b;
          font-size: 0.78rem;
          font-weight: 800;
        }

        .sales-refund-bulk-actions {
          display: flex;
          flex: 0 0 auto;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        .sales-refund-bulk-actions button {
          min-height: 2.25rem;
          border-color: #cbd5e1;
          border-radius: 0.55rem;
          background: #ffffff;
          color: #1f2937;
          font-size: 0.78rem;
          font-weight: 800;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .sales-refund-bulk-actions button:hover,
        .sales-refund-bulk-actions button:focus-visible {
          border-color: #94a3b8;
          background: #f8fafc;
          color: #111827;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
        }

        .sales-refund-bulk-actions button:disabled {
          box-shadow: none;
        }

        .sales-refund-lines {
          display: flex;
          flex: 1 1 auto;
          flex-direction: column;
          gap: 0.85rem;
          height: 100%;
          min-height: 0;
          min-width: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 0 0.35rem 0 0;
          scrollbar-gutter: stable;
        }

        .sales-refund-lines::-webkit-scrollbar {
          width: 0.55rem;
        }

        .sales-refund-lines::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 999px;
        }

        .sales-refund-lines::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
        }

        .sales-refund-lines::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .sales-refund-line-card {
          display: flex;
          flex: 0 0 auto;
          flex-direction: column;
          min-height: max-content;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          border-radius: 0.55rem;
          background: #ffffff;
        }

        .sales-refund-line-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1rem;
          align-items: center;
          border-bottom: 1px solid #e5e7eb;
          padding: 0.9rem 1rem;
        }

        .sales-refund-item-name {
          color: #111827;
          font-size: 0.96rem;
          font-weight: 800;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .sales-refund-line-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem 0.55rem;
          margin-top: 0.35rem;
          color: #111827;
          font-size: 0.82rem;
          line-height: 1.35;
        }

        .sales-refund-line-meta span + span::before {
          content: "";
          display: inline-block;
          width: 0.25rem;
          height: 0.25rem;
          margin-right: 0.55rem;
          border-radius: 999px;
          background: #94a3b8;
          vertical-align: middle;
        }

        .sales-refund-limit-chip {
          display: grid;
          min-width: 4.3rem;
          justify-items: center;
          gap: 0.1rem;
          border-radius: 0.55rem;
          border-color: #e2e8f0;
          background: #ffffff;
          padding: 0.55rem 0.75rem;
          color: #111827;
          line-height: 1.15;
        }

        .sales-refund-limit-chip span {
          color: #64748b;
          font-size: 0.74rem;
          font-weight: 650;
        }

        .sales-refund-limit-chip strong {
          font-size: 0.9rem;
          font-weight: 850;
        }

        .sales-refund-input-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
          flex: 0 0 auto;
          min-height: 7.2rem;
          padding: 0.95rem 1rem 1rem;
        }

        .sales-refund-field {
          display: grid;
          gap: 0.5rem;
          min-width: 0;
        }

        .sales-refund-field label {
          color: #111827;
          font-size: 0.86rem;
          font-weight: 750;
          line-height: 1.25;
        }

        .sales-refund-input,
        .sales-refund-textarea {
          border-color: #d1d5db;
          border-radius: 0.6rem;
          background: #ffffff;
          color: #111827;
          font-weight: 650;
        }

        .sales-refund-input {
          height: 2.65rem;
          min-height: 2.65rem;
        }

        .sales-refund-input:disabled {
          background: #f8fafc;
          color: #94a3b8;
          opacity: 1;
        }

        .sales-refund-textarea {
          min-height: 4.85rem;
          padding: 0.85rem 0.9rem;
          font-weight: 500;
          line-height: 1.5;
          resize: vertical;
        }

        .sales-refund-input:hover,
        .sales-refund-textarea:hover,
        .sales-refund-input:focus-visible,
        .sales-refund-textarea:focus-visible {
          border-color: #94a3b8;
        }

        .sales-refund-helper {
          color: #111827;
          font-size: 0.76rem;
          line-height: 1.45;
        }

        .sales-refund-date-grid {
          margin-top: 0;
        }

        .sales-refund-date-note {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          min-height: 2.15rem;
          border: 1px solid #bfdbfe;
          border-radius: 0.55rem;
          background: #eff6ff;
          color: #1e3a8a;
          padding: 0.5rem 0.7rem;
          font-size: 0.78rem;
          line-height: 1.35;
        }

        .sales-refund-date-note svg {
          flex-shrink: 0;
          color: #2563eb;
        }

        .sales-refund-backdate-note {
          display: grid;
          gap: 0.55rem;
          border: 1px solid #fcd34d;
          border-radius: 0.75rem;
          background: #fffbeb;
          padding: 0.9rem;
        }

        .sales-refund-side {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 0.9rem;
          align-self: start;
        }

        .sales-refund-side-form {
          display: grid;
          gap: 0.9rem;
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 0.6rem;
          background: #ffffff;
          padding: 0.95rem;
        }

        .sales-refund-side-form .sales-refund-textarea {
          min-height: 5.25rem;
        }

        .sales-refund-side-form .sales-refund-date-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          column-gap: 0.75rem;
          row-gap: 0.75rem;
        }

        .sales-refund-side-form .actual-transaction-part-input {
          height: 2.75rem;
          min-height: 2.75rem;
          padding: 0 0.75rem;
        }

        .sales-refund-summary {
          align-self: stretch;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          border-radius: 0.6rem;
          background: #ffffff;
        }

        .sales-refund-summary-heading {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          border-bottom: 1px solid #e5e7eb;
          background: linear-gradient(135deg, #fff1f2 0%, #ffffff 100%);
          padding: 1rem;
        }

        .sales-refund-summary-icon {
          display: inline-flex;
          width: 2rem;
          height: 2rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 0.55rem;
          background: #ffe4e6;
          color: #ef0000;
        }

        .sales-refund-summary-heading h3 {
          margin: 0;
          color: #111827;
          font-size: 0.96rem;
          font-weight: 800;
          line-height: 1.25;
        }

        .sales-refund-summary-heading p {
          margin-top: 0.2rem;
          color: #111827;
          font-size: 0.74rem;
          font-weight: 650;
        }

        .sales-refund-summary-rows {
          display: grid;
          gap: 0.9rem;
          padding: 1rem;
        }

        .sales-refund-summary-row,
        .sales-refund-total-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 1rem;
          color: #111827;
        }

        .sales-refund-summary-row span {
          color: #334155;
          font-size: 0.83rem;
          line-height: 1.35;
        }

        .sales-refund-summary-row strong {
          flex-shrink: 0;
          font-size: 0.86rem;
          font-weight: 850;
          text-align: right;
        }

        .sales-refund-total-row {
          border-top: 1px solid #e5e7eb;
          padding: 1rem;
        }

        .sales-refund-total-row span {
          font-size: 0.95rem;
          font-weight: 850;
        }

        .sales-refund-total-row strong {
          color: #dc0000;
          font-size: 1.45rem;
          font-weight: 900;
          letter-spacing: 0;
          text-align: right;
        }

        .sales-refund-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.65rem;
          border-top: 1px solid #e5e7eb;
          padding: 0.75rem 1.15rem;
        }

        .sales-refund-actions button {
          min-height: 2.55rem;
          min-width: 5.25rem;
          border-radius: 0.6rem;
          font-weight: 800;
        }

        .sales-refund-confirm-button {
          min-width: 8.75rem !important;
          box-shadow: 0 10px 18px rgba(239, 0, 0, 0.18);
        }

        @media (max-width: 900px) {
          .sales-refund-dialog {
            width: min(100% - 1.25rem, 48rem);
            max-width: min(100% - 1.25rem, 48rem) !important;
            height: auto;
          }

          .sales-refund-body {
            display: flex;
            flex-direction: column;
            grid-template-columns: 1fr;
            flex: 0 1 auto;
            align-items: stretch;
            width: 100%;
            min-width: 0;
            overflow-y: auto;
          }

          .sales-refund-main {
            order: 1;
            flex: 0 0 auto;
            width: 100%;
            height: auto;
            overflow: visible;
          }

          .sales-refund-side {
            order: 2;
            width: 100%;
            align-self: stretch;
          }

          .sales-refund-summary {
            width: 100%;
            align-self: stretch;
          }

          .sales-refund-side-form {
            width: 100%;
          }

          .sales-refund-lines {
            display: flex;
            flex: 0 0 clamp(18rem, 44dvh, 26rem);
            width: 100%;
            height: clamp(18rem, 44dvh, 26rem);
            min-height: clamp(18rem, 44dvh, 26rem);
            max-height: clamp(18rem, 44dvh, 26rem);
            margin-bottom: 0.2rem;
            overflow-y: auto;
          }

          .sales-refund-line-card {
            width: 100%;
          }
        }

        @media (max-width: 640px) {
          .sales-refund-dialog {
            height: auto;
            max-height: calc(100dvh - 1rem);
            border-radius: 0.9rem;
          }

          .sales-refund-content {
            height: auto;
            max-height: calc(100dvh - 1rem);
          }

          .sales-refund-header {
            padding: 1rem;
          }

          .sales-refund-heading {
            gap: 0.75rem;
          }

          .sales-refund-icon {
            width: 2.55rem;
            height: 2.55rem;
          }

          .sales-refund-title {
            font-size: 1.05rem;
          }

          .sales-refund-description {
            font-size: 0.84rem;
          }

          .sales-refund-body {
            gap: 0.85rem;
            padding: 0.85rem;
            overflow-x: hidden;
          }

          .sales-refund-main {
            gap: 0.8rem;
          }

          .sales-refund-section-heading {
            align-items: stretch;
            flex-direction: column;
            gap: 0.65rem;
          }

          .sales-refund-bulk-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
          }

          .sales-refund-bulk-actions button {
            width: 100%;
            white-space: normal;
          }

          .sales-refund-lines {
            flex-basis: clamp(16rem, 42dvh, 22rem);
            height: clamp(16rem, 42dvh, 22rem);
            min-height: clamp(16rem, 42dvh, 22rem);
            max-height: clamp(16rem, 42dvh, 22rem);
          }

          .sales-refund-side-form {
            padding: 0.85rem;
          }

          .sales-refund-side-form .sales-refund-date-grid {
            grid-template-columns: 1fr;
          }

          .sales-refund-line-header,
          .sales-refund-input-grid {
            grid-template-columns: 1fr;
            gap: 0.85rem;
            padding: 0.85rem;
          }

          .sales-refund-limit-chip {
            width: max-content;
            justify-items: start;
          }

          .sales-refund-actions {
            flex-direction: column-reverse;
            padding: 0.85rem;
          }

          .sales-refund-actions button,
          .sales-refund-confirm-button {
            width: 100%;
            min-width: 0 !important;
          }
        }

        .sales-receipt-preview-dialog {
          width: min(100% - 1.5rem, 32rem);
          max-width: min(100% - 1.5rem, 32rem) !important;
          border-radius: 1rem;
        }

        .sales-receipt-preview-content {
          position: relative;
          padding: 1.25rem;
        }

        .sales-receipt-close-button {
          position: absolute;
          top: 1rem;
          right: 1rem;
          display: inline-flex;
          width: 2.25rem;
          height: 2.25rem;
          align-items: center;
          justify-content: center;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          background: #ffffff;
          color: #334155;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .sales-receipt-close-button:hover,
        .sales-receipt-close-button:focus-visible {
          border-color: #cbd5e1;
          background: #f8fafc;
          color: #0f172a;
        }

        .sales-receipt-paper {
          width: min(100%, 30rem);
          margin: 1rem auto 0;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          background: #ffffff;
          padding: 1rem;
          color: #0f172a;
          font-family: Arial, Helvetica, sans-serif;
          box-shadow: inset 0 -12px 20px rgba(15, 23, 42, 0.03);
        }

        .sales-receipt-preview-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1rem;
          align-items: start;
          border-bottom: 2px solid #0f172a;
          padding-bottom: 0.75rem;
        }

        .sales-receipt-preview-brand {
          text-align: center;
        }

        .sales-receipt-preview-brand-name {
          font-size: 1.05rem;
          font-weight: 900;
          line-height: 1.1;
        }

        .sales-receipt-preview-tin,
        .sales-receipt-preview-address,
        .sales-receipt-preview-contact {
          margin-top: 0.15rem;
          font-size: 0.68rem;
          line-height: 1.2;
        }

        .sales-receipt-preview-tin,
        .sales-receipt-preview-prop {
          font-weight: 800;
        }

        .sales-receipt-preview-prop {
          margin-top: 0.12rem;
          font-size: 0.72rem;
          line-height: 1.2;
        }

        .sales-receipt-preview-invoice {
          color: #374151;
          text-align: right;
        }

        .sales-receipt-preview-sales {
          font-size: 0.72rem;
          font-style: italic;
          font-weight: 900;
          line-height: 1;
        }

        .sales-receipt-preview-title {
          margin-top: 0.15rem;
          font-size: 1.45rem;
          font-weight: 900;
          line-height: 1;
        }

        .sales-receipt-preview-number {
          margin-top: 0.5rem;
          font-size: 0.72rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .sales-receipt-divider {
          border-top: 1px dashed #94a3b8;
          margin: 0.75rem 0;
        }

        .sales-receipt-row {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          font-size: 0.78rem;
          line-height: 1.35rem;
        }

        .sales-receipt-row span:last-child {
          flex-shrink: 0;
          text-align: right;
        }

        .sales-receipt-item {
          padding: 0.35rem 0;
          font-size: 0.78rem;
          line-height: 1.25rem;
        }

        .sales-receipt-actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.65rem;
          margin-top: 1rem;
        }

        .sales-cancel-icon {
          display: inline-flex;
          width: 3.5rem;
          height: 3.5rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 0.9rem;
          background: #fff7ed;
          color: #c2410c;
        }

        @media (max-width: 640px) {
          .sales-receipt-preview-header {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }

          .sales-receipt-preview-invoice {
            text-align: center;
          }

          .sales-receipt-preview-number {
            white-space: normal;
          }

          .sales-cancel-icon {
            width: 3.1rem;
            height: 3.1rem;
          }
        }

        .sales-checkout-card {
          border-color: #e2e8f0;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
          display: flex;
          flex-direction: column;
          min-width: 0;
          max-width: 100%;
        }

        .sales-checkout-header {
          padding: 1rem 1rem 0.6rem;
        }

        .sales-checkout-content {
          display: grid;
          gap: 0.85rem;
          padding: 0 1rem 1rem;
          min-height: 0;
          min-width: 0;
          overflow-x: hidden;
          overflow-y: auto;
        }

        .sales-checkout-section {
          min-width: 0;
          padding: 0.9rem;
        }

        .sales-checkout-card .sales-customer-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem 1rem;
        }

        .sales-payment-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem 1rem;
          align-items: start;
        }

        .sales-payment-field {
          display: grid;
          gap: 0.5rem;
          min-width: 0;
        }

        .sales-checkout-card .sales-summary-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.65rem;
        }

        .sales-checkout-actions {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.65rem;
          border-top: 1px solid #e2e8f0;
          padding-top: 0.85rem;
        }

        .sales-checkout-actions .sales-action-button {
          width: 100%;
          min-height: 2.8rem;
        }

        .sales-line-fields {
          display: grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(88px, 0.42fr) minmax(112px, 0.5fr);
          gap: 0.7rem;
        }

        .sales-line-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.8rem;
        }

        .sales-stock-preview {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.55rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.85rem;
          background: #ffffff;
          padding: 0.55rem;
        }

        .sales-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.8rem;
        }

        .sales-form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          border-top: 1px solid #e2e8f0;
          padding-top: 1rem;
        }

        .sales-stock-preview-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          background: #f8fafc;
          padding: 0.65rem;
        }

        .sales-stock-preview-item svg {
          width: 1.05rem;
          height: 1.05rem;
        }

        .sales-stock-preview-icon {
          display: flex;
          width: 2rem;
          height: 2rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border: 1px solid #e2e8f0;
          border-radius: 9999px;
          background: #ffffff;
          color: #111827;
        }

        .sales-stock-preview-label {
          display: block;
          color: #64748b;
          font-size: 0.7rem;
          line-height: 1.1rem;
          font-weight: 600;
        }

        .sales-stock-preview-value {
          display: block;
          margin-top: 0.1rem;
          color: #0f172a;
          font-size: clamp(0.8125rem, 1vw, 0.875rem);
          line-height: 1.25rem;
          font-weight: 750;
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .sales-stock-preview-item + .sales-stock-preview-item {
          border-left: 1px solid #e2e8f0;
        }

        .sales-stock-preview-item-ok {
          border-color: #e2e8f0;
          background: #f8fafc;
        }

        .sales-stock-preview-item-warning {
          border-color: #e2e8f0;
          background: #f8fafc;
        }

        .sales-stock-preview-item-danger {
          border-color: #fecaca;
          background: #fef2f2;
        }

        .sales-stock-preview-item-muted {
          border-color: #e2e8f0;
          background: #ffffff;
        }

        .sales-history-dialog {
          width: min(1180px, calc(100vw - 2rem));
          max-height: min(88vh, 840px);
          overflow: hidden;
          border-radius: 1rem;
          display: flex;
          flex-direction: column;
        }

        .sales-history-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.02fr) minmax(420px, 0.98fr);
          gap: 1.25rem;
          min-height: 0;
          flex: 1;
          overflow: hidden;
        }

        .sales-history-list,
        .sales-history-detail {
          min-height: 0;
          overflow-y: auto;
        }

        .sales-history-body {
          display: flex;
          flex: 1;
          min-height: 0;
          flex-direction: column;
          gap: 1rem;
          overflow: hidden;
        }

        .sales-history-filter-panel {
          display: grid;
          grid-template-columns: minmax(320px, 1fr) minmax(420px, auto);
          align-items: center;
          gap: 1rem;
        }

        .sales-history-search {
          display: flex;
          min-width: 0;
          width: 100%;
          align-items: center;
          gap: 0.85rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          background: #ffffff;
          padding: 0 1rem;
          min-height: 3rem;
          height: 3rem;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }

        .sales-history-search-input {
          height: 100%;
          min-width: 0;
        }

        .sales-history-filter-controls {
          display: grid;
          grid-template-columns: minmax(13rem, 15rem) minmax(8.5rem, auto) minmax(8.5rem, auto);
          align-items: center;
          gap: 0.75rem;
          color: #475569;
        }

        .sales-history-filter {
          min-width: 12rem;
          height: 3rem;
        }

        .sales-history-search:focus-within {
          border-color: #f4f400;
          box-shadow: 0 0 0 3px rgba(244, 244, 0, 0.32);
        }

        .sales-history-count-pill {
          display: inline-flex;
          height: 3rem;
          min-width: 8.5rem;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          border-radius: 0.75rem;
          padding: 0 1rem;
          font-size: 0.875rem;
          font-weight: 500;
          line-height: 1;
          white-space: nowrap;
        }

        .sales-history-list {
          padding-right: 0.25rem;
        }

        .sales-history-mobile-detail {
          display: none;
        }

        .sales-history-close-button {
          background: #ffffff;
          border-color: #e2e8f0;
          color: #475569;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .sales-history-close-button:hover,
        .sales-history-close-button:focus-visible,
        .sales-history-close-button:active {
          background: #fef2f2;
          border-color: #fecaca;
          color: #dc2626;
          box-shadow: 0 8px 18px rgba(220, 38, 38, 0.12);
        }

        .sales-history-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1.25rem;
          align-items: center;
        }

        .sales-history-record-button {
          background: #ffffff;
          border-color: #e2e8f0;
          cursor: pointer;
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .sales-history-record-button:hover,
        .sales-history-record-button:focus-visible,
        .sales-history-record-button:active {
          background: #f8fafc;
          border-color: #cbd5e1;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
        }

        .sales-history-record-button-selected,
        .sales-history-record-button-selected:hover,
        .sales-history-record-button-selected:focus-visible,
        .sales-history-record-button-selected:active {
          background: #eff6ff;
          border-color: #2563eb;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
        }

        .sales-history-arrow-down {
          display: none;
        }

        .sales-history-item-row {
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .sales-history-item-row:hover,
        .sales-history-item-row:focus-within,
        .sales-history-item-row:active {
          background: #f8fafc;
          border-color: #cbd5e1;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.06);
        }

        .sales-history-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 0;
        }

        .sales-history-meta svg {
          flex-shrink: 0;
        }

        .sales-history-items-table {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1rem;
          align-items: start;
        }

        .sales-cancelled-notice {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          margin: 0.35rem 0 0.45rem;
          padding: 0.95rem 1rem;
          border: 1px solid #fecaca;
          border-radius: 0.9rem;
          background: #fef2f2;
          color: #991b1b;
          font-size: 0.9rem;
          line-height: 1.55;
        }

        .sales-cancelled-notice-icon {
          display: inline-flex;
          width: 2rem;
          height: 2rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #fee2e2;
          color: #dc2626;
        }

        .sales-cancelled-notice-copy {
          min-width: 0;
        }

        .sales-cancelled-reason {
          margin-top: 0.25rem;
          word-break: break-word;
        }

        @media (max-width: 640px) {
          .sales-cancelled-notice {
            gap: 0.65rem;
            margin: 0.25rem 0 0.35rem;
            padding: 0.85rem;
            font-size: 0.86rem;
            line-height: 1.5;
          }

          .sales-cancelled-notice-icon {
            width: 1.85rem;
            height: 1.85rem;
          }
        }

        .sales-confirm-clear-dialog {
          width: min(420px, calc(100vw - 2rem));
          border-radius: 1rem;
          overflow: hidden;
        }

        .sales-confirm-clear-content {
          padding: 1.35rem;
        }

        .sales-confirm-clear-header {
          display: flex;
          align-items: center;
          gap: 0.85rem;
        }

        .sales-confirm-clear-icon {
          display: flex;
          width: 2.75rem;
          height: 2.75rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 0.85rem;
          background: #fef2f2;
          color: #ef0000;
        }

        .sales-confirm-clear-message {
          margin-top: 1rem;
          color: #334155;
          font-size: 0.875rem;
          line-height: 1.45rem;
        }

        .sales-confirm-clear-info {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          border: 1px solid #bfdbfe;
          border-radius: 0.5rem;
          background: #eff6ff;
          color: #0f172a;
          margin-top: 1rem;
          padding: 0.65rem 0.75rem;
          font-size: 0.8rem;
          line-height: 1.25rem;
        }

        .sales-confirm-clear-button {
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .sales-confirm-clear-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.65rem;
          margin-top: 1.25rem;
        }

        .sales-selected-items-header {
          display: flex;
          min-width: 0;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.85rem;
          margin-bottom: 0.85rem;
        }

        .sales-selected-items-header > div:first-child {
          min-width: 0;
        }

        .sales-selected-items-actions {
          display: flex;
          min-width: 0;
          max-width: 100%;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        .sales-selected-items-action {
          min-height: 2.35rem;
          border-radius: 0.7rem;
          font-weight: 700;
          white-space: nowrap;
        }

        .sales-non-inventory-dialog {
          width: min(760px, calc(100vw - 2rem));
          max-width: min(760px, calc(100vw - 2rem)) !important;
          border-radius: 1rem;
          overflow: hidden;
        }

        .sales-non-inventory-content {
          display: grid;
          gap: 1.15rem;
        }

        .sales-non-inventory-header {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 1rem;
          align-items: start;
          padding: 1.45rem 1.65rem 0;
        }

        .sales-non-inventory-icon {
          display: flex;
          width: 3.45rem;
          height: 3.45rem;
          align-items: center;
          justify-content: center;
          border-radius: 1rem;
          background: #fff1f2;
          color: #ef0000;
        }

        .sales-non-inventory-alert {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin: 0 1.65rem;
          border: 1px solid #bfdbfe;
          border-radius: 0.55rem;
          background: #eff6ff;
          color: #1e3a8a;
          padding: 0.8rem 0.95rem;
          font-size: 0.9rem;
          line-height: 1.45rem;
        }

        .sales-non-inventory-form {
          display: grid;
          gap: 1.15rem;
          padding: 0 1.65rem 1.25rem;
        }

        .sales-non-inventory-grid {
          display: grid;
          grid-template-columns: 1fr 0.9fr 1.15fr;
          gap: 1.1rem;
          align-items: end;
        }

        .sales-non-inventory-quantity-control {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 2.35rem;
          overflow: hidden;
          border: 1px solid #dbe3ee;
          border-radius: 0.55rem;
          background: #ffffff;
          box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }

        .sales-non-inventory-quantity-control:focus-within {
          border-color: #ef0000;
          box-shadow: 0 0 0 3px rgba(239, 0, 0, 0.12);
        }

        .sales-non-inventory-quantity-control .sales-non-inventory-control {
          border: 0;
          border-radius: 0;
          box-shadow: none;
          text-align: center;
          font-weight: 800;
        }

        .sales-non-inventory-quantity-buttons {
          display: grid;
          grid-template-rows: 1fr 1fr;
          border-left: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .sales-non-inventory-quantity-button {
          display: inline-flex;
          min-height: 1.375rem;
          align-items: center;
          justify-content: center;
          color: #334155;
          transition: background-color 160ms ease, color 160ms ease;
        }

        .sales-non-inventory-quantity-button:first-child {
          border-bottom: 1px solid #e2e8f0;
        }

        .sales-non-inventory-quantity-button:hover,
        .sales-non-inventory-quantity-button:focus-visible {
          background: #eef2ff;
          color: #dc2626;
          outline: none;
        }

        .sales-non-inventory-quantity-button:disabled {
          cursor: not-allowed;
          color: #cbd5e1;
          background: #f8fafc;
        }

        .sales-non-inventory-total {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          background: #f8fafc;
          padding: 0.8rem 0.95rem;
        }

        .sales-non-inventory-total span {
          color: #64748b;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .sales-non-inventory-total strong {
          color: #0f172a;
          font-size: 1rem;
          font-weight: 850;
        }

        .sales-non-inventory-session-summary {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          border: 1px solid #bbf7d0;
          border-radius: 0.75rem;
          background: #f0fdf4;
          color: #14532d;
          padding: 0.7rem 0.85rem;
          font-size: 0.82rem;
          line-height: 1.35rem;
        }

        .sales-non-inventory-session-summary strong {
          color: #14532d;
          font-weight: 850;
        }

        .sales-non-inventory-field {
          display: grid;
          gap: 0.5rem;
          min-width: 0;
        }

        .sales-non-inventory-field label {
          color: #0f172a;
          font-size: 0.92rem;
          font-weight: 750;
        }

        .sales-non-inventory-control {
          min-height: 3rem;
          border-color: #dbe3ee;
          border-radius: 0.55rem;
          background: #ffffff;
          font-size: 0.95rem;
          box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
        }

        .sales-non-inventory-control:focus-visible {
          border-color: #ef0000;
          box-shadow: 0 0 0 3px rgba(239, 0, 0, 0.12);
        }

        .sales-non-inventory-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          border-top: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 1.2rem 1.65rem;
        }

        .sales-confirm-clear-cancel:hover,
        .sales-confirm-clear-cancel:focus-visible {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #0f172a;
        }

        .sales-confirm-clear-submit:hover,
        .sales-confirm-clear-submit:focus-visible {
          background: #dc2626;
          box-shadow: 0 8px 18px rgba(220, 38, 38, 0.16);
        }

        .sales-pos-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.12fr) minmax(420px, 0.98fr);
          gap: 1rem;
          align-items: stretch;
        }

        .sales-grid {
          grid-template-columns: minmax(0, 1.08fr) minmax(440px, 0.96fr);
          align-items: stretch;
        }

        .sales-grid > .sales-record-card:not(.sales-product-panel) {
          display: none;
        }

        .sales-product-panel {
          display: flex;
          gap: 0;
          min-height: calc(100vh - 16.5rem);
          max-height: calc(100vh - 11.5rem);
          flex-direction: column;
        }

        .sales-product-panel .sales-record-header {
          padding: 1rem 1rem 0.15rem;
        }

        .sales-product-header-row,
        .sales-sold-items-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .sales-context-action-button {
          min-height: 2.75rem;
          border-color: #e2e8f0;
          border-radius: 0.75rem;
          background: #ffffff;
          color: #334155;
          font-weight: 700;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
          padding: 0.75rem 1.25rem;
        }

        .sales-context-action-button:hover,
        .sales-context-action-button:focus-visible {
          border-color: #cbd5e1;
          background: #f1f5f9;
          color: #0f172a;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
        }

        .sales-context-action-button:active {
          transform: translateY(1px);
        }

        .sales-context-action-button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
          box-shadow: none;
          transform: none;
        }

        @media (max-width: 640px) {
          .sales-context-action-button {
            min-height: 2.5rem;
            font-size: 0.9rem;
            padding: 0.625rem 1rem;
          }
        }

        @media (max-width: 480px) {
          .sales-context-action-button {
            min-height: 2.25rem;
            font-size: 0.85rem;
            padding: 0.5rem 0.875rem;
          }
        }

        .sales-product-panel .sales-record-content {
          min-height: 0;
          flex: 1;
          gap: 0.65rem;
          grid-template-rows: auto minmax(0, 1fr) auto;
        }

        .sales-product-toolbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(160px, 0.28fr) minmax(175px, 0.3fr);
          gap: 0.75rem;
          align-items: center;
        }

        .sales-sold-items-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.55rem;
        }

        .sales-product-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 0.75rem;
          align-content: start;
          align-items: start;
          grid-auto-rows: max-content;
          min-height: 0;
          overflow-y: auto;
          padding-right: 0.25rem;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }

        .sales-pos-panel {
          display: flex;
          min-height: calc(100vh - 16.5rem);
          max-height: calc(100vh - 11.5rem);
          flex-direction: column;
          border-color: #e2e8f0;
          background: #ffffff;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
        }

        .sales-pos-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border-bottom: 1px solid #e2e8f0;
          padding: 1rem;
        }

        .sales-pos-panel-title {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 0.75rem;
        }

        .sales-pos-panel-title h3 {
          color: #0f172a;
          font-size: 1.05rem;
          font-weight: 800;
          line-height: 1.3rem;
        }

        .sales-pos-panel-title p {
          color: #64748b;
          font-size: 0.8rem;
          line-height: 1.15rem;
        }

        .sales-pos-icon {
          display: inline-flex;
          width: 2.4rem;
          height: 2.4rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 0.85rem;
          background: #f8fafc;
          color: #334155;
        }

        .sales-pos-content {
          display: flex;
          min-height: 0;
          flex: 1;
          flex-direction: column;
          gap: 0.85rem;
          padding: 1rem;
        }

        .sales-pos-customer-bar {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(13rem, 0.9fr);
          gap: 1.15rem;
          align-items: end;
        }

        .sales-checkout-card .sales-pos-customer-bar {
          grid-template-columns: minmax(0, 1fr);
          gap: 1rem;
          align-items: stretch;
        }

        .sales-checkout-card .sales-customer-staff-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem;
        }

        .sales-checkout-card .sales-invoice-customer-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem;
          align-items: end;
        }

        .sales-invoice-number-field {
          gap: 0.6rem;
          min-width: 0;
          max-width: none;
        }

        .sales-invoice-number-input {
          font-weight: 850;
          letter-spacing: 0;
          text-align: left;
        }

        .sales-invoice-input-row {
          display: grid;
          grid-template-columns: minmax(9rem, 1fr);
          gap: 0.5rem;
          align-items: stretch;
        }

        .sales-checkout-card .sales-invoice-input-row {
          grid-template-columns: minmax(0, 1fr);
          gap: 0.85rem;
        }

        .sales-invoice-helper {
          display: flex;
          align-items: flex-start;
          gap: 0.35rem;
          color: #475569;
          font-size: 0.72rem;
          font-weight: 650;
          line-height: 1.35;
        }

        .sales-invoice-helper svg {
          margin-top: 0.05rem;
          flex: 0 0 auto;
          width: 0.85rem;
          height: 0.85rem;
        }

        .sales-invoice-helper-error {
          color: #b91c1c;
        }

        .sales-invoice-helper-warning {
          color: #92400e;
        }

        .sales-invoice-sequence-note {
          display: grid;
          gap: 0.65rem;
          border: 1px solid #fde68a;
          border-radius: 0.75rem;
          background: #fffbeb;
          padding: 0.75rem;
        }

        .sales-invoice-sequence-textarea {
          min-height: 4.75rem;
          padding-top: 0.8rem;
          line-height: 1.4;
        }

        .sales-invoice-inline-note {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          color: #475569;
          font-size: 0.74rem;
          font-weight: 650;
          line-height: 1.4;
        }

        .sales-invoice-inline-note svg {
          flex: 0 0 auto;
          width: 0.86rem;
          height: 0.86rem;
          color: #2563eb;
        }

        .sales-invoice-inline-note span {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .sales-invoice-input-error,
        .sales-invoice-input-error:hover,
        .sales-invoice-input-error:focus,
        .sales-invoice-input-error:focus-visible {
          border-color: #dc2626;
          box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14);
        }

        .sales-customer-staff-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(10.5rem, 0.95fr);
          gap: 0.85rem 1rem;
          align-items: end;
          min-width: 0;
          margin-top: 0.7rem;
        }

        .sales-invoice-customer-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem 1rem;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
        }

        .sales-invoice-address-field {
          grid-column: 1 / -1;
        }

        .sales-invoice-input {
          min-height: 3.25rem;
          border-color: #e2e8f0;
          background: #ffffff;
          color: #0f172a;
          font-weight: 600;
          min-width: 0;
        }

        .sales-invoice-input::placeholder {
          color: #94a3b8;
          font-weight: 500;
        }

        .sales-invoice-input:hover {
          border-color: #facc15;
          box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.16);
        }

        .sales-invoice-input:focus,
        .sales-invoice-input:focus-visible {
          border-color: #facc15;
          box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.24);
        }

        .sales-pos-field {
          display: grid;
          gap: 0.45rem;
          min-width: 0;
        }

        .sales-checkout-card .sales-pos-field label {
          min-width: 0;
          overflow-wrap: anywhere;
          line-height: 1.25;
        }

        .sales-pos-search-row {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) minmax(180px, 0.34fr);
          gap: 0.75rem;
        }

        .sales-product-search {
          display: flex;
          min-height: 3rem;
          height: 3rem;
          align-items: center;
          gap: 0.65rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.8rem;
          background: #f8fafc;
          padding: 0 0.85rem;
          transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
        }

        .sales-product-search:focus-within {
          border-color: #f4f400;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(244, 244, 0, 0.28);
        }

        .sales-product-search input,
        .sales-product-search input:hover,
        .sales-product-search input:focus,
        .sales-product-search input:focus-visible {
          border-color: transparent !important;
          box-shadow: none !important;
          outline: none !important;
        }

        .sales-product-filter-trigger[data-slot="select-trigger"] {
          min-height: 3rem;
          height: 3rem;
          border-radius: 0.8rem;
          background: #f8fafc;
        }

        .sales-product-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border-top: 1px solid #e2e8f0;
          padding-top: 0.7rem;
        }

        .sales-product-pagination {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .sales-page-button {
          display: inline-flex;
          min-width: 2.15rem;
          height: 2.15rem;
          align-items: center;
          justify-content: center;
          border: 1px solid transparent;
          border-radius: 0.55rem;
          color: #334155;
          font-size: 0.82rem;
          font-weight: 750;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .sales-page-button:hover,
        .sales-page-button:focus-visible {
          border-color: #cbd5e1;
          background: #f8fafc;
          outline: none;
        }

        .sales-page-button-active,
        .sales-page-button-active:hover,
        .sales-page-button-active:focus-visible {
          border-color: #ef4444;
          background: #fff7f7;
          color: #dc2626;
        }

        .sales-page-button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .sales-product-count {
          color: #64748b;
          font-size: 0.78rem;
          font-weight: 650;
          white-space: nowrap;
        }

        .sales-product-browser {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
          gap: 0.75rem;
          min-height: 0;
          overflow-y: auto;
          padding-right: 0.25rem;
        }

        .sales-product-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(6.35rem, auto);
          grid-template-rows: 3.9rem minmax(2.5rem, 1fr);
          column-gap: 0.8rem;
          row-gap: 0.55rem;
          align-items: start;
          border: 1px solid #e2e8f0;
          border-radius: 0.95rem;
          background: #ffffff;
          height: 9.15rem;
          min-height: 9.15rem;
          padding: 0.9rem;
          text-align: left;
          transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
        }

        .sales-product-info {
          display: contents;
        }

        .sales-product-name {
          display: block;
          grid-column: 1;
          grid-row: 1;
          min-height: 3.9rem;
          max-height: 3.9rem;
          overflow: hidden;
          color: #0f172a;
          font-size: 0.9rem;
          font-weight: 800;
          line-height: 1.3rem;
          overflow-wrap: break-word;
          word-break: normal;
          white-space: normal;
        }

        .sales-product-code {
          display: block;
          min-width: 0;
          color: #111827;
          font-size: 0.76rem;
          line-height: 1.05rem;
          overflow-wrap: anywhere;
          white-space: normal;
        }

        .sales-product-details {
          display: grid;
          grid-column: 1;
          grid-row: 2;
          min-width: 0;
          gap: 0.35rem;
          align-self: center;
        }

        .sales-product-card:hover,
        .sales-product-card:focus-within {
          border-color: #cbd5e1;
          background: #f8fafc;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.07);
        }

        .sales-product-add-pill:hover,
        .sales-product-add-pill:focus-visible {
          border-color: #ef4444;
          background: #fee2e2;
          color: #b91c1c;
        }

        .sales-product-card.is-disabled {
          opacity: 0.65;
        }

        .sales-product-card.is-out-of-stock {
          background: #f8fafc;
        }

        .sales-product-card.is-selected {
          border-color: #94a3b8;
          background: #e2e8f0;
        }

        .sales-product-card.is-out-of-stock .sales-product-add-pill {
          border-color: #e2e8f0;
          background: #f1f5f9;
          color: #64748b;
        }

        .sales-product-card.is-selected .sales-product-add-pill {
          border-color: #64748b;
          background: #cbd5e1;
          color: #1f2937;
        }

        .sales-product-card.is-selected .sales-product-add-pill:hover,
        .sales-product-card.is-selected .sales-product-add-pill:focus-visible {
          border-color: #475569;
          background: #b8c2cf;
          color: #111827;
        }

        .sales-product-avatar {
          display: flex;
          width: 3.25rem;
          height: 3.25rem;
          align-items: center;
          justify-content: center;
          border-radius: 0.85rem;
          background: #f1f5f9;
          color: #334155;
        }

        .sales-product-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          color: #111827;
          font-size: 0.76rem;
          line-height: 1.1rem;
        }

        .sales-product-actions {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.75rem;
          align-items: center;
          padding-top: 0.35rem;
        }

        .sales-add-product-button {
          min-height: 2.3rem;
          border-color: #fecaca;
          color: #dc2626;
          font-weight: 700;
        }

        .sales-product-add-pill {
          display: inline-flex;
          min-height: 2.35rem;
          min-width: 6rem;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          border: 1px solid #fecaca;
          border-radius: 999px;
          background: #fff7f7;
          padding: 0 0.9rem;
          color: #dc2626;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 800;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .sales-product-add-pill:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .sales-product-card-action {
          display: contents;
          width: 6.7rem;
          height: 100%;
        }

        .sales-product-card-price {
          grid-column: 2;
          grid-row: 1;
          width: 100%;
          min-height: 1.25rem;
          align-self: start;
          justify-self: end;
          padding-top: 0.05rem;
          text-align: right;
        }

        .sales-product-card-action .sales-product-add-pill {
          grid-column: 2;
          grid-row: 2;
          align-self: center;
          justify-self: center;
        }

        @media (max-width: 640px) {
          .sales-product-card {
            grid-template-columns: minmax(0, 1fr) minmax(5.8rem, auto);
            gap: 0.65rem;
            padding: 0.8rem;
          }

          .sales-product-card-action {
            width: 6rem;
          }

          .sales-product-add-pill {
            min-width: 5.4rem;
            padding: 0 0.75rem;
          }
        }

        .sales-add-product-button:hover,
        .sales-add-product-button:focus-visible {
          border-color: #ef4444;
          background: #fef2f2;
          color: #b91c1c;
        }

        .sales-cart-list {
          display: grid;
          gap: 0.5rem;
          min-height: 0;
          max-height: min(24rem, 38vh);
          overflow-y: auto;
          overscroll-behavior: contain;
          padding-right: 0.25rem;
          scrollbar-gutter: stable;
        }

        .sales-cart-list::-webkit-scrollbar {
          width: 0.45rem;
        }

        .sales-cart-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .sales-cart-list::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: #cbd5e1;
        }

        .sales-cart-list::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        .sales-cart-row {
          --sales-cart-control-height: 2.18rem;
          --sales-cart-control-gap: 0.38rem;
          --sales-cart-control-radius: 0.72rem;
          container-type: inline-size;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.28rem 0.6rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.85rem;
          background: #ffffff;
          padding: 0.58rem 0.62rem;
          transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
        }

        .sales-cart-row:hover {
          border-color: #cbd5e1;
          background: #fdfdff;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
        }

        .sales-cart-main {
          min-width: 0;
          align-self: start;
        }

        .sales-cart-title {
          color: #0f172a;
          font-size: 0.92rem;
          font-weight: 800;
          line-height: 1.18rem;
          overflow-wrap: anywhere;
          white-space: normal;
        }

        .sales-cart-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-top: 0.18rem;
          color: #64748b;
          font-size: 0.75rem;
          line-height: 1.1rem;
        }

        .sales-cart-controls {
          display: flex;
          width: 100%;
          flex-wrap: wrap;
          grid-column: 1 / -1;
          gap: var(--sales-cart-control-gap);
          align-items: center;
          justify-content: flex-start;
          margin-top: 0.35rem;
          border-top: 1px solid #f1f5f9;
          padding-top: 0.42rem;
        }

        .sales-cart-secondary-controls {
          display: inline-flex;
          width: auto;
          flex-wrap: nowrap;
          align-items: center;
          justify-content: flex-start;
          gap: var(--sales-cart-control-gap);
          min-width: 0;
        }

        .sales-cart-status-actions {
          display: inline-flex;
          min-width: 0;
          align-items: center;
          justify-content: flex-start;
          flex-wrap: wrap;
          gap: var(--sales-cart-control-gap);
        }

        .sales-cart-stock-after {
          display: inline-flex;
          min-width: 4.9rem;
          min-height: var(--sales-cart-control-height);
          align-items: center;
          justify-content: center;
          border: 1px solid #bbf7d0;
          border-radius: var(--sales-cart-control-radius);
          background: #f0fdf4;
          padding: 0 0.58rem;
          color: #166534;
          font-size: 0.76rem;
          font-weight: 750;
          line-height: 1;
          white-space: nowrap;
        }

        .sales-cart-stock-after-muted {
          border-color: #e2e8f0;
          background: #f8fafc;
          color: #64748b;
        }

        .sales-cart-row-actions {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: var(--sales-cart-control-gap);
          white-space: nowrap;
        }

        .sales-cart-row-actions .sales-action-button {
          flex: 0 0 auto;
          width: var(--sales-cart-control-height);
          height: var(--sales-cart-control-height);
        }

        .sales-cart-quantity-field {
          width: 6.45rem;
          min-width: 0;
          max-width: 100%;
        }

        .sales-cart-control-label {
          display: none;
        }

        .sales-qty-stepper {
          display: grid;
          width: 6.45rem;
          max-width: 100%;
          min-height: var(--sales-cart-control-height);
          grid-template-columns: 1.7rem minmax(2.05rem, 1fr) 1.7rem;
          align-items: center;
          overflow: hidden;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #f8fafc;
        }

        .sales-qty-stepper button {
          display: inline-flex;
          width: 1.7rem;
          height: calc(var(--sales-cart-control-height) - 0.08rem);
          align-items: center;
          justify-content: center;
          color: #0f172a;
          transition: background-color 160ms ease;
        }

        .sales-qty-stepper button:hover,
        .sales-qty-stepper button:focus-visible {
          outline: none;
        }

        .sales-qty-button-decrease:hover,
        .sales-qty-button-decrease:focus-visible {
          background: #fee2e2;
          color: #b91c1c;
        }

        .sales-qty-button-increase:hover,
        .sales-qty-button-increase:focus-visible {
          background: #dcfce7;
          color: #15803d;
        }

        .sales-qty-stepper button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .sales-qty-stepper input {
          width: 100%;
          min-width: 0;
          height: 100%;
          border: 0;
          background: transparent;
          text-align: center;
          color: #0f172a;
          font-weight: 800;
          outline: none;
        }

        .sales-cart-price-field {
          display: inline-grid;
          min-width: 5.55rem;
          width: 5.55rem;
          min-height: var(--sales-cart-control-height);
        }

        .sales-cart-price-input {
          display: inline-flex;
          width: 100%;
          height: var(--sales-cart-control-height);
          min-height: var(--sales-cart-control-height);
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          border: 1px solid #e2e8f0;
          border-radius: var(--sales-cart-control-radius);
          background: #f8fafc;
          padding: 0 0.62rem;
          color: #0f172a;
          font-size: 0.84rem;
          font-weight: 750;
          line-height: 1;
          text-align: center;
          white-space: nowrap;
          transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
        }

        .sales-cart-price-input:hover {
          border-color: #facc15;
          background: #fffef0;
        }

        .sales-cart-price-input:focus {
          outline: none;
          border-color: #facc15;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.28);
        }

        .sales-cart-price-input:disabled {
          cursor: not-allowed;
          opacity: 0.72;
        }

        .sales-cart-row-actions .sales-cart-remove-button {
          width: auto;
          min-width: 5.05rem;
          height: var(--sales-cart-control-height);
          padding: 0 0.58rem;
          gap: 0.32rem;
        }

        .sales-cart-remove-label {
          display: inline;
          font-size: 0.74rem;
          font-weight: 750;
          line-height: 1;
          white-space: nowrap;
        }

        .sales-cart-edit-button:not(:disabled):hover,
        .sales-cart-edit-button:not(:disabled):focus-visible {
          background: #eff6ff !important;
          border-color: #bfdbfe !important;
          color: #1d4ed8 !important;
          box-shadow: none;
          transform: none;
        }

        .sales-cart-subtotal {
          align-self: start;
          color: #0f172a;
          font-size: 0.95rem;
          font-weight: 850;
          line-height: 1.2rem;
          text-align: right;
          white-space: nowrap;
        }

        .sales-cart-empty {
          display: grid;
          place-items: center;
          min-height: 7.5rem;
          border: 1px dashed #cbd5e1;
          border-radius: 0.9rem;
          background: #f8fafc;
          color: #64748b;
          text-align: center;
          padding: 1rem;
        }

        .sales-checkout-compact {
          display: grid;
          gap: 0.75rem;
          min-height: 0;
          overflow-y: auto;
          padding-right: 0.25rem;
        }

        .sales-total-strip {
          border: 1px solid #e2e8f0;
          border-radius: 0.9rem;
          background: #f8fafc;
          padding: 0.85rem;
        }

        .sales-total-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          color: #334155;
          font-size: 0.88rem;
          line-height: 1.35rem;
        }

        .sales-total-row-strong {
          margin-top: 0.55rem;
          border-top: 1px solid #e2e8f0;
          padding-top: 0.65rem;
          color: #0f172a;
          font-size: 1rem;
          font-weight: 800;
        }

        .sales-total-row-strong span:last-child {
          color: #dc2626;
          font-size: 1.35rem;
        }

        .sales-checkout-card {
          min-height: calc(100vh - 16.5rem);
          max-height: calc(100vh - 11.5rem);
        }

        .sales-checkout-content {
          min-height: 0;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }

        @media (max-width: 1100px) {
          .sales-pos-layout {
            grid-template-columns: 1fr;
          }

          .sales-pos-panel {
            min-height: auto;
            max-height: none;
          }

          .sales-product-browser,
          .sales-checkout-compact {
            max-height: none;
          }

          .sales-cart-list {
            max-height: min(26rem, 45vh);
          }

          .sales-product-toolbar {
            grid-template-columns: minmax(0, 1fr) minmax(150px, 0.35fr) minmax(165px, 0.35fr);
          }

          .sales-grid {
            grid-template-columns: 1fr;
          }

          .sales-grid > .sales-record-card:not(.sales-product-panel) {
            display: none;
          }

          .sales-product-panel,
          .sales-checkout-card {
            min-height: auto;
            max-height: none;
          }

          .sales-side-panel {
            position: static;
          }

          .sales-checkout-card .sales-customer-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .sales-payment-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .sales-history-layout {
            grid-template-columns: 1fr;
            flex: 1;
            overflow: hidden;
          }

          .sales-history-filter-panel {
            grid-template-columns: 1fr;
          }

          .sales-history-filter-controls {
            grid-template-columns: minmax(13rem, 1fr) minmax(8.5rem, auto) minmax(8.5rem, auto);
          }

          .sales-history-list {
            overflow-y: auto;
            max-height: 62vh;
            padding-right: 0.2rem;
          }

          .sales-history-detail {
            display: none;
          }

          .sales-history-mobile-detail {
            display: block;
          }

          .sales-history-record-button-selected .sales-history-arrow-right {
            display: none;
          }

          .sales-history-record-button-selected .sales-history-arrow-down {
            display: block;
          }

          .sales-history-items-table {
            grid-template-columns: 1fr;
            row-gap: 0.75rem;
          }

          .sales-history-detail-header {
            gap: 0.85rem;
            margin-bottom: 1rem;
            padding-bottom: 1rem;
          }

          .sales-history-detail-actions {
            grid-template-columns: 1fr;
          }

          .sales-history-detail-title-row {
            align-items: flex-start;
          }

          .sales-history-detail-date-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 860px) {
          .sales-non-inventory-dialog {
            width: min(420px, calc(100vw - 1rem));
            max-width: min(420px, calc(100vw - 1rem)) !important;
            max-height: 90vh;
            overflow-y: auto;
          }

          .sales-non-inventory-content {
            gap: 0.8rem;
          }

          .sales-non-inventory-header {
            gap: 0.75rem;
            padding: 1rem 1rem 0;
          }

          .sales-non-inventory-icon {
            width: 2.85rem;
            height: 2.85rem;
            border-radius: 0.85rem;
          }

          .sales-non-inventory-header svg {
            width: 1.35rem;
            height: 1.35rem;
          }

          .sales-non-inventory-alert {
            margin: 0 1rem;
            align-items: flex-start;
            padding: 0.65rem 0.75rem;
            font-size: 0.82rem;
            line-height: 1.35rem;
          }

          .sales-non-inventory-form {
            gap: 0.8rem;
            padding: 0 1rem 1rem;
          }

          .sales-non-inventory-grid {
            grid-template-columns: minmax(7.25rem, 0.48fr) minmax(0, 1fr);
            gap: 0.75rem;
            align-items: end;
          }

          .sales-non-inventory-grid .sales-non-inventory-field:nth-child(3) {
            grid-column: 1 / -1;
          }

          .sales-non-inventory-quantity-control {
            grid-template-columns: minmax(3.75rem, 1fr) 2.65rem;
            max-width: 10rem;
          }

          .sales-non-inventory-control {
            min-height: 2.75rem;
          }

          .sales-non-inventory-quantity-control .sales-non-inventory-control {
            min-height: 2.75rem;
            padding: 0 0.55rem;
          }

          .sales-non-inventory-quantity-buttons {
            width: 2.65rem;
          }

          .sales-non-inventory-quantity-button {
            min-height: 1.375rem;
          }

          .sales-non-inventory-total {
            padding: 0.7rem 0.8rem;
          }

          .sales-non-inventory-footer {
            flex-direction: column-reverse;
            gap: 0.65rem;
            padding: 0.9rem 1rem;
          }

          .sales-non-inventory-footer button {
            width: 100%;
          }
        }

        @media (max-width: 760px) {
          .sales-page {
            padding: 10px;
            margin-top: 0;
          }

          .sales-line-fields {
            grid-template-columns: 1fr;
          }

          .sales-product-toolbar,
          .sales-pos-customer-bar,
          .sales-customer-staff-row,
          .sales-invoice-customer-grid,
          .sales-pos-search-row {
            grid-template-columns: 1fr;
          }

          .sales-checkout-card .sales-customer-staff-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.75rem;
          }

          .sales-checkout-card .sales-invoice-customer-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.75rem;
          }

          .sales-checkout-card .sales-invoice-address-field {
            grid-column: 1 / -1;
          }

          .sales-invoice-input-row {
            grid-template-columns: minmax(0, 1fr);
          }

          .sales-checkout-card .sales-invoice-input-row {
            grid-template-columns: minmax(0, 1fr);
            gap: 0.75rem;
          }

          .sales-product-header-row,
          .sales-sold-items-toolbar {
            align-items: stretch;
            flex-direction: column;
          }

          .sales-sold-items-toolbar .sales-section-heading {
            width: 100%;
          }

          .sales-sold-items-actions {
            width: 100%;
          }

          .sales-sold-items-actions .sales-context-action-button,
          .sales-product-header-row .sales-context-action-button {
            width: 100%;
          }

          .sales-product-footer {
            align-items: stretch;
            flex-direction: column;
            gap: 0.65rem;
          }

          .sales-product-pagination {
            justify-content: center;
            flex-wrap: wrap;
          }

          .sales-product-count {
            text-align: center;
          }

          .sales-cart-controls {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr);
            gap: 0.42rem;
            align-items: center;
            justify-content: stretch;
            border-radius: 0;
            background: transparent;
            padding: 0.42rem 0 0;
          }

          .sales-cart-quantity-field {
            display: block;
            width: 6.75rem;
            min-width: 0;
          }

          .sales-cart-controls .sales-qty-stepper {
            width: 6.75rem;
            max-width: 100%;
            min-height: var(--sales-cart-control-height);
            grid-template-columns: 1.7rem minmax(2.05rem, 1fr) 1.7rem;
            background: #ffffff;
            border-radius: var(--sales-cart-control-radius);
          }

          .sales-cart-controls .sales-qty-stepper input {
            width: 100%;
            min-width: 0;
            padding: 0;
            justify-self: stretch;
            text-align: center;
          }

          .sales-cart-secondary-controls {
            display: inline-flex;
            width: 100%;
            flex-wrap: nowrap;
            align-items: center;
            justify-content: flex-start;
            gap: 0.42rem;
            min-width: 0;
          }

          .sales-cart-status-actions {
            display: inline-flex;
            align-items: center;
            justify-content: flex-start;
            flex-wrap: nowrap;
            gap: 0.42rem;
            min-width: 0;
          }

          .sales-cart-control-label {
            display: none;
          }

          .sales-cart-price-field {
            width: 5.8rem;
            min-width: 5.8rem;
          }

          .sales-cart-price-input {
            height: var(--sales-cart-control-height);
            min-height: var(--sales-cart-control-height);
            border-radius: var(--sales-cart-control-radius);
          }

          .sales-cart-stock-after {
            width: 5.8rem;
            min-height: var(--sales-cart-control-height);
            border-radius: var(--sales-cart-control-radius);
          }

          .sales-cart-row-actions {
            align-self: stretch;
            align-items: center;
            justify-content: flex-end;
            gap: var(--sales-cart-control-gap);
          }

          .sales-cart-row-actions .sales-action-button {
            height: var(--sales-cart-control-height);
            width: var(--sales-cart-control-height);
          }

          .sales-cart-row-actions .sales-cart-remove-button {
            width: auto;
            min-width: 5.9rem;
            height: var(--sales-cart-control-height);
          }

          .sales-cart-list {
            max-height: min(22rem, 45vh);
            padding-right: 0.15rem;
          }

          @media (max-width: 430px) {
            .sales-cart-controls {
              display: grid;
              grid-template-columns: auto minmax(0, 1fr);
              gap: 0.36rem;
            }

            .sales-cart-quantity-field,
            .sales-cart-controls .sales-qty-stepper {
              width: 5.7rem;
            }

            .sales-cart-secondary-controls {
              display: inline-flex;
              flex-wrap: nowrap;
              justify-content: flex-start;
              width: 100%;
              min-width: 0;
              gap: 0.36rem;
            }

            .sales-cart-price-field {
              width: 5rem;
              min-width: 5rem;
            }

            .sales-cart-price-input {
              padding: 0 0.42rem;
              font-size: 0.78rem;
            }

            .sales-cart-status-actions {
              grid-column: auto;
              justify-content: flex-start;
              flex-wrap: nowrap;
              gap: 0.36rem;
            }

            .sales-cart-stock-after {
              width: 5rem;
              min-height: var(--sales-cart-control-height);
              padding: 0 0.42rem;
              font-size: 0.72rem;
            }

            .sales-cart-row-actions .sales-cart-remove-button {
              width: var(--sales-cart-control-height);
              min-width: var(--sales-cart-control-height);
              padding: 0;
            }

            .sales-cart-remove-label {
              display: none;
            }
          }

          @container (max-width: 320px) {
            .sales-cart-controls {
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 0.36rem;
              align-items: center;
            }

            .sales-cart-quantity-field,
            .sales-cart-controls .sales-qty-stepper {
              width: 100%;
            }

            .sales-cart-controls .sales-qty-stepper {
              grid-template-columns: 1.7rem minmax(2.1rem, 1fr) 1.7rem;
            }

            .sales-cart-status-actions {
              display: contents;
            }

            .sales-cart-secondary-controls {
              display: contents;
            }

            .sales-cart-price-field,
            .sales-cart-stock-after {
              min-width: 0;
            }

            .sales-cart-price-input,
            .sales-cart-stock-after {
              padding: 0 0.38rem;
              font-size: 0.74rem;
            }

            .sales-cart-price-field {
              grid-column: 2;
              width: 5.35rem;
            }

            .sales-cart-stock-after {
              grid-column: 1;
              width: 100%;
            }

            .sales-cart-row-actions .sales-action-button,
            .sales-cart-row-actions .sales-cart-remove-button {
              width: var(--sales-cart-control-height);
              min-width: var(--sales-cart-control-height);
              height: var(--sales-cart-control-height);
            }

            .sales-cart-row-actions {
              grid-column: 2;
              justify-content: flex-end;
              gap: 0.32rem;
            }
          }

          @container (max-width: 270px) {
            .sales-cart-controls {
              gap: 0.3rem;
            }

            .sales-cart-price-field {
              width: 4.75rem;
            }

            .sales-cart-price-input {
              font-size: 0.7rem;
            }

            .sales-cart-stock-after {
              font-size: 0.7rem;
            }

            .sales-cart-row-actions {
              gap: 0.25rem;
            }

            .sales-cart-row-actions .sales-action-button,
            .sales-cart-row-actions .sales-cart-remove-button {
              width: 2rem;
              min-width: 2rem;
              height: 2rem;
            }
          }

          .sales-customer-grid,
          .sales-payment-grid {
            grid-template-columns: 1fr;
          }

          .sales-checkout-card .sales-pos-customer-bar,
          .sales-checkout-card .sales-customer-grid {
            grid-template-columns: 1fr;
          }

          .sales-summary-grid,
          .sales-checkout-card .sales-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          @media (max-width: 360px) {
            .sales-summary-grid,
            .sales-checkout-card .sales-summary-grid {
              grid-template-columns: 1fr;
            }
          }

          @media (max-width: 430px) {
            .sales-checkout-card .sales-customer-staff-row,
            .sales-checkout-card .sales-invoice-customer-grid {
              grid-template-columns: 1fr;
            }
          }

          .sales-stock-preview {
            grid-template-columns: 1fr;
          }

          .sales-stock-preview-item + .sales-stock-preview-item {
            border-left: 0;
            border-top: 0;
          }

          .sales-page-toolbar {
            justify-content: stretch;
          }

          .sales-record-header {
            padding: 1rem 1rem 0.85rem;
          }

          .sales-record-content {
            padding: 0 1rem 1rem;
          }

          .sales-form-section {
            padding: 0.85rem;
          }

          .sales-form-actions {
            flex-direction: column-reverse;
          }

          .sales-form-actions .sales-action-button {
            width: 100%;
          }

          .sales-history-dialog {
            width: calc(100vw - 1rem);
            max-height: 92vh;
          }

          .sales-history-filter-panel {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }

          .sales-history-filter-controls {
            grid-template-columns: 1fr;
            gap: 0.6rem;
          }

          .sales-history-filter,
          .sales-history-count-pill {
            width: 100%;
            min-width: 0;
          }

          .sales-history-row {
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 0.9rem;
          }

          .sales-history-filter {
            width: 100%;
            min-width: 0;
          }

          .sales-history-body {
            overflow: hidden;
            gap: 0.85rem;
            padding-left: 1rem;
            padding-right: 1rem;
          }

          .sales-history-layout {
            gap: 0.9rem;
          }

          .sales-history-list {
            max-height: 58vh;
          }

          .sales-history-mobile-detail .grid {
            grid-template-columns: 1fr;
          }

          .sales-confirm-clear-dialog {
            width: min(390px, calc(100vw - 1.5rem));
          }

          .sales-confirm-clear-content {
            padding: 1.1rem;
          }

          .sales-confirm-clear-header {
            align-items: center;
            gap: 0.85rem;
          }

          .sales-confirm-clear-icon {
            width: 2.5rem;
            height: 2.5rem;
          }

          .sales-confirm-clear-message {
            margin-top: 0.9rem;
            max-width: none;
          }

          .sales-confirm-clear-actions {
            flex-direction: column-reverse;
            gap: 0.75rem;
            margin-top: 1.1rem;
          }

          .sales-confirm-clear-actions button,
          .sales-non-inventory-footer button,
          .sales-receipt-actions button {
            width: 100%;
          }

          .sales-selected-items-header {
            align-items: stretch;
            flex-direction: column;
          }

          .sales-selected-items-actions {
            display: grid;
            grid-template-columns: 1fr;
            justify-content: stretch;
            width: 100%;
          }

          .sales-selected-items-action {
            width: 100%;
          }

          .sales-non-inventory-dialog {
            width: min(420px, calc(100vw - 1rem));
            max-width: min(420px, calc(100vw - 1rem)) !important;
            max-height: 90vh;
            overflow-y: auto;
          }

          .sales-non-inventory-header {
            grid-template-columns: auto minmax(0, 1fr);
            gap: 0.75rem;
            padding: 1rem 1rem 0;
          }

          .sales-non-inventory-icon {
            width: 2.85rem;
            height: 2.85rem;
            border-radius: 0.85rem;
          }

          .sales-non-inventory-alert {
            margin: 0 1rem;
            align-items: flex-start;
            padding: 0.65rem 0.75rem;
            font-size: 0.82rem;
            line-height: 1.35rem;
          }

          .sales-non-inventory-form {
            gap: 0.85rem;
            padding: 0 1rem 1rem;
          }

          .sales-non-inventory-grid {
            grid-template-columns: minmax(7.25rem, 0.48fr) minmax(0, 1fr);
            gap: 0.75rem;
            align-items: end;
          }

          .sales-non-inventory-grid .sales-non-inventory-field:nth-child(3) {
            grid-column: 1 / -1;
          }

          .sales-non-inventory-quantity-control {
            grid-template-columns: minmax(3.75rem, 1fr) 2.65rem;
            max-width: 10rem;
          }

          .sales-non-inventory-control {
            min-height: 2.75rem;
          }

          .sales-non-inventory-quantity-control .sales-non-inventory-control {
            min-height: 2.75rem;
            padding: 0 0.55rem;
          }

          .sales-non-inventory-quantity-buttons {
            width: 2.65rem;
          }

          .sales-non-inventory-quantity-button {
            min-height: 1.375rem;
          }

          .sales-non-inventory-footer {
            flex-direction: column-reverse;
            gap: 0.65rem;
            padding: 0.9rem 1rem;
          }

          .sales-receipt-actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <PageHeader
        title="Sales Recording"
        subtitle="Record sold items and automatically update inventory."
        icon={<ReceiptText className="h-8 w-8" />}
        userBranch={user?.branch}
      />

      <div className="sales-page">
        <div className="sales-page-toolbar">
          <Button
            type="button"
            variant="outline"
            className="sales-action-button sales-view-all-button"
            onClick={() => {
              setSelectedHistorySaleId('');
              setIsHistoryOpen(true);
            }}
          >
            <History className="h-4 w-4" />
            Sales History
          </Button>
        </div>

        <div className="sales-grid">
          <Card className="sales-record-card sales-product-panel overflow-hidden bg-white">
            <CardHeader className="sales-record-header">
              <div className="sales-product-header-row">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <PackageCheck className="h-5 w-5" />
                  </span>
                  Select Items
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  className="sales-action-button sales-context-action-button"
                  onClick={addManualLine}
                  disabled={isSaving}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Non-Inventory
                </Button>
              </div>
            </CardHeader>
            <CardContent className="sales-record-content min-h-0">
              <div className="sales-product-toolbar">
                <div className="sales-product-search">
                  <Search className="h-5 w-5 shrink-0 text-slate-500" />
                  <Input
                    value={productSearch}
                    onChange={event => setProductSearch(event.target.value)}
                    placeholder="Search name, code, category, supplier, size, color"
                    className="h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0"
                  />
                </div>
                <Select value={productCategory} onValueChange={setProductCategory}>
                  <SelectTrigger className="sales-product-filter-trigger border-slate-200">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    {productCategories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category === 'all' ? 'All Categories' : category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={productSort} onValueChange={setProductSort}>
                  <SelectTrigger className="sales-product-filter-trigger border-slate-200">
                    <SelectValue placeholder="Sort items" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name_az">Sort: Name A-Z</SelectItem>
                    <SelectItem value="name_za">Sort: Name Z-A</SelectItem>
                    <SelectItem value="stock_low">Sort: Stock Low</SelectItem>
                    <SelectItem value="stock_high">Sort: Stock High</SelectItem>
                    <SelectItem value="price_low">Sort: Price Low</SelectItem>
                    <SelectItem value="price_high">Sort: Price High</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="sales-product-list">
                {filteredSaleInventory.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                    <p>No available inventory items match the selected filters.</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="sales-action-button sales-context-action-button mt-3"
                      onClick={addManualLine}
                      disabled={isSaving}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Non-Inventory Item
                    </Button>
                  </div>
                ) : paginatedSaleInventory.map(item => {
                  const defaultPrice = Number(item.defaultSellingPrice || 0);
                  const existingLine = saleLines.find(line => String(line.inventoryId) === String(item.id));
                  const selectedQuantity = Number(existingLine?.quantity || 0);
                  const isOutOfStock = Number(item.quantity || 0) <= 0;
                  const isAlreadySelected = selectedQuantity > 0;
                  return (
                    <div
                      key={item.id}
                      className={`sales-product-card${isOutOfStock ? ' is-out-of-stock' : ''}${isAlreadySelected ? ' is-selected' : ''}${isSaving ? ' is-disabled' : ''}`}
                    >
                      <span className="sales-product-info">
                        <span className="sales-product-name" title={item.name}>
                          {item.name}
                        </span>
                        <span className="sales-product-details">
                          <span className="sales-product-code" title={item.itemCode || 'No item code'}>
                            {item.itemCode || 'No item code'}
                          </span>
                          <span className="sales-product-meta">
                            <span>{item.category || 'Uncategorized'}</span>
                            <span>&middot;</span>
                            <span>{item.quantity} unit{Number(item.quantity) === 1 ? '' : 's'}</span>
                            {selectedQuantity > 0 && (
                              <>
                                <span>&middot;</span>
                                <span>{selectedQuantity} selected</span>
                              </>
                            )}
                          </span>
                        </span>
                      </span>
                      <span className="sales-product-card-action">
                        <strong className="sales-product-card-price whitespace-nowrap text-sm text-slate-900">
                          {defaultPrice > 0 ? formatCurrency(defaultPrice) : 'No price'}
                        </strong>
                        <button
                          type="button"
                          className="sales-product-add-pill"
                          onClick={() => addInventoryItemToSale(item)}
                          disabled={isSaving || isOutOfStock}
                          aria-label={`${isAlreadySelected ? 'Already added: ' : isOutOfStock ? 'Out of stock: ' : 'Add '}${item.name}`}
                        >
                          <ShoppingCart className="h-4 w-4" />
                          {isAlreadySelected ? 'Added' : isOutOfStock ? 'Out' : 'Add'}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="sales-product-footer">
                <div className="sales-product-pagination" aria-label="Item pagination">
                  <button
                    type="button"
                    className="sales-page-button"
                    onClick={() => setProductPage(page => Math.max(1, page - 1))}
                    disabled={safeProductPage <= 1}
                    aria-label="Previous item page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {productPageNumbers.map(pageNumber => (
                    <button
                      key={pageNumber}
                      type="button"
                      className={`sales-page-button${pageNumber === safeProductPage ? ' sales-page-button-active' : ''}`}
                      onClick={() => setProductPage(pageNumber)}
                      aria-label={`Go to item page ${pageNumber}`}
                      aria-current={pageNumber === safeProductPage ? 'page' : undefined}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="sales-page-button"
                    onClick={() => setProductPage(page => Math.min(productPageCount, page + 1))}
                    disabled={safeProductPage >= productPageCount}
                    aria-label="Next item page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <span className="sales-product-count">
                  {filteredSaleInventory.length === 0
                    ? '0 items'
                    : `${productItemStart}-${productItemEnd} of ${filteredSaleInventory.length} item${filteredSaleInventory.length === 1 ? '' : 's'}`}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="sales-record-card overflow-hidden bg-white">
            <CardHeader className="sales-record-header">
              <CardTitle className="flex items-center gap-2 text-xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <ShoppingCart className="h-5 w-5" />
                </span>
                Record Sale
              </CardTitle>
            </CardHeader>
            <CardContent className="sales-record-content">
              <div className="sales-form-section sales-customer-section">
                <div className="sales-customer-grid">
                  <div className="space-y-2">
                    <Label htmlFor="customer-type">Customer Type</Label>
                    <Select value={customerType} onValueChange={setCustomerType}>
                      <SelectTrigger id="customer-type" className="sales-customer-control">
                        <SelectValue placeholder="Select customer type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="walk_in">Walk-in Customer</SelectItem>
                        <SelectItem value="sister_company">Sister Company</SelectItem>
                        <SelectItem value="hardware_reseller">Other Hardware / Reseller</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sold By</Label>
                    <div className="sales-readonly-user">
                      <User />
                      <span className="sales-readonly-user-name">
                        {user?.fullName || user?.username || 'Current user'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sales-form-section">
                <div className="sales-sold-items-toolbar">
                  <div className="sales-section-heading mb-0">
                    <span className="sales-section-icon sales-section-icon-accent">
                      <PackageCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="sales-section-title">Sold Items</h3>
                    </div>
                  </div>
                  <div className="sales-sold-items-actions">
                    <Button
                      type="button"
                      variant="outline"
                      className="sales-action-button sales-context-action-button"
                      onClick={addLine}
                      disabled={isSaving}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Another Item
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="sales-action-button sales-context-action-button"
                      onClick={addManualLine}
                      disabled={isSaving}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Non-Inventory
                    </Button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {saleLines.map((line, index) => {
                    const selectedItem = getInventoryById(line.inventoryId);
                    const usedByOtherLine = new Set(
                      saleLines
                        .map((entry, entryIndex) => entryIndex !== index ? entry.inventoryId : '')
                        .filter(Boolean)
                    );

                  return (
                    <div key={`sale-line-${index}`} className="sales-line-card">
                        <div className="sales-line-title-row">
                          <p className="font-semibold text-slate-900">Item {index + 1}</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="sales-action-button border-red-200 text-red-600 hover:border-red-500 hover:bg-red-50 hover:text-red-700"
                            onClick={() => removeLine(index)}
                            disabled={isSaving}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>

                        <div className="sales-line-fields">
                        {line.isManual ? (
                          <>
                            <div className="space-y-2">
                              <Label>Non-Inventory Item Description <span className="text-red-600">*</span></Label>
                              <Input
                                value={line.itemName}
                                maxLength={150}
                                placeholder="e.g., hinges, catches, delivery charge item"
                                disabled={isSaving}
                                onChange={event => updateLine(index, 'itemName', event.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Category</Label>
                              <Select
                                value={line.category || 'Other'}
                                onValueChange={value => {
                                  updateLine(index, 'category', value);
                                  if (value !== 'Other') {
                                    updateLine(index, 'categoryNote', '');
                                  }
                                }}
                                disabled={isSaving}
                              >
                                <SelectTrigger className="sales-customer-control">
                                  <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getNonInventoryCategories().map(category => (
                                    <SelectItem key={category} value={category}>{category}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {(line.category || 'Other') === 'Other' && (
                                <div className="space-y-1">
                                  <Label className="text-xs font-semibold text-slate-700">Optional: note</Label>
                                  <Textarea
                                    value={line.categoryNote || ''}
                                    maxLength={240}
                                    placeholder="E.g., Special-order item not listed in inventory."
                                    disabled={isSaving}
                                    className="min-h-[64px] resize-y text-sm"
                                    onChange={event => updateLine(index, 'categoryNote', event.target.value.slice(0, 240))}
                                  />
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="space-y-2">
                            <Label>Inventory Item <span className="text-red-600">*</span></Label>
                            <select
                              value={line.inventoryId}
                              onChange={event => updateLineInventoryItem(index, event.target.value)}
                              disabled={isSaving}
                              className="sales-native-select"
                            >
                              <option value="">
                                {activeInventory.length === 0 ? 'No items with available stock' : 'Select sold item'}
                              </option>
                              {activeInventory.map(item => (
                                <option
                                  key={item.id}
                                  value={String(item.id)}
                                  disabled={usedByOtherLine.has(String(item.id))}
                                >
                                  {item.itemCode ? `${item.itemCode} - ` : ''}{item.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label>Quantity Sold <span className="text-red-600">*</span></Label>
                          <Input
                            type="text"
                            min="1"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="e.g., 2"
                            value={line.quantity}
                            disabled={isSaving}
                            onChange={event => updateLineQuantity(
                              index,
                              sanitizeWholeNumberInput(event.target.value, 'Quantity sold', 'sales-quantity-numbers-only')
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Unit Price</Label>
                          <div className="sales-readonly-price">
                            {line.unitPrice ? formatCurrency(line.unitPrice) : 'Select item first'}
                          </div>
                        </div>
                      </div>

                      <div className="sales-stock-preview mt-4 text-sm">
                        {line.isManual ? (
                          <div className="sales-stock-preview-item sales-stock-preview-item-muted">
                            <span className="sales-stock-preview-icon">
                              <Info className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <span className="sales-stock-preview-label">Non-Inventory Item</span>
                              <strong className="sales-stock-preview-value">Recorded in sales only</strong>
                            </div>
                          </div>
                        ) : (
                          <>
                        <div className={`sales-stock-preview-item ${selectedItem ? 'sales-stock-preview-item-ok' : 'sales-stock-preview-item-muted'}`}>
                          <span className="sales-stock-preview-icon">
                            <PackageCheck className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <span className="sales-stock-preview-label">Current Stock</span>
                            <strong className="sales-stock-preview-value">{selectedItem ? `${selectedItem.quantity} unit${Number(selectedItem.quantity) === 1 ? '' : 's'}` : 'Select item'}</strong>
                          </div>
                        </div>
                        <div className={`sales-stock-preview-item ${selectedItem ? 'sales-stock-preview-item-warning' : 'sales-stock-preview-item-muted'}`}>
                          <span className="sales-stock-preview-icon">
                            <AlertTriangle className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <span className="sales-stock-preview-label">Low-Stock Threshold</span>
                            <strong className="sales-stock-preview-value">{selectedItem ? `${selectedItem.reorderLevel} unit${Number(selectedItem.reorderLevel) === 1 ? '' : 's'}` : 'Select item'}</strong>
                          </div>
                        </div>
                        <div className={`sales-stock-preview-item ${
                          selectedItem && Number(line.quantity || 0) > Number(selectedItem.quantity || 0)
                            ? 'sales-stock-preview-item-danger'
                            : selectedItem && line.quantity !== ''
                              ? 'sales-stock-preview-item-ok'
                              : 'sales-stock-preview-item-muted'
                        }`}>
                          <span className="sales-stock-preview-icon">
                            <TrendingUp className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <span className="sales-stock-preview-label">After Sale</span>
                            <strong className={`sales-stock-preview-value ${selectedItem && Number(line.quantity || 0) > Number(selectedItem.quantity || 0) ? 'text-red-700' : ''}`}>
                              {selectedItem && line.quantity !== ''
                                ? Number(line.quantity || 0) > Number(selectedItem.quantity || 0)
                                  ? 'Exceeds Current Stock'
                                  : `${Number(selectedItem.quantity || 0) - Number(line.quantity || 0)} unit${Math.abs(Number(selectedItem.quantity || 0) - Number(line.quantity || 0)) === 1 ? '' : 's'}`
                                : 'Enter quantity'}
                            </strong>
                          </div>
                        </div>
                          </>
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </CardContent>
          </Card>

          <div className="sales-side-panel">
            <Card className="sales-checkout-card gap-0 overflow-hidden bg-white">
              <CardHeader className="sales-checkout-header">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <Wallet className="h-5 w-5" />
                    </span>
                    Checkout Summary
                  </CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="sales-action-button sales-view-all-button shrink-0"
                    onClick={() => {
                      setSelectedHistorySaleId('');
                      setIsHistoryOpen(true);
                    }}
                  >
                    <History className="h-4 w-4" />
                    History
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="sales-checkout-content">
                <div className="sales-form-section sales-checkout-section bg-slate-50/60">
                  <div className="sales-pos-customer-bar">
                    <div className="sales-pos-field sales-invoice-number-field">
                      <Label htmlFor="sale-official-invoice-number">
                        Sales Invoice No. <span className="text-red-600">*</span>
                      </Label>
                      <div className="sales-invoice-input-row">
                        <Input
                          id="sale-official-invoice-number"
                          value={officialInvoiceNumber}
                          maxLength={6}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          disabled={isSaving}
                          aria-invalid={hasDuplicateOfficialInvoiceNumber || isOfficialInvoiceBehindSequence}
                          onChange={event => {
                            const nextValue = sanitizeInvoiceNumberInput(event.target.value);
                            if (event.target.value !== nextValue) {
                              toast.warning('Sales Invoice Number accepts numbers only.', {
                                id: 'sales-invoice-number-digits-only'
                              });
                            }
                            setHasManualInvoiceEntry(true);
                            setAutoFilledInvoiceNumber('');
                            setOfficialInvoiceNumber(nextValue);
                          }}
                          onBlur={() => setOfficialInvoiceNumber(prev => sanitizeInvoiceNumberInput(prev))}
                          placeholder="6-digit SI no."
                          className={`sales-invoice-input sales-invoice-number-input ${hasDuplicateOfficialInvoiceNumber || isOfficialInvoiceBehindSequence ? 'sales-invoice-input-error' : ''}`}
                        />
                      </div>
                      <p className="sales-invoice-inline-note">
                        <ReceiptText />
                        <span>{invoiceNumberGuidanceText}</span>
                      </p>
                      {shouldShowInvoiceSequenceNote && (
                        <div className="sales-invoice-sequence-note">
                          <p className="sales-invoice-helper sales-invoice-helper-warning">
                            <AlertTriangle />
                            <span>
                              This entry skips Sales Invoice No. {skippedInvoiceRangeText}. Note the booklet reason before saving.
                            </span>
                          </p>
                          <div className="sales-pos-field">
                            <Label htmlFor="sale-invoice-sequence-reason">Booklet Note</Label>
                            <Textarea
                              id="sale-invoice-sequence-reason"
                              value={invoiceSequenceExceptionReason}
                              maxLength={240}
                              disabled={isSaving}
                              onChange={event => setInvoiceSequenceExceptionReason(event.target.value.slice(0, 240))}
                              placeholder="Example: Previous SI page was spoiled, cancelled, or already written."
                              className="sales-invoice-input sales-invoice-sequence-textarea"
                            />
                          </div>
                        </div>
                      )}
                      {isOfficialInvoiceBehindSequence && !duplicateOfficialInvoiceSale && (
                        <p className="sales-invoice-helper sales-invoice-helper-error">
                          <AlertTriangle />
                          <span>
                            This number is behind the current sequence. Use {suggestedOfficialInvoiceNumber} or the next number printed in the booklet.
                          </span>
                        </p>
                      )}
                      {hasDuplicateOfficialInvoiceNumber && (
                        <p className="sales-invoice-helper sales-invoice-helper-error">
                          <AlertTriangle />
                          <span>This number is already recorded in Sales History.</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="sales-customer-staff-row">
                    <div className="sales-pos-field">
                      <Label
                        id="customer-type-label"
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer"
                        onPointerDown={event => {
                          event.preventDefault();
                          if (!isSaving) {
                            setIsCustomerTypeOpen(true);
                          }
                        }}
                        onKeyDown={event => {
                          if ((event.key === 'Enter' || event.key === ' ') && !isSaving) {
                            event.preventDefault();
                            setIsCustomerTypeOpen(true);
                          }
                        }}
                      >
                        Customer Type
                      </Label>
                      <Select value={customerType} open={isCustomerTypeOpen} onOpenChange={setIsCustomerTypeOpen} onValueChange={setCustomerType}>
                        <SelectTrigger id="customer-type" aria-labelledby="customer-type-label" className="sales-customer-control">
                          <SelectValue placeholder="Select customer type" />
                        </SelectTrigger>
                        <SelectContent align="start" side="bottom" sideOffset={6}>
                          <SelectItem value="walk_in">Walk-in Customer</SelectItem>
                          <SelectItem value="sister_company">Sister Company</SelectItem>
                          <SelectItem value="hardware_reseller">Other Hardware / Reseller</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sales-pos-field">
                      <Label>Sold By</Label>
                      <div className="sales-readonly-user">
                        <User />
                        <span className="sales-readonly-user-name">
                          {user?.fullName || user?.username || 'Current user'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="sales-invoice-customer-grid" aria-label="Invoice customer details">
                    <div className="sales-pos-field">
                      <Label htmlFor="sale-customer-name">Registered Name, optional</Label>
                      <Input
                        id="sale-customer-name"
                        value={customerName}
                        maxLength={160}
                        disabled={isSaving}
                        onChange={event => setCustomerName(event.target.value)}
                        placeholder="Leave blank to print C"
                        className="sales-invoice-input"
                      />
                    </div>
                    <div className="sales-pos-field">
                      <Label htmlFor="sale-customer-tin">TIN, optional</Label>
                      <Input
                        id="sale-customer-tin"
                        value={customerTin}
                        maxLength={80}
                        inputMode="numeric"
                        pattern="[0-9-]*"
                        disabled={isSaving}
                        onChange={event => setCustomerTin(sanitizeTinInput(event.target.value))}
                        placeholder="000-000-000-000"
                        className="sales-invoice-input"
                      />
                    </div>
                    <div className="sales-pos-field sales-invoice-address-field">
                      <Label htmlFor="sale-customer-address">Business Address, optional</Label>
                      <Input
                        id="sale-customer-address"
                        value={customerAddress}
                        maxLength={240}
                        disabled={isSaving}
                        onChange={event => setCustomerAddress(event.target.value)}
                        placeholder="Leave blank to print C"
                        className="sales-invoice-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="sales-form-section sales-checkout-section bg-slate-50/60">
                  <div className="sales-selected-items-header">
                    <div>
                      <h3 className="sales-section-title">Selected Items</h3>
                      <p className="text-xs font-medium text-slate-700">
                        {totalQuantity} unit{totalQuantity === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="sales-selected-items-actions">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="sales-action-button sales-selected-items-action border-red-200 text-red-600 hover:border-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={handleClearSelectedItemsRequest}
                        disabled={isSaving || cartLines.length === 0}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Clear All
                      </Button>
                    </div>
                  </div>

                  <div className="sales-cart-list">
                    {cartLines.length === 0 ? (
                      <div className="sales-cart-empty">
                        Choose items from the available inventory list.
                      </div>
                    ) : saleLines.map((line, index) => {
                      const detail = selectedLineDetails[index];
                      const selectedItem = detail.item;
                      if (!line.isManual && !selectedItem) return null;
                      const displayName = line.isManual ? detail.itemName : selectedItem.name;
                      const displayCategory = line.isManual ? detail.category : selectedItem.category;
                      const remainingStock = line.isManual ? null : Math.max(Number(selectedItem.quantity || 0) - Number(detail.quantity || 0), 0);

                      return (
                        <div key={`cart-line-${index}`} className="sales-cart-row">
                          <div className="sales-cart-main">
                            <p className="sales-cart-title">{displayName || 'Non-inventory item'}</p>
                            <div className="sales-cart-meta">
                              <span>{line.isManual ? 'Non-Inventory' : selectedItem.itemCode || 'No item code'}</span>
                              <span>&middot;</span>
                              <span>{displayCategory || 'Uncategorized'}</span>
                            </div>
                          </div>
                          <div className="sales-cart-subtotal">
                            {formatCurrency(detail.subtotal)}
                          </div>
                          <div className="sales-cart-controls">
                            <div className="sales-cart-quantity-field">
                              <span className="sales-cart-control-label">Quantity</span>
                              <div className="sales-qty-stepper" aria-label={`Quantity for ${displayName || 'non-inventory item'}`}>
                                <button
                                  type="button"
                                  className="sales-qty-button-decrease"
                                  onClick={() => adjustLineQuantity(index, -1)}
                                  disabled={isSaving || Number(line.quantity || 0) <= 1}
                                  aria-label={`Decrease quantity for ${displayName || 'non-inventory item'}`}
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={line.quantity}
                                  disabled={isSaving}
                                  {...createNumericInputGuards({
                                    mode: 'whole',
                                    fieldName: 'Quantity sold',
                                    toastId: 'sales-cart-quantity-entry',
                                    onChange: event => updateLineQuantity(
                                      index,
                                      sanitizeWholeNumberInput(event.target.value, 'Quantity sold', 'sales-quantity-numbers-only')
                                    ),
                                  })}
                                  aria-label={`Quantity sold for ${displayName || 'non-inventory item'}`}
                                />
                                <button
                                  type="button"
                                  className="sales-qty-button-increase"
                                  onClick={() => adjustLineQuantity(index, 1)}
                                  disabled={isSaving}
                                  aria-label={`Increase quantity for ${displayName || 'non-inventory item'}`}
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div className="sales-cart-secondary-controls">
                              <div className="sales-cart-price-field">
                                <span className="sales-cart-control-label">Unit Price</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="sales-cart-price-input"
                                  value={line.unitPrice}
                                  placeholder="0.00"
                                  disabled={isSaving}
                                  {...createNumericInputGuards({
                                    mode: 'decimal',
                                    fieldName: 'Unit price',
                                    toastId: 'sales-cart-unit-price-entry',
                                    onChange: event => updateLineUnitPrice(index, event.target.value),
                                  })}
                                  onBlur={() => normalizeLineUnitPrice(index)}
                                  aria-label={`Unit price for ${displayName || 'non-inventory item'}`}
                                  title="Edit the selling price for this sale"
                                />
                              </div>
                              <div className="sales-cart-status-actions">
                                <span className={`sales-cart-stock-after${line.isManual ? ' sales-cart-stock-after-muted' : ''}`}>
                                  {line.isManual ? 'Not tracked' : `${remainingStock} left`}
                                </span>
                                <div className="sales-cart-row-actions">
                                  {line.isManual && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="sales-action-button sales-cart-edit-button h-9 w-9 border-blue-200 text-blue-600"
                                      onClick={() => openEditNonInventoryLine(index)}
                                      disabled={isSaving}
                                      title="Edit non-inventory item"
                                      aria-label={`Edit ${displayName || 'non-inventory item'}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="sales-action-button sales-cart-remove-button h-9 border-red-200 text-red-600 hover:border-red-500 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => removeLine(index)}
                                    disabled={isSaving}
                                    aria-label={`Remove ${displayName || 'non-inventory item'}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="sales-cart-remove-label">Remove</span>
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="sales-form-section sales-checkout-section bg-slate-50/60">
                  <div className="sales-section-heading">
                    <span className="sales-section-icon">
                      <CalendarDays className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="sales-section-title">Transaction Date</h3>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label>Actual Transaction Date, optional</Label>
                      <div className="actual-transaction-split-grid">
                        <div className="actual-transaction-split-field">
                          <Label htmlFor="sale-actual-transaction-date" className="actual-transaction-split-label">
                            Date
                          </Label>
                          <Input
                            id="sale-actual-transaction-date"
                            type="date"
                            value={getDatePartFromDateTime(actualTransactionAt)}
                            max={getCurrentDatePart()}
                            disabled={isSaving}
                            onChange={event => {
                              const nextDate = event.target.value;
                              handleActualTransactionAtChange(nextDate ? combineActualTransactionDateTime(nextDate, getTimePartFromDateTime(actualTransactionAt) || getCurrentTimePart()) : '');
                            }}
                            className="actual-transaction-part-input"
                          />
                        </div>
                        <div className="actual-transaction-split-field">
                          <Label htmlFor="sale-actual-transaction-time" className="actual-transaction-split-label">
                            Time
                          </Label>
                          <Input
                            id="sale-actual-transaction-time"
                            type="time"
                            value={getTimePartFromDateTime(actualTransactionAt)}
                            disabled={isSaving}
                            onChange={event => {
                              const nextTime = event.target.value;
                              handleActualTransactionAtChange(nextTime ? combineActualTransactionDateTime(getDatePartFromDateTime(actualTransactionAt) || getCurrentDatePart(), nextTime) : '');
                            }}
                            className="actual-transaction-part-input"
                          />
                        </div>
                      </div>
                      <p className="actual-transaction-date-helper">
                        Choose the actual date and time of the sale. Leave both blank to use the current date and time.
                      </p>
                    </div>
                    {isPastTransactionDate(actualTransactionAt) && (
                      <div className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm font-semibold text-amber-900">This sale will be saved as a backdated transaction.</p>
                        <Label htmlFor="sale-backdate-reason">Backdate reason, optional</Label>
                        <Input
                          id="sale-backdate-reason"
                          value={backdateReason}
                          maxLength={240}
                          disabled={isSaving}
                          onChange={event => setBackdateReason(event.target.value)}
                          placeholder="Example: Encoded after power outage"
                          className="h-11 rounded-xl border-amber-200 bg-white text-slate-950"
                        />
                      </div>
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="sale-remarks">Remarks, optional</Label>
                      <Textarea
                        id="sale-remarks"
                        value={remarks}
                        maxLength={500}
                        disabled={isSaving}
                        onChange={event => setRemarks(event.target.value.slice(0, 500))}
                        placeholder="Add customer notes, special instructions, or other transaction remarks."
                        className="min-h-[82px] resize-y rounded-xl border-slate-200 bg-white text-sm text-slate-950"
                      />
                    </div>
                  </div>
                </div>

                <div className="sales-form-section sales-checkout-section bg-slate-50/60">
                  <div className="sales-section-heading">
                    <span className="sales-section-icon">
                      <Wallet className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="sales-section-title">Payment Details</h3>
                    </div>
                  </div>
                  <div className="sales-payment-grid">
                    <div className="sales-payment-field">
                      <Label htmlFor="payment-method">Payment Method</Label>
                      <Select value={paymentMethod} onValueChange={handlePaymentMethodChange}>
                        <SelectTrigger id="payment-method" className="sales-customer-control">
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="gcash">GCash</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="credit">Store Credit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sales-payment-field">
                      <Label htmlFor="discount-type">Discount</Label>
                      <Select value={discountType} onValueChange={handleDiscountTypeChange}>
                        <SelectTrigger id="discount-type" className="sales-customer-control">
                          <SelectValue placeholder="Select discount" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Discount</SelectItem>
                          <SelectItem value="custom_amount">Manual Amount</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sales-payment-field">
                      <Label htmlFor="sale-discount">
                        {selectedDiscountOption.manual ? 'Manual Discount Amount' : 'Discount Amount'}
                      </Label>
                      <Input
                        id="sale-discount"
                        inputMode="decimal"
                        value={selectedDiscountOption.manual ? discountAmount : safeDiscountAmount.toFixed(2)}
                        onChange={event => setDiscountAmount(sanitizeDecimalInput(event.target.value, 'Discount', 'sales-discount-numbers-only'))}
                        placeholder="0.00"
                        disabled={isSaving || !selectedDiscountOption.manual}
                      />
                    </div>
                    <div className="sales-payment-field">
                      <Label htmlFor="delivery-charge">Delivery Charge</Label>
                      <Input
                        id="delivery-charge"
                        inputMode="decimal"
                        value={deliveryCharge}
                        onChange={event => setDeliveryCharge(sanitizeDecimalInput(event.target.value, 'Delivery charge', 'sales-delivery-charge-numbers-only'))}
                        placeholder="0.00"
                        disabled={isSaving}
                      />
                    </div>
                    <div className="sales-payment-field">
                      <Label htmlFor="amount-received">Amount Received{paymentMethod === 'cash' ? '' : ', auto-recorded'}</Label>
                      <div className="sales-payment-input-row">
                        <Input
                          id="amount-received"
                          inputMode="decimal"
                          value={paymentMethod === 'cash' ? amountReceived : totalAmount.toFixed(2)}
                          onChange={event => setAmountReceived(sanitizeDecimalInput(event.target.value, 'Amount received', 'sales-amount-received-numbers-only'))}
                          placeholder="0.00"
                          disabled={isSaving || paymentMethod !== 'cash'}
                        />
                        {paymentMethod === 'cash' && (
                          <Button
                            type="button"
                            variant="outline"
                            className="sales-exact-cash-button"
                            disabled={isSaving || totalAmount <= 0}
                            onClick={() => setAmountReceived(totalAmount.toFixed(2))}
                          >
                            Exact
                          </Button>
                        )}
                      </div>
                    </div>
                    {needsPaymentConfirmation && (
                      <>
                        <div className="sales-payment-field">
                          <Label htmlFor="payment-reference">Reference Number</Label>
                          <Input
                            id="payment-reference"
                            value={paymentReference}
                            onChange={event => setPaymentReference(sanitizePaymentReferenceInput(event.target.value))}
                            placeholder={paymentMethod === 'gcash' ? 'e.g., GCash reference number' : 'e.g., bank transaction reference'}
                            disabled={isSaving}
                            maxLength={120}
                          />
                        </div>
                        <div className="sales-payment-field">
                          <Label>Payment Confirmation</Label>
                          <button
                            type="button"
                            className={`sales-payment-confirmation ${paymentConfirmed ? 'sales-payment-confirmation-checked' : ''}`}
                            role="checkbox"
                            aria-checked={paymentConfirmed}
                            aria-label="Payment received and verified"
                            onClick={() => {
                              const checked = !paymentConfirmed;
                              setPaymentConfirmed(checked);
                              setPaymentConfirmedAmount(checked ? Number(totalAmount.toFixed(2)) : null);
                            }}
                            disabled={isSaving}
                          >
                            <span className="sales-payment-confirmation-box" aria-hidden="true">
                              {paymentConfirmed ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : (
                                <span className="h-2.5 w-2.5 rounded-full border border-slate-300 bg-white" />
                              )}
                            </span>
                            <span className="sales-payment-confirmation-text">
                              <span>Payment received and verified</span>
                              <small>
                                {paymentConfirmed
                                  ? `Confirmed for ${formatCurrency(totalAmount)}`
                                  : 'Required for GCash and bank transfer payments'}
                              </small>
                            </span>
                          </button>
                        </div>
                        <div className="sales-digital-payment-note">
                          <Info className="h-4 w-4" />
                          <p>
                            Confirm the received payment before completing the sale.
                          </p>
                        </div>
                      </>
                    )}
                    <div className="sales-payment-field">
                      <Label>Change</Label>
                      <div className={`sales-readonly-user ${paymentMethod === 'cash' && safeAmountReceived > 0 && safeAmountReceived < totalAmount ? 'sales-payment-warning' : ''}`}>
                        <Coins className="h-4 w-4" />
                        {formatCurrency(changeAmount)}
                      </div>
                      {paymentMethod === 'cash' && safeAmountReceived > 0 && safeAmountReceived < totalAmount && (
                        <p className="sales-payment-helper text-red-700">Cash received is not enough for this sale.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="sales-form-section sales-checkout-section bg-slate-50/60">
                  <h3 className="mb-3 text-base font-semibold text-slate-900">Transaction Summary</h3>
                  <div className="sales-summary-grid">
                    <SummaryBlock icon={<User className="h-5 w-5" />} label="Customer Type" value={customerTypeLabels[customerType]} tone="blue" />
                    <SummaryBlock icon={<PackageCheck className="h-5 w-5" />} label="Total Quantity" value={`${totalQuantity} unit${totalQuantity === 1 ? '' : 's'}`} tone="green" />
                    <SummaryBlock icon={<Coins className="h-5 w-5" />} label="Subtotal" value={formatCurrency(subtotalAmount)} tone="amber" />
                    <SummaryBlock icon={<Tag className="h-5 w-5" />} label={selectedDiscountOption.label} value={formatCurrency(safeDiscountAmount)} tone="amber" />
                    <SummaryBlock icon={<PackageCheck className="h-5 w-5" />} label="Delivery Charge" value={formatCurrency(safeDeliveryCharge)} tone="amber" />
                    <SummaryBlock icon={<ReceiptText className="h-5 w-5" />} label="VAT 12%" value={formatCurrency(vatAmount)} tone="amber" />
                    <SummaryBlock icon={<ReceiptText className="h-5 w-5" />} label="VATable Sales" value={formatCurrency(vatableSales)} tone="amber" />
                    <SummaryBlock icon={<Wallet className="h-5 w-5" />} label="Amount Due" value={formatCurrency(totalAmount)} tone="amber" />
                    <SummaryBlock icon={<ReceiptText className="h-5 w-5" />} label="Payment" value={paymentMethodLabels[paymentMethod]} tone="blue" />
                  </div>
                </div>

                <div className="sales-checkout-actions">
                  <Button
                    type="button"
                    variant="outline"
                    className="sales-action-button hover:bg-slate-100"
                    onClick={handleClearFormRequest}
                    disabled={isSaving}
                  >
                    Clear Form
                  </Button>
                  <Button
                    type="button"
                    className="sales-action-button sales-save-sale-button px-6 disabled:cursor-not-allowed"
                    onClick={handleRecordSale}
                    disabled={isSaving || (isLoadingInvoiceSuggestion && !cleanOfficialInvoiceNumber) || Boolean(duplicateOfficialInvoiceSale) || isOfficialInvoiceBehindSequence}
                  >
                    {isSaving
                      ? 'Saving Sale...'
                      : needsPaymentConfirmation
                        ? 'Confirm Payment and Complete Sale'
                        : 'Save Sale'}
                  </Button>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
      <NonInventoryItemDialog
        open={isNonInventoryDialogOpen}
        onOpenChange={handleNonInventoryDialogOpenChange}
        draft={nonInventoryDraft}
        sessionCount={nonInventorySessionCount}
        isEditing={editingNonInventoryLineIndex !== null}
        categories={getNonInventoryCategories()}
        onDraftChange={updateNonInventoryDraft}
        onConfirm={confirmAddNonInventoryItem}
        onAddAnother={() => confirmAddNonInventoryItem({ keepOpen: true })}
        isSaving={isSaving}
      />
      <SalesHistoryDialog
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        sales={filteredSalesHistory}
        totalSalesCount={sortedSales.length}
        searchValue={historySearch}
        periodValue={historyPeriod}
        onPeriodChange={value => {
          setHistoryPeriod(value);
          setSelectedHistorySaleId('');
        }}
        onSearchChange={value => {
          setHistorySearch(value);
          setSelectedHistorySaleId('');
        }}
        selectedSale={selectedHistorySale}
        onSelectSale={saleId => setSelectedHistorySaleId(currentSaleId => currentSaleId === saleId ? '' : saleId)}
        onDownloadSummary={handleDownloadSaleSummary}
        onRefundSale={openRefundSaleDialog}
        onCancelSale={openCancelSaleDialog}
        canRefundSales={canRefundSales}
        canCancelSales={canCancelSales}
      />

      <ClearSalesFormDialog
        open={isInvoiceSequenceConfirmOpen}
        onOpenChange={setIsInvoiceSequenceConfirmOpen}
        onConfirm={confirmInvoiceSequenceException}
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Confirm invoice numbering"
        message={
          <>
            Sales Invoice No. {cleanOfficialInvoiceNumber} skips {skippedInvoiceRangeText}.
            <br />
            Continue only if this matches the physical SI booklet.
          </>
        }
        infoText={`Booklet note: ${cleanInvoiceSequenceExceptionReason || 'No note entered'}`}
        cancelLabel="Review Number"
        confirmLabel="Save Sale"
      />

      <ClearSalesFormDialog
        open={isClearConfirmOpen}
        onOpenChange={setIsClearConfirmOpen}
        onConfirm={confirmClearForm}
      />
      <ClearSalesFormDialog
        open={isClearItemsConfirmOpen}
        onOpenChange={setIsClearItemsConfirmOpen}
        onConfirm={confirmClearSelectedItems}
        title="Clear selected items?"
        message={(
          <>
            All items in the current sale will be removed.
            <br />
            Payment details and saved sales records will not be affected.
          </>
        )}
        infoText="Continue only if you want to choose the sold items again."
        cancelLabel="Keep Items"
        confirmLabel="Clear Items"
      />
      <CancelSaleDialog
        open={Boolean(saleToCancel)}
        sale={saleToCancel}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onOpenChange={open => {
          if (!open) closeCancelSaleDialog();
        }}
        onConfirm={confirmCancelSale}
        isSubmitting={isCancellingSale}
      />
      <RefundSaleDialog
        open={Boolean(saleToRefund)}
        sale={saleToRefund}
        lines={refundLines}
        reason={refundReason}
        actualTransactionAt={refundActualTransactionAt}
        backdateReason={refundBackdateReason}
        onReasonChange={setRefundReason}
        onActualTransactionAtChange={handleRefundActualTransactionAtChange}
        onBackdateReasonChange={setRefundBackdateReason}
        onLineChange={updateRefundLine}
        onFillAll={fillAllRefundableQuantities}
        onClearQuantities={clearRefundQuantities}
        onOpenChange={open => {
          if (!open) closeRefundSaleDialog();
        }}
        onConfirm={confirmRefundSale}
        isSubmitting={isRefundingSale}
      />
      <CompletedSaleReceiptDialog
        open={Boolean(completedSale)}
        sale={completedSale}
        onOpenChange={open => {
          if (!open) setCompletedSale(null);
        }}
        onPrint={sale => printSaleTransactionReceipt(sale)}
        onDownload={handleDownloadSaleSummary}
        onStartNewSale={() => setCompletedSale(null)}
      />
    </div>
  );
}

function NonInventoryItemDialog({
  open,
  onOpenChange,
  draft,
  sessionCount,
  isEditing,
  categories,
  onDraftChange,
  onConfirm,
  onAddAnother,
  isSaving
}) {
  const parsedQuantity = Number(draft.quantity);
  const safeQuantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 0;
  const parsedUnitPrice = Number(draft.unitPrice);
  const safeUnitPrice = Number.isFinite(parsedUnitPrice) && parsedUnitPrice > 0 ? parsedUnitPrice : 0;
  const lineTotal = safeQuantity * safeUnitPrice;
  const adjustQuantity = change => {
    const currentQuantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
    onDraftChange('quantity', String(Math.max(1, currentQuantity + change)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sales-non-inventory-dialog border border-slate-200 bg-white p-0 shadow-2xl">
        <div className="sales-non-inventory-content">
          <DialogHeader className="sales-non-inventory-header text-left">
            <span className="sales-non-inventory-icon" aria-hidden="true">
              <ReceiptText className="h-7 w-7" />
            </span>
            <div className="min-w-0 pt-1">
              <DialogTitle className="text-xl font-bold leading-tight text-slate-950">
                {isEditing ? 'Edit Non-Inventory Item' : 'Add Non-Inventory Item'}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                {isEditing
                  ? 'Correct the manual item details before completing the sale.'
                  : 'Use this for sold items that are not yet tracked in inventory.'}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="sales-non-inventory-alert">
            <Info className="h-5 w-5 shrink-0 text-blue-600" />
            <span>
              This item will appear in sales history, reports, and receipts without deducting inventory stock.
            </span>
          </div>

          <div className="sales-non-inventory-form">
            <div className="sales-non-inventory-field">
              <Label htmlFor="non-inventory-name">Item Description <span className="text-red-600">*</span></Label>
              <Input
                id="non-inventory-name"
                className="sales-non-inventory-control"
                value={draft.itemName}
                maxLength={150}
                placeholder="e.g., hinges, catches, washers"
                disabled={isSaving}
                onChange={event => onDraftChange('itemName', event.target.value.slice(0, 150))}
              />
            </div>

            <div className="sales-non-inventory-grid">
              <div className="sales-non-inventory-field">
                <Label htmlFor="non-inventory-quantity">Quantity <span className="text-red-600">*</span></Label>
                <div className="sales-non-inventory-quantity-control">
                  <Input
                    id="non-inventory-quantity"
                    className="sales-non-inventory-control"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft.quantity}
                    placeholder="1"
                    disabled={isSaving}
                    onChange={event => onDraftChange(
                      'quantity',
                      sanitizeWholeNumberInput(event.target.value, 'Quantity', 'sales-manual-dialog-quantity-numbers-only')
                    )}
                  />
                  <div className="sales-non-inventory-quantity-buttons" aria-label="Quantity controls">
                    <button
                      type="button"
                      className="sales-non-inventory-quantity-button"
                      onClick={() => adjustQuantity(1)}
                      disabled={isSaving}
                      aria-label="Increase quantity"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="sales-non-inventory-quantity-button"
                      onClick={() => adjustQuantity(-1)}
                      disabled={isSaving || safeQuantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="sales-non-inventory-field">
                <Label htmlFor="non-inventory-unit-price">Unit Price <span className="text-red-600">*</span></Label>
                <Input
                  id="non-inventory-unit-price"
                  className="sales-non-inventory-control"
                  type="text"
                  inputMode="decimal"
                  pattern="^\\d*(\\.\\d{0,2})?$"
                  value={draft.unitPrice}
                  placeholder="0.00"
                  disabled={isSaving}
                  onChange={event => onDraftChange('unitPrice', sanitizePriceInput(event.target.value))}
                />
              </div>
              <div className="sales-non-inventory-field">
                <Label>Category, optional</Label>
                <Select
                  value={draft.category || 'Other'}
                  onValueChange={value => {
                    onDraftChange('category', value);
                    if (value !== 'Other') {
                      onDraftChange('categoryNote', '');
                    }
                  }}
                  disabled={isSaving}
                >
                  <SelectTrigger className="sales-non-inventory-control">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(draft.category || 'Other') === 'Other' && (
                  <div className="mt-2 space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Optional: note</Label>
                    <Textarea
                      value={draft.categoryNote || ''}
                      maxLength={240}
                      placeholder="E.g., Special-order item not listed in inventory."
                      disabled={isSaving}
                      className="min-h-[64px] resize-y text-sm"
                      onChange={event => onDraftChange('categoryNote', event.target.value.slice(0, 240))}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="sales-non-inventory-total" aria-live="polite">
              <span>Line Total</span>
              <strong>{formatCurrency(lineTotal)}</strong>
            </div>
            {!isEditing && sessionCount > 0 && (
              <div className="sales-non-inventory-session-summary" aria-live="polite">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{sessionCount}</strong> non-inventory item{sessionCount === 1 ? '' : 's'} already added to this sale.
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="sales-non-inventory-footer">
            <Button
              type="button"
              variant="outline"
              className="sales-action-button h-11 min-w-[120px] hover:bg-slate-100"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {sessionCount > 0 ? 'Done' : 'Cancel'}
            </Button>
            {!isEditing && (
              <Button
                type="button"
                variant="outline"
                className="sales-action-button h-11 min-w-[140px] border-slate-200 text-slate-700 hover:border-slate-500 hover:bg-slate-50 hover:text-slate-900"
                onClick={onAddAnother}
                disabled={isSaving}
              >
                <Plus className="h-4 w-4" />
                Add Another
              </Button>
            )}
            <Button
              type="button"
              className="sales-action-button h-11 min-w-[140px] bg-[#FF0000] text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onConfirm}
              disabled={isSaving}
            >
              {isEditing ? 'Update Item' : 'Add to Sale'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompletedSaleReceiptDialog({ open, sale, onOpenChange, onPrint, onDownload, onStartNewSale }) {
  const items = sale?.items || [];
  const receiptVat = getReceiptVatBreakdown(sale);
  const hasTrackedItems = items.some(item => !isNonInventorySaleItem(item));
  const hasNonInventoryItems = items.some(isNonInventorySaleItem);
  const branchAddress = getReceiptBranchAddress(sale?.branch);
  const invoiceNumber = getPrimaryDocumentNumber(sale);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sales-receipt-preview-dialog border border-slate-200 bg-white p-0 shadow-2xl">
        <div className="sales-receipt-preview-content">
          <button
            type="button"
            aria-label="Close receipt preview"
            className="sales-receipt-close-button"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>
          <DialogHeader className="text-left">
            <div className="flex items-start gap-3 pr-10">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700">
                <CheckCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold leading-tight text-slate-950">
                  Transaction completed
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                  {hasTrackedItems
                    ? `The sale was saved${hasNonInventoryItems ? ', tracked items were deducted, and non-inventory items were recorded for sales only.' : ' and inventory was deducted.'}`
                    : 'The sale was saved as non-inventory sales only. Printing is optional.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="sales-receipt-paper" aria-label="Receipt preview">
            <div className="sales-receipt-preview-header">
              <div className="sales-receipt-preview-brand">
                <p className="sales-receipt-preview-brand-name">{RECEIPT_BUSINESS_INFO.businessName}</p>
                <p className="sales-receipt-preview-tin">{RECEIPT_BUSINESS_INFO.tin}</p>
                <p className="sales-receipt-preview-prop">{RECEIPT_BUSINESS_INFO.proprietor}</p>
                <p className="sales-receipt-preview-address">
                  {getReceiptAddressLines(branchAddress).map((line, index, lines) => (
                    <React.Fragment key={line}>
                      {line}{index < lines.length - 1 ? <br /> : null}
                    </React.Fragment>
                  ))}
                </p>
                <p className="sales-receipt-preview-contact">{RECEIPT_BUSINESS_INFO.contact}</p>
              </div>
              <div className="sales-receipt-preview-invoice">
                <p className="sales-receipt-preview-sales">SALES</p>
                <p className="sales-receipt-preview-title">INVOICE</p>
                <p className="sales-receipt-preview-number">No.: {invoiceNumber}</p>
              </div>
            </div>
            <div className="sales-receipt-divider" />
            <div className="space-y-1 text-xs leading-5 text-slate-700">
              <p>Date: {formatDateTime(sale?.createdAt)}</p>
              {isBackdatedRecord(sale) && (
                <p>Encoded Date: {formatDateTime(sale?.encodedAt)}</p>
              )}
              <p>Cashier: {sale?.soldByName || 'System'}</p>
              <p>Customer: {customerTypeLabels[sale?.customerType] || 'Walk-in Customer'}</p>
              <p>Registered Name: {getReceiptCustomerName(sale)}</p>
              <p>TIN: {getReceiptCustomerTin(sale)}</p>
              <p>Business Address: {getReceiptCustomerAddress(sale)}</p>
            </div>
            <div className="sales-receipt-divider" />
            <div>
              {items.length === 0 ? (
                <p className="text-xs text-slate-500">No item details recorded.</p>
              ) : items.map(item => (
                <div key={item.id || `${item.itemName}-${item.quantitySold}`} className="sales-receipt-item">
                  <div className="sales-receipt-row font-semibold">
                    <span className="min-w-0 break-words">{item.itemName || 'Inventory item'}</span>
                    <span>{formatCurrency(item.subtotal)}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {item.quantitySold || 0} x {formatCurrency(item.unitPrice)} &middot; {isNonInventorySaleItem(item) ? 'Non-Inventory' : item.category || 'Item'}
                  </p>
                </div>
              ))}
            </div>
            <div className="sales-receipt-divider" />
            <div className="space-y-1">
              <div className="sales-receipt-row"><span>Subtotal</span><span>{formatCurrency(sale?.subtotalAmount ?? sale?.totalAmount)}</span></div>
              <div className="sales-receipt-row"><span>{getDiscountLabel(sale)}</span><span>-{formatCurrency(sale?.discountAmount)}</span></div>
              <div className="sales-receipt-row"><span>Delivery Charge</span><span>{formatCurrency(sale?.deliveryCharge)}</span></div>
              <div className="sales-receipt-row"><span>VATable Sales</span><span>{formatCurrency(receiptVat.vatableSales)}</span></div>
              <div className="sales-receipt-row"><span>VAT 12%</span><span>{formatCurrency(receiptVat.vatAmount)}</span></div>
              <div className="sales-receipt-row text-sm font-bold"><span>AMOUNT DUE</span><span>{formatCurrency(sale?.totalAmount)}</span></div>
              <div className="sales-receipt-row"><span>Paid ({paymentMethodLabels[sale?.paymentMethod] || 'Cash'})</span><span>{formatCurrency(sale?.amountReceived ?? sale?.totalAmount)}</span></div>
              <div className="sales-receipt-row"><span>Change</span><span>{formatCurrency(sale?.changeAmount)}</span></div>
              {sale?.paymentReference && (
                <div className="sales-receipt-row"><span>Reference</span><span>{sale.paymentReference}</span></div>
              )}
            </div>
          </div>

          <div className="sales-receipt-actions">
            <Button
              type="button"
              variant="outline"
              className="sales-action-button hover:bg-slate-100"
              onClick={onStartNewSale}
            >
              Start New Sale
            </Button>
            <Button
              type="button"
              variant="outline"
              className="sales-action-button sales-transaction-summary-button"
              onClick={() => onDownload?.(sale)}
            >
              <Download className="h-4 w-4" />
              Download Receipt
            </Button>
            <Button
              type="button"
              className="sales-action-button bg-[#FF0000] text-white hover:bg-red-700"
              onClick={() => onPrint?.(sale)}
            >
              <ReceiptText className="h-4 w-4" />
              Print Receipt
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClearSalesFormDialog({
  open,
  onOpenChange,
  onConfirm,
  icon = <Trash2 className="h-4 w-4" />,
  title = 'Clear sales form?',
  message = (
    <>
      The details you entered will be removed.
      <br />
      This will not affect saved sales records or inventory.
    </>
  ),
  infoText = 'Continue only if you want to start a new sales entry.',
  cancelLabel = 'Keep Editing',
  confirmLabel = 'Clear Form'
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sales-confirm-clear-dialog border border-slate-200 bg-white p-0 shadow-2xl">
        <div className="sales-confirm-clear-content">
          <DialogHeader className="text-left">
            <div className="sales-confirm-clear-header">
              <span className="sales-confirm-clear-icon">
                {icon}
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold leading-tight text-slate-950">
                  {title}
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>
          <DialogDescription className="sales-confirm-clear-message">
            {message}
          </DialogDescription>
          <div className="sales-confirm-clear-info">
            <Info className="h-4 w-4 shrink-0 text-blue-600" />
            <span>
              {infoText}
            </span>
          </div>
          <div className="sales-confirm-clear-actions">
            <Button
              type="button"
              variant="outline"
              className="sales-confirm-clear-button sales-confirm-clear-cancel h-10 min-w-[116px] bg-white"
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              className="sales-confirm-clear-button sales-confirm-clear-submit h-10 min-w-[116px] bg-[#FF0000] text-white"
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CancelSaleDialog({ open, sale, reason, onReasonChange, onOpenChange, onConfirm, isSubmitting }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sales-cancel-dialog border border-amber-300 bg-white p-0 shadow-2xl">
        <div className="sales-cancel-content">
          <DialogHeader className="text-left">
            <div className="sales-cancel-header">
              <span className="sales-cancel-icon">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div className="sales-cancel-copy">
                <DialogTitle className="text-lg font-bold leading-tight text-slate-950">
                  Cancel entire sale?
                </DialogTitle>
                <DialogDescription className="sales-cancel-description text-sm leading-6">
                  This admin action voids <span className="sales-cancel-sale-number">{getPrimaryDocumentNumber(sale)}</span> and restores all tracked inventory from the original sale. Use Refund Items instead when a customer returns only selected items.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="sales-cancel-reason-group">
            <Label htmlFor="sale-cancel-reason" className="sales-cancel-reason-label">Cancellation Reason</Label>
            <Textarea
              id="sale-cancel-reason"
              value={reason}
              onChange={event => onReasonChange(event.target.value.slice(0, 500))}
              placeholder="Example: Wrong item or quantity was encoded."
              disabled={isSubmitting}
              className="sales-cancel-reason-input resize-none"
            />
              <p className="sales-cancel-helper">
              Use a short but clear reason for manager review and audit checking.
            </p>
          </div>
          <DialogFooter className="sales-cancel-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Keep Sale
            </Button>
            <Button
              type="button"
              className="bg-[#FF0000] text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Cancelling...' : 'Cancel Entire Sale'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RefundSaleDialog({
  open,
  sale,
  lines,
  reason,
  actualTransactionAt,
  backdateReason,
  onReasonChange,
  onActualTransactionAtChange,
  onBackdateReasonChange,
  onLineChange,
  onFillAll,
  onClearQuantities,
  onOpenChange,
  onConfirm,
  isSubmitting
}) {
  const selectedLines = (lines || []).filter(line => Number(line.quantity || 0) > 0 || Number(line.refundAmount || 0) > 0);
  const refundTotal = selectedLines.reduce((sum, line) => sum + Number(line.refundAmount || 0), 0);
  const refundQuantityTotal = selectedLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const maxRefundTotal = (lines || []).reduce((sum, line) => sum + Number(line.maxAmount || 0), 0);
  const hasSelectedQuantities = refundQuantityTotal > 0;
  const hasUnfilledRefundableQuantity = (lines || []).some(line => Number(line.maxQuantity || 0) > Number(line.quantity || 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sales-refund-dialog border border-slate-200 bg-white p-0 shadow-2xl">
        <div className="sales-refund-content">
          <DialogHeader className="sales-refund-header text-left">
            <div className="sales-refund-title-row">
              <div className="sales-refund-heading">
                <span className="sales-refund-icon">
                  <RotateCcw className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="sales-refund-title">
                    Record Customer Refund
                  </DialogTitle>
                  <DialogDescription className="sales-refund-description">
                    Refund items from {getPrimaryDocumentNumber(sale)}. Returned items will be added back to inventory.
                  </DialogDescription>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close refund dialog"
                className="sales-refund-close-button"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          <div className="sales-refund-body">
            <div className="sales-refund-main">
              <div className="sales-refund-section-heading">
                <div>
                  <span>Refundable Items</span>
                  <strong>{(lines || []).length} item{(lines || []).length === 1 ? '' : 's'}</strong>
                </div>
                <div className="sales-refund-bulk-actions" aria-label="Refund quantity shortcuts">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onFillAll}
                    disabled={isSubmitting || !hasUnfilledRefundableQuantity}
                  >
                    Refund All Remaining
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClearQuantities}
                    disabled={isSubmitting || !hasSelectedQuantities}
                  >
                    Clear Quantities
                  </Button>
                </div>
              </div>
              <div className="sales-refund-lines" role="region" aria-label="Refundable items">
                {(lines || []).map(line => {
                  const quantityValue = Number(line.quantity || 0);
                  return (
                    <div key={line.salesItemId} className="sales-refund-line-card">
                      <div className="sales-refund-line-header">
                        <div className="min-w-0">
                          <p className="sales-refund-item-name">{line.itemName}</p>
                          <p className="sales-refund-line-meta" hidden>
                            {line.category || 'Uncategorized'} - {line.isInventoryItem ? 'Tracked inventory' : 'Non-inventory'} - {line.maxQuantity} refundable
                          </p>
                          <div className="sales-refund-line-meta" aria-label="Refund item details">
                            <span>{line.category || 'Uncategorized'}</span>
                            <span>{line.isInventoryItem ? 'Tracked inventory' : 'Non-inventory'}</span>
                            <span>{line.maxQuantity} refundable</span>
                          </div>
                        </div>
                        <Badge variant="outline" className="sales-refund-limit-chip">
                          <span>Up to</span>
                          <strong>{formatCurrency(line.maxAmount)}</strong>
                        </Badge>
                      </div>
                      <div className="sales-refund-input-grid">
                        <div className="sales-refund-field">
                          <Label htmlFor={`refund-quantity-${line.salesItemId}`}>Refund Quantity</Label>
                          <Input
                            id={`refund-quantity-${line.salesItemId}`}
                            inputMode="numeric"
                            value={line.quantity}
                            maxLength={6}
                            disabled={isSubmitting}
                            {...createNumericInputGuards({
                              mode: 'whole',
                              fieldName: 'Refund quantity',
                              toastId: `sales-refund-quantity-entry-${line.salesItemId}`,
                              onChange: event => onLineChange(line.salesItemId, 'quantity', event.target.value)
                            })}
                            placeholder="0"
                            className="sales-refund-input"
                            aria-describedby={`refund-quantity-help-${line.salesItemId}`}
                          />
                          <p id={`refund-quantity-help-${line.salesItemId}`} className="sales-refund-helper">
                            {getRefundableQuantityLimitMessage(line.maxQuantity)}
                          </p>
                        </div>
                        <div className="sales-refund-field">
                          <Label htmlFor={`refund-amount-${line.salesItemId}`}>Refund Amount</Label>
                          <Input
                            id={`refund-amount-${line.salesItemId}`}
                            inputMode="decimal"
                            value={line.refundAmount}
                            disabled={isSubmitting || quantityValue <= 0}
                            {...createNumericInputGuards({
                              mode: 'decimal',
                              fieldName: 'Refund amount',
                              toastId: `sales-refund-amount-entry-${line.salesItemId}`,
                              onChange: event => onLineChange(line.salesItemId, 'refundAmount', event.target.value)
                            })}
                            placeholder="0.00"
                            className="sales-refund-input"
                          />
                          <p className="sales-refund-helper">Calculated based on unit price and quantity.</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sales-refund-side">
              <aside className="sales-refund-summary" aria-label="Refund summary">
                <div className="sales-refund-summary-heading">
                  <span className="sales-refund-summary-icon">
                    <ReceiptText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h3>Refund Summary</h3>
                    <p>{selectedLines.length || 0} selected item{selectedLines.length === 1 ? '' : 's'}</p>
                  </div>
                </div>
                <div className="sales-refund-summary-rows">
                  <div className="sales-refund-summary-row">
                    <span>Refundable Amount (Up to)</span>
                    <strong>{formatCurrency(maxRefundTotal)}</strong>
                  </div>
                  <div className="sales-refund-summary-row">
                    <span>Refund Quantity</span>
                    <strong>{refundQuantityTotal}</strong>
                  </div>
                  <div className="sales-refund-summary-row">
                    <span>Refund Amount</span>
                    <strong>{formatCurrency(refundTotal)}</strong>
                  </div>
                </div>
                <div className="sales-refund-total-row">
                  <span>Total Refund</span>
                  <strong>-{formatCurrency(refundTotal)}</strong>
                </div>
              </aside>

              <div className="sales-refund-side-form">
                <div className="sales-refund-field">
                  <Label htmlFor="refund-reason">Refund Reason</Label>
                  <Textarea
                    id="refund-reason"
                    value={reason}
                    onChange={event => onReasonChange(event.target.value.slice(0, 500))}
                    placeholder="Example: Customer returned wrong size item."
                    disabled={isSubmitting}
                    required
                    className="sales-refund-textarea"
                  />
                  <p className="sales-refund-helper">Provide a reason for this refund (required).</p>
                </div>

                <div className="sales-refund-field">
                  <Label>Refund Transaction Date (optional)</Label>
                  <div className="actual-transaction-split-grid sales-refund-date-grid">
                    <div className="actual-transaction-split-field">
                      <Label htmlFor="refund-actual-date" className="actual-transaction-split-label">Date</Label>
                      <Input
                        id="refund-actual-date"
                        type="date"
                        value={getDatePartFromDateTime(actualTransactionAt)}
                        max={getCurrentDatePart()}
                        disabled={isSubmitting}
                        onChange={event => {
                          const nextDate = event.target.value;
                          onActualTransactionAtChange(nextDate ? combineActualTransactionDateTime(nextDate, getTimePartFromDateTime(actualTransactionAt) || getCurrentTimePart()) : '');
                        }}
                        className="actual-transaction-part-input"
                      />
                    </div>
                    <div className="actual-transaction-split-field">
                      <Label htmlFor="refund-actual-time" className="actual-transaction-split-label">Time</Label>
                      <Input
                        id="refund-actual-time"
                        type="time"
                        value={getTimePartFromDateTime(actualTransactionAt)}
                        disabled={isSubmitting}
                        onChange={event => {
                          const nextTime = event.target.value;
                          onActualTransactionAtChange(nextTime ? combineActualTransactionDateTime(getDatePartFromDateTime(actualTransactionAt) || getCurrentDatePart(), nextTime) : '');
                        }}
                        className="actual-transaction-part-input"
                      />
                    </div>
                  </div>
                  <div className="sales-refund-date-note">
                    <Info className="h-4 w-4" />
                    <span>If not set, the current date and time will be used.</span>
                  </div>
                  {isPastTransactionDate(actualTransactionAt) && (
                    <div className="sales-refund-backdate-note">
                      <p className="text-sm font-semibold text-amber-900">This refund will be saved as a backdated transaction.</p>
                      <Label htmlFor="refund-backdate-reason">Backdate reason, optional</Label>
                      <Input
                        id="refund-backdate-reason"
                        value={backdateReason}
                        maxLength={240}
                        disabled={isSubmitting}
                        onChange={event => onBackdateReasonChange(event.target.value)}
                        placeholder="Example: Encoded after outage"
                        className="h-11 rounded-xl border-amber-200 bg-white text-slate-950"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="sales-refund-actions">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="button"
              className="sales-refund-confirm-button bg-[#FF0000] text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={onConfirm}
              disabled={isSubmitting || refundTotal <= 0}
            >
              {isSubmitting ? 'Recording...' : 'Record Refund'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function SalesHistoryDialog({
  open,
  onOpenChange,
  sales,
  totalSalesCount,
  searchValue,
  periodValue,
  onPeriodChange,
  onSearchChange,
  selectedSale,
  onSelectSale,
  onDownloadSummary,
  onRefundSale,
  onCancelSale,
  canRefundSales,
  canCancelSales
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sales-history-dialog gap-0 border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-none">
        <DialogHeader className="border-b border-slate-200 px-6 pb-6 pt-6 text-left sm:px-8">
          <div className="flex items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <History className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-2xl font-bold leading-tight tracking-normal text-slate-900">
                  Sales History
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                  Review sales records, including tracked inventory items and non-inventory manual items.
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close sales history"
              onClick={() => onOpenChange(false)}
              className="sales-action-button sales-history-close-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="sales-history-body px-5 py-5 sm:px-7">
          <div className="sales-history-filter-panel rounded-xl border border-slate-200 bg-white p-4">
            <div className="sales-history-search">
              <Search className="h-5 w-5 shrink-0 text-slate-500" />
              <Input
                value={searchValue}
                onChange={event => onSearchChange(event.target.value)}
                placeholder="Search by invoice, system ref, item, employee, or remarks"
                className="sales-history-search-input border-0 bg-transparent px-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
            </div>
            <div className="sales-history-filter-controls text-sm">
              <Select value={periodValue} onValueChange={onPeriodChange}>
                <SelectTrigger className="sales-history-filter rounded-lg border-slate-200 bg-white">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <SelectValue placeholder="Date filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sales</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="sales-history-count-pill bg-slate-100 text-slate-800">
                <Info className="h-4 w-4 text-blue-600" />
                {sales.length} visible
              </Badge>
              <Badge variant="outline" className="sales-history-count-pill text-slate-800">
                <ClipboardList className="h-4 w-4 text-blue-600" />
                {totalSalesCount} total
              </Badge>
            </div>
          </div>

          {totalSalesCount === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              No sales records have been saved yet.
            </div>
          ) : sales.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              No sales records match your search.
            </div>
          ) : (
            <div className="sales-history-layout">
              <div className="sales-history-list space-y-3">
                {sales.map(sale => {
                  const isSelected = selectedSale?.id === sale.id;
                  const isRefund = isRefundSalesRecord(sale);
                  const displayNumber = getSalesHistoryTitleNumber(sale);
                  const systemReferenceNumber = getSystemReferenceNumber(sale);
                  const originalInvoiceNumber = getReferenceOfficialInvoiceNumber(sale);
                  const originalSystemNumber = getReferenceSystemNumber(sale);

                  return (
                    <button
                      key={sale.id}
                      type="button"
                      onClick={() => onSelectSale(sale.id)}
                      className={`group sales-history-record-button w-full rounded-xl border p-4 text-left ${isSelected ? 'sales-history-record-button-selected' : ''}`}
                    >
                      <div className="sales-history-row">
                        <div className="min-w-0">
                          <p className="truncate text-base font-bold text-slate-900">
                            {displayNumber}
                          </p>
                          {!isRefund && systemReferenceNumber && systemReferenceNumber !== displayNumber && (
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500">System Ref.: {systemReferenceNumber}</p>
                          )}
                          {isRefund && (
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Refund record</span>
                              {(originalInvoiceNumber || originalSystemNumber) && (
                                <span className="normal-case tracking-normal text-slate-600">
                                  for {originalInvoiceNumber || originalSystemNumber}
                                </span>
                              )}
                            </p>
                          )}
                          <p className="sales-history-meta mt-2 text-sm leading-5 text-slate-700">
                            <CalendarDays className="h-4 w-4 text-slate-500" />
                            <span className="truncate">{isRefund ? 'Refund' : 'Transaction'}: {formatDateTime(sale.createdAt)}</span>
                          </p>
                          {isBackdatedRecord(sale) && (
                            <p className="sales-history-meta mt-1 text-xs leading-5 text-amber-700">
                              <Clock className="h-4 w-4 text-amber-600" />
                              <span className="truncate">Encoded: {formatDateTime(sale.encodedAt)}</span>
                            </p>
                          )}
                          <p className="sales-history-meta mt-2 truncate text-sm leading-5 text-slate-600">
                            <User className="h-4 w-4 text-slate-500" />
                            <span className="truncate">{customerTypeLabels[sale.customerType] || 'Walk-in Customer'} - {sale.soldByName || 'System'}</span>
                          </p>
                          <p className="sales-history-meta mt-2 text-sm leading-5 text-slate-700">
                            <Tag className="h-4 w-4 text-slate-500" />
                            <span className="line-clamp-2"><strong>{isRefund ? 'Returned Item: ' : 'Item: '}</strong>{getSalePrimaryItemText(sale)}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-4 text-right">
                          <div>
                            <p className={`text-base font-bold ${isRefund ? 'text-amber-700' : 'text-slate-900'}`}>{formatCurrency(sale.totalAmount)}</p>
                            <p className="mt-1 text-sm text-slate-700">
                              {getDisplayQuantity(sale.totalQuantity)} {isRefund ? 'refunded ' : ''}item{getDisplayQuantity(sale.totalQuantity) === 1 ? '' : 's'}
                            </p>
                          </div>
                          <span className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
                            isSelected
                              ? 'border-blue-500 bg-blue-600 text-white'
                              : 'border-slate-200 bg-white text-slate-500 group-hover:border-blue-200 group-hover:bg-white group-hover:text-blue-700'
                          }`}>
                            <ChevronRight className="sales-history-arrow-right h-5 w-5" />
                            <ChevronDown className="sales-history-arrow-down h-5 w-5" />
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="sales-history-mobile-detail mt-4 border-t border-blue-100 pt-4">
                          <SalesHistoryDetailContent
                            sale={sale}
                            onDownloadSummary={onDownloadSummary}
                            onRefundSale={onRefundSale}
                            onCancelSale={onCancelSale}
                            canRefundSales={canRefundSales}
                            canCancelSales={canCancelSales}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="sales-history-detail rounded-xl border border-slate-200 bg-white p-5">
                {selectedSale ? (
                  <SalesHistoryDetailContent
                    sale={selectedSale}
                    onDownloadSummary={onDownloadSummary}
                    onRefundSale={onRefundSale}
                    onCancelSale={onCancelSale}
                    canRefundSales={canRefundSales}
                    canCancelSales={canCancelSales}
                  />
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                    Select a sales record to view details.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}

function HistoryDetail({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        {icon}
      </span>
      <div className="min-w-0">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        <strong className="mt-1 block break-words text-base text-slate-900">{value}</strong>
      </div>
    </div>
  );
}

function SalesHistoryDetailContent({ sale, onDownloadSummary, onRefundSale, onCancelSale, canRefundSales, canCancelSales }) {
  const isCancelled = sale.status === 'cancelled';
  const isRefund = isRefundSalesRecord(sale);
  const hasRefundActivity = hasRefundedSaleItems(sale);
  const hasRefundableItems = !isRefund && !isCancelled && (sale.items || []).some(item => getRemainingRefundQuantity(item) > 0);
  const canCancelThisSale = canCancelSales && !isCancelled && !isRefund && !hasRefundActivity;
  const refundUnavailableText = isRefund
    ? 'This record is already a refund'
    : isCancelled
      ? 'Cancelled sales cannot be refunded'
      : 'No refundable quantity remains.';
  const cancelHelpText = canCancelThisSale
    ? 'Cancel Entire Sale is for voiding an incorrectly encoded sale. Use Refund for customer returns.'
    : isRefund
      ? 'Refund records are kept for audit and cannot be cancelled here.'
      : hasRefundActivity
        ? 'This sale already has refund activity, so cancellation is disabled to avoid restoring stock twice.'
        : isCancelled
          ? 'This sale is already cancelled.'
          : 'Only Admin users can cancel an entire sale.';
  const transactionDate = formatHistoryDateParts(sale.createdAt);
  const encodedDate = formatHistoryDateParts(sale.encodedAt);
  const recordLabel = getTransactionRecordLabel(sale);
  const documentName = getTransactionDocumentName(sale);
  const displayNumber = getSalesHistoryTitleNumber(sale);
  const systemReferenceNumber = getSystemReferenceNumber(sale);
  const originalInvoiceNumber = getReferenceOfficialInvoiceNumber(sale);
  const originalSystemNumber = getReferenceSystemNumber(sale);
  const originalDisplayNumber = originalInvoiceNumber || originalSystemNumber;
  const remarksText = getSaleRemarksText(sale) || 'No remarks recorded.';
  return (
    <div className="space-y-5">
      <div className="sales-history-detail-header">
        <div className="sales-history-detail-title-row">
          <div className="min-w-0">
            <span className="sales-history-detail-label">{recordLabel}</span>
            <h3 className="sales-history-detail-number">{displayNumber}</h3>
            {!isRefund && systemReferenceNumber && systemReferenceNumber !== displayNumber && (
              <p className="mt-1 text-sm font-medium text-slate-600">System Ref.: {systemReferenceNumber}</p>
            )}
            {isRefund && originalDisplayNumber && (
              <p className="mt-1 text-sm font-medium text-slate-600">Original invoice: {originalDisplayNumber}</p>
            )}
          </div>
          <Badge className={`sales-history-status-badge capitalize ${isCancelled ? 'bg-red-100 text-red-700 hover:bg-red-100' : isRefund ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' : 'bg-green-100 text-green-700 hover:bg-green-100'}`}>
            {isCancelled ? <X className="h-4 w-4" /> : isRefund ? <RotateCcw className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            {isRefund ? 'refund' : sale.status || 'completed'}
          </Badge>
        </div>

        <div className="sales-history-detail-date-grid">
          <div className="sales-history-detail-date-card">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            <div className="min-w-0">
              <span>Transaction Date</span>
              <strong>{transactionDate.date}</strong>
            </div>
            {transactionDate.time && <em>{transactionDate.time}</em>}
          </div>
          {isBackdatedRecord(sale) && (
            <div className="sales-history-detail-date-card sales-history-detail-date-card-warning">
              <Clock className="h-4 w-4 text-amber-600" />
              <div className="min-w-0">
                <span>Encoded Date</span>
                <strong>{encodedDate.date}</strong>
              </div>
              {encodedDate.time && <em>{encodedDate.time}</em>}
            </div>
          )}
        </div>

        <div className="sales-history-detail-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="sales-history-action-button sales-history-receipt-button"
            onClick={() => onDownloadSummary?.(sale)}
          >
            <Download className="h-4 w-4" />
              {documentName}
          </Button>
          {canRefundSales && hasRefundableItems ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sales-history-action-button sales-history-refund-button"
              onClick={() => onRefundSale?.(sale)}
              title="Refund selected returned items and restore their stock."
            >
              <RotateCcw className="h-4 w-4" />
              Refund Items
            </Button>
          ) : canRefundSales ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sales-history-action-button sales-history-refund-button sales-history-action-button-disabled"
              disabled
              title={refundUnavailableText}
            >
              <RotateCcw className="h-4 w-4" />
              Refund Unavailable
            </Button>
          ) : null}
          {canCancelThisSale && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sales-history-action-button sales-history-cancel-button"
              onClick={() => onCancelSale?.(sale)}
              title="Cancel the entire sale and restore all tracked inventory from this transaction."
            >
              <X className="h-4 w-4" />
              Cancel Entire Sale
            </Button>
          )}
        </div>

        <div className="sales-history-action-note">
          <Info className="h-4 w-4" />
          <span>
            {isRefund && originalDisplayNumber
              ? `This refund record is linked to original invoice ${originalDisplayNumber}.`
              : hasRefundableItems
                ? 'Refund Items handles returned items and creates a separate refund record.'
                : refundUnavailableText}
            {' '}
            {cancelHelpText}
          </span>
        </div>
      </div>

      {isCancelled && (
        <div className="sales-cancelled-notice">
          <span className="sales-cancelled-notice-icon" aria-hidden="true">
            <X className="h-4 w-4" />
          </span>
          <div className="sales-cancelled-notice-copy">
            <div><strong>Cancelled sale:</strong> Inventory was restored for this transaction.</div>
            {sale.cancelReason && (
              <div className="sales-cancelled-reason">
                <strong>Reason:</strong> {sale.cancelReason}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!isRefund && <HistoryDetail icon={<ReceiptText className="h-5 w-5" />} label="Invoice No." value={displayNumber} />}
        {isRefund && <HistoryDetail icon={<ReceiptText className="h-5 w-5" />} label="Refund Ref." value={displayNumber} />}
        {systemReferenceNumber && <HistoryDetail icon={<ClipboardList className="h-5 w-5" />} label="System Ref." value={systemReferenceNumber} />}
        {!isRefund && sale.officialInvoiceExceptionReason && (
          <HistoryDetail icon={<AlertTriangle className="h-5 w-5" />} label="Booklet Note" value={sale.officialInvoiceExceptionReason} />
        )}
        {isRefund && originalDisplayNumber && <HistoryDetail icon={<ReceiptText className="h-5 w-5" />} label="Original Invoice" value={originalDisplayNumber} />}
        <HistoryDetail icon={<User className="h-5 w-5" />} label="Customer Type" value={customerTypeLabels[sale.customerType] || 'Walk-in Customer'} />
        <HistoryDetail icon={<User className="h-5 w-5" />} label={isRefund ? 'Processed By' : 'Sold By'} value={sale.soldByName || 'System'} />
        <HistoryDetail icon={<ClipboardList className="h-5 w-5" />} label="Registered Name" value={getReceiptCustomerName(sale)} />
        <HistoryDetail icon={<ClipboardList className="h-5 w-5" />} label="TIN" value={getReceiptCustomerTin(sale) || 'Blank'} />
        <HistoryDetail icon={<ClipboardList className="h-5 w-5" />} label="Business Address" value={getReceiptCustomerAddress(sale)} />
        <HistoryDetail icon={<PackageCheck className="h-5 w-5" />} label={isRefund ? 'Refunded Quantity' : 'Total Quantity'} value={`${getDisplayQuantity(sale.totalQuantity)} item${getDisplayQuantity(sale.totalQuantity) === 1 ? '' : 's'}`} />
        <HistoryDetail icon={<Coins className="h-5 w-5" />} label={isRefund ? 'Refund Subtotal' : 'Subtotal'} value={formatCurrency(sale.subtotalAmount ?? sale.totalAmount)} />
        <HistoryDetail icon={<Tag className="h-5 w-5" />} label={getDiscountLabel(sale)} value={formatCurrency(sale.discountAmount)} />
        <HistoryDetail icon={<PackageCheck className="h-5 w-5" />} label="Delivery Charge" value={formatCurrency(sale.deliveryCharge)} />
        <HistoryDetail icon={<ReceiptText className="h-5 w-5" />} label="VAT 12%" value={formatCurrency(sale.vatAmount)} />
        <HistoryDetail icon={<Wallet className="h-5 w-5" />} label={isRefund ? 'Refund Amount' : 'Amount Due'} value={formatCurrency(sale.totalAmount)} />
        <HistoryDetail icon={<ReceiptText className="h-5 w-5" />} label={isRefund ? 'Refund Method' : 'Payment Method'} value={paymentMethodLabels[sale.paymentMethod] || 'Cash'} />
        <HistoryDetail icon={<Coins className="h-5 w-5" />} label={isRefund ? 'Refund Released' : 'Amount Received'} value={formatCurrency(sale.amountReceived ?? sale.totalAmount)} />
        {!isRefund && <HistoryDetail icon={<Coins className="h-5 w-5" />} label="Change" value={formatCurrency(sale.changeAmount)} />}
        {sale.paymentReference && (
          <HistoryDetail icon={<ClipboardList className="h-5 w-5" />} label="Payment Reference" value={sale.paymentReference} />
        )}
        {requiresPaymentConfirmation(sale.paymentMethod) && (
          <HistoryDetail icon={<CheckCircle className="h-5 w-5" />} label="Payment Confirmation" value={sale.paymentConfirmedBy ? `Confirmed by ${sale.paymentConfirmedBy}` : 'Confirmed'} />
        )}
        {sale.backdateReason && (
          <HistoryDetail icon={<ClipboardList className="h-5 w-5" />} label="Backdate Reason" value={sale.backdateReason} />
        )}
      </div>

      <div className="pb-2 pt-2">
        <div className="mb-2 flex items-center justify-between gap-3 py-1">
          <h4 className="text-base font-semibold text-slate-900">{isRefund ? 'Refunded Items' : 'Sold Items'}</h4>
          <span className="text-sm text-slate-700">{sale.items?.length || 0} line{sale.items?.length === 1 ? '' : 's'}</span>
        </div>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          {(sale.items || []).map(item => (
            <div key={item.id} className="sales-history-items-table sales-history-item-row rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words font-semibold leading-5 text-slate-900">{item.itemName}</p>
                  {isNonInventorySaleItem(item) && (
                    <Badge variant="outline" className="bg-white text-slate-700">Non-Inventory</Badge>
                  )}
                  {Number(item.refundedQuantity || 0) > 0 && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700">
                      {item.refundedQuantity} refunded
                    </Badge>
                  )}
                </div>
                <p className="mt-1 break-words text-xs leading-5 text-slate-700">
                  Category: {item.category || 'Uncategorized'}
                </p>
                {item.categoryNote && (
                  <p className="mt-1 break-words text-xs leading-5 text-slate-700">
                    Note: {item.categoryNote}
                  </p>
                )}
                <p className="mt-1 text-xs leading-5 text-slate-700">Unit Price: {formatCurrency(item.unitPrice)}</p>
              </div>
              <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                <span className="inline-flex h-8 items-center rounded-full bg-white px-3 text-xs font-semibold text-slate-700">
                  {isRefund ? 'Qty Refunded' : 'Qty Sold'}: {Math.abs(Number(item.quantitySold || 0))}
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-end gap-6 rounded-lg bg-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-700">{isRefund ? 'Refund Subtotal' : 'Items Subtotal'}</span>
            <strong className="whitespace-nowrap text-slate-900">{formatCurrency(sale.subtotalAmount ?? sale.totalAmount)}</strong>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <MessageSquareText className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-700">Remarks</span>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">{remarksText}</p>
        </div>
      </div>
    </div>
  );
}
function SummaryBlock({ icon, label, value, tone = 'slate' }) {
  const toneClasses = {
    blue: 'border border-slate-200 bg-white text-slate-900',
    green: 'border border-slate-200 bg-white text-slate-900',
    amber: 'border border-slate-200 bg-white text-slate-900',
    slate: 'border border-slate-200 bg-white text-slate-900'
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${toneClasses[tone] || toneClasses.slate}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <span className="block text-xs font-medium text-slate-700">{label}</span>
        <strong className="block truncate text-sm text-slate-900">{value}</strong>
      </div>
    </div>
  );
}
