import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  FileText,
  Home,
  Package,
  PackagePlus,
  ReceiptText,
  Search,
  Truck,
  Users
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { useData } from './DataContext';
import { PageHeader } from './PageHeader';
import { canAccessScreen, canPerformInventoryMovement, canRecordSales, isAdminRole, normalizeRole, ROLE_VALUES } from '../utils/roles';

const formatCurrency = value =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(Number(value || 0));

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

const isToday = value => {
  if (!value) return false;
  return new Date(value).toDateString() === new Date().toDateString();
};

const isThisMonth = value => {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
};

const isNonInventorySaleItem = item =>
  item?.isInventoryItem === false || item?.itemType === 'non_inventory' || item?.item_type === 'non_inventory';

const manualItemKey = item => {
  const name = String(item?.itemName || item?.manualDescription || item?.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const category = String(item?.category || 'Other').trim().replace(/\s+/g, ' ').toLowerCase();
  return name ? `${name}|${category}` : '';
};

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

  const {
    inventory,
    unreadAlertCount,
    stockMovements,
    salesTransactions,
    purchaseTransactions,
    users
  } = useData();

  const role = normalizeRole(user?.role);
  const isAdmin = isAdminRole(role);
  const isCashier = role === ROLE_VALUES.CASHIER;
  const isInventoryStaff = role === ROLE_VALUES.INVENTORY_STAFF;
  const canUseSales = canRecordSales(role);
  const canUseInventoryMovement = canPerformInventoryMovement(role);
  const canUseReports = canAccessScreen(role, 'reports');
  const canUsePurchases = canAccessScreen(role, 'purchases');

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
  const salesToday = (salesTransactions || []).filter(sale => sale.status !== 'cancelled' && isToday(sale.createdAt));
  const purchasesToday = (purchaseTransactions || []).filter(purchase => purchase.status !== 'cancelled' && isToday(purchase.createdAt));
  const stockMovementsToday = (stockMovements || []).filter(movement => isToday(movement.createdAt));
  const completedSales = (salesTransactions || []).filter(sale => sale.status !== 'cancelled');
  const completedSalesThisMonth = completedSales.filter(sale => isThisMonth(sale.createdAt));
  const topSellingToday = getTopSellingItem(salesToday);
  const topSellingThisMonth = getTopSellingItem(completedSalesThisMonth);
  const overallSalesAmount = completedSales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const salesTodayAmount = salesToday.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const salesTodayQuantity = salesToday.reduce((sum, sale) => (
    sum + (sale.items || []).reduce((itemSum, item) => itemSum + Number(item.quantitySold || item.quantity || 0), 0)
  ), 0);
  const purchasesTodayAmount = purchasesToday.reduce((sum, purchase) => sum + Number(purchase.subtotalAmount || 0), 0);
  const stockInTodayCount = stockMovementsToday.filter(movement => String(movement.action || '').toLowerCase() === 'stock in').length;
  const stockOutTodayCount = stockMovementsToday.filter(movement => String(movement.action || '').toLowerCase() === 'stock out').length;
  const unitsMovedToday = stockMovementsToday.reduce((sum, movement) => sum + Number(movement.quantityChanged || 0), 0);
  const pendingUserCount = isAdmin ? (users || []).filter(account => account.status === 'Pending').length : 0;
  const manualReviewCount = new Set(
    (salesTransactions || [])
      .filter(sale => sale.status !== 'cancelled')
      .flatMap(sale => sale.items || [])
      .filter(isNonInventorySaleItem)
      .map(manualItemKey)
      .filter(Boolean)
  ).size;
  const selectedCountItem = inventory.find(item => String(item.id) === String(stockCountForm.itemId));
  const physicalCountValue = stockCountForm.physicalCount === '' ? null : Number(stockCountForm.physicalCount);
  const hasPhysicalCountEntry = stockCountForm.physicalCount !== '';
  const hasValidPhysicalCount = Number.isInteger(physicalCountValue) && physicalCountValue >= 0;
  const stockCountVariance = selectedCountItem && hasValidPhysicalCount
    ? physicalCountValue - Number(selectedCountItem.quantity || 0)
    : null;

  const formatUnitLabel = value => Number(value) === 1 ? 'unit' : 'units';

  const resetStockCountForm = () => {
    setStockCountForm({
      itemId: '',
      physicalCount: ''
    });
  };

  const openInventoryStatus = status => {
    localStorage.removeItem('dashboardSearchStatusFilter');
    localStorage.setItem('dashboardInventoryStatusFilter', status || 'all');
    window.dispatchEvent(new CustomEvent('dashboard-inventory-status-filter', {
      detail: { status: status || 'all' }
    }));
    onNavigate('inventory', { preserveInventoryNavigationState: true });
  };

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

  const getTodayDateKey = () => new Date().toISOString().slice(0, 10);

  const openTargetReport = (reportType, options = {}) => {
    if (!canUseReports) return;
    const { period, date = getTodayDateKey(), category = 'all' } = options;
    localStorage.setItem('reports_target_type', reportType);
    localStorage.setItem('reports_target_category', category);
    if (period) {
      localStorage.setItem('reports_target_period', period);
      localStorage.setItem('reports_target_date', date);
    } else {
      localStorage.removeItem('reports_target_period');
      localStorage.removeItem('reports_target_date');
    }
    window.dispatchEvent(new CustomEvent('reports-target-view', {
      detail: { reportType, category, period, date }
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

  const openAlertsTab = tab => {
    localStorage.setItem('alerts_target_tab', tab);
    localStorage.setItem('alerts_scroll_to_top', 'true');
    window.dispatchEvent(new CustomEvent('alerts-target-tab', {
      detail: { tab }
    }));
    onNavigate('alerts');
  };

  const openUserManagementTab = tab => {
    if (!isAdmin) return;
    localStorage.setItem('user_management_target_tab', tab);
    window.dispatchEvent(new CustomEvent('user-management-target-tab', {
      detail: { tab }
    }));
    onNavigate('user-management');
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
      detail: `${completedSales.length} completed transaction${completedSales.length === 1 ? '' : 's'}`,
      icon: ReceiptText,
      tone: 'blue',
      action: canUseSales ? () => openSalesHistory('all') : undefined
    },
    isAdmin && {
      label: 'Top Item This Month',
      value: topSellingThisMonth ? topSellingThisMonth.quantity : 0,
      detail: topSellingThisMonth
        ? `${topSellingThisMonth.itemName}${topSellingThisMonth.isManual ? ' (Non-inventory)' : ''}`
        : 'No sales recorded yet',
      icon: Package,
      tone: 'green',
      action: canUseReports ? () => openTargetReport('sales-movements', { period: 'monthly' }) : undefined
    },
    ...stockStatusCards
  ].filter(Boolean);

  const operationsCards = isInventoryStaff ? [
    {
      label: 'Purchases Today',
      value: purchasesToday.length,
      detail: `${purchasesToday.length} purchase entr${purchasesToday.length === 1 ? 'y' : 'ies'}`,
      icon: Truck,
      tone: 'green',
      action: canUseReports ? () => openTargetReport('purchases', { period: 'daily' }) : canUsePurchases ? () => onNavigate('purchases') : undefined
    },
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
      label: "Today's Sales",
      value: formatCurrency(salesTodayAmount),
      detail: `${salesToday.length} transaction${salesToday.length === 1 ? '' : 's'} today`,
      icon: ReceiptText,
      tone: 'blue',
      action: canUseReports
        ? () => openTargetReport('sales-movements', { period: 'daily' })
        : canUseSales
          ? () => openSalesHistory('today')
          : undefined
    },
    isCashier && {
      label: 'Top Item Today',
      value: topSellingToday ? topSellingToday.quantity : 0,
      detail: topSellingToday
        ? `${topSellingToday.itemName}${topSellingToday.isManual ? ' (Non-inventory)' : ''}`
        : 'No sales recorded yet',
      icon: Package,
      tone: 'green',
      action: canUseSales ? () => openSalesHistory('today') : undefined
    },
    canUsePurchases && {
      label: 'Purchases Today',
      value: formatCurrency(purchasesTodayAmount),
      detail: `${purchasesToday.length} purchase entr${purchasesToday.length === 1 ? 'y' : 'ies'}`,
      icon: Truck,
      tone: 'green',
      action: canUseReports ? () => openTargetReport('purchases', { period: 'daily' }) : () => onNavigate('purchases')
    },
    (isAdmin || isInventoryStaff) && {
      label: 'Stock Movements',
      value: stockMovementsToday.length,
      detail: 'Stock in/out records today',
      icon: Activity,
      tone: 'blue',
      action: canUseReports ? () => openTargetReport('movements', { period: 'daily' }) : undefined
    },
    (isAdmin || isInventoryStaff) && {
      label: 'Items Sold Today',
      value: salesTodayQuantity,
      detail: `${formatUnitLabel(salesTodayQuantity)} from completed sales`,
      icon: Package,
      tone: 'purple',
      action: canUseReports ? () => openTargetReport('sales-movements', { period: 'daily' }) : undefined
    }
  ].filter(Boolean);

  const quickActions = [
    canUseSales && {
      label: 'Record Sale',
      detail: 'Sales/Data Entry',
      icon: ReceiptText,
      tone: 'blue',
      action: () => onNavigate('sales')
    },
    canUsePurchases && {
      label: 'Purchase Entry',
      detail: 'Supplier delivery',
      icon: Truck,
      tone: 'green',
      action: () => onNavigate('purchases')
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
    canUseReports && {
      label: isInventoryStaff ? 'Reorder Report' : 'Reports',
      detail: isInventoryStaff ? 'Supplier needs' : 'Business records',
      icon: FileText,
      tone: 'emerald',
      action: () => openTargetReport(isInventoryStaff ? 'supplier-reorder' : 'summary')
    },
    canAccessScreen(role, 'inventory') && {
      label: 'Inventory',
      detail: 'Stock list',
      icon: Search,
      tone: 'blue',
      action: () => onNavigate('inventory')
    }
  ].filter(Boolean);

  const attentionItems = [
    isInventoryStaff && missingItemDetailKeys.size > 0 && {
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
    isAdmin && pendingUserCount > 0 && {
      label: 'Pending user requests',
      detail: 'Review employee access',
      value: pendingUserCount,
      icon: Users,
      tone: 'red',
      action: () => openUserManagementTab('pending')
    },
    (isAdmin || isInventoryStaff) && manualReviewCount > 0 && {
      label: 'Manual items for review',
      detail: 'Non-inventory sales',
      value: manualReviewCount,
      icon: ClipboardCheck,
      tone: 'amber',
      action: () => openTargetReport('untracked-sales')
    }
  ].filter(Boolean);

  const quickActionsSection = (
    <section className={`dashboard-panel ${isInventoryStaff ? 'dashboard-inventory-actions-panel' : ''} ${isCashier ? 'dashboard-cashier-actions-panel' : ''}`} aria-label="Quick actions">
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
    <section className={`dashboard-panel ${isCashier ? 'dashboard-cashier-attention-panel' : ''}`} aria-label="Needs attention">
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
    <section className="dashboard-panel dashboard-operations-panel" aria-label="Today's operations">
      <div className="dashboard-panel-header">
        <div className="min-w-0">
          <h2 className="dashboard-panel-title">Today&apos;s Operations</h2>
          <p className="dashboard-panel-subtitle">Same-day activity recorded in the system.</p>
        </div>
      </div>
      <div className="dashboard-summary-grid dashboard-operations-grid" style={{ '--dashboard-operation-count': operationsCards.length }}>
        {operationsCards.map(card => (
          <SummaryCard key={card.label} {...card} />
        ))}
      </div>
    </section>
  );

  return (
    <div className="dashboard-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
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

        .dashboard-panel-title {
          margin: 0;
          color: #111827;
          font-size: 17px;
          font-weight: 800;
          line-height: 1.2;
        }

        .dashboard-panel-subtitle {
          margin-top: 3px;
          color: #64748b;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.35;
        }

        .dashboard-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          padding: 12px;
        }

        .dashboard-admin-summary-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .dashboard-operations-grid {
          grid-template-columns: repeat(var(--dashboard-operation-count, 3), minmax(0, 1fr));
        }

        .dashboard-summary-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 46px;
          gap: 14px;
          align-items: center;
          min-height: 96px;
          border: 1px solid #dbe3ef;
          border-left-width: 5px;
          border-radius: 10px;
          background: #ffffff;
          padding: 12px 14px;
          text-align: left;
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .dashboard-summary-card:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.07);
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
          color: #475569;
          font-size: 13px;
          font-weight: 700;
        }

        .dashboard-summary-value {
          margin-top: 6px;
          color: #0f172a;
          font-size: clamp(25px, 2.6vw, 34px);
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0;
          overflow-wrap: anywhere;
        }

        .dashboard-summary-detail {
          margin-top: 6px;
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.3;
          display: -webkit-box;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow-wrap: anywhere;
        }

        .dashboard-summary-icon {
          display: inline-flex;
          width: 46px;
          height: 46px;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #f8fafc;
          color: #475569;
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

        .dashboard-cashier-work-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          grid-template-areas:
            "actions operations"
            "attention operations";
          gap: 14px;
          align-items: stretch;
        }

        .dashboard-cashier-actions-panel {
          grid-area: actions;
        }

        .dashboard-cashier-attention-panel {
          grid-area: attention;
        }

        .dashboard-cashier-work-grid .dashboard-action-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .dashboard-cashier-work-grid .dashboard-operations-grid {
          grid-template-columns: 1fr;
        }

        .dashboard-cashier-work-grid .dashboard-operations-panel {
          grid-area: operations;
        }

        .dashboard-cashier-work-grid .dashboard-panel {
          height: 100%;
        }

        .dashboard-action-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          padding: 12px;
          align-items: stretch;
          grid-auto-rows: 92px;
        }

        .dashboard-inventory-summary-panel .dashboard-summary-grid,
        .dashboard-inventory-actions-panel .dashboard-action-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .dashboard-inventory-summary-panel .dashboard-summary-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .dashboard-action-button,
        .dashboard-attention-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid #dbe3ef;
          border-radius: 10px;
          background: #ffffff;
          width: 100%;
          min-height: 92px;
          padding: 11px;
          text-align: left;
          transition: background-color 160ms ease, border-color 160ms ease;
        }

        .dashboard-action-button {
          height: 100%;
        }

        .dashboard-action-button:hover,
        .dashboard-attention-button:hover {
          border-color: #fca5a5;
          background: #fff7f7;
        }

        .dashboard-action-left {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
        }

        .dashboard-action-icon {
          display: inline-flex;
          width: 36px;
          height: 36px;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 10px;
          background: #f1f5f9;
          color: #334155;
        }

        .dashboard-action-title,
        .dashboard-attention-title {
          color: #111827;
          font-size: 14px;
          font-weight: 800;
          line-height: 1.2;
        }

        .dashboard-action-detail {
          margin-top: 3px;
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.25;
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
          color: #64748b;
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
          color: #64748b;
          font-size: 14px;
          font-weight: 600;
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

        @media (max-width: 1120px) {
          .dashboard-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dashboard-operations-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dashboard-main-grid {
            grid-template-columns: 1fr;
          }

          .dashboard-cashier-work-grid {
            grid-template-columns: 1fr;
            grid-template-areas: none;
          }

          .dashboard-cashier-actions-panel,
          .dashboard-cashier-attention-panel,
          .dashboard-cashier-work-grid .dashboard-operations-panel {
            grid-area: auto;
          }

          .dashboard-cashier-work-grid .dashboard-operations-panel {
            grid-column: auto;
          }

          .dashboard-cashier-work-grid .dashboard-operations-grid {
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

          .dashboard-summary-grid,
          .dashboard-action-grid,
          .dashboard-attention-list {
            padding: 10px;
          }

          .dashboard-summary-card {
            grid-template-columns: minmax(0, 1fr) 38px;
            min-height: 88px;
            padding: 10px;
          }

          .dashboard-summary-value {
            font-size: clamp(21px, 6vw, 28px);
          }

          .dashboard-action-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-auto-rows: 86px;
          }

          .dashboard-operations-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 430px) {
          .dashboard-summary-grid,
          .dashboard-action-grid,
          .dashboard-operations-grid {
            grid-template-columns: 1fr;
          }

          .dashboard-action-grid {
            grid-auto-rows: 78px;
          }
        }
      `}</style>

      <PageHeader
        title="Dashboard"
        subtitle="Simple daily overview for"
        icon={<Home className="h-8 w-8" />}
        userName={user.fullName}
        userBranch={activeBranch || user.branch}
        userRole={user.role}
        showUserContext
      />

      <div className={`dashboard-content ${isCashier ? 'dashboard-content-cashier' : ''}`}>
        <section className={`dashboard-panel ${isInventoryStaff ? 'dashboard-inventory-summary-panel' : ''} ${isAdmin ? 'dashboard-admin-summary-panel' : ''}`} aria-label="Quick summary numbers">
          <div className="dashboard-panel-header">
            <div className="min-w-0">
              <h2 className="dashboard-panel-title">Quick Summary</h2>
              <p className="dashboard-panel-subtitle">
                {isInventoryStaff ? 'Key stock condition indicators for the branch.' : 'Key sales and stock indicators for the branch.'}
              </p>
            </div>
          </div>
          <div className={`dashboard-summary-grid ${isAdmin ? 'dashboard-admin-summary-grid' : ''}`}>
            {primaryCards.map(card => (
              <SummaryCard key={card.label} {...card} />
            ))}
          </div>
        </section>

        {isCashier ? (
          <div className="dashboard-cashier-work-grid">
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
                <Label htmlFor="stock-count-item">Item Counted</Label>
                <Select value={stockCountForm.itemId} onValueChange={value => setStockCountForm(prev => ({ ...prev, itemId: value }))}>
                  <SelectTrigger id="stock-count-item">
                    <SelectValue placeholder="Choose the item you counted" />
                  </SelectTrigger>
                  <SelectContent>
                    {inventory.map(item => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="physical-count">Actual Counted Quantity</Label>
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
                <span className="text-sm font-medium text-slate-600">Quantity in System</span>
                <span className="text-sm font-semibold text-slate-900">
                  {selectedCountItem ? `${selectedCountItem.quantity} ${formatUnitLabel(selectedCountItem.quantity)}` : 'No item selected'}
                </span>
              </div>
              <div className="dashboard-count-preview-row">
                <span className="text-sm font-medium text-slate-600">Actual Counted Quantity</span>
                <span className="text-sm font-semibold text-slate-900">
                  {hasValidPhysicalCount ? `${physicalCountValue} ${formatUnitLabel(physicalCountValue)}` : hasPhysicalCountEntry ? 'Whole number required' : 'Not entered'}
                </span>
              </div>
              <div className="dashboard-count-preview-row">
                <span className="text-sm font-medium text-slate-600">Stock Difference</span>
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
  detail,
  icon: Icon,
  tone,
  action
}) {
  const content = (
    <>
      <span className="min-w-0">
        <span className="dashboard-summary-label block">{label}</span>
        <span className="dashboard-summary-value block">{value}</span>
        <span className="dashboard-summary-detail block">{detail}</span>
      </span>
      <span className="dashboard-summary-icon">
        <Icon className="h-5 w-5" />
      </span>
    </>
  );

  if (action) {
    return (
      <button type="button" className={`dashboard-summary-card summary-${tone}`} onClick={action}>
        {content}
      </button>
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
        <span className="min-w-0">
          <span className="dashboard-action-title block">{label}</span>
          <span className="dashboard-action-detail block">{detail}</span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}
