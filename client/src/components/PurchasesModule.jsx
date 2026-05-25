import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, FileText, PackagePlus, Plus, Minus, ReceiptText, RefreshCw, Search, Trash2, Truck, Wallet, X, History } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from './PageHeader';
import { useData } from './DataContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { mergeSort } from '../utils/algorithms';

const emptyPurchaseLine = () => ({
  inventoryId: '',
  quantity: '',
  unitCost: ''
});

const DOCUMENT_TYPES = ['DR', 'SI', 'OR', 'OTHER'];
const PAYMENT_TERMS = [
  { value: 'cash', label: 'Cash' },
  { value: 'cod', label: 'COD' },
  { value: 'credit', label: 'Credit' },
  { value: 'branch_transfer', label: 'Branch Transfer' }
];
const INVENTORY_PAGE_SIZE = 50;
const INVENTORY_SORT_OPTIONS = [
  { value: 'name_az', label: 'Name A-Z' },
  { value: 'name_za', label: 'Name Z-A' },
  { value: 'code_az', label: 'Code A-Z' },
  { value: 'code_za', label: 'Code Z-A' },
  { value: 'stock_low', label: 'Stock Low-High' },
  { value: 'stock_high', label: 'Stock High-Low' },
  { value: 'category_az', label: 'Category A-Z' },
  { value: 'category_za', label: 'Category Z-A' }
];

const formatCurrency = value =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(Number(value || 0));

const formatDateTime = value => {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
};

const notifyPurchaseValidation = (message, id) => {
  toast.warning(message, { id, duration: 2500 });
};

const sanitizeWholeNumberInput = (value, fieldName = 'Quantity', toastId = 'purchase-whole-number') => {
  const rawValue = String(value ?? '');
  if (rawValue === '') return '';
  if (rawValue.includes('-')) {
    notifyPurchaseValidation(`${fieldName} cannot be negative.`, `${toastId}-negative`);
  }
  if (/[^\d-]/.test(rawValue)) {
    notifyPurchaseValidation(`${fieldName} accepts whole numbers only.`, `${toastId}-numbers`);
  }
  const cleaned = rawValue.replace(/\D/g, '');
  if (cleaned === '0') {
    notifyPurchaseValidation(`${fieldName} must be at least 1.`, `${toastId}-zero`);
    return '';
  }
  return cleaned.replace(/^0+(?=\d)/, '');
};

const sanitizeDecimalInput = (value, fieldName = 'Unit cost', toastId = 'purchase-decimal') => {
  const rawValue = String(value ?? '');
  if (rawValue === '') return '';
  if (rawValue.includes('-')) {
    notifyPurchaseValidation(`${fieldName} cannot be negative.`, `${toastId}-negative`);
  }
  if (/[^0-9.-]/.test(rawValue)) {
    notifyPurchaseValidation(`${fieldName} accepts numbers only.`, `${toastId}-numbers`);
  }
  const dotCount = (rawValue.match(/\./g) || []).length;
  if (dotCount > 1) {
    notifyPurchaseValidation(`${fieldName} can only have one decimal point.`, `${toastId}-decimal-point`);
  }
  const cleaned = rawValue.replace(/[^\d.]/g, '');
  const firstDotIndex = cleaned.indexOf('.');
  const hasDecimalPoint = firstDotIndex >= 0;
  const whole = hasDecimalPoint ? cleaned.slice(0, firstDotIndex) : cleaned;
  const decimalText = hasDecimalPoint ? cleaned.slice(firstDotIndex + 1).replace(/\./g, '') : '';
  if (decimalText.length > 2) {
    notifyPurchaseValidation(`${fieldName} allows up to 2 decimals.`, `${toastId}-decimal-places`);
  }
  const decimals = decimalText.slice(0, 2);
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  if (hasDecimalPoint) {
    return `${normalizedWhole || '0'}.${decimals}`;
  }
  return normalizedWhole;
};

const getPurchaseItems = purchase => {
  if (Array.isArray(purchase?.items)) return purchase.items;
  if (typeof purchase?.items === 'string') {
    try {
      const parsedItems = JSON.parse(purchase.items);
      return Array.isArray(parsedItems) ? parsedItems : [];
    } catch {
      return [];
    }
  }
  return [];
};

const getPurchaseLineCount = purchase =>
  Number(purchase?.itemCount ?? getPurchaseItems(purchase).length ?? 0);

const getPurchaseQuantity = purchase =>
  Number(purchase?.totalQuantity ?? purchase?.quantityAdded ?? getPurchaseItems(purchase).reduce((sum, item) => sum + Number(item.quantity || 0), 0));

export function PurchasesModule({ user }) {
  const { inventory, purchaseTransactions, recordPurchase } = useData();
  const [supplierName, setSupplierName] = useState('');
  const [documentType, setDocumentType] = useState('DR');
  const [documentNumber, setDocumentNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('cash');
  const [remarks, setRemarks] = useState('');
  const [purchaseLines, setPurchaseLines] = useState([emptyPurchaseLine()]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('all');
  const [inventorySort, setInventorySort] = useState('name_az');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isPurchaseHistoryOpen, setIsPurchaseHistoryOpen] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [purchaseHistorySearch, setPurchaseHistorySearch] = useState('');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');
  const [highlightedLineIndex, setHighlightedLineIndex] = useState(null);
  const purchaseLinesScrollRef = useRef(null);
  const purchaseLineRefs = useRef({});
  const purchaseLineSelectRefs = useRef({});

  const sortedInventory = useMemo(
    () => mergeSort([...inventory], (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' })),
    [inventory]
  );

  const inventoryCategories = useMemo(
    () => ['all', ...mergeSort(
      Array.from(new Set(inventory.map(item => item.category || 'Uncategorized'))),
      (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
    )],
    [inventory]
  );

  const filteredInventory = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filteredItems = sortedInventory.filter(item => {
      const itemCategory = item.category || 'Uncategorized';
      const matchesCategory = inventoryCategoryFilter === 'all' || itemCategory === inventoryCategoryFilter;
      if (!matchesCategory) return false;
      if (!query) return true;
      return [
          item.itemCode,
          item.name,
          item.category,
          item.supplierName
        ].filter(Boolean).join(' ').toLowerCase().includes(query);
    });

    const sorters = {
      name_az: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }),
      name_za: (a, b) => String(b.name || '').localeCompare(String(a.name || ''), undefined, { numeric: true, sensitivity: 'base' }),
      code_az: (a, b) => String(a.itemCode || '').localeCompare(String(b.itemCode || ''), undefined, { numeric: true, sensitivity: 'base' }),
      code_za: (a, b) => String(b.itemCode || '').localeCompare(String(a.itemCode || ''), undefined, { numeric: true, sensitivity: 'base' }),
      stock_low: (a, b) => Number(a.quantity || 0) - Number(b.quantity || 0),
      stock_high: (a, b) => Number(b.quantity || 0) - Number(a.quantity || 0),
      category_az: (a, b) => String(a.category || '').localeCompare(String(b.category || ''), undefined, { numeric: true, sensitivity: 'base' })
        || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }),
      category_za: (a, b) => String(b.category || '').localeCompare(String(a.category || ''), undefined, { numeric: true, sensitivity: 'base' })
        || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' })
    };

    return mergeSort(filteredItems, sorters[inventorySort] || sorters.name_az);
  }, [inventoryCategoryFilter, inventorySort, searchQuery, sortedInventory]);

  const inventoryPageCount = Math.max(1, Math.ceil(filteredInventory.length / INVENTORY_PAGE_SIZE));
  const activeInventoryPage = Math.min(inventoryPage, inventoryPageCount);
  const inventoryPageStart = (activeInventoryPage - 1) * INVENTORY_PAGE_SIZE;
  const paginatedInventory = filteredInventory.slice(inventoryPageStart, inventoryPageStart + INVENTORY_PAGE_SIZE);
  const inventoryShowingStart = filteredInventory.length === 0 ? 0 : inventoryPageStart + 1;
  const inventoryShowingEnd = Math.min(inventoryPageStart + INVENTORY_PAGE_SIZE, filteredInventory.length);

  useEffect(() => {
    setInventoryPage(1);
  }, [inventoryCategoryFilter, inventorySort, searchQuery]);

  useEffect(() => {
    if (inventoryPage > inventoryPageCount) {
      setInventoryPage(inventoryPageCount);
    }
  }, [inventoryPage, inventoryPageCount]);

  useEffect(() => {
    if (highlightedLineIndex === null) return undefined;

    const timeoutId = window.setTimeout(() => setHighlightedLineIndex(null), 1800);
    let secondFrameId;

    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
      const row = purchaseLineRefs.current[highlightedLineIndex];
      const select = purchaseLineSelectRefs.current[highlightedLineIndex];
      const scrollContainer = purchaseLinesScrollRef.current;

      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth'
        });
      } else if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }

      window.setTimeout(() => {
        select?.focus?.({ preventScroll: true });
      }, 180);
      });
    });

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId) window.cancelAnimationFrame(secondFrameId);
    };
  }, [highlightedLineIndex, purchaseLines.length]);

  const getInventoryById = inventoryId =>
    inventory.find(item => String(item.id) === String(inventoryId));

  const lineDetails = purchaseLines.map(line => {
    const item = getInventoryById(line.inventoryId);
    const quantity = line.quantity === '' ? 0 : Number(line.quantity);
    const unitCost = line.unitCost === '' ? 0 : Number(line.unitCost);
    return {
      ...line,
      item,
      quantityInput: line.quantity,
      unitCostInput: line.unitCost,
      quantity,
      unitCost,
      subtotal: Number.isFinite(quantity) && Number.isFinite(unitCost) ? quantity * unitCost : 0
    };
  });

  const selectedLines = lineDetails.filter(line => line.inventoryId && line.item);
  const totalQuantity = lineDetails.reduce((sum, line) => sum + (Number.isFinite(line.quantity) ? line.quantity : 0), 0);
  const subtotalAmount = lineDetails.reduce((sum, line) => sum + (Number.isFinite(line.subtotal) ? line.subtotal : 0), 0);

  const updateLine = (index, key, value) => {
    setPurchaseLines(prev => prev.map((line, lineIndex) => (
      lineIndex === index ? { ...line, [key]: value } : line
    )));
  };

  const updateLineQuantity = (index, rawValue) => {
    updateLine(index, 'quantity', sanitizeWholeNumberInput(
      rawValue,
      'Quantity received',
      `purchase-line-${index + 1}-quantity`
    ));
  };

  const updateLineUnitCost = (index, rawValue) => {
    updateLine(index, 'unitCost', sanitizeDecimalInput(
      rawValue,
      'Unit cost',
      `purchase-line-${index + 1}-unit-cost`
    ));
  };

  const validateLineQuantityOnBlur = (index, value) => {
    if (value === '') return;
    if (Number(value) <= 0) {
      notifyPurchaseValidation('Quantity must be at least 1.', `purchase-line-${index + 1}-quantity-blur`);
      updateLine(index, 'quantity', '');
    }
  };

  const validateLineUnitCostOnBlur = (index, value) => {
    if (value === '') return;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      notifyPurchaseValidation('Unit cost must be greater than 0.', `purchase-line-${index + 1}-unit-cost-blur`);
      updateLine(index, 'unitCost', '');
      return;
    }
    updateLine(index, 'unitCost', numericValue.toFixed(2));
  };

  const adjustLineNumber = (index, key, change, options = {}) => {
    const {
      min = 0,
      decimals = 0
    } = options;

    setPurchaseLines(prev => prev.map((line, lineIndex) => {
      if (lineIndex !== index) return line;

      const currentValue = Number(line[key] || 0);
      const nextValue = Math.max(min, (Number.isFinite(currentValue) ? currentValue : 0) + change);
      return {
        ...line,
        [key]: decimals > 0 ? nextValue.toFixed(decimals) : String(Math.round(nextValue))
      };
    }));
  };

  const addLine = () => {
    setPurchaseLines(prev => {
      const nextIndex = prev.length;
      setHighlightedLineIndex(nextIndex);
      return [...prev, emptyPurchaseLine()];
    });
    toast.success('Blank line added. Please complete the item details.');
  };

  const removeLine = index => {
    setPurchaseLines(prev => prev.length === 1 ? [emptyPurchaseLine()] : prev.filter((_, lineIndex) => lineIndex !== index));
  };

  const addInventoryItemToPurchase = item => {
    if (!item || isSaving) return;
    const preparedLine = {
      inventoryId: String(item.id),
      quantity: '1',
      unitCost: ''
    };

    setPurchaseLines(prev => {
      const existingIndex = prev.findIndex(line => String(line.inventoryId) === String(item.id));
      if (existingIndex >= 0) {
        return prev.map((line, lineIndex) => lineIndex === existingIndex
          ? { ...line, quantity: String(Number(line.quantity || 0) + 1) }
          : line);
      }

      const emptyIndex = prev.findIndex(line => !line.inventoryId && !line.quantity && !line.unitCost);
      if (emptyIndex >= 0) {
        return prev.map((line, lineIndex) => lineIndex === emptyIndex ? preparedLine : line);
      }
      return [...prev, preparedLine];
    });
  };

  const resetForm = () => {
    setSupplierName('');
    setDocumentType('DR');
    setDocumentNumber('');
    setPaymentTerms('cash');
    setRemarks('');
    setPurchaseLines([emptyPurchaseLine()]);
    setSearchQuery('');
    setInventoryCategoryFilter('all');
    setInventorySort('name_az');
    setInventoryPage(1);
  };

  const handleConfirmClear = () => {
    resetForm();
    setIsClearDialogOpen(false);
    toast.success('Purchase draft cleared.');
  };

  const validatePurchase = () => {
    if (!supplierName.trim()) {
      toast.error('Enter the supplier name.');
      return false;
    }

    if (selectedLines.length === 0) {
      toast.error('Add at least one item to the purchase.');
      return false;
    }

    const usedItems = new Set();
    for (let index = 0; index < lineDetails.length; index += 1) {
      const line = lineDetails[index];
      if (!line.inventoryId && !line.quantity && !line.unitCost) continue;
      const label = line.item?.name || `Line ${index + 1}`;

      if (!line.inventoryId || !line.item) {
        toast.error(`${label}: select an inventory item.`);
        return false;
      }

      if (usedItems.has(line.inventoryId)) {
        toast.error(`${line.item.name} is already selected. Use one purchase line per item.`);
        return false;
      }
      usedItems.add(line.inventoryId);

      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        toast.error(`${line.item.name}: quantity must be at least 1.`);
        return false;
      }

      if (!Number.isFinite(line.unitCost) || line.unitCost <= 0) {
        toast.error(`${line.item.name}: enter a valid unit cost.`);
        return false;
      }
    }

    return true;
  };

  const handleRecordPurchase = async () => {
    if (!validatePurchase()) return;
    setIsSaving(true);
    try {
      const purchase = await recordPurchase({
        supplierName: supplierName.trim(),
        documentType,
        documentNumber: documentNumber.trim(),
        paymentTerms,
        remarks: remarks.trim(),
        items: selectedLines.map(line => ({
          inventoryId: line.inventoryId,
          quantity: line.quantity,
          unitCost: line.unitCost
        }))
      });
      toast.success('Purchase saved and inventory added.', {
        description: `${purchase.purchaseNumber || 'Purchase entry'} was recorded.`
      });
      resetForm();
    } catch (err) {
      toast.error('Failed to save purchase', {
        description: err?.response?.data?.error || err.message || 'No inventory was added.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const sortedPurchases = useMemo(
    () => [...(purchaseTransactions || [])]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [purchaseTransactions]
  );

  const filteredPurchaseHistory = useMemo(() => {
    const query = purchaseHistorySearch.trim().toLowerCase();
    if (!query) return sortedPurchases;
    return sortedPurchases.filter(purchase => [
      purchase.purchaseNumber,
      purchase.supplierName,
      purchase.documentType,
      purchase.documentNumber,
      purchase.paymentTerms,
      ...getPurchaseItems(purchase).map(item => item.itemName || item.name)
    ].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [purchaseHistorySearch, sortedPurchases]);

  const selectedPurchase = filteredPurchaseHistory.find(purchase => String(purchase.id) === String(selectedPurchaseId))
    || filteredPurchaseHistory[0]
    || null;

  return (
    <div className="purchase-screen bg-slate-50 p-4 md:p-6">
      <style>{`
        .purchase-screen {
          min-height: 100vh;
        }

        .purchase-screen > .mb-8 {
          margin-bottom: 1.25rem;
        }

        .purchase-page {
          display: grid;
          gap: 1rem;
          max-width: 1500px;
          margin: 0 auto;
        }

        .purchase-history-button {
          background: #ffffff;
          border-color: #bfdbfe;
          color: #1d4ed8;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .purchase-history-button:hover,
        .purchase-history-button:focus-visible,
        .purchase-history-button:active {
          background: #eff6ff;
          border-color: #60a5fa;
          color: #1e40af;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
        }

        .purchase-card {
          min-width: 0;
          gap: 0 !important;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .purchase-card-header {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          border-bottom: 1px solid #f1f5f9;
          padding: 0.75rem 1rem 0.65rem;
        }

        .purchase-card-content {
          padding: 0.7rem 1rem 1rem;
        }

        .purchase-title {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.98rem;
          font-weight: 800;
          color: #111827;
        }

        .purchase-kicker {
          border-radius: 999px;
          background: #fee2e2;
          color: #b91c1c;
          padding: 0.22rem 0.55rem;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .purchase-header-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.65rem;
          flex-wrap: wrap;
        }

        .purchase-field {
          display: grid;
          gap: 0.55rem;
          min-width: 0;
        }

        .purchase-field-label {
          line-height: 1.25rem;
        }

        .purchase-doc-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem 0.9rem;
          align-items: end;
        }

        .purchase-doc-wide {
          grid-column: 1 / -1;
        }

        .purchase-remarks {
          height: 8rem !important;
          min-height: 8rem !important;
          max-height: 12rem !important;
          resize: none !important;
          overflow-y: auto;
          line-height: 1.45rem;
          padding-top: 0.85rem;
          padding-bottom: 0.85rem;
        }

        .purchase-details-layout {
          display: grid;
          grid-template-columns: minmax(380px, 0.74fr) minmax(520px, 1.26fr);
          gap: 1rem;
          align-items: start;
        }

        .purchase-details-layout > .purchase-card {
          height: 100%;
        }

        .purchase-subtotal-cell {
          padding-left: 0.5rem !important;
          padding-right: 0.5rem !important;
          text-align: center;
        }

        .purchase-workspace {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
          min-width: 0;
        }

        .purchase-current-stack {
          display: grid;
          gap: 1rem;
          min-width: 0;
        }

        .purchase-current {
          display: flex;
          min-height: 0;
          flex-direction: column;
        }

        .purchase-search {
          display: flex;
          height: 2.55rem;
          align-items: center;
          gap: 0.55rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.7rem;
          background: #ffffff;
          padding: 0 0.75rem;
        }

        .purchase-find-controls {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(9.5rem, 0.42fr);
          gap: 0.65rem;
          margin-top: 0.65rem;
        }

        .purchase-find-control {
          min-width: 0;
        }

        .purchase-scroll {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }

        .purchase-scroll::-webkit-scrollbar {
          width: 0.45rem;
          height: 0.45rem;
        }

        .purchase-scroll::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 999px;
        }

        .purchase-inventory-list {
          margin-top: 0.75rem;
          max-height: 18rem;
          overflow: auto;
          overscroll-behavior: contain;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
        }

        .purchase-inventory-head,
        .purchase-inventory-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 105px 72px 40px;
          gap: 0.65rem;
          align-items: center;
        }

        .purchase-inventory-head {
          position: sticky;
          top: 0;
          z-index: 1;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
          padding: 0.55rem 0.75rem;
          color: #64748b;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .purchase-inventory-row {
          width: 100%;
          border-bottom: 1px solid #f1f5f9;
          padding: 0.55rem 0.75rem;
          text-align: left;
          transition: background 140ms ease;
        }

        .purchase-inventory-row:hover,
        .purchase-inventory-row:focus-visible {
          background: #f8fafc;
          outline: none;
        }

        .purchase-add-btn {
          display: inline-flex;
          height: 1.9rem;
          width: 1.9rem;
          align-items: center;
          justify-content: center;
          border: 1px solid #86efac;
          border-radius: 0.5rem;
          color: #15803d;
        }

        .purchase-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-top: 0.75rem;
          color: #475569;
          font-size: 0.78rem;
        }

        .purchase-pagination-controls {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .purchase-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.65rem;
          margin-bottom: 0.8rem;
        }

        .purchase-metric {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 0.55rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.7rem;
          background: #f8fafc;
          padding: 0.62rem 0.7rem;
        }

        .purchase-metric-icon {
          display: inline-flex;
          height: 1.9rem;
          width: 1.9rem;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border-radius: 0.6rem;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .purchase-metric-icon-green {
          background: #ecfdf5;
          color: #059669;
        }

        .purchase-lines-wrap {
          max-height: 18.5rem;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
        }

        .purchase-lines-table {
          width: 100%;
          min-width: 0;
          table-layout: fixed;
        }

        .purchase-lines-table th:nth-child(1),
        .purchase-lines-table td:nth-child(1) {
          width: 4%;
          text-align: center;
        }

        .purchase-lines-table th:nth-child(2),
        .purchase-lines-table td:nth-child(2) {
          width: 22%;
        }

        .purchase-lines-table th:nth-child(3),
        .purchase-lines-table td:nth-child(3),
        .purchase-lines-table th:nth-child(4),
        .purchase-lines-table td:nth-child(4) {
          width: 13%;
          text-align: center;
        }

        .purchase-lines-table th:nth-child(5),
        .purchase-lines-table td:nth-child(5) {
          width: 26%;
          text-align: center;
        }

        .purchase-lines-table th:nth-child(6),
        .purchase-lines-table td:nth-child(6) {
          width: 13%;
          text-align: center;
        }

        .purchase-lines-table th:nth-child(7),
        .purchase-lines-table td:nth-child(7) {
          width: 9%;
          text-align: center;
        }

        .purchase-lines-table th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #f8fafc;
          color: #64748b;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .purchase-lines-table th,
        .purchase-lines-table td {
          padding-top: 0.7rem;
          padding-bottom: 0.7rem;
          padding-left: 0.75rem;
          padding-right: 0.75rem;
          vertical-align: middle;
        }

        .purchase-lines-table tbody tr {
          min-height: 4.75rem;
        }

        .purchase-line-highlight {
          animation: purchase-line-highlight 1.8s ease;
        }

        .purchase-line-highlight > td {
          background: transparent;
        }

        @keyframes purchase-line-highlight {
          0% {
            background: #fff7ed;
            border-color: #facc15;
          }
          65% {
            background: #fff7ed;
            border-color: #facc15;
          }
          100% {
            background: transparent;
            border-color: #e2e8f0;
          }
        }

        .purchase-number-stepper {
          display: inline-grid;
          grid-template-columns: 1.9rem minmax(2.4rem, 3rem) 1.9rem;
          align-items: center;
          width: 100%;
          max-width: 6.8rem;
          margin: 0 auto;
          overflow: hidden;
          border: 1px solid #cbd5e1;
          border-radius: 0.42rem;
          background: #ffffff;
        }

        .purchase-number-stepper button {
          display: inline-flex;
          width: 1.9rem;
          height: 2rem;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          color: #0f172a;
          transition: background-color 160ms ease, color 160ms ease, opacity 160ms ease;
        }

        .purchase-number-stepper button:first-child {
          border-right: 1px solid #e2e8f0;
        }

        .purchase-number-stepper button:last-child {
          border-left: 1px solid #e2e8f0;
        }

        .purchase-number-stepper button:hover,
        .purchase-number-stepper button:focus-visible {
          outline: none;
        }

        .purchase-number-stepper-decrease:hover,
        .purchase-number-stepper-decrease:focus-visible {
          background: #fee2e2;
          color: #b91c1c;
        }

        .purchase-number-stepper-increase:hover,
        .purchase-number-stepper-increase:focus-visible {
          background: #dcfce7;
          color: #15803d;
        }

        .purchase-number-stepper button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .purchase-number-stepper input {
          min-width: 0;
          width: 100%;
          height: 2rem;
          border: 0;
          background: transparent;
          text-align: center;
          color: #0f172a;
          font-weight: 800;
          outline: none;
        }

        .purchase-number-stepper-wide {
          max-width: 7.8rem;
          grid-template-columns: 1.9rem minmax(3rem, 4rem) 1.9rem;
        }

        .purchase-stock-impact {
          display: grid;
          grid-template-columns: minmax(3.6rem, 1fr) 1rem minmax(3.6rem, 1fr) 1rem minmax(3.6rem, 1fr);
          align-items: start;
          gap: 0.35rem;
          max-width: 18rem;
          margin: 0 auto;
        }

        .purchase-stock-box {
          display: grid;
          justify-items: center;
          gap: 0.25rem;
          min-width: 0;
        }

        .purchase-stock-value {
          display: flex;
          min-height: 2rem;
          width: 100%;
          align-items: center;
          justify-content: center;
          border: 1px solid #cbd5e1;
          border-radius: 0.42rem;
          background: #f8fafc;
          color: #0f172a;
          font-size: 0.85rem;
          font-weight: 800;
        }

        .purchase-stock-value-current {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .purchase-stock-value-added {
          background: #ecfdf5;
          color: #059669;
        }

        .purchase-stock-label {
          color: #475569;
          font-size: 0.62rem;
          font-weight: 700;
          line-height: 1;
          text-align: center;
        }

        .purchase-stock-symbol {
          padding-top: 0.38rem;
          color: #475569;
          font-size: 0.9rem;
          font-weight: 800;
        }

        .purchase-action-bar {
          display: flex;
          gap: 0.65rem;
          align-items: center;
          justify-content: flex-end;
          margin-top: 0.8rem;
          padding-top: 0.15rem;
        }

        .purchase-total {
          min-width: 0;
        }

        .purchase-summary-card .purchase-card-content {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.8rem;
          align-items: center;
        }

        .purchase-summary-card .purchase-metrics {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          margin-bottom: 0;
        }

        .purchase-summary-card .purchase-metric:last-child {
          grid-column: span 2;
        }

        .purchase-history-dialog {
          width: min(1180px, calc(100vw - 2rem));
          max-height: min(88vh, 840px);
          overflow: hidden;
          border-radius: 1rem;
          display: flex;
          flex-direction: column;
        }

        .purchase-history-body {
          display: flex;
          flex: 1;
          min-height: 0;
          flex-direction: column;
          gap: 1rem;
          overflow: hidden;
        }

        .purchase-history-search {
          display: flex;
          min-width: 0;
          flex: 1;
          align-items: center;
          gap: 0.85rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          background: #ffffff;
          padding: 0 1rem;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }

        .purchase-history-search:focus-within {
          border-color: #f4f400;
          box-shadow: 0 0 0 3px rgba(244, 244, 0, 0.32);
        }

        .purchase-history-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.02fr) minmax(420px, 0.98fr);
          gap: 1.25rem;
          min-height: 0;
          flex: 1;
          overflow: hidden;
        }

        .purchase-history-list,
        .purchase-history-detail {
          min-height: 0;
          overflow-y: auto;
        }

        .purchase-history-record-button {
          background: #ffffff;
          border-color: #e2e8f0;
          cursor: pointer;
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .purchase-history-record-button:hover,
        .purchase-history-record-button:focus-visible,
        .purchase-history-record-button:active {
          background: #f8fafc;
          border-color: #cbd5e1;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
        }

        .purchase-history-record-button-selected,
        .purchase-history-record-button-selected:hover,
        .purchase-history-record-button-selected:focus-visible,
        .purchase-history-record-button-selected:active {
          background: #eff6ff;
          border-color: #2563eb;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
        }

        .purchase-history-close-button {
          background: #ffffff;
          border-color: #e2e8f0;
          color: #475569;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .purchase-history-close-button:hover,
        .purchase-history-close-button:focus-visible,
        .purchase-history-close-button:active {
          background: #fef2f2;
          border-color: #fecaca;
          color: #dc2626;
          box-shadow: 0 8px 18px rgba(220, 38, 38, 0.12);
        }

        .purchase-clear-dialog {
          width: min(520px, calc(100vw - 2rem));
          border-radius: 1rem;
        }

        .purchase-clear-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.75rem;
          padding: 1.15rem 1.5rem 1.25rem;
        }

        .purchase-clear-footer .purchase-clear-cancel,
        .purchase-clear-footer .purchase-clear-confirm {
          min-width: 8.5rem;
          white-space: nowrap;
        }

        .purchase-clear-footer .purchase-clear-confirm {
          background: #dc2626;
          color: #ffffff;
          font-weight: 800;
        }

        .purchase-clear-footer .purchase-clear-confirm:hover {
          background: #b91c1c;
        }

        @media (max-width: 1320px) {
          .purchase-details-layout,
          .purchase-doc-grid,
          .purchase-workspace {
            grid-template-columns: 1fr;
          }

          .purchase-doc-wide {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 820px) {
          .purchase-screen {
            padding: 0.75rem;
          }

          .purchase-page {
            gap: 0.85rem;
          }

          .purchase-card {
            border-radius: 1rem;
          }

          .purchase-card-header {
            gap: 0.75rem;
            padding: 0.85rem 0.9rem;
          }

          .purchase-card-content {
            padding: 0.85rem 0.9rem 0.95rem;
          }

          .purchase-title {
            font-size: 1rem;
          }

          .purchase-details-layout,
          .purchase-doc-grid,
          .purchase-metrics,
          .purchase-action-bar,
          .purchase-summary-card .purchase-card-content,
          .purchase-summary-card .purchase-metrics {
            grid-template-columns: 1fr;
          }

          .purchase-summary-card .purchase-metric:last-child {
            grid-column: auto;
          }

          .purchase-history-layout {
            grid-template-columns: 1fr;
            overflow-y: auto;
          }

          .purchase-doc-grid {
            min-height: 0;
          }

          .purchase-inventory-head {
            display: none;
          }

          .purchase-inventory-row {
            grid-template-columns: minmax(0, 1fr) auto;
          }

          .purchase-inventory-category,
          .purchase-inventory-stock {
            display: none;
          }

          .purchase-pagination {
            align-items: stretch;
            flex-direction: column;
          }

          .purchase-pagination-controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .purchase-find-controls {
            grid-template-columns: 1fr;
          }

          .purchase-header-actions {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr;
          }

          .purchase-header-actions .purchase-history-button,
          .purchase-header-actions button {
            min-height: 2.75rem;
            justify-content: center;
          }

          .purchase-lines-wrap {
            max-height: min(62vh, 34rem);
            overflow-y: auto;
            overflow-x: hidden;
            border: 0;
            border-radius: 0;
            padding-right: 0.1rem;
          }

          .purchase-lines-table,
          .purchase-lines-table tbody,
          .purchase-lines-table tr,
          .purchase-lines-table td {
            display: block;
            width: 100% !important;
          }

          .purchase-lines-table thead {
            display: none;
          }

          .purchase-lines-table tbody {
            display: grid;
            gap: 0.85rem;
          }

          .purchase-lines-table tr {
            overflow: hidden;
            border: 1px solid #e2e8f0;
            border-radius: 0.9rem;
            background: #ffffff;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          }

          .purchase-lines-table td {
            display: grid;
            grid-template-columns: minmax(6.75rem, 0.42fr) minmax(0, 1fr);
            gap: 0.75rem;
            align-items: center;
            border-bottom: 1px solid #f1f5f9;
            padding: 0.75rem 0.85rem;
            text-align: left !important;
          }

          .purchase-lines-table td:last-child {
            border-bottom: 0;
          }

          .purchase-lines-table td::before {
            content: attr(data-label);
            color: #64748b;
            font-size: 0.68rem;
            font-weight: 800;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }

          .purchase-lines-table td[data-label="#"] {
            grid-template-columns: 1fr auto;
            background: #f8fafc;
          }

          .purchase-lines-table td[data-label="Inventory Item"] {
            grid-template-columns: 1fr;
            gap: 0.45rem;
          }

          .purchase-lines-table td[data-label="Inventory Item"]::before {
            margin-bottom: 0.1rem;
          }

          .purchase-lines-table td[data-label="Action"] {
            grid-template-columns: 1fr;
          }

          .purchase-lines-table td[data-label="Action"]::before {
            display: none;
          }

          .purchase-lines-table select {
            min-height: 2.75rem;
            font-size: 0.95rem;
          }

          .purchase-number-stepper,
          .purchase-number-stepper-wide {
            grid-template-columns: 2.35rem minmax(3.5rem, 1fr) 2.35rem;
            width: min(100%, 12rem);
            max-width: none;
            margin: 0;
          }

          .purchase-number-stepper button,
          .purchase-number-stepper input {
            height: 2.45rem;
          }

          .purchase-number-stepper button {
            width: 2.35rem;
          }

          .purchase-stock-impact {
            width: 100%;
            max-width: none;
            grid-template-columns: minmax(0, 1fr) 0.8rem minmax(0, 1fr) 0.8rem minmax(0, 1fr);
            gap: 0.25rem;
          }

          .purchase-stock-value {
            min-height: 2.35rem;
          }

          .purchase-stock-label {
            font-size: 0.58rem;
          }

          .purchase-subtotal-cell {
            text-align: left;
          }

          .purchase-action-bar {
            display: grid;
            gap: 0.65rem;
          }

          .purchase-action-bar button {
            min-height: 2.75rem;
            width: 100%;
          }

          .purchase-clear-footer {
            flex-direction: column-reverse;
            align-items: stretch;
          }

          .purchase-clear-footer .purchase-clear-cancel,
          .purchase-clear-footer .purchase-clear-confirm {
            width: 100%;
          }
        }

        @media (max-width: 460px) {
          .purchase-lines-table td {
            grid-template-columns: 1fr;
            gap: 0.45rem;
          }

          .purchase-number-stepper,
          .purchase-number-stepper-wide {
            width: 100%;
          }

          .purchase-stock-impact {
            grid-template-columns: 1fr;
            gap: 0.45rem;
          }

          .purchase-stock-symbol {
            display: none;
          }

          .purchase-stock-box {
            grid-template-columns: minmax(7rem, 0.45fr) 1fr;
            align-items: center;
            justify-items: stretch;
          }

          .purchase-stock-label {
            grid-column: 1;
            grid-row: 1;
            text-align: left;
          }

          .purchase-stock-value {
            grid-column: 2;
            grid-row: 1;
          }
        }
      `}</style>

      <PageHeader
        title="Purchase Entry"
        subtitle="Record supplier deliveries and add received stock"
        icon={<Truck className="h-8 w-8" />}
        userBranch={user?.branch}
      />

      <div className="purchase-page">
        <div className="purchase-details-layout">
          <Card className="purchase-card">
            <CardHeader className="purchase-card-header">
              <CardTitle className="purchase-title">
                <span className="purchase-kicker">Document</span>
                Supplier and Receipt Details
              </CardTitle>
            </CardHeader>
            <CardContent className="purchase-card-content">
              <div className="purchase-doc-grid">
                <Field label="Supplier">
                  <Input value={supplierName} onChange={event => setSupplierName(event.target.value.slice(0, 120))} placeholder="e.g., One Samix" disabled={isSaving} className="h-10" />
                </Field>
                <Field label="Document Type">
                  <Select value={documentType} onValueChange={setDocumentType} disabled={isSaving}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="DR/SI No.">
                  <Input value={documentNumber} onChange={event => setDocumentNumber(event.target.value.slice(0, 80))} placeholder="Optional" disabled={isSaving} className="h-10" />
                </Field>
                <Field label="Terms">
                  <Select value={paymentTerms} onValueChange={setPaymentTerms} disabled={isSaving}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map(term => <SelectItem key={term.value} value={term.value}>{term.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="purchase-doc-wide">
                  <Field label="Remarks">
                    <Textarea
                      value={remarks}
                      maxLength={500}
                      onChange={event => setRemarks(event.target.value)}
                      placeholder="Optional note"
                      disabled={isSaving}
                      className="purchase-remarks"
                      rows={5}
                    />
                  </Field>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="purchase-card">
            <CardHeader className="purchase-card-header">
              <CardTitle className="purchase-title">
                <span className="purchase-kicker">Inventory</span>
                Find Items
              </CardTitle>
              <span className="text-xs font-semibold text-slate-500">Page {activeInventoryPage} of {inventoryPageCount}</span>
            </CardHeader>
            <CardContent className="purchase-card-content">
                <div className="purchase-search">
                  <Search className="h-4 w-4 text-slate-500" />
                  <Input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search inventory item..." className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0" />
                </div>
                <div className="purchase-find-controls">
                  <div className="purchase-find-control">
                    <Select value={inventoryCategoryFilter} onValueChange={setInventoryCategoryFilter}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Filter category" />
                      </SelectTrigger>
                      <SelectContent>
                        {inventoryCategories.map(category => (
                          <SelectItem key={category} value={category}>
                            {category === 'all' ? 'All categories' : category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="purchase-find-control">
                    <Select value={inventorySort} onValueChange={setInventorySort}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Sort items" />
                      </SelectTrigger>
                      <SelectContent>
                        {INVENTORY_SORT_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="purchase-scroll purchase-inventory-list">
                  <div className="purchase-inventory-head">
                    <span>Inventory Item</span>
                    <span>Category</span>
                    <span className="text-center">Stock</span>
                    <span>Action</span>
                  </div>
                  {paginatedInventory.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-600">No inventory items found.</p>
                  ) : paginatedInventory.map(item => (
                    <button key={item.id} type="button" className="purchase-inventory-row" onClick={() => addInventoryItemToPurchase(item)} disabled={isSaving}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{item.name}</span>
                        <span className="block truncate text-xs text-slate-500">{item.itemCode || 'No item code'}</span>
                      </span>
                      <span className="purchase-inventory-category truncate text-sm text-slate-700">{item.category}</span>
                      <span className="purchase-inventory-stock text-center">
                        <Badge className="bg-green-50 text-green-700 hover:bg-green-50">{item.quantity}</Badge>
                      </span>
                      <span className="flex justify-end"><span className="purchase-add-btn"><Plus className="h-4 w-4" /></span></span>
                    </button>
                  ))}
                </div>
                <div className="purchase-pagination">
                  <span>Showing {inventoryShowingStart}-{inventoryShowingEnd} of {filteredInventory.length} items</span>
                  <div className="purchase-pagination-controls">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setInventoryPage(page => Math.max(1, page - 1))}
                      disabled={activeInventoryPage <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setInventoryPage(page => Math.min(inventoryPageCount, page + 1))}
                      disabled={activeInventoryPage >= inventoryPageCount}
                    >
                      Next
                    </Button>
                  </div>
                </div>
            </CardContent>
          </Card>
        </div>

        <div className="purchase-workspace">
          <div className="purchase-current-stack">
          <Card className="purchase-card purchase-current">
            <CardHeader className="purchase-card-header">
              <CardTitle className="purchase-title">
                <span className="purchase-kicker">Worksheet</span>
                Current Purchase
              </CardTitle>
              <div className="purchase-header-actions">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="purchase-history-button"
                  onClick={() => {
                    setSelectedPurchaseId('');
                    setIsPurchaseHistoryOpen(true);
                  }}
                >
                  <History className="mr-2 h-4 w-4" />
                  See Recent Purchases
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={isSaving}>
                  <Plus className="mr-2 h-4 w-4" />
                  Blank Line
                </Button>
              </div>
            </CardHeader>
            <CardContent className="purchase-card-content">
              <div ref={purchaseLinesScrollRef} className="purchase-scroll purchase-lines-wrap">
                <Table className="purchase-lines-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Inventory Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Cost</TableHead>
                      <TableHead>Stock Impact</TableHead>
                      <TableHead className="purchase-subtotal-cell">Subtotal</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineDetails.map((line, index) => {
                      const selectedItem = line.item;
                      const afterStock = selectedItem ? Number(selectedItem.quantity || 0) + Number(line.quantity || 0) : null;
                      return (
                        <TableRow
                          key={`purchase-line-${index}`}
                          ref={node => {
                            if (node) {
                              purchaseLineRefs.current[index] = node;
                            } else {
                              delete purchaseLineRefs.current[index];
                            }
                          }}
                          className={highlightedLineIndex === index ? 'purchase-line-highlight' : ''}
                        >
                          <TableCell data-label="#" className="font-semibold text-slate-900">{index + 1}</TableCell>
                          <TableCell data-label="Inventory Item">
                            <select
                              ref={node => {
                                if (node) {
                                  purchaseLineSelectRefs.current[index] = node;
                                } else {
                                  delete purchaseLineSelectRefs.current[index];
                                }
                              }}
                              value={line.inventoryId}
                              onChange={event => updateLine(index, 'inventoryId', event.target.value)}
                              disabled={isSaving}
                              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                            >
                              <option value="">Select item</option>
                              {sortedInventory.map(item => (
                                <option key={item.id} value={item.id}>{item.itemCode ? `${item.itemCode} - ` : ''}{item.name}</option>
                              ))}
                            </select>
                            {selectedItem && <p className="mt-1 truncate text-xs text-slate-500">{selectedItem.category}</p>}
                          </TableCell>
                          <TableCell data-label="Qty">
                            <div className="purchase-number-stepper" aria-label={`Quantity received for line ${index + 1}`}>
                              <button
                                type="button"
                                className="purchase-number-stepper-decrease"
                                onClick={() => adjustLineNumber(index, 'quantity', -1, { min: 1 })}
                                disabled={isSaving || Number(line.quantity || 0) <= 1}
                                aria-label={`Decrease quantity for line ${index + 1}`}
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={line.quantityInput}
                                onChange={event => updateLineQuantity(index, event.target.value)}
                                onBlur={event => validateLineQuantityOnBlur(index, event.target.value)}
                                placeholder="0"
                                disabled={isSaving}
                                aria-label={`Quantity received for line ${index + 1}`}
                              />
                              <button
                                type="button"
                                className="purchase-number-stepper-increase"
                                onClick={() => adjustLineNumber(index, 'quantity', 1, { min: 1 })}
                                disabled={isSaving}
                                aria-label={`Increase quantity for line ${index + 1}`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell data-label="Unit Cost">
                            <div className="purchase-number-stepper purchase-number-stepper-wide" aria-label={`Unit cost for line ${index + 1}`}>
                              <button
                                type="button"
                                className="purchase-number-stepper-decrease"
                                onClick={() => adjustLineNumber(index, 'unitCost', -1, { min: 0, decimals: 2 })}
                                disabled={isSaving || Number(line.unitCost || 0) <= 0}
                                aria-label={`Decrease unit cost for line ${index + 1}`}
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.unitCostInput}
                                onChange={event => updateLineUnitCost(index, event.target.value)}
                                onBlur={event => validateLineUnitCostOnBlur(index, event.target.value)}
                                placeholder="0"
                                disabled={isSaving}
                                aria-label={`Unit cost for line ${index + 1}`}
                              />
                              <button
                                type="button"
                                className="purchase-number-stepper-increase"
                                onClick={() => adjustLineNumber(index, 'unitCost', 1, { min: 0, decimals: 2 })}
                                disabled={isSaving}
                                aria-label={`Increase unit cost for line ${index + 1}`}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell data-label="Stock Impact">
                            <div className="purchase-stock-impact">
                              <span className="purchase-stock-box">
                                <span className="purchase-stock-value purchase-stock-value-current">{selectedItem ? selectedItem.quantity : '-'}</span>
                                <span className="purchase-stock-label">Current Stock</span>
                              </span>
                              <span className="purchase-stock-symbol">+</span>
                              <span className="purchase-stock-box">
                                <span className="purchase-stock-value purchase-stock-value-added">+{line.quantity || 0}</span>
                                <span className="purchase-stock-label">Added</span>
                              </span>
                              <span className="purchase-stock-symbol">=</span>
                              <span className="purchase-stock-box">
                                <span className="purchase-stock-value">{afterStock ?? '-'}</span>
                                <span className="purchase-stock-label">New Stock</span>
                              </span>
                            </div>
                          </TableCell>
                          <TableCell data-label="Subtotal" className="purchase-subtotal-cell font-semibold">{formatCurrency(line.subtotal)}</TableCell>
                          <TableCell data-label="Action" className="text-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => removeLine(index)}
                              disabled={isSaving}
                              title="Remove line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

            </CardContent>
          </Card>
          <Card className="purchase-card purchase-summary-card">
            <CardHeader className="purchase-card-header">
              <CardTitle className="purchase-title">
                <span className="purchase-kicker">Summary</span>
                Purchase Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="purchase-card-content">
              <div className="purchase-metrics">
                <Metric icon={<Truck className="h-4 w-4" />} label="Supplier" value={supplierName || 'Not set'} />
                <Metric icon={<FileText className="h-4 w-4" />} label="Document" value={`${documentType}${documentNumber ? `-${documentNumber}` : ''}`} />
                <Metric icon={<PackagePlus className="h-4 w-4" />} label="Items" value={`${selectedLines.length} lines`} />
                <Metric icon={<ReceiptText className="h-4 w-4" />} label="Qty Added" value={`${totalQuantity} units`} accent="green" />
                <Metric icon={<Wallet className="h-4 w-4" />} label="Total Purchase" value={formatCurrency(subtotalAmount)} />
              </div>
              <div className="purchase-action-bar">
                <Button type="button" className="h-10 bg-red-600 px-5 font-bold text-white hover:bg-red-700" onClick={handleRecordPurchase} disabled={isSaving}>
                  <Wallet className="mr-2 h-4 w-4" />
                  {isSaving ? 'Saving...' : 'Save Purchase'}
                </Button>
                <Button type="button" variant="outline" className="h-10 px-4" onClick={() => setIsClearDialogOpen(true)} disabled={isSaving}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
          </div>
        </div>

      </div>

      <PurchaseHistoryDialog
        open={isPurchaseHistoryOpen}
        onOpenChange={setIsPurchaseHistoryOpen}
        purchases={filteredPurchaseHistory}
        totalPurchaseCount={sortedPurchases.length}
        searchValue={purchaseHistorySearch}
        onSearchChange={setPurchaseHistorySearch}
        selectedPurchase={selectedPurchase}
        onSelectPurchase={purchaseId => setSelectedPurchaseId(String(purchaseId))}
      />

      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className="purchase-clear-dialog border border-slate-200 bg-white p-0 shadow-2xl">
          <DialogHeader className="border-b border-slate-200 px-6 pb-5 pt-6 text-left">
            <DialogTitle className="flex items-center gap-3 text-lg font-bold text-slate-950">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <RefreshCw className="h-5 w-5" />
              </span>
              Clear Current Purchase?
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-6 text-slate-600">
              This will remove the supplier details and all purchase lines you have entered. Inventory will not be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="purchase-clear-footer">
            <Button
              type="button"
              variant="outline"
              className="purchase-clear-cancel h-10 px-4"
              onClick={() => setIsClearDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="purchase-clear-confirm h-10 px-5"
              onClick={handleConfirmClear}
            >
              Clear Draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PurchaseHistoryDialog({
  open,
  onOpenChange,
  purchases,
  totalPurchaseCount,
  searchValue,
  onSearchChange,
  selectedPurchase,
  onSelectPurchase
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="purchase-history-dialog gap-0 border border-slate-200 bg-white p-0 shadow-2xl sm:max-w-none">
        <DialogHeader className="border-b border-slate-200 px-6 pb-6 pt-6 text-left sm:px-8">
          <div className="flex items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-2xl font-bold leading-tight tracking-normal text-slate-900">
                  Recent Purchases
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6 text-slate-600">
                  Review supplier delivery records that increased inventory stock.
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close purchase history"
              onClick={() => onOpenChange(false)}
              className="purchase-history-close-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="purchase-history-body px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="purchase-history-search">
              <Search className="h-5 w-5 shrink-0 text-slate-500" />
              <Input
                value={searchValue}
                onChange={event => onSearchChange(event.target.value)}
                placeholder="Search by purchase number, supplier, document, or item"
                className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <p className="shrink-0 text-sm font-medium text-slate-600">
              Showing {purchases.length} of {totalPurchaseCount} purchases
            </p>
          </div>

          {purchases.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No purchase records match your search.
            </div>
          ) : (
            <div className="purchase-history-layout">
              <div className="purchase-history-list space-y-3 pr-1">
                {purchases.map(purchase => {
                  const isSelected = selectedPurchase?.id === purchase.id;
                  return (
                    <button
                      key={purchase.id}
                      type="button"
                      onClick={() => onSelectPurchase(purchase.id)}
                      className={`purchase-history-record-button w-full rounded-xl border p-4 text-left ${isSelected ? 'purchase-history-record-button-selected' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-base font-bold text-slate-900">{purchase.purchaseNumber || 'Purchase record'}</p>
                          <p className="mt-2 flex items-center gap-2 truncate text-sm text-slate-500">
                            <CalendarDays className="h-4 w-4 shrink-0" />
                            {formatDateTime(purchase.createdAt)}
                          </p>
                          <p className="mt-2 truncate text-sm text-slate-600">
                            {purchase.supplierName || 'No supplier'} - {purchase.documentType || 'DR'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-base font-extrabold text-slate-900">{formatCurrency(purchase.subtotalAmount)}</p>
                          <Badge className="mt-2 bg-green-100 text-green-700 hover:bg-green-100">Completed</Badge>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="purchase-history-detail rounded-xl border border-slate-200 bg-white p-5">
                {selectedPurchase ? (
                  <PurchaseHistoryDetail purchase={selectedPurchase} />
                ) : (
                  <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
                    Select a purchase record to view details.
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

function PurchaseHistoryDetail({ purchase }) {
  const items = getPurchaseItems(purchase);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{purchase.purchaseNumber}</h3>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <CalendarDays className="h-4 w-4" />
            {formatDateTime(purchase.createdAt)}
          </p>
        </div>
        <Badge className="bg-green-100 px-3 py-1 text-green-700 hover:bg-green-100">Completed</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <HistoryDetail icon={<Truck className="h-5 w-5" />} label="Supplier" value={purchase.supplierName || 'No supplier'} />
        <HistoryDetail icon={<FileText className="h-5 w-5" />} label="Document" value={`${purchase.documentType || 'DR'}${purchase.documentNumber ? ` - ${purchase.documentNumber}` : ''}`} />
        <HistoryDetail icon={<PackagePlus className="h-5 w-5" />} label="Line Items" value={`${getPurchaseLineCount(purchase)} line${getPurchaseLineCount(purchase) === 1 ? '' : 's'}`} />
        <HistoryDetail icon={<ReceiptText className="h-5 w-5" />} label="Quantity Added" value={`${getPurchaseQuantity(purchase)} unit${getPurchaseQuantity(purchase) === 1 ? '' : 's'}`} />
        <HistoryDetail icon={<Wallet className="h-5 w-5" />} label="Total Purchase" value={formatCurrency(purchase.subtotalAmount)} />
        <HistoryDetail icon={<FileText className="h-5 w-5" />} label="Terms" value={purchase.paymentTerms || 'Cash'} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3 py-1">
          <h4 className="font-bold text-slate-900">Received Items</h4>
          <span className="text-sm text-slate-500">{items.length} listed</span>
        </div>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No item details available.</p>
          ) : items.map((item, index) => (
            <div key={item.id || `${item.inventoryId}-${index}`} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="break-words font-semibold leading-5 text-slate-900">{item.itemName || item.name || 'Inventory item'}</p>
                <p className="mt-1 break-words text-xs leading-5 text-slate-500">Quantity: {item.quantity || 0}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-900">{formatCurrency(item.subtotal ?? Number(item.quantity || 0) * Number(item.unitCost || 0))}</p>
                <p className="mt-1 text-xs text-slate-500">Unit cost {formatCurrency(item.unitCost)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryDetail({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 break-words font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="purchase-field">
      <Label className="purchase-field-label text-xs font-bold text-slate-700">{label}</Label>
      {children}
    </div>
  );
}

function Metric({ icon, label, value, accent = 'blue' }) {
  return (
    <div className="purchase-metric">
      <div className={`purchase-metric-icon ${accent === 'green' ? 'purchase-metric-icon-green' : ''}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="truncate text-sm font-extrabold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
