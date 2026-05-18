import React from 'react';
import { Home, Package, PackagePlus, TrendingUp, AlertTriangle, CheckCircle, ArrowUpRight, ArrowRight, Activity, Zap, ReceiptText, Users, ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useData } from './DataContext';
import { PageHeader } from './PageHeader';
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
  // Pull inventory sources from context so cards and lists stay live.
  const {
    inventory,
    unreadAlertCount,
    stockMovements,
    salesTransactions,
    users
  } = useData();

  // Calculate headline inventory stats for the metric cards.
  const totalItems = inventory.length;
  const lowStockItems = inventory.filter(item => item.status === 'Low Stock').length;
  const activeProducts = inventory.filter(item => item.status === 'In Stock').length;
  const outOfStock = inventory.filter(item => item.status === 'Out of Stock').length;
  const stockAlertPriority = {
    'Out of Stock': 1,
    'Low Stock': 2
  };

  // Basic activity signal: total units across inventory.
  const monthlyActivity = inventory.reduce((sum, item) => sum + item.quantity, 0);

  // Surface the most urgent stock signals first.
  const stockAlerts = inventory.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock').sort((a, b) => {
    const priorityDifference = (stockAlertPriority[a.status] ?? 999) - (stockAlertPriority[b.status] ?? 999);
    if (priorityDifference !== 0) return priorityDifference;
    return new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime();
  }).slice(0, 3);
  const recentStockMovements = (stockMovements || [])
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 3);
  const stockMovementsToday = (stockMovements || []).filter(movement => {
    if (!movement.createdAt) return false;
    const movementDate = new Date(movement.createdAt);
    const today = new Date();
    return movementDate.toDateString() === today.toDateString();
  }).length;
  const salesToday = (salesTransactions || []).filter(sale => {
    if (!sale.createdAt) return false;
    return new Date(sale.createdAt).toDateString() === new Date().toDateString();
  }).length;
  const reorderAttentionCount = lowStockItems + outOfStock;
  const selectedCountItem = inventory.find(item => item.id === stockCountForm.itemId);
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
  const openStockCountAdjustment = action => {
    const selectedItemId = selectedCountItem?.id;
    setIsStockCountDialogOpen(false);
    resetStockCountForm();
    openInventoryAction(action, selectedItemId);
  };
  const pendingUserCount = user?.role === 'Admin'
    ? (users || []).filter(account => account.status === 'Pending').length
    : 0;
  const adminAttentionItems = user?.role === 'Admin'
    ? [
        {
          label: 'Pending user requests',
          value: pendingUserCount,
          action: () => openUserManagementTab('pending'),
          tone: pendingUserCount > 0 ? 'orange' : 'slate'
        },
        {
          label: 'Reorder attention',
          value: reorderAttentionCount,
          action: () => openTargetReport('supplier-reorder'),
          tone: reorderAttentionCount > 0 ? 'red' : 'slate'
        },
        {
          label: 'Unread alerts',
          value: unreadAlertCount,
          action: () => openAlertsTab('unread'),
          tone: unreadAlertCount > 0 ? 'red' : 'slate'
        }
      ]
    : [];
  const getMovementLabel = movement => {
    if (movement?.action === 'stock_in') return 'Stock In';
    if (movement?.action === 'stock_out') return 'Stock Out';
    return 'Movement';
  };
  const getMovementReason = movement => {
    const reasonLabels = {
      sales: 'Sales',
      damaged: 'Damaged',
      expired: 'Expired',
      lost_missing: 'Lost/Missing',
      manual_adjustment: 'Manual Adjustment',
      branch_transfer: 'Branch Transfer',
      correction: 'Correction',
      delivery_received: 'Delivery',
      returned_item: 'Returned Item',
      beginning_balance: 'Beginning Balance'
    };
    return reasonLabels[movement?.reason] || 'Recorded';
  };
  const getMovementQuantityText = movement => {
    const value = Number(movement?.quantityChanged || 0);
    if (movement?.action === 'stock_in') return `+${Math.abs(value)}`;
    if (movement?.action === 'stock_out') return `-${Math.abs(value)}`;
    return String(value);
  };
  const getAttentionToneClass = tone => {
    if (tone === 'red') return 'border-red-200 bg-red-50 text-red-700 hover:border-red-500 hover:bg-red-200 active:bg-red-100';
    if (tone === 'orange') return 'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-500 hover:bg-orange-200 active:bg-orange-100';
    return 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-500 hover:bg-slate-200 active:bg-slate-100';
  };
  const openInventoryStatus = status => {
    if (!status || status === 'all') {
      onNavigate('inventory');
      return;
    }
    localStorage.setItem("dashboardSearchStatusFilter", status);
    window.dispatchEvent(new CustomEvent("dashboard-search-filter", {
      detail: { status }
    }));
    onNavigate('search');
  };
  const openInventoryAction = (action, itemId = "") => {
    localStorage.setItem("dashboardInventoryAction", action);
    if (itemId) {
      localStorage.setItem("dashboardInventoryItemId", String(itemId));
    } else {
      localStorage.removeItem("dashboardInventoryItemId");
    }
    window.dispatchEvent(new CustomEvent("dashboard-inventory-action", {
      detail: { action, itemId }
    }));
    onNavigate('inventory');
  };
  const openTargetReport = reportType => {
    localStorage.setItem('reports_target_type', reportType);
    localStorage.setItem('reports_target_category', 'all');
    window.dispatchEvent(new CustomEvent('reports-target-view', {
      detail: { reportType, category: 'all' }
    }));
    onNavigate('reports');
  };
  const openSales = () => {
    onNavigate('sales');
  };
  const openUserManagementTab = tab => {
    localStorage.setItem("user_management_target_tab", tab);
    window.dispatchEvent(new CustomEvent("user-management-target-tab", {
      detail: { tab }
    }));
    onNavigate('user-management');
  };
  const openAlertsTab = tab => {
    localStorage.setItem("alerts_target_tab", tab);
    localStorage.setItem("alerts_scroll_to_top", "true");
    window.dispatchEvent(new CustomEvent("alerts-target-tab", {
      detail: { tab }
    }));
    onNavigate('alerts');
  };
  const movementPanel = recentStockMovements.length > 0 ? (
    <Card className="dashboard-movement-card overflow-hidden border-2 border-orange-200 bg-white shadow-md">
      <CardHeader className="rounded-t-xl bg-orange-50 pb-3" data-card-header>
        <CardTitle className="text-lg flex items-center gap-2">
          <ReceiptText className="w-5 h-5 text-orange-600" />
          Recent Stock Movements
        </CardTitle>
        <CardDescription>Latest inventory changes</CardDescription>
      </CardHeader>
      <CardContent className="bg-white pt-2 pb-4" data-card-content>
        <div className="space-y-2">
          {recentStockMovements.map(movement => (
            <div key={movement.id} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{movement.itemName || "Inventory item"}</p>
                  <p className="text-xs text-slate-500">
                    {getMovementLabel(movement)} - {getMovementReason(movement)} - {movement.actorName || "System"} - {new Date(movement.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge className={movement.action === 'stock_in' ? "inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-full bg-green-100 px-2 text-center font-semibold leading-none text-green-700 hover:bg-green-100" : "inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 px-2 text-center font-semibold leading-none text-orange-700 hover:bg-orange-100"}>
                  {getMovementQuantityText(movement)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  ) : (
    <Card className="dashboard-movement-card overflow-hidden border-2 border-slate-200 bg-white shadow-md">
      <CardHeader className="rounded-t-xl bg-slate-50 pb-3" data-card-header>
        <CardTitle className="text-lg flex items-center gap-2">
          <ReceiptText className="w-5 h-5 text-slate-600" />
          Recent Stock Movements
        </CardTitle>
        <CardDescription>Latest inventory changes</CardDescription>
      </CardHeader>
      <CardContent className="bg-white pt-2 pb-4" data-card-content>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">No stock movements recorded yet.</p>
      </CardContent>
    </Card>
  );

  const stockAlertPanel = stockAlerts.length > 0 ? (
    <Card className="dashboard-alert-card overflow-hidden border-2 border-red-200 shadow-md">
      <CardHeader className="rounded-t-xl bg-red-50 pb-3" data-card-header>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-[#FF0000]" />
          Stock Alerts
        </CardTitle>
        <CardDescription>Urgent stock signals</CardDescription>
      </CardHeader>
      <CardContent className="pt-2 pb-4" data-card-content>
        <div className="space-y-3">
          {stockAlerts.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{item.name}</p>
                <p className={item.quantity === 0 ? "text-xs font-semibold text-red-700" : "text-xs font-semibold text-slate-700"}>
                  {item.quantity} {item.quantity === 1 ? "unit" : "units"} left - {item.category}
                </p>
              </div>
              <Badge className={item.status === 'Out of Stock' ? "inline-flex h-7 min-w-[104px] shrink-0 items-center justify-center self-center rounded-full px-3 py-0 text-center leading-[1] bg-red-600 text-white hover:bg-red-600" : "inline-flex h-7 min-w-[92px] shrink-0 items-center justify-center self-center rounded-full px-3 py-0 text-center leading-[1] bg-orange-100 text-orange-700 hover:bg-orange-100"}>
                {item.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  ) : (
    <Card className="dashboard-alert-card border-2 border-green-200 shadow-md">
      <CardHeader className="pb-3 bg-green-50" data-card-header>
        <CardTitle className="text-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          All Good!
        </CardTitle>
        <CardDescription>No critical alerts</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 pb-4" data-card-content>
        <p className="text-sm text-gray-600 text-center">No stock alerts. All inventory levels are adequate.</p>
      </CardContent>
    </Card>
  );

  const adminPanel = user.role === 'Admin' ? (
    <Card className="dashboard-admin-card overflow-hidden border-2 border-slate-200 bg-white shadow-md">
      <CardHeader className="rounded-t-xl bg-slate-50 pb-3" data-card-header>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-700" />
          Admin Attention
        </CardTitle>
        <CardDescription>System tasks that may need review</CardDescription>
      </CardHeader>
      <CardContent className="bg-white pt-2 pb-4" data-card-content>
        <div className="space-y-2">
          {adminAttentionItems.map(item => (
            <button
              key={item.label}
              type="button"
              className={`dashboard-admin-action dashboard-admin-action-${item.tone} group flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-red-200 ${getAttentionToneClass(item.tone)}`}
              onClick={item.action}
            >
              <span className="min-w-0 truncate text-sm font-semibold">{item.label}</span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge className="inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-full bg-white px-2 text-center font-semibold leading-none text-slate-800 hover:bg-white">
                  {item.value}
                </Badge>
                <ArrowRight className="h-4 w-4 text-slate-500 opacity-70 transition-opacity duration-200 group-hover:opacity-100" />
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="dashboard-page min-h-screen bg-gray-50 p-4 md:p-8">
      <style>{`
        .dashboard-stat-grid,
        .dashboard-module-grid,
        .dashboard-monitoring-grid {
          min-width: 0;
        }

        .dashboard-module-card {
          min-height: 168px;
        }

        .dashboard-stock-count-dialog {
          width: min(100% - 2rem, 34rem);
          max-width: min(100% - 2rem, 34rem) !important;
          border-radius: 1rem;
        }

        .dashboard-count-preview {
          border: 1px solid #dbeafe;
          border-radius: 0.95rem;
          background: #eff6ff;
          padding: 0.9rem;
        }

        .dashboard-count-preview-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          border-radius: 0.75rem;
          background: rgba(255, 255, 255, 0.74);
          padding: 0.65rem 0.75rem;
        }

        .dashboard-count-preview-row + .dashboard-count-preview-row {
          margin-top: 0.5rem;
        }

        .dashboard-admin-action {
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .dashboard-admin-action-red:hover {
          border-color: #f87171 !important;
          background-color: #fecaca !important;
          box-shadow: 0 8px 18px rgba(220, 38, 38, 0.18);
        }

        .dashboard-admin-action-orange:hover {
          border-color: #fb923c !important;
          background-color: #fed7aa !important;
          box-shadow: 0 8px 18px rgba(234, 88, 12, 0.16);
        }

        .dashboard-admin-action-slate:hover {
          border-color: #94a3b8 !important;
          background-color: #e2e8f0 !important;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
        }

        @media (min-width: 1280px) {
          .dashboard-module-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .dashboard-monitoring-grid {
            grid-template-columns: repeat(${user.role === 'Admin' ? 3 : 2}, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .dashboard-page {
            padding: 10px;
          }

          .dashboard-stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 18px;
          }

          .dashboard-stat-card {
            border-radius: 12px;
            min-width: 0;
          }

          .dashboard-stat-content,
          .dashboard-module-header {
            padding: 12px;
          }

          .dashboard-stat-top,
          .dashboard-module-top {
            align-items: center;
            margin-bottom: 10px;
          }

          .dashboard-stat-icon,
          .dashboard-module-icon {
            padding: 9px;
            border-radius: 10px;
          }

          .dashboard-stat-icon svg,
          .dashboard-module-icon svg {
            width: 18px;
            height: 18px;
          }

          .dashboard-stat-badge,
          .dashboard-module-badge {
            max-width: 86px;
            padding: 3px 7px;
            font-size: 11px;
            line-height: 1.15;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .dashboard-stat-value {
            font-size: 26px;
            line-height: 1;
          }

          .dashboard-stat-title,
          .dashboard-module-title {
            font-size: 13px;
            line-height: 1.25;
          }

          .dashboard-stat-change,
          .dashboard-module-description {
            font-size: 12px;
            line-height: 1.35;
          }

          .dashboard-section-title {
            margin: 4px 0 12px;
            padding: 10px 12px;
            border-left: 4px solid #ef0000;
            border-radius: 12px;
            background: #ffffff;
            box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
          }

          .dashboard-section-title h2 {
            font-size: 19px;
            line-height: 1.25;
            font-weight: 850;
          }

          .dashboard-section-title svg {
            box-sizing: content-box;
            width: 20px;
            height: 20px;
            padding: 6px;
            border-radius: 10px;
            background: #fff7ed;
          }

          .dashboard-module-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }

          .dashboard-module-card {
            min-height: 142px;
            border-radius: 12px;
          }

          .dashboard-movement-card [data-card-header],
          .dashboard-admin-card [data-card-header],
          .dashboard-alert-card [data-card-header] {
            padding: 14px 14px 8px;
          }

          .dashboard-movement-card [data-card-content],
          .dashboard-admin-card [data-card-content],
          .dashboard-alert-card [data-card-content] {
            padding: 8px 14px 14px;
          }
        }

        @media (max-width: 390px) {
          .dashboard-page {
            padding: 8px;
          }

          .dashboard-stat-grid,
          .dashboard-module-grid,
          .dashboard-monitoring-grid {
            gap: 10px;
          }

          .dashboard-stat-value {
            font-size: 24px;
          }

          .dashboard-section-title {
            padding: 9px 10px;
          }
        }
      `}</style>

      <PageHeader
        title="Dashboard"
        subtitle="Welcome back,"
        icon={<Home className="h-8 w-8" />}
        userName={user.fullName}
        userBranch={activeBranch || user.branch}
        userRole={user.role}
        showUserContext
        onNavigate={onNavigate}
        showQuickActions
        alertCount={unreadAlertCount}
      />

      <div className="dashboard-stat-grid grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Inventory"
          value={monthlyActivity.toString()}
          change={`${totalItems} item records`}
          icon={<Package className="w-6 h-6" />}
          iconTileStyle={{ backgroundColor: '#2563eb' }}
          bgOverlayStyle={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 55%, #e2e8f0 100%)' }}
          bgGradient="from-blue-50 to-indigo-50"
          trend="up"
          percentage="Units"
          onClick={() => openInventoryStatus('all')}
          actionLabel="View inventory"
        />
        <StatCard
          title="Out of Stock"
          value={outOfStock.toString()}
          change={outOfStock > 0 ? "Immediate restock needed" : "None depleted"}
          icon={<AlertTriangle className="w-6 h-6" />}
          iconTileStyle={{ backgroundColor: '#dc2626' }}
          bgGradient="from-red-50 to-red-100"
          trend={outOfStock > 0 ? "down" : "neutral"}
          percentage={outOfStock > 0 ? "Critical" : "Clear"}
          onClick={() => openInventoryStatus('Out of Stock')}
          actionLabel="View urgent items"
        />
        <StatCard
          title="Low Stock"
          value={lowStockItems.toString()}
          change={lowStockItems > 0 ? "Below reorder point" : "All levels safe"}
          icon={<AlertTriangle className="w-6 h-6" />}
          iconTileStyle={{ backgroundColor: '#f59e0b' }}
          bgGradient="from-yellow-50 to-orange-50"
          trend={lowStockItems > 0 ? "down" : "neutral"}
          percentage={lowStockItems > 0 ? "Warning" : "Good"}
          onClick={() => openInventoryStatus('Low Stock')}
          actionLabel="View reorder items"
        />
        <StatCard
          title="In Stock"
          value={activeProducts.toString()}
          change="Ready for use"
          icon={<CheckCircle className="w-6 h-6" />}
          iconTileStyle={{ backgroundColor: '#16a34a' }}
          bgOverlayStyle={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #dcfce7 52%, #bbf7d0 100%)' }}
          bgGradient="from-green-50 to-emerald-50"
          trend="up"
          percentage="Available"
          onClick={() => openInventoryStatus('In Stock')}
          actionLabel="View available items"
        />
      </div>

      <section className="mb-6">
        <div className="dashboard-section-title flex items-center gap-2 mb-4">
          <Activity className="w-6 h-6 text-[#FF0000]" />
          <h2 className="text-2xl font-bold text-gray-900">Inventory Operations</h2>
        </div>
        <div className="dashboard-module-grid grid grid-cols-2 md:grid-cols-2 gap-4">
          <ModuleCard
            icon={<PackagePlus className="w-7 h-7" />}
            title="Record Stock In"
            description="Receive deliveries and update stock quantities."
            onClick={() => openInventoryAction('stock-in')}
            gradient="from-green-600 to-green-700"
            badge="Receiving"
          />
          <ModuleCard
            icon={<Activity className="w-7 h-7" />}
            title="Record Stock Out"
            description="Deduct sold, damaged, expired, or adjusted items."
            onClick={() => openInventoryAction('stock-out')}
            gradient="from-slate-700 to-slate-800"
            badge="Movement"
          />
          <ModuleCard
            icon={<ReceiptText className="w-7 h-7" />}
            title="Record Sale"
            description="Record customer purchases and deduct stock automatically."
            onClick={openSales}
            gradient="from-orange-500 to-orange-600"
            badge={salesToday > 0 ? `${salesToday} Today` : "Sales"}
          />
          <ModuleCard
            icon={<AlertTriangle className="w-7 h-7" />}
            title="Review Reorder Items"
            description="Open the supplier-based reorder report for purchasing review."
            onClick={() => openTargetReport('supplier-reorder')}
            gradient="from-red-600 to-red-700"
            badge={`${reorderAttentionCount} ${reorderAttentionCount === 1 ? 'Item' : 'Items'}`}
          />
          <ModuleCard
            icon={<Activity className="w-7 h-7" />}
            title="Stock Movement History"
            description="Review stock-in, stock-out, and sales movement records."
            onClick={() => openTargetReport('movements')}
            gradient="from-slate-700 to-slate-800"
            badge={`${stockMovementsToday} Today`}
          />
          {user.role === 'Admin' && <ModuleCard
            icon={<Package className="w-7 h-7" />}
            title="Add New Item"
            description="Admin-only action for registering a new inventory record."
            onClick={() => openInventoryAction('add-item')}
            gradient="from-red-500 to-red-600"
            badge="Admin Only"
          />}
          {user.role !== 'Admin' && <ModuleCard
            icon={<ClipboardCheck className="w-7 h-7" />}
            title="Verify Physical Stock"
            description="Check counted shelf stock against the system quantity."
            onClick={() => setIsStockCountDialogOpen(true)}
            gradient="from-blue-600 to-blue-700"
            badge="Stock Check"
          />}
        </div>
      </section>

      <section>
        <div className="dashboard-section-title flex items-center gap-2 mb-4">
          <Zap className="w-6 h-6 text-[#FFFF00]" />
          <h2 className="text-2xl font-bold text-gray-900">Monitoring and Attention</h2>
        </div>
        <div className="dashboard-monitoring-grid grid grid-cols-1 gap-6">
          {movementPanel}
          {stockAlertPanel}
          {adminPanel}
        </div>
      </section>

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
            <DialogDescription className="text-sm leading-6 text-slate-600">
              Use this when you count an item on the shelf or in the stockroom and need to check if it matches the system record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-slate-700">
              Select the item, enter the actual counted quantity, then review the difference. If the count does not match, continue to the correct stock adjustment.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stock-count-item">Item Counted</Label>
                <Select value={stockCountForm.itemId} onValueChange={value => setStockCountForm(prev => ({ ...prev, itemId: value }))}>
                  <SelectTrigger id="stock-count-item">
                    <SelectValue placeholder="Choose the item you counted" />
                  </SelectTrigger>
                  <SelectContent>
                    {inventory.map(item => (
                      <SelectItem key={item.id} value={item.id}>
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
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={stockCountForm.physicalCount}
                  onChange={event => setStockCountForm(prev => ({ ...prev, physicalCount: event.target.value }))}
                  placeholder="Type the actual units counted"
                />
              </div>
            </div>

            <div className="dashboard-count-preview">
              <div className="dashboard-count-preview-row">
                <span className="text-sm font-medium text-slate-600">Quantity in System</span>
                <span className="text-sm font-semibold text-slate-900">
                  {selectedCountItem ? `${selectedCountItem.quantity} units` : 'No item selected'}
                </span>
              </div>
              <div className="dashboard-count-preview-row">
                <span className="text-sm font-medium text-slate-600">Actual Counted Quantity</span>
                <span className="text-sm font-semibold text-slate-900">
                  {hasValidPhysicalCount ? `${physicalCountValue} units` : hasPhysicalCountEntry ? 'Whole number required' : 'Not entered'}
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

            {selectedCountItem && hasValidPhysicalCount && (
              <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${stockCountVariance > 0 ? 'border-green-200 bg-green-50 text-green-800' : stockCountVariance < 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                {stockCountVariance > 0 && `Physical count is higher than the system stock. If verified, record a Stock In correction for ${Math.abs(stockCountVariance)} unit${Math.abs(stockCountVariance) === 1 ? '' : 's'}.`}
                {stockCountVariance < 0 && `Physical count is lower than the system stock. If verified, record a Stock Out correction for ${Math.abs(stockCountVariance)} unit${Math.abs(stockCountVariance) === 1 ? '' : 's'}.`}
                {stockCountVariance === 0 && 'Counts match. No stock correction is needed.'}
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
function StatCard({
  title,
  value,
  change,
  icon,
  iconTileStyle,
  bgOverlayClassName,
  bgOverlayStyle,
  bgGradient,
  trend,
  percentage,
  onClick,
  actionLabel
}) {
  return (
    <Card
      className={`dashboard-stat-card relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${onClick ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-200' : ''}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={event => {
      if (!onClick) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
      }}
    >
      <div
        className={`absolute inset-0 ${bgOverlayStyle ? '' : bgOverlayClassName || `bg-gradient-to-br ${bgGradient}`} opacity-80`}
        style={bgOverlayStyle}
      />
      <CardContent className="dashboard-stat-content relative pt-6">
        <div className="dashboard-stat-top flex items-start justify-between mb-4">
          <div className="dashboard-stat-icon p-3 rounded-xl shadow-md" style={iconTileStyle}>
            <div className="text-white">{icon}</div>
          </div>
          <Badge variant="outline" className="dashboard-stat-badge inline-flex h-6 items-center justify-center rounded-full bg-white/90 text-center leading-none backdrop-blur-sm border-gray-300 text-gray-700">
            {percentage}
          </Badge>
        </div>
        <div>
          <h3 className="dashboard-stat-value text-4xl font-bold text-gray-900 mb-1">{value}</h3>
          <p className="dashboard-stat-title text-sm font-semibold text-gray-800 mb-1">{title}</p>
          <div className="dashboard-stat-change flex items-center gap-1 text-xs text-gray-700">
            {trend === 'up' && <TrendingUp className="w-3 h-3 text-green-600" />}
            {trend === 'down' && <AlertTriangle className="w-3 h-3 text-[#FF0000]" />}
            <span>{change}</span>
          </div>
          {actionLabel && (
            <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-slate-800">
              {actionLabel}
              <ArrowRight className="h-3 w-3" />
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
function ModuleCard({
  icon,
  title,
  description,
  onClick,
  gradient,
  badge
}) {
  const iconTileBackground = {
    "from-green-600 to-green-700": "linear-gradient(135deg, #16A34A 0%, #15803D 100%)",
    "from-slate-700 to-slate-800": "linear-gradient(135deg, #334155 0%, #1E293B 100%)",
    "from-orange-500 to-orange-600": "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
    "from-red-600 to-red-700": "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)",
    "from-red-500 to-red-600": "linear-gradient(135deg, #EF4444 0%, #DC2626 100%)",
    "from-blue-600 to-blue-700": "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)"
  }[gradient] || "linear-gradient(135deg, #334155 0%, #1E293B 100%)";

  return /*#__PURE__*/React.createElement(Card, {
    className: "dashboard-module-card group relative overflow-hidden border-2 border-gray-200 shadow-md transition-colors duration-200 cursor-pointer hover:border-red-200 hover:bg-slate-50 h-full",
    role: "button",
    tabIndex: 0,
    onClick: onClick,
    onKeyDown: event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 bg-gradient-to-br from-white/0 to-slate-50/0 group-hover:from-white/0 group-hover:to-slate-50/80 transition-colors duration-200"
  }), /*#__PURE__*/React.createElement(CardHeader, {
    className: "dashboard-module-header relative pb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dashboard-module-top flex items-start justify-between mb-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dashboard-module-icon p-3 rounded-xl shadow-md",
    style: {
      background: iconTileBackground
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-center text-white [&>svg]:text-white [&>svg]:stroke-white"
  }, icon)), badge && /*#__PURE__*/React.createElement(Badge, {
    className: "dashboard-module-badge inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-gray-100 px-2 text-center leading-none text-gray-700 border border-gray-300"
  }, badge)), /*#__PURE__*/React.createElement(CardTitle, {
    className: "dashboard-module-title text-base group-hover:text-[#FF0000] transition-colors duration-200 flex items-center gap-2 mb-2"
  }, title, /*#__PURE__*/React.createElement(ArrowUpRight, {
    className: "w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
  })), /*#__PURE__*/React.createElement(CardDescription, {
    className: "dashboard-module-description text-sm text-gray-600 leading-relaxed"
  }, description)));
}
