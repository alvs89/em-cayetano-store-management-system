import React, { useMemo, useState } from 'react';
import { Plus, ReceiptText, Trash2, ShoppingCart, History, CheckCircle, Info, PackageCheck, AlertTriangle, TrendingUp, User, Coins, ClipboardList, Search, CalendarDays, Tag, Wallet, MessageSquareText, X, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from './PageHeader';
import { useData } from './DataContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

const emptySaleLine = () => ({
  inventoryId: '',
  quantity: '',
  unitPrice: ''
});

const SALES_REMARKS_MAX_LENGTH = 500;

const customerTypeLabels = {
  walk_in: 'Walk-in Customer',
  regular: 'Regular Customer',
  contractor: 'Contractor / Project Buyer'
};

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

const sanitizePriceInput = value => {
  const rawValue = String(value || '');
  if (/[^0-9.]/.test(rawValue) || (rawValue.match(/\./g) || []).length > 1) {
    notifyNumbersOnly('Unit price', 'sales-unit-price-numbers-only');
  }
  const cleaned = String(value || '').replace(/[^\d.]/g, '');
  const [whole = '', ...decimalParts] = cleaned.split('.');
  const decimals = decimalParts.join('').slice(0, 2);
  return decimalParts.length > 0 ? `${whole}.${decimals}` : whole;
};

export function SalesModule({ user }) {
  const { inventory, salesTransactions, recordSale } = useData();
  const [customerType, setCustomerType] = useState('walk_in');
  const [remarks, setRemarks] = useState('');
  const [saleLines, setSaleLines] = useState([emptySaleLine()]);
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedHistorySaleId, setSelectedHistorySaleId] = useState('');

  const activeInventory = useMemo(
    () => inventory
      .filter(item => Number(item.quantity || 0) > 0)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      })),
    [inventory]
  );

  const selectedLineDetails = saleLines.map(line => {
    const item = inventory.find(product => String(product.id) === String(line.inventoryId));
    const quantity = line.quantity === '' ? 0 : Number(line.quantity);
    const unitPrice = line.unitPrice === '' ? 0 : Number(line.unitPrice);
    return {
      ...line,
      item,
      quantity,
      unitPrice,
      subtotal: Number.isFinite(quantity) && Number.isFinite(unitPrice)
        ? quantity * unitPrice
        : 0
    };
  });

  const totalQuantity = selectedLineDetails.reduce((sum, line) => sum + (Number.isFinite(line.quantity) ? line.quantity : 0), 0);
  const totalAmount = selectedLineDetails.reduce((sum, line) => sum + (Number.isFinite(line.subtotal) ? line.subtotal : 0), 0);
  const sortedSales = useMemo(
    () => [...(salesTransactions || [])]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [salesTransactions]
  );

  const recentSales = sortedSales.slice(0, 5);
  const hasSalesFormInput = useMemo(() => (
    customerType !== 'walk_in' ||
    remarks.trim() !== '' ||
    saleLines.some(line => (
      String(line.inventoryId || '').trim() !== '' ||
      String(line.quantity || '').trim() !== '' ||
      String(line.unitPrice || '').trim() !== ''
    ))
  ), [customerType, remarks, saleLines]);

  const filteredSalesHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return sortedSales;

    return sortedSales.filter(sale => {
      const searchableText = [
        sale.salesNumber,
        customerTypeLabels[sale.customerType],
        sale.soldByName,
        sale.remarks,
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
  }, [historySearch, sortedSales]);

  const selectedHistorySale = useMemo(() => {
    if (!selectedHistorySaleId) return null;
    return filteredSalesHistory.find(sale => sale.id === selectedHistorySaleId) || null;
  }, [filteredSalesHistory, selectedHistorySaleId]);

  const updateLine = (index, key, value) => {
    setSaleLines(prev => prev.map((line, lineIndex) => (
      lineIndex === index ? { ...line, [key]: value } : line
    )));
  };

  const updateLineInventoryItem = (index, inventoryId) => {
    const selectedItem = activeInventory.find(item => String(item.id) === String(inventoryId));
    const defaultPrice = Number(selectedItem?.defaultSellingPrice || 0);

    setSaleLines(prev => prev.map((line, lineIndex) => (
      lineIndex === index
        ? {
            ...line,
            inventoryId,
            unitPrice: defaultPrice > 0 ? defaultPrice.toFixed(2) : ''
          }
        : line
    )));
  };

  const addLine = () => {
    setSaleLines(prev => [...prev, emptySaleLine()]);
  };

  const removeLine = index => {
    setSaleLines(prev => {
      if (prev.length === 1) {
        toast.info('At least one sold item must remain in the sale form.');
        return prev;
      }
      return prev.filter((_, lineIndex) => lineIndex !== index);
    });
  };

  const resetForm = () => {
    setCustomerType('walk_in');
    setRemarks('');
    setSaleLines([emptySaleLine()]);
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

  const validateSale = () => {
    const usedItems = new Set();

    for (let index = 0; index < selectedLineDetails.length; index += 1) {
      const line = selectedLineDetails[index];
      const lineLabel = `Line ${index + 1}`;

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

    return true;
  };

  const handleRecordSale = async () => {
    if (!validateSale()) return;

    setIsSaving(true);
    try {
      const sale = await recordSale({
        customerType,
        remarks,
        items: selectedLineDetails.map(line => ({
          inventoryId: line.inventoryId,
          quantity: line.quantity,
          unitPrice: line.unitPrice
        }))
      });
      toast.success('Sale recorded successfully.', {
        description: `${sale?.salesNumber || sale?.sales_number || 'Sales record'} saved and inventory was updated.`
      });
      resetForm();
    } catch (err) {
      toast.error('Failed to record sale', {
        description: err?.response?.data?.error || err.message || 'No inventory was deducted.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .sales-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.75fr) minmax(360px, 0.95fr);
          gap: 1.75rem;
          align-items: start;
        }

        .sales-page {
          margin-top: -0.25rem;
        }

        .sales-side-panel {
          display: grid;
          gap: 1.75rem;
        }

        .sales-guidance-list {
          padding-top: 1.25rem;
          padding-bottom: 1.25rem;
        }

        .sales-record-card {
          border-color: #e2e8f0;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
        }

        .sales-record-header {
          padding: 1.4rem 1.4rem 1.05rem;
        }

        .sales-record-content {
          display: grid;
          gap: 1rem;
          padding: 0 1.4rem 1.4rem;
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
          margin-bottom: 1rem;
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

        .sales-section-description {
          margin-top: 0.15rem;
          font-size: 0.8125rem;
          line-height: 1.45;
          color: #64748b;
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

        .sales-readonly-user svg {
          width: 1rem;
          height: 1rem;
          color: #64748b;
        }

        .sales-line-card {
          border-radius: 0.9rem;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 1rem;
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

        .sales-recent-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .sales-recent-heading {
          min-width: 0;
          flex: 1 1 auto;
        }

        .sales-line-fields {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(180px, 0.7fr) minmax(180px, 0.75fr);
          gap: 1rem;
        }

        .sales-line-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .sales-stock-preview {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.85rem;
          background: #ffffff;
          padding: 0.75rem;
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
          padding: 0.8rem 0.9rem;
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
          font-size: 0.75rem;
          line-height: 1.1rem;
          font-weight: 600;
        }

        .sales-stock-preview-value {
          display: block;
          margin-top: 0.15rem;
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

        .sales-confirm-clear-button {
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .sales-confirm-clear-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.65rem;
          margin-top: 1.25rem;
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

        @media (max-width: 1100px) {
          .sales-grid {
            grid-template-columns: 1fr;
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

        @media (max-width: 760px) {
          .sales-page {
            padding: 10px;
            margin-top: 0;
          }

          .sales-line-fields {
            grid-template-columns: 1fr;
          }

          .sales-customer-grid,
          .sales-summary-grid {
            grid-template-columns: 1fr;
          }

          .sales-stock-preview {
            grid-template-columns: 1fr;
          }

          .sales-stock-preview-item + .sales-stock-preview-item {
            border-left: 0;
            border-top: 0;
          }

          .sales-recent-header {
            flex-direction: column;
            align-items: stretch;
            gap: 0.85rem;
          }

          .sales-recent-header .sales-view-all-button {
            width: fit-content;
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

          .sales-confirm-clear-actions button {
            width: 100%;
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
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm leading-6 text-slate-700">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <p>
            This module is only for customer purchases. For damaged, expired, lost, or correction-related deductions, use Stock Out instead.
          </p>
        </div>

        <div className="sales-grid">
          <Card className="sales-record-card overflow-hidden bg-white">
            <CardHeader className="sales-record-header">
              <CardTitle className="flex items-center gap-2 text-xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <ShoppingCart className="h-5 w-5" />
                </span>
                Record Sale
              </CardTitle>
              <CardDescription>
                Select the sold items, enter the quantity and selling price, then save to deduct inventory.
              </CardDescription>
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
                        <SelectItem value="regular">Regular Customer</SelectItem>
                        <SelectItem value="contractor">Contractor / Project Buyer</SelectItem>
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
                <div className="sales-section-heading">
                  <span className="sales-section-icon sales-section-icon-accent">
                    <PackageCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="sales-section-title">Sold Items</h3>
                    <p className="sales-section-description">Add each product sold in this transaction.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {saleLines.map((line, index) => {
                    const selectedItem = inventory.find(item => String(item.id) === String(line.inventoryId));
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
                        <div className="space-y-2">
                          <Label>Inventory Item <span className="text-red-600">*</span></Label>
                          <Select
                            value={line.inventoryId}
                            onValueChange={value => updateLineInventoryItem(index, value)}
                            disabled={isSaving}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select sold item" />
                            </SelectTrigger>
                            <SelectContent>
                              {activeInventory.map(item => (
                                <SelectItem
                                  key={item.id}
                                  value={item.id}
                                  disabled={usedByOtherLine.has(item.id)}
                                >
                                  {item.itemCode ? `${item.itemCode} - ` : ''}{item.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs leading-5 text-slate-500">
                            Choose the product sold to the customer. Each item can be selected once per sale.
                          </p>
                        </div>
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
                            onChange={event => updateLine(
                              index,
                              'quantity',
                              sanitizeWholeNumberInput(event.target.value, 'Quantity sold', 'sales-quantity-numbers-only')
                            )}
                          />
                          <p className="text-xs leading-5 text-slate-500">
                            Enter whole units only. The quantity cannot exceed current stock.
                          </p>
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
                          <p className="text-xs leading-5 text-slate-500">
                            {selectedItem?.defaultSellingPrice
                              ? 'Auto-filled from the item default price. Update only if the actual selling price is different.'
                              : 'Enter the actual selling price used for this sale.'}
                          </p>
                        </div>
                      </div>

                      <div className="sales-stock-preview mt-4 text-sm">
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
                            <strong className="sales-stock-preview-value">{selectedItem ? `${selectedItem.activeLowStockThreshold} unit${Number(selectedItem.activeLowStockThreshold) === 1 ? '' : 's'}` : 'Select item'}</strong>
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
                      </div>
                      </div>
                    );
                  })}

                <div className="flex justify-end border-t border-slate-100 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="sales-action-button border-green-200 text-green-700 hover:border-green-500 hover:bg-green-50 hover:text-green-800"
                    onClick={addLine}
                    disabled={isSaving}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Another Item
                  </Button>
                </div>
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
                <p className="text-xs leading-5 text-slate-500">
                  Use this for short notes only, such as receipt checking, delivery request, or bulk purchase details.
                </p>
                </div>
              </div>

              <div className="sales-form-section bg-slate-50/60">
                <h3 className="mb-3 text-base font-semibold text-slate-900">Transaction Summary</h3>
                <div className="sales-summary-grid">
                  <SummaryBlock icon={<User className="h-5 w-5" />} label="Customer Type" value={customerTypeLabels[customerType]} tone="blue" />
                  <SummaryBlock icon={<PackageCheck className="h-5 w-5" />} label="Total Quantity" value={`${totalQuantity} unit${totalQuantity === 1 ? '' : 's'}`} tone="green" />
                  <SummaryBlock icon={<Coins className="h-5 w-5" />} label="Recorded Amount" value={formatCurrency(totalAmount)} tone="amber" />
                </div>
              </div>

              <div className="sales-form-actions">
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
                  onClick={handleRecordSale}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving Sale...' : 'Save Sale and Deduct Stock'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="sales-side-panel">
            <Card className="gap-0 overflow-hidden border-orange-200 bg-white shadow-sm">
              <CardHeader className="bg-orange-50 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                    <CheckCircle className="h-5 w-5" />
                  </span>
                  What happens after saving?
                </CardTitle>
                <CardDescription>Sales are connected directly to inventory.</CardDescription>
              </CardHeader>
              <CardContent className="sales-guidance-list space-y-3 text-sm leading-6 text-slate-700">
                {[
                  'Sales are saved and inventory is deducted.',
                  'Sold quantities are recorded as Stock Out (Sales).',
                  'Item status and stock levels are updated.',
                  'An audit log entry is created for this transaction.'
                ].map(message => (
                  <div key={message} className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                    <span>{message}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="gap-0 overflow-hidden border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <div className="sales-recent-header">
                  <div className="sales-recent-heading">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <History className="h-5 w-5" />
                      </span>
                      Recent Sales
                    </CardTitle>
                    <CardDescription className="mt-1">Latest official sales records for this branch.</CardDescription>
                  </div>
                  {sortedSales.length > 0 && (
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
                      View All Sales
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {recentSales.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                    No sales have been recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentSales.map(sale => (
                      <article key={sale.id} className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-700">
                              <User className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{customerTypeLabels[sale.customerType] || 'Walk-in Customer'}</p>
                              <p className="text-xs text-slate-500">{formatDateTime(sale.createdAt)}</p>
                              <p className="mt-0.5 truncate text-xs text-slate-600">{sale.soldByName || 'System'} - {sale.salesNumber}</p>
                              {sale.items?.length > 0 && (
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                                  <strong>Item: </strong> {sale.items
                                    .slice(0, 2)
                                    .map(item => `${item.itemName} (${item.quantitySold})`)
                                    .join(', ')}
                                  {sale.items.length > 2 ? `, +${sale.items.length - 2} more` : ''}
                                </p>
                              )}
                              {sale.remarks && (
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                                  <strong>Remarks:</strong> {sale.remarks}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-3 text-right">
                            <div>
                              <p className="text-sm font-bold text-slate-900">{formatCurrency(sale.totalAmount)}</p>
                              <p className="text-xs text-slate-500">{sale.totalQuantity} item{sale.totalQuantity === 1 ? '' : 's'}</p>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                      <ClipboardList className="h-4 w-4" />
                      Showing latest {recentSales.length} sale{recentSales.length === 1 ? '' : 's'}.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <SalesHistoryDialog
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        sales={filteredSalesHistory}
        totalSalesCount={sortedSales.length}
        searchValue={historySearch}
        onSearchChange={value => {
          setHistorySearch(value);
          setSelectedHistorySaleId('');
        }}
        selectedSale={selectedHistorySale}
        onSelectSale={saleId => setSelectedHistorySaleId(currentSaleId => currentSaleId === saleId ? '' : saleId)}
      />

      <ClearSalesFormDialog
        open={isClearConfirmOpen}
        onOpenChange={setIsClearConfirmOpen}
        onConfirm={confirmClearForm}
      />
    </div>
  );
}

function ClearSalesFormDialog({ open, onOpenChange, onConfirm }) {
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
                  Clear sales form?
                </DialogTitle>
              </div>
            </div>
          </DialogHeader>
          <DialogDescription className="sales-confirm-clear-message">
            The details you entered will be removed.
            <br />
            This will not affect saved sales records or inventory.
          </DialogDescription>
          <div className="sales-confirm-clear-info">
            <Info className="h-4 w-4 shrink-0 text-blue-600" />
            <span>
              Continue only if you want to start a new sales entry.
            </span>
          </div>
          <div className="sales-confirm-clear-actions">
            <Button
              type="button"
              variant="outline"
              className="sales-confirm-clear-button sales-confirm-clear-cancel h-10 min-w-[116px] bg-white"
              onClick={() => onOpenChange(false)}
            >
              Keep Editing
            </Button>
            <Button
              type="button"
              className="sales-confirm-clear-button sales-confirm-clear-submit h-10 min-w-[116px] bg-[#FF0000] text-white"
              onClick={onConfirm}
            >
              Clear Form
            </Button>
          </div>
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
  onSearchChange,
  selectedSale,
  onSelectSale
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
                  Review sales records that automatically deducted inventory for this branch.
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
            <div className="flex shrink-0 items-center justify-between gap-2 text-sm text-slate-600 sm:justify-end">
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
                          <SalesHistoryDetailContent sale={sale} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="sales-history-detail rounded-xl border border-slate-200 bg-white p-5">
                {selectedSale ? (
                  <SalesHistoryDetailContent sale={selectedSale} />
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

function SalesHistoryDetailContent({ sale }) {
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
        <Badge className="h-9 rounded-full bg-green-100 px-4 capitalize text-green-700 hover:bg-green-100">
          <CheckCircle className="h-4 w-4" />
          {sale.status || 'completed'}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <HistoryDetail icon={<User className="h-5 w-5" />} label="Customer Type" value={customerTypeLabels[sale.customerType] || 'Walk-in Customer'} />
        <HistoryDetail icon={<User className="h-5 w-5" />} label="Sold By" value={sale.soldByName || 'System'} />
        <HistoryDetail icon={<PackageCheck className="h-5 w-5" />} label="Total Quantity" value={`${sale.totalQuantity} item${sale.totalQuantity === 1 ? '' : 's'}`} />
        <HistoryDetail icon={<Wallet className="h-5 w-5" />} label="Total Amount" value={formatCurrency(sale.totalAmount)} />
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
                <p className="break-words font-semibold leading-5 text-slate-900">{item.itemName}</p>
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
            <strong className="whitespace-nowrap text-slate-900">{formatCurrency(sale.totalAmount)}</strong>
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
