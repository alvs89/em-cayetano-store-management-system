// Dashboard module: summarizes daily sales performance, inventory alerts, and
// branch-level operational signals.
import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  FileText,
  HelpCircle,
  Home,
  Eye,
  EyeOff,
  Package,
  PackagePlus,
  ReceiptText,
  Target,
  TrendingUp,
  Truck,
  Wallet,
  X
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { toast } from 'sonner';
import { useData } from './DataContext';
import { PageHeader } from './PageHeader';
import { ROLE_VALUES, canAccessScreen, canPerformInventoryMovement, canRecordSales, isAdminRole, normalizeRole } from '../utils/roles';
import { getProfitabilitySummary } from '../utils/profitability';
import { isCompletedSaleTransaction } from '../utils/salesTransactionStatus';

const formatCurrency = value =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(Number(value || 0));

const RequiredMark = () => <span className="text-red-600">*</span>;

const sanitizeWholeNumberInput = (value, fieldName, toastId) => {
  const rawValue = String(value || '');
  const cleaned = rawValue.replace(/\D/g, '');
  if (rawValue !== cleaned) {
    toast.warning(`${fieldName} must contain numbers only.`, {
      id: toastId,
      duration: 2500
    });
  }
  return cleaned;
};

const sanitizeMoneyInput = (value, fieldName, toastId) => {
  const rawValue = String(value || '');
  const cleaned = rawValue
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1');
  const [whole = '', decimals = ''] = cleaned.split('.');
  const nextValue = cleaned.includes('.') ? `${whole}.${decimals.slice(0, 2)}` : whole;

  if (rawValue !== nextValue) {
    toast.warning(`${fieldName} accepts numbers and decimals only.`, {
      id: toastId,
      duration: 2500
    });
  }

  return nextValue;
};

const getLocalDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Dashboard dates use local calendar keys because daily sales, quota progress,
// and stock-count activity should follow branch operating days, not UTC rollover.
const isToday = (value, todayKey = getLocalDateKey()) => {
  if (!value) return false;
  return getLocalDateKey(value) === todayKey;
};

const parseLocalDateKey = value => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const getOffsetDateKey = (value, dayOffset) => {
  const date = parseLocalDateKey(value);
  date.setDate(date.getDate() + dayOffset);
  return getLocalDateKey(date);
};

const DASHBOARD_SALES_PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'day', label: 'Selected Day' }
];

const isNonInventorySaleItem = item =>
  item?.isInventoryItem === false || item?.itemType === 'non_inventory' || item?.item_type === 'non_inventory';

const manualItemKey = item => {
  const name = String(item?.itemName || item?.manualDescription || item?.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const category = String(item?.category || 'Other').trim().replace(/\s+/g, ' ').toLowerCase();
  return name ? `${name}|${category}` : '';
};

// Top-selling aggregation combines tracked inventory lines by inventory id and
// non-inventory lines by normalized name/category for fair dashboard ranking.
const getTopSellingItem = sales => {
  const grouped = new Map();
  (sales || []).forEach(sale => {
    (sale.items || []).forEach(item => {
      const name = String(item.itemName || item.manualDescription || item.name || '').trim();
      const quantity = Number(item.quantitySold || item.quantity || 0);
      if (!name || quantity <= 0) return;

      const isManual = isNonInventorySaleItem(item);
      const key = item.inventoryId
        ? `inventory:${item.inventoryId}`
        : `manual:${manualItemKey(item) || name.toLowerCase()}`;
      const existing = grouped.get(key) || {
        itemName: name,
        category: item.category || 'Other',
        quantity: 0,
        isManual
      };
      existing.quantity += quantity;
      existing.isManual = existing.isManual || isManual;
      grouped.set(key, existing);
    });
  });

  return Array.from(grouped.values()).sort((a, b) => b.quantity - a.quantity || a.itemName.localeCompare(b.itemName))[0] || null;
};

const getSalesUnits = sales =>
  (sales || []).reduce((sum, sale) => (
    sum + (sale.items || []).reduce((itemSum, item) => itemSum + Number(item.quantitySold || item.quantity || 0), 0)
  ), 0);

const getComparisonDirection = (current, previous) => {
  if (previous <= 0 && current <= 0) return 'neutral';
  if (previous <= 0) return 'up';
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'neutral';
};

const STOCK_COUNT_SEARCH_LIMIT = 50;

const getStockCountItemDisplayName = item => {
  if (!item) return '';
  const code = String(item.itemCode || '').trim();
  return code ? `${code} - ${item.name}` : item.name;
};

const normalizeStockCountSearchText = value =>
  String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getStockCountSearchText = item => [
  getStockCountItemDisplayName(item),
  item?.name,
  item?.itemCode,
  item?.category,
  item?.supplierName
].map(normalizeStockCountSearchText).filter(Boolean).join(' ');

export function Dashboard({
  onNavigate,
  user,
  activeBranch
}) {
  const [isStockCountDialogOpen, setIsStockCountDialogOpen] = React.useState(false);
  const [stockCountForm, setStockCountForm] = React.useState({
    itemId: '',
    physicalCount: ''
  });
  const [todayKey, setTodayKey] = React.useState(() => getLocalDateKey());
  const [isQuotaDialogOpen, setIsQuotaDialogOpen] = React.useState(false);
  const [quotaForm, setQuotaForm] = React.useState('');
  const [isSavingQuota, setIsSavingQuota] = React.useState(false);
  const [salesPeriod, setSalesPeriod] = React.useState('today');
  const [selectedSalesDate, setSelectedSalesDate] = React.useState(() => getLocalDateKey());
  const [selectedComparisonDate, setSelectedComparisonDate] = React.useState(() => getOffsetDateKey(getLocalDateKey(), -1));
  const [stockCountSearch, setStockCountSearch] = React.useState('');
  const [isStockCountSelectorOpen, setIsStockCountSelectorOpen] = React.useState(false);
  const [stockCountActiveIndex, setStockCountActiveIndex] = React.useState(0);
  const [showFinancialValues, setShowFinancialValues] = React.useState(() => {
    try {
      return localStorage.getItem('dashboardFinancialValuesVisible') !== 'false';
    } catch {
      return true;
    }
  });

  const {
    inventory,
    unreadAlertCount,
    stockMovements,
    salesTransactions,
    inventoryChangeRequests,
    systemSummary,
    updateDailySalesTarget
  } = useData();

  const role = normalizeRole(user?.role);
  const isAdmin = isAdminRole(role);
  const canUseSales = canRecordSales(role);
  const canUseInventoryMovement = canPerformInventoryMovement(role);
  const isCombinedSalesInventory = role === ROLE_VALUES.SALES_INVENTORY_STAFF;
  const isSalesEncoder = canUseSales && !isAdmin && !isCombinedSalesInventory;
  const isInventoryStaff = canUseInventoryMovement && !canUseSales && !isAdmin;
  const isInventoryAuthorizedView = canUseInventoryMovement && !isAdmin;
  const canUseReports = canAccessScreen(role, 'reports');
  const canUsePurchases = canAccessScreen(role, 'purchases');

  React.useEffect(() => {
    try {
      localStorage.setItem('dashboardFinancialValuesVisible', showFinancialValues ? 'true' : 'false');
    } catch {
      // Privacy mode is still usable when browser storage is unavailable.
    }
  }, [showFinancialValues]);

  // Inventory health cards are computed from the current branch snapshot. These
  // counts are intentionally independent of the selected sales reporting period.
  const lowStockItems = inventory.filter(item => item.status === 'Low Stock');
  const outOfStockItems = inventory.filter(item => item.status === 'Out of Stock');
  const inStockItems = inventory.filter(item => item.status === 'In Stock');
  const missingSupplierItems = inventory.filter(item => !String(item.supplierName || '').trim());
  const missingPriceItems = inventory.filter(item => Number(item.defaultSellingPrice || 0) <= 0);
  const missingItemDetailKeys = new Set([
    ...missingSupplierItems.map(item => String(item.id)),
    ...missingPriceItems.map(item => String(item.id))
  ]);
  const missingItemDetailParts = [
    missingSupplierItems.length > 0 ? `${missingSupplierItems.length} missing supplier` : '',
    missingPriceItems.length > 0 ? `${missingPriceItems.length} missing SRP` : ''
  ].filter(Boolean);
  React.useEffect(() => {
    let midnightTimer;

    const syncTodayKey = () => {
      setTodayKey(getLocalDateKey());
    };

    const scheduleNextMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setDate(now.getDate() + 1);
      nextMidnight.setHours(0, 0, 2, 0);
      const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());

      midnightTimer = window.setTimeout(() => {
        syncTodayKey();
        scheduleNextMidnight();
      }, delay);
    };

    scheduleNextMidnight();
    window.addEventListener('focus', syncTodayKey);
    document.addEventListener('visibilitychange', syncTodayKey);

    return () => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener('focus', syncTodayKey);
      document.removeEventListener('visibilitychange', syncTodayKey);
    };
  }, []);

  // Sales period bounds drive the dashboard revenue/profit cards and the target
  // report links, while daily quota remains anchored to today's branch sales.
  const getDashboardSalesBounds = (period = salesPeriod, dateKey = selectedSalesDate) => {
    const now = parseLocalDateKey(todayKey);
    const selectedDate = parseLocalDateKey(dateKey || todayKey);
    const anchorDate = period === 'day' ? selectedDate : now;
    const start = new Date(anchorDate);
    const end = new Date(anchorDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (period === 'week') {
      start.setDate(anchorDate.getDate() - anchorDate.getDay());
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      start.setDate(1);
      end.setFullYear(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'year') {
      start.setFullYear(anchorDate.getFullYear(), 0, 1);
      end.setFullYear(anchorDate.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  };

  const getPreviousDashboardSalesBounds = () => {
    const { start, end } = getDashboardSalesBounds();
    const previousStart = new Date(start);
    const previousEnd = new Date(end);

    if (salesPeriod === 'week') {
      previousStart.setDate(start.getDate() - 7);
      previousEnd.setDate(end.getDate() - 7);
    } else if (salesPeriod === 'month') {
      previousStart.setMonth(start.getMonth() - 1, 1);
      previousEnd.setFullYear(previousStart.getFullYear(), previousStart.getMonth() + 1, 0);
      previousEnd.setHours(23, 59, 59, 999);
    } else if (salesPeriod === 'year') {
      previousStart.setFullYear(start.getFullYear() - 1, 0, 1);
      previousEnd.setFullYear(start.getFullYear() - 1, 11, 31);
      previousEnd.setHours(23, 59, 59, 999);
    } else if (salesPeriod === 'day') {
      const comparisonDate = parseLocalDateKey(selectedComparisonDate || getOffsetDateKey(selectedSalesDate || todayKey, -1));
      previousStart.setTime(comparisonDate.getTime());
      previousStart.setHours(0, 0, 0, 0);
      previousEnd.setTime(comparisonDate.getTime());
      previousEnd.setHours(23, 59, 59, 999);
    } else {
      previousStart.setDate(start.getDate() - 1);
      previousEnd.setDate(end.getDate() - 1);
    }

    return { start: previousStart, end: previousEnd };
  };

  const formatDashboardSalesRange = () => {
    const { start, end } = getDashboardSalesBounds();
    const sameDay = getLocalDateKey(start) === getLocalDateKey(end);
    if (sameDay) {
      return start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    const sameYear = start.getFullYear() === end.getFullYear();
    const startLabel = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: sameYear ? undefined : 'numeric'
    });
    const endLabel = end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return `${startLabel} – ${endLabel}`;
  };

  const formatDashboardDateLabel = dateKey =>
    parseLocalDateKey(dateKey).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

  const isSaleInDashboardPeriod = sale => {
    const saleDate = new Date(sale.createdAt);
    if (Number.isNaN(saleDate.getTime())) return false;
    const { start, end } = getDashboardSalesBounds();
    return saleDate >= start && saleDate <= end;
  };

  const isSaleInPreviousDashboardPeriod = sale => {
    const saleDate = new Date(sale.createdAt);
    if (Number.isNaN(saleDate.getTime())) return false;
    const { start, end } = getPreviousDashboardSalesBounds();
    return saleDate >= start && saleDate <= end;
  };

  const salesToday = (salesTransactions || []).filter(sale => isCompletedSaleTransaction(sale) && isToday(sale.createdAt, todayKey));
  const stockMovementsToday = (stockMovements || []).filter(movement => isToday(movement.createdAt, todayKey));
  const completedSales = (salesTransactions || []).filter(isCompletedSaleTransaction);
  const dashboardSales = completedSales.filter(isSaleInDashboardPeriod);
  const previousDashboardSales = completedSales.filter(isSaleInPreviousDashboardPeriod);
  const topSellingDashboardPeriod = getTopSellingItem(dashboardSales);
  const completedSalesAmount = completedSales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const salesTodayAmount = salesToday.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const dashboardProfitSummary = getProfitabilitySummary(dashboardSales);
  const previousDashboardProfitSummary = getProfitabilitySummary(previousDashboardSales);
  const overallProfitSummary = getProfitabilitySummary(completedSales);
  const overallSalesAmount = isAdmin ? overallProfitSummary.totalSales : completedSalesAmount;
  const dailySalesTarget = Number(systemSummary?.dailySalesTarget || 0);
  const hasDailySalesTarget = Number.isFinite(dailySalesTarget) && dailySalesTarget > 0;
  const quotaProgress = hasDailySalesTarget
    ? Math.min(100, Math.round((salesTodayAmount / dailySalesTarget) * 100))
    : 0;
  const dashboardSalesQuantity = getSalesUnits(dashboardSales);
  const previousDashboardSalesQuantity = getSalesUnits(previousDashboardSales);
  const stockInTodayCount = stockMovementsToday.filter(movement => String(movement.action || '').toLowerCase() === 'stock in').length;
  const stockOutTodayCount = stockMovementsToday.filter(movement => String(movement.action || '').toLowerCase() === 'stock out').length;
  const unitsMovedToday = stockMovementsToday.reduce((sum, movement) => sum + Number(movement.quantityChanged || 0), 0);
  const pendingItemRequests = isAdmin
    ? (inventoryChangeRequests || []).filter(request => String(request.status || 'pending').toLowerCase() === 'pending')
    : [];
  const pendingNewItemRequestCount = pendingItemRequests.filter(request => request.requestType === 'add_item').length;
  const pendingEditItemRequestCount = pendingItemRequests.filter(request => request.requestType === 'edit_item').length;
  const pendingItemRequestParts = [
    pendingNewItemRequestCount > 0 ? `${pendingNewItemRequestCount} new item${pendingNewItemRequestCount === 1 ? '' : 's'}` : '',
    pendingEditItemRequestCount > 0 ? `${pendingEditItemRequestCount} update${pendingEditItemRequestCount === 1 ? '' : 's'}` : ''
  ].filter(Boolean);
  const getTodayDateKey = () => todayKey || getLocalDateKey();
  const manualReviewSales = completedSales.filter(sale => (sale.items || []).some(isNonInventorySaleItem));
  const manualReviewDates = manualReviewSales
    .map(sale => new Date(sale.createdAt))
    .filter(date => !Number.isNaN(date.getTime()));
  const manualReviewStartDate = manualReviewDates.length
    ? getLocalDateKey(new Date(Math.min(...manualReviewDates.map(date => date.getTime()))))
    : getTodayDateKey();
  const manualReviewEndDate = manualReviewDates.length
    ? getLocalDateKey(new Date(Math.max(...manualReviewDates.map(date => date.getTime()))))
    : getTodayDateKey();
  const manualReviewCount = new Set(
    manualReviewSales
      .flatMap(sale => sale.items || [])
      .filter(isNonInventorySaleItem)
      .map(manualItemKey)
      .filter(Boolean)
  ).size;

  // Stock count variance is a decision support workflow. The actual adjustment
  // still routes to Inventory so stock movement reasons and audit trail are kept.
  const selectedCountItem = inventory.find(item => String(item.id) === String(stockCountForm.itemId));
  const filteredStockCountItems = React.useMemo(() => {
    const queryTokens = normalizeStockCountSearchText(stockCountSearch).split(' ').filter(Boolean);
    const matches = queryTokens.length > 0
      ? inventory.filter(item => {
        const searchableText = getStockCountSearchText(item);
        return queryTokens.every(token => searchableText.includes(token));
      })
      : inventory;

    return matches.slice(0, STOCK_COUNT_SEARCH_LIMIT);
  }, [inventory, stockCountSearch]);
  const physicalCountValue = stockCountForm.physicalCount === '' ? null : Number(stockCountForm.physicalCount);
  const hasPhysicalCountEntry = stockCountForm.physicalCount !== '';
  const hasValidPhysicalCount = Number.isInteger(physicalCountValue) && physicalCountValue >= 0;
  const stockCountVariance = selectedCountItem && hasValidPhysicalCount
    ? physicalCountValue - Number(selectedCountItem.quantity || 0)
    : null;

  const formatUnitLabel = value => Number(value) === 1 ? 'unit' : 'units';
  const salesPeriodLabel = DASHBOARD_SALES_PERIOD_OPTIONS.find(option => option.value === salesPeriod)?.label || 'Selected Period';
  const salesPeriodRangeLabel = formatDashboardSalesRange();
  const previousPeriodName = {
    today: 'yesterday',
    week: 'previous week',
    month: 'previous month',
    year: 'previous year',
    day: formatDashboardDateLabel(selectedComparisonDate || getOffsetDateKey(selectedSalesDate || todayKey, -1))
  }[salesPeriod] || 'previous period';
  const previousPeriodContext = {
    today: 'yesterday',
    week: 'during the previous week',
    month: 'during the previous month',
    year: 'during the previous year',
    day: `on ${formatDashboardDateLabel(selectedComparisonDate || getOffsetDateKey(selectedSalesDate || todayKey, -1))}`
  }[salesPeriod] || 'during the previous period';
  const formatComparison = (current, previous, {
    percentage = true,
    emptyLabel = 'No sales',
    unitSingular = 'item',
    unitPlural = 'items'
  } = {}) => {
    const direction = getComparisonDirection(Number(current || 0), Number(previous || 0));
    if (previous <= 0 && current <= 0) {
      return { direction: 'neutral', label: `${emptyLabel} recorded ${previousPeriodContext}` };
    }
    if (previous <= 0) {
      return { direction: 'up', label: `New activity compared with ${previousPeriodContext}` };
    }

    const difference = Number(current || 0) - Number(previous || 0);
    if (difference === 0) {
      return { direction: 'neutral', label: `No change from ${previousPeriodContext}` };
    }

    if (percentage) {
      const percent = Math.abs((difference / previous) * 100);
      return {
        direction,
        label: `${direction === 'up' ? 'Increased' : 'Decreased'} by ${percent.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 1
        })}% compared with ${previousPeriodContext}`
      };
    }

    const absoluteDifference = Math.abs(difference);
    const unitLabel = absoluteDifference === 1 ? unitSingular : unitPlural;
    return {
      direction,
      label: `${direction === 'up' ? 'Increased' : 'Decreased'} by ${absoluteDifference.toLocaleString()} ${unitLabel} compared with ${previousPeriodContext}`
    };
  };
  const salesAmountComparison = formatComparison(dashboardProfitSummary.totalSales, previousDashboardProfitSummary.totalSales);
  const actualProfitComparison = formatComparison(
    dashboardProfitSummary.actualProfit,
    previousDashboardProfitSummary.actualProfit,
    { emptyLabel: 'No profit' }
  );
  const unitsSoldComparison = formatComparison(dashboardSalesQuantity, previousDashboardSalesQuantity, {
    percentage: false,
    emptyLabel: 'No units sold',
    unitSingular: 'unit',
    unitPlural: 'units'
  });
  const dashboardYear = parseLocalDateKey(todayKey).getFullYear();
  const salesReportTarget = {
    today: { period: 'daily', date: todayKey },
    week: { period: 'weekly', date: todayKey },
    month: { period: 'monthly', date: todayKey },
    year: {
      period: 'custom',
      date: todayKey,
      customStartDate: `${dashboardYear}-01-01`,
      customEndDate: `${dashboardYear}-12-31`
    },
    day: { period: 'daily', date: selectedSalesDate || todayKey }
  }[salesPeriod];

  const openDashboardSalesReport = () => {
    if (canUseReports && salesReportTarget) {
      openTargetReport('sales-movements', salesReportTarget);
      return;
    }
    if (canUseSales) openSalesHistory(salesPeriod === 'today' ? 'today' : 'all');
  };

  const openDashboardBestSellerReport = () => {
    if (canUseReports && topSellingDashboardPeriod && salesReportTarget) {
      openTargetReport(
        topSellingDashboardPeriod.isManual ? 'untracked-sales' : 'sales-movements',
        salesReportTarget
      );
      return;
    }
    if (canUseSales) openSalesHistory(salesPeriod === 'today' ? 'today' : 'all');
  };

  const openQuotaDialog = () => {
    if (!isAdmin) return;
    setQuotaForm(hasDailySalesTarget ? dailySalesTarget.toFixed(2) : '');
    setIsQuotaDialogOpen(true);
  };

  const saveDailyQuota = async () => {
    if (!isAdmin || isSavingQuota) return;

    const cleanValue = quotaForm.trim();
    if (cleanValue) {
      const parsedValue = Number(cleanValue);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        toast.warning('Daily quota must be greater than zero.', {
          id: 'dashboard-daily-quota-invalid',
          duration: 2500
        });
        return;
      }
    }

    try {
      setIsSavingQuota(true);
      await updateDailySalesTarget(cleanValue ? Number(cleanValue) : null);
      toast.success(cleanValue ? 'Daily quota updated.' : 'Daily quota cleared.');
      setIsQuotaDialogOpen(false);
    } catch (err) {
      const message = err?.response?.data?.error || 'Daily quota could not be saved.';
      toast.error(message);
    } finally {
      setIsSavingQuota(false);
    }
  };

  const resetStockCountForm = () => {
    setStockCountForm({
      itemId: '',
      physicalCount: ''
    });
    setStockCountSearch('');
    setIsStockCountSelectorOpen(false);
    setStockCountActiveIndex(0);
  };

  const selectStockCountItem = item => {
    if (!item) return;
    setStockCountForm(prev => ({
      ...prev,
      itemId: String(item.id)
    }));
    setStockCountSearch(getStockCountItemDisplayName(item));
    setIsStockCountSelectorOpen(false);
    setStockCountActiveIndex(0);
  };

  const handleStockCountSearchChange = value => {
    setStockCountSearch(value);
    setStockCountForm(prev => ({
      ...prev,
      itemId: ''
    }));
    setIsStockCountSelectorOpen(true);
    setStockCountActiveIndex(0);
  };

  const handleStockCountSearchKeyDown = event => {
    if (event.key === 'Escape') {
      setIsStockCountSelectorOpen(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsStockCountSelectorOpen(true);
      setStockCountActiveIndex(current => Math.min(current + 1, Math.max(filteredStockCountItems.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsStockCountSelectorOpen(true);
      setStockCountActiveIndex(current => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter' && isStockCountSelectorOpen) {
      event.preventDefault();
      selectStockCountItem(filteredStockCountItems[stockCountActiveIndex]);
    }
  };

  const openInventoryStatus = status => {
    localStorage.removeItem('dashboardSearchStatusFilter');
    localStorage.setItem('dashboardInventoryStatusFilter', status || 'all');
    window.dispatchEvent(new CustomEvent('dashboard-inventory-status-filter', {
      detail: { status: status || 'all' }
    }));
    onNavigate('inventory', { preserveInventoryNavigationState: true });
  };

  // Dashboard buttons communicate targets through storage/events so destination
  // modules can open the correct dialog or report after route navigation.
  const openInventoryAction = (action, itemId = '') => {
    if ((action === 'stock-in' || action === 'stock-out') && !canUseInventoryMovement) return;
    if (action === 'add-item' && !isAdmin) return;

    localStorage.setItem('dashboardInventoryAction', action);
    if (itemId) localStorage.setItem('dashboardInventoryItemId', String(itemId));
    else localStorage.removeItem('dashboardInventoryItemId');
    window.dispatchEvent(new CustomEvent('dashboard-inventory-action', {
      detail: { action, itemId }
    }));
    onNavigate('inventory', { preserveInventoryNavigationState: true });
  };

  const openTargetReport = (reportType, options = {}) => {
    if (!canUseReports) return;
    const {
      period,
      date = getTodayDateKey(),
      category = 'all',
      customStartDate = '',
      customEndDate = ''
    } = options;
    localStorage.setItem('reports_target_type', reportType);
    localStorage.setItem('reports_target_category', category);
    if (period) {
      localStorage.setItem('reports_target_period', period);
      localStorage.setItem('reports_target_date', date);
    } else {
      localStorage.removeItem('reports_target_period');
      localStorage.removeItem('reports_target_date');
    }
    if (period === 'custom' && customStartDate && customEndDate) {
      localStorage.setItem('reports_target_custom_start', customStartDate);
      localStorage.setItem('reports_target_custom_end', customEndDate);
    } else {
      localStorage.removeItem('reports_target_custom_start');
      localStorage.removeItem('reports_target_custom_end');
    }
    window.dispatchEvent(new CustomEvent('reports-target-view', {
      detail: { reportType, category, period, date, customStartDate, customEndDate }
    }));
    onNavigate('reports');
  };

  const openSalesHistory = (period = 'all') => {
    if (!canUseSales) return;
    localStorage.setItem('sales_history_target_period', period);
    window.dispatchEvent(new CustomEvent('sales-history-target-view', {
      detail: { period }
    }));
    onNavigate('sales');
  };

  const openSalesEntry = () => {
    if (!canUseSales) return;
    localStorage.removeItem('sales_history_target_period');
    localStorage.setItem('sales_entry_target', 'true');
    window.dispatchEvent(new CustomEvent('sales-entry-target-view'));
    onNavigate('sales');
  };

  const openPurchaseEntry = () => {
    if (!canUsePurchases) return;
    localStorage.setItem('purchase_entry_target', 'true');
    window.dispatchEvent(new CustomEvent('purchase-entry-target-view'));
    onNavigate('purchases');
  };

  const openAlertsTab = tab => {
    localStorage.setItem('alerts_target_tab', tab);
    localStorage.setItem('alerts_scroll_to_top', 'true');
    window.dispatchEvent(new CustomEvent('alerts-target-tab', {
      detail: { tab }
    }));
    onNavigate('alerts');
  };

  const openStockCountAdjustment = action => {
    const selectedItemId = selectedCountItem?.id;
    setIsStockCountDialogOpen(false);
    resetStockCountForm();
    openInventoryAction(action, selectedItemId);
  };

  const stockStatusCards = [
    {
      label: 'Out of Stock',
      value: outOfStockItems.length,
      detail: outOfStockItems.length > 0 ? 'Needs immediate restock' : 'No depleted items',
      icon: AlertTriangle,
      tone: outOfStockItems.length > 0 ? 'red' : 'green',
      action: () => openInventoryStatus('Out of Stock')
    },
    {
      label: 'Low Stock',
      value: lowStockItems.length,
      detail: lowStockItems.length > 0 ? 'Below manual threshold' : 'Stock levels are safe',
      icon: Package,
      tone: lowStockItems.length > 0 ? 'amber' : 'green',
      action: () => openInventoryStatus('Low Stock')
    }
  ];

  const primaryCards = isInventoryStaff ? [
    {
      label: 'Active Inventory Items',
      value: inventory.length,
      detail: `${inStockItems.length} currently in stock`,
      icon: Package,
      tone: 'blue',
      action: () => onNavigate('inventory')
    },
    ...stockStatusCards,
    {
      label: 'In Stock Items',
      value: inStockItems.length,
      detail: 'Available for store use',
      icon: Package,
      tone: 'green',
      action: () => openInventoryStatus('In Stock')
    }
  ] : [
    {
      label: 'Overall Sales',
      value: formatCurrency(overallSalesAmount),
      helpText: 'Formula: add all completed invoice totals.',
      detail: `${completedSales.length} completed transaction${completedSales.length === 1 ? '' : 's'}`,
      sensitive: true,
      icon: ReceiptText,
      tone: 'blue',
      action: canUseSales ? () => openSalesHistory('all') : undefined
    },
    isAdmin && {
      label: 'Cost of Goods Sold',
      value: formatCurrency(overallProfitSummary.puhunanUsed),
      helpText: 'Formula: quantity sold x saved item cost.',
      detail: 'Total cost of sold items',
      sensitive: true,
      icon: Wallet,
      tone: 'amber',
      action: canUseReports ? () => openTargetReport('actual-earnings') : undefined
    },
    isAdmin && {
      label: 'Actual Profit',
      value: formatCurrency(overallProfitSummary.actualProfit),
      helpText: 'Formula: Overall Sales - Cost of Goods Sold.',
      detail: `${overallProfitSummary.profitMargin.toLocaleString(undefined, { maximumFractionDigits: 1 })}% profit margin`,
      sensitive: true,
      maskedDetail: '**** profit margin',
      icon: Wallet,
      tone: overallProfitSummary.actualProfit >= 0 ? 'green' : 'red',
      action: canUseReports ? () => openTargetReport('actual-earnings') : undefined
    },
    isAdmin && {
      label: 'Best Seller',
      value: topSellingDashboardPeriod ? `${topSellingDashboardPeriod.quantity} sold` : 'None',
      detail: topSellingDashboardPeriod
        ? `${topSellingDashboardPeriod.itemName}${topSellingDashboardPeriod.isManual ? ' - non-inventory item' : ''}`
        : 'No item sales for selected dates',
      icon: Package,
      tone: 'green',
      action: canUseReports || canUseSales ? openDashboardBestSellerReport : undefined
    },
    ...stockStatusCards
  ].filter(Boolean);

  const operationsCards = isInventoryStaff ? [
    {
      label: 'Stock In Today',
      value: stockInTodayCount,
      detail: 'Received stock records',
      icon: PackagePlus,
      tone: 'green',
      action: canUseReports ? () => openTargetReport('movements', { period: 'daily' }) : undefined
    },
    {
      label: 'Stock Out Today',
      value: stockOutTodayCount,
      detail: 'Manual deduction records',
      icon: Activity,
      tone: 'red',
      action: canUseReports ? () => openTargetReport('movements', { period: 'daily' }) : undefined
    },
    {
      label: 'Units Moved Today',
      value: unitsMovedToday,
      detail: 'Total units adjusted',
      icon: Package,
      tone: 'blue',
      action: canUseReports ? () => openTargetReport('movements', { period: 'daily' }) : undefined
    }
  ] : [
    {
      label: 'Sales Total',
      value: formatCurrency(dashboardProfitSummary.totalSales),
      helpText: 'Formula: add completed sales for selected dates.',
      detail: `${dashboardSales.length} transaction${dashboardSales.length === 1 ? '' : 's'} for ${salesPeriodRangeLabel}`,
      sensitive: true,
      icon: ReceiptText,
      tone: 'blue',
      comparison: salesAmountComparison,
      action: canUseReports || canUseSales ? openDashboardSalesReport : undefined
    },
    isAdmin && {
      label: 'Cost of Goods Sold',
      value: formatCurrency(dashboardProfitSummary.puhunanUsed),
      helpText: 'Formula: quantity sold for selected dates x saved item cost.',
      detail: 'Cost of sold items for selected dates',
      sensitive: true,
      icon: Wallet,
      tone: 'amber',
      action: canUseReports ? () => openTargetReport('actual-earnings', salesReportTarget) : undefined
    },
    isAdmin && {
      label: 'Actual Profit',
      value: formatCurrency(dashboardProfitSummary.actualProfit),
      helpText: 'Formula: selected sales - selected Cost of Goods Sold.',
      detail: `${dashboardProfitSummary.profitMargin.toLocaleString(undefined, { maximumFractionDigits: 1 })}% profit margin`,
      sensitive: true,
      maskedDetail: '**** profit margin',
      icon: TrendingUp,
      tone: dashboardProfitSummary.actualProfit >= 0 ? 'green' : 'red',
      comparison: actualProfitComparison,
      action: canUseReports ? () => openTargetReport('actual-earnings', salesReportTarget) : undefined
    },
    (isAdmin || isSalesEncoder || canUseSales) && {
      label: 'Daily Quota',
      value: hasDailySalesTarget ? `${quotaProgress}%` : 'Not set',
      detail: hasDailySalesTarget
        ? `${formatCurrency(salesTodayAmount)} of ${formatCurrency(dailySalesTarget)} reached`
        : 'No daily quota set',
      sensitive: true,
      maskedValue: '****',
      maskedDetail: 'PHP ***** of PHP ***** reached',
      icon: Target,
      tone: hasDailySalesTarget && salesTodayAmount >= dailySalesTarget ? 'green' : 'amber',
      progress: hasDailySalesTarget ? quotaProgress : undefined,
      action: isAdmin ? openQuotaDialog : undefined
    },
    canUseSales && {
      label: 'Best Seller',
      value: topSellingDashboardPeriod ? `${topSellingDashboardPeriod.quantity} sold` : 'None',
      detail: topSellingDashboardPeriod
        ? `${topSellingDashboardPeriod.itemName}${topSellingDashboardPeriod.isManual ? ' - non-inventory item' : ''}`
        : 'No item sales for selected dates',
      icon: Package,
      tone: 'green',
      action: canUseReports || canUseSales ? openDashboardBestSellerReport : undefined
    },
    (isAdmin || isInventoryAuthorizedView) && {
      label: 'Stock Movements Today',
      value: stockMovementsToday.length,
      detail: 'Stock in/out records today',
      icon: Activity,
      tone: 'blue',
      action: canUseReports ? () => openTargetReport('movements', { period: 'daily' }) : undefined
    },
    (!isAdmin && (isInventoryAuthorizedView || canUseSales)) && {
      label: 'Units Sold',
      value: dashboardSalesQuantity,
      detail: `${formatUnitLabel(dashboardSalesQuantity).replace(/^./, char => char.toUpperCase())} sold for selected dates`,
      icon: Package,
      tone: 'purple',
      comparison: unitsSoldComparison,
      action: canUseReports || canUseSales ? openDashboardSalesReport : undefined
    }
  ].filter(Boolean);
  const hasSensitiveSummaryCards = primaryCards.some(card => card.sensitive);
  const applyFinancialPrivacy = card => (
    card.sensitive && !showFinancialValues
      ? {
        ...card,
        value: card.maskedValue || 'PHP *****',
        detail: card.maskedDetail || card.detail,
        comparison: null,
        progress: undefined
      }
      : card
  );
  const displayPrimaryCards = primaryCards.map(applyFinancialPrivacy);
  const displayOperationsCards = operationsCards.map(applyFinancialPrivacy);

  // Quick actions intentionally open task-specific workflows, filtered views,
  // or dialogs instead of duplicating the sidebar's module navigation.
  const quickActions = [
    canUseSales && {
      label: 'Record Sale',
      detail: 'Start checkout',
      icon: ReceiptText,
      tone: 'blue',
      action: openSalesEntry
    },
    canUsePurchases && {
      label: 'Receive Delivery',
      detail: 'Supplier receiving',
      icon: Truck,
      tone: 'green',
      action: openPurchaseEntry
    },
    canUseInventoryMovement && {
      label: 'Stock In',
      detail: 'Receive stock',
      icon: PackagePlus,
      tone: 'green',
      action: () => openInventoryAction('stock-in')
    },
    canUseInventoryMovement && {
      label: 'Stock Out',
      detail: 'Non-sales deduction',
      icon: Activity,
      tone: 'red',
      action: () => openInventoryAction('stock-out')
    },
    canUseInventoryMovement && {
      label: 'Verify Stock',
      detail: 'Count checking',
      icon: ClipboardCheck,
      tone: 'amber',
      action: () => setIsStockCountDialogOpen(true)
    },
    isAdmin && {
      label: 'Add Item',
      detail: 'New inventory record',
      icon: Package,
      tone: 'purple',
      action: () => openInventoryAction('add-item')
    },
    canUseReports && isInventoryAuthorizedView && {
      label: 'Supplier Reorder',
      detail: 'Prepare restock list',
      icon: FileText,
      tone: 'emerald',
      action: () => openTargetReport('supplier-reorder')
    },
    canUseReports && canUseSales && {
      label: "Today's Summary",
      detail: 'Open sales report',
      icon: FileText,
      tone: 'emerald',
      action: () => openTargetReport('sales-movements', { period: 'daily', date: todayKey })
    },
    canUseSales && {
      label: 'Recent Sales',
      detail: "Today's transactions",
      icon: ReceiptText,
      tone: 'blue',
      action: () => openSalesHistory('today')
    },
    canUseSales && canAccessScreen(role, 'inventory') && !canUseInventoryMovement && {
      label: 'Check Stock',
      detail: 'Available items',
      icon: Package,
      tone: 'green',
      action: () => openInventoryStatus('In Stock')
    },
    !canUseSales && canAccessScreen(role, 'inventory') && {
      label: 'Review Low Stock',
      detail: `${lowStockItems.length} below threshold`,
      icon: AlertTriangle,
      tone: lowStockItems.length > 0 ? 'amber' : 'green',
      action: () => openInventoryStatus('Low Stock')
    }
  ].filter(Boolean);

  const attentionItems = [
    isInventoryAuthorizedView && missingItemDetailKeys.size > 0 && {
      label: 'Complete item details',
      detail: missingItemDetailParts.join(', '),
      value: missingItemDetailKeys.size,
      icon: ClipboardCheck,
      tone: 'amber',
      action: () => onNavigate('inventory')
    },
    unreadAlertCount > 0 && {
      label: 'Unread alerts',
      detail: 'System notifications',
      value: unreadAlertCount,
      icon: AlertTriangle,
      tone: 'blue',
      action: () => openAlertsTab('unread')
    },
    isAdmin && pendingItemRequests.length > 0 && {
      label: 'Pending item requests',
      detail: pendingItemRequestParts.length > 0 ? pendingItemRequestParts.join(', ') : 'Employee inventory requests',
      value: pendingItemRequests.length,
      icon: ClipboardCheck,
      tone: 'amber',
      action: () => openInventoryAction('review-item-requests')
    },
    (isAdmin || isInventoryAuthorizedView) && manualReviewCount > 0 && {
      label: 'Manual items for review',
      detail: 'Non-inventory sales',
      value: manualReviewCount,
      icon: ClipboardCheck,
      tone: 'amber',
      action: () => openTargetReport('untracked-sales', {
        period: 'custom',
        date: manualReviewEndDate,
        customStartDate: manualReviewStartDate,
        customEndDate: manualReviewEndDate
      })
    }
  ].filter(Boolean);

  const quickActionsSection = (
    <section className={`dashboard-panel ${isInventoryStaff || isCombinedSalesInventory ? 'dashboard-inventory-actions-panel' : ''} ${isSalesEncoder ? 'dashboard-sales-encoder-actions-panel' : ''}`} aria-label="Quick actions">
      <div className="dashboard-panel-header">
        <div className="min-w-0">
          <h2 className="dashboard-panel-title">Quick Actions</h2>
          <p className="dashboard-panel-subtitle">Only actions available to this role are shown.</p>
        </div>
      </div>
      <div className="dashboard-action-grid">
        {quickActions.map(action => (
          <ActionButton key={action.label} {...action} />
        ))}
      </div>
    </section>
  );

  const attentionSection = (
    <section className={`dashboard-panel ${isSalesEncoder || isCombinedSalesInventory ? 'dashboard-sales-encoder-attention-panel' : ''}`} aria-label="Needs attention">
      <div className="dashboard-panel-header">
        <div className="min-w-0">
          <h2 className="dashboard-panel-title">Needs Attention</h2>
          <p className="dashboard-panel-subtitle">Short alerts only. Open the module for details.</p>
        </div>
      </div>
      {attentionItems.length > 0 ? (
        <div className="dashboard-attention-list">
          {attentionItems.map(item => (
            <button key={item.label} type="button" className={`dashboard-attention-button attention-${item.tone || 'slate'}`} onClick={item.action}>
              <span className="dashboard-attention-left">
                <span className="dashboard-attention-icon">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="dashboard-attention-title block">{item.label}</span>
                  <span className="dashboard-attention-detail block">{item.detail}</span>
                </span>
              </span>
              <span className="dashboard-attention-value">{item.value}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty-state">No urgent items right now.</div>
      )}
    </section>
  );

  const operationsSection = (
    <section className="dashboard-panel dashboard-operations-panel" aria-label="Selected date summary">
      <div className="dashboard-panel-header">
        <div className="min-w-0">
          <h2 className="dashboard-panel-title">Selected Date Summary</h2>
          <p className="dashboard-panel-subtitle">Shows sales for the dates selected above. Daily quota and stock movement counts are for today.</p>
        </div>
      </div>
      <div className="dashboard-summary-grid dashboard-operations-grid">
        {displayOperationsCards.map(card => (
          <SummaryCard key={card.label} {...card} />
        ))}
      </div>
    </section>
  );

  return (
    <div className="dashboard-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        /* Dashboard page shell establishes the neutral reporting surface shared by all summary cards. */
        .dashboard-page {
          color: #111827;
        }

        .dashboard-page > .mb-8 {
          margin-bottom: 16px !important;
        }

        .dashboard-content {
          display: grid;
          gap: 14px;
        }

        .dashboard-panel {
          border: 1px solid #dbe3ef;
          border-radius: 12px;
          background: #ffffff;
          box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
          overflow: hidden;
        }

        .dashboard-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 15px 16px;
          border-bottom: 1px solid #e5edf6;
          background: #ffffff;
        }

        .dashboard-privacy-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2.25rem;
          height: 2.25rem;
          min-height: 2.25rem;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: #334155;
          padding: 0;
          box-shadow: none;
          transition: background-color 140ms ease, color 140ms ease;
        }

        .dashboard-privacy-toggle:hover,
        .dashboard-privacy-toggle:focus-visible {
          background: #f8fafc;
          color: #0f172a;
          box-shadow: none;
        }

        .dashboard-privacy-toggle-hidden {
          color: #b45309;
        }

        .dashboard-privacy-toggle-hidden:hover,
        .dashboard-privacy-toggle-hidden:focus-visible {
          background: #fffbeb;
          color: #92400e;
        }

        .dashboard-privacy-actions {
          display: inline-flex;
          align-items: center;
          flex-shrink: 0;
        }

        .dashboard-panel-title {
          margin: 0;
          color: #111827;
          font-size: 17px;
          font-weight: 800;
          line-height: 1.2;
        }

        .dashboard-panel-subtitle {
          margin-top: 3px;
          color: #111827;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.35;
        }

        .dashboard-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
          gap: 10px;
          padding: 12px;
        }

        /* Sales filter controls keep dashboard metrics tied to the selected reporting period. */
        .dashboard-sales-filter-panel {
          padding: 14px 16px;
        }

        .dashboard-sales-filter-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.36fr);
          gap: 16px;
          align-items: center;
        }

        .dashboard-sales-filter-row.is-date-mode {
          grid-template-columns: minmax(0, 1fr) minmax(11.5rem, 0.24fr) minmax(11rem, 0.22fr) minmax(11rem, 0.22fr);
        }

        .dashboard-sales-filter-copy {
          min-width: 0;
          align-self: center;
        }

        .dashboard-sales-filter-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #111827;
          font-size: 16px;
          font-weight: 850;
          line-height: 1.25;
        }

        .dashboard-sales-filter-detail {
          margin-top: 4px;
          color: #111827;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.35;
        }

        .dashboard-sales-filter-field {
          display: grid;
          gap: 6px;
          min-width: 0;
          width: 100%;
        }

        .dashboard-sales-filter-label {
          color: #111827;
          font-size: 12px;
          font-weight: 800;
        }

        .dashboard-sales-filter-control,
        .dashboard-sales-filter-date {
          height: 42px;
          border-color: #cbd5e1;
          border-radius: 10px;
          background: #ffffff;
        }

        .dashboard-sales-filter-date {
          width: 100%;
          padding: 0 12px;
          color: #111827;
          font-size: 14px;
          font-weight: 650;
        }

        .dashboard-admin-summary-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          grid-auto-rows: 1fr;
        }

        .dashboard-admin-summary-grid .dashboard-summary-card {
          height: 100%;
          min-height: 118px;
        }

        .dashboard-operations-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          grid-auto-rows: 1fr;
        }

        .dashboard-operations-grid .dashboard-summary-card {
          height: 100%;
          min-height: 118px;
        }

        /* Summary cards use consistent sizing so dashboard totals remain easy to compare. */
        .dashboard-summary-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: start;
          min-height: 86px;
          border: 1px solid #dbe3ef;
          border-left-width: 5px;
          border-radius: 10px;
          background: #ffffff;
          padding: 11px 12px;
          text-align: left;
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .dashboard-summary-body {
          min-width: 0;
        }

        .dashboard-summary-card:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.07);
        }

        .dashboard-summary-card[role="button"] {
          cursor: pointer;
        }

        .summary-blue {
          border-left-color: #2563eb;
        }

        .summary-red {
          border-left-color: #dc2626;
        }

        .summary-amber {
          border-left-color: #f59e0b;
        }

        .summary-green {
          border-left-color: #16a34a;
        }

        .dashboard-summary-label {
          color: #111827;
          font-size: 12px;
          font-weight: 700;
        }

        .dashboard-summary-value {
          margin-top: 5px;
          color: #0f172a;
          font-size: clamp(21px, 1.9vw, 30px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0;
          overflow-wrap: anywhere;
        }

        .dashboard-summary-value-row {
          display: inline-flex;
          max-width: 100%;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }

        .dashboard-summary-help-button {
          display: inline-flex;
          width: 18px;
          height: 18px;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border: 1px solid #dbe3ef;
          border-radius: 999px;
          background: #ffffff;
          color: #475569;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .dashboard-summary-help-button:hover,
        .dashboard-summary-help-button:focus-visible {
          border-color: #93c5fd;
          background: #eff6ff;
          color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
          outline: 0;
        }

        .dashboard-summary-help-button svg {
          width: 12px;
          height: 12px;
        }

        .dashboard-summary-help-content {
          max-width: min(190px, calc(100vw - 28px));
          border: 1px solid #dbe3ef;
          background: #0f172a;
          color: #ffffff;
          padding: 6px 8px;
          font-size: 11px;
          font-weight: 650;
          line-height: 1.25;
          text-align: left;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.22);
        }

        .dashboard-summary-detail {
          margin-top: 5px;
          color: #111827;
          font-size: 11px;
          font-weight: 600;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }

        .dashboard-summary-comparison {
          display: inline-flex;
          grid-column: 1 / -1;
          width: max-content;
          max-width: min(100%, 42rem);
          margin-top: 7px;
          border-radius: 14px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 800;
          line-height: 1.25;
          overflow-wrap: anywhere;
          white-space: normal;
        }

        .comparison-up {
          background: #dcfce7;
          color: #166534;
        }

        .comparison-down {
          background: #fee2e2;
          color: #991b1b;
        }

        .comparison-neutral {
          background: #f1f5f9;
          color: #111827;
        }

        .dashboard-summary-icon {
          display: inline-flex;
          width: 40px;
          height: 40px;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #f8fafc;
          color: #475569;
        }

        .dashboard-summary-progress {
          display: block;
          grid-column: 1 / -1;
          width: 100%;
          height: 7px;
          margin-top: 10px;
          overflow: hidden;
          border-radius: 999px;
          background: #e5e7eb;
        }

        .dashboard-summary-progress-fill {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #f59e0b;
        }

        .summary-green .dashboard-summary-progress-fill {
          background: #16a34a;
        }

        .dashboard-quota-dialog {
          width: min(560px, calc(100vw - 32px));
          max-height: calc(100dvh - 28px);
          overflow: hidden;
          padding: 0;
        }

        .dashboard-quota-header {
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr);
          gap: 14px;
          align-items: center;
          padding: 22px 24px 16px;
          border-bottom: 1px solid #edf2f7;
        }

        .dashboard-quota-icon {
          display: inline-flex;
          width: 48px;
          height: 48px;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          background: #fff7ed;
          color: #ff6b00;
        }

        .dashboard-quota-title {
          color: #111827;
          font-size: 24px;
          line-height: 1.15;
          font-weight: 900;
          letter-spacing: 0;
        }

        .dashboard-quota-description {
          margin-top: 6px;
          color: #111827;
          font-size: 14px;
          line-height: 1.5;
        }

        .dashboard-quota-body {
          display: grid;
          gap: 16px;
          padding: 18px 24px 20px;
        }

        .dashboard-quota-field {
          display: grid;
          gap: 8px;
        }

        .dashboard-quota-input {
          height: 52px;
          border: 1px solid #dbe3ef;
          border-radius: 12px;
          background: #ffffff;
          color: #0f172a;
          font-size: 18px;
          font-weight: 700;
          transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
        }

        .dashboard-quota-input:hover {
          border-color: #f59e0b;
          background: #fffdf7;
        }

        .dashboard-quota-input:focus,
        .dashboard-quota-input:focus-visible {
          border-color: #ff6b00;
          box-shadow: 0 0 0 3px rgba(255, 107, 0, 0.18);
        }

        .dashboard-quota-summary {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          border: 1px solid #dbe3ef;
          border-radius: 14px;
          background: #f8fafc;
          padding: 12px;
        }

        .dashboard-quota-summary-item {
          min-width: 0;
          border-radius: 10px;
          background: #ffffff;
          padding: 11px 12px;
        }

        .dashboard-quota-summary-label {
          display: block;
          color: #111827;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.2;
        }

        .dashboard-quota-summary-value {
          display: block;
          margin-top: 5px;
          color: #0f172a;
          font-size: 18px;
          font-weight: 900;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .dashboard-quota-footer {
          display: grid;
          grid-template-columns: repeat(2, minmax(112px, max-content));
          justify-content: end;
          align-items: center;
          gap: 10px;
          padding: 14px 24px 20px;
          border-top: 1px solid #edf2f7;
          background: #ffffff;
        }

        .dashboard-quota-footer .dashboard-quota-button {
          min-width: 112px;
          min-height: 44px;
          border-radius: 10px;
          font-weight: 800;
        }

        .dashboard-quota-secondary-button {
          border-color: #dbe3ef;
          background: #ffffff;
          color: #0f172a;
        }

        .dashboard-quota-secondary-button:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        .dashboard-quota-primary-button {
          background: #ff6b00;
          color: #ffffff;
          box-shadow: 0 8px 18px rgba(255, 107, 0, 0.22);
        }

        .dashboard-quota-primary-button:hover {
          background: #e85f00;
          color: #ffffff;
        }

        .dashboard-quota-primary-button:disabled {
          opacity: 1;
          background: #f3a366;
          color: #ffffff;
          box-shadow: none;
        }

        /* Quota dialog rules keep inventory warning details readable on narrow phones. */
        @media (max-width: 520px) {
          .dashboard-quota-dialog {
            width: min(420px, calc(100vw - 24px));
            max-height: calc(100dvh - 20px);
            overflow-y: auto;
          }

          .dashboard-quota-header {
            grid-template-columns: 38px minmax(0, 1fr);
            gap: 10px;
            padding: 16px 16px 12px;
          }

          .dashboard-quota-icon {
            width: 38px;
            height: 38px;
            border-radius: 12px;
          }

          .dashboard-quota-title {
            font-size: 20px;
          }

          .dashboard-quota-description {
            margin-top: 4px;
            font-size: 13px;
            line-height: 1.4;
          }

          .dashboard-quota-body,
          .dashboard-quota-footer {
            padding-left: 16px;
            padding-right: 16px;
          }

          .dashboard-quota-body {
            gap: 14px;
            padding-top: 16px;
            padding-bottom: 16px;
          }

          .dashboard-quota-input {
            height: 48px;
            font-size: 17px;
          }

          .dashboard-quota-summary {
            gap: 8px;
            padding: 10px;
          }

          .dashboard-quota-summary {
            grid-template-columns: 1fr;
          }

          .dashboard-quota-summary-item {
            padding: 10px 11px;
          }

          .dashboard-quota-summary-value {
            font-size: 17px;
          }

          .dashboard-quota-footer {
            grid-template-columns: 1fr;
            gap: 8px;
            padding-top: 12px;
            padding-bottom: 16px;
          }

          .dashboard-quota-footer .dashboard-quota-button {
            width: 100%;
            min-height: 46px;
          }
        }

        @media (max-width: 380px) {
          .dashboard-quota-dialog {
            width: calc(100vw - 16px);
          }

          .dashboard-quota-header {
            grid-template-columns: 1fr;
          }

          .dashboard-quota-icon {
            width: 36px;
            height: 36px;
          }

          .dashboard-quota-title {
            font-size: 19px;
          }
        }

        .summary-blue .dashboard-summary-icon {
          background: #eff6ff;
          color: #2563eb;
        }

        .summary-red .dashboard-summary-icon {
          background: #fef2f2;
          color: #dc2626;
        }

        .summary-amber .dashboard-summary-icon {
          background: #fffbeb;
          color: #d97706;
        }

        .summary-green .dashboard-summary-icon {
          background: #ecfdf5;
          color: #16a34a;
        }

        .dashboard-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.75fr);
          gap: 14px;
          align-items: stretch;
        }

        .dashboard-main-grid > .dashboard-panel {
          display: flex;
          height: 100%;
          flex-direction: column;
        }

        .dashboard-main-grid .dashboard-action-grid,
        .dashboard-main-grid .dashboard-attention-list {
          flex: 1;
        }

        .dashboard-sales-encoder-work-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          grid-template-areas:
            "actions operations"
            "attention operations";
          gap: 14px;
          align-items: stretch;
        }

        .dashboard-sales-encoder-actions-panel {
          grid-area: actions;
        }

        .dashboard-sales-encoder-attention-panel {
          grid-area: attention;
        }

        .dashboard-sales-encoder-work-grid .dashboard-action-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .dashboard-sales-encoder-work-grid .dashboard-operations-grid {
          grid-template-columns: 1fr;
        }

        .dashboard-sales-encoder-work-grid .dashboard-operations-panel {
          grid-area: operations;
        }

        .dashboard-sales-encoder-work-grid .dashboard-panel {
          height: 100%;
        }

        .dashboard-combined-work-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.95fr);
          grid-template-areas:
            "actions operations"
            "attention operations";
          gap: 14px;
          align-items: stretch;
        }

        .dashboard-combined-work-grid .dashboard-inventory-actions-panel {
          grid-area: actions;
        }

        .dashboard-combined-work-grid .dashboard-sales-encoder-attention-panel {
          grid-area: attention;
        }

        .dashboard-combined-work-grid .dashboard-operations-panel {
          grid-area: operations;
        }

        .dashboard-combined-work-grid .dashboard-action-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-auto-rows: minmax(92px, auto);
        }

        .dashboard-combined-work-grid .dashboard-operations-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .dashboard-combined-work-grid .dashboard-panel {
          height: 100%;
        }

        .dashboard-action-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          padding: 12px;
          align-items: stretch;
          grid-auto-rows: minmax(112px, auto);
        }

        .dashboard-inventory-summary-panel .dashboard-summary-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .dashboard-inventory-summary-panel .dashboard-summary-card {
          min-height: 96px;
        }

        .dashboard-inventory-actions-panel .dashboard-action-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .dashboard-action-button,
        .dashboard-attention-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid #dbe3ef;
          border-radius: 14px;
          background: #ffffff;
          width: 100%;
          min-height: 112px;
          padding: 13px;
          text-align: left;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }

        .dashboard-action-button {
          height: 100%;
        }

        .dashboard-action-button:hover,
        .dashboard-attention-button:hover {
          border-color: #cbd5e1;
          background: #ffffff;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
          transform: translateY(-1px);
        }

        .dashboard-action-left {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr);
          gap: 12px;
          min-width: 0;
          align-items: start;
        }

        .dashboard-action-icon {
          display: inline-flex;
          width: 38px;
          height: 38px;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 10px;
          background: #f1f5f9;
          color: #334155;
        }

        .dashboard-action-copy {
          display: grid;
          min-width: 0;
          gap: 5px;
        }

        .dashboard-action-title,
        .dashboard-attention-title {
          color: #111827;
          font-size: 15px;
          font-weight: 850;
          line-height: 1.18;
        }

        .dashboard-action-detail {
          color: #111827;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.3;
        }

        .dashboard-attention-list {
          display: grid;
          gap: 8px;
          padding: 12px;
          align-content: start;
          align-items: start;
          grid-auto-rows: minmax(58px, auto);
        }

        .dashboard-attention-button {
          height: auto;
          min-height: 58px;
        }

        .dashboard-attention-left {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 10px;
        }

        .dashboard-attention-icon {
          display: inline-flex;
          width: 34px;
          height: 34px;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 10px;
          background: #f1f5f9;
          color: #334155;
        }

        .dashboard-action-button.action-blue .dashboard-action-icon {
          background: #eff6ff;
          color: #2563eb;
        }

        .dashboard-action-button.action-green .dashboard-action-icon {
          background: #ecfdf5;
          color: #16a34a;
        }

        .dashboard-action-button.action-red .dashboard-action-icon {
          background: #fef2f2;
          color: #dc2626;
        }

        .dashboard-action-button.action-amber .dashboard-action-icon {
          background: #fffbeb;
          color: #d97706;
        }

        .dashboard-action-button.action-purple .dashboard-action-icon {
          background: #f5f3ff;
          color: #7c3aed;
        }

        .dashboard-action-button.action-emerald .dashboard-action-icon {
          background: #ecfdf5;
          color: #059669;
        }

        .attention-amber .dashboard-attention-icon {
          background: #fffbeb;
          color: #d97706;
        }

        .attention-blue .dashboard-attention-icon {
          background: #eff6ff;
          color: #2563eb;
        }

        .attention-red .dashboard-attention-icon {
          background: #fef2f2;
          color: #dc2626;
        }

        .dashboard-attention-detail {
          margin-top: 2px;
          color: #111827;
          font-size: 11px;
          font-weight: 600;
          line-height: 1.2;
        }

        .dashboard-attention-value {
          display: inline-flex;
          min-width: 34px;
          height: 30px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid #dbe3ef;
          background: #f8fafc;
          color: #111827;
          padding: 0 9px;
          font-size: 13px;
          font-weight: 900;
        }

        .dashboard-empty-state {
          margin: 14px;
          border: 1px dashed #cbd5e1;
          border-radius: 10px;
          background: #f8fafc;
          padding: 16px;
          color: #111827;
          font-size: 14px;
          font-weight: 600;
          text-align: center;
        }

        .dashboard-stock-search {
          position: relative;
          min-width: 0;
        }

        .dashboard-stock-search-input {
          height: 44px;
          border-color: #dbe3ef;
          border-radius: 10px;
          background: #ffffff;
          color: #111827;
          font-size: 14px;
          font-weight: 600;
          padding-right: 2.75rem;
          transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
        }

        .dashboard-stock-search-input:hover {
          border-color: #bfdbfe;
          background: #fbfdff;
        }

        .dashboard-stock-search-input:focus,
        .dashboard-stock-search-input:focus-visible {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
          outline: 0;
        }

        .dashboard-stock-search-results {
          position: absolute;
          z-index: 80;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          display: grid;
          max-height: min(18rem, 42vh);
          overflow-y: auto;
          border: 1px solid #dbe3ef;
          border-radius: 12px;
          background: #ffffff;
          box-shadow: 0 18px 34px rgba(15, 23, 42, 0.16);
          padding: 6px;
        }

        .dashboard-stock-search-option {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          width: 100%;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #111827;
          padding: 10px 12px;
          text-align: left;
          transition: background-color 140ms ease, color 140ms ease;
        }

        .dashboard-stock-search-option:hover,
        .dashboard-stock-search-option.is-active {
          background: #eff6ff;
          color: #0f172a;
        }

        .dashboard-stock-search-main {
          display: grid;
          min-width: 0;
          gap: 3px;
        }

        .dashboard-stock-search-name {
          overflow: hidden;
          color: #111827;
          font-size: 14px;
          font-weight: 800;
          line-height: 1.3;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dashboard-stock-search-meta {
          overflow: hidden;
          color: #111827;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dashboard-stock-search-stock {
          flex-shrink: 0;
          border-radius: 999px;
          background: #f1f5f9;
          color: #111827;
          padding: 5px 9px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }

        .dashboard-stock-search-empty {
          border-radius: 10px;
          background: #f8fafc;
          color: #111827;
          padding: 14px 12px;
          font-size: 14px;
          font-weight: 700;
          text-align: center;
        }

        .dashboard-count-preview {
          border: 1px solid #dbeafe;
          border-radius: 12px;
          background: #eff6ff;
          padding: 12px;
        }

        .dashboard-count-preview-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.78);
          padding: 10px 12px;
        }

        .dashboard-count-preview-row + .dashboard-count-preview-row {
          margin-top: 8px;
        }

        .dashboard-stock-count-dialog {
          width: min(100% - 2rem, 34rem);
          max-width: min(100% - 2rem, 34rem) !important;
          border-radius: 14px;
        }

        /* Responsive dashboard rules collapse metric grids before columns become cramped. */
        @media (max-width: 1120px) {
          .dashboard-summary-grid,
          .dashboard-admin-summary-grid,
          .dashboard-inventory-summary-panel .dashboard-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dashboard-sales-filter-row {
            grid-template-columns: 1fr minmax(14rem, 0.42fr);
          }

          .dashboard-sales-filter-row.is-date-mode {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .dashboard-sales-filter-copy {
            grid-column: 1 / -1;
          }

          .dashboard-operations-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dashboard-main-grid {
            grid-template-columns: 1fr;
          }

          .dashboard-sales-encoder-work-grid,
          .dashboard-combined-work-grid {
            grid-template-columns: 1fr;
            grid-template-areas: none;
          }

          .dashboard-sales-encoder-actions-panel,
          .dashboard-sales-encoder-attention-panel,
          .dashboard-sales-encoder-work-grid .dashboard-operations-panel,
          .dashboard-combined-work-grid .dashboard-inventory-actions-panel,
          .dashboard-combined-work-grid .dashboard-sales-encoder-attention-panel,
          .dashboard-combined-work-grid .dashboard-operations-panel {
            grid-area: auto;
          }

          .dashboard-sales-encoder-work-grid .dashboard-operations-panel,
          .dashboard-combined-work-grid .dashboard-operations-panel {
            grid-column: auto;
          }

          .dashboard-sales-encoder-work-grid .dashboard-operations-grid,
          .dashboard-combined-work-grid .dashboard-operations-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dashboard-action-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dashboard-inventory-summary-panel .dashboard-summary-grid,
          .dashboard-inventory-actions-panel .dashboard-action-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 720px) {
          .dashboard-page {
            padding: 10px;
          }

          .dashboard-content {
            gap: 10px;
          }

          .dashboard-panel-header {
            padding: 12px;
          }

          .dashboard-privacy-toggle {
            width: 2.15rem;
            height: 2.15rem;
            min-height: 2.15rem;
          }

          .dashboard-sales-filter-panel {
            padding: 12px;
          }

          .dashboard-sales-filter-row {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .dashboard-sales-filter-row.is-date-mode {
            grid-template-columns: 1fr;
          }

          .dashboard-summary-grid,
          .dashboard-admin-summary-grid,
          .dashboard-operations-grid,
          .dashboard-inventory-summary-panel .dashboard-summary-grid,
          .dashboard-action-grid {
            padding: 10px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dashboard-attention-list {
            padding: 10px;
          }

          .dashboard-summary-card {
            grid-template-columns: minmax(0, 1fr) auto;
            min-height: 88px;
            padding: 10px;
          }

          .dashboard-summary-value {
            font-size: clamp(21px, 6vw, 28px);
          }

          .dashboard-summary-help-button {
            width: 17px;
            height: 17px;
          }

          .dashboard-summary-help-button svg {
            width: 11px;
            height: 11px;
          }

          .dashboard-summary-help-content {
            max-width: min(165px, calc(100vw - 24px));
            padding: 5px 7px;
            font-size: 10.5px;
            line-height: 1.25;
          }

          .dashboard-stock-search-results {
            max-height: min(16rem, 42vh);
          }

          .dashboard-stock-search-option {
            grid-template-columns: 1fr;
            gap: 6px;
          }

          .dashboard-stock-search-stock {
            justify-self: start;
          }

          .dashboard-action-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-auto-rows: minmax(108px, auto);
          }

        }

        @media (max-width: 430px) {
          .dashboard-summary-grid,
          .dashboard-admin-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dashboard-operations-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dashboard-action-grid {
            grid-template-columns: 1fr;
          }

          .dashboard-action-grid {
            grid-auto-rows: minmax(102px, auto);
          }
        }
      `}</style>

      <PageHeader
        title="Dashboard"
        subtitle="Branch operations overview for"
        icon={<Home className="h-8 w-8" />}
        userName={user.fullName}
        userBranch={activeBranch || user.branch}
        userRole={user.role}
        showUserContext
      />

      <div className={`dashboard-content ${isSalesEncoder ? 'dashboard-content-sales-encoder' : ''} ${isCombinedSalesInventory ? 'dashboard-content-combined' : ''}`}>
        {!isInventoryStaff && (
          <section className="dashboard-panel dashboard-sales-filter-panel" aria-label="Sales date filter">
            <div className={`dashboard-sales-filter-row ${salesPeriod === 'day' ? 'is-date-mode' : ''}`}>
              <div className="dashboard-sales-filter-copy">
                <h2 className="dashboard-sales-filter-title">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                  Sales Date Range
                </h2>
                <p className="dashboard-sales-filter-detail">
                  Showing {salesPeriodLabel.toLowerCase()} sales for {salesPeriodRangeLabel}.
                </p>
              </div>
              <div className="dashboard-sales-filter-field">
                <Label htmlFor="dashboard-sales-period" className="dashboard-sales-filter-label">Date Range</Label>
                <Select value={salesPeriod} onValueChange={setSalesPeriod}>
                  <SelectTrigger id="dashboard-sales-period" className="dashboard-sales-filter-control">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DASHBOARD_SALES_PERIOD_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {salesPeriod === 'day' && (
                <div className="dashboard-sales-filter-field">
                  <Label htmlFor="dashboard-sales-date" className="dashboard-sales-filter-label">Sales Date</Label>
                  <Input
                    id="dashboard-sales-date"
                    type="date"
                    value={selectedSalesDate}
                    max={todayKey}
                    onChange={event => {
                      const nextDate = event.target.value || todayKey;
                      setSelectedSalesDate(nextDate);
                      setSelectedComparisonDate(getOffsetDateKey(nextDate, -1));
                    }}
                    className="dashboard-sales-filter-date"
                  />
                </div>
              )}
              {salesPeriod === 'day' && (
                <div className="dashboard-sales-filter-field">
                  <Label htmlFor="dashboard-compare-date" className="dashboard-sales-filter-label">Compare With</Label>
                  <Input
                    id="dashboard-compare-date"
                    type="date"
                    value={selectedComparisonDate}
                    max={todayKey}
                    onChange={event => setSelectedComparisonDate(event.target.value || getOffsetDateKey(selectedSalesDate || todayKey, -1))}
                    className="dashboard-sales-filter-date"
                  />
                </div>
              )}
            </div>
          </section>
        )}

        <section className={`dashboard-panel ${isInventoryStaff ? 'dashboard-inventory-summary-panel' : ''} ${isAdmin ? 'dashboard-admin-summary-panel' : ''}`} aria-label="Quick summary numbers">
          <div className="dashboard-panel-header">
            <div className="min-w-0">
              <h2 className="dashboard-panel-title">Quick Summary</h2>
              <p className="dashboard-panel-subtitle">
                {isInventoryStaff ? 'Key stock condition indicators for the branch.' : 'Key sales and stock indicators for the branch.'}
              </p>
            </div>
            {hasSensitiveSummaryCards && (
              <div className="dashboard-privacy-actions">
                <Button
                  type="button"
                  variant="ghost"
                  className={`dashboard-privacy-toggle ${showFinancialValues ? '' : 'dashboard-privacy-toggle-hidden'}`}
                  onClick={() => setShowFinancialValues(prev => !prev)}
                  aria-pressed={showFinancialValues}
                  aria-label={showFinancialValues ? 'Hide sensitive metrics' : 'Show sensitive metrics'}
                >
                  {showFinancialValues ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </Button>
              </div>
            )}
          </div>
          <div className={`dashboard-summary-grid ${isAdmin ? 'dashboard-admin-summary-grid' : ''}`}>
            {displayPrimaryCards.map(card => (
              <SummaryCard key={card.label} {...card} />
            ))}
          </div>
        </section>

        {isSalesEncoder || isCombinedSalesInventory ? (
          <div className={isCombinedSalesInventory ? 'dashboard-combined-work-grid' : 'dashboard-sales-encoder-work-grid'}>
            {quickActionsSection}
            {attentionSection}
            {operationsSection}
          </div>
        ) : (
          <>
            <div className="dashboard-main-grid">
              {quickActionsSection}
              {attentionSection}
            </div>
            {operationsSection}
          </>
        )}
          </div>

      <Dialog open={isQuotaDialogOpen} onOpenChange={open => {
        setIsQuotaDialogOpen(open);
        if (!open) {
          setQuotaForm('');
          setIsSavingQuota(false);
        }
      }}>
        <DialogContent className="dashboard-quota-dialog border border-slate-200 bg-white shadow-2xl">
          <DialogHeader className="dashboard-quota-header text-left">
            <span className="dashboard-quota-icon" aria-hidden="true">
              <Target className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="dashboard-quota-title">
                Daily Sales Target
              </DialogTitle>
              <DialogDescription className="dashboard-quota-description">
                Set the branch sales target used for today&apos;s quota progress.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="dashboard-quota-body">
            <div className="dashboard-quota-field">
              <Label htmlFor="dashboard-daily-quota" className="text-sm font-bold text-slate-900">
                Daily Sales Target
              </Label>
              <Input
                id="dashboard-daily-quota"
                className="dashboard-quota-input"
                inputMode="decimal"
                value={quotaForm}
                onChange={event => setQuotaForm(sanitizeMoneyInput(event.target.value, 'Daily quota', 'dashboard-daily-quota-numbers-only'))}
                placeholder="0.00"
              />
            </div>

            <div className="dashboard-quota-summary">
              <div className="dashboard-quota-summary-item">
                <span className="dashboard-quota-summary-label">Today&apos;s Sales</span>
                <span className="dashboard-quota-summary-value">{formatCurrency(salesTodayAmount)}</span>
              </div>
              {hasDailySalesTarget && (
                <div className="dashboard-quota-summary-item">
                  <span className="dashboard-quota-summary-label">Current Target</span>
                  <span className="dashboard-quota-summary-value">{formatCurrency(dailySalesTarget)}</span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="dashboard-quota-footer">
            <Button type="button" variant="outline" className="dashboard-quota-button dashboard-quota-secondary-button" onClick={() => setIsQuotaDialogOpen(false)} disabled={isSavingQuota}>
              Cancel
            </Button>
            <Button type="button" className="dashboard-quota-button dashboard-quota-primary-button" onClick={saveDailyQuota} disabled={isSavingQuota}>
              {isSavingQuota ? 'Saving...' : 'Save Target'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStockCountDialogOpen} onOpenChange={open => {
        setIsStockCountDialogOpen(open);
        if (!open) resetStockCountForm();
      }}>
        <DialogContent className="dashboard-stock-count-dialog border border-slate-200 bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ClipboardCheck className="h-5 w-5 text-blue-600" />
              Verify Physical Stock
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-700">
              Compare the actual counted quantity with the system quantity, then continue to the proper stock adjustment if needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stock-count-item">Item Counted <RequiredMark /></Label>
                <div className="dashboard-stock-search">
                  <Input
                    id="stock-count-item"
                    type="text"
                    value={stockCountSearch}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={isStockCountSelectorOpen}
                    aria-controls="stock-count-item-results"
                    aria-activedescendant={isStockCountSelectorOpen && filteredStockCountItems[stockCountActiveIndex] ? `stock-count-item-option-${filteredStockCountItems[stockCountActiveIndex].id}` : undefined}
                    aria-autocomplete="list"
                    placeholder="Search item name, code, category, or supplier"
                    className="dashboard-stock-search-input"
                    onFocus={() => setIsStockCountSelectorOpen(true)}
                    onBlur={() => window.setTimeout(() => setIsStockCountSelectorOpen(false), 120)}
                    onChange={event => handleStockCountSearchChange(event.target.value)}
                    onKeyDown={handleStockCountSearchKeyDown}
                  />
                  {stockCountSearch && (
                    <button
                      type="button"
                      className="search-clear-button search-clear-button--absolute"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => handleStockCountSearchChange('')}
                      aria-label="Clear stock count item search"
                    >
                      <X />
                    </button>
                  )}
                  {isStockCountSelectorOpen && (
                    <div id="stock-count-item-results" className="dashboard-stock-search-results" role="listbox" aria-label="Matching inventory items">
                      {filteredStockCountItems.length > 0 ? (
                        filteredStockCountItems.map((item, index) => {
                          const isActive = index === stockCountActiveIndex;
                          const quantity = Number(item.quantity || 0);
                          return (
                            <button
                              id={`stock-count-item-option-${item.id}`}
                              key={item.id}
                              type="button"
                              role="option"
                              aria-selected={String(stockCountForm.itemId) === String(item.id)}
                              className={`dashboard-stock-search-option${isActive ? ' is-active' : ''}`}
                              onMouseEnter={() => setStockCountActiveIndex(index)}
                              onMouseDown={event => event.preventDefault()}
                              onClick={() => selectStockCountItem(item)}
                            >
                              <span className="dashboard-stock-search-main">
                                <span className="dashboard-stock-search-name">{item.name}</span>
                                <span className="dashboard-stock-search-meta">
                                  {item.itemCode || `Item ${item.id}`} / {item.category || 'Uncategorized'} / {item.supplierName || 'No supplier'}
                                </span>
                              </span>
                              <span className="dashboard-stock-search-stock">
                                {quantity} {formatUnitLabel(quantity)}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="dashboard-stock-search-empty" role="status">
                          No matching products found.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="physical-count">Actual Counted Quantity <RequiredMark /></Label>
                <Input
                  id="physical-count"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={stockCountForm.physicalCount}
                  onChange={event => setStockCountForm(prev => ({
                    ...prev,
                    physicalCount: sanitizeWholeNumberInput(event.target.value, 'Actual counted quantity', 'dashboard-physical-count-numbers-only')
                  }))}
                  placeholder="Type actual units counted"
                />
              </div>
            </div>

            <div className="dashboard-count-preview">
              <div className="dashboard-count-preview-row">
                <span className="text-sm font-medium text-slate-950">Quantity in System</span>
                <span className="text-sm font-semibold text-slate-900">
                  {selectedCountItem ? `${selectedCountItem.quantity} ${formatUnitLabel(selectedCountItem.quantity)}` : 'No item selected'}
                </span>
              </div>
              <div className="dashboard-count-preview-row">
                <span className="text-sm font-medium text-slate-950">Actual Counted Quantity</span>
                <span className="text-sm font-semibold text-slate-900">
                  {hasValidPhysicalCount ? `${physicalCountValue} ${formatUnitLabel(physicalCountValue)}` : hasPhysicalCountEntry ? 'Whole number required' : 'Not entered'}
                </span>
              </div>
              <div className="dashboard-count-preview-row">
                <span className="text-sm font-medium text-slate-950">Stock Difference</span>
                <span className={`text-sm font-semibold ${stockCountVariance > 0 ? 'text-green-700' : stockCountVariance < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                  {stockCountVariance === null
                    ? 'Complete item and count'
                    : stockCountVariance > 0
                      ? `${stockCountVariance} ${formatUnitLabel(stockCountVariance)} extra`
                      : stockCountVariance < 0
                        ? `${Math.abs(stockCountVariance)} ${formatUnitLabel(Math.abs(stockCountVariance))} short`
                        : 'No difference'}
                </span>
              </div>
            </div>

            {hasPhysicalCountEntry && !hasValidPhysicalCount && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                Physical count must be a whole number of zero or higher.
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsStockCountDialogOpen(false)}>
                Cancel
              </Button>
              {stockCountVariance > 0 && (
                <Button type="button" className="bg-green-600 text-white hover:bg-green-700" onClick={() => openStockCountAdjustment('stock-in')}>
                  Proceed to Stock In
                </Button>
              )}
              {stockCountVariance < 0 && (
                <Button type="button" className="bg-red-600 text-white hover:bg-red-700" onClick={() => openStockCountAdjustment('stock-out')}>
                  Proceed to Stock Out
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helpText,
  detail,
  icon: Icon,
  tone,
  progress,
  comparison,
  action
}) {
  const progressValue = Number(progress);
  const hasProgress = Number.isFinite(progressValue);
  const comparisonDirection = comparison?.direction || 'neutral';
  const handleCardKeyDown = event => {
    if (!action) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
  const content = (
    <>
      <span className="dashboard-summary-body">
        <span className="dashboard-summary-label block">{label}</span>
        <span className="dashboard-summary-value-row">
          <span className="dashboard-summary-value block">{value}</span>
          {helpText && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="dashboard-summary-help-button"
                  aria-label={`${label}: ${helpText}`}
                  onClick={event => event.stopPropagation()}
                  onKeyDown={event => event.stopPropagation()}
                >
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                sideOffset={8}
                hideArrow
                className="dashboard-summary-help-content"
              >
                {helpText}
              </TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="dashboard-summary-detail block">{detail}</span>
      </span>
      <span className="dashboard-summary-icon">
        <Icon className="h-5 w-5" />
      </span>
      {comparison?.label && (
        <span className={`dashboard-summary-comparison comparison-${comparisonDirection}`}>
          {comparison.label}
        </span>
      )}
      {hasProgress && (
        <span className="dashboard-summary-progress" aria-hidden="true">
          <span className="dashboard-summary-progress-fill" style={{ width: `${Math.max(0, Math.min(100, progressValue))}%` }} />
        </span>
      )}
    </>
  );

  if (action) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={`dashboard-summary-card summary-${tone}`}
        onClick={action}
        onKeyDown={handleCardKeyDown}
      >
        {content}
      </div>
    );
  }

  return <div className={`dashboard-summary-card summary-${tone}`}>{content}</div>;
}

function ActionButton({
  label,
  detail,
  icon: Icon,
  tone = 'slate',
  action
}) {
  return (
    <button type="button" className={`dashboard-action-button action-${tone}`} onClick={action}>
      <span className="dashboard-action-left">
        <span className="dashboard-action-icon">
          <Icon className="h-5 w-5" />
        </span>
        <span className="dashboard-action-copy">
          <span className="dashboard-action-title block">{label}</span>
          <span className="dashboard-action-detail block">{detail}</span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}
