import React from 'react';
import { useState, useEffect } from "react";
import { Bell, AlertTriangle, Info, CheckCircle, X, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { toast } from "sonner";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";

// Derive contextual alerts from live inventory status so the feed reflects stock changes without manual input.
const generateInventoryAlerts = inventory => {
  const alerts = [];
  inventory.forEach(item => {
    if (item.status === 'Out of Stock') {
      alerts.push({
        id: `out-${item.id}`,
        type: 'warning',
        title: 'Out of Stock',
        message: `${item.name} is completely out of stock`,
        timestamp: 'Just now',
        read: false,
        actionable: true,
        relatedModule: 'inventory'
      });
    } else if (item.status === 'Low Stock') {
      alerts.push({
        id: `low-${item.id}`,
        type: 'warning',
        title: 'Low Stock Alert',
        message: `${item.name} is running low (${item.quantity} units remaining)`,
        timestamp: 'Just now',
        read: false,
        actionable: true,
        relatedModule: 'inventory'
      });
    }
  });
  return alerts;
};
// Fixed alerts that always show up, representing non-inventory system notices.
const staticAlerts = [{
  id: "4",
  type: "info",
  title: "System Backup Reminder",
  message: "It's been 3 days since the last system backup",
  timestamp: "1 day ago",
  read: true,
  actionable: true,
  relatedModule: "maintenance"
}, {
  id: "6",
  type: "info",
  title: "New User Registration",
  message: "Anna Cruz has submitted a registration request",
  timestamp: "1 day ago",
  read: true,
  actionable: true,
  relatedModule: "user-management"
}];
export function AlertsModule({
  user,
  onNavigate,
  onAlertCountChange
}) {
  // Pull current inventory from shared context so alerts react to upstream data changes.
  const {
    inventory
  } = useData();

  // Generate real-time alerts from inventory
  const inventoryAlerts = generateInventoryAlerts(inventory);

  // Merge dynamic inventory alerts with static notices into a single feed.
  const allAlerts = [...inventoryAlerts, ...staticAlerts];

  // Hide admin-facing alerts for employees so they only see relevant information.
  const filteredAlerts = user.role === "Employee" ? allAlerts.filter(alert => alert.relatedModule !== "user-management" && alert.relatedModule !== "maintenance" && !alert.title.toLowerCase().includes("user registration")) : allAlerts;
  const [alerts, setAlerts] = useState(filteredAlerts);

  // Recompute the feed whenever inventory or role changes to keep visibility rules in sync.
  useEffect(() => {
    const newInventoryAlerts = generateInventoryAlerts(inventory);
    const newAllAlerts = [...newInventoryAlerts, ...staticAlerts];
    const newFilteredAlerts = user.role === "Employee" ? newAllAlerts.filter(alert => alert.relatedModule !== "user-management" && alert.relatedModule !== "maintenance" && !alert.title.toLowerCase().includes("user registration")) : newAllAlerts;
    setAlerts(newFilteredAlerts);
  }, [inventory, user.role]);

  // Category breakdowns for the tabs and summary cards.
  const unreadAlerts = alerts.filter(a => !a.read);
  const warningAlerts = alerts.filter(a => a.type === "warning");
  const infoAlerts = alerts.filter(a => a.type === "info");
  const successAlerts = alerts.filter(a => a.type === "success");

  // Notify parent when unread count changes so the header badge stays accurate.
  useEffect(() => {
    onAlertCountChange(unreadAlerts.length);
  }, [unreadAlerts.length, onAlertCountChange]);

  // Mark a single alert as read and keep user feedback immediate.
  const handleMarkAsRead = id => {
    setAlerts(alerts.map(a => a.id === id ? {
      ...a,
      read: true
    } : a));
    toast.success("Alert marked as read");
  };

  // Permanently remove an alert from the list.
  const handleDismiss = id => {
    setAlerts(alerts.filter(a => a.id !== id));
    toast.success("Alert dismissed");
  };

  // Bulk mark all alerts as read to clear badges quickly.
  const handleMarkAllAsRead = () => {
    setAlerts(alerts.map(a => ({
      ...a,
      read: true
    })));
    toast.success("All alerts marked as read");
  };

  // Route to the related module when an alert offers follow-up action.
  const handleGoToRelated = alert => {
    if (alert.relatedModule) {
      onNavigate(alert.relatedModule);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gray-50 p-8"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Alerts & Notifications",
    subtitle: "Stay updated with important system events and real-time inventory alerts"
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-4 gap-6 mb-6"
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Total Alerts"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl text-slate-900"
  }, alerts.length)), /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(Bell, {
    className: "w-6 h-6 text-blue-600"
  }))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Unread"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl text-slate-900"
  }, unreadAlerts.length)), /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(Bell, {
    className: "w-6 h-6 text-orange-600"
  }))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Warnings"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl text-slate-900"
  }, warningAlerts.length)), /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-6 h-6 text-red-600"
  }))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-1"
  }, "Info"), /*#__PURE__*/React.createElement("p", {
    className: "text-2xl text-slate-900"
  }, infoAlerts.length)), /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center"
  }, /*#__PURE__*/React.createElement(Info, {
    className: "w-6 h-6 text-teal-600"
  })))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(CardTitle, null, "Notifications"), /*#__PURE__*/React.createElement(CardDescription, null, "All system alerts and notifications")), unreadAlerts.length > 0 && /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    onClick: handleMarkAllAsRead,
    className: "shadow-md"
  }, /*#__PURE__*/React.createElement(CheckCircle, {
    className: "w-4 h-4 mr-2"
  }), "Mark All as Read"))), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Tabs, {
    defaultValue: "all"
  }, /*#__PURE__*/React.createElement(TabsList, {
    className: "mb-4"
  }, /*#__PURE__*/React.createElement(TabsTrigger, {
    value: "all"
  }, "All (", alerts.length, ")"), /*#__PURE__*/React.createElement(TabsTrigger, {
    value: "unread"
  }, "Unread (", unreadAlerts.length, ")"), /*#__PURE__*/React.createElement(TabsTrigger, {
    value: "warnings"
  }, "Warnings (", warningAlerts.length, ")")), /*#__PURE__*/React.createElement(TabsContent, {
    value: "all",
    className: "space-y-3"
  }, alerts.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-16"
  }, /*#__PURE__*/React.createElement(Bell, {
    className: "w-16 h-16 mx-auto mb-4 text-slate-300"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-400"
  }, "No alerts to display")) : alerts.map(alert => /*#__PURE__*/React.createElement(AlertCard, {
    key: alert.id,
    alert: alert,
    onMarkAsRead: handleMarkAsRead,
    onDismiss: handleDismiss,
    onGoToRelated: handleGoToRelated
  }))), /*#__PURE__*/React.createElement(TabsContent, {
    value: "unread",
    className: "space-y-3"
  }, unreadAlerts.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-16"
  }, /*#__PURE__*/React.createElement(CheckCircle, {
    className: "w-16 h-16 mx-auto mb-4 text-green-300"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-400"
  }, "All caught up! No unread alerts.")) : unreadAlerts.map(alert => /*#__PURE__*/React.createElement(AlertCard, {
    key: alert.id,
    alert: alert,
    onMarkAsRead: handleMarkAsRead,
    onDismiss: handleDismiss,
    onGoToRelated: handleGoToRelated
  }))), /*#__PURE__*/React.createElement(TabsContent, {
    value: "warnings",
    className: "space-y-3"
  }, warningAlerts.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-16"
  }, /*#__PURE__*/React.createElement(CheckCircle, {
    className: "w-16 h-16 mx-auto mb-4 text-green-300"
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-400"
  }, "No warnings at this time")) : warningAlerts.map(alert => /*#__PURE__*/React.createElement(AlertCard, {
    key: alert.id,
    alert: alert,
    onMarkAsRead: handleMarkAsRead,
    onDismiss: handleDismiss,
    onGoToRelated: handleGoToRelated
  })))))));
}
function AlertCard({
  alert,
  onMarkAsRead,
  onDismiss,
  onGoToRelated
}) {
  // Map alert type to the appropriate status icon.
  const getIcon = () => {
    switch (alert.type) {
      case "warning":
        return /*#__PURE__*/React.createElement(AlertTriangle, {
          className: "w-5 h-5 text-orange-600"
        });
      case "info":
        return /*#__PURE__*/React.createElement(Info, {
          className: "w-5 h-5 text-blue-600"
        });
      case "success":
        return /*#__PURE__*/React.createElement(CheckCircle, {
          className: "w-5 h-5 text-green-600"
        });
    }
  };

  // Match card accent colors to the alert type for quick scanning.
  const getBgColor = () => {
    switch (alert.type) {
      case "warning":
        return "bg-orange-50 border-orange-200";
      case "info":
        return "bg-blue-50 border-blue-200";
      case "success":
        return "bg-green-50 border-green-200";
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    // Highlight unread alerts with a ring to draw attention without changing layout.
    className: `p-4 rounded-lg border ${getBgColor()} ${!alert.read ? "ring-2 ring-blue-400" : ""}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start gap-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-shrink-0 mt-0.5"
  }, getIcon()), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between gap-3 mb-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("h4", {
    className: "text-sm"
  }, alert.title), !alert.read && /*#__PURE__*/React.createElement(Badge, {
    className: "bg-blue-600 text-white hover:bg-blue-600"
  }, "New")), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    className: "h-6 w-6 p-0 hover:bg-white/50",
    onClick: () => onDismiss(alert.id)
  }, /*#__PURE__*/React.createElement(X, {
    className: "w-4 h-4"
  }))), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mb-2"
  }, alert.message), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-slate-500"
  }, alert.timestamp), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, !alert.read && /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    className: "h-7 text-xs",
    onClick: () => onMarkAsRead(alert.id)
  }, "Mark as Read"), alert.actionable && alert.relatedModule && /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    className: "h-7 text-xs",
    onClick: () => onGoToRelated(alert)
  }, /*#__PURE__*/React.createElement(Package, {
    className: "w-3 h-3 mr-1"
  }), "View"))))));
}

