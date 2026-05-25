import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Minus, ReceiptText, Trash2, ShoppingCart, History, CheckCircle, Info, PackageCheck, AlertTriangle, TrendingUp, User, Coins, ClipboardList, Search, CalendarDays, Tag, Wallet, MessageSquareText, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Download, Pencil } from 'lucide-react';
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
import { isAdminRole } from '../utils/roles';

const emptySaleLine = () => ({
  inventoryId: '',
  isManual: false,
  itemName: '',
  category: 'Other',
  quantity: '',
  unitPrice: ''
});

const SALES_REMARKS_MAX_LENGTH = 500;
const PRODUCT_PAGE_SIZE = 10;
const DEFAULT_NON_INVENTORY_DRAFT = {
  itemName: '',
  category: 'Other',
  quantity: '1',
  unitPrice: ''
};
const VAGUE_NON_INVENTORY_NAMES = new Set(['other', 'others', 'misc', 'miscellaneous']);

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

const requiresPaymentConfirmation = paymentMethod => ['gcash', 'bank_transfer'].includes(paymentMethod);
const VAT_RATE = 0.12;

const computeVatBreakdown = totalAmount => {
  const gross = Number(totalAmount || 0);
  const vatableSales = Number((gross / (1 + VAT_RATE)).toFixed(2));
  const vatAmount = Number((gross - vatableSales).toFixed(2));
  return { vatableSales, vatAmount };
};

const getReceiptVatBreakdown = sale => computeVatBreakdown(Number(sale?.totalAmount || 0));

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

const RECEIPT_BUSINESS_INFO = {
  businessName: 'E.M. CAYETANO TRADING',
  tin: 'VAT REG TIN: [Client\'s Official TIN]',
  addresses: {
    manggahan: '196 J. P. Rizal St, Rodriguez, 1860 Rizal',
    san_rafael: '482 MH del Pilar St, Rodriguez, 1860 Rizal'
  },
  permit: 'PERMIT TO USE LOOSE LEAF NO.: [To be provided]',
  authority: 'BIR AUTHORITY TO PRINT NO.: [To be provided]',
  approvedSeries: 'APPROVED SERIES: [System-generated series]'
};

const getReceiptBranchAddress = branch => {
  const normalizedBranch = String(branch || '').toLowerCase().replace(/\s+/g, '_');
  if (normalizedBranch.includes('san_rafael') || normalizedBranch.includes('sanrafael')) {
    return RECEIPT_BUSINESS_INFO.addresses.san_rafael;
  }
  return RECEIPT_BUSINESS_INFO.addresses.manggahan;
};

const downloadSaleTransactionSummary = sale => {
  if (!sale) return;

  const saleNumber = sale.salesNumber || 'Sales record';
  const items = sale.items || [];
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const contentWidth = pageWidth - (margin * 2);
  const money = value => `P${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
  const paymentLabel = paymentMethodLabels[sale.paymentMethod] || 'Cash';
  const customerName = sale.customerName || (sale.customerType === 'walk_in' ? 'Various' : customerTypeLabels[sale.customerType] || 'Various');
  const branchAddress = getReceiptBranchAddress(sale.branch);
  const receiptVat = getReceiptVatBreakdown(sale);
  const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const formattedDate = Number.isNaN(saleDate.getTime())
    ? formatDateTime(sale.createdAt)
    : saleDate.toLocaleDateString();
  const drawText = (text, x, y, options = {}) => {
    doc.text(String(text ?? ''), x, y, options);
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
    title: `${saleNumber} Receipt`,
    subject: 'Sales transaction invoice-style receipt',
    author: sale.soldByName || 'System',
    creator: 'E.M. Cayetano Trading POS-Integrated Inventory System'
  });

  doc.setDrawColor(17, 24, 39);
  doc.setLineWidth(0.35);
  doc.setFillColor(17, 45, 84);
  doc.rect(margin, 8, contentWidth, 2.5, 'F');

  let y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  drawText(RECEIPT_BUSINESS_INFO.businessName, margin + 20, y);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  drawText(RECEIPT_BUSINESS_INFO.tin, margin + 20, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.splitTextToSize(branchAddress, 76).forEach((lineText, index) => {
    drawText(lineText, margin + 20, y + 11 + (index * 4));
  });

  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(1.1);
  doc.circle(margin + 8, y + 7, 3.2);
  doc.circle(margin + 3, y + 15, 3.2);
  doc.circle(margin + 13, y + 15, 3.2);
  doc.line(margin + 6, y + 9, margin + 4.5, y + 12);
  doc.line(margin + 10, y + 9, margin + 12, y + 12);
  doc.line(margin + 6.2, y + 15, margin + 9.8, y + 15);

  doc.setDrawColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(17, 45, 84);
  drawText('INVOICE', pageWidth - margin, y + 10, { align: 'right' });
  doc.setTextColor(220, 38, 38);
  doc.setFontSize(12);
  drawText(`Invoice No.: ${saleNumber}`, pageWidth - margin, y + 22, { align: 'right' });
  doc.setTextColor(17, 24, 39);

  y = 45;
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
  drawBox(pageWidth - margin - 72, y - 3, 72, 11);
  doc.line(pageWidth - margin - 46, y - 3, pageWidth - margin - 46, y + 8);
  doc.setFont('helvetica', 'bold');
  drawText('Date:', pageWidth - margin - 70, y + 4);
  doc.setFont('helvetica', 'normal');
  drawText(formattedDate, pageWidth - margin - 42, y + 4);

  y = 58;
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
  drawText(sale.customerTin || '-', margin + 52, y + 18);
  drawText('Business Address:', margin + 8, y + 24);
  drawText(sale.customerAddress || '-', margin + 52, y + 24);

  y = 90;
  const tableX = margin;
  const tableWidth = contentWidth;
  const colWidths = [88, 26, 34, tableWidth - 88 - 26 - 34];
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
    drawText(money(item.unitPrice), tableX + colWidths[0] + colWidths[1] + colWidths[2] - 2, rowTop + 5.2, { align: 'right' });
    drawText(money(item.subtotal), tableX + tableWidth - 2, rowTop + 5.2, { align: 'right' });
  });

  y += tableHeight + 8;
  const taxBoxWidth = 75;
  const totalsBoxWidth = 92;
  const boxRowHeight = 8;
  const leftRows = [
    ['VATable Sales', money(receiptVat.vatableSales)],
    ['VAT', money(receiptVat.vatAmount)],
    ['Zero-Rated Sales', money(0)],
    ['VAT-Exempt Sales', money(0)]
  ];
  const rightRows = [
    ['Sales Subtotal', money(sale.subtotalAmount ?? sale.totalAmount)],
    [`Less: Discount`, money(sale.discountAmount)],
    ['Add: Delivery Charge', money(sale.deliveryCharge)],
    ['Total Sales (VAT Inclusive)', money(sale.totalAmount)],
    ['Less: VAT', money(receiptVat.vatAmount)],
    ['Amount: Net of VAT', money(receiptVat.vatableSales)],
    ['Add: VAT', money(receiptVat.vatAmount)],
    ['TOTAL AMOUNT DUE', money(sale.totalAmount)]
  ];
  drawBox(margin, y, taxBoxWidth, leftRows.length * boxRowHeight);
  leftRows.forEach(([label, value], index) => {
    const rowY = y + (index * boxRowHeight);
    if (index > 0) doc.line(margin, rowY, margin + taxBoxWidth, rowY);
    doc.line(margin + 45, rowY, margin + 45, rowY + boxRowHeight);
    drawText(label, margin + 43, rowY + 5.2, { align: 'right' });
    drawText(value, margin + taxBoxWidth - 2, rowY + 5.2, { align: 'right' });
  });
  const totalsX = pageWidth - margin - totalsBoxWidth;
  drawBox(totalsX, y, totalsBoxWidth, rightRows.length * boxRowHeight);
  rightRows.forEach(([label, value], index) => {
    const rowY = y + (index * boxRowHeight);
    if (index > 0) doc.line(totalsX, rowY, totalsX + totalsBoxWidth, rowY);
    doc.line(totalsX + 54, rowY, totalsX + 54, rowY + boxRowHeight);
    doc.setFont('helvetica', index === rightRows.length - 1 ? 'bold' : 'normal');
    drawText(label, totalsX + 52, rowY + 5.2, { align: 'right' });
    drawText(value, totalsX + totalsBoxWidth - 2, rowY + 5.2, { align: 'right' });
  });
  doc.setFont('helvetica', 'normal');
  y += rightRows.length * boxRowHeight + 7;

  drawText(`Received the amount of ${money(sale.amountReceived ?? sale.totalAmount)} via ${paymentLabel}.`, margin, y);
  drawText(`Change: ${money(sale.changeAmount)}`, margin, y + 5);
  if (sale.paymentReference) drawText(`Payment Reference: ${String(sale.paymentReference).slice(0, 40)}`, margin, y + 10);
  if (sale.remarks) {
    doc.setFont('helvetica', 'bold');
    drawText('Remarks:', margin, y + 17);
    doc.setFont('helvetica', 'normal');
    doc.splitTextToSize(sale.remarks, contentWidth).slice(0, 3).forEach((lineText, index) => {
      drawText(lineText, margin, y + 22 + (index * 4));
    });
  }

  const footerY = Math.max(274, y + (sale.remarks ? 36 : 14));
  drawBox(margin, footerY - 6, contentWidth, 14);
  doc.setFontSize(6.5);
  drawText(RECEIPT_BUSINESS_INFO.permit, margin + 2, footerY - 1);
  drawText('DATE ISSUED: [To be provided]', margin + 2, footerY + 3);
  drawText(RECEIPT_BUSINESS_INFO.authority, pageWidth - margin - 88, footerY - 1);
  drawText('DATE ISSUED: [To be provided]', pageWidth - margin - 88, footerY + 3);
  drawText(RECEIPT_BUSINESS_INFO.approvedSeries, pageWidth - margin - 88, footerY + 7);

  doc.save(`${saleNumber}_transaction_receipt.pdf`);
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
  const saleNumber = escapeReceiptText(sale.salesNumber || 'Sales record');
  const minimumReceiptRows = 10;
  const itemRows = [
    ...items.map(item => `
      <tr>
        <td>
          ${escapeReceiptText(item.itemName || 'Inventory item')}
          ${isNonInventorySaleItem(item) ? '<br><small class="item-note">Non-Inventory</small>' : ''}
        </td>
        <td class="center-cell">${escapeReceiptText(item.quantitySold || 0)}</td>
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
  const customerName = escapeReceiptText(sale.customerName || (sale.customerType === 'walk_in' ? 'Various' : customerTypeLabels[sale.customerType] || 'Various'));
  const branchAddress = escapeReceiptText(getReceiptBranchAddress(sale.branch));
  const receiptVat = getReceiptVatBreakdown(sale);
  const receiptDate = escapeReceiptText(formatDateTime(sale.createdAt));
  const cashChecked = sale.paymentMethod === 'credit' ? '' : 'checked';
  const chargeChecked = sale.paymentMethod === 'credit' ? 'checked' : '';

  receiptWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${saleNumber} Receipt</title>
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
          .top-rule {
            height: 4px;
            background: #112d54;
          }
          .header {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 20px;
            padding: 20px 22px 12px;
          }
          .brand {
            display: grid;
            grid-template-columns: 48px 1fr;
            gap: 14px;
            align-items: start;
          }
          .mark {
            position: relative;
            width: 42px;
            height: 42px;
            margin-top: 2px;
          }
          .mark span {
            position: absolute;
            display: block;
            width: 12px;
            height: 12px;
            border: 3px solid #dc2626;
            border-radius: 999px;
            background: #fff;
          }
          .mark span:nth-child(1) { top: 0; left: 15px; }
          .mark span:nth-child(2) { bottom: 0; left: 0; }
          .mark span:nth-child(3) { bottom: 0; right: 0; }
          .brand-name {
            font-size: 20px;
            font-weight: 800;
            letter-spacing: .02em;
          }
          .tin {
            margin-top: 2px;
            font-weight: 700;
          }
          .address {
            max-width: 84mm;
            margin-top: 2px;
            font-size: 11px;
          }
          .invoice-title {
            color: #112d54;
            font-size: 30px;
            font-weight: 800;
            text-align: right;
          }
          .invoice-number {
            margin-top: 18px;
            color: #dc2626;
            font-size: 18px;
            font-weight: 700;
            text-align: right;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            align-items: end;
            padding: 0 22px;
            margin-top: 2px;
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
            width: 38%;
            border: 1px solid #111827;
            display: grid;
            grid-template-columns: 72px 1fr;
            min-height: 34px;
          }
          .date-box strong,
          .date-box span {
            padding: 9px 10px;
          }
          .date-box strong {
            border-right: 1px solid #111827;
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
          .amount-cell { text-align: right; white-space: nowrap; }
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
          .footer {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 18px;
            border-top: 1px solid #111827;
            padding: 7px 10px;
            font-size: 9px;
          }
        </style>
      </head>
      <body>
        <main class="receipt">
          <div class="top-rule"></div>
          <header class="header">
            <div class="brand">
              <div class="mark"><span></span><span></span><span></span></div>
              <div>
                <div class="brand-name">${escapeReceiptText(RECEIPT_BUSINESS_INFO.businessName)}</div>
                <div class="tin">${escapeReceiptText(RECEIPT_BUSINESS_INFO.tin)}</div>
                <div class="address">${branchAddress}</div>
              </div>
            </div>
            <div>
              <div class="invoice-title">INVOICE</div>
              <div class="invoice-number">Invoice No.: ${saleNumber}</div>
            </div>
          </header>

          <section class="meta-row">
            <div class="check-lines">
              <div class="check-line"><span class="box">${cashChecked ? '&#10003;' : ''}</span> CASH SALES</div>
              <div class="check-line"><span class="box">${chargeChecked ? '&#10003;' : ''}</span> CHARGE SALES</div>
            </div>
            <div class="date-box"><strong>Date:</strong><span>${receiptDate}</span></div>
          </section>

          <section class="sold-to">
            <div class="sold-to-title">SOLD TO:</div>
            <div class="sold-to-body">
              <div class="sold-line"><span>Registered Name :</span><strong>${customerName}</strong></div>
              <div class="sold-line"><span>TIN :</span><span>${escapeReceiptText(sale.customerTin || '-')}</span></div>
              <div class="sold-line"><span>Business Address :</span><span>${escapeReceiptText(sale.customerAddress || '-')}</span></div>
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
                  <tr><td>Add: Delivery Charge</td><td>${escapeReceiptText(formatCurrency(sale.deliveryCharge))}</td></tr>
                  <tr><td>Total Sales<br><small>(VAT Inclusive)</small></td><td>${escapeReceiptText(formatCurrency(sale.totalAmount))}</td></tr>
                  <tr><td>Less: VAT</td><td>${escapeReceiptText(formatCurrency(receiptVat.vatAmount))}</td></tr>
                  <tr><td>Amount: Net of VAT</td><td>${escapeReceiptText(formatCurrency(receiptVat.vatableSales))}</td></tr>
                  <tr><td>Add: VAT</td><td>${escapeReceiptText(formatCurrency(receiptVat.vatAmount))}</td></tr>
                  <tr class="total-row"><td>TOTAL AMOUNT DUE</td><td>${escapeReceiptText(formatCurrency(sale.totalAmount))}</td></tr>
                  <tr><td>Change</td><td>${escapeReceiptText(formatCurrency(sale.changeAmount))}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          ${sale.remarks ? `
            <section style="padding: 0 22px 14px;">
              <strong>Remarks:</strong> ${escapeReceiptText(sale.remarks)}
            </section>
          ` : ''}
          <footer class="footer">
            <div>
              ${escapeReceiptText(RECEIPT_BUSINESS_INFO.permit)}<br>
              DATE ISSUED: [To be provided]
            </div>
            <div>
              ${escapeReceiptText(RECEIPT_BUSINESS_INFO.authority)}<br>
              DATE ISSUED: [To be provided]<br>
              ${escapeReceiptText(RECEIPT_BUSINESS_INFO.approvedSeries)}
            </div>
          </footer>
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
  return `${firstItem.itemName} (${firstItem.quantitySold})${extraCount > 0 ? `, +${extraCount} more` : ''}`;
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

const isValidMoneyText = value =>
  String(value || '').trim() === '' || /^\d+(\.\d{0,2})?$/.test(String(value).trim());

export function SalesModule({ user }) {
  const { inventory, salesTransactions, recordSale, cancelSale } = useData();
  const [customerType, setCustomerType] = useState('walk_in');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountType, setDiscountType] = useState('none');
  const [discountAmount, setDiscountAmount] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentConfirmedAmount, setPaymentConfirmedAmount] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [saleLines, setSaleLines] = useState([emptySaleLine()]);
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isNonInventoryDialogOpen, setIsNonInventoryDialogOpen] = useState(false);
  const [nonInventoryDraft, setNonInventoryDraft] = useState(DEFAULT_NON_INVENTORY_DRAFT);
  const [nonInventorySessionCount, setNonInventorySessionCount] = useState(0);
  const [editingNonInventoryLineIndex, setEditingNonInventoryLineIndex] = useState(null);
  const [saleToCancel, setSaleToCancel] = useState(null);
  const [completedSale, setCompletedSale] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancellingSale, setIsCancellingSale] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('all');
  const [productSort, setProductSort] = useState('name_az');
  const [productPage, setProductPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPeriod, setHistoryPeriod] = useState('all');
  const [selectedHistorySaleId, setSelectedHistorySaleId] = useState('');
  const [isClearItemsConfirmOpen, setIsClearItemsConfirmOpen] = useState(false);
  const canCancelSales = isAdminRole(user?.role);

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

  const productCategories = useMemo(
    () => ['all', ...Array.from(new Set(activeInventory.map(item => item.category || 'Uncategorized'))).sort((a, b) => a.localeCompare(b))],
    [activeInventory]
  );

  const filteredSaleInventory = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    const filteredItems = activeInventory.filter(item => {
      const matchesCategory = productCategory === 'all' || (item.category || 'Uncategorized') === productCategory;
      if (!matchesCategory) return false;
      if (!query) return true;

      return [
        item.itemCode,
        item.name,
        item.category,
        item.supplierName,
        item.defaultSellingPrice
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
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
  const hasSelectedTrackedItems = cartLines.some(line => !line.isManual);
  const hasSelectedNonInventoryItems = cartLines.some(line => line.isManual);

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
  const totalAmount = Math.max(subtotalAmount - safeDiscountAmount + safeDeliveryCharge, 0);
  const { vatableSales, vatAmount } = computeVatBreakdown(totalAmount);
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

  const hasSalesFormInput = useMemo(() => (
    customerType !== 'walk_in' ||
    paymentMethod !== 'cash' ||
    discountType !== 'none' ||
    String(discountAmount || '').trim() !== '' ||
    String(deliveryCharge || '').trim() !== '' ||
    String(amountReceived || '').trim() !== '' ||
    String(paymentReference || '').trim() !== '' ||
    paymentConfirmed ||
    remarks.trim() !== '' ||
    saleLines.some(line => (
      String(line.inventoryId || '').trim() !== '' ||
      String(line.itemName || '').trim() !== '' ||
      String(line.quantity || '').trim() !== '' ||
      String(line.unitPrice || '').trim() !== ''
    ))
  ), [amountReceived, customerType, deliveryCharge, discountAmount, discountType, paymentConfirmed, paymentMethod, paymentReference, remarks, saleLines]);

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
        customerTypeLabels[sale.customerType],
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
        ...(sale.items || []).flatMap(item => [
          item.itemName,
          item.category,
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
          unitPrice: defaultPrice > 0 ? defaultPrice.toFixed(2) : ''
          }
        : line
    )));
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

    const preparedLine = {
      ...emptySaleLine(),
      isManual: true,
      itemName,
      category: nonInventoryDraft.category || 'Other',
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
        category: nonInventoryDraft.category || 'Other'
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
      const existingIndex = prev.findIndex(line => String(line.inventoryId) === inventoryId);

      if (existingIndex >= 0) {
        const currentQuantity = Number(prev[existingIndex].quantity || 0);
        if (currentQuantity >= availableStock) {
          toast.warning(`${item.name} has only ${availableStock} unit${availableStock === 1 ? '' : 's'} available.`);
          return prev;
        }

        return prev.map((line, lineIndex) => (
          lineIndex === existingIndex
            ? { ...line, quantity: String(currentQuantity + 1) }
            : line
        ));
      }

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
    setCustomerType('walk_in');
    setPaymentMethod('cash');
    setDiscountType('none');
    setDiscountAmount('');
    setDeliveryCharge('');
    setAmountReceived('');
    setPaymentReference('');
    setPaymentConfirmed(false);
    setPaymentConfirmedAmount(null);
    setRemarks('');
    setSaleLines([emptySaleLine()]);
    setIsNonInventoryDialogOpen(false);
    setNonInventoryDraft(DEFAULT_NON_INVENTORY_DRAFT);
    setNonInventorySessionCount(0);
    setEditingNonInventoryLineIndex(null);
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
        if (String(line.unitPrice || '').trim() === '' || !Number.isFinite(line.unitPrice) || line.unitPrice <= 0) {
          toast.error(`${line.itemName}: unit price is required and must be greater than zero.`);
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

      if (String(line.unitPrice || '').trim() === '' || !Number.isFinite(line.unitPrice) || line.unitPrice <= 0) {
        toast.error(`${line.item.name}: unit price is required and must be greater than zero.`);
        return false;
      }
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

    return true;
  };

  const handleRecordSale = async () => {
    if (!validateSale()) return;

    const receiptPrintWindow = openReceiptPrintWindow();
    setIsSaving(true);
    try {
      const sale = await recordSale({
        customerType,
        remarks,
        paymentMethod,
        discountType,
        discountAmount: safeDiscountAmount,
        deliveryCharge: safeDeliveryCharge,
        amountReceived: paymentMethod === 'cash' ? safeAmountReceived : totalAmount,
        paymentReference: needsPaymentConfirmation ? paymentReference.trim() : '',
        paymentConfirmed: needsPaymentConfirmation || paymentMethod === 'cash',
        items: selectedLineDetails.map(line => ({
          inventoryId: line.inventoryId,
          isManual: Boolean(line.isManual),
          itemName: line.itemName,
          category: line.category,
          quantity: line.quantity,
          unitPrice: line.unitPrice
        }))
      });
      toast.success('Sale recorded successfully.', {
        description: `${sale?.salesNumber || sale?.sales_number || 'Sales record'} saved and inventory was updated.`
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

  const handleSaveSaleRequest = () => {
    if (!validateSale()) return;
    setIsSaveConfirmOpen(true);
  };

  const confirmSaveSale = () => {
    setIsSaveConfirmOpen(false);
    handleRecordSale();
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
        description: `${cancelledSale?.sales_number || cancelledSale?.salesNumber || saleToCancel.salesNumber || 'Sales record'} was marked as cancelled.`
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
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .sales-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(340px, 410px);
          gap: 1.25rem;
          align-items: start;
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
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
          background: #ffffff;
          padding: 1rem;
        }

        .sales-section-heading {
          display: flex;
          align-items: flex-start;
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
          border: 1px solid #e2e8f0;
          border-radius: 0.65rem;
          background: #f8fafc;
          padding: 0 0.85rem;
          color: #334155;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .sales-customer-control {
          min-height: 3.5rem;
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
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
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

        .sales-cancel-dialog {
          width: min(100% - 1.5rem, 39rem);
          max-width: min(100% - 1.5rem, 39rem) !important;
          border-radius: 1rem;
        }

        .sales-cancel-content {
          padding: 1.35rem;
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
          width: min(100%, 22rem);
          margin: 1rem auto 0;
          border: 1px solid #e2e8f0;
          border-radius: 0.85rem;
          background: #ffffff;
          padding: 1rem;
          color: #0f172a;
          font-family: "Courier New", monospace;
          box-shadow: inset 0 -12px 20px rgba(15, 23, 42, 0.03);
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
          width: 2.75rem;
          height: 2.75rem;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border-radius: 0.9rem;
          background: #fff7ed;
          color: #c2410c;
        }

        .sales-checkout-card {
          border-color: #e2e8f0;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
          display: flex;
          flex-direction: column;
        }

        .sales-checkout-header {
          padding: 1rem 1rem 0.6rem;
        }

        .sales-checkout-content {
          display: grid;
          gap: 0.85rem;
          padding: 0 1rem 1rem;
          min-height: 0;
          overflow-y: auto;
        }

        .sales-checkout-section {
          padding: 0.9rem;
        }

        .sales-checkout-card .sales-customer-grid {
          grid-template-columns: 1fr;
          gap: 0.8rem;
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

        .sales-remarks-field {
          display: grid;
          gap: 0.55rem;
        }

        .sales-remarks-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
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

        .sales-history-search {
          display: flex;
          min-width: 0;
          flex: 1;
          align-items: center;
          gap: 0.85rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          background: #ffffff;
          padding: 0 1rem;
          min-height: 3rem;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }

        .sales-history-filter {
          min-width: 12rem;
        }

        .sales-history-search:focus-within {
          border-color: #f4f400;
          box-shadow: 0 0 0 3px rgba(244, 244, 0, 0.32);
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

        .sales-confirm-sale-summary {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.65rem;
          margin-top: 1rem;
        }

        .sales-confirm-sale-summary-item {
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          background: #f8fafc;
          padding: 0.75rem;
        }

        .sales-confirm-sale-summary-label {
          display: block;
          color: #64748b;
          font-size: 0.72rem;
          font-weight: 700;
          line-height: 1rem;
          text-transform: uppercase;
        }

        .sales-confirm-sale-summary-value {
          display: block;
          margin-top: 0.2rem;
          color: #0f172a;
          font-size: 0.95rem;
          font-weight: 800;
          line-height: 1.25rem;
          overflow-wrap: break-word;
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
          grid-template-columns: minmax(0, 1.42fr) minmax(360px, 0.92fr);
          gap: 1rem;
          align-items: stretch;
        }

        .sales-grid {
          grid-template-columns: minmax(0, 1.45fr) minmax(360px, 0.82fr);
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
        }

        .sales-context-action-button:hover,
        .sales-context-action-button:focus-visible {
          border-color: #cbd5e1;
          background: #f8fafc;
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
          grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
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
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 0.85rem;
        }

        .sales-pos-field {
          display: grid;
          gap: 0.45rem;
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
          grid-template-columns: minmax(0, 1fr) minmax(6.25rem, auto);
          gap: 0.8rem;
          align-items: center;
          border: 1px solid #e2e8f0;
          border-radius: 0.95rem;
          background: #ffffff;
          min-height: 7.15rem;
          padding: 0.95rem;
          text-align: left;
          transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
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

        .sales-product-card.is-out-of-stock .sales-product-add-pill {
          border-color: #e2e8f0;
          background: #f1f5f9;
          color: #64748b;
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
          color: #64748b;
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
          display: flex;
          width: 6.9rem;
          height: 100%;
          flex-direction: column;
          align-items: flex-end;
          justify-content: center;
          gap: 0.55rem;
          justify-self: end;
        }

        .sales-product-card-price {
          width: 100%;
          text-align: right;
        }

        .sales-add-product-button:hover,
        .sales-add-product-button:focus-visible {
          border-color: #ef4444;
          background: #fef2f2;
          color: #b91c1c;
        }

        .sales-cart-list {
          display: grid;
          gap: 0.55rem;
          min-height: 0;
          overflow: visible;
        }

        .sales-cart-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.6rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.9rem;
          background: #ffffff;
          padding: 0.7rem;
        }

        .sales-cart-main {
          min-width: 0;
        }

        .sales-cart-title {
          color: #0f172a;
          font-size: 0.92rem;
          font-weight: 800;
          line-height: 1.2rem;
        }

        .sales-cart-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-top: 0.2rem;
          color: #64748b;
          font-size: 0.75rem;
          line-height: 1.1rem;
        }

        .sales-cart-controls {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          grid-column: 1 / -1;
          gap: 0.6rem;
          align-items: center;
          margin-top: 0.55rem;
        }

        .sales-cart-secondary-controls {
          display: inline-grid;
          grid-template-columns: minmax(7.25rem, 8.5rem) auto;
          align-items: center;
          justify-self: start;
          gap: 0.6rem;
          min-width: 0;
        }

        .sales-cart-row-actions {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.5rem;
          white-space: nowrap;
        }

        .sales-cart-row-actions .sales-action-button {
          flex: 0 0 auto;
        }

        .sales-cart-quantity-field {
          min-width: 0;
        }

        .sales-cart-price-field {
          min-width: 0;
        }

        .sales-cart-control-label {
          display: none;
        }

        .sales-qty-stepper {
          display: inline-grid;
          grid-template-columns: 2.05rem 2.35rem 2.05rem;
          align-items: center;
          overflow: hidden;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #f8fafc;
        }

        .sales-qty-stepper button {
          display: inline-flex;
          width: 2.1rem;
          height: 2.1rem;
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
          width: 2.35rem;
          height: 100%;
          border: 0;
          background: transparent;
          text-align: center;
          color: #0f172a;
          font-weight: 800;
          outline: none;
        }

        .sales-cart-price-input {
          height: 2.45rem;
          width: 100%;
          min-width: 0;
          max-width: none;
          border: 1px solid #cbd5e1;
          border-radius: 0.7rem;
          background: #ffffff;
          color: #0f172a;
          font-weight: 650;
          text-align: right;
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
          transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
        }

        .sales-cart-price-input:hover {
          border-color: #94a3b8;
          background: #f8fafc;
        }

        .sales-cart-price-input:focus-visible {
          border-color: #f4f400;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(244, 244, 0, 0.28);
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
          color: #0f172a;
          font-size: 0.95rem;
          font-weight: 850;
          line-height: 1.2rem;
          text-align: right;
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
          .sales-cart-list,
          .sales-checkout-compact {
            max-height: none;
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

          .sales-history-layout {
            grid-template-columns: 1fr;
            flex: 1;
            overflow: hidden;
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
          .sales-pos-search-row {
            grid-template-columns: 1fr;
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
            grid-template-columns: minmax(7.75rem, 0.85fr) minmax(0, 1.15fr);
            gap: 0.65rem;
            align-items: end;
            border-radius: 0.85rem;
            background: #f8fafc;
            padding: 0.65rem;
          }

          .sales-cart-quantity-field {
            display: grid;
            gap: 0.3rem;
            min-width: 0;
          }

          .sales-cart-controls .sales-qty-stepper {
            width: 100%;
            min-height: 2.7rem;
            grid-template-columns: 2.35rem minmax(2.75rem, 1fr) 2.35rem;
            background: #ffffff;
            border-radius: 0.8rem;
          }

          .sales-cart-controls .sales-qty-stepper input {
            width: 100%;
            min-width: 0;
            padding: 0;
            justify-self: stretch;
            text-align: center;
          }

          .sales-cart-secondary-controls {
            width: 100%;
            grid-template-columns: minmax(0, 1fr) auto;
            justify-self: stretch;
            gap: 0.55rem;
          }

          .sales-cart-price-field {
            display: grid;
            gap: 0.3rem;
          }

          .sales-cart-control-label {
            display: block;
            color: #64748b;
            font-size: 0.72rem;
            font-weight: 750;
            line-height: 1rem;
            text-align: left;
          }

          .sales-cart-price-input {
            height: 2.7rem;
            border-radius: 0.75rem;
          }

          .sales-cart-row-actions {
            align-self: stretch;
            align-items: end;
            gap: 0.45rem;
          }

          .sales-cart-row-actions .sales-action-button {
            height: 2.7rem;
            width: 2.7rem;
          }

          @media (max-width: 430px) {
            .sales-cart-controls {
              grid-template-columns: 1fr;
            }

            .sales-cart-secondary-controls {
              grid-template-columns: minmax(0, 1fr) auto;
            }
          }

          .sales-customer-grid,
          .sales-summary-grid {
            grid-template-columns: 1fr;
          }

          .sales-checkout-card .sales-customer-grid,
          .sales-checkout-card .sales-summary-grid {
            grid-template-columns: 1fr;
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

          .sales-page-toolbar .sales-view-all-button {
            width: 100%;
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

          .sales-confirm-sale-summary {
            grid-template-columns: 1fr;
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
                    placeholder="Search item name, code, supplier"
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
                      className="sales-action-button mt-3 border-slate-200 text-slate-700 hover:border-slate-500 hover:bg-white hover:text-slate-900"
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
                  return (
                    <div
                      key={item.id}
                      className={`sales-product-card${isOutOfStock ? ' is-out-of-stock' : ''}${isSaving ? ' is-disabled' : ''}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">
                          {item.name}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {item.itemCode || 'No item code'}
                        </span>
                        <span className="sales-product-meta mt-2">
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
                      <span className="sales-product-card-action">
                        <strong className="sales-product-card-price whitespace-nowrap text-sm text-slate-900">
                          {defaultPrice > 0 ? formatCurrency(defaultPrice) : 'No price'}
                        </strong>
                        <button
                          type="button"
                          className="sales-product-add-pill"
                          onClick={() => addInventoryItemToSale(item)}
                          disabled={isSaving || isOutOfStock}
                          aria-label={`${isOutOfStock ? 'Out of stock: ' : 'Add '}${item.name}`}
                        >
                          <ShoppingCart className="h-4 w-4" />
                          {isOutOfStock ? 'Out' : 'Add'}
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
                      {user?.fullName || user?.username || 'Current user'}
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
                                onValueChange={value => updateLine(index, 'category', value)}
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
                          <Label>Unit Price <span className="text-red-600">*</span></Label>
                          <Input
                            type="text"
                            min="0"
                            inputMode="decimal"
                            pattern="^\\d*(\\.\\d{0,2})?$"
                            placeholder="e.g., 250.00"
                            value={line.unitPrice}
                            disabled={isSaving}
                            onChange={event => updateLine(index, 'unitPrice', sanitizePriceInput(event.target.value))}
                          />
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

              <div className="sales-form-section">
                <div className="sales-remarks-field">
                <div className="sales-remarks-header">
                  <Label htmlFor="sale-remarks">Remarks, optional</Label>
                  <span className="text-xs font-medium text-slate-500">
                    {remarks.length} / {SALES_REMARKS_MAX_LENGTH}
                  </span>
                </div>
                <Textarea
                  id="sale-remarks"
                  placeholder="Example: Daily walk-in sales encoded after checking receipts."
                  maxLength={SALES_REMARKS_MAX_LENGTH}
                  value={remarks}
                  disabled={isSaving}
                  onChange={event => setRemarks(event.target.value)}
                />
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
                    <div className="sales-pos-field">
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
                    <div className="sales-pos-field">
                      <Label>Sold By</Label>
                      <div className="sales-readonly-user">
                        <User />
                        {user?.fullName || user?.username || 'Current user'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sales-form-section sales-checkout-section bg-slate-50/60">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="sales-section-title">Selected Items</h3>
                      <p className="text-xs font-medium text-slate-500">
                        {totalQuantity} unit{totalQuantity === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="sales-action-button border-red-200 text-red-600 hover:border-red-500 hover:bg-red-50 hover:text-red-700"
                      onClick={handleClearSelectedItemsRequest}
                      disabled={isSaving || cartLines.length === 0}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear All
                    </Button>
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
                              {!line.isManual && (
                                <>
                                  <span>&middot;</span>
                                  <span>{remainingStock} left after sale</span>
                                </>
                              )}
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
                                  onChange={event => updateLineQuantity(
                                    index,
                                    sanitizeWholeNumberInput(event.target.value, 'Quantity sold', 'sales-quantity-numbers-only')
                                  )}
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
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  pattern="^\\d*(\\.\\d{0,2})?$"
                                  className="sales-cart-price-input"
                                  value={line.unitPrice}
                                  placeholder="0.00"
                                  disabled={isSaving}
                                  onChange={event => updateLine(index, 'unitPrice', sanitizePriceInput(event.target.value))}
                                  aria-label={`Unit price for ${displayName || 'non-inventory item'}`}
                                />
                              </div>
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
                                  size="icon"
                                  className="sales-action-button h-9 w-9 border-red-200 text-red-600 hover:border-red-500 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => removeLine(index)}
                                  disabled={isSaving}
                                  aria-label={`Remove ${displayName || 'non-inventory item'}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
                      <Wallet className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="sales-section-title">Payment Details</h3>
                    </div>
                  </div>
                  <div className="sales-customer-grid">
                    <div className="space-y-2">
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
                    <div className="space-y-2">
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
                    <div className="space-y-2">
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
                    <div className="space-y-2">
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
                    <div className="space-y-2">
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
                        <div className="space-y-2">
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
                        <div className="space-y-2">
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
                    <div className="space-y-2">
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
                    className="sales-action-button bg-[#FF0000] px-6 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleSaveSaleRequest}
                    disabled={isSaving}
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
        onCancelSale={openCancelSaleDialog}
        canCancelSales={canCancelSales}
      />

      <ConfirmSaveSaleDialog
        open={isSaveConfirmOpen}
        onOpenChange={setIsSaveConfirmOpen}
        onConfirm={confirmSaveSale}
        isSaving={isSaving}
        itemCount={cartLines.length}
        totalQuantity={totalQuantity}
        totalAmount={totalAmount}
        paymentMethod={paymentMethod}
        hasTrackedItems={hasSelectedTrackedItems}
        hasNonInventoryItems={hasSelectedNonInventoryItems}
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
                  onValueChange={value => onDraftChange('category', value)}
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
            <div className="text-center">
              <p className="text-sm font-bold tracking-wide">E.M. CAYETANO TRADING</p>
              <p className="text-xs text-slate-500">{sale?.branch || 'Manggahan Branch'}</p>
              <p className="text-xs text-slate-500">TRANSACTION RECEIPT</p>
            </div>
            <div className="sales-receipt-divider" />
            <div className="space-y-1 text-xs leading-5 text-slate-700">
              <p>Sale No: <strong>{sale?.salesNumber || 'Sales record'}</strong></p>
              <p>Date: {formatDateTime(sale?.createdAt)}</p>
              <p>Cashier: {sale?.soldByName || 'System'}</p>
              <p>Customer: {customerTypeLabels[sale?.customerType] || 'Walk-in Customer'}</p>
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
                <Trash2 className="h-4 w-4" />
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

function ConfirmSaveSaleDialog({
  open,
  onOpenChange,
  onConfirm,
  isSaving,
  itemCount,
  totalQuantity,
  totalAmount,
  paymentMethod,
  hasTrackedItems,
  hasNonInventoryItems
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sales-confirm-clear-dialog border border-slate-200 bg-white p-0 shadow-2xl">
        <div className="sales-confirm-clear-content">
          <DialogHeader className="text-left">
            <div className="sales-confirm-clear-header">
              <span className="sales-confirm-clear-icon">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold leading-tight text-slate-950">
                  Save this sale?
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>
          <DialogDescription className="sales-confirm-clear-message">
            Are you sure you want to save this sale? This will record the transaction, deduct tracked inventory items, and keep non-inventory items in sales records only.
          </DialogDescription>
          <div className="sales-confirm-sale-summary" aria-label="Sale summary">
            <div className="sales-confirm-sale-summary-item">
              <span className="sales-confirm-sale-summary-label">Items</span>
              <span className="sales-confirm-sale-summary-value">
                {itemCount} line{itemCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="sales-confirm-sale-summary-item">
              <span className="sales-confirm-sale-summary-label">Quantity</span>
              <span className="sales-confirm-sale-summary-value">
                {totalQuantity} unit{totalQuantity === 1 ? '' : 's'}
              </span>
            </div>
            <div className="sales-confirm-sale-summary-item">
              <span className="sales-confirm-sale-summary-label">Amount Due</span>
              <span className="sales-confirm-sale-summary-value">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="sales-confirm-sale-summary-item">
              <span className="sales-confirm-sale-summary-label">Payment</span>
              <span className="sales-confirm-sale-summary-value">{paymentMethodLabels[paymentMethod] || 'Cash'}</span>
            </div>
          </div>
          <div className="sales-confirm-clear-info">
            <Info className="h-4 w-4 shrink-0 text-blue-600" />
            <span>
              {hasTrackedItems
                ? `Inventory stock will be updated after you confirm${hasNonInventoryItems ? '; non-inventory items stay sales-only.' : '.'}`
                : 'This sale will be recorded without changing inventory stock.'}
            </span>
          </div>
          <div className="sales-confirm-clear-actions">
            <Button
              type="button"
              variant="outline"
              className="sales-confirm-clear-button sales-confirm-clear-cancel h-10 min-w-[116px] bg-white"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="sales-confirm-clear-button sales-confirm-clear-submit h-10 min-w-[116px] bg-[#FF0000] text-white"
              onClick={onConfirm}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Confirm Sale'}
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
            <div className="sales-confirm-clear-header">
              <span className="sales-cancel-icon">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold leading-tight text-slate-950">
                  Cancel this sale?
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                  This will mark {sale?.salesNumber || 'this sales record'} as cancelled and restore any tracked inventory quantities. This action will be recorded in the audit trail.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <Label htmlFor="sale-cancel-reason">Cancellation Reason</Label>
            <Textarea
              id="sale-cancel-reason"
              value={reason}
              onChange={event => onReasonChange(event.target.value.slice(0, 500))}
              placeholder="Example: Wrong item or quantity was encoded."
              disabled={isSubmitting}
              className="min-h-[92px] resize-none"
            />
            <p className="text-xs leading-5 text-slate-500">
              Use a short but clear reason for manager review and audit checking.
            </p>
          </div>
          <DialogFooter className="mt-5 gap-2 sm:justify-end">
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
              {isSubmitting ? 'Cancelling...' : 'Cancel Sale and Restore Stock'}
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
  onCancelSale,
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
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="sales-history-search">
              <Search className="h-5 w-5 shrink-0 text-slate-500" />
              <Input
                value={searchValue}
                onChange={event => onSearchChange(event.target.value)}
                placeholder="Search by sale number, item, employee, or remarks"
                className="h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
            </div>
            <div className="flex shrink-0 flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-end">
              <Select value={periodValue} onValueChange={onPeriodChange}>
                <SelectTrigger className="sales-history-filter h-10 rounded-lg border-slate-200 bg-white">
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
              <Badge variant="secondary" className="h-10 rounded-lg bg-slate-100 px-4 text-sm text-slate-800">
                <Info className="h-4 w-4 text-blue-600" />
                {sales.length} visible
              </Badge>
              <Badge variant="outline" className="h-10 rounded-lg px-4 text-sm text-slate-800">
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
                            {sale.salesNumber || 'Sales record'}
                          </p>
                          <p className="sales-history-meta mt-2 text-sm leading-5 text-slate-500">
                            <CalendarDays className="h-4 w-4 text-slate-500" />
                            <span className="truncate">{formatDateTime(sale.createdAt)}</span>
                          </p>
                          <p className="sales-history-meta mt-2 truncate text-sm leading-5 text-slate-600">
                            <User className="h-4 w-4 text-slate-500" />
                            <span className="truncate">{customerTypeLabels[sale.customerType] || 'Walk-in Customer'} - {sale.soldByName || 'System'}</span>
                          </p>
                          <p className="sales-history-meta mt-2 text-sm leading-5 text-slate-700">
                            <Tag className="h-4 w-4 text-slate-500" />
                            <span className="line-clamp-2"><strong>Item: </strong>{getSalePrimaryItemText(sale)}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-4 text-right">
                          <div>
                            <p className="text-base font-bold text-slate-900">{formatCurrency(sale.totalAmount)}</p>
                            <p className="mt-1 text-sm text-slate-500">
                              {sale.totalQuantity} item{sale.totalQuantity === 1 ? '' : 's'}
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
                            onCancelSale={onCancelSale}
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
                    onCancelSale={onCancelSale}
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
        <span className="block text-sm font-medium text-slate-500">{label}</span>
        <strong className="mt-1 block truncate text-base text-slate-900">{value}</strong>
      </div>
    </div>
  );
}

function SalesHistoryDetailContent({ sale, onDownloadSummary, onCancelSale, canCancelSales }) {
  const isCancelled = sale.status === 'cancelled';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{sale.salesNumber}</h3>
          <p className="sales-history-meta mt-2 text-sm text-slate-500">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            <span>{formatDateTime(sale.createdAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="sales-transaction-summary-button"
            onClick={() => onDownloadSummary?.(sale)}
          >
            <Download className="h-4 w-4" />
            Receipt
          </Button>
          {canCancelSales && !isCancelled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="sales-cancel-sale-button"
              onClick={() => onCancelSale?.(sale)}
            >
              Cancel Sale
            </Button>
          )}
          <Badge className={`h-9 rounded-full px-4 capitalize ${isCancelled ? 'bg-red-100 text-red-700 hover:bg-red-100' : 'bg-green-100 text-green-700 hover:bg-green-100'}`}>
            {isCancelled ? <X className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            {sale.status || 'completed'}
          </Badge>
        </div>
      </div>

      {isCancelled && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          <strong>Cancelled sale:</strong> Inventory was restored for this transaction.
          {sale.cancelReason ? ` Reason: ${sale.cancelReason}` : ''}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <HistoryDetail icon={<User className="h-5 w-5" />} label="Customer Type" value={customerTypeLabels[sale.customerType] || 'Walk-in Customer'} />
        <HistoryDetail icon={<User className="h-5 w-5" />} label="Sold By" value={sale.soldByName || 'System'} />
        <HistoryDetail icon={<PackageCheck className="h-5 w-5" />} label="Total Quantity" value={`${sale.totalQuantity} item${sale.totalQuantity === 1 ? '' : 's'}`} />
        <HistoryDetail icon={<Coins className="h-5 w-5" />} label="Subtotal" value={formatCurrency(sale.subtotalAmount ?? sale.totalAmount)} />
        <HistoryDetail icon={<Tag className="h-5 w-5" />} label={getDiscountLabel(sale)} value={formatCurrency(sale.discountAmount)} />
        <HistoryDetail icon={<PackageCheck className="h-5 w-5" />} label="Delivery Charge" value={formatCurrency(sale.deliveryCharge)} />
        <HistoryDetail icon={<ReceiptText className="h-5 w-5" />} label="VAT 12%" value={formatCurrency(sale.vatAmount)} />
        <HistoryDetail icon={<Wallet className="h-5 w-5" />} label="Amount Due" value={formatCurrency(sale.totalAmount)} />
        <HistoryDetail icon={<ReceiptText className="h-5 w-5" />} label="Payment Method" value={paymentMethodLabels[sale.paymentMethod] || 'Cash'} />
        <HistoryDetail icon={<Coins className="h-5 w-5" />} label="Amount Received" value={formatCurrency(sale.amountReceived ?? sale.totalAmount)} />
        <HistoryDetail icon={<Coins className="h-5 w-5" />} label="Change" value={formatCurrency(sale.changeAmount)} />
        {sale.paymentReference && (
          <HistoryDetail icon={<ClipboardList className="h-5 w-5" />} label="Payment Reference" value={sale.paymentReference} />
        )}
        {requiresPaymentConfirmation(sale.paymentMethod) && (
          <HistoryDetail icon={<CheckCircle className="h-5 w-5" />} label="Payment Confirmation" value={sale.paymentConfirmedBy ? `Confirmed by ${sale.paymentConfirmedBy}` : 'Confirmed'} />
        )}
      </div>

      <div className="pb-2 pt-2">
        <div className="mb-2 flex items-center justify-between gap-3 py-1">
          <h4 className="text-base font-semibold text-slate-900">Sold Items</h4>
          <span className="text-sm text-slate-500">{sale.items?.length || 0} line{sale.items?.length === 1 ? '' : 's'}</span>
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
                </div>
                <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                  Category: {item.category || 'Uncategorized'}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Unit Price: {formatCurrency(item.unitPrice)}</p>
              </div>
              <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                <span className="inline-flex h-8 items-center rounded-full bg-white px-3 text-xs font-semibold text-slate-700">
                  Qty Sold: {item.quantitySold}
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-end gap-6 rounded-lg bg-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-500">Items Subtotal</span>
            <strong className="whitespace-nowrap text-slate-900">{formatCurrency(sale.subtotalAmount ?? sale.totalAmount)}</strong>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <MessageSquareText className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Remarks</span>
          <p className="mt-1 text-sm leading-6 text-slate-700">{sale.remarks || 'No remarks recorded.'}</p>
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
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <strong className="block truncate text-sm text-slate-900">{value}</strong>
      </div>
    </div>
  );
}
