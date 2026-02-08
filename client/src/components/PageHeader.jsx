import React from 'react';
import { Bell, FileText } from 'lucide-react';
import { Button } from './ui/button';
export function PageHeader({
  title,
  subtitle,
  userName,
  userBranch,
  userRole,
  onNavigate,
  showQuickActions = false,
  lowStockCount = 0
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-gradient-to-r from-red-600 via-red-500 to-yellow-500 rounded-2xl p-8 shadow-xl relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 right-0 w-64 h-64 bg-[#FFFF00] rounded-full blur-3xl opacity-20"
  }), /*#__PURE__*/React.createElement("div", {
    className: "absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl opacity-10"
  }), /*#__PURE__*/React.createElement("div", {
    className: "relative z-10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between flex-wrap gap-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-4xl font-bold text-white mb-2"
  }, title), /*#__PURE__*/React.createElement("p", {
    className: "text-white/95 text-lg"
  }, subtitle, userName && /*#__PURE__*/React.createElement(React.Fragment, null, ' ', /*#__PURE__*/React.createElement("span", {
    className: "font-semibold"
  }, userName), "!")), userBranch && userRole && /*#__PURE__*/React.createElement("p", {
    className: "text-white/80 text-sm mt-1"
  }, userBranch, " Branch \u2022 ", userRole)), showQuickActions && onNavigate && /*#__PURE__*/React.createElement("div", {
    className: "flex gap-3"
  }, /*#__PURE__*/React.createElement(Button, {
    onClick: () => onNavigate('alerts'),
    className: "bg-white text-red-600 hover:bg-red-50 shadow-lg border-2 border-white"
  }, /*#__PURE__*/React.createElement(Bell, {
    className: "w-4 h-4 mr-2"
  }), "Alerts ", lowStockCount > 0 && `(${lowStockCount})`), /*#__PURE__*/React.createElement(Button, {
    onClick: () => onNavigate('reports'),
    className: "bg-[#FFFF00] hover:bg-yellow-400 text-black shadow-lg border-2 border-[#FFFF00]"
  }, /*#__PURE__*/React.createElement(FileText, {
    className: "w-4 h-4 mr-2"
  }), "Reports"))))));
}

