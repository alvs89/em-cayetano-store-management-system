import React from 'react';
import { Database, Users, Download, Upload, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { PageHeader } from './PageHeader';
export function MaintenanceModule({
  onNavigate
}) {
  const handleBackup = () => {
    toast.success('Database backup created successfully!');
  };
  const handleRestore = () => {
    toast.success('Database restored successfully!');
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gray-50 p-8"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "System Maintenance",
    subtitle: "Manage system backup, restore, and administrative tasks"
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "hover:shadow-lg transition-all"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3"
  }, /*#__PURE__*/React.createElement(Download, {
    className: "w-6 h-6 text-blue-600"
  })), /*#__PURE__*/React.createElement(CardTitle, null, "Database Backup"), /*#__PURE__*/React.createElement(CardDescription, null, "Create a backup of the entire database")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Button, {
    className: "w-full",
    onClick: handleBackup
  }, /*#__PURE__*/React.createElement(Download, {
    className: "w-4 h-4 mr-2"
  }), "Create Backup"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mt-3"
  }, "Last backup: October 12, 2025 at 10:30 PM"))), /*#__PURE__*/React.createElement(Card, {
    className: "hover:shadow-lg transition-all"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-3"
  }, /*#__PURE__*/React.createElement(Upload, {
    className: "w-6 h-6 text-orange-600"
  })), /*#__PURE__*/React.createElement(CardTitle, null, "Database Restore"), /*#__PURE__*/React.createElement(CardDescription, null, "Restore database from a backup file")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Button, {
    className: "w-full",
    variant: "outline",
    onClick: handleRestore
  }, /*#__PURE__*/React.createElement(Upload, {
    className: "w-4 h-4 mr-2"
  }), "Restore Database"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mt-3"
  }, "\u26A0\uFE0F This will overwrite current data"))), /*#__PURE__*/React.createElement(Card, {
    className: "hover:shadow-lg transition-all"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mb-3"
  }, /*#__PURE__*/React.createElement(Users, {
    className: "w-6 h-6 text-teal-600"
  })), /*#__PURE__*/React.createElement(CardTitle, null, "User Management"), /*#__PURE__*/React.createElement(CardDescription, null, "Manage user accounts and permissions")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Button, {
    className: "w-full",
    onClick: () => onNavigate('user-management')
  }, /*#__PURE__*/React.createElement(Users, {
    className: "w-4 h-4 mr-2"
  }), "Manage Users"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mt-3"
  }, "12 active users in the system"))), /*#__PURE__*/React.createElement(Card, {
    className: "hover:shadow-lg transition-all"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-3"
  }, /*#__PURE__*/React.createElement(Database, {
    className: "w-6 h-6 text-green-600"
  })), /*#__PURE__*/React.createElement(CardTitle, null, "System Status"), /*#__PURE__*/React.createElement(CardDescription, null, "View system health and statistics")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Database Status"), /*#__PURE__*/React.createElement("span", {
    className: "text-green-600"
  }, "\u25CF Online")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Storage Used"), /*#__PURE__*/React.createElement("span", null, "234 MB / 2 GB")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Active Sessions"), /*#__PURE__*/React.createElement("span", null, "8"))))), /*#__PURE__*/React.createElement(Card, {
    className: "hover:shadow-lg transition-all"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-3"
  }, /*#__PURE__*/React.createElement(Shield, {
    className: "w-6 h-6 text-red-600"
  })), /*#__PURE__*/React.createElement(CardTitle, null, "Security Settings"), /*#__PURE__*/React.createElement(CardDescription, null, "Manage system security configurations")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Two-Factor Auth"), /*#__PURE__*/React.createElement("span", {
    className: "text-green-600"
  }, "Enabled")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Session Timeout"), /*#__PURE__*/React.createElement("span", null, "30 minutes")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Password Policy"), /*#__PURE__*/React.createElement("span", null, "Strong")))))));
}

