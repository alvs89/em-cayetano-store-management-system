import React from 'react';
import { Book, Mail, Phone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Button } from './ui/button';
import { PageHeader } from './PageHeader';
export function HelpModule() {
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gray-50 p-8"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Help & Support",
    subtitle: "Find answers and get assistance"
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 lg:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-2"
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Frequently Asked Questions"), /*#__PURE__*/React.createElement(CardDescription, null, "Find quick answers to common questions")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement(Accordion, {
    type: "single",
    collapsible: true,
    className: "w-full"
  }, /*#__PURE__*/React.createElement(AccordionItem, {
    value: "item-1"
  }, /*#__PURE__*/React.createElement(AccordionTrigger, null, "How do I add a new inventory item?"), /*#__PURE__*/React.createElement(AccordionContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("p", null, "To add a new inventory item:"), /*#__PURE__*/React.createElement("ol", {
    className: "list-decimal list-inside space-y-1 text-sm text-slate-600"
  }, /*#__PURE__*/React.createElement("li", null, "Navigate to the Inventory module from the dashboard"), /*#__PURE__*/React.createElement("li", null, "Click the \"Add Item\" button in the top right corner"), /*#__PURE__*/React.createElement("li", null, "Fill in the item details (name, category, quantity)"), /*#__PURE__*/React.createElement("li", null, "Click \"Add Item\" to save")), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mt-2"
  }, "Note: Only Admin users can add new items to the inventory.")))), /*#__PURE__*/React.createElement(AccordionItem, {
    value: "item-2"
  }, /*#__PURE__*/React.createElement(AccordionTrigger, null, "How do I update stock levels?"), /*#__PURE__*/React.createElement(AccordionContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("p", null, "To update stock levels:"), /*#__PURE__*/React.createElement("ol", {
    className: "list-decimal list-inside space-y-1 text-sm text-slate-600"
  }, /*#__PURE__*/React.createElement("li", null, "Go to the Inventory module"), /*#__PURE__*/React.createElement("li", null, "Find the item you want to update"), /*#__PURE__*/React.createElement("li", null, "Click the up arrow (\u2191) for Stock In or down arrow (\u2193) for Stock Out"), /*#__PURE__*/React.createElement("li", null, "Enter the quantity and confirm")), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mt-2"
  }, "Stock levels are updated in real-time across all branches.")))), /*#__PURE__*/React.createElement(AccordionItem, {
    value: "item-3"
  }, /*#__PURE__*/React.createElement(AccordionTrigger, null, "How do I generate reports?"), /*#__PURE__*/React.createElement(AccordionContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("p", null, "To generate reports:"), /*#__PURE__*/React.createElement("ol", {
    className: "list-decimal list-inside space-y-1 text-sm text-slate-600"
  }, /*#__PURE__*/React.createElement("li", null, "Navigate to the Reports module"), /*#__PURE__*/React.createElement("li", null, "Select the report type (Inventory, Stock Movement, etc.)"), /*#__PURE__*/React.createElement("li", null, "Choose the time period (Daily, Weekly, Monthly)"), /*#__PURE__*/React.createElement("li", null, "Click \"Generate Report\""), /*#__PURE__*/React.createElement("li", null, "Optionally export the report as PDF"))))), /*#__PURE__*/React.createElement(AccordionItem, {
    value: "item-4"
  }, /*#__PURE__*/React.createElement(AccordionTrigger, null, "How do I reset my password?"), /*#__PURE__*/React.createElement(AccordionContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("p", null, "To reset your password:"), /*#__PURE__*/React.createElement("ol", {
    className: "list-decimal list-inside space-y-1 text-sm text-slate-600"
  }, /*#__PURE__*/React.createElement("li", null, "Click \"Forgot Password?\" on the login screen"), /*#__PURE__*/React.createElement("li", null, "Enter your username and registered email"), /*#__PURE__*/React.createElement("li", null, "Click \"Send Reset Link\""), /*#__PURE__*/React.createElement("li", null, "Check your email for the reset link"), /*#__PURE__*/React.createElement("li", null, "Follow the link to set a new password"))))), /*#__PURE__*/React.createElement(AccordionItem, {
    value: "item-5"
  }, /*#__PURE__*/React.createElement(AccordionTrigger, null, "What are the user roles and permissions?"), /*#__PURE__*/React.createElement(AccordionContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm"
  }, "Admin:"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-inside text-sm text-slate-600"
  }, /*#__PURE__*/React.createElement("li", null, "Full access to all modules"), /*#__PURE__*/React.createElement("li", null, "Can add, edit, and archive inventory items"), /*#__PURE__*/React.createElement("li", null, "Can manage users and approve registrations"), /*#__PURE__*/React.createElement("li", null, "Can perform system maintenance and backups"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm"
  }, "Employee:"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-inside text-sm text-slate-600"
  }, /*#__PURE__*/React.createElement("li", null, "Can view inventory and search products"), /*#__PURE__*/React.createElement("li", null, "Can update stock levels (Stock In/Out)"), /*#__PURE__*/React.createElement("li", null, "Can view reports"), /*#__PURE__*/React.createElement("li", null, "Limited access to system settings"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "text-sm"
  }, "Owner:"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc list-inside text-sm text-slate-600"
  }, /*#__PURE__*/React.createElement("li", null, "Can view all reports and analytics"), /*#__PURE__*/React.createElement("li", null, "Read-only access to inventory"), /*#__PURE__*/React.createElement("li", null, "Can export reports")))))), /*#__PURE__*/React.createElement(AccordionItem, {
    value: "item-6"
  }, /*#__PURE__*/React.createElement(AccordionTrigger, null, "How do I search for products?"), /*#__PURE__*/React.createElement(AccordionContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("p", null, "To search for products:"), /*#__PURE__*/React.createElement("ol", {
    className: "list-decimal list-inside space-y-1 text-sm text-slate-600"
  }, /*#__PURE__*/React.createElement("li", null, "Navigate to the Search module from the sidebar"), /*#__PURE__*/React.createElement("li", null, "Enter product name, ID, or description in the search field"), /*#__PURE__*/React.createElement("li", null, "Optionally filter by category and status"), /*#__PURE__*/React.createElement("li", null, "Click the \"Search\" button or press Enter"), /*#__PURE__*/React.createElement("li", null, "View detailed product information in the results")), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600 mt-2"
  }, "You can also search directly from the Inventory module using the search bar."))))))), /*#__PURE__*/React.createElement(Card, {
    className: "mt-6"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Step-by-Step Guides"), /*#__PURE__*/React.createElement(CardDescription, null, "Detailed tutorials for common tasks")), /*#__PURE__*/React.createElement(CardContent, null, /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "w-full justify-start"
  }, /*#__PURE__*/React.createElement(Book, {
    className: "w-4 h-4 mr-3"
  }), "Getting Started with the System"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "w-full justify-start"
  }, /*#__PURE__*/React.createElement(Book, {
    className: "w-4 h-4 mr-3"
  }), "Managing Inventory Items"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "w-full justify-start"
  }, /*#__PURE__*/React.createElement(Book, {
    className: "w-4 h-4 mr-3"
  }), "Generating and Exporting Reports"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "w-full justify-start"
  }, /*#__PURE__*/React.createElement(Book, {
    className: "w-4 h-4 mr-3"
  }), "Understanding Alerts and Notifications"))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "Contact Support"), /*#__PURE__*/React.createElement(CardDescription, null, "Get help from our support team")), /*#__PURE__*/React.createElement(CardContent, {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-5 bg-blue-50 rounded-lg border border-blue-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0"
  }, /*#__PURE__*/React.createElement(Mail, {
    className: "w-6 h-6 text-white"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0"
  }, /*#__PURE__*/React.createElement("p", {
    className: "mb-2"
  }, "Email Support"), /*#__PURE__*/React.createElement("a", {
    href: "mailto:support@emcayetano.com",
    className: "text-blue-600 hover:underline break-all"
  }, "support@emcayetano.com"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mt-2"
  }, "Response within 24 hours")))), /*#__PURE__*/React.createElement("div", {
    className: "p-5 bg-green-50 rounded-lg border border-green-200"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0"
  }, /*#__PURE__*/React.createElement(Phone, {
    className: "w-6 h-6 text-white"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 min-w-0"
  }, /*#__PURE__*/React.createElement("p", {
    className: "mb-2"
  }, "Phone Support"), /*#__PURE__*/React.createElement("a", {
    href: "tel:+63123456789",
    className: "text-green-600 hover:underline"
  }, "+63 123 456 789"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-slate-500 mt-2"
  }, "Mon-Fri, 9AM-5PM")))))), /*#__PURE__*/React.createElement(Card, {
    className: "mt-6"
  }, /*#__PURE__*/React.createElement(CardHeader, null, /*#__PURE__*/React.createElement(CardTitle, null, "System Information")), /*#__PURE__*/React.createElement(CardContent, {
    className: "space-y-2 text-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Version"), /*#__PURE__*/React.createElement("span", null, "v2.1.0")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "Last Updated"), /*#__PURE__*/React.createElement("span", null, "October 2025")), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-600"
  }, "License"), /*#__PURE__*/React.createElement("span", null, "Active")))))));
}

