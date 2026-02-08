import React from 'react';
import { Package, FileText, Search, Settings, HelpCircle, Bell, TrendingUp, AlertTriangle, CheckCircle, ArrowUpRight, ArrowRight, Activity, Zap, Archive, Users } from 'lucide-react';
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
    archivedInventory
  } = useData();

  // Calculate headline inventory stats for the metric cards.
  const totalItems = inventory.length;
  const lowStockItems = inventory.filter(item => item.status === 'Low Stock').length;
  const activeProducts = inventory.filter(item => item.status === 'In Stock').length;
  const outOfStock = inventory.filter(item => item.status === 'Out of Stock').length;
  const archivedCount = archivedInventory.length;

  // Basic activity signal: total units across inventory.
  const monthlyActivity = inventory.reduce((sum, item) => sum + item.quantity, 0);

  // Surface the most critical items needing attention.
  const recentLowStock = inventory.filter(item => item.status === 'Low Stock' || item.status === 'Out of Stock').slice(0, 3);

  // Render dashboard shell with stats, shortcuts, and recent activity.
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gray-50 p-8"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Dashboard",
    subtitle: "Welcome back,",
    userName: user.fullName,
    userBranch: activeBranch || user.branch,
    userRole: user.role,
    onNavigate: onNavigate,
    showQuickActions: true,
    lowStockCount: lowStockItems
  }),
  // KPI cards summarizing inventory health at a glance.
  /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
  }, /*#__PURE__*/React.createElement(StatCard, {
    title: "Total Items",
    value: totalItems.toString(),
    change: outOfStock > 0 ? `${outOfStock} out of stock` : 'All in stock',
    icon: /*#__PURE__*/React.createElement(Package, {
      className: "w-6 h-6"
    }),
    gradient: "from-yellow-400 to-yellow-500",
    bgGradient: "from-yellow-50 to-yellow-100",
    trend: "up",
    percentage: `${activeProducts}/${totalItems}`
  }), /*#__PURE__*/React.createElement(StatCard, {
    title: "Low Stock Items",
    value: lowStockItems.toString(),
    change: lowStockItems > 0 ? "Needs attention" : "All good",
    icon: /*#__PURE__*/React.createElement(AlertTriangle, {
      className: "w-6 h-6"
    }),
    gradient: "from-red-500 to-red-600",
    bgGradient: "from-red-50 to-red-100",
    trend: lowStockItems > 0 ? "down" : "neutral",
    percentage: lowStockItems > 0 ? "Critical" : "Good"
  }), /*#__PURE__*/React.createElement(StatCard, {
    title: "Active Products",
    value: activeProducts.toString(),
    change: "In stock",
    icon: /*#__PURE__*/React.createElement(CheckCircle, {
      className: "w-6 h-6"
    }),
    gradient: "from-yellow-500 to-red-400",
    bgGradient: "from-yellow-50 to-orange-50",
    trend: "up",
    percentage: "Ready"
  }), /*#__PURE__*/React.createElement(StatCard, {
    title: "Total Inventory",
    value: monthlyActivity.toString(),
    change: "Units available",
    icon: /*#__PURE__*/React.createElement(TrendingUp, {
      className: "w-6 h-6"
    }),
    gradient: "from-red-400 to-yellow-500",
    bgGradient: "from-orange-50 to-yellow-50",
    trend: "up",
    percentage: "Stock"
  })),
  // Quick-access module shortcuts and recent activity panels.
  /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 lg:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mb-4"
  }, /*#__PURE__*/React.createElement(Activity, {
    className: "w-6 h-6 text-[#FF0000]"
  }), /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-bold text-gray-900"
  }, "Quick Access Modules")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 gap-4"
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
    badge: `${totalItems} items`
  }), /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(Archive, {
      className: "w-7 h-7"
    }),
    title: "Archive",
    description: "View and restore archived inventory items",
    onClick: () => onNavigate('archive'),
    gradient: "from-gray-600 to-gray-700",
    badge: archivedCount > 0 ? `${archivedCount} archived` : "Empty"
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
    badge: lowStockItems > 0 ? `${lowStockItems} alerts` : "No alerts"
  }), user.role === 'Admin' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(Settings, {
      className: "w-7 h-7"
    }),
    title: "System Maintenance",
    description: "Backup, restore, and system settings",
    onClick: () => onNavigate('maintenance'),
    gradient: "from-gray-700 to-gray-800",
    badge: "Admin"
  }), /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(Users, {
      className: "w-7 h-7"
    }),
    title: "User Management",
    description: "Manage user accounts and permissions",
    onClick: () => onNavigate('user-management'),
    gradient: "from-slate-700 to-slate-800",
    badge: "Admin"
  })), /*#__PURE__*/React.createElement(ModuleCard, {
    icon: /*#__PURE__*/React.createElement(HelpCircle, {
      className: "w-7 h-7"
    }),
    title: "Help & Support",
    description: "FAQs and user guides",
    onClick: () => onNavigate('help'),
    gradient: "from-yellow-400 to-red-400",
    badge: "Guide"
  }))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 mb-4"
  }, /*#__PURE__*/React.createElement(Zap, {
    className: "w-6 h-6 text-[#FFFF00]"
  }), /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-bold text-gray-900"
  }, "Recent Activity")),
  // Inventory status breakdown for quick health check.
  /*#__PURE__*/React.createElement(Card, {
    className: "mb-4 border-2 border-gray-200 shadow-md"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    className: "pb-3"
  }, /*#__PURE__*/React.createElement(CardTitle, {
    className: "text-lg"
  }, "Stock Status"), /*#__PURE__*/React.createElement(CardDescription, null, "Current inventory health")), /*#__PURE__*/React.createElement(CardContent, {
    className: "pb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between py-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-3 h-3 rounded-full bg-green-500"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-sm text-gray-700"
  }, "In Stock")), /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-green-700"
  }, activeProducts)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between py-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-3 h-3 rounded-full bg-[#FFFF00]"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-sm text-gray-700"
  }, "Low Stock")), /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-yellow-700"
  }, lowStockItems)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between py-2"
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
  recentLowStock.length > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "border-2 border-red-200 shadow-md"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    className: "pb-3 bg-red-50"
  }, /*#__PURE__*/React.createElement(CardTitle, {
    className: "text-lg flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-5 h-5 text-[#FF0000]"
  }), "Low Stock Items"), /*#__PURE__*/React.createElement(CardDescription, null, "Items requiring attention")), /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-4 pb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, recentLowStock.map(item => /*#__PURE__*/React.createElement("div", {
    key: item.id,
    className: "flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-semibold text-gray-900 truncate"
  }, item.name), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-gray-600"
  }, item.category)), /*#__PURE__*/React.createElement(Badge, {
    variant: "destructive",
    className: "ml-2 shrink-0"
  }, item.quantity)))), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    className: "w-full mt-3 text-[#FF0000] hover:text-red-700 hover:bg-red-50",
    onClick: () => onNavigate('alerts')
  }, "View All Alerts", /*#__PURE__*/React.createElement(ArrowRight, {
    className: "w-4 h-4 ml-2"
  })))),
  // Reassurance card when there are no outstanding low-stock issues.
  recentLowStock.length === 0 && /*#__PURE__*/React.createElement(Card, {
    className: "border-2 border-green-200 shadow-md"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    className: "pb-3 bg-green-50"
  }, /*#__PURE__*/React.createElement(CardTitle, {
    className: "text-lg flex items-center gap-2"
  }, /*#__PURE__*/React.createElement(CheckCircle, {
    className: "w-5 h-5 text-green-600"
  }), "All Good!"), /*#__PURE__*/React.createElement(CardDescription, null, "No critical alerts")), /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-4 pb-4"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-600 text-center"
  }, "No low stock items. All inventory levels are adequate."))))));
}
function StatCard({
  title,
  value,
  change,
  icon,
  gradient,
  bgGradient,
  trend,
  percentage
}) {
  return /*#__PURE__*/React.createElement(Card, {
    className: "relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: `absolute inset-0 bg-gradient-to-br ${bgGradient} opacity-60`
  }), /*#__PURE__*/React.createElement(CardContent, {
    className: "relative pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between mb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: `p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-md`
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-white"
  }, icon)), /*#__PURE__*/React.createElement(Badge, {
    variant: "outline",
    className: "bg-white/90 backdrop-blur-sm border-gray-300 text-gray-700"
  }, percentage)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    className: "text-4xl font-bold text-gray-900 mb-1"
  }, value), /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-semibold text-gray-800 mb-1"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1 text-xs text-gray-700"
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
    className: "group relative overflow-hidden border-2 border-gray-200 hover:border-[#FFFF00] shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer hover:-translate-y-1 h-full",
    onClick: onClick
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 bg-gradient-to-br from-[#FFFF00]/0 to-[#FF0000]/0 group-hover:from-[#FFFF00]/10 group-hover:to-[#FF0000]/5 transition-all duration-300"
  }), /*#__PURE__*/React.createElement(CardHeader, {
    className: "relative pb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between mb-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: `p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-md group-hover:scale-110 transition-transform duration-300`
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-white"
  }, icon)), badge && /*#__PURE__*/React.createElement(Badge, {
    className: "bg-gray-100 text-gray-700 border border-gray-300 shrink-0"
  }, badge)), /*#__PURE__*/React.createElement(CardTitle, {
    className: "text-base group-hover:text-[#FF0000] transition-colors duration-300 flex items-center gap-2 mb-2"
  }, title, /*#__PURE__*/React.createElement(ArrowUpRight, {
    className: "w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"
  })), /*#__PURE__*/React.createElement(CardDescription, {
    className: "text-sm text-gray-600 leading-relaxed"
  }, description)));
}

