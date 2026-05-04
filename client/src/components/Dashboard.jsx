import React from 'react';
import { Home, Package, FileText, Search, Settings, HelpCircle, Bell, TrendingUp, AlertTriangle, CheckCircle, ArrowUpRight, ArrowRight, Activity, Zap, Archive, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useData } from './DataContext';
import { PageHeader } from './PageHeader';
export function Dashboard({
  onNavigate,
  user,
  activeBranch
}) {
  // Pull inventory sources from context so cards and lists stay live.
  const {
    inventory,
    archivedInventory,
    unreadAlertCount
  } = useData();

  // Calculate headline inventory stats for the metric cards.
  const totalItems = inventory.length;
  const lowStockItems = inventory.filter(item => item.status === 'Low Stock').length;
  const activeProducts = inventory.filter(item => item.status === 'In Stock').length;
  const outOfStock = inventory.filter(item => item.status === 'Out of Stock').length;
  const archivedCount = archivedInventory.length;
  const stockAlertPriority = {
    'Out of Stock': 1,
    'Low Stock': 2
  };

  // Basic activity signal: total units across inventory.
  const monthlyActivity = inventory.reduce((sum, item) => sum + item.quantity, 0);

  // Surface the most urgent stock issues first.
  const stockAlerts = inventory.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock').sort((a, b) => {
    const priorityDifference = (stockAlertPriority[a.status] ?? 999) - (stockAlertPriority[b.status] ?? 999);
    if (priorityDifference !== 0) return priorityDifference;
    return new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime();
  }).slice(0, 3);

  // Render dashboard shell with stats, shortcuts, and recent activity.
  return /*#__PURE__*/React.createElement("div", {
    className: "dashboard-page min-h-screen bg-gray-50 p-8"
  }, /*#__PURE__*/React.createElement("style", null, `
    .dashboard-stat-grid,
    .dashboard-module-grid {
      min-width: 0;
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

      .dashboard-stat-content {
        padding: 12px;
      }

      .dashboard-stat-top {
        align-items: center;
        margin-bottom: 10px;
      }

      .dashboard-stat-icon {
        padding: 9px;
        border-radius: 10px;
      }

      .dashboard-stat-icon svg {
        width: 18px;
        height: 18px;
      }

      .dashboard-stat-badge {
        max-width: 82px;
        padding: 3px 7px;
        font-size: 12px;
        line-height: 1.15;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dashboard-stat-value {
        font-size: 26px;
        line-height: 1;
      }

      .dashboard-stat-title {
        font-size: 12px;
        line-height: 1.25;
      }

      .dashboard-stat-change {
        font-size: 12px;
        line-height: 1.35;
      }

      .dashboard-content-grid {
        gap: 18px;
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
        letter-spacing: 0;
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
        min-height: 150px;
        border-radius: 12px;
      }

      .dashboard-module-header {
        padding: 12px;
        padding-bottom: 12px;
      }

      .dashboard-module-top {
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }

      .dashboard-module-icon {
        padding: 9px;
        border-radius: 10px;
      }

      .dashboard-module-icon svg {
        width: 18px;
        height: 18px;
      }

      .dashboard-module-badge {
        max-width: 86px;
        padding: 2px 6px;
        font-size: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dashboard-module-title {
        font-size: 13px;
        line-height: 1.25;
        margin-bottom: 5px;
      }

      .dashboard-module-description {
        font-size: 11px;
        line-height: 1.35;
      }

      .dashboard-side-panel {
        display: grid;
        gap: 14px;
      }

      .dashboard-side-panel .dashboard-section-title {
        margin-top: 2px;
      }

      .dashboard-status-card,
      .dashboard-alert-card {
        margin-bottom: 0;
        border-radius: 12px;
      }

      .dashboard-status-card [data-card-header],
      .dashboard-alert-card [data-card-header] {
        padding: 14px 14px 8px;
      }

      .dashboard-status-card [data-card-content],
      .dashboard-alert-card [data-card-content] {
        padding: 8px 14px 14px;
      }
    }

    @media (max-width: 390px) {
      .dashboard-page {
        padding: 8px;
      }

      .dashboard-stat-grid,
      .dashboard-module-grid {
        gap: 10px;
      }

      .dashboard-stat-content,
      .dashboard-module-header {
        padding: 10px;
      }

      .dashboard-stat-value {
        font-size: 24px;
      }

      .dashboard-module-card {
        min-height: 142px;
      }

      .dashboard-section-title {
        padding: 9px 10px;
      }

      .dashboard-section-title h2 {
        font-size: 17px;
      }
    }
  `), /*#__PURE__*/React.createElement(PageHeader, {
    title: "Dashboard",
    subtitle: "Welcome back,",
    icon: /*#__PURE__*/React.createElement(Home, {
      className: "h-8 w-8"
    }),
    userName: user.fullName,
    userBranch: activeBranch || user.branch,
    userRole: user.role,
    onNavigate: onNavigate,
    showQuickActions: true,
    alertCount: unreadAlertCount
  }),
  // KPI cards summarizing inventory health at a glance.
  /*#__PURE__*/React.createElement("div", {
    className: "dashboard-stat-grid grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
  }, /*#__PURE__*/React.createElement(StatCard, {
    title: "Total Inventory",
    value: monthlyActivity.toString(),
    change: `${totalItems} item records`,
    icon: /*#__PURE__*/React.createElement(Package, {
      className: "w-6 h-6"
    }),
    iconTileStyle: { backgroundColor: '#2563eb' },
    bgOverlayStyle: {
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 55%, #e2e8f0 100%)'
    },
    bgGradient: "from-blue-50 to-indigo-50",
    trend: "up",
    percentage: "Units"
  }), /*#__PURE__*/React.createElement(StatCard, {
    title: "Out of Stock",
    value: outOfStock.toString(),
    change: outOfStock > 0 ? "Immediate restock needed" : "None depleted",
    icon: /*#__PURE__*/React.createElement(AlertTriangle, {
      className: "w-6 h-6"
    }),
    iconTileStyle: { backgroundColor: '#dc2626' },
    bgGradient: "from-red-50 to-red-100",
    trend: outOfStock > 0 ? "down" : "neutral",
    percentage: outOfStock > 0 ? "Critical" : "Clear"
  }), /*#__PURE__*/React.createElement(StatCard, {
    title: "Low Stock",
    value: lowStockItems.toString(),
    change: lowStockItems > 0 ? "Below reorder level" : "All levels safe",
    icon: /*#__PURE__*/React.createElement(AlertTriangle, {
      className: "w-6 h-6"
    }),
    iconTileStyle: { backgroundColor: '#f59e0b' },
    bgGradient: "from-yellow-50 to-orange-50",
    trend: lowStockItems > 0 ? "down" : "neutral",
    percentage: lowStockItems > 0 ? "Warning" : "Good"
  }), /*#__PURE__*/React.createElement(StatCard, {
    title: "In Stock",
    value: activeProducts.toString(),
    change: "Ready for use",
    icon: /*#__PURE__*/React.createElement(CheckCircle, {
      className: "w-6 h-6"
    }),
    iconTileStyle: { backgroundColor: '#16a34a' },
    bgOverlayStyle: {
      background: 'linear-gradient(135deg, #ecfdf5 0%, #dcfce7 52%, #bbf7d0 100%)'
    },
    bgGradient: "from-green-50 to-emerald-50",
    trend: "up",
    percentage: "Available"
  })),
  // Quick-access module shortcuts and recent activity panels.
  /*#__PURE__*/React.createElement("div", {
    className: "dashboard-content-grid grid grid-cols-1 lg:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dashboard-section-title flex items-center gap-2 mb-4"
  }, /*#__PURE__*/React.createElement(Activity, {
    className: "w-6 h-6 text-[#FF0000]"
  }), /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-bold text-gray-900"
  }, "Quick Access Modules")), /*#__PURE__*/React.createElement("div", {
    className: "dashboard-module-grid grid grid-cols-2 md:grid-cols-2 gap-4"
  }, /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(Search, {
      className: "w-7 h-7"
    }),
    title: "Search Products",
    description: "Quickly find and view product details",
    onClick: () => onNavigate('search'),
    gradient: "from-yellow-500 to-orange-500",
    badge: "Quick Find"
  }), /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(Package, {
      className: "w-7 h-7"
    }),
    title: "Inventory Management",
    description: "Manage stock, add items, track inventory levels",
    onClick: () => onNavigate('inventory'),
    gradient: "from-red-400 to-red-500",
    badge: `${totalItems} ${totalItems === 1 ? 'Item' : 'Items'}`
  }), /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(Archive, {
      className: "w-7 h-7"
    }),
    title: "Archive",
    description: "View and restore archived inventory items",
    onClick: () => onNavigate('archive'),
    gradient: "from-gray-600 to-gray-700",
    badge: archivedCount > 0 ? `${archivedCount} Archived` : "Empty"
  }), /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(FileText, {
      className: "w-7 h-7"
    }),
    title: "Reports",
    description: "Generate and export detailed reports",
    onClick: () => onNavigate('reports'),
    gradient: "from-red-500 to-red-600",
    badge: "Export PDF"
  }), /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(Bell, {
      className: "w-7 h-7"
    }),
    title: "Alerts & Notifications",
    description: "View system alerts and notifications",
    onClick: () => onNavigate('alerts'),
    gradient: "from-yellow-600 to-orange-600",
    badge: unreadAlertCount > 0 ? `${unreadAlertCount} Alerts` : "No Alerts"
  }), user.role === 'Admin' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(Settings, {
      className: "w-7 h-7"
    }),
    title: "System Maintenance",
    description: "Backup, restore, and system settings",
    onClick: () => onNavigate('maintenance'),
    gradient: "from-gray-700 to-gray-800",
    badge: "Admin Only"
  }), /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(Users, {
      className: "w-7 h-7"
    }),
    title: "User Management",
    description: "Manage user accounts and permissions",
    onClick: () => onNavigate('user-management'),
    gradient: "from-slate-700 to-slate-800",
    badge: "Admin Only"
  })), /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(HelpCircle, {
      className: "w-7 h-7"
    }),
    title: "Help & Support",
    description: "FAQs and user guides",
    onClick: () => onNavigate('help'),
    gradient: "from-yellow-400 to-red-400",
    badge: "User Guide"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dashboard-side-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dashboard-section-title flex items-center gap-2 mb-4"
  }, /*#__PURE__*/React.createElement(Zap, {
    className: "w-6 h-6 text-[#FFFF00]"
  }), /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-bold text-gray-900"
  }, "Recent Activity")),
  // Inventory status breakdown for quick health check.
  /*#__PURE__*/React.createElement(Card, {
    className: "dashboard-status-card mb-4 border-2 border-gray-200 shadow-md"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    className: "pb-1",
    "data-card-header": true
  }, /*#__PURE__*/React.createElement(CardTitle, {
    className: "text-lg"
  }, "Stock Status"), /*#__PURE__*/React.createElement(CardDescription, null, "Current inventory health")), /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-1 pb-4",
    "data-card-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between py-1.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-3 h-3 rounded-full bg-green-500"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-sm text-gray-700"
  }, "In Stock")), /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-green-700"
  }, activeProducts)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between py-1.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-3 h-3 rounded-full bg-[#FFFF00]"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-sm text-gray-700"
  }, "Low Stock")), /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-yellow-700"
  }, lowStockItems)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between py-1.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-3 h-3 rounded-full bg-[#FF0000]"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-sm text-gray-700"
  }, "Out of Stock")), /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-red-700"
  }, outOfStock))))),
  // Critical items list when any stock is low or depleted.
  stockAlerts.length > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "dashboard-alert-card overflow-hidden border-2 border-red-200 shadow-md"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    className: "rounded-t-xl bg-red-50 pb-3",
    "data-card-header": true
  }, /*#__PURE__*/React.createElement(CardTitle, {
    className: "text-lg flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-5 h-5 text-[#FF0000]"
  }), "Stock Alerts"), /*#__PURE__*/React.createElement(CardDescription, null, "Low-stock and out-of-stock items requiring attention")), /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-3 pb-0.5",
    "data-card-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, stockAlerts.map(item => /*#__PURE__*/React.createElement("div", {
    key: item.id,
    className: "space-y-2 rounded-lg border border-red-200 bg-red-50 p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap items-center gap-2"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-semibold text-gray-900"
  }, item.name), /*#__PURE__*/React.createElement(Badge, {
    className: item.status === 'Out of Stock' ? "bg-red-600 text-white hover:bg-red-600" : "bg-orange-100 text-orange-700 hover:bg-orange-100"
  }, item.status)), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-gray-600"
  }, "Category: ", item.category), /*#__PURE__*/React.createElement("p", {
    className: item.quantity === 0 ? "text-xs font-semibold text-red-700" : "text-xs font-semibold text-slate-700"
  }, "Quantity: ", item.quantity, " ", item.quantity === 1 ? "unit left" : "units left")))), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    className: "mt-2 h-8 w-full text-[#FF0000] hover:bg-red-50 hover:text-red-700",
    onClick: () => onNavigate('alerts')
  }, "View All Alerts", /*#__PURE__*/React.createElement(ArrowRight, {
    className: "ml-1 h-4 w-4"
  })))),
  // Reassurance card when there are no outstanding stock issues.
  stockAlerts.length === 0 && /*#__PURE__*/React.createElement(Card, {
    className: "dashboard-alert-card border-2 border-green-200 shadow-md"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    className: "pb-3 bg-green-50",
    "data-card-header": true
  }, /*#__PURE__*/React.createElement(CardTitle, {
    className: "text-lg flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(CheckCircle, {
    className: "w-5 h-5 text-green-600"
  }), "All Good!"), /*#__PURE__*/React.createElement(CardDescription, null, "No critical alerts")), /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-4 pb-4",
    "data-card-content": true
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-600 text-center"
  }, "No stock alerts. All inventory levels are adequate."))))));
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
  percentage
}) {
  return /*#__PURE__*/React.createElement(Card, {
    className: "dashboard-stat-card relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: `absolute inset-0 ${bgOverlayStyle ? '' : bgOverlayClassName || `bg-gradient-to-br ${bgGradient}`} opacity-80`,
    style: bgOverlayStyle
  }), /*#__PURE__*/React.createElement(CardContent, {
    className: "dashboard-stat-content relative pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dashboard-stat-top flex items-start justify-between mb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dashboard-stat-icon p-3 rounded-xl shadow-md",
    style: iconTileStyle
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-white"
  }, icon)), /*#__PURE__*/React.createElement(Badge, {
    variant: "outline",
    className: "dashboard-stat-badge bg-white/90 backdrop-blur-sm border-gray-300 text-gray-700"
  }, percentage)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "dashboard-stat-value text-4xl font-bold text-gray-900 mb-1"
  }, value), /*#__PURE__*/React.createElement("p", {
    className: "dashboard-stat-title text-sm font-semibold text-gray-800 mb-1"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "dashboard-stat-change flex items-center gap-1 text-xs text-gray-700"
  }, trend === 'up' && /*#__PURE__*/React.createElement(TrendingUp, {
    className: "w-3 h-3 text-green-600"
  }), trend === 'down' && /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-3 h-3 text-[#FF0000]"
  }), /*#__PURE__*/React.createElement("span", null, change)))));
}
function ModuleCard({
  icon,
  title,
  description,
  onClick,
  gradient,
  badge
}) {
  return /*#__PURE__*/React.createElement(Card, {
    className: "dashboard-module-card group relative overflow-hidden border-2 border-gray-200 hover:border-[#FFFF00] shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer hover:-translate-y-1 h-full",
    onClick: onClick
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 bg-gradient-to-br from-[#FFFF00]/0 to-[#FF0000]/0 group-hover:from-[#FFFF00]/10 group-hover:to-[#FF0000]/5 transition-all duration-300"
  }), /*#__PURE__*/React.createElement(CardHeader, {
    className: "dashboard-module-header relative pb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dashboard-module-top flex items-start justify-between mb-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: `dashboard-module-icon p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-md group-hover:scale-110 transition-transform duration-300`
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-white"
  }, icon)), badge && /*#__PURE__*/React.createElement(Badge, {
    className: "dashboard-module-badge bg-gray-100 text-gray-700 border border-gray-300 shrink-0"
  }, badge)), /*#__PURE__*/React.createElement(CardTitle, {
    className: "dashboard-module-title text-base group-hover:text-[#FF0000] transition-colors duration-300 flex items-center gap-2 mb-2"
  }, title, /*#__PURE__*/React.createElement(ArrowUpRight, {
    className: "w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"
  })), /*#__PURE__*/React.createElement(CardDescription, {
    className: "dashboard-module-description text-sm text-gray-600 leading-relaxed"
  }, description)));
}

