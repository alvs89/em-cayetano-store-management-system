// Reports module: prepares printable and exportable business reports for sales,
// inventory, supplier reorder preparation, and operational review.
import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Download, Calendar, TrendingUp, Package, AlertTriangle, RefreshCw, FileText, Info, Wallet, Tag, PackagePlus, ShieldCheck } from 'lucide-react';
import { sortByNameAsc, sortByQuantityAsc, linearSearchAll } from '../utils/algorithms';
import { getStockStatusBadgeClass } from '../utils/statusStyles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { useData } from './DataContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PageHeader } from './PageHeader';
import { formatDateTime, formatPurchaseDocumentLabel, formatPurchasePaymentTerms } from '../utils/format';
import { getStockMovementReasonLabel } from '../utils/stockMovementReasons';
import { canAccessReportType, getDefaultReportTypeForRole, getReportTypeOptionsForRole, isAdminRole } from '../utils/roles';
import { getProductProfitability, getProfitabilitySummary } from '../utils/profitability';
import {
  HARDWARE_SUPPLIER_OPTIONS,
  SUPPLIER_CUSTOM_VALUE,
  getSupplierSelectValue,
  isListedSupplier,
  sanitizeSupplierInput,
} from '../utils/suppliers';
import { buildPurchaseDraftFromReorderGroup, savePurchaseDraft } from '../utils/purchaseDrafts';

const isBackdatedRecord = record => {
  if (!record?.createdAt || !record?.encodedAt) return false;
  const transactionDate = new Date(record.createdAt);
  const encodedDate = new Date(record.encodedAt);
  if (Number.isNaN(transactionDate.getTime()) || Number.isNaN(encodedDate.getTime())) return false;
  return encodedDate.getTime() - transactionDate.getTime() > 60 * 1000 || Boolean(record.backdateReason);
};

// Backdated records show both transaction and encoded dates so report viewers
// can separate business-period reporting from audit timing.
const formatEncodedDate = record => isBackdatedRecord(record) ? formatDateTime(record.encodedAt) : '-';

const getCategoryDisplay = item => {
  const category = item?.category || 'Uncategorized';
  const note = String(item?.categoryNote || item?.category_note || '').trim();
  return note ? `${category}: ${note}` : category;
};

export function ReportsModule({
  user,
  onNavigate
}) {
  const {
    inventory,
    stockMovements,
    salesTransactions,
    purchaseTransactions,
    addInventoryItem,
    auditAction
  } = useData();
  const [reportType, setReportType] = useState('summary');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [reportPeriod, setReportPeriod] = useState('daily');
  const [selectedReportDate, setSelectedReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customStartDate, setCustomStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedReorderSupplier, setSelectedReorderSupplier] = useState('');
  const [reorderQuantities, setReorderQuantities] = useState({});
  const [reorderSelections, setReorderSelections] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reviewItem, setReviewItem] = useState(null);
  const [isSalesExportDialogOpen, setIsSalesExportDialogOpen] = useState(false);
  const [conversionDraft, setConversionDraft] = useState({
    name: '',
    category: 'Other',
    supplierName: '',
    defaultSellingPrice: '',
    quantity: '',
    reorderLevel: '5'
  });
  const [conversionSupplierMode, setConversionSupplierMode] = useState('listed');
  const [acknowledgeSimilarItem, setAcknowledgeSimilarItem] = useState(false);
  const [isConvertingItem, setIsConvertingItem] = useState(false);
  const reportDateInputRef = useRef(null);
  const reorderQuantityDefaultsRef = useRef({});
  const formatDateInputDisplay = value => {
    const [year, month, day] = String(value || '').split('-');
    return year && month && day ? `${month}/${day}/${year}` : 'Select date';
  };

  // Pagination keeps large reports readable while export functions still use
  // the complete filtered dataset.
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [categoryPages, setCategoryPages] = useState({});
  const allowedReportTypes = React.useMemo(() => getReportTypeOptionsForRole(user?.role), [user?.role]);
  const defaultReportType = React.useMemo(() => getDefaultReportTypeForRole(user?.role), [user?.role]);
  const inventorySnapshotReportTypes = ['summary', 'detailed', 'low-stock', 'supplier-reorder', 'category'];
  const categoryFilterReportTypes = ['detailed', 'low-stock', 'movements', 'sales-movements', 'supplier-reorder', 'actual-earnings'];
  const isInventorySnapshotReport = inventorySnapshotReportTypes.includes(reportType);
  const reportUsesCategoryFilter = categoryFilterReportTypes.includes(reportType);

  // Filter changes briefly dim report cards to make recalculated data feel
  // deliberate without changing the underlying records.
  useEffect(() => {
    setIsRefreshing(true);
    const timer = setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [reportPeriod, selectedReportDate, customStartDate, customEndDate]);

  // Reset pagination when report scope changes so users start at the beginning
  // of the newly filtered dataset.
  useEffect(() => {
    setCurrentPage(1);
    setCategoryPages({});
  }, [reportType, selectedCategory, reportPeriod, selectedReportDate, customStartDate, customEndDate]);

  const paginateItems = (items, pageOverride) => {
    const totalItems = (items?.length || 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const page = Math.min(Math.max(1, Number(pageOverride ?? currentPage)), totalPages);
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return {
      pageItems: (items || []).slice(start, end),
      totalPages,
      page,
      totalItems
    };
  };

  // Optional page setters support both global report pagination and independent
  // category sections without duplicating pagination rendering.
  const renderPaginationControls = (totalPages, page, setPage, totalItems) => {
    const activePageValue = Number(page ?? currentPage);
    const activePage = Number.isFinite(activePageValue) && activePageValue > 0 ? activePageValue : 1;
    const setActivePage = updater => {
      const resolvePage = previousPage => {
        const previous = Number(previousPage);
        const safePrevious = Number.isFinite(previous) && previous > 0 ? previous : 1;
        const next = typeof updater === 'function' ? updater(safePrevious) : updater;
        const numericNext = Number(next);
        const safeNext = Number.isFinite(numericNext) && numericNext > 0 ? numericNext : 1;
        return Math.min(totalPages, Math.max(1, safeNext));
      };

      if (setPage) {
        setPage(resolvePage(activePage));
      } else {
        setCurrentPage(previousPage => resolvePage(previousPage));
      }
    };
    if (!totalPages || totalPages <= 1) return null;
    // Windowed pagination shows first/last pages plus nearby pages for large
    // result sets without crowding the report footer.
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, activePage - 2);
      let end = Math.min(totalPages - 1, activePage + 2);
      if (start > 2) pages.push('left-ellipsis');
      for (let p = start; p <= end; p++) pages.push(p);
      if (end < totalPages - 1) pages.push('right-ellipsis');
      pages.push(totalPages);
    }

    const rangeStart = Math.min(totalItems || totalPages * itemsPerPage, (activePage - 1) * itemsPerPage + 1);
    const rangeEnd = Math.min(totalItems || totalPages * itemsPerPage, activePage * itemsPerPage);

    return (
      <div className="reports-pagination mt-3 flex items-center justify-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setActivePage(p => Math.max(1, Number(p) - 1))} disabled={activePage <= 1}>Previous</Button>
        {pages.map((p, idx) => {
          if (p === 'left-ellipsis' || p === 'right-ellipsis') {
            return (
              <Button key={`${p}-${idx}`} type="button" size="sm" variant="ghost" disabled>
                …
              </Button>
            );
          }
          return (
            <Button key={p} type="button" size="sm" variant={p === activePage ? undefined : 'outline'} onClick={() => setActivePage(p)}>
              {p}
            </Button>
          );
        })}
        <Button type="button" size="sm" variant="ghost" onClick={() => setActivePage(p => Math.min(totalPages, Number(p) + 1))} disabled={activePage >= totalPages}>Next</Button>
        {typeof totalItems === 'number' && (
          <div className="text-sm text-slate-600 ml-2">{rangeStart}-{rangeEnd} of {totalItems} results</div>
        )}
      </div>
    );
  };

  const getCategoryPage = category => Number(categoryPages[category] ?? 1);
  const setCategoryPage = (category, page) => {
    setCategoryPages(prev => ({ ...prev, [category]: Number(page) }));
  };

  useEffect(() => {
    if (!canAccessReportType(user?.role, reportType)) {
      setReportType(defaultReportType);
      setSelectedCategory('all');
    }
  }, [defaultReportType, reportType, user?.role]);

  const handleReportTypeChange = value => {
    setReportType(value);
    if (!categoryFilterReportTypes.includes(value)) {
      setSelectedCategory('all');
    }
  };

  useEffect(() => {
    const applyTargetReport = ({
      reportType: nextReportType,
      category = 'all',
      period,
      date,
      customStartDate: targetCustomStartDate,
      customEndDate: targetCustomEndDate,
      supplier
    } = {}) => {
      if (!nextReportType) return;
      const safeReportType = canAccessReportType(user?.role, nextReportType)
        ? nextReportType
        : defaultReportType;
      if (safeReportType !== nextReportType) {
        toast.info('That report is not available for your current role.');
      }
      setReportType(safeReportType);
      setSelectedCategory(categoryFilterReportTypes.includes(safeReportType) ? (category || 'all') : 'all');
      if (['daily', 'weekly', 'monthly', 'custom'].includes(period)) {
        setReportPeriod(period);
      }
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        setSelectedReportDate(date);
      }
      if (period === 'custom') {
        if (targetCustomStartDate && /^\d{4}-\d{2}-\d{2}$/.test(String(targetCustomStartDate))) {
          setCustomStartDate(targetCustomStartDate);
        }
        if (targetCustomEndDate && /^\d{4}-\d{2}-\d{2}$/.test(String(targetCustomEndDate))) {
          setCustomEndDate(targetCustomEndDate);
        }
      }
      if (safeReportType === 'supplier-reorder' && supplier) {
        setSelectedReorderSupplier(supplier);
      }
    };

    const storedReportType = localStorage.getItem('reports_target_type');
    if (storedReportType) {
      applyTargetReport({
        reportType: storedReportType,
        category: localStorage.getItem('reports_target_category') || 'all',
        period: localStorage.getItem('reports_target_period') || undefined,
        date: localStorage.getItem('reports_target_date') || undefined,
        customStartDate: localStorage.getItem('reports_target_custom_start') || undefined,
        customEndDate: localStorage.getItem('reports_target_custom_end') || undefined,
        supplier: localStorage.getItem('reports_target_supplier') || undefined
      });
      localStorage.removeItem('reports_target_type');
      localStorage.removeItem('reports_target_category');
      localStorage.removeItem('reports_target_period');
      localStorage.removeItem('reports_target_date');
      localStorage.removeItem('reports_target_custom_start');
      localStorage.removeItem('reports_target_custom_end');
      localStorage.removeItem('reports_target_supplier');
    }

    const handleTargetReport = event => {
      applyTargetReport(event.detail || {});
      localStorage.removeItem('reports_target_type');
      localStorage.removeItem('reports_target_category');
      localStorage.removeItem('reports_target_period');
      localStorage.removeItem('reports_target_date');
      localStorage.removeItem('reports_target_custom_start');
      localStorage.removeItem('reports_target_custom_end');
      localStorage.removeItem('reports_target_supplier');
    };

    window.addEventListener('reports-target-view', handleTargetReport);
    return () => window.removeEventListener('reports-target-view', handleTargetReport);
  }, [defaultReportType, user?.role]);

  const getSelectedDate = () => {
    const [year, month, day] = selectedReportDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  };

  const getDateFromKey = value => {
    const [year, month, day] = String(value || '').split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  };

  const getReportPeriodBounds = () => {
    if (reportPeriod === 'custom') {
      const startDate = getDateFromKey(customStartDate || selectedReportDate);
      const endDate = getDateFromKey(customEndDate || customStartDate || selectedReportDate);
      const start = new Date(startDate <= endDate ? startDate : endDate);
      const end = new Date(startDate <= endDate ? endDate : startDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    const selectedDate = getSelectedDate();
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    if (reportPeriod === 'weekly') {
      start.setDate(selectedDate.getDate() - selectedDate.getDay());
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (reportPeriod === 'monthly') {
      start.setDate(1);
      end.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  };

  const getPreviousReportPeriodBounds = () => {
    const { start, end } = getReportPeriodBounds();
    const previousStart = new Date(start);
    const previousEnd = new Date(end);

    if (reportPeriod === 'weekly') {
      previousStart.setDate(start.getDate() - 7);
      previousEnd.setDate(end.getDate() - 7);
    } else if (reportPeriod === 'monthly') {
      previousStart.setMonth(start.getMonth() - 1, 1);
      previousEnd.setFullYear(previousStart.getFullYear(), previousStart.getMonth() + 1, 0);
      previousEnd.setHours(23, 59, 59, 999);
    } else if (reportPeriod === 'custom') {
      const durationMs = Math.max(0, end.getTime() - start.getTime());
      previousEnd.setTime(start.getTime() - 1);
      previousStart.setTime(previousEnd.getTime() - durationMs);
      previousStart.setHours(0, 0, 0, 0);
      previousEnd.setHours(23, 59, 59, 999);
    } else {
      previousStart.setDate(start.getDate() - 1);
      previousEnd.setDate(end.getDate() - 1);
    }

    return { start: previousStart, end: previousEnd };
  };

  const isMovementInReportPeriod = movement => {
    const movementDate = new Date(movement.createdAt);
    if (Number.isNaN(movementDate.getTime())) return false;
    const { start, end } = getReportPeriodBounds();
    return movementDate >= start && movementDate <= end;
  };

  const isSaleInReportPeriod = sale => {
    const saleDate = new Date(sale.createdAt);
    if (Number.isNaN(saleDate.getTime())) return false;
    const { start, end } = getReportPeriodBounds();
    return saleDate >= start && saleDate <= end;
  };

  const openReportDatePicker = () => {
    if (reportPeriod === 'custom') return;
    const input = reportDateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.focus();
      input.click();
    }
  };

  // Get date range based on selected period
  const getDateRange = () => {
    const selectedDate = getSelectedDate();
    const options = {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    };
    if (reportPeriod === 'custom') {
      const { start, end } = getReportPeriodBounds();
      const sameDay = start.toDateString() === end.toDateString();
      if (sameDay) return start.toLocaleDateString('en-US', options);
      return `${start.toLocaleDateString('en-US', options)} – ${end.toLocaleDateString('en-US', options)}`;
    }
    if (reportPeriod === 'daily') {
      return selectedDate.toLocaleDateString('en-US', options);
    } else if (reportPeriod === 'weekly') {
      const startOfWeek = new Date(selectedDate);
      startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      const startMonth = startOfWeek.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric'
      });
      const endMonth = endOfWeek.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      return `${startMonth} – ${endMonth}`;
    } else {
      return selectedDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
    }
  };

  const formatReportPeriodDate = date =>
    date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

  const getReportPeriodLabel = () => {
    if (isInventorySnapshotReport) return null;

    const { start, end } = getReportPeriodBounds();
    return `${formatReportPeriodDate(start)} – ${formatReportPeriodDate(end)}`;
  };

  // Period-based records use transaction dates so sales, purchases, and stock
  // movements appear in the business period when the activity actually happened.
  const reportMovements = (stockMovements || []).filter(isMovementInReportPeriod);
  const reportSalesTransactions = (salesTransactions || []).filter(isSaleInReportPeriod);
  const reportPurchaseTransactions = (purchaseTransactions || []).filter(purchase => {
    const purchaseDate = new Date(purchase.createdAt);
    if (Number.isNaN(purchaseDate.getTime())) return false;
    const { start, end } = getReportPeriodBounds();
    return purchaseDate >= start && purchaseDate <= end;
  });

  const getPurchaseItemNotes = purchase =>
    (purchase?.items || [])
      .map(item => String(item.categoryNote || item.category_note || '').trim())
      .filter(Boolean);

  const getPurchaseRemarksText = purchase =>
    String(purchase?.remarks || '').trim() || getPurchaseItemNotes(purchase).join('\n');

  const normalizeMovementName = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

  const getCurrentInventoryForMovement = movement =>
    inventory.find(item => String(item.id) === String(movement.inventoryId));

  const getMovementItemNameDetails = movement => {
    const historicalName = movement.itemName || 'Unknown item';
    const currentItem = getCurrentInventoryForMovement(movement);
    const currentName = currentItem?.name || '';
    const hasCurrentRename =
      currentName &&
      normalizeMovementName(currentName) !== normalizeMovementName(historicalName);

    return {
      historicalName,
      currentName: hasCurrentRename ? currentName : ''
    };
  };

  const formatMovementItemNameForExport = movement => {
    const { historicalName, currentName } = getMovementItemNameDetails(movement);
    return currentName ? `${historicalName} (Current name: ${currentName})` : historicalName;
  };

  const getReportLowStockThreshold = item =>
    Number(item?.activeLowStockThreshold ?? item?.reorderLevel ?? item?.lowStockThreshold ?? 0);

  const getNonNegativeReportNumber = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };

  // Suggested reorder points are derived from supplier lead time and sales
  // velocity when available. They support planning but do not replace the manual
  // low-stock threshold used for official stock-status badges.
  const getReportEstimatedReorderPoint = item => {
    const value = item?.recommendedReorderPoint;
    if (value !== null && value !== undefined && value !== '') {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }

    if (!String(item?.supplierName || '').trim()) return null;
    const averageDailySales = getNonNegativeReportNumber(item?.averageDailySales);
    const leadTimeDays = getNonNegativeReportNumber(item?.leadTimeDays);
    const safetyStock = getNonNegativeReportNumber(item?.safetyStock) ?? 0;

    if (leadTimeDays === null || leadTimeDays <= 0) return null;

    return Math.ceil(
      Math.max(0, averageDailySales ?? 0) * Math.max(0, leadTimeDays) +
      Math.max(0, safetyStock)
    );
  };

  const getReportSystemSuggestedPoint = item => {
    const manualThreshold = getReportLowStockThreshold(item);
    const calculatedPoint = getReportEstimatedReorderPoint(item);
    if (calculatedPoint !== null) {
      return Math.max(manualThreshold, calculatedPoint);
    }

    return manualThreshold;
  };

  const isSuggestedForReorderReview = item => {
    const quantity = Number(item?.quantity || 0);
    const manualThreshold = getReportLowStockThreshold(item);
    const suggestedPoint = getReportSystemSuggestedPoint(item);
    return (
      suggestedPoint > manualThreshold &&
      quantity > manualThreshold &&
      quantity <= suggestedPoint
    );
  };

  const formatSupplierLeadTime = item => {
    const days = Number(item?.leadTimeDays || 0);
    if (!Number.isFinite(days) || days <= 0) return 'Not set';
    return `${days} day${days === 1 ? '' : 's'}`;
  };

  const getSuggestedPointValue = item => getReportSystemSuggestedPoint(item);

  const getComputedReportStockStatus = item => {
    const quantity = Number(item?.quantity || 0);
    const threshold = getReportLowStockThreshold(item);
    if (quantity <= 0) return 'Out of Stock';
    return quantity <= threshold ? 'Low Stock' : 'In Stock';
  };

  const withComputedReportStockStatus = item => ({
    ...item,
    status: getComputedReportStockStatus(item),
    lowStockThreshold: getReportLowStockThreshold(item),
    estimatedReorderPoint: getReportEstimatedReorderPoint(item),
    systemSuggestedPoint: getReportSystemSuggestedPoint(item),
    reorderReviewSuggested: isSuggestedForReorderReview(item)
  });

  // Current inventory reports are snapshots, not period reports. Activity
  // reports below use the selected period separately.
  const computedReportInventory = inventory.map(withComputedReportStockStatus);
  const totalItems = computedReportInventory.length;
  const totalQuantity = computedReportInventory.reduce((sum, item) => sum + item.quantity, 0);
  const inStockItems = computedReportInventory.filter(item => item.status === 'In Stock').length;
  const lowStockItems = computedReportInventory.filter(item => item.status === 'Low Stock').length;
  const outOfStockItems = computedReportInventory.filter(item => item.status === 'Out of Stock').length;
  const attentionItems = lowStockItems + outOfStockItems;
  // Categories come from the current inventory snapshot so archived or old-only
  // transaction categories do not appear in live stock summaries.
  const categories = Array.from(new Set(computedReportInventory.map(item => item.category).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));

  const getFilteredInventory = () => {
    if (selectedCategory === 'all') return sortByNameAsc(computedReportInventory);
    return sortByNameAsc(linearSearchAll(computedReportInventory, item => item.category === selectedCategory));
  };

  // Low-stock reports prioritize out-of-stock items first, then low-stock items,
  // so restocking urgency is obvious during panel review.
  const getLowStockItems = () => {
    const restockItems = linearSearchAll(
      computedReportInventory,
      item =>
        (item.status === 'Out of Stock' || item.status === 'Low Stock') &&
        (selectedCategory === 'all' || item.category === selectedCategory)
    );
    return sortByQuantityAsc(restockItems).sort((a, b) => {
      const priority = {
        'Out of Stock': 0,
        'Low Stock': 1
      };
      return (priority[a.status] ?? 99) - (priority[b.status] ?? 99);
    });
  };

  const getDisplayItemCode = item => item?.itemCode || item?.id || 'N/A';

  const formatItemCount = value => `${Number(value || 0)} ${Number(value || 0) === 1 ? 'item' : 'items'}`;
  const formatUnitCount = value => `${Number(value || 0)} ${Number(value || 0) === 1 ? 'unit' : 'units'}`;
  const formatCurrency = value =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(Number(value || 0));

  const getReportScopeLabel = () =>
    isInventorySnapshotReport
      ? 'Current inventory snapshot'
      : `${reportPeriod.toUpperCase()} (${getDateRange()})`;

  const getReportTypeLabel = () =>
    (allowedReportTypes.find(option => option.value === reportType)?.label || reportType)
      .replace(/\s+/g, ' ')
      .trim();

  const normalizeReviewText = value =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}#./-]+/gu, ' ')
      .replace(/\s+/g, ' ');

  const getReviewTokens = value => normalizeReviewText(value).split(' ').filter(Boolean);

  // Manual/non-inventory sales can later be converted into tracked inventory.
  // Similarity checks keep that conversion from duplicating an existing item.
  const getBasicSimilarityScore = (left, right) => {
    const leftText = normalizeReviewText(left);
    const rightText = normalizeReviewText(right);
    if (!leftText || !rightText) return 0;
    if (leftText === rightText) return 1;
    if (leftText.includes(rightText) || rightText.includes(leftText)) return 0.86;

    const leftTokens = new Set(getReviewTokens(leftText));
    const rightTokens = new Set(getReviewTokens(rightText));
    if (!leftTokens.size || !rightTokens.size) return 0;

    const overlap = [...leftTokens].filter(token => rightTokens.has(token)).length;
    return overlap / Math.max(leftTokens.size, rightTokens.size);
  };

  const getPossibleInventoryMatches = (name, category) => {
    const normalizedName = normalizeReviewText(name);
    const normalizedCategory = normalizeReviewText(category || 'Other');
    if (!normalizedName) return { exact: [], similar: [] };

    return inventory.reduce((matches, item) => {
      const sameCategory = normalizeReviewText(item.category || 'Other') === normalizedCategory;
      const score = getBasicSimilarityScore(name, item.name);
      if (sameCategory && normalizeReviewText(item.name) === normalizedName) {
        matches.exact.push({ ...item, matchScore: 1 });
      } else if (sameCategory && score >= 0.58) {
        matches.similar.push({ ...item, matchScore: score });
      }
      return matches;
    }, { exact: [], similar: [] });
  };

  const conversionMatches = React.useMemo(
    () => getPossibleInventoryMatches(conversionDraft.name, conversionDraft.category),
    [conversionDraft.name, conversionDraft.category, inventory]
  );

  const openConvertUntrackedItemDialog = item => {
    if (!isAdminRole(user?.role)) {
      toast.info('Only Admin / Owner accounts can add reviewed manual items to Inventory.');
      return;
    }

    const suggestedPrice = item.totalQuantity > 0
      ? Number(item.totalSalesAmount / item.totalQuantity).toFixed(2)
      : '';

    setReviewItem(item);
    setConversionDraft({
      name: item.itemName || '',
      category: item.category || 'Other',
      supplierName: '',
      defaultSellingPrice: suggestedPrice,
      quantity: '',
      reorderLevel: '5'
    });
    setConversionSupplierMode('listed');
    setAcknowledgeSimilarItem(false);
  };

  const closeConvertUntrackedItemDialog = () => {
    if (isConvertingItem) return;
    setReviewItem(null);
    setConversionSupplierMode('listed');
    setAcknowledgeSimilarItem(false);
  };

  const updateConversionDraft = (field, value) => {
    setConversionDraft(prev => ({ ...prev, [field]: value }));
    if (field === 'name' || field === 'category') {
      setAcknowledgeSimilarItem(false);
    }
  };

  const updateConversionSupplierName = value => {
    const cleaned = sanitizeSupplierInput(value);
    if (cleaned !== value) {
      toast.warning('Supplier name accepts letters, numbers, and common business characters only.', {
        id: 'convert-supplier-valid-characters',
        duration: 2600
      });
    }
    updateConversionDraft('supplierName', cleaned);
  };

  const parseWholeNumber = value => {
    const normalized = String(value || '').trim();
    if (!/^\d+$/.test(normalized)) return null;
    return Number(normalized);
  };

  // Conversion creates a real inventory item from repeated non-inventory sales
  // after admin review, preserving an audit event that links the source report.
  const convertUntrackedItemToInventory = async () => {
    const cleanName = conversionDraft.name.trim().replace(/\s+/g, ' ');
    const cleanSupplier = conversionDraft.supplierName.trim().replace(/\s+/g, ' ');
    const quantity = parseWholeNumber(conversionDraft.quantity);
    const reorderLevel = parseWholeNumber(conversionDraft.reorderLevel);
    const price = Number(conversionDraft.defaultSellingPrice);

    if (!cleanName) {
      toast.error('Enter the item name before adding it to Inventory.');
      return;
    }
    if (!conversionDraft.category) {
      toast.error('Select a category for the inventory item.');
      return;
    }
    if (quantity === null || quantity < 0) {
      toast.error('Enter a valid beginning quantity.');
      return;
    }
    if (reorderLevel === null || reorderLevel < 0) {
      toast.error('Enter a valid low-stock threshold.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Enter a valid selling price greater than zero.');
      return;
    }

    if (conversionMatches.exact.length > 0) {
      toast.error('This item already exists in Inventory. Use the existing inventory record instead of creating a duplicate.');
      return;
    }

    if (conversionMatches.similar.length > 0 && !acknowledgeSimilarItem) {
      toast.warning('Review the similar inventory item first, then confirm only if this is a separate item.');
      return;
    }

    setIsConvertingItem(true);
    try {
      const addedItem = await addInventoryItem({
        name: cleanName,
        category: conversionDraft.category,
        supplierName: cleanSupplier,
        defaultSellingPrice: price,
        quantity,
        reorderLevel,
        allowSimilarDuplicate: acknowledgeSimilarItem
      });

      auditAction?.('CONVERT_NON_INVENTORY_ITEM', {
        targetName: cleanName,
        targetType: 'inventory_item',
        targetId: addedItem?.inventory_id || addedItem?.id,
        reason: 'Reviewed untracked sales item and added it to inventory.',
        details: {
          source: 'Untracked Sales Items report',
          originalName: reviewItem?.itemName,
          category: conversionDraft.category,
          totalQuantitySold: reviewItem?.totalQuantity,
          totalSalesAmount: reviewItem?.totalSalesAmount,
          timesSold: reviewItem?.timesSold,
          beginningQuantity: quantity,
          defaultSellingPrice: price,
          lowStockThreshold: reorderLevel
        }
      });

      toast.success('Non-inventory item added to Inventory for future tracking.');
      setReviewItem(null);
      setAcknowledgeSimilarItem(false);
    } catch (err) {
      const message = err?.response?.data?.error || err.message || 'Failed to add item to Inventory.';
      toast.error(message);
    } finally {
      setIsConvertingItem(false);
    }
  };

  const isTrackedSalesItem = item =>
    item?.isInventoryItem !== false &&
    item?.itemType !== 'non_inventory' &&
    (item?.inventoryId || item?.productId);

  const getTrackedSaleItemsForReport = sale =>
    (sale.items || []).filter(item =>
      isTrackedSalesItem(item) &&
      (selectedCategory === 'all' || item.category === selectedCategory)
    );

  const getSaleSubtotalForCategory = (sale, { trackedOnly = false } = {}) => {
    const items = trackedOnly ? getTrackedSaleItemsForReport(sale) : (sale.items || []);
    if (selectedCategory === 'all') {
      return items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    }
    return items
      .filter(item => item.category === selectedCategory)
      .reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  };

  const getSalesTransactionsForBounds = ({ start, end }) =>
    (salesTransactions || []).filter(sale => {
      const saleDate = new Date(sale.createdAt);
      if (Number.isNaN(saleDate.getTime()) || saleDate < start || saleDate > end) return false;
      if (sale.status === 'cancelled') return false;
      if (selectedCategory === 'all') return true;
      return (sale.items || []).some(item => item.category === selectedCategory);
    });

  const getFilteredSalesTransactions = () =>
    getSalesTransactionsForBounds(getReportPeriodBounds());

  const getSalesMovementRows = () =>
    getFilteredSalesTransactions().flatMap(sale =>
      getTrackedSaleItemsForReport(sale)
        .map(item => ({
          id: `${sale.id}-${item.id}`,
          invoiceNumber: sale.officialInvoiceNumber || sale.referenceOfficialInvoiceNumber || sale.salesNumber,
          salesNumber: sale.salesNumber,
          createdAt: sale.createdAt,
          encodedAt: sale.encodedAt,
          backdateReason: sale.backdateReason,
          inventoryId: item.inventoryId,
          productId: item.productId,
          itemName: item.itemName,
          category: item.category,
          branch: item.branch || sale.branch,
          action: 'stock_out',
          reason: 'sales',
          quantityChanged: Number(item.quantitySold || 0),
          previousQuantity: Number(item.previousQuantity || 0),
          newQuantity: Number(item.newQuantity || 0),
          actorName: sale.soldByName || 'System',
          paymentMethod: sale.paymentMethod,
          saleStatus: sale.status
        }))
    ).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const getSalesMovementUnits = () =>
    getSalesMovementRows().reduce((sum, movement) => sum + Number(movement.quantityChanged || 0), 0);

  const getSalesFinancialSummary = (sourceSales = getFilteredSalesTransactions()) => {
    const sales = sourceSales.filter(sale => getTrackedSaleItemsForReport(sale).length > 0);

    return sales.reduce((summary, sale) => {
      const saleSubtotal = Number(sale.subtotalAmount ?? sale.totalAmount ?? 0);
      const includedSubtotal = getSaleSubtotalForCategory(sale, { trackedOnly: true });
      if (includedSubtotal <= 0) return summary;

      const discountAmount = Number(sale.discountAmount || 0);
      const discountShare = saleSubtotal <= 0
        ? 0
        : Number(((includedSubtotal / saleSubtotal) * discountAmount).toFixed(2));
      const deliveryCharge = selectedCategory === 'all' ? Number(sale.deliveryCharge || 0) : 0;
      const amountDue = Math.max(includedSubtotal - discountShare, 0) + deliveryCharge;

      summary.transactionCount += 1;
      summary.subtotal += includedSubtotal;
      summary.discount += discountShare;
      summary.deliveryCharge += deliveryCharge;
      summary.amountDue += amountDue;
      if (sale.paymentMethod === 'cash') {
        summary.cashTransactions += 1;
      } else if (sale.paymentMethod) {
        summary.nonCashTransactions += 1;
      }
      return summary;
    }, {
      transactionCount: 0,
      subtotal: 0,
      discount: 0,
      deliveryCharge: 0,
      amountDue: 0,
      cashTransactions: 0,
      nonCashTransactions: 0
    });
  };

  const getSalesUnitsForTransactions = (sourceSales = getFilteredSalesTransactions()) =>
    sourceSales.reduce((sum, sale) => (
      sum + getTrackedSaleItemsForReport(sale).reduce((itemSum, item) => (
        itemSum + Number(item.quantitySold || item.quantity || 0)
      ), 0)
    ), 0);

  const getSalesComparisonSummary = () => {
    const currentSales = getFilteredSalesTransactions();
    const previousSales = getSalesTransactionsForBounds(getPreviousReportPeriodBounds());
    const currentFinancials = getSalesFinancialSummary(currentSales);
    const previousFinancials = getSalesFinancialSummary(previousSales);

    return {
      current: {
        amountDue: currentFinancials.amountDue,
        transactions: currentFinancials.transactionCount,
        unitsSold: getSalesUnitsForTransactions(currentSales)
      },
      previous: {
        amountDue: previousFinancials.amountDue,
        transactions: previousFinancials.transactionCount,
        unitsSold: getSalesUnitsForTransactions(previousSales)
      }
    };
  };

  const formatCompactComparisonDate = date =>
    date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

  const formatCompactComparisonRange = ({ start, end }) => {
    if (start.toDateString() === end.toDateString()) {
      return formatCompactComparisonDate(start);
    }

    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    if (sameMonth) {
      return `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
    }

    const sameYear = start.getFullYear() === end.getFullYear();
    if (sameYear) {
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${end.getFullYear()}`;
    }

    return `${formatCompactComparisonDate(start)}–${formatCompactComparisonDate(end)}`;
  };

  const getInclusivePeriodDays = ({ start, end }) => {
    const startDay = new Date(start);
    const endDay = new Date(end);
    startDay.setHours(0, 0, 0, 0);
    endDay.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / 86400000) + 1);
  };

  const getPreviousPeriodLabel = () => {
    if (reportPeriod === 'custom') {
      return formatCompactComparisonRange(getPreviousReportPeriodBounds());
    }

    return {
      daily: 'previous day',
      weekly: 'previous week',
      monthly: 'previous month'
    }[reportPeriod] || 'previous period';
  };

  const getComparisonSummaryDescription = () => {
    if (reportPeriod !== 'custom') {
      return 'Compares this report period with the previous period for quick business review.';
    }

    const currentBounds = getReportPeriodBounds();
    const previousBounds = getPreviousReportPeriodBounds();
    const dayCount = getInclusivePeriodDays(currentBounds);
    return `Selected: ${formatCompactComparisonRange(currentBounds)}. Compared with the previous ${dayCount} ${dayCount === 1 ? 'day' : 'days'}: ${formatCompactComparisonRange(previousBounds)}.`;
  };

  const formatReportComparison = (current, previous, {
    percentage = true,
    emptyLabel = 'No activity',
    unitSingular = 'item',
    unitPlural = 'items'
  } = {}) => {
    const safeCurrent = Number(current || 0);
    const safePrevious = Number(previous || 0);
    const previousLabel = getPreviousPeriodLabel();

    if (safePrevious <= 0 && safeCurrent <= 0) {
      return { direction: 'neutral', label: `${emptyLabel} in ${previousLabel}` };
    }
    if (safePrevious <= 0) {
      return { direction: 'up', label: `New activity compared with ${previousLabel}` };
    }

    const difference = safeCurrent - safePrevious;
    if (difference === 0) {
      return { direction: 'neutral', label: `No change compared with ${previousLabel}` };
    }

    if (percentage) {
      const percentageChange = formatPercentage(Math.abs((difference / safePrevious) * 100));
      return {
        direction: difference > 0 ? 'up' : 'down',
        label: `${difference > 0 ? 'Up' : 'Down'} ${percentageChange} compared with ${previousLabel}`
      };
    }

    const absoluteDifference = Math.abs(difference);
    const unitLabel = absoluteDifference === 1 ? unitSingular : unitPlural;
    return {
      direction: difference > 0 ? 'up' : 'down',
      label: `${difference > 0 ? 'Up' : 'Down'} ${absoluteDifference.toLocaleString()} ${unitLabel} compared with ${previousLabel}`
    };
  };

  // Aggregates tracked sales lines into management-friendly product rankings.
  const getTopSellingProducts = (limit = 10) => {
    const groupedProducts = new Map();

    getFilteredSalesTransactions().forEach(sale => {
      getTrackedSaleItemsForReport(sale).forEach(item => {
        const quantity = Number(item.quantitySold || item.quantity || 0);
        const revenue = Number(item.subtotal || 0);
        const itemName = String(item.itemName || item.name || '').trim();
        if (!itemName || quantity <= 0) return;

        const key = item.inventoryId
          ? `inventory:${item.inventoryId}`
          : `product:${item.productId || `${itemName.toLowerCase()}|${String(item.category || 'Other').toLowerCase()}`}`;
        const existing = groupedProducts.get(key) || {
          itemName,
          category: item.category || 'Other',
          quantitySold: 0,
          revenue: 0
        };
        existing.quantitySold += quantity;
        existing.revenue += revenue;
        groupedProducts.set(key, existing);
      });
    });

    const allRankedProducts = Array.from(groupedProducts.values())
      .sort((a, b) => b.quantitySold - a.quantitySold || b.revenue - a.revenue || a.itemName.localeCompare(b.itemName));
    const totalRevenue = allRankedProducts.reduce((sum, item) => sum + Number(item.revenue || 0), 0);

    return allRankedProducts.slice(0, limit).map((item, index) => ({
      ...item,
      rank: index + 1,
      revenueShare: totalRevenue > 0 ? (Number(item.revenue || 0) / totalRevenue) * 100 : 0
    }));
  };

  const getEarningsSalesTransactions = () =>
    getFilteredSalesTransactions().filter(sale => sale.status === 'completed');

  // Actual earnings reports use sold-item cost snapshots captured at sale time,
  // so later inventory cost edits do not rewrite historical profit.
  const getEarningsSummary = () =>
    getProfitabilitySummary(getEarningsSalesTransactions());

  const getEarningsProductRows = (limit = 12) =>
    getProductProfitability(getEarningsSalesTransactions())
      .filter(item => selectedCategory === 'all' || item.category === selectedCategory)
      .slice(0, limit)
      .map((item, index) => ({
        ...item,
        rank: index + 1
      }));

  const formatPercentage = value =>
    `${Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    })}%`;

  const getFilteredPurchaseTransactions = () =>
    reportPurchaseTransactions.filter(purchase => purchase.status !== 'cancelled');

  const getPurchaseSummary = () =>
    getFilteredPurchaseTransactions().reduce((summary, purchase) => {
      summary.entryCount += 1;
      summary.totalAmount += Number(purchase.subtotalAmount || 0);
      summary.totalQuantity += Number(purchase.totalQuantity || 0);
      return summary;
    }, {
      entryCount: 0,
      totalAmount: 0,
      totalQuantity: 0
    });

  // Supplier reorder rows include both urgent manual-threshold shortages and
  // planning suggestions where supplier lead time indicates a future risk.
  const getSupplierReorderItems = () =>
    sortByQuantityAsc(inventory.map(withComputedReportStockStatus).filter(item =>
      item.status === 'Out of Stock' ||
      item.status === 'Low Stock' ||
      item.reorderReviewSuggested
    ))
      .filter(item => selectedCategory === 'all' || item.category === selectedCategory)
      .map(item => {
        const suggestedPoint = getReportSystemSuggestedPoint(item);
        return {
          ...item,
          lowStockThreshold: getReportLowStockThreshold(item),
          reorderReviewPoint: suggestedPoint,
          neededQuantity: Math.max(
            suggestedPoint - Number(item.quantity || 0),
            0
          ),
          reorderReviewLabel: item.reorderReviewSuggested ? 'For Review' : item.status
        };
      });

  const getReorderQuantityDraftKey = item => String(item?.id ?? item?.inventoryId ?? item?.itemCode ?? item?.name ?? '');

  const isReorderItemSelected = item => reorderSelections[getReorderQuantityDraftKey(item)] !== false;

  const getSelectedReorderItems = group =>
    (group?.items || []).filter(item => isReorderItemSelected(item) && getPreparedReorderQuantity(item) > 0);

  const setGroupReorderSelection = (group, selected) => {
    setReorderSelections(prev => {
      const next = { ...prev };
      (group?.items || []).forEach(item => {
        next[getReorderQuantityDraftKey(item)] = selected;
      });
      return next;
    });
  };

  const toggleReorderItemSelection = item => {
    const key = getReorderQuantityDraftKey(item);
    setReorderSelections(prev => ({
      ...prev,
      [key]: prev[key] === false
    }));
  };

  const getPreparedReorderQuantity = item => {
    const key = getReorderQuantityDraftKey(item);
    const draftValue = reorderQuantities[key];
    if (draftValue === undefined || draftValue === null || draftValue === '') {
      return Number(item?.neededQuantity || 0);
    }
    return Number(draftValue || 0);
  };

  const updatePreparedReorderQuantity = (item, value) => {
    const key = getReorderQuantityDraftKey(item);
    const cleaned = String(value ?? '').replace(/\D/g, '').slice(0, 6);
    setReorderQuantities(prev => ({
      ...prev,
      [key]: cleaned
    }));
  };

  const getAllSupplierReorderGroups = () => {
    const groups = getSupplierReorderItems().reduce((acc, item) => {
      const supplier = item.supplierName?.trim() || 'Unassigned Supplier';
      if (!acc[supplier]) {
        acc[supplier] = {
          supplier,
          itemCount: 0,
          outOfStock: 0,
          lowStock: 0,
          reviewSuggested: 0,
          neededQuantity: 0,
          items: []
        };
      }

      acc[supplier].itemCount += 1;
      acc[supplier].outOfStock += item.status === 'Out of Stock' ? 1 : 0;
      acc[supplier].lowStock += item.status === 'Low Stock' ? 1 : 0;
      acc[supplier].reviewSuggested += item.reorderReviewSuggested ? 1 : 0;
      acc[supplier].neededQuantity += item.neededQuantity;
      acc[supplier].items.push(item);
      return acc;
    }, {});

    return Object.values(groups).sort((a, b) => {
      if (b.outOfStock !== a.outOfStock) return b.outOfStock - a.outOfStock;
      return a.supplier.localeCompare(b.supplier);
    });
  };

  const getSupplierReorderGroups = () => {
    const groups = getAllSupplierReorderGroups();
    if (!selectedReorderSupplier) return [];
    return groups.filter(group => group.supplier === selectedReorderSupplier);
  };

  const getSelectedSupplierReorderGroup = () => getSupplierReorderGroups()[0] || null;

  // Preparing a purchase draft hands selected reorder quantities to Purchases.
  // The draft remains non-official until staff confirms supplier receiving.
  const handleGeneratePurchaseDraft = group => {
    const selectedItems = getSelectedReorderItems(group);
    const purchaseDraft = buildPurchaseDraftFromReorderGroup({
      supplier: group?.supplier,
      items: selectedItems,
      getPreparedQuantity: getPreparedReorderQuantity,
      branch: user?.branch,
      user,
    });

    if (!purchaseDraft.supplierName || purchaseDraft.items.length === 0) {
      toast.warning('No purchase draft was created.', {
        description: 'Select at least one reorder item with a quantity greater than zero.'
      });
      return;
    }

    savePurchaseDraft(purchaseDraft);
    toast.success('Purchase draft prepared.', {
      description: `${purchaseDraft.items.length} item${purchaseDraft.items.length === 1 ? '' : 's'} from ${purchaseDraft.supplierName} are ready in Purchases.`
    });
    onNavigate?.('purchases');
  };

  useEffect(() => {
    if (reportType !== 'supplier-reorder') return;
    const groups = getAllSupplierReorderGroups();
    if (groups.length === 0) {
      if (selectedReorderSupplier) setSelectedReorderSupplier('');
      return;
    }
    if (!groups.some(group => group.supplier === selectedReorderSupplier)) {
      setSelectedReorderSupplier(groups[0].supplier);
    }
  }, [inventory, selectedCategory, reportType, selectedReorderSupplier]);

  // Keep editable reorder quantities synchronized with current recommendations,
  // while preserving user edits unless the old value was still the prior default.
  useEffect(() => {
    const reorderItems = getSupplierReorderItems();
    setReorderQuantities(prev => {
      let changed = false;
      const next = { ...prev };
      const nextDefaults = { ...reorderQuantityDefaultsRef.current };
      const activeKeys = new Set();
      reorderItems.forEach(item => {
        const key = getReorderQuantityDraftKey(item);
        if (!key) return;
        activeKeys.add(key);

        const suggestedQuantity = String(item.neededQuantity || 0);
        const previousDefault = nextDefaults[key];
        const currentQuantity = next[key];
        const currentNumber = Number(currentQuantity || 0);
        const suggestedNumber = Number(item.neededQuantity || 0);
        const shouldUseSuggestedQuantity =
          currentQuantity === undefined ||
          currentQuantity === null ||
          currentQuantity === '' ||
          currentQuantity === previousDefault ||
          (currentNumber <= 0 && suggestedNumber > 0);

        if (shouldUseSuggestedQuantity && currentQuantity !== suggestedQuantity) {
          next[key] = suggestedQuantity;
          changed = true;
        }

        nextDefaults[key] = suggestedQuantity;
      });

      Object.keys(nextDefaults).forEach(key => {
        if (!activeKeys.has(key)) delete nextDefaults[key];
      });

      reorderQuantityDefaultsRef.current = nextDefaults;
      return changed ? next : prev;
    });
  }, [inventory, selectedCategory]);

  const getActiveInventoryMatchForManualItem = (itemName, category) => {
    const normalizedName = normalizeReviewText(itemName);
    const normalizedCategory = normalizeReviewText(category || 'Other');
    if (!normalizedName) return null;
    return inventory.find(item =>
      normalizeReviewText(item.name) === normalizedName &&
      normalizeReviewText(item.category || 'Other') === normalizedCategory
    ) || null;
  };

  const getUntrackedSalesItems = () => {
    const grouped = getFilteredSalesTransactions()
      .flatMap(sale => (sale.items || []).map(item => ({ ...item, sale })))
      .filter(item => item.isInventoryItem === false || item.itemType === 'non_inventory')
      .reduce((acc, item) => {
        const key = `${String(item.itemName || '').trim().toLowerCase()}|${String(item.category || 'Other').trim().toLowerCase()}`;
        if (!acc[key]) {
          acc[key] = {
            itemName: item.itemName || 'Non-inventory item',
            category: item.category || 'Other',
            totalQuantity: 0,
            totalSalesAmount: 0,
            timesSold: 0,
            lastSoldAt: item.sale.createdAt
          };
        }

        acc[key].totalQuantity += Number(item.quantitySold || 0);
        acc[key].totalSalesAmount += Number(item.subtotal || 0);
        acc[key].timesSold += 1;
        if (new Date(item.sale.createdAt || 0) > new Date(acc[key].lastSoldAt || 0)) {
          acc[key].lastSoldAt = item.sale.createdAt;
        }
        return acc;
      }, {});

    return Object.values(grouped)
      .map(item => {
        const activeInventoryMatch = getActiveInventoryMatchForManualItem(item.itemName, item.category);
        return {
          ...item,
          activeInventoryMatch,
          reviewStatus: activeInventoryMatch ? 'tracked' : 'needs_review'
        };
      })
      .sort((a, b) => b.totalSalesAmount - a.totalSalesAmount || a.itemName.localeCompare(b.itemName));
  };

  const getReportMetrics = () => {
    if (reportType === 'movements' || reportType === 'sales-movements') {
      const movementSummary = getStockMovementSummary();
      if (reportType === 'sales-movements') {
        return [
          { label: 'Quantity Sold', value: getSalesMovementUnits(), icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
          { label: 'Amount Due', value: formatCurrency(getSalesFinancialSummary().amountDue), icon: <Wallet className="w-8 h-8 text-amber-500" />, color: 'border-l-amber-500' },
          { label: 'Discounts', value: formatCurrency(getSalesFinancialSummary().discount), icon: <Tag className="w-8 h-8 text-violet-500" />, color: 'border-l-violet-500' },
        ];
      }

      return [
        { label: 'Stock In Units', value: movementSummary.stockInUnits, icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
        { label: 'Stock Out Units', value: movementSummary.stockOutUnits, icon: <AlertTriangle className="w-8 h-8 text-red-500" />, color: movementSummary.stockOutUnits > 0 ? 'border-l-red-500' : 'border-l-slate-300' },
      ];
    }

    if (reportType === 'purchases') {
      return [
        { label: 'Quantity Received', value: getPurchaseSummary().totalQuantity, icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
        { label: 'Total Purchases', value: formatCurrency(getPurchaseSummary().totalAmount), icon: <Wallet className="w-8 h-8 text-amber-500" />, color: 'border-l-amber-500' },
        { label: 'Suppliers', value: new Set(getFilteredPurchaseTransactions().map(purchase => purchase.supplierName)).size, icon: <Package className="w-8 h-8 text-violet-500" />, color: 'border-l-violet-500' },
      ];
    }

    if (reportType === 'actual-earnings') {
      const earnings = getEarningsSummary();
      return [
        { label: 'Total Sales', value: formatCurrency(earnings.totalSales), icon: <Wallet className="w-8 h-8 text-blue-500" />, color: 'border-l-blue-500' },
        { label: 'Cost of Goods Sold', value: formatCurrency(earnings.puhunanUsed), icon: <Package className="w-8 h-8 text-amber-500" />, color: 'border-l-amber-500' },
        { label: 'Actual Profit', value: formatCurrency(earnings.actualProfit), icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: earnings.actualProfit >= 0 ? 'border-l-green-500' : 'border-l-red-500' },
        { label: 'Profit Margin', value: formatPercentage(earnings.profitMargin), icon: <Tag className="w-8 h-8 text-violet-500" />, color: 'border-l-violet-500' },
      ];
    }

    if (reportType === 'supplier-reorder') {
      const selectedGroup = getSelectedSupplierReorderGroup();
      const reorderItems = selectedGroup?.items || [];
      const selectedItems = getSelectedReorderItems(selectedGroup);
      const preparedQuantity = selectedItems.reduce((sum, item) => sum + getPreparedReorderQuantity(item), 0);
      return [
        { label: 'Suggested Qty', value: reorderItems.reduce((sum, item) => sum + Number(item.neededQuantity || 0), 0), icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
        { label: 'Final Order Qty', value: preparedQuantity, icon: <PackagePlus className="w-8 h-8 text-violet-500" />, color: 'border-l-violet-500' },
      ];
    }

    if (reportType === 'untracked-sales') {
      const untrackedItems = getUntrackedSalesItems();
      return [
        { label: 'Qty Sold', value: untrackedItems.reduce((sum, item) => sum + Number(item.totalQuantity || 0), 0), icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
        { label: 'Manual Sales', value: formatCurrency(untrackedItems.reduce((sum, item) => sum + Number(item.totalSalesAmount || 0), 0)), icon: <Wallet className="w-8 h-8 text-amber-500" />, color: 'border-l-amber-500' },
        { label: 'Repeat Items', value: untrackedItems.filter(item => Number(item.timesSold || 0) > 1).length, icon: <PackagePlus className="w-8 h-8 text-violet-500" />, color: 'border-l-violet-500' },
      ];
    }

    if (reportType === 'low-stock') {
      const lowStockRows = getLowStockItems();
      return [
        { label: 'Out of Stock', value: lowStockRows.filter(item => item.status === 'Out of Stock').length, icon: <Package className="w-8 h-8 text-rose-500" />, color: 'border-l-rose-500' },
        { label: 'Low Stock', value: lowStockRows.filter(item => item.status === 'Low Stock').length, icon: <TrendingUp className="w-8 h-8 text-amber-500" />, color: 'border-l-amber-500' },
      ];
    }

    if (reportType === 'detailed') {
      const filtered = getFilteredInventory();
      return [
        { label: 'Displayed Units', value: filtered.reduce((sum, item) => sum + Number(item.quantity || 0), 0), icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
        { label: 'Needs Attention', value: filtered.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock').length, icon: <AlertTriangle className="w-8 h-8 text-red-500" />, color: filtered.some(item => item.status === 'Low Stock' || item.status === 'Out of Stock') ? 'border-l-red-500' : 'border-l-slate-300' },
      ];
    }

    if (reportType === 'category') {
      return [
        { label: 'Stock Needs Attention', value: attentionItems, icon: <AlertTriangle className="w-8 h-8 text-red-500" />, color: attentionItems > 0 ? 'border-l-red-500' : 'border-l-slate-300' },
      ];
    }

    return [
      { label: 'Total Items', value: totalItems, icon: <Package className="w-8 h-8 text-blue-500" />, color: 'border-l-blue-500' },
      { label: 'Total Units', value: totalQuantity, icon: <TrendingUp className="w-8 h-8 text-green-500" />, color: 'border-l-green-500' },
      { label: 'Stock Needs Attention', value: attentionItems, icon: <AlertTriangle className="w-8 h-8 text-red-500" />, color: attentionItems > 0 ? 'border-l-red-500' : 'border-l-slate-300' },
    ];
  };

  // Get category summary
  const getCategorySummary = () => {
    const summary = categories.map(category => {
      const categoryItems = computedReportInventory.filter(item => item.category === category);
      const totalQty = categoryItems.reduce((sum, item) => sum + item.quantity, 0);
      const itemCount = categoryItems.length;
      const lowStock = categoryItems.filter(item => item.status === 'Low Stock').length;
      const outOfStock = categoryItems.filter(item => item.status === 'Out of Stock').length;
      return {
        category,
        itemCount,
        totalQty,
        lowStock,
        outOfStock
      };
    });
    return summary;
  };

  // Generate PDF Report
  const generatePDF = (options = {}) => {
    if (!canAccessReportType(user?.role, reportType)) {
      toast.error('This report is not available for your current role.');
      return;
    }
    const isMovementPdfReport = reportType === 'movements' || reportType === 'sales-movements';
    const isSalesDeductionsOnlyExport = reportType === 'sales-movements' && options.scope === 'deductions-only';
    const doc = new jsPDF({
      orientation: isMovementPdfReport ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    const pdfMargin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageCenter = pageWidth / 2;
    const pageRight = pageWidth - pdfMargin;
    const normalizePdfText = value =>
      String(value ?? '')
        .replace(/₱/g, 'PHP ')
        .replace(/₱/g, 'PHP ')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const normalizePdfCell = value => Array.isArray(value)
      ? value.map(normalizePdfCell)
      : normalizePdfText(value);
    const getPdfColumnAlignment = headerText => {
      const header = normalizePdfText(headerText).toLowerCase();
      if (
        ['id', 'item code', 'movement id', 'sale no.', 'purchase no.', 'qty', 'qty sold', 'quantity', 'items', 'total units', 'low stock', 'out of stock', 'current', 'threshold', 'manual', 'manual limit', 'est. point', 'suggest point', 'suggested', 'suggested qty', 'suggest qty', 'reorder qty', 'order qty', 'lead time', 'qty needed', 'times sold', 'before', 'after'].includes(header)
      ) {
        return 'center';
      }
      if (
        ['supplier', 'date', 'last updated', 'last sold', 'category', 'document', 'terms', 'status', 'action', 'payment'].includes(header)
      ) {
        return 'center';
      }
      if (['total', 'total sales', 'sales amount', 'amount due'].includes(header)) {
        return 'center';
      }
      return 'left';
    };
    const originalDocText = doc.text.bind(doc);
    doc.text = (text, ...args) => {
      if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
      return originalDocText(normalizePdfCell(text), ...args);
    };
    const reportTable = options => {
      if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
      autoTable(doc, {
        ...options,
        margin: {
          left: pdfMargin,
          right: pdfMargin,
          ...(options.margin || {})
        },
        tableWidth: options.tableWidth || 'auto',
        head: normalizePdfCell(options.head || []),
        body: normalizePdfCell(options.body || []),
        styles: {
          font: 'helvetica',
          fontStyle: 'normal',
          overflow: 'linebreak',
          minCellHeight: 6,
          valign: 'middle',
          ...(options.styles || {}),
          cellPadding: {
            top: 1.5,
            right: 2,
            bottom: 1.5,
            left: 2
          }
        },
        headStyles: {
          font: 'helvetica',
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          overflow: 'visible',
          cellPadding: {
            top: 1.4,
            right: 1,
            bottom: 1.4,
            left: 1
          },
          ...(options.headStyles || {})
        },
        didParseCell: data => {
          if (data.cell?.text) data.cell.text = normalizePdfCell(data.cell.text);
          const columnHeader = options.head?.[0]?.[data.column.index] || '';
          if (data.section === 'body') {
            data.cell.styles.halign = getPdfColumnAlignment(columnHeader);
            data.cell.styles.valign = 'middle';
          }
          if (data.section === 'head') {
            data.cell.styles.halign = 'center';
            data.cell.styles.valign = 'middle';
          }
          options.didParseCell?.(data);
        },
        willDrawCell: data => {
          if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
          options.willDrawCell?.(data);
        }
      });
    };
    const drawLabelValue = (label, value, x, y, options = {}) => {
      const fontSize = options.fontSize || 10;
      const labelText = normalizePdfText(`${label}:`);
      const valueText = normalizePdfText(value);
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'bold');
      doc.text(labelText, x, y);
      const valueX = x + doc.getTextWidth(labelText) + 1.3;
      doc.setFont('helvetica', 'normal');
      doc.text(valueText, valueX, y);
    };
    const drawLabelValueSegments = (segments, x, y, options = {}) => {
      const fontSize = options.fontSize || 10;
      let cursorX = x;
      doc.setFontSize(fontSize);
      segments.forEach((segment, index) => {
        const labelText = normalizePdfText(`${segment.label}:`);
        const valueText = normalizePdfText(segment.value);
        doc.setFont('helvetica', 'bold');
        doc.text(labelText, cursorX, y);
        cursorX += doc.getTextWidth(labelText) + 1.3;
        doc.setFont('helvetica', 'normal');
        doc.text(valueText, cursorX, y);
        cursorX += doc.getTextWidth(valueText);
        if (index < segments.length - 1) {
          cursorX += 2.6;
          const separator = '|';
          doc.text(separator, cursorX, y);
          cursorX += doc.getTextWidth(separator) + 2.6;
        }
      });
    };
    const currentDate = new Date().toLocaleDateString();
    const currentTime = new Date().toLocaleTimeString();

    // Set document properties
    doc.setProperties({
      title: `EMC ${reportType.toUpperCase()} Report`,
      subject: 'Inventory Management Report',
      author: user.fullName,
      creator: 'E.M. Cayetano Trading Inventory System'
    });

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('E.M. CAYETANO TRADING', pageCenter, 20, {
      align: 'center'
    });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('INVENTORY MANAGEMENT SYSTEM', pageCenter, 28, {
      align: 'center'
    });

    // Add line separator
    doc.setLineWidth(0.5);
    doc.line(pdfMargin, 32, pageRight, 32);

    let startY = 42;
    if (reportType !== 'supplier-reorder') {
      const reportPeriodLabel = getReportPeriodLabel();
      // Report Info
      doc.setFontSize(10);
      drawLabelValue('Report Type', getReportTypeLabel(), pdfMargin, 40);
      let reportInfoY = 46;
      if (reportPeriodLabel) {
        drawLabelValue('Report Period', reportPeriodLabel, pdfMargin, reportInfoY);
        reportInfoY += 6;
      }
      drawLabelValue('Generated', `${currentDate} ${currentTime}`, pdfMargin, reportInfoY);
      drawLabelValue('Branch', user.branch, pdfMargin, reportInfoY + 6);
      drawLabelValue('Generated by', user.fullName, pdfMargin, reportInfoY + 12);
      const separatorY = reportInfoY + 16;
      doc.line(pdfMargin, separatorY, pageRight, separatorY);
      startY = separatorY + 8;
    }
    if (reportType === 'summary') {
      // Summary Statistics
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('INVENTORY SUMMARY', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      drawLabelValue('Total Items', totalItems, 20, startY + 8);
      drawLabelValue('Total Units in Stock', totalQuantity, 20, startY + 14);
      drawLabelValue('In Stock', inStockItems, 20, startY + 20);
      drawLabelValue('Low Stock', lowStockItems, 20, startY + 26);
      drawLabelValue('Out of Stock', outOfStockItems, 20, startY + 32);

      // Category Breakdown Table
      doc.setFont('helvetica', 'bold');
      doc.text('CATEGORY BREAKDOWN', 20, startY + 45);
      const categoryData = getCategorySummary().map(cat => [cat.category, cat.itemCount.toString(), cat.totalQty.toString(), cat.lowStock.toString(), cat.outOfStock.toString()]);
      reportTable({
        startY: startY + 50,
        head: [['Category', 'Items', 'Total Units', 'Low Stock', 'Out of Stock']],
        body: categoryData,
        theme: 'striped',
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: 255,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 9,
          cellPadding: 3
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        }
      });
    } else if (reportType === 'detailed') {
      const items = getFilteredInventory();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('DETAILED INVENTORY REPORT', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      drawLabelValue('Category Filter', selectedCategory === 'all' ? 'All Categories' : selectedCategory, 20, startY + 8);
      drawLabelValue('Total Items', items.length, 20, startY + 14);
      const itemData = items.map(item => [getDisplayItemCode(item), item.name, getCategoryDisplay(item), item.supplierName || 'Unassigned', item.quantity.toString(), item.status, formatDateTime(item.lastUpdated)]);
      reportTable({
        startY: startY + 20,
        head: [['Item Code', 'Item Name', 'Category', 'Supplier', 'Quantity', 'Status', 'Last Updated']],
        body: itemData,
        theme: 'striped',
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: 255,
          fontStyle: 'bold'
        },
        styles: {
          fontSize: 7,
          cellPadding: 1.6
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: {
            cellWidth: 22
          },
          1: {
            cellWidth: 45
          },
          2: {
            cellWidth: 24
          },
          3: {
            cellWidth: 27
          },
          4: {
            cellWidth: 14
          },
          5: {
            cellWidth: 17
          },
          6: {
            cellWidth: 21
          }
        }
      });
    } else if (reportType === 'low-stock') {
      const lowStockList = getLowStockItems();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('LOW STOCK ALERT REPORT', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      drawLabelValue('Restocking Attention Items', lowStockList.length, 20, startY + 8);
      if (lowStockList.length === 0) {
        doc.text('No low stock or out-of-stock items found for this report period.', 20, startY + 20);
      } else {
        const itemData = lowStockList.map(item => [getDisplayItemCode(item), item.name, getCategoryDisplay(item), item.supplierName || 'Unassigned', item.quantity.toString(), item.status, formatDateTime(item.lastUpdated)]);
        reportTable({
          startY: startY + 15,
          head: [['Item Code', 'Item Name', 'Category', 'Supplier', 'Quantity', 'Status', 'Last Updated']],
          body: itemData,
          theme: 'striped',
          headStyles: {
            fillColor: [220, 38, 38],
            textColor: 255,
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 7,
            cellPadding: 1.6
          },
          alternateRowStyles: {
            fillColor: [254, 242, 242]
          },
          columnStyles: {
            0: {
              cellWidth: 22
            },
            1: {
              cellWidth: 45
            },
            2: {
              cellWidth: 24
            },
            3: {
              cellWidth: 27
            },
            4: {
              cellWidth: 14
            },
            5: {
              cellWidth: 17
            },
            6: {
              cellWidth: 21
            }
          }
        });
      }
    } else if (reportType === 'supplier-reorder') {
      const supplierGroups = getSupplierReorderGroups();
      const supplierName = selectedReorderSupplier || (supplierGroups.length === 1 ? supplierGroups[0].supplier : 'All Suppliers');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('SUPPLIER REORDER LIST', 20, startY);
      doc.setFontSize(11);
      drawLabelValue('SUPPLIER', supplierName || 'No supplier selected', 20, startY + 10, { fontSize: 11 });
      drawLabelValue('BRANCH', user.branch, 20, startY + 18, { fontSize: 11 });
      drawLabelValue('SELECTED ITEMS', supplierGroups.reduce((sum, group) => sum + getSelectedReorderItems(group).length, 0), 20, startY + 26, { fontSize: 11 });

      if (supplierGroups.length === 0) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('No items require supplier reorder review for the selected supplier.', 20, startY + 40);
      } else {
        let currentY = startY + 38;
        supplierGroups.forEach((group, index) => {
          const selectedItems = getSelectedReorderItems(group);
          if (currentY > pageHeight - 42) {
            doc.addPage();
            currentY = 20;
          }
          if (supplierGroups.length > 1) {
            doc.setFontSize(10.5);
            doc.setFont('helvetica', 'bold');
            doc.text(normalizePdfText(group.supplier), 20, currentY);
            currentY += 6;
          } else if (index > 0) {
            currentY += 4;
          }
          if (selectedItems.length === 0) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text('No selected items for this supplier.', 20, currentY);
            currentY += 10;
            return;
          }
          reportTable({
            startY: currentY,
            tableWidth: pageWidth - pdfMargin * 2,
            head: [['Item Code', 'Item Name', 'Current', 'Suggested Point', 'Suggested Qty', 'Final Order Qty']],
            body: selectedItems.map(item => [
              getDisplayItemCode(item),
              item.name,
              String(item.quantity),
              String(getSuggestedPointValue(item)),
              String(item.neededQuantity),
              String(getPreparedReorderQuantity(item))
            ]),
            theme: 'striped',
            headStyles: {
              fillColor: [71, 85, 105],
              textColor: 255,
              fontStyle: 'bold',
              fontSize: 9,
              overflow: 'linebreak',
              minCellHeight: 9,
              cellPadding: { top: 2.2, right: 2, bottom: 2.2, left: 2 }
            },
            styles: {
              fontSize: 9,
              cellPadding: { top: 2.4, right: 2.4, bottom: 2.4, left: 2.4 },
              lineColor: [226, 232, 240],
              lineWidth: 0.1
            },
            columnStyles: {
              0: { cellWidth: 24, halign: 'center' },
              1: { cellWidth: 70, halign: 'left' },
              2: { cellWidth: 16, halign: 'center' },
              3: { cellWidth: 26, halign: 'center' },
              4: { cellWidth: 22, halign: 'center' },
              5: { cellWidth: 28, halign: 'center' }
            },
            didParseCell: data => {
              if (data.section === 'body') {
                data.cell.styles.halign = data.column.index === 1 ? 'left' : 'center';
              }
            },
            alternateRowStyles: { fillColor: [248, 250, 252] }
          });
          currentY = doc.lastAutoTable.finalY + 12;
        });
      }
    } else if (reportType === 'untracked-sales') {
      const untrackedItems = getUntrackedSalesItems();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('UNTRACKED SALES ITEMS REPORT', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      drawLabelValue('Non-inventory item groups', untrackedItems.length, 20, startY + 8);
      if (untrackedItems.length === 0) {
        doc.text('No non-inventory sales items found for this report period.', 20, startY + 22);
      } else {
        reportTable({
          startY: startY + 16,
          head: [['Item Description', 'Category', 'Total Qty Sold', 'Total Sales', 'Times Sold', 'Last Sold', 'Status']],
          body: untrackedItems.map(item => [
            item.itemName,
            getCategoryDisplay(item),
            String(item.totalQuantity),
            formatCurrency(item.totalSalesAmount),
            String(item.timesSold),
            formatDateTime(item.lastSoldAt),
            item.reviewStatus === 'tracked' ? 'Now Tracked in Inventory' : 'Needs Review'
          ]),
          theme: 'striped',
          headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2 },
          alternateRowStyles: { fillColor: [248, 250, 252] }
        });
      }
    } else if (reportType === 'category') {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('CATEGORY SUMMARY REPORT', 20, startY);
      let currentY = startY + 10;
      getCategorySummary().forEach((cat, index) => {
        if (currentY > pageHeight - 42) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        drawLabelValue('CATEGORY', cat.category, 20, currentY, { fontSize: 11 });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        drawLabelValueSegments([
          { label: 'Total Items', value: cat.itemCount },
          { label: 'Total Units', value: cat.totalQty },
          { label: 'Low Stock', value: cat.lowStock },
          { label: 'Out of Stock', value: cat.outOfStock }
        ], 20, currentY + 6, { fontSize: 9 });
        const categoryItems = computedReportInventory.filter(item => item.category === cat.category);
        const itemData = categoryItems.map(item => [getDisplayItemCode(item), item.name, item.supplierName || 'Unassigned', item.quantity.toString(), item.status, formatDateTime(item.lastUpdated)]);
        reportTable({
          startY: currentY + 12,
          head: [['Item Code', 'Item Name', 'Supplier', 'Quantity', 'Status', 'Last Updated']],
          body: itemData,
          theme: 'striped',
          headStyles: {
            fillColor: [71, 85, 105],
            textColor: 255,
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 7,
            cellPadding: 1.6
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          columnStyles: {
            0: {
              cellWidth: 22
            },
            1: {
              cellWidth: 46
            },
            2: {
              cellWidth: 28
            },
            3: {
              cellWidth: 13
            },
            4: {
              cellWidth: 18
            },
            5: {
              cellWidth: 43
            }
          }
        });
        currentY = doc.lastAutoTable.finalY + 10;
      });
    } else if (reportType === 'purchases') {
      const purchases = getFilteredPurchaseTransactions();
      const purchaseSummary = getPurchaseSummary();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PURCHASE REPORT', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      drawLabelValue('Purchase Entries', purchaseSummary.entryCount, 20, startY + 8);
      drawLabelValue('Quantity Received', purchaseSummary.totalQuantity, 20, startY + 14);
      drawLabelValue('Total Purchases', formatCurrency(purchaseSummary.totalAmount), 20, startY + 20);

      if (purchases.length === 0) {
        doc.text('No purchase entries found for this report period.', 20, startY + 34);
      } else {
        reportTable({
          startY: startY + 32,
          head: [['Purchase No.', 'Transaction Date', 'Encoded Date', 'Supplier', 'Document', 'Terms', 'Quantity', 'Total', 'Remarks']],
          body: purchases.map(purchase => [
            purchase.purchaseNumber,
            formatDateTime(purchase.createdAt),
            formatEncodedDate(purchase),
            purchase.supplierName,
            formatPurchaseDocumentLabel(purchase.documentType, purchase.documentNumber, purchase.documentTypeNote),
            formatPurchasePaymentTerms(purchase.paymentTerms, purchase.creditTermsDays),
            String(purchase.totalQuantity),
            formatCurrency(purchase.subtotalAmount),
            getPurchaseRemarksText(purchase) || '-'
          ]),
          theme: 'striped',
          headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: 'bold' },
          styles: { fontSize: 8, cellPadding: 2 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { cellWidth: 21 },
            1: { cellWidth: 24 },
            2: { cellWidth: 24 },
            3: { cellWidth: 23 },
            4: { cellWidth: 14 },
            5: { cellWidth: 13 },
            6: { cellWidth: 9 },
            7: { cellWidth: 24 },
            8: { cellWidth: 22 }
          }
        });
      }
    } else if (reportType === 'actual-earnings') {
      const earnings = getEarningsSummary();
      const products = getEarningsProductRows(20);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('ACTUAL EARNINGS REPORT', 20, startY);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      drawLabelValue('Total Sales', formatCurrency(earnings.totalSales), 20, startY + 8);
      drawLabelValue('Cost of Goods Sold', formatCurrency(earnings.puhunanUsed), 20, startY + 14);
      drawLabelValue('Actual Profit', formatCurrency(earnings.actualProfit), 20, startY + 20);
      drawLabelValue('Profit Margin', formatPercentage(earnings.profitMargin), 20, startY + 26);

      if (products.length === 0) {
        doc.text('No completed sales with item lines found for this report period.', 20, startY + 40);
      } else {
        reportTable({
          startY: startY + 38,
          head: [['Rank', 'Product', 'Category', 'Qty Sold', 'Sales', 'Cost of Goods Sold', 'Actual Profit', 'Margin']],
          body: products.map(product => [
            `#${product.rank}`,
            product.itemName,
            product.category,
            product.quantitySold.toLocaleString(),
            formatCurrency(product.totalSales),
            formatCurrency(product.puhunanUsed),
            formatCurrency(product.actualProfit),
            formatPercentage(product.profitMargin)
          ]),
          theme: 'striped',
          headStyles: { fillColor: [22, 101, 52], textColor: 255, fontStyle: 'bold' },
          styles: { fontSize: 7.5, cellPadding: 1.8 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { cellWidth: 12 },
            1: { cellWidth: 42 },
            2: { cellWidth: 28 },
            3: { cellWidth: 14 },
            4: { cellWidth: 23 },
            5: { cellWidth: 24 },
            6: { cellWidth: 24 },
            7: { cellWidth: 15 }
          }
        });
      }
    } else if (reportType === 'movements' || reportType === 'sales-movements') {
      const isSalesMovementReport = reportType === 'sales-movements';
      const movements = isSalesMovementReport ? getSalesMovementRows() : getFilteredMovements({ salesOnly: false });
      const salesSummary = getSalesFinancialSummary();
      const salesComparison = isSalesMovementReport ? getSalesComparisonSummary() : null;
      const topSellingProducts = isSalesMovementReport ? getTopSellingProducts(10) : [];
      const movementSummary = getStockMovementSummary();
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(
        isSalesDeductionsOnlyExport
          ? 'DETAILED SALES STOCK DEDUCTIONS'
          : isSalesMovementReport
            ? 'SALES-BASED STOCK MOVEMENT REPORT'
            : 'STOCK MOVEMENT HISTORY',
        20,
        startY
      );
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      drawLabelValue('Category Filter', selectedCategory === 'all' ? 'All Categories' : selectedCategory, 20, startY + 8);
      drawLabelValue(isSalesMovementReport ? 'Sales Stock Deductions' : 'Total Movements', movements.length, 20, startY + 14);
      if (isSalesMovementReport && !isSalesDeductionsOnlyExport) {
        drawLabelValue('Quantity Sold', getSalesMovementUnits(), 20, startY + 20);
        drawLabelValue('Sales Transactions', salesSummary.transactionCount, 20, startY + 26);
        drawLabelValueSegments([
          { label: 'Subtotal', value: formatCurrency(salesSummary.subtotal) },
          { label: 'Discount', value: formatCurrency(salesSummary.discount) },
          { label: 'Delivery', value: formatCurrency(salesSummary.deliveryCharge) },
          { label: 'Amount Due', value: formatCurrency(salesSummary.amountDue) }
        ], 20, startY + 32);
      } else if (!isSalesMovementReport) {
        drawLabelValue('Stock In Units', movementSummary.stockInUnits, 20, startY + 20);
        drawLabelValue('Stock Out Units', movementSummary.stockOutUnits, 20, startY + 26);
      }

      if (movements.length === 0) {
        doc.text(
          isSalesMovementReport
            ? 'No sales-based stock deductions found for this report period.'
            : 'No stock movements found for this report period.',
          20,
          isSalesMovementReport ? (isSalesDeductionsOnlyExport ? startY + 26 : startY + 44) : startY + 38
        );
      } else {
        let movementTableStartY = isSalesMovementReport
          ? (isSalesDeductionsOnlyExport ? startY + 22 : startY + 42)
          : startY + 34;
        if (isSalesMovementReport && !isSalesDeductionsOnlyExport && salesComparison) {
          const amountDueComparison = formatReportComparison(
            salesComparison.current.amountDue,
            salesComparison.previous.amountDue
          );
          const transactionComparison = formatReportComparison(
            salesComparison.current.transactions,
            salesComparison.previous.transactions,
            {
              percentage: false,
              emptyLabel: 'No transactions',
              unitSingular: 'transaction',
              unitPlural: 'transactions'
            }
          );
          const unitsComparison = formatReportComparison(
            salesComparison.current.unitsSold,
            salesComparison.previous.unitsSold,
            {
              percentage: false,
              emptyLabel: 'No units sold',
              unitSingular: 'unit',
              unitPlural: 'units'
            }
          );

          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('PREVIOUS PERIOD COMPARISON', 20, movementTableStartY);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          drawLabelValueSegments([
            { label: 'Amount Due', value: amountDueComparison.label },
            { label: 'Transactions', value: transactionComparison.label },
            { label: 'Units Sold', value: unitsComparison.label }
          ], 20, movementTableStartY + 6, { fontSize: 8 });
          movementTableStartY += 18;
        }
        if (isSalesMovementReport && !isSalesDeductionsOnlyExport && topSellingProducts.length > 0) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('TOP-SELLING PRODUCTS', 20, movementTableStartY);
          reportTable({
            startY: movementTableStartY + 5,
            head: [['Rank', 'Product', 'Category', 'Qty Sold', 'Sales', 'Sales Share']],
            body: topSellingProducts.map(product => [
              `#${product.rank}`,
              product.itemName,
              product.category,
              String(product.quantitySold),
              formatCurrency(product.revenue),
              formatPercentage(product.revenueShare)
            ]),
            theme: 'striped',
            headStyles: {
              fillColor: [22, 101, 52],
              textColor: 255,
              fontStyle: 'bold'
            },
            styles: {
              fontSize: 7.5,
              cellPadding: 1.7
            },
            alternateRowStyles: {
              fillColor: [240, 253, 244]
            },
            columnStyles: {
              0: { cellWidth: 14, halign: 'center' },
              1: { cellWidth: 62 },
              2: { cellWidth: 28 },
              3: { cellWidth: 18, halign: 'center' },
              4: { cellWidth: 26, halign: 'right' },
              5: { cellWidth: 18, halign: 'center' }
            }
          });
          movementTableStartY = doc.lastAutoTable.finalY + 9;
        }

        if (isSalesMovementReport && !isSalesDeductionsOnlyExport) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('DETAILED SALES STOCK DEDUCTIONS', 20, movementTableStartY);
          movementTableStartY += 5;
        }

        const movementData = movements.map(movement => {
          const sharedColumns = [
            formatDateTime(movement.createdAt),
            formatEncodedDate(movement),
            formatMovementItemNameForExport(movement),
            movement.category,
            getMovementLabel(movement.action),
            isSalesMovementReport ? getPaymentMethodLabel(movement.paymentMethod) : getMovementReasonDisplay(movement),
            movement.quantityChanged.toString(),
            String(movement.previousQuantity),
            String(movement.newQuantity),
            movement.actorName || 'System'
          ];
          return sharedColumns;
        });
        const movementHead = isSalesMovementReport
          ? ['Transaction Date', 'Encoded Date', 'Item', 'Category', 'Action', 'Payment', 'Qty Sold', 'Before', 'After', 'Handled By']
          : ['Transaction Date', 'Encoded Date', 'Item', 'Category', 'Action', 'Reason', 'Qty', 'Before', 'After', 'Handled By'];
        const movementColumnStyles = isSalesMovementReport
          ? {
              0: { cellWidth: 29 },
              1: { cellWidth: 24 },
              2: { cellWidth: 62 },
              3: { cellWidth: 24 },
              4: { cellWidth: 20 },
              5: { cellWidth: 20 },
              6: { cellWidth: 14 },
              7: { cellWidth: 13 },
              8: { cellWidth: 13 },
              9: { cellWidth: 38 }
            }
          : {
              0: { cellWidth: 30 },
              1: { cellWidth: 24 },
              2: { cellWidth: 58 },
              3: { cellWidth: 24 },
              4: { cellWidth: 21 },
              5: { cellWidth: 30 },
              6: { cellWidth: 12 },
              7: { cellWidth: 13 },
              8: { cellWidth: 13 },
              9: { cellWidth: 32 }
            };
        const movementTableWidth = Object.values(movementColumnStyles)
          .reduce((total, style) => total + Number(style.cellWidth || 0), 0);
        const movementTableLeft = Math.max(pdfMargin, (pageWidth - movementTableWidth) / 2);
        const movementTableRight = Math.max(pdfMargin, pageWidth - movementTableLeft - movementTableWidth);
        reportTable({
          startY: movementTableStartY,
          head: [movementHead],
          body: movementData,
          tableWidth: movementTableWidth,
          margin: {
            left: movementTableLeft,
            right: movementTableRight
          },
          theme: 'striped',
          headStyles: {
            fillColor: [71, 85, 105],
            textColor: 255,
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 7.5,
            cellPadding: 1.7
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          columnStyles: movementColumnStyles
        });
      }
    }

    // Footer on last page
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`Page ${i} of ${pageCount}`, pageCenter, pageHeight - 12, {
        align: 'center'
      });
      doc.text('E.M. Cayetano Trading - Inventory Management System', pageCenter, pageHeight - 7, {
        align: 'center'
      });
    }

    // Save PDF
    const exportFileScope = isSalesDeductionsOnlyExport ? '_deductions_only' : '';
    doc.save(`EMC_${reportType}_report${exportFileScope}_${new Date().toISOString().split('T')[0]}.pdf`);
    auditAction?.('EXPORT_REPORT', {
      targetName: `${getReportTypeLabel()} report${isSalesDeductionsOnlyExport ? ' - detailed deductions only' : ''} - ${getReportScopeLabel()}`
    });
    toast.success('Report downloaded successfully!');
  };

  const handleExportPdfClick = () => {
    if (reportType === 'sales-movements') {
      setIsSalesExportDialogOpen(true);
      return;
    }
    generatePDF();
  };

  const exportSalesMovementPdf = scope => {
    setIsSalesExportDialogOpen(false);
    generatePDF({ scope });
  };

  const getMovementLabel = action => {
    if (action === 'stock_in') return 'Stock In';
    if (action === 'stock_out') return 'Stock Out';
    if (action === 'initial_stock') return 'Initial Stock';
    return 'Adjustment';
  };

  const getMovementReasonDisplay = movement => {
    const note = String(movement?.note || '').toLowerCase();
    if (movement?.reason === 'correction' && note.includes('cancelled sales transaction')) {
      return 'Cancellation';
    }
    return getStockMovementReasonLabel(movement?.reason, movement?.action);
  };

  const getPaymentMethodLabel = method => {
    const labels = {
      cash: 'Cash',
      gcash: 'GCash',
      bank_transfer: 'Bank Transfer',
      bank: 'Bank Transfer',
      card: 'Card',
      credit: 'Credit'
    };
    const key = String(method || '').trim().toLowerCase();
    return labels[key] || (key ? key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : '-');
  };

  const getMovementBadgeClass = action => {
    if (action === 'stock_out') return 'bg-red-100 text-red-700 hover:bg-red-100';
    if (action === 'initial_stock') return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
    return 'bg-green-100 text-green-700 hover:bg-green-100';
  };

  const getFilteredMovements = ({ salesOnly = false } = {}) => {
    const categoryFiltered = selectedCategory === 'all'
      ? reportMovements
      : reportMovements.filter(movement => movement.category === selectedCategory);
    const filtered = salesOnly
      ? categoryFiltered.filter(movement => movement.action === 'stock_out' && movement.reason === 'sales')
      : categoryFiltered;
    return [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  };

  const getStockMovementSummary = () => {
    const rows = getFilteredMovements({ salesOnly: false });
    return rows.reduce((summary, movement) => {
      const quantity = Number(movement.quantityChanged || 0);
      if (movement.action === 'stock_in' || movement.action === 'initial_stock') {
        summary.stockInUnits += quantity;
      } else if (movement.action === 'stock_out') {
        summary.stockOutUnits += quantity;
      }
      return summary;
    }, {
      stockInUnits: 0,
      stockOutUnits: 0
    });
  };

  const getUniqueMovementItemCount = ({ salesOnly = false } = {}) =>
    new Set(
      getFilteredMovements({ salesOnly })
        .map(movement => movement.inventoryId || movement.productId || movement.itemName)
        .filter(Boolean)
    ).size;

  const renderReportsEmptyState = ({ icon: Icon = FileText, title, message }) => (
    <div className="reports-empty-state">
      <div className="reports-empty-icon">
        <Icon className="h-7 w-7" />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );

  const renderReportHeaderTooltip = (label, message) => (
    <span className="reports-help-label">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="reports-help-trigger"
            aria-label={`${label}: ${message}`}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          sideOffset={8}
          hideArrow
          className="reports-help-content"
        >
          {message}
        </TooltipContent>
      </Tooltip>
    </span>
  );

  const getStatusCountBadgeClass = status =>
    status === 'Out of Stock'
      ? 'reports-count-badge reports-count-badge-out'
      : status === 'Low Stock'
        ? 'reports-count-badge reports-count-badge-low'
        : 'reports-count-badge reports-count-badge-clear';

  const renderInventoryMobileCard = (item, { showCategory = true, showSupplier = true } = {}) => (
    <article key={item.id} className="reports-record-card">
      <div className="reports-record-top">
        <div className="min-w-0">
          <p className="reports-record-code">{getDisplayItemCode(item)}</p>
          <h4 className="reports-record-name">{item.name}</h4>
          <p className="reports-record-meta">
            {[showCategory ? getCategoryDisplay(item) : null, showSupplier ? item.supplierName || 'Unassigned supplier' : null]
              .filter(Boolean)
              .join(' - ')}
          </p>
        </div>
        <Badge className={`shrink-0 ${getStockStatusBadgeClass(item.status)}`}>
          {item.status}
        </Badge>
      </div>
      <div className="reports-record-grid">
        <div className="reports-record-stat">
          <span>Quantity</span>
          <strong>{item.quantity}</strong>
        </div>
        <div className="reports-record-stat">
          <span>Last Updated</span>
          <strong>{formatDateTime(item.lastUpdated)}</strong>
        </div>
      </div>
    </article>
  );

  const conversionSupplierSelectValue = getSupplierSelectValue(conversionDraft.supplierName, conversionSupplierMode);
  const showConversionCustomSupplier = conversionSupplierSelectValue === SUPPLIER_CUSTOM_VALUE;

  return (
    <div className="reports-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        /* Report view toggles between desktop tables and mobile cards without changing the source data. */
        .reports-mobile-category-list { display: none; }
        .reports-movement-mobile-list { display: none; }
        .reports-mobile-record-list { display: none; }
        .reports-desktop-table { display: block; }

        /* Scroll areas contain large report tables while keeping the page header and filters accessible. */
        .reports-scroll-area {
          max-height: clamp(360px, 52vh, 620px);
          overflow: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          border-radius: 14px;
        }

        .reports-scroll-area::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }

        .reports-scroll-area::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 999px;
        }

        .reports-scroll-area::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border: 2px solid #f8fafc;
          border-radius: 999px;
        }

        .reports-scroll-area::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        /* POS summary highlights the key cash/credit totals used when reconciling daily sales. */
        .reports-pos-summary {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.55rem;
          margin-bottom: 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
          background: #ffffff;
          padding: 0.75rem 0.85rem;
          box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
        }

        .reports-pos-summary-copy {
          display: flex;
          min-width: 0;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          border-bottom: 1px solid #e2e8f0;
          padding: 0.05rem 0.25rem 0.55rem;
        }

        .reports-pos-summary-copy h3 {
          flex: 0 0 auto;
          font-size: 1.02rem;
          line-height: 1.25;
          font-weight: 800;
          color: #0f172a;
        }

        .reports-pos-summary-copy p {
          max-width: min(100%, 860px);
          text-align: right;
          font-size: 0.84rem;
          line-height: 1.45;
          color: #111827;
        }

        .reports-pos-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          border-radius: 0.9rem;
          background: #f8fafc;
          align-items: stretch;
        }

        .reports-pos-summary-item {
          position: relative;
          display: flex;
          min-height: 72px;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
          border: 0;
          border-right: 1px solid #e2e8f0;
          border-radius: 0;
          background: #ffffff;
          padding: 0.65rem 1rem;
        }

        .reports-pos-summary-item:last-child {
          border-right: 0;
        }

        .reports-pos-summary-item span {
          display: block;
          font-size: 0.7rem;
          line-height: 1.2;
          font-weight: 800;
          color: #111827;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .reports-pos-summary-item strong {
          display: block;
          margin-top: 0.25rem;
          color: #0f172a;
          font-size: clamp(1rem, 1.15vw, 1.2rem);
          font-weight: 850;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .reports-pos-summary-item-due {
          background: linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%);
          box-shadow: inset 3px 0 0 #22c55e;
        }

        .reports-pos-summary-item-due strong {
          font-size: clamp(1.15rem, 1.45vw, 1.4rem);
          color: #166534;
        }

        /* Comparison summary groups period-over-period metrics for faster evaluation. */
        .reports-comparison-summary {
          display: grid;
          gap: 0.65rem;
          margin-bottom: 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
          background: #ffffff;
          padding: 0.75rem 0.85rem;
          box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
        }

        .reports-comparison-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.65rem;
        }

        .reports-comparison-item {
          display: flex;
          min-height: 116px;
          flex-direction: column;
          align-items: flex-start;
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 0.85rem;
          background: #f8fafc;
          padding: 0.75rem;
        }

        .reports-comparison-item span {
          display: block;
          color: #111827;
          font-size: 0.68rem;
          font-weight: 800;
          line-height: 1.2;
          text-transform: uppercase;
        }

        .reports-comparison-item strong {
          display: block;
          margin-top: 0.25rem;
          color: #0f172a;
          font-size: clamp(1.05rem, 1.35vw, 1.3rem);
          font-weight: 850;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .reports-comparison-badge {
          display: inline-flex;
          width: max-content;
          max-width: 100%;
          margin-top: 0.55rem;
          border-radius: 14px;
          padding: 0.35rem 0.65rem;
          font-size: 0.68rem;
          font-style: normal;
          font-weight: 800;
          line-height: 1.25;
          overflow-wrap: anywhere;
          white-space: normal;
        }

        .reports-comparison-badge.comparison-up {
          background: #dcfce7;
          color: #166534;
        }

        .reports-comparison-badge.comparison-down {
          background: #fee2e2;
          color: #991b1b;
        }

        .reports-comparison-badge.comparison-neutral {
          background: #f1f5f9;
          color: #111827;
        }

        .reports-top-products-summary {
          display: grid;
          gap: 0.65rem;
          margin-bottom: 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 1rem;
          background: #ffffff;
          padding: 0.75rem 0.85rem;
          box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
        }

        .reports-top-products-table {
          overflow-x: auto;
          border: 1px solid #e2e8f0;
          border-radius: 0.9rem;
        }

        .reports-top-products-table table {
          min-width: 760px;
        }

        .reports-top-products-table th {
          background: #f8fafc;
          color: #111827;
          font-size: 0.72rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .reports-top-products-table td,
        .reports-top-products-table th {
          padding: 0.7rem 0.85rem;
          vertical-align: middle;
        }

        .reports-rank-badge {
          border-color: #cbd5e1;
          background: #f8fafc;
          color: #334155;
          font-weight: 800;
        }

        .reports-top-products-mobile {
          display: none;
        }

        .reports-top-product-card {
          display: grid;
          gap: 0.65rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.85rem;
          background: #ffffff;
          padding: 0.75rem;
        }

        .reports-top-product-heading {
          display: flex;
          min-width: 0;
          align-items: flex-start;
          gap: 0.65rem;
        }

        .reports-top-product-heading h4 {
          color: #0f172a;
          font-size: 0.9rem;
          font-weight: 800;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .reports-top-product-heading p {
          margin-top: 0.18rem;
          color: #111827;
          font-size: 0.78rem;
          line-height: 1.3;
        }

        .reports-top-product-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.45rem;
        }

        .reports-top-product-stats span {
          min-width: 0;
          border-radius: 0.7rem;
          background: #f8fafc;
          padding: 0.55rem;
          color: #111827;
          font-size: 0.68rem;
          font-weight: 800;
          text-transform: uppercase;
        }

        .reports-top-product-stats strong {
          display: block;
          margin-top: 0.2rem;
          color: #0f172a;
          font-size: 0.82rem;
          line-height: 1.2;
          overflow-wrap: anywhere;
          text-transform: none;
        }

        .reports-help-label {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          max-width: 100%;
          white-space: nowrap;
        }

        .reports-help-trigger {
          appearance: none;
          display: inline-flex;
          height: 1.125rem;
          width: 1.125rem;
          min-height: 1.125rem;
          min-width: 1.125rem;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: #64748b;
          cursor: help;
          line-height: 1;
          padding: 0;
          transition: border-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
        }

        .reports-help-trigger:hover,
        .reports-help-trigger:focus-visible {
          border-color: transparent;
          background: transparent;
          color: #64748b;
          outline: none;
          box-shadow: none;
        }

        .reports-help-trigger:focus,
        .reports-help-trigger:active,
        .reports-help-trigger[data-state='delayed-open'],
        .reports-help-trigger[data-state='instant-open'] {
          border-color: transparent;
          background: transparent;
          color: #64748b;
          outline: none;
          box-shadow: none;
        }

        .reports-help-content {
          z-index: 100;
          width: auto;
          max-width: min(17rem, calc(100vw - 2rem));
          border: 1px solid #cbd5e1;
          border-radius: 0.625rem;
          padding: 0.6rem 0.75rem;
          background: #ffffff;
          color: #334155;
          font-size: 0.75rem;
          line-height: 1.4;
          font-weight: 500;
          text-align: left;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
          white-space: normal;
        }

        .reports-help-content svg {
          display: none;
        }

        /* Period controls align preset and custom date filters that drive every report calculation. */
        .reports-period-control-row {
          display: grid;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
          gap: 1rem;
          align-items: end;
          --reports-period-control-height: 46px;
          --reports-period-control-radius: 0.75rem;
          --reports-period-control-x: 0.95rem;
        }

        .reports-period-control-row.is-custom-range {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .reports-period-select-field {
          display: grid;
          gap: 0.45rem;
          min-width: 0;
        }

        .reports-custom-range-grid {
          display: contents;
        }

        .reports-custom-date-field {
          display: grid;
          gap: 0.45rem;
          min-width: 0;
        }

        .reports-custom-date-label {
          color: #475569;
          font-size: 0.75rem;
          font-weight: 800;
          line-height: 1.25;
          cursor: pointer;
        }

        .reports-period-control-row [data-reports-control] {
          width: 100%;
          height: var(--reports-period-control-height);
          min-height: var(--reports-period-control-height);
          box-sizing: border-box;
          border: 1px solid #d1d5db;
          border-radius: var(--reports-period-control-radius);
          background: #ffffff;
          padding: 0 var(--reports-period-control-x);
          color: #172033;
          font-size: 0.875rem;
          font-weight: 700;
          line-height: 1.2;
          align-items: center;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }

        .reports-period-control-row button[data-reports-control] {
          display: flex;
        }

        .reports-custom-date-control {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          overflow: hidden;
          padding-right: 1rem;
          cursor: pointer;
        }

        .reports-custom-date-display {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          pointer-events: none;
        }

        .reports-custom-date-icon {
          width: 1rem;
          height: 1rem;
          flex: 0 0 auto;
          color: #111827;
          pointer-events: none;
        }

        .reports-custom-date-native {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          margin: 0;
          border: 0;
          opacity: 0;
          padding: 0;
          color: transparent;
          cursor: pointer;
        }

        .reports-custom-date-native::-webkit-calendar-picker-indicator {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          cursor: pointer;
        }

        .reports-period-control-row [data-reports-control]:hover {
          border-color: #ffff00;
          background: #ffffff;
        }

        .reports-period-control-row [data-reports-control]:focus,
        .reports-period-control-row [data-reports-control]:focus-visible,
        .reports-period-control-row [data-reports-control]:focus-within {
          border-color: #ffff00;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(255, 255, 0, 0.24);
          outline: none;
        }

        @media (hover: none), (pointer: coarse) {
          .reports-help-trigger,
          .reports-help-trigger:hover,
          .reports-help-trigger:focus,
          .reports-help-trigger:focus-visible {
            -webkit-tap-highlight-color: transparent;
            border-color: transparent;
            background: transparent;
            color: #64748b;
            box-shadow: none;
            outline: none;
          }

          .reports-help-trigger[data-state='delayed-open'],
          .reports-help-trigger[data-state='instant-open'] {
            border-color: transparent;
            background: transparent;
            color: #64748b;
            box-shadow: none;
            outline: none;
          }
        }

        /* Empty states explain filtered-out report results without implying data was deleted. */
        .reports-empty-state {
          display: flex;
          min-height: 220px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px dashed #cbd5e1;
          border-radius: 16px;
          background: #f8fafc;
          padding: 34px 22px;
          text-align: center;
          color: #111827;
        }

        .reports-empty-icon {
          display: flex;
          height: 54px;
          width: 54px;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          background: #ffffff;
          color: #111827;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
        }

        .reports-empty-state h3 {
          margin-top: 14px;
          color: #0f172a;
          font-size: 18px;
          font-weight: 750;
          line-height: 1.3;
        }

        .reports-empty-state p {
          margin-top: 6px;
          max-width: 560px;
          font-size: 14px;
          line-height: 1.55;
        }

        .reports-metric-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
          gap: 1rem;
          margin-bottom: 1.25rem;
        }

        .reports-metric-card {
          min-width: 0;
        }

        .reports-data-card {
          overflow: hidden;
          border-color: #e2e8f0;
          background: #ffffff;
        }

        .reports-data-card [data-slot='card-header'] {
          gap: 0.35rem;
        }

        .reports-data-card [data-slot='card-content'] {
          min-width: 0;
        }

        .reports-category-analysis-card {
          min-width: 0;
        }

        /* Report tables use contained scrolling because inventory and supplier reports can be wide. */
        .reports-desktop-table,
        .reports-movement-desktop-table,
        .reports-category-table {
          max-width: 100%;
          max-height: clamp(360px, 52vh, 620px);
          overflow-x: auto;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          border-radius: 14px;
        }

        .reports-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .reports-desktop-table table,
        .reports-movement-desktop-table table,
        .reports-category-table table {
          min-width: 720px;
        }

        .reports-desktop-table [data-slot='table-container'],
        .reports-movement-desktop-table [data-slot='table-container'],
        .reports-category-table [data-slot='table-container'],
        .reports-top-products-table [data-slot='table-container'] {
          overflow: visible;
        }

        .reports-supplier-reorder-table table {
          min-width: 1160px;
          table-layout: fixed;
        }

        .reports-reorder-card-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        .reports-reorder-select-cell {
          text-align: center;
        }

        .reports-reorder-checkbox {
          width: 1rem;
          height: 1rem;
          accent-color: #16a34a;
          cursor: pointer;
        }

        .reports-reorder-selection-action {
          min-height: 2.25rem;
          border-color: #cbd5e1;
          background: #ffffff;
          color: #334155;
          font-weight: 700;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .reports-reorder-selection-action:hover,
        .reports-reorder-selection-action:focus-visible {
          border-color: #93c5fd;
          background: #eff6ff;
          color: #1d4ed8;
          box-shadow: 0 6px 14px rgba(37, 99, 235, 0.12);
        }

        .reports-generate-draft-button {
          min-height: 2.25rem;
          border: 1px solid #15803d;
          background: #16a34a;
          color: #ffffff;
          font-weight: 750;
          box-shadow: 0 8px 18px rgba(22, 163, 74, 0.16);
        }

        .reports-generate-draft-button:hover,
        .reports-generate-draft-button:focus-visible {
          border-color: #166534;
          background: #15803d;
          color: #ffffff;
        }

        .reports-sales-export-dialog {
          width: min(100% - 2rem, 32rem) !important;
          max-width: min(100% - 2rem, 32rem) !important;
          overflow: hidden;
          border-radius: 14px;
        }

        .reports-sales-export-body {
          padding: clamp(1.25rem, 3vw, 1.8rem);
        }

        .reports-sales-export-title {
          color: #111827;
          font-size: clamp(1.2rem, 2.4vw, 1.55rem);
          font-weight: 850;
          line-height: 1.2;
        }

        .reports-sales-export-description {
          margin-top: 0.6rem;
          color: #111827;
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .reports-sales-export-options {
          display: grid;
          gap: 0.9rem;
          margin-top: 1.2rem;
        }

        .reports-sales-export-option {
          display: block;
          width: 100%;
          border: 1px solid #dbe3ef;
          border-radius: 14px;
          background: #ffffff;
          padding: 1rem 1.15rem;
          text-align: left;
          transition:
            background-color 160ms ease,
            border-color 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }

        .reports-sales-export-option:hover,
        .reports-sales-export-option:focus-visible {
          border-color: #2563eb;
          background: #f8fbff;
          box-shadow: 0 10px 24px rgba(37, 99, 235, 0.12);
          outline: none;
          transform: translateY(-1px);
        }

        .reports-sales-export-option-title {
          display: block;
          color: #111827;
          font-size: 0.98rem;
          font-weight: 850;
          line-height: 1.3;
        }

        .reports-sales-export-option-text {
          display: block;
          margin-top: 0.45rem;
          color: #111827;
          font-size: 0.92rem;
          line-height: 1.5;
        }

        .reports-sales-export-footer {
          display: flex;
          justify-content: flex-end;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
          padding: 1rem clamp(1.25rem, 3vw, 1.8rem);
        }

        .reports-sales-export-cancel {
          min-width: 6rem;
          border-radius: 10px;
        }

        .reports-desktop-table thead,
        .reports-movement-desktop-table thead,
        .reports-category-table thead,
        .reports-top-products-table thead {
          position: sticky;
          top: 0;
          z-index: 5;
          background: #f8fafc;
          box-shadow: 0 1px 0 #e2e8f0;
        }

        .reports-desktop-table th,
        .reports-movement-desktop-table th,
        .reports-category-table th,
        .reports-top-products-table th {
          position: sticky;
          top: 0;
          z-index: 6;
          background: #f8fafc;
          white-space: normal;
          overflow-wrap: break-word;
          word-break: normal;
          line-height: 1.25;
        }

        .reports-desktop-table td,
        .reports-movement-desktop-table td,
        .reports-category-table td {
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: normal;
          line-height: 1.35;
        }

        .reports-supplier-reorder-table th {
          padding: 12px 10px;
          white-space: normal;
          word-break: normal;
          overflow-wrap: normal;
          line-height: 1.2;
          vertical-align: middle;
          font-size: 12px;
        }

        .reports-supplier-reorder-table td {
          padding: 12px 10px;
          vertical-align: middle;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: normal;
        }

        .reports-supplier-reorder-table th:nth-child(1),
        .reports-supplier-reorder-table td:nth-child(1) {
          width: 56px;
          min-width: 56px;
          text-align: center;
        }

        .reports-supplier-reorder-table th:nth-child(2),
        .reports-supplier-reorder-table td:nth-child(2) {
          width: 92px;
          text-align: center;
        }

        .reports-supplier-reorder-table th:nth-child(3),
        .reports-supplier-reorder-table td:nth-child(3) {
          width: 300px;
          min-width: 300px;
          text-align: left;
        }

        .reports-supplier-reorder-table th:nth-child(4),
        .reports-supplier-reorder-table td:nth-child(4) {
          width: 92px;
          min-width: 92px;
          text-align: center;
        }

        .reports-supplier-reorder-table th:nth-child(5),
        .reports-supplier-reorder-table td:nth-child(5),
        .reports-supplier-reorder-table th:nth-child(6),
        .reports-supplier-reorder-table td:nth-child(6),
        .reports-supplier-reorder-table th:nth-child(8),
        .reports-supplier-reorder-table td:nth-child(8),
        .reports-supplier-reorder-table th:nth-child(9),
        .reports-supplier-reorder-table td:nth-child(9),
        .reports-supplier-reorder-table th:nth-child(10),
        .reports-supplier-reorder-table td:nth-child(10) {
          width: 72px;
          min-width: 72px;
          text-align: center;
        }

        .reports-supplier-reorder-table th:nth-child(7),
        .reports-supplier-reorder-table td:nth-child(7) {
          width: 120px;
          min-width: 120px;
          text-align: center;
        }

        .reports-supplier-reorder-table th:nth-child(11),
        .reports-supplier-reorder-table td:nth-child(11) {
          width: 96px;
          min-width: 96px;
          text-align: center;
        }

        .reports-desktop-table tbody td:first-child,
        .reports-movement-desktop-table tbody td:first-child,
        .reports-category-table tbody td:first-child {
          color: #111827;
          font-weight: 700;
        }

        .reports-desktop-table tbody td:first-child :is(p, span, strong, div):not([data-slot='badge']),
        .reports-movement-desktop-table tbody td:first-child :is(p, span, strong, div):not([data-slot='badge']),
        .reports-category-table tbody td:first-child :is(p, span, strong, div):not([data-slot='badge']) {
          color: inherit;
          font-weight: inherit;
        }

        .reports-desktop-table tbody td:not(:first-child),
        .reports-movement-desktop-table tbody td:not(:first-child),
        .reports-category-table tbody td:not(:first-child) {
          color: #111827;
          font-weight: 400;
        }

        .reports-desktop-table tbody td:not(:first-child) :is(p, span, strong, div):not([data-slot='badge']),
        .reports-movement-desktop-table tbody td:not(:first-child) :is(p, span, strong, div):not([data-slot='badge']),
        .reports-category-table tbody td:not(:first-child) :is(p, span, strong, div):not([data-slot='badge']) {
          color: inherit;
          font-weight: inherit;
        }

        .reports-record-card {
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #ffffff;
          padding: 12px;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05);
          transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
        }

        .reports-record-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.07);
        }

        #root .reports-reorder-record-card,
        #root .reports-reorder-record-card:hover,
        #root .reports-reorder-record-card:active,
        #root .reports-reorder-record-card:focus,
        #root .reports-reorder-record-card:focus-visible,
        #root .reports-reorder-record-card:focus-within,
        #root .reports-reorder-record-card[data-active='true'],
        #root .reports-reorder-record-card[data-state='open'],
        #root .reports-reorder-record-card[aria-selected='true'] {
          border-color: #e2e8f0;
          background: #ffffff;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05);
        }

        .reports-record-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .reports-reorder-mobile-title {
          display: flex;
          min-width: 0;
          align-items: flex-start;
          gap: 0.65rem;
        }

        .reports-record-code {
          margin-bottom: 3px;
          color: #111827;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 12px;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .reports-record-name {
          color: #0f172a;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .reports-record-meta {
          margin-top: 4px;
          color: #111827;
          font-size: 12px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .reports-record-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .reports-record-grid-four {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .reports-record-stat {
          min-width: 0;
          border-radius: 12px;
          background: #f8fafc;
          padding: 9px;
        }

        .reports-record-stat span {
          display: block;
          margin-bottom: 4px;
          color: #111827;
          font-size: 10px;
          font-weight: 800;
          line-height: 1.2;
          text-transform: uppercase;
        }

        .reports-record-stat strong {
          display: block;
          color: #0f172a;
          font-size: 14px;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .reports-reorder-quantity-input {
          height: 38px;
          max-width: 112px;
          border-color: #cbd5e1;
          border-radius: 10px;
          background: #ffffff;
          text-align: center;
          font-weight: 700;
          color: #0f172a;
        }

        .reports-reorder-quantity-input:hover,
        .reports-reorder-quantity-input:focus,
        .reports-reorder-quantity-input:focus-visible {
          border-color: #ffff00;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 0, 0.62),
            0 1px 2px rgba(15, 23, 42, 0.06);
        }

        .reports-reorder-quantity-card-field {
          display: grid;
          gap: 6px;
        }

        .reports-reorder-quantity-card-field .reports-reorder-quantity-input {
          max-width: none;
          text-align: left;
        }

        .reports-count-badge {
          border-radius: 999px;
          font-weight: 600;
          box-shadow: none;
        }

        .reports-count-badge-out,
        .reports-count-badge-out:hover {
          border-color: #be123c;
          background: #be123c;
          color: #ffffff;
        }

        .reports-count-badge-low,
        .reports-count-badge-low:hover {
          border-color: #eab308;
          background: #facc15;
          color: #422006;
        }

        .reports-count-badge-clear,
        .reports-count-badge-clear:hover {
          border-color: #e2e8f0;
          background: #f1f5f9;
          color: #334155;
        }

        .reports-purchase-total-stat {
          background: #f0fdf4;
        }

        .reports-purchase-total-stat strong {
          color: #166534;
        }

        .reports-purchase-note {
          margin-top: 0.75rem;
          border-top: 1px solid #e2e8f0;
          padding-top: 0.7rem;
          color: #111827;
          font-size: 0.78rem;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }

        .reports-purchase-remarks-cell {
          max-width: 14rem;
          color: #111827;
          font-size: 0.82rem;
          line-height: 1.35;
          overflow-wrap: anywhere;
          white-space: normal;
        }

        .reports-purchase-table .reports-purchase-total-head,
        .reports-purchase-table .reports-purchase-total-cell {
          width: 8.5rem;
          min-width: 8.5rem;
          padding-right: 1rem !important;
          text-align: right !important;
        }

        .reports-purchase-table .reports-purchase-total-cell {
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .reports-purchases-report-table table {
          min-width: 1720px;
          table-layout: auto;
        }

        .reports-purchases-report-table th,
        .reports-purchases-report-table td,
        .reports-purchases-report-table td :is(p, span, strong, div):not([data-slot='badge']) {
          white-space: nowrap;
          overflow-wrap: normal;
          word-break: normal;
          line-height: 1.35;
        }

        .reports-purchases-report-table th:nth-child(1),
        .reports-purchases-report-table td:nth-child(1) {
          min-width: 9.5rem;
        }

        .reports-purchases-report-table th:nth-child(2),
        .reports-purchases-report-table td:nth-child(2),
        .reports-purchases-report-table th:nth-child(3),
        .reports-purchases-report-table td:nth-child(3) {
          min-width: 12.5rem;
        }

        .reports-purchases-report-table th:nth-child(4),
        .reports-purchases-report-table td:nth-child(4) {
          min-width: 14rem;
        }

        .reports-purchases-report-table th:nth-child(5),
        .reports-purchases-report-table td:nth-child(5) {
          min-width: 11rem;
        }

        .reports-purchases-report-table th:nth-child(6),
        .reports-purchases-report-table td:nth-child(6),
        .reports-purchases-report-table th:nth-child(7),
        .reports-purchases-report-table td:nth-child(7) {
          min-width: 5.5rem;
        }

        .reports-purchases-report-table .reports-purchase-total-head,
        .reports-purchases-report-table .reports-purchase-total-cell {
          min-width: 8.5rem;
        }

        .reports-purchases-report-table .reports-purchase-remarks-cell {
          min-width: 31rem;
          max-width: none;
          white-space: nowrap;
          overflow-wrap: normal;
          word-break: normal;
        }

        .reports-low-stock-table table {
          min-width: 1120px;
          table-layout: auto;
        }

        .reports-low-stock-table th,
        .reports-low-stock-table td,
        .reports-low-stock-table td :is(p, span, strong, div):not([data-slot='badge']) {
          white-space: nowrap;
          overflow-wrap: normal;
          word-break: normal;
          line-height: 1.35;
        }

        .reports-low-stock-table th:nth-child(1),
        .reports-low-stock-table td:nth-child(1) {
          min-width: 7.5rem;
        }

        .reports-low-stock-table th:nth-child(2),
        .reports-low-stock-table td:nth-child(2) {
          min-width: 30rem;
        }

        .reports-low-stock-table th:nth-child(3),
        .reports-low-stock-table td:nth-child(3) {
          min-width: 11rem;
        }

        .reports-low-stock-table th:nth-child(4),
        .reports-low-stock-table td:nth-child(4) {
          min-width: 16rem;
        }

        .reports-low-stock-table th:nth-child(5),
        .reports-low-stock-table td:nth-child(5) {
          min-width: 7rem;
        }

        .reports-low-stock-table th:nth-child(6),
        .reports-low-stock-table td:nth-child(6) {
          min-width: 10rem;
        }

        .reports-low-stock-table th:nth-child(7),
        .reports-low-stock-table td:nth-child(7) {
          min-width: 12.5rem;
        }

        .reports-movement-desktop-table table {
          min-width: 1700px;
          table-layout: auto;
        }

        .reports-movement-desktop-table th,
        .reports-movement-desktop-table td,
        .reports-movement-desktop-table td :is(p, span, strong, div):not([data-slot='badge']) {
          white-space: nowrap;
          overflow-wrap: normal;
          word-break: normal;
          line-height: 1.35;
        }

        .reports-movement-desktop-table td:nth-child(3) > div {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 0.5rem;
          white-space: nowrap;
        }

        .reports-movement-desktop-table td:nth-child(3) > div > * + * {
          margin-top: 0 !important;
        }

        .reports-movement-desktop-table th:nth-child(1),
        .reports-movement-desktop-table td:nth-child(1),
        .reports-movement-desktop-table th:nth-child(2),
        .reports-movement-desktop-table td:nth-child(2) {
          min-width: 12.5rem;
        }

        .reports-movement-desktop-table th:nth-child(3),
        .reports-movement-desktop-table td:nth-child(3) {
          min-width: 34rem;
        }

        .reports-movement-desktop-table th:nth-child(4),
        .reports-movement-desktop-table td:nth-child(4),
        .reports-movement-desktop-table th:nth-child(6),
        .reports-movement-desktop-table td:nth-child(6) {
          min-width: 12rem;
        }

        .reports-movement-desktop-table th:nth-child(5),
        .reports-movement-desktop-table td:nth-child(5) {
          min-width: 8.5rem;
        }

        .reports-movement-desktop-table th:nth-child(7),
        .reports-movement-desktop-table td:nth-child(7),
        .reports-movement-desktop-table th:nth-child(8),
        .reports-movement-desktop-table td:nth-child(8),
        .reports-movement-desktop-table th:nth-child(9),
        .reports-movement-desktop-table td:nth-child(9) {
          min-width: 5.5rem;
        }

        .reports-movement-desktop-table th:nth-child(10),
        .reports-movement-desktop-table td:nth-child(10) {
          min-width: 11rem;
        }

        .reports-mobile-category-card,
        .reports-movement-card {
          min-width: 0;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #ffffff;
          padding: 12px;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05);
          transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
        }

        .reports-mobile-category-card:hover,
        .reports-movement-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.07);
        }

        .reports-mobile-category-top,
        .reports-movement-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .reports-mobile-category-name {
          min-width: 0;
          overflow-wrap: anywhere;
          color: #0f172a;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.25;
        }

        .reports-mobile-category-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .reports-mobile-category-stat,
        .reports-movement-stat {
          min-width: 0;
          border-radius: 12px;
          background: #f8fafc;
          padding: 9px;
        }

        .reports-mobile-category-stat span,
        .reports-movement-stat span {
          display: block;
          margin-bottom: 4px;
          color: #111827;
          font-size: 10px;
          font-weight: 800;
          line-height: 1.2;
          text-transform: uppercase;
        }

        .reports-mobile-category-stat strong,
        .reports-movement-stat strong {
          display: block;
          color: #0f172a;
          font-size: 15px;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }

        .reports-movement-name {
          min-width: 0;
          overflow-wrap: anywhere;
          color: #0f172a;
          font-size: 15px;
          font-weight: 750;
          line-height: 1.25;
        }

        .reports-movement-meta {
          margin-top: 3px;
          color: #111827;
          font-size: 12px;
          line-height: 1.35;
        }

        .reports-movement-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .reports-mobile-category-list,
        .reports-mobile-record-list,
        .reports-movement-mobile-list {
          max-height: min(62vh, 560px);
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          padding-right: 4px;
        }

        .reports-review-button {
          border-color: #bfdbfe;
          background: #ffffff;
          color: #1d4ed8;
          font-weight: 700;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .reports-review-button:hover,
        .reports-review-button:focus-visible {
          border-color: #60a5fa;
          background: #eff6ff;
          color: #1e40af;
        }

        .reports-convert-dialog {
          width: min(820px, calc(100vw - 2rem));
          max-width: min(820px, calc(100vw - 2rem)) !important;
          border-radius: 1rem;
          overflow: hidden;
        }

        .reports-convert-content {
          display: grid;
          grid-template-rows: auto auto auto;
          gap: 1rem;
          max-height: calc(100dvh - 2rem);
          min-height: 0;
        }

        .reports-convert-header {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 1rem;
          align-items: start;
          padding: 1.35rem 1.5rem 0;
        }

        .reports-convert-icon {
          display: flex;
          width: 3.25rem;
          height: 3.25rem;
          align-items: center;
          justify-content: center;
          border-radius: 0.95rem;
          background: #eff6ff;
          color: #2563eb;
        }

        .reports-convert-form {
          display: grid;
          gap: 0.9rem;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: visible;
          padding: 0 1.5rem 1.15rem;
        }

        .reports-convert-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.8rem;
        }

        .reports-convert-field {
          display: grid;
          gap: 0.45rem;
          min-width: 0;
        }

        .reports-convert-control {
          min-height: 2.75rem;
          border-color: #dbe3ee;
          border-radius: 0.65rem;
          background: #ffffff;
        }

        .reports-convert-summary,
        .reports-convert-warning {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          min-width: 0;
          border-radius: 0.75rem;
          padding: 0.75rem 0.85rem;
          font-size: 0.82rem;
          line-height: 1.4;
        }

        .reports-convert-summary span,
        .reports-convert-warning p,
        .reports-convert-warning strong {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .reports-convert-summary {
          border: 1px solid #bbf7d0;
          background: #f0fdf4;
          color: #14532d;
        }

        .reports-convert-warning {
          border: 1px solid #fde68a;
          background: #fffbeb;
          color: #713f12;
        }

        .reports-convert-match-list {
          margin-top: 0.45rem;
          display: grid;
          gap: 0.35rem;
          max-height: min(8rem, 24vh);
          overflow-x: auto;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding-bottom: 0.1rem;
          padding-right: 0.2rem;
          scrollbar-gutter: stable;
        }

        .reports-convert-match {
          display: block;
          min-width: 36rem;
          border-radius: 0.55rem;
          background: rgba(255, 255, 255, 0.65);
          padding: 0.45rem 0.55rem;
          color: #334155;
          line-height: 1.35;
          white-space: nowrap;
        }

        .reports-convert-match-list::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .reports-convert-match-list::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.5);
          border-radius: 999px;
        }

        .reports-convert-match-list::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.7);
          border-radius: 999px;
        }

        .reports-convert-match-list::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.85);
        }

        .reports-convert-check {
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.7rem;
          background: #ffffff;
          padding: 0.65rem 0.75rem;
          color: #334155;
          font-size: 0.82rem;
          line-height: 1.4;
        }

        .reports-convert-check-inline {
          margin-top: 0.55rem;
          border-color: #fcd34d;
          background: rgba(255, 255, 255, 0.75);
          color: #334155;
        }

        .reports-convert-check input {
          margin-top: 0.15rem;
        }

        .reports-convert-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.65rem;
          border-top: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 1rem 1.5rem;
        }

        /* Medium-screen rules rebalance report cards before the desktop table layout becomes cramped. */
        @media (max-width: 1024px) {
          .reports-data-card {
            border-radius: 18px;
          }

          .reports-data-card [data-slot='card-header'] {
            padding: 18px 16px 8px;
          }

          .reports-data-card [data-slot='card-content'] {
            padding: 0 16px 16px;
          }

          .reports-category-table,
          .reports-desktop-table,
          .reports-movement-desktop-table {
            display: none;
          }

          .reports-mobile-category-list,
          .reports-mobile-record-list,
          .reports-movement-mobile-list {
            display: grid;
            gap: 12px;
          }

          .reports-record-card,
          .reports-mobile-category-card,
          .reports-movement-card {
            border-radius: 15px;
            padding: 13px;
          }

          .reports-record-card,
          .reports-record-card:hover,
          .reports-record-card:active,
          .reports-record-card:focus-within {
            -webkit-tap-highlight-color: transparent;
            border-color: #e2e8f0;
            background: #ffffff;
            box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05);
          }

          .reports-desktop-table,
          .reports-movement-desktop-table,
          .reports-category-table {
            max-height: min(56vh, 560px);
          }

          .reports-pos-summary-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            justify-content: stretch;
          }

          .reports-comparison-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .reports-pos-summary-item {
            min-width: 0;
          }
        }

        /* Mobile rules replace dense tables with stacked records for inventory and movement reports. */
        @media (max-width: 767px) {
          .reports-page { padding: 14px; }
          .reports-page > .mb-8 { margin-bottom: 18px; }
          .reports-page > .mb-8 > .relative { border-radius: 18px; padding: 22px 18px; }
          .reports-page > .mb-8 .h-16.w-16 { height: 58px; width: 58px; border-radius: 16px; }
          .reports-page > .mb-8 .h-8.w-8 { height: 28px; width: 28px; }
          .reports-page > .mb-8 h1 { margin-bottom: 6px; font-size: 34px; line-height: 1.05; }
          .reports-page > .mb-8 p { font-size: 16px; line-height: 1.35; }

          .reports-config-card { margin-bottom: 16px; }
          .reports-config-card [data-reports-config-header] { padding: 18px 16px 0; }
          .reports-config-header {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            width: 100%;
          }
          .reports-config-title {
            flex: 1 1 auto;
            min-width: 0;
          }
          .reports-config-title h3 { font-size: 18px; line-height: 1.25; }
          .reports-config-title p {
            margin-top: 4px;
            max-width: 100%;
            font-size: 14px;
            line-height: 1.35;
            overflow-wrap: anywhere;
          }
          .reports-export-button {
            min-height: 44px;
            width: 178px;
            max-width: 42%;
            flex: 0 0 auto;
            justify-content: center;
            border-radius: 12px;
            box-sizing: border-box;
            padding-left: 14px;
            padding-right: 14px;
          }
          .reports-config-card [data-reports-config-content] { padding: 0 16px 16px; }
          .reports-config-stack { gap: 0; }
          .reports-period-panel { padding: 14px; border-radius: 14px; }
          .reports-period-label { margin-bottom: 10px; }
          .reports-filter-row { gap: 10px; }
          .reports-page [data-reports-control],
          .reports-page [data-reports-date-pill] { min-height: 46px; border-radius: 12px; font-size: 14px; }

          .reports-period-control-row,
          .reports-period-control-row.is-custom-range {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .reports-date-picker-pill {
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-width: 0;
            cursor: pointer;
            transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
          }
          .reports-date-picker-pill:hover {
            border-color: #ffff00;
            background: #ffffff;
          }
          .reports-date-picker-pill:focus-visible {
            outline: none;
            border-color: #ffff00;
            box-shadow: 0 0 0 3px rgba(255, 255, 0, 0.24);
          }
          .reports-date-picker-input {
            width: 150px;
            min-height: 34px;
            flex: 0 0 auto;
            border: 1px solid #dbe3ef;
            border-radius: 10px;
            background: #f8fafc;
            padding: 0 10px;
            color: #172033;
            font-size: 13px;
            font-weight: 700;
            outline: none;
            transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
          }
          .reports-date-picker-input:focus {
            border-color: #ffff00;
            background: #ffffff;
            box-shadow: 0 0 0 3px rgba(255, 255, 0, 0.24);
          }
          .reports-date-range-text {
            min-width: 0;
            flex: 1 1 auto;
            overflow-wrap: anywhere;
          }

          .reports-custom-range-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .reports-custom-date-field {
            display: grid;
            gap: 6px;
            min-width: 0;
          }

          .reports-custom-date-label {
            color: #475569;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
          }

          .reports-custom-date-control {
            padding-right: 12px;
          }

          .reports-metric-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: 12px; margin-bottom: 16px; }
          .reports-metric-card [data-reports-metric-content] { padding: 14px; }
          .reports-metric-card [data-reports-metric-row] { align-items: center; gap: 8px; }
          .reports-metric-card p:first-child { font-size: 12px; line-height: 1.2; }
          .reports-metric-card p:last-child { font-size: 26px; line-height: 1.05; }
          .reports-metric-card svg { height: 24px; width: 24px; }

          .reports-summary-card [data-reports-summary-header] { padding: 18px 16px 0; }
          .reports-summary-card [data-reports-summary-content] { padding: 0 16px 16px; }
          .reports-summary-card h3 { font-size: 18px; line-height: 1.25; }
          .reports-summary-card [data-reports-summary-header] p { margin-top: 4px; font-size: 14px; line-height: 1.35; }
          .reports-summary-stack { gap: 0; }
          .reports-summary-mini-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
          .reports-summary-mini-grid > div { padding: 12px; border-radius: 12px; }
          .reports-summary-mini-grid > div:last-child { grid-column: auto; }
          .reports-summary-mini-grid p:first-child { font-size: 12px; line-height: 1.2; white-space: nowrap; }
          .reports-summary-mini-grid p:last-child { font-size: 23px; line-height: 1.05; }

          .reports-category-title { margin-bottom: 10px; font-size: 18px; }
          .reports-category-table { display: none; }
          .reports-mobile-category-list { display: grid; gap: 10px; }
          .reports-mobile-category-list,
          .reports-mobile-record-list,
          .reports-movement-mobile-list {
            max-height: min(58vh, 500px);
          }
          .reports-empty-state { min-height: 190px; padding: 26px 16px; }
          .reports-empty-icon { height: 48px; width: 48px; border-radius: 14px; }
          .reports-empty-state h3 { font-size: 16px; }
          .reports-empty-state p { font-size: 13px; }
          .reports-mobile-category-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
          .reports-data-card { gap: 0; }
          .reports-data-card [data-slot='card-header'] { padding-bottom: 8px; }
          .reports-data-card [data-slot='card-content'] { padding-top: 0; }
          .reports-desktop-table { display: none; }
          .reports-mobile-record-list { display: grid; gap: 10px; }
          .reports-data-card [data-card-content] { overflow-x: visible; }
          .reports-pos-summary {
            grid-template-columns: 1fr;
            gap: 8px;
            margin-bottom: 12px;
            padding: 12px;
            border-radius: 14px;
          }
          .reports-pos-summary-copy {
            flex-direction: column;
            gap: 6px;
            padding-bottom: 10px;
          }
          .reports-pos-summary-copy h3 { font-size: 15px; }
          .reports-pos-summary-copy p {
            max-width: none;
            text-align: left;
            font-size: 12px;
            line-height: 1.45;
          }
          .reports-pos-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0;
          }
          .reports-pos-summary-item {
            border-bottom: 1px solid #e2e8f0;
            min-height: 64px;
            padding: 9px 12px;
          }
          .reports-pos-summary-item:nth-child(2n) {
            border-right: 0;
          }
          .reports-pos-summary-item:nth-last-child(-n + 2) {
            border-bottom: 0;
          }
          .reports-pos-summary-item:last-child { border-bottom: 0; }
          .reports-pos-summary-item-due { box-shadow: inset 3px 0 0 #22c55e; }
          .reports-pos-summary-item span { font-size: 10px; }
          .reports-pos-summary-item strong { font-size: 14px; }

          .reports-comparison-summary {
            padding: 0.7rem;
          }

          .reports-comparison-grid {
            grid-template-columns: 1fr;
            gap: 0.55rem;
          }

          .reports-comparison-item {
            padding: 0.65rem 0.75rem;
          }

          .reports-top-products-summary {
            padding: 0.7rem;
          }

          .reports-top-products-table {
            display: none;
          }

          .reports-top-products-mobile {
            display: grid;
            gap: 0.6rem;
          }

          .reports-top-product-stats {
            grid-template-columns: 1fr;
          }
          .reports-movement-desktop-table { display: none; }
          .reports-movement-mobile-list { display: grid; gap: 10px; }
          .reports-movement-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }

          .reports-convert-dialog {
            width: min(420px, calc(100vw - 1rem));
            max-width: min(420px, calc(100vw - 1rem)) !important;
            overflow: hidden;
          }

          .reports-convert-header {
            gap: 0.75rem;
            padding: 1rem 1rem 0;
          }

          .reports-convert-icon {
            width: 2.85rem;
            height: 2.85rem;
            border-radius: 0.85rem;
          }

          .reports-convert-form {
            gap: 0.8rem;
            padding: 0 1rem 1rem;
          }

          .reports-convert-match-list {
            max-height: min(6.5rem, 20vh);
          }

          .reports-convert-match {
            min-width: 32rem;
          }

          .reports-convert-grid {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }

          .reports-convert-footer {
            flex-direction: column-reverse;
            gap: 0.65rem;
            padding: 0.9rem 1rem;
          }

          .reports-convert-footer button {
            width: 100%;
          }
        }

        @media (max-width: 420px) {
          .reports-page { padding: 12px; }
          .reports-config-header { gap: 10px; }
          .reports-date-picker-pill {
            flex-direction: column;
            align-items: stretch;
          }
          .reports-date-picker-input {
            width: 100%;
          }
          .reports-export-button {
            width: 152px;
            max-width: 46%;
            font-size: 13px;
          }
          .reports-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .reports-metric-card [data-reports-metric-content] { padding: 12px; }
          .reports-summary-mini-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
          .reports-summary-mini-grid > div { padding: 10px 8px; }
          .reports-summary-mini-grid p:first-child { font-size: 11px; }
          .reports-summary-mini-grid p:last-child { font-size: 21px; }
          .reports-summary-mini-grid > div:last-child { grid-column: auto; }
          .reports-record-grid,
          .reports-record-grid-four,
          .reports-mobile-category-stats,
          .reports-movement-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .reports-pos-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .reports-pos-summary-item {
            border-bottom: 1px solid #e2e8f0;
            min-height: 58px;
            padding: 8px 12px;
          }
          .reports-pos-summary-item:nth-child(2n) {
            border-right: 0;
          }
          .reports-pos-summary-item:nth-last-child(-n + 2) {
            border-bottom: 0;
          }
          .reports-pos-summary-item:last-child { border-bottom: 0; }
        }

        @media (max-width: 360px) {
          .reports-record-grid,
          .reports-record-grid-four,
          .reports-mobile-category-stats,
          .reports-movement-stats {
            grid-template-columns: 1fr;
          }
          .reports-pos-summary-grid {
            grid-template-columns: 1fr;
          }
          .reports-pos-summary-item {
            border-right: 0;
          }
          .reports-pos-summary-item:nth-last-child(-n + 2) {
            border-bottom: 1px solid #e2e8f0;
          }
          .reports-pos-summary-item:last-child {
            border-bottom: 0;
          }
        }
      `}</style>

      <PageHeader
        title="Reports"
        subtitle="Generate comprehensive reports synchronized with real-time inventory data"
        icon={<FileText className="h-8 w-8" />}
      />

      <Card className="reports-config-card mb-6">
        <CardHeader data-reports-config-header>
          <div className="reports-config-header flex items-center justify-between">
            <div className="reports-config-title">
              <CardTitle>Report Configuration</CardTitle>
              <CardDescription>
                {isInventorySnapshotReport
                  ? 'Inventory reports show the current stock snapshot. Activity reports use the selected period.'
                  : 'Select time period, report type and filters'}
              </CardDescription>
            </div>
            <Button
              onClick={handleExportPdfClick}
              className="reports-export-button bg-slate-700 hover:bg-slate-800 text-white font-semibold shadow-md transition-all duration-300"
            >
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent data-reports-config-content>
          <div className="reports-config-stack space-y-6">
            {!isInventorySnapshotReport && (
              <div className="reports-period-panel bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-xl border-2 border-[#FFFF00]/30 shadow-sm">
                <div className="reports-period-label flex items-center gap-3 mb-3">
                  <Calendar className="w-5 h-5 text-[#FF0000]" />
                  <label className="font-semibold text-gray-900">Report Period:</label>
                </div>
                <div className={`reports-period-control-row ${reportPeriod === 'custom' ? 'is-custom-range' : ''}`}>
                  <div className="reports-period-select-field">
                    <label htmlFor="reports-period-select" className="reports-custom-date-label">Period</label>
                    <Select value={reportPeriod} onValueChange={value => setReportPeriod(value)}>
                      <SelectTrigger id="reports-period-select" data-reports-control className="bg-white border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {reportPeriod === 'custom' ? (
                    <div className="reports-custom-range-grid">
                      <div className="reports-custom-date-field">
                        <label htmlFor="reports-custom-start" className="reports-custom-date-label">Start Date</label>
                        <div data-reports-control className="reports-custom-date-control">
                          <span className="reports-custom-date-display">{formatDateInputDisplay(customStartDate)}</span>
                          <Calendar className="reports-custom-date-icon" aria-hidden="true" />
                          <Input
                            id="reports-custom-start"
                            type="date"
                            value={customStartDate}
                            onChange={event => setCustomStartDate(event.target.value)}
                            className="reports-custom-date-native"
                            aria-label="Select custom report start date"
                          />
                        </div>
                      </div>
                      <div className="reports-custom-date-field">
                        <label htmlFor="reports-custom-end" className="reports-custom-date-label">End Date</label>
                        <div data-reports-control className="reports-custom-date-control">
                          <span className="reports-custom-date-display">{formatDateInputDisplay(customEndDate)}</span>
                          <Calendar className="reports-custom-date-icon" aria-hidden="true" />
                          <Input
                            id="reports-custom-end"
                            type="date"
                            value={customEndDate}
                            onChange={event => setCustomEndDate(event.target.value)}
                            className="reports-custom-date-native"
                            aria-label="Select custom report end date"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      data-reports-date-pill
                      className="reports-date-picker-pill flex-1 flex bg-white px-4 py-2 rounded-lg border border-gray-300 shadow-sm"
                      role="button"
                      tabIndex={0}
                      onClick={openReportDatePicker}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openReportDatePicker();
                        }
                      }}
                      aria-label={`Open date picker for ${reportPeriod} report date`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {isRefreshing ? (
                          <RefreshCw className="w-4 h-4 shrink-0 text-[#FF0000] animate-spin" />
                        ) : (
                          <Calendar className="w-4 h-4 shrink-0 text-gray-600" />
                        )}
                        <span className={`reports-date-range-text text-sm text-slate-950 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
                          {getDateRange()}
                        </span>
                      </div>
                      <input
                        ref={reportDateInputRef}
                        className="reports-date-picker-input"
                        type="date"
                        value={selectedReportDate}
                        onClick={event => event.stopPropagation()}
                        onChange={event => setSelectedReportDate(event.target.value)}
                        aria-label={`Select ${reportPeriod} report date`}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="reports-filter-row flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block text-slate-950">Report Type</label>
                <Select value={reportType} onValueChange={handleReportTypeChange}>
                  <SelectTrigger data-reports-control className="border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedReportTypes.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {reportUsesCategoryFilter && (
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block text-slate-950">Filter by Category</label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger data-reports-control className="border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {reportType === 'supplier-reorder' && (
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block text-slate-950">Supplier to Prepare</label>
                  <Select
                    value={selectedReorderSupplier}
                    onValueChange={setSelectedReorderSupplier}
                    disabled={getAllSupplierReorderGroups().length === 0}
                  >
                    <SelectTrigger data-reports-control className="border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]">
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAllSupplierReorderGroups().map(group => (
                        <SelectItem key={group.supplier} value={group.supplier}>
                          {group.supplier}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isSalesExportDialogOpen} onOpenChange={setIsSalesExportDialogOpen}>
        <DialogContent className="reports-sales-export-dialog border border-slate-200 bg-white p-0 shadow-2xl">
          <div className="reports-sales-export-body">
            <DialogHeader className="text-left">
              <DialogTitle className="reports-sales-export-title">
                Export Sales-Based Stock Movement PDF
              </DialogTitle>
              <DialogDescription className="reports-sales-export-description">
                Choose the PDF version you need for review or recordkeeping.
              </DialogDescription>
            </DialogHeader>

            <div className="reports-sales-export-options">
              <button
                type="button"
                className="reports-sales-export-option"
                onClick={() => exportSalesMovementPdf('full')}
              >
                <span className="reports-sales-export-option-title">Export Full Report</span>
                <span className="reports-sales-export-option-text">
                  Includes the sales summary, comparison, top-selling products, and detailed stock deductions.
                </span>
              </button>
              <button
                type="button"
                className="reports-sales-export-option"
                onClick={() => exportSalesMovementPdf('deductions-only')}
              >
                <span className="reports-sales-export-option-title">Export Deductions Only</span>
                <span className="reports-sales-export-option-text">
                  Includes only the detailed stock deductions table and report details.
                </span>
              </button>
            </div>
          </div>
          <DialogFooter className="reports-sales-export-footer">
            <Button type="button" variant="outline" className="reports-sales-export-cancel" onClick={() => setIsSalesExportDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className={`reports-metric-grid transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
        {getReportMetrics().map(metric => (
          <Card key={metric.label} className={`reports-metric-card border-l-4 ${metric.color}`}>
            <CardContent className="pt-6" data-reports-metric-content>
              <div className="flex items-center justify-between" data-reports-metric-row>
                <div>
                  <p className="text-sm text-slate-950 mb-1">{metric.label}</p>
                  <p className="text-3xl font-bold text-slate-900">{metric.value}</p>
                </div>
                {metric.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {reportType === 'actual-earnings' && (
        <Card className={`reports-data-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader data-card-header>
            <CardTitle>Actual Earnings</CardTitle>
            <CardDescription>Sales less the cost of goods sold in the selected period.</CardDescription>
          </CardHeader>
          <CardContent data-card-content>
            {getEarningsProductRows().length === 0 ? (
              renderReportsEmptyState({
                icon: Wallet,
                title: 'No earnings data found',
                message: 'Completed sales with item lines will appear here for the selected period.'
              })
            ) : (
              <>
                {(() => {
                  const rows = getEarningsProductRows();
                  const paged = paginateItems(rows);
                  return (
                    <>
                      <div className="reports-top-products-table">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Rank</TableHead>
                              <TableHead>Product</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Qty Sold</TableHead>
                              <TableHead>Sales</TableHead>
                              <TableHead>Cost of Goods Sold</TableHead>
                              <TableHead>Actual Profit</TableHead>
                              <TableHead>Margin</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paged.pageItems.map(product => (
                              <TableRow key={`${product.rank}-${product.itemName}-${product.category}`}>
                                <TableCell><Badge variant="outline" className="reports-rank-badge">#{product.rank}</Badge></TableCell>
                                <TableCell className="font-medium">{product.itemName}</TableCell>
                                <TableCell>{product.category}</TableCell>
                                <TableCell>{product.quantitySold.toLocaleString()}</TableCell>
                                <TableCell>{formatCurrency(product.totalSales)}</TableCell>
                                <TableCell>{formatCurrency(product.puhunanUsed)}</TableCell>
                                <TableCell className={product.actualProfit >= 0 ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>{formatCurrency(product.actualProfit)}</TableCell>
                                <TableCell>{formatPercentage(product.profitMargin)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="reports-top-products-mobile">
                        {paged.pageItems.map(product => (
                          <article key={`${product.rank}-${product.itemName}-${product.category}-earnings-mobile`} className="reports-top-product-card">
                            <div className="reports-top-product-heading">
                              <Badge variant="outline" className="reports-rank-badge">#{product.rank}</Badge>
                              <div>
                                <h4>{product.itemName}</h4>
                                <p>{product.category}</p>
                              </div>
                            </div>
                            <div className="reports-top-product-stats">
                              <span>Sales <strong>{formatCurrency(product.totalSales)}</strong></span>
                              <span>Cost <strong>{formatCurrency(product.puhunanUsed)}</strong></span>
                              <span>Profit <strong>{formatCurrency(product.actualProfit)}</strong></span>
                              <span>Margin <strong>{formatPercentage(product.profitMargin)}</strong></span>
                            </div>
                          </article>
                        ))}
                      </div>
                      {renderPaginationControls(paged.totalPages, paged.page, undefined, paged.totalItems)}
                    </>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {reportType === 'summary' && (
        <Card className={`reports-summary-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader data-reports-summary-header>
            <CardTitle>Stock Status Breakdown</CardTitle>
            <CardDescription>Current item distribution by stock condition</CardDescription>
          </CardHeader>
          <CardContent data-reports-summary-content>
            <div className="reports-summary-stack space-y-6">
              <div className="reports-summary-mini-grid grid grid-cols-3 gap-4">
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <p className="text-sm text-green-700 mb-1">In Stock</p>
                  <p className="text-2xl font-bold text-green-900">{inStockItems}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-700 mb-1">Low Stock</p>
                  <p className="text-2xl font-bold text-yellow-900">{lowStockItems}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700 mb-1">Out of Stock</p>
                  <p className="text-2xl font-bold text-red-900">{outOfStockItems}</p>
                </div>
              </div>

              <div className="reports-category-breakdown">
                <h3 className="reports-category-title font-semibold mb-3">Category Breakdown</h3>
                {getCategorySummary().length === 0 ? (
                  renderReportsEmptyState({
                    icon: Package,
                    title: 'No category breakdown available',
                    message: 'No current inventory items are available yet. Add inventory records first.'
                  })
                ) : (
                  <>
                    <div className="reports-category-table">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Total Units</TableHead>
                            <TableHead>Low Stock</TableHead>
                            <TableHead>Out of Stock</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getCategorySummary().map(cat => (
                            <TableRow key={cat.category}>
                              <TableCell className="font-medium">{cat.category}</TableCell>
                              <TableCell>{cat.itemCount}</TableCell>
                              <TableCell>{cat.totalQty}</TableCell>
                              <TableCell>
                                {cat.lowStock > 0 ? <Badge className={getStatusCountBadgeClass('Low Stock')}>{cat.lowStock}</Badge> : <Badge variant="outline">0</Badge>}
                              </TableCell>
                              <TableCell>
                                {cat.outOfStock > 0 ? <Badge className={getStatusCountBadgeClass('Out of Stock')}>{cat.outOfStock}</Badge> : <Badge variant="outline">0</Badge>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="reports-mobile-category-list">
                      {getCategorySummary().map(cat => (
                        <article key={cat.category} className="reports-mobile-category-card">
                          <div className="reports-mobile-category-top">
                            <h4 className="reports-mobile-category-name">{cat.category}</h4>
                            {cat.outOfStock > 0 ? (
                              <Badge className={getStatusCountBadgeClass('Out of Stock')}>{cat.outOfStock} Out of Stock</Badge>
                            ) : cat.lowStock > 0 ? (
                              <Badge className={getStatusCountBadgeClass('Low Stock')}>{cat.lowStock} Low Stock</Badge>
                            ) : (
                              <Badge className={getStatusCountBadgeClass('Clear')}>Clear</Badge>
                            )}
                          </div>
                          <div className="reports-mobile-category-stats">
                            <div className="reports-mobile-category-stat">
                              <span>Items</span>
                              <strong>{cat.itemCount}</strong>
                            </div>
                            <div className="reports-mobile-category-stat">
                              <span>Total Units</span>
                              <strong>{cat.totalQty}</strong>
                            </div>
                            <div className="reports-mobile-category-stat">
                              <span>Low Stock</span>
                              <strong className="text-yellow-800">{cat.lowStock}</strong>
                            </div>
                            <div className="reports-mobile-category-stat">
                              <span>Out of Stock</span>
                              <strong className="text-red-800">{cat.outOfStock}</strong>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {reportType === 'detailed' && (
        <Card className={`reports-data-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle>Detailed Inventory</CardTitle>
            <CardDescription>Current inventory snapshot - {selectedCategory === 'all' ? 'all categories' : `${selectedCategory} category`} - {getFilteredInventory().length} items</CardDescription>
          </CardHeader>
          <CardContent>
            {getFilteredInventory().length === 0 ? (
              renderReportsEmptyState({
                icon: Package,
                title: 'No inventory items found',
                message: `No active inventory records match${selectedCategory === 'all' ? '' : ` the ${selectedCategory} category`}.`
              })
            ) : (
              <>
                {(() => {
                  const filtered = getFilteredInventory();
                  const paged = paginateItems(filtered);
                  return (
                    <>
                      <div className="reports-desktop-table reports-purchase-table">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item Code</TableHead>
                              <TableHead>Item Name</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Supplier</TableHead>
                              <TableHead>Quantity</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Last Updated</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paged.pageItems.map(item => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono text-sm">{getDisplayItemCode(item)}</TableCell>
                                <TableCell>{item.name}</TableCell>
                                <TableCell>{getCategoryDisplay(item)}</TableCell>
                                <TableCell>{item.supplierName || 'Unassigned'}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>
                                  <Badge className={getStockStatusBadgeClass(item.status)}>
                                    {item.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatDateTime(item.lastUpdated)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="reports-mobile-record-list">
                        {paged.pageItems.map(item => renderInventoryMobileCard(item))}
                      </div>
                      {renderPaginationControls(paged.totalPages, paged.page, undefined, paged.totalItems)}
                    </>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {reportType === 'low-stock' && (
        <Card className={`reports-data-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle>Low Stock Alert</CardTitle>
            <CardDescription>
              Current restocking attention{selectedCategory === 'all' ? '' : ` for ${selectedCategory}`} - out of stock first, then low stock - {getLowStockItems().length} items
            </CardDescription>
          </CardHeader>
          <CardContent>
            {getLowStockItems().length === 0 ? (
              renderReportsEmptyState({
                icon: AlertTriangle,
                title: 'No low-stock items found',
                message: `No current low-stock or out-of-stock items require attention${selectedCategory === 'all' ? '' : ` in ${selectedCategory}`}.`
              })
            ) : (
              <>
                {(() => {
                  const rows = getLowStockItems();
                  const paged = paginateItems(rows);
                  return (
                    <>
                      <div className="reports-desktop-table reports-low-stock-table">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Item Code</TableHead>
                              <TableHead>Item Name</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Supplier</TableHead>
                              <TableHead>Quantity</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Last Updated</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paged.pageItems.map(item => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono text-sm">{getDisplayItemCode(item)}</TableCell>
                                <TableCell>{item.name}</TableCell>
                                <TableCell>{getCategoryDisplay(item)}</TableCell>
                                <TableCell>{item.supplierName || 'Unassigned'}</TableCell>
                                <TableCell className="font-bold">{item.quantity}</TableCell>
                                <TableCell>
                                  <Badge className={getStockStatusBadgeClass(item.status)}>
                                    {item.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatDateTime(item.lastUpdated)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="reports-mobile-record-list">
                        {paged.pageItems.map(item => renderInventoryMobileCard(item))}
                      </div>
                      {renderPaginationControls(paged.totalPages, paged.page, undefined, paged.totalItems)}
                    </>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {reportType === 'supplier-reorder' && (
        <div className={`space-y-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          {getSupplierReorderGroups().length === 0 ? (
            <Card className="reports-data-card">
              <CardContent>
                {renderReportsEmptyState({
                  icon: Package,
                  title: 'No reorder items found',
                  message: `No current low-stock, out-of-stock, or supplier planning review items match${selectedCategory === 'all' ? '' : ` the ${selectedCategory} category`}${selectedReorderSupplier ? ` for ${selectedReorderSupplier}` : ''}.`
                })}
              </CardContent>
            </Card>
          ) : getSupplierReorderGroups().map(group => (
            <Card key={group.supplier} className="reports-data-card">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>Supplier Reorder List - {group.supplier}</CardTitle>
                    <CardDescription>
                      {formatItemCount(group.itemCount)} needing reorder review - {getSelectedReorderItems(group).length} selected for draft.
                    </CardDescription>
                  </div>
                  <div className="reports-reorder-card-actions">
                    {group.outOfStock > 0 && <Badge className={getStatusCountBadgeClass('Out of Stock')}>{group.outOfStock} Out of Stock</Badge>}
                    {group.lowStock > 0 && <Badge className={getStatusCountBadgeClass('Low Stock')}>{group.lowStock} Low Stock</Badge>}
                    {group.reviewSuggested > 0 && <Badge variant="outline">{group.reviewSuggested} For Review</Badge>}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="reports-reorder-selection-action"
                      onClick={() => setGroupReorderSelection(group, getSelectedReorderItems(group).length !== group.items.length)}
                    >
                      {getSelectedReorderItems(group).length === group.items.length ? 'Clear Selection' : 'Select All'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="reports-generate-draft-button"
                      onClick={() => handleGeneratePurchaseDraft(group)}
                      disabled={getSelectedReorderItems(group).length === 0}
                      title="Prepare these reorder items as a purchase draft for review in Purchases"
                    >
                      <PackagePlus className="mr-2 h-4 w-4" />
                      Generate Purchase Draft
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="reports-desktop-table reports-supplier-reorder-table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Select</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Manual Limit</TableHead>
                        <TableHead>Suggested Point</TableHead>
                        <TableHead>Lead Time</TableHead>
                        <TableHead>Suggested Qty</TableHead>
                        <TableHead>Final Order Qty</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="reports-reorder-select-cell">
                            <input
                              type="checkbox"
                              className="reports-reorder-checkbox"
                              checked={isReorderItemSelected(item)}
                              onChange={() => toggleReorderItemSelection(item)}
                              aria-label={`Include ${item.name} in purchase draft`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">{getDisplayItemCode(item)}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{getCategoryDisplay(item)}</TableCell>
                          <TableCell className="font-semibold">{item.quantity}</TableCell>
                          <TableCell>{item.lowStockThreshold}</TableCell>
                          <TableCell className="font-semibold">{getSuggestedPointValue(item)}</TableCell>
                          <TableCell>{formatSupplierLeadTime(item)}</TableCell>
                          <TableCell className="font-semibold">{item.neededQuantity}</TableCell>
                          <TableCell>
                            <Input
                              value={reorderQuantities[getReorderQuantityDraftKey(item)] ?? String(item.neededQuantity || 0)}
                              onChange={event => updatePreparedReorderQuantity(item, event.target.value)}
                              inputMode="numeric"
                              aria-label={`Final order quantity for ${item.name}`}
                              title="This quantity is used in the PDF export and purchase draft."
                              className="reports-reorder-quantity-input"
                            />
                          </TableCell>
                          <TableCell>
                            {item.reorderReviewSuggested ? (
                              <Badge variant="outline">For Review</Badge>
                            ) : (
                              <Badge className={getStockStatusBadgeClass(item.status)}>
                                {item.status}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="reports-mobile-record-list">
                  {group.items.map(item => (
                    <article key={item.id} className="reports-record-card reports-reorder-record-card">
                      <div className="reports-record-top">
                        <div className="reports-reorder-mobile-title">
                          <input
                            type="checkbox"
                            className="reports-reorder-checkbox"
                            checked={isReorderItemSelected(item)}
                            onChange={() => toggleReorderItemSelection(item)}
                            aria-label={`Include ${item.name} in purchase draft`}
                          />
                          <div className="min-w-0">
                          <p className="reports-record-code">{getDisplayItemCode(item)}</p>
                          <h4 className="reports-record-name">{item.name}</h4>
                          <p className="reports-record-meta">{getCategoryDisplay(item)}</p>
                          </div>
                        </div>
                        {item.reorderReviewSuggested ? (
                          <Badge variant="outline" className="shrink-0">For Review</Badge>
                        ) : (
                          <Badge className={`shrink-0 ${getStockStatusBadgeClass(item.status)}`}>{item.status}</Badge>
                        )}
                      </div>
                      <div className="reports-record-grid reports-record-grid-four">
                        <div className="reports-record-stat"><span>Current</span><strong>{item.quantity}</strong></div>
                        <div className="reports-record-stat"><span>Manual Limit</span><strong>{item.lowStockThreshold}</strong></div>
                        <div className="reports-record-stat"><span>Suggested Point</span><strong>{getSuggestedPointValue(item)}</strong></div>
                        <div className="reports-record-stat"><span>Lead Time</span><strong>{formatSupplierLeadTime(item)}</strong></div>
                        <div className="reports-record-stat"><span>Suggested</span><strong>{item.neededQuantity}</strong></div>
                        <div className="reports-record-stat reports-reorder-quantity-card-field">
                          <span>Final Order Qty</span>
                          <Input
                            value={reorderQuantities[getReorderQuantityDraftKey(item)] ?? String(item.neededQuantity || 0)}
                            onChange={event => updatePreparedReorderQuantity(item, event.target.value)}
                            inputMode="numeric"
                            aria-label={`Final order quantity for ${item.name}`}
                            title="This quantity is used in the PDF export and purchase draft."
                            className="reports-reorder-quantity-input"
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reportType === 'untracked-sales' && (
        <Card className={`reports-data-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle>Untracked Sales Items</CardTitle>
            <CardDescription>Non-inventory items recorded in sales only - {getUntrackedSalesItems().length} item groups</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const rows = getUntrackedSalesItems();
              const paged = paginateItems(rows);
              if (!rows || rows.length === 0) {
                return renderReportsEmptyState({
                  icon: FileText,
                  title: 'No untracked sales items found',
                  message: `No non-inventory sale items match the selected ${reportPeriod} period.`
                });
              }
              return (
                <>
                  <div className="reports-desktop-table">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Description</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Total Qty Sold</TableHead>
                          <TableHead>Total Sales</TableHead>
                          <TableHead>Times Sold</TableHead>
                          <TableHead>Last Sold</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Review</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paged.pageItems.map(item => (
                          <TableRow key={`${item.itemName}-${item.category}`}>
                            <TableCell className="font-semibold">{item.itemName}</TableCell>
                            <TableCell>{getCategoryDisplay(item)}</TableCell>
                            <TableCell>{item.totalQuantity}</TableCell>
                            <TableCell>{formatCurrency(item.totalSalesAmount)}</TableCell>
                            <TableCell>{item.timesSold}</TableCell>
                            <TableCell>{formatDateTime(item.lastSoldAt)}</TableCell>
                            <TableCell>
                              {item.reviewStatus === 'tracked' ? (
                                <Badge className="border-green-200 bg-green-50 text-green-700 hover:bg-green-50">Now Tracked</Badge>
                              ) : (
                                <Badge variant="outline">Non-Inventory</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="reports-review-button"
                                onClick={() => openConvertUntrackedItemDialog(item)}
                                disabled={!isAdminRole(user?.role) || item.reviewStatus === 'tracked'}
                                title={
                                  item.reviewStatus === 'tracked'
                                    ? `Already tracked as ${item.activeInventoryMatch?.name || 'an inventory item'}`
                                    : isAdminRole(user?.role)
                                      ? 'Review and add this manual item to Inventory'
                                      : 'Only Admin / Owner can add items to Inventory'
                                }
                              >
                                <PackagePlus className="mr-2 h-4 w-4" />
                                {item.reviewStatus === 'tracked' ? 'Tracked' : 'Review'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="reports-mobile-record-list">
                    {paged.pageItems.map(item => (
                      <article key={`${item.itemName}-${item.category}`} className="reports-record-card">
                        <div className="reports-record-top">
                          <div className="min-w-0">
                            <h4 className="reports-record-name">{item.itemName}</h4>
                            <p className="reports-record-meta">{getCategoryDisplay(item)}</p>
                          </div>
                          {item.reviewStatus === 'tracked' ? (
                            <Badge className="shrink-0 border-green-200 bg-green-50 text-green-700 hover:bg-green-50">Now Tracked</Badge>
                          ) : (
                            <Badge variant="outline">Non-Inventory</Badge>
                          )}
                        </div>
                        <div className="reports-record-grid reports-record-grid-four">
                          <div className="reports-record-stat"><span>Qty Sold</span><strong>{item.totalQuantity}</strong></div>
                          <div className="reports-record-stat"><span>Total Sales</span><strong>{formatCurrency(item.totalSalesAmount)}</strong></div>
                          <div className="reports-record-stat"><span>Times Sold</span><strong>{item.timesSold}</strong></div>
                          <div className="reports-record-stat"><span>Last Sold</span><strong>{formatDateTime(item.lastSoldAt)}</strong></div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="reports-review-button mt-3 w-full justify-center"
                          onClick={() => openConvertUntrackedItemDialog(item)}
                          disabled={!isAdminRole(user?.role) || item.reviewStatus === 'tracked'}
                        >
                          <PackagePlus className="mr-2 h-4 w-4" />
                          {item.reviewStatus === 'tracked' ? 'Already in Inventory' : 'Review for Inventory'}
                        </Button>
                      </article>
                    ))}
                  </div>

                  {renderPaginationControls(paged.totalPages, paged.page, undefined, paged.totalItems)}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {reportType === 'purchases' && (
        <Card className={`reports-data-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle>Purchase Report</CardTitle>
            <CardDescription>{getFilteredPurchaseTransactions().length} purchase entries for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {getFilteredPurchaseTransactions().length === 0 ? (
              renderReportsEmptyState({
                icon: FileText,
                title: 'No purchases found',
                message: `No purchase entries match the selected ${reportPeriod} period.`
              })
            ) : (
              (() => {
                const purchases = getFilteredPurchaseTransactions();
                const paged = paginateItems(purchases);
                return (
                  <>
                    <div className="reports-desktop-table reports-purchases-report-table">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Purchase No.</TableHead>
                            <TableHead>Transaction Date</TableHead>
                            <TableHead>Encoded Date</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Document</TableHead>
                            <TableHead>Terms</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead className="reports-purchase-total-head">Total</TableHead>
                            <TableHead>Remarks</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paged.pageItems.map(purchase => (
                            <TableRow key={purchase.id}>
                              <TableCell className="font-semibold">{purchase.purchaseNumber}</TableCell>
                              <TableCell>{formatDateTime(purchase.createdAt)}</TableCell>
                              <TableCell>{formatEncodedDate(purchase)}</TableCell>
                              <TableCell>{purchase.supplierName}</TableCell>
                              <TableCell>{formatPurchaseDocumentLabel(purchase.documentType, purchase.documentNumber, purchase.documentTypeNote)}</TableCell>
                              <TableCell>{formatPurchasePaymentTerms(purchase.paymentTerms, purchase.creditTermsDays)}</TableCell>
                              <TableCell>{purchase.totalQuantity}</TableCell>
                              <TableCell className="reports-purchase-total-cell">{formatCurrency(purchase.subtotalAmount)}</TableCell>
                              <TableCell className="reports-purchase-remarks-cell">{getPurchaseRemarksText(purchase) || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="reports-mobile-record-list">
                      {paged.pageItems.map(purchase => (
                        <article key={purchase.id} className="reports-record-card reports-purchase-record-card">
                          <div className="reports-record-top">
                            <div className="min-w-0">
                              <p className="reports-record-code">Transaction: {formatDateTime(purchase.createdAt)}</p>
                              {isBackdatedRecord(purchase) && (
                                <p className="reports-record-meta">Encoded: {formatDateTime(purchase.encodedAt)}</p>
                              )}
                              <h4 className="reports-record-name">{purchase.purchaseNumber}</h4>
                              <p className="reports-record-meta">
                                {purchase.supplierName || 'Unassigned supplier'}
                              </p>
                            </div>
                          </div>
                          <div className="reports-record-grid reports-record-grid-four">
                            <div className="reports-record-stat">
                              <span>Document</span>
                              <strong>{formatPurchaseDocumentLabel(purchase.documentType, purchase.documentNumber, purchase.documentTypeNote)}</strong>
                            </div>
                            <div className="reports-record-stat">
                              <span>Terms</span>
                              <strong>{formatPurchasePaymentTerms(purchase.paymentTerms, purchase.creditTermsDays)}</strong>
                            </div>
                            <div className="reports-record-stat">
                              <span>Quantity</span>
                              <strong>{formatUnitCount(purchase.totalQuantity)}</strong>
                            </div>
                            <div className="reports-record-stat reports-purchase-total-stat">
                              <span>Total</span>
                              <strong>{formatCurrency(purchase.subtotalAmount)}</strong>
                            </div>
                          </div>
                          {getPurchaseRemarksText(purchase) && (
                            <p className="reports-purchase-note">{getPurchaseRemarksText(purchase)}</p>
                          )}
                        </article>
                      ))}
                    </div>
                    {renderPaginationControls(paged.totalPages, paged.page, undefined, paged.totalItems)}
                  </>
                );
              })()
            )}
          </CardContent>
        </Card>
      )}

      {reportType === 'category' && (
        <div className={`space-y-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          {categories.length === 0 ? (
            <Card className="reports-data-card">
              <CardContent>
                {renderReportsEmptyState({
                  icon: Package,
                  title: 'No category data found',
                  message: 'No current inventory items are available for category analysis. Add inventory records first.'
                })}
              </CardContent>
            </Card>
          ) : categories.map(category => {
            const categoryItems = computedReportInventory.filter(item => item.category === category);
            const categoryQty = categoryItems.reduce((sum, item) => sum + item.quantity, 0);
            const categoryLowStock = categoryItems.filter(item => item.status === 'Low Stock').length;
            const categoryOutOfStock = categoryItems.filter(item => item.status === 'Out of Stock').length;
            return (
              <Card key={category} className="reports-data-card reports-category-analysis-card">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>{category}</CardTitle>
                      <CardDescription>{formatItemCount(categoryItems.length)} • {formatUnitCount(categoryQty)} total</CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {categoryLowStock > 0 && <Badge className={getStatusCountBadgeClass('Low Stock')}>{categoryLowStock} Low Stock</Badge>}
                      {categoryOutOfStock > 0 && <Badge className={getStatusCountBadgeClass('Out of Stock')}>{categoryOutOfStock} Out of Stock</Badge>}
                    </div>
                  </div>
                </CardHeader>
                      <CardContent>
                        {(() => {
                          const paged = paginateItems(categoryItems, getCategoryPage(category));
                          return (
                            <>
                              <div className="reports-desktop-table">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Item Code</TableHead>
                                      <TableHead>Item Name</TableHead>
                                      <TableHead>Supplier</TableHead>
                                      <TableHead>Quantity</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Last Updated</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {paged.pageItems.map(item => (
                                      <TableRow key={item.id}>
                                        <TableCell className="font-mono text-sm">{getDisplayItemCode(item)}</TableCell>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell>{item.supplierName || 'Unassigned'}</TableCell>
                                        <TableCell>{item.quantity}</TableCell>
                                        <TableCell>
                                          <Badge className={getStockStatusBadgeClass(item.status)}>
                                            {item.status}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>{formatDateTime(item.lastUpdated)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                              <div className="reports-mobile-record-list">
                                {paged.pageItems.map(item => renderInventoryMobileCard(item, { showCategory: false }))}
                              </div>
                              {renderPaginationControls(paged.totalPages, paged.page, p => setCategoryPage(category, p), paged.totalItems)}
                            </>
                          );
                        })()}
                      </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(reportType === 'movements' || reportType === 'sales-movements') && (
        <Card className={`reports-data-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <CardHeader>
            <CardTitle>{reportType === 'sales-movements' ? 'Sales-Based Stock Movement Report' : 'Stock Movement History'}</CardTitle>
            <CardDescription>
              {selectedCategory === 'all' ? 'All categories' : `${selectedCategory} category`} - {reportType === 'sales-movements' ? getSalesMovementRows().length : getFilteredMovements({ salesOnly: false }).length} {reportType === 'sales-movements' ? 'completed sales deductions' : 'movements'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(reportType === 'sales-movements' ? getSalesMovementRows().length : getFilteredMovements({ salesOnly: false }).length) === 0 ? (
              renderReportsEmptyState({
                icon: RefreshCw,
                title: reportType === 'sales-movements' ? 'No sales deductions found' : 'No stock movements found',
                message: reportType === 'sales-movements'
                  ? `No sales-based inventory deductions match the selected ${reportPeriod} period${selectedCategory === 'all' ? '' : ` and ${selectedCategory} category`}. Try another date range or record a sale first.`
                  : `No stock in, stock out, or sales movement records match the selected ${reportPeriod} period${selectedCategory === 'all' ? '' : ` and ${selectedCategory} category`}. Try another date range or category filter.`
              })
            ) : (
              <>
                {reportType === 'sales-movements' && (
                  <>
                    <div className="reports-pos-summary">
                      <div className="reports-pos-summary-copy">
                        <h3>Sales Payment Summary</h3>
                        <p>
                          {selectedCategory === 'all'
                            ? 'Tracked inventory sales for the selected period. Subtotal is before discounts; Amount Due includes discounts and delivery charges.'
                            : 'Tracked sales in this category only. Discounts are shared proportionally; delivery charges remain in the all-category total.'}
                        </p>
                      </div>
                      <div className="reports-pos-summary-grid">
                        <div className="reports-pos-summary-item">
                          <span>Subtotal</span>
                          <strong>{formatCurrency(getSalesFinancialSummary().subtotal)}</strong>
                        </div>
                        <div className="reports-pos-summary-item">
                          <span>Delivery Charge</span>
                          <strong>{formatCurrency(getSalesFinancialSummary().deliveryCharge)}</strong>
                        </div>
                        <div className="reports-pos-summary-item">
                          <span>Cash Transactions</span>
                          <strong>{getSalesFinancialSummary().cashTransactions}</strong>
                        </div>
                        <div className="reports-pos-summary-item">
                          <span>Non-cash Transactions</span>
                          <strong>{getSalesFinancialSummary().nonCashTransactions}</strong>
                        </div>
                      </div>
                    </div>
                    {(() => {
                      const comparison = getSalesComparisonSummary();
                      const amountDueComparison = formatReportComparison(
                        comparison.current.amountDue,
                        comparison.previous.amountDue
                      );
                      const transactionComparison = formatReportComparison(
                        comparison.current.transactions,
                        comparison.previous.transactions,
                        {
                          percentage: false,
                          emptyLabel: 'No transactions',
                          unitSingular: 'transaction',
                          unitPlural: 'transactions'
                        }
                      );
                      const unitsComparison = formatReportComparison(
                        comparison.current.unitsSold,
                        comparison.previous.unitsSold,
                        {
                          percentage: false,
                          emptyLabel: 'No units sold',
                          unitSingular: 'unit',
                          unitPlural: 'units'
                        }
                      );

                      return (
                        <div className="reports-comparison-summary">
                          <div className="reports-pos-summary-copy">
                            <h3>Previous Period Comparison</h3>
                            <p>{getComparisonSummaryDescription()}</p>
                          </div>
                          <div className="reports-comparison-grid">
                            <div className="reports-comparison-item">
                              <span>Amount Due</span>
                              <strong>{formatCurrency(comparison.current.amountDue)}</strong>
                              <em className={`reports-comparison-badge comparison-${amountDueComparison.direction}`}>
                                {amountDueComparison.label}
                              </em>
                            </div>
                            <div className="reports-comparison-item">
                              <span>Transactions</span>
                              <strong>{comparison.current.transactions}</strong>
                              <em className={`reports-comparison-badge comparison-${transactionComparison.direction}`}>
                                {transactionComparison.label}
                              </em>
                            </div>
                            <div className="reports-comparison-item">
                              <span>Units Sold</span>
                              <strong>{comparison.current.unitsSold}</strong>
                              <em className={`reports-comparison-badge comparison-${unitsComparison.direction}`}>
                                {unitsComparison.label}
                              </em>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {getTopSellingProducts().length > 0 && (
                      <div className="reports-top-products-summary">
                        <div className="reports-pos-summary-copy">
                          <h3>Top-Selling Products</h3>
                          <p>Products are ranked by quantity sold for the selected report period.</p>
                        </div>
                        <div className="reports-top-products-table">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Rank</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Qty Sold</TableHead>
                                <TableHead>Sales</TableHead>
                                <TableHead>Sales Share</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getTopSellingProducts().map(product => (
                                <TableRow key={`${product.rank}-${product.itemName}-${product.category}`}>
                                  <TableCell>
                                    <Badge variant="outline" className="reports-rank-badge">#{product.rank}</Badge>
                                  </TableCell>
                                  <TableCell className="font-semibold text-slate-900">{product.itemName}</TableCell>
                                  <TableCell>{product.category}</TableCell>
                                  <TableCell className="font-semibold">{product.quantitySold}</TableCell>
                                  <TableCell>{formatCurrency(product.revenue)}</TableCell>
                                  <TableCell>{formatPercentage(product.revenueShare)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="reports-top-products-mobile">
                          {getTopSellingProducts().map(product => (
                            <article key={`${product.rank}-${product.itemName}-${product.category}-mobile`} className="reports-top-product-card">
                              <div className="reports-top-product-heading">
                                <Badge variant="outline" className="reports-rank-badge">#{product.rank}</Badge>
                                <div className="min-w-0">
                                  <h4>{product.itemName}</h4>
                                  <p>{product.category}</p>
                                </div>
                              </div>
                              <div className="reports-top-product-stats">
                                <span>Qty Sold <strong>{product.quantitySold}</strong></span>
                                <span>Sales <strong>{formatCurrency(product.revenue)}</strong></span>
                                <span>Sales Share <strong>{formatPercentage(product.revenueShare)}</strong></span>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {(() => {
                  const rows = (reportType === 'sales-movements' ? getSalesMovementRows() : getFilteredMovements({ salesOnly: false }));
                  const paged = paginateItems(rows);
                  return (
                    <div className="reports-movement-desktop-table">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Transaction Date</TableHead>
                            <TableHead>Encoded Date</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>{reportType === 'sales-movements' ? 'Payment' : 'Reason'}</TableHead>
                            <TableHead>{reportType === 'sales-movements' ? 'Qty Sold' : 'Qty'}</TableHead>
                            <TableHead>Before</TableHead>
                            <TableHead>After</TableHead>
                            <TableHead>Handled By</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paged.pageItems.map(movement => {
                            const itemNameDetails = getMovementItemNameDetails(movement);
                            return (
                              <TableRow key={movement.id}>
                                <TableCell>{formatDateTime(movement.createdAt)}</TableCell>
                                <TableCell>{formatEncodedDate(movement)}</TableCell>
                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="font-medium text-slate-900">{itemNameDetails.historicalName}</div>
                                    {itemNameDetails.currentName && (
                                      <div className="text-xs text-slate-700">Current name: {itemNameDetails.currentName}</div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>{movement.category}</TableCell>
                                <TableCell>
                                  <Badge className={getMovementBadgeClass(movement.action)}>
                                    {getMovementLabel(movement.action)}
                                  </Badge>
                                </TableCell>
                                <TableCell>{reportType === 'sales-movements' ? getPaymentMethodLabel(movement.paymentMethod) : getMovementReasonDisplay(movement)}</TableCell>
                                <TableCell className="font-semibold">{movement.quantityChanged}</TableCell>
                                <TableCell>{movement.previousQuantity}</TableCell>
                                <TableCell>{movement.newQuantity}</TableCell>
                                <TableCell>{movement.actorName || 'System'}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()}
                <div className="reports-movement-mobile-list">
                  {(() => {
                    const rows = (reportType === 'sales-movements' ? getSalesMovementRows() : getFilteredMovements({ salesOnly: false }));
                    const paged = paginateItems(rows);
                    return paged.pageItems.map(movement => {
                    const itemNameDetails = getMovementItemNameDetails(movement);
                    return (
                    <article key={movement.id} className="reports-movement-card">
                      <div className="reports-movement-top">
                        <div className="min-w-0">
                          <h4 className="reports-movement-name">{itemNameDetails.historicalName}</h4>
                          {itemNameDetails.currentName && (
                            <p className="reports-movement-meta">Current name: {itemNameDetails.currentName}</p>
                          )}
                          <p className="reports-movement-meta">{movement.category} - Transaction: {formatDateTime(movement.createdAt)}</p>
                          {isBackdatedRecord(movement) && (
                            <p className="reports-movement-meta">Encoded: {formatDateTime(movement.encodedAt)}</p>
                          )}
                        </div>
                        <Badge className={`shrink-0 ${getMovementBadgeClass(movement.action)}`}>
                          {getMovementLabel(movement.action)}
                        </Badge>
                      </div>
                      <div className="reports-movement-stats">
                        <div className="reports-movement-stat">
                          <span>{reportType === 'sales-movements' ? 'Payment' : 'Reason'}</span>
                          <strong>{reportType === 'sales-movements' ? getPaymentMethodLabel(movement.paymentMethod) : getMovementReasonDisplay(movement)}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>{reportType === 'sales-movements' ? 'Qty Sold' : 'Qty'}</span>
                          <strong>{movement.quantityChanged}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>Before</span>
                          <strong>{movement.previousQuantity}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>After</span>
                          <strong>{movement.newQuantity}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>Handled By</span>
                          <strong>{movement.actorName || 'System'}</strong>
                        </div>
                        <div className="reports-movement-stat">
                          <span>Branch</span>
                          <strong>{movement.branch}</strong>
                        </div>
                        {reportType === 'sales-movements' && (
                          <div className="reports-movement-stat">
                            <span>Invoice No.</span>
                            <strong>{movement.invoiceNumber || movement.salesNumber || movement.id}</strong>
                          </div>
                        )}
                      </div>
                    </article>
                    );
                    });
                  })()}
                </div>
                {(() => {
                  const rows = (reportType === 'sales-movements' ? getSalesMovementRows() : getFilteredMovements({ salesOnly: false }));
                  const paged = paginateItems(rows);
                  return renderPaginationControls(paged.totalPages, paged.page, undefined, paged.totalItems);
                })()}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(reviewItem)} onOpenChange={open => {
        if (!open) closeConvertUntrackedItemDialog();
      }}>
        <DialogContent className="reports-convert-dialog border border-slate-200 bg-white p-0 shadow-2xl">
          <div className="reports-convert-content">
            <DialogHeader className="reports-convert-header text-left">
              <span className="reports-convert-icon" aria-hidden="true">
                <PackagePlus className="h-6 w-6" />
              </span>
              <div className="min-w-0 pt-1">
                <DialogTitle className="text-xl font-bold leading-tight text-slate-950">
                  Review Non-Inventory Item
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6 text-slate-700">
                  Add this frequently sold manual item to Inventory only after checking for duplicates and entering its beginning stock.
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="reports-convert-form">
              {reviewItem && (
                <div className="reports-convert-summary">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong>{reviewItem.itemName}</strong> was sold {reviewItem.timesSold} time{reviewItem.timesSold === 1 ? '' : 's'} with {formatUnitCount(reviewItem.totalQuantity)} recorded and {formatCurrency(reviewItem.totalSalesAmount)} in sales.
                  </span>
                </div>
              )}

              {(conversionMatches.exact.length > 0 || conversionMatches.similar.length > 0) && (
                <div className="reports-convert-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <strong>
                      {conversionMatches.exact.length > 0 ? 'Existing inventory item found' : 'Possible similar inventory item'}
                    </strong>
                    <p className="mt-1">
                      Review these matches before converting. Exact matches are blocked to prevent duplicate inventory records.
                    </p>
                    <div className="reports-convert-match-list" role="list" aria-label="Similar inventory items">
                      {[...conversionMatches.exact, ...conversionMatches.similar].map(match => (
                        <div
                          key={match.id}
                          className="reports-convert-match"
                          role="listitem"
                          title={`${match.name} - ${match.category || 'Uncategorized'} - ${formatUnitCount(match.quantity)}`}
                        >
                          {match.name} • {match.category} • {formatUnitCount(match.quantity)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="reports-convert-field">
                <Label htmlFor="convert-item-name">Item Name <span className="text-red-600">*</span></Label>
                <Input
                  id="convert-item-name"
                  className="reports-convert-control"
                  value={conversionDraft.name}
                  maxLength={150}
                  disabled={isConvertingItem}
                  onChange={event => updateConversionDraft('name', event.target.value.slice(0, 150))}
                />
              </div>

              <div className="reports-convert-grid">
                <div className="reports-convert-field">
                  <Label>Category <span className="text-red-600">*</span></Label>
                  <Select
                    value={conversionDraft.category}
                    onValueChange={value => updateConversionDraft('category', value)}
                    disabled={isConvertingItem}
                  >
                    <SelectTrigger className="reports-convert-control">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([...inventory.map(item => item.category).filter(Boolean), reviewItem?.category || 'Other', 'Other'])).sort().map(category => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="reports-convert-field">
                  <Label htmlFor="convert-supplier">Supplier, optional</Label>
                  <Select
                    value={conversionSupplierSelectValue}
                    onValueChange={value => {
                      if (value === SUPPLIER_CUSTOM_VALUE) {
                        setConversionSupplierMode('custom');
                        if (isListedSupplier(conversionDraft.supplierName)) {
                          updateConversionDraft('supplierName', '');
                        }
                        return;
                      }
                      setConversionSupplierMode('listed');
                      updateConversionDraft('supplierName', value);
                    }}
                    disabled={isConvertingItem}
                  >
                    <SelectTrigger id="convert-supplier" className="reports-convert-control">
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {HARDWARE_SUPPLIER_OPTIONS.map(supplier => (
                        <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                      ))}
                      <SelectItem value={SUPPLIER_CUSTOM_VALUE}>Other supplier / not listed</SelectItem>
                    </SelectContent>
                  </Select>
                  {showConversionCustomSupplier && (
                    <Input
                      id="convert-supplier-custom"
                      className="reports-convert-control"
                      value={conversionDraft.supplierName}
                      maxLength={120}
                      placeholder="Enter supplier name"
                      disabled={isConvertingItem}
                      onChange={event => updateConversionSupplierName(event.target.value)}
                    />
                  )}
                </div>
                <div className="reports-convert-field">
                  <Label htmlFor="convert-quantity">Beginning Quantity <span className="text-red-600">*</span></Label>
                  <Input
                    id="convert-quantity"
                    className="reports-convert-control"
                    type="text"
                    inputMode="numeric"
                    value={conversionDraft.quantity}
                    placeholder="0"
                    disabled={isConvertingItem}
                    onChange={event => updateConversionDraft('quantity', event.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </div>
                <div className="reports-convert-field">
                  <Label htmlFor="convert-price">Selling Price / SRP <span className="text-red-600">*</span></Label>
                  <Input
                    id="convert-price"
                    className="reports-convert-control"
                    type="text"
                    inputMode="decimal"
                    value={conversionDraft.defaultSellingPrice}
                    placeholder="0.00"
                    disabled={isConvertingItem}
                    onChange={event => updateConversionDraft('defaultSellingPrice', event.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 12))}
                  />
                </div>
                <div className="reports-convert-field">
                  <Label htmlFor="convert-threshold">Low-Stock Threshold <span className="text-red-600">*</span></Label>
                  <Input
                    id="convert-threshold"
                    className="reports-convert-control"
                    type="text"
                    inputMode="numeric"
                    value={conversionDraft.reorderLevel}
                    placeholder="5"
                    disabled={isConvertingItem}
                    onChange={event => updateConversionDraft('reorderLevel', event.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </div>
              </div>

              {conversionMatches.similar.length > 0 && conversionMatches.exact.length === 0 && (
                <label className="reports-convert-check">
                  <input
                    type="checkbox"
                    checked={acknowledgeSimilarItem}
                    disabled={isConvertingItem}
                    onChange={event => setAcknowledgeSimilarItem(event.target.checked)}
                  />
                  <span>I reviewed the similar item above and confirm this should be a separate inventory record.</span>
                </label>
              )}
            </div>

            <DialogFooter className="reports-convert-footer">
              <Button
                type="button"
                variant="outline"
                className="hover:bg-slate-100"
                onClick={closeConvertUntrackedItemDialog}
                disabled={isConvertingItem}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-[#FF0000] text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={convertUntrackedItemToInventory}
                disabled={isConvertingItem || conversionMatches.exact.length > 0}
              >
                {isConvertingItem ? 'Adding...' : 'Add to Inventory'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
  return /*#__PURE__*/React.createElement("div", {
    className: "reports-page min-h-screen bg-gray-50 p-4 md:p-8"
  }, /*#__PURE__*/React.createElement("style", null, `
    /* Report view toggles between desktop tables and mobile cards without changing the source data. */
    .reports-mobile-category-list {
      display: none;
    }

    /* Mobile report rules replace dense tables with stacked records for easier scanning. */
    @media (max-width: 760px) {
      .reports-page {
        padding: 14px;
      }

      .reports-page > .mb-8 {
        margin-bottom: 18px;
      }

      .reports-page > .mb-8 > .relative {
        border-radius: 18px;
        padding: 22px 18px;
      }

      .reports-page > .mb-8 .h-16.w-16 {
        height: 58px;
        width: 58px;
        border-radius: 16px;
      }

      .reports-page > .mb-8 .h-8.w-8 {
        height: 28px;
        width: 28px;
      }

      .reports-page > .mb-8 h1 {
        margin-bottom: 6px;
        font-size: 34px;
        line-height: 1.05;
      }

      .reports-page > .mb-8 p {
        font-size: 16px;
        line-height: 1.35;
      }

      .reports-config-card {
        margin-bottom: 16px;
      }

      .reports-config-card [data-reports-config-header] {
        padding: 18px 16px 10px;
      }

      .reports-config-header {
        align-items: stretch;
        gap: 12px;
      }

      .reports-config-title [data-card-title] {
        font-size: 18px;
        line-height: 1.25;
      }

      .reports-config-title [data-card-description] {
        margin-top: 4px;
        font-size: 14px;
        line-height: 1.35;
      }

      .reports-export-button {
        min-height: 44px;
        width: 100%;
        justify-content: center;
        border-radius: 12px;
      }

      .reports-config-card [data-reports-config-content] {
        padding: 10px 16px 16px;
      }

      .reports-config-stack {
        gap: 14px;
      }

      .reports-period-panel {
        padding: 14px;
        border-radius: 14px;
      }

      .reports-period-label {
        margin-bottom: 10px;
      }

      .reports-filter-row {
        gap: 10px;
      }

      .reports-page [data-reports-control],
      .reports-page [data-reports-date-pill] {
        min-height: 46px;
        border-radius: 12px;
        font-size: 14px;
      }

      .reports-metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }

      .reports-metric-card [data-reports-metric-content] {
        padding: 14px;
      }

      .reports-metric-card [data-reports-metric-row] {
        align-items: center;
        gap: 8px;
      }

      .reports-metric-card p:first-child {
        font-size: 12px;
        line-height: 1.2;
      }

      .reports-metric-card p:last-child {
        font-size: 26px;
        line-height: 1.05;
      }

      .reports-metric-card svg {
        height: 24px;
        width: 24px;
      }

      .reports-summary-card [data-reports-summary-header] {
        padding: 18px 16px 10px;
      }

      .reports-summary-card [data-reports-summary-content] {
        padding: 10px 16px 16px;
      }

      .reports-summary-card [data-card-title] {
        font-size: 18px;
        line-height: 1.25;
      }

      .reports-summary-card [data-card-description] {
        margin-top: 4px;
        font-size: 14px;
        line-height: 1.35;
      }

      .reports-summary-stack {
        gap: 16px;
      }

      .reports-summary-mini-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .reports-summary-mini-grid > div {
        padding: 12px;
        border-radius: 12px;
      }

      .reports-summary-mini-grid > div:last-child {
        grid-column: 1 / -1;
      }

      .reports-summary-mini-grid p:first-child {
        font-size: 13px;
        line-height: 1.2;
      }

      .reports-summary-mini-grid p:last-child {
        font-size: 24px;
        line-height: 1.05;
      }

      .reports-category-title {
        margin-bottom: 10px;
        font-size: 18px;
      }

      .reports-category-table {
        display: none;
      }

      .reports-mobile-category-list {
        display: grid;
        gap: 10px;
      }

      .reports-mobile-category-card {
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        background: #ffffff;
        padding: 12px;
        box-shadow: 0 6px 14px rgba(15, 23, 42, 0.05);
        min-width: 0;
      }

      .reports-mobile-category-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }

      .reports-mobile-category-name {
        min-width: 0;
        overflow-wrap: anywhere;
        font-size: 15px;
        line-height: 1.25;
        font-weight: 800;
        color: #0f172a;
      }

      .reports-mobile-category-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .reports-mobile-category-stat {
        min-width: 0;
        border-radius: 12px;
        background: #f8fafc;
        padding: 10px;
      }

      .reports-mobile-category-stat span {
        display: block;
        margin-bottom: 4px;
        font-size: 11px;
        font-weight: 800;
        color: #64748b;
        text-transform: uppercase;
      }

      .reports-mobile-category-stat strong {
        display: block;
        font-size: 17px;
        line-height: 1.1;
        color: #0f172a;
      }

      .reports-data-card [data-card-header] {
        padding: 18px 16px 10px;
      }

      .reports-data-card [data-card-content] {
        padding: 10px 16px 16px;
        overflow-x: auto;
      }
    }

    @media (max-width: 420px) {
      .reports-page {
        padding: 12px;
      }

      .reports-config-header {
        flex-direction: column;
      }

      .reports-metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .reports-metric-card [data-reports-metric-content] {
        padding: 12px;
      }

      .reports-summary-mini-grid {
        grid-template-columns: 1fr;
      }

      .reports-summary-mini-grid > div:last-child {
        grid-column: auto;
      }
    }
  `), /*#__PURE__*/React.createElement(PageHeader, {
    title: "Reports",
    subtitle: "Generate comprehensive reports synchronized with real-time inventory data",
    icon: /*#__PURE__*/React.createElement(FileText, {
      className: "h-8 w-8"
    })
  }), /*#__PURE__*/React.createElement(Card, {
    className: "reports-config-card mb-6"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    "data-reports-config-header": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-config-header flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-config-title"
  }, /*#__PURE__*/React.createElement(CardTitle, null, "Report Configuration"), /*#__PURE__*/React.createElement(CardDescription, null, "Select time period, report type and filters")), /*#__PURE__*/React.createElement(Button, {
    onClick: generatePDF,
    className: "reports-export-button bg-slate-700 hover:bg-slate-800 text-white font-semibold shadow-md transition-all duration-300"
  }, /*#__PURE__*/React.createElement(Download, {
    className: "w-4 h-4 mr-2"
  }), "Export PDF"))), /*#__PURE__*/React.createElement(CardContent, {
    "data-reports-config-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-config-stack space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-period-panel bg-gradient-to-br from-yellow-50 to-orange-50 p-6 rounded-xl border-2 border-[#FFFF00]/30 shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-period-label flex items-center gap-3 mb-3"
  }, /*#__PURE__*/React.createElement(Calendar, {
    className: "w-5 h-5 text-[#FF0000]"
  }), /*#__PURE__*/React.createElement("label", {
    className: "font-semibold text-gray-900"
  }, "Report Period:")), /*#__PURE__*/React.createElement("div", {
    className: "reports-filter-row flex flex-col md:flex-row gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement(Select, {
    value: reportPeriod,
    onValueChange: value => setReportPeriod(value)
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "bg-white border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00] shadow-sm",
    "data-reports-control": true
  }, /*#__PURE__*/React.createElement(SelectValue, null)), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "daily"
  }, "Daily"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "weekly"
  }, "Weekly"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "monthly"
  }, "Monthly")))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-300 shadow-sm",
    "data-reports-date-pill": true
  }, isRefreshing ? /*#__PURE__*/React.createElement(RefreshCw, {
    className: "w-4 h-4 text-[#FF0000] animate-spin"
  }) : /*#__PURE__*/React.createElement(Calendar, {
    className: "w-4 h-4 text-gray-600"
  }), /*#__PURE__*/React.createElement("span", {
    className: `text-sm text-gray-700 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, getDateRange())))), /*#__PURE__*/React.createElement("div", {
    className: "reports-filter-row flex flex-col md:flex-row gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-sm font-medium mb-2 block text-gray-700"
  }, "Report Type"), /*#__PURE__*/React.createElement(Select, {
    value: reportType,
    onValueChange: value => setReportType(value)
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]",
    "data-reports-control": true
  }, /*#__PURE__*/React.createElement(SelectValue, null)), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "summary"
  }, "Summary"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "detailed"
  }, "Detailed Inventory"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "low-stock"
  }, "Low Stock Alert"), /*#__PURE__*/React.createElement(SelectItem, {
    value: "category"
  }, "Category Analysis")))), reportType === 'detailed' && /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("label", {
    className: "text-sm font-medium mb-2 block text-gray-700"
  }, "Filter by Category"), /*#__PURE__*/React.createElement(Select, {
    value: selectedCategory,
    onValueChange: setSelectedCategory
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "border-gray-300 focus:border-[#FFFF00] focus:ring-[#FFFF00]",
    "data-reports-control": true
  }, /*#__PURE__*/React.createElement(SelectValue, null)), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "all"
  }, "All Categories"), categories.map(cat => /*#__PURE__*/React.createElement(SelectItem, {
    key: cat,
    value: cat
  }, cat))))))))), /*#__PURE__*/React.createElement("div", {
    className: `reports-metric-grid transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(Card, {
    className: "reports-metric-card border-l-4 border-l-blue-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6",
    "data-reports-metric-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between",
    "data-reports-metric-row": true
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Total Items"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, totalItems)), /*#__PURE__*/React.createElement(Package, {
    className: "w-8 h-8 text-blue-500"
  })))), /*#__PURE__*/React.createElement(Card, {
    className: "reports-metric-card border-l-4 border-l-green-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6",
    "data-reports-metric-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between",
    "data-reports-metric-row": true
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Total Units"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, totalQuantity)), /*#__PURE__*/React.createElement(TrendingUp, {
    className: "w-8 h-8 text-green-500"
  })))), /*#__PURE__*/React.createElement(Card, {
    className: "reports-metric-card border-l-4 border-l-yellow-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6",
    "data-reports-metric-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between",
    "data-reports-metric-row": true
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Low Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, lowStockItems)), /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-8 h-8 text-yellow-500"
  })))), /*#__PURE__*/React.createElement(Card, {
    className: "reports-metric-card border-l-4 border-l-red-500"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6",
    "data-reports-metric-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between",
    "data-reports-metric-row": true
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Out of Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-3xl font-bold text-slate-900"
  }, outOfStockItems)), /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-8 h-8 text-red-500"
  }))))), reportType === 'summary' && /*#__PURE__*/React.createElement(Card, {
    className: `reports-summary-card transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(CardHeader, {
    "data-reports-summary-header": true
  }, /*#__PURE__*/React.createElement(CardTitle, null, "Inventory Summary"), /*#__PURE__*/React.createElement(CardDescription, null, "Overview of current inventory status")), /*#__PURE__*/React.createElement(CardContent, {
    "data-reports-summary-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-summary-stack space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-summary-mini-grid grid grid-cols-3 gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-green-50 p-4 rounded-lg border border-green-200"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-green-700 mb-1"
  }, "In Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-green-900"
  }, inStockItems)), /*#__PURE__*/React.createElement("div", {
    className: "bg-yellow-50 p-4 rounded-lg border border-yellow-200"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-yellow-700 mb-1"
  }, "Low Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-yellow-900"
  }, lowStockItems)), /*#__PURE__*/React.createElement("div", {
    className: "bg-red-50 p-4 rounded-lg border border-red-200"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-red-700 mb-1"
  }, "Out of Stock"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl font-bold text-red-900"
  }, outOfStockItems))), /*#__PURE__*/React.createElement("div", {
    className: "reports-category-breakdown"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "reports-category-title font-semibold mb-3"
    }, "Category Breakdown"), /*#__PURE__*/React.createElement("div", {
    className: "reports-category-table"
  }, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Items"), /*#__PURE__*/React.createElement(TableHead, null, "Total Units"), /*#__PURE__*/React.createElement(TableHead, null, "Low Stock"))), /*#__PURE__*/React.createElement(TableBody, null, getCategorySummary().map(cat => /*#__PURE__*/React.createElement(TableRow, {
    key: cat.category
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-medium"
  }, cat.category), /*#__PURE__*/React.createElement(TableCell, null, cat.itemCount), /*#__PURE__*/React.createElement(TableCell, null, cat.totalQty), /*#__PURE__*/React.createElement(TableCell, null, cat.lowStock > 0 ? /*#__PURE__*/React.createElement(Badge, {
    variant: "destructive"
  }, cat.lowStock) : /*#__PURE__*/React.createElement(Badge, {
    variant: "outline"
  }, "0"))))))))), /*#__PURE__*/React.createElement("div", {
    className: "reports-mobile-category-list"
  }, getCategorySummary().map(cat => /*#__PURE__*/React.createElement("article", {
    key: cat.category,
    className: "reports-mobile-category-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-mobile-category-top"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "reports-mobile-category-name"
  }, cat.category), cat.lowStock > 0 ? /*#__PURE__*/React.createElement(Badge, {
    variant: "destructive"
  }, cat.lowStock, " Low") : /*#__PURE__*/React.createElement(Badge, {
    variant: "outline"
  }, "0 Low")), /*#__PURE__*/React.createElement("div", {
    className: "reports-mobile-category-stats"
  }, /*#__PURE__*/React.createElement("div", {
    className: "reports-mobile-category-stat"
  }, /*#__PURE__*/React.createElement("span", null, "Items"), /*#__PURE__*/React.createElement("strong", null, cat.itemCount)), /*#__PURE__*/React.createElement("div", {
    className: "reports-mobile-category-stat"
  }, /*#__PURE__*/React.createElement("span", null, "Total Units"), /*#__PURE__*/React.createElement("strong", null, cat.totalQty))))))))), reportType === 'detailed' && /*#__PURE__*/React.createElement(Card, {
    className: `transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Detailed Inventory"), /*#__PURE__*/React.createElement(CardDescription, null, selectedCategory === 'all' ? 'All items' : `${selectedCategory} category`, " - ", getFilteredInventory().length, " items")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Item Code"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Last Updated"))), /*#__PURE__*/React.createElement(TableBody, null, getFilteredInventory().map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, getDisplayItemCode(item)), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, getCategoryDisplay(item)), /*#__PURE__*/React.createElement(TableCell, null, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: getStockStatusBadgeClass(item.status)
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, formatDateTime(item.lastUpdated))))))), reportType === 'low-stock' && /*#__PURE__*/React.createElement(Card, {
    className: `transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Low Stock Alert"), /*#__PURE__*/React.createElement(CardDescription, null, "Items requiring immediate attention - ", getLowStockItems().length, " items")), /*#__PURE__*/React.createElement(CardContent, null, getLowStockItems().length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-8 text-slate-700"
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-12 h-12 mx-auto mb-3 text-green-500"
  }), /*#__PURE__*/React.createElement("p", null, "No low stock items. All inventory levels are adequate.")) : /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Item Code"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Category"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Last Updated"))), /*#__PURE__*/React.createElement(TableBody, null, getLowStockItems().map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, getDisplayItemCode(item)), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, getCategoryDisplay(item)), /*#__PURE__*/React.createElement(TableCell, {
    className: "font-bold"
  }, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: getStockStatusBadgeClass(item.status)
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, formatDateTime(item.lastUpdated))))))), reportType === 'category' && /*#__PURE__*/React.createElement("div", {
    className: `space-y-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`
  }, categories.map(category => {
    const categoryItems = inventory.filter(item => item.category === category);
    const categoryQty = categoryItems.reduce((sum, item) => sum + item.quantity, 0);
    const categoryLowStock = categoryItems.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock').length;
    return /*#__PURE__*/React.createElement(Card, {
      key: category
    }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(CardTitle, null, category), /*#__PURE__*/React.createElement(CardDescription, null, categoryItems.length, " items \u2022 ", categoryQty, " total units")), categoryLowStock > 0 && /*#__PURE__*/React.createElement(Badge, {
      variant: "destructive"
    }, categoryLowStock, " Low Stock"))), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, "Item Code"), /*#__PURE__*/React.createElement(TableHead, null, "Item Name"), /*#__PURE__*/React.createElement(TableHead, null, "Quantity"), /*#__PURE__*/React.createElement(TableHead, null, "Status"), /*#__PURE__*/React.createElement(TableHead, null, "Last Updated"))), /*#__PURE__*/React.createElement(TableBody, null, categoryItems.map(item => /*#__PURE__*/React.createElement(TableRow, {
      key: item.id
    }, /*#__PURE__*/React.createElement(TableCell, {
      className: "font-mono text-sm"
    }, getDisplayItemCode(item)), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
      className: getStockStatusBadgeClass(item.status)
    }, item.status)), /*#__PURE__*/React.createElement(TableCell, null, formatDateTime(item.lastUpdated))))))));
  }))));
}

