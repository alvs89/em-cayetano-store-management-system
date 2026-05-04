import React from 'react';
import { useState } from "react";
import { ArchiveRestore, Search, Filter, Archive, CheckCircle, Info, ArrowUpDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";
import { formatDateTime } from "../utils/format";

const STATUS_PRIORITY = {
  "Out of Stock": 1,
  "Low Stock": 2,
  "In Stock": 3
};

export function ArchiveModule({
  user
}) {
  // Access shared inventories so this module can move items between active and archived lists.
  const {
    archivedInventory,
    restoreArchivedInventoryItem
  } = useData();
  // Local UI state for filtering, selection, and confirmation flow.
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [showUnarchiveDialog, setShowUnarchiveDialog] = useState(false);
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  // Build category list on the fly so dropdown reflects current archive contents.
  const categories = Array.from(new Set(archivedInventory.map(item => item.category)));

  // Apply search and category filters so users can quickly narrow archived items.
  const filteredArchive = archivedInventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.id.toLowerCase().includes(searchQuery.toLowerCase()) || item.originalInventoryId?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getArchiveId = item => item.originalInventoryId || item.id || "";
  const getArchiveDate = item => new Date(item.archivedAt || item.lastUpdated || 0).getTime();

  const sortedArchive = [...filteredArchive].sort((a, b) => {
    const direction = sortOrder === "asc" ? 1 : -1;
    switch (sortBy) {
      case "id":
        return getArchiveId(a).localeCompare(getArchiveId(b), undefined, { numeric: true }) * direction;
      case "name":
        return a.name.localeCompare(b.name) * direction;
      case "category":
        return a.category.localeCompare(b.category) * direction;
      case "quantity":
        return ((a.quantity ?? 0) - (b.quantity ?? 0)) * direction;
      case "status":
        return ((STATUS_PRIORITY[a.status] ?? 999) - (STATUS_PRIORITY[b.status] ?? 999)) * direction;
      case "date":
        return (getArchiveDate(a) - getArchiveDate(b)) * direction;
      default:
        return 0;
    }
  });

  const getDisplayedRangeLabel = column => {
    if (filteredArchive.length === 0) return "No items";
    if (column === "id") {
      const ids = filteredArchive.map(item => getArchiveId(item)).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (ids.length === 0) return "No IDs";
      return sortOrder === "asc" ? `${ids[0]}-${ids[ids.length - 1]}` : `${ids[ids.length - 1]}-${ids[0]}`;
    }
    if (column === "quantity") {
      const quantities = filteredArchive.map(item => Number(item.quantity ?? 0));
      const min = Math.min(...quantities);
      const max = Math.max(...quantities);
      return sortOrder === "asc" ? `${min}-${max}` : `${max}-${min}`;
    }
    return null;
  };

  const handleSort = column => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      return;
    }
    setSortBy(column);
    setSortOrder(column === "date" ? "desc" : "asc");
  };

  const renderSortButton = (column, label, align = "left") => /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => handleSort(column),
    className: `w-full px-0 hover:bg-transparent font-semibold ${align === "right" ? "justify-end text-right" : "justify-start text-left"}`
  }, /*#__PURE__*/React.createElement("span", {
    className: `flex w-full items-center gap-1 ${align === "right" ? "justify-end" : "justify-start"}`
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement(ArrowUpDown, {
    className: `h-4 w-4 shrink-0 transition-transform ${sortBy === column ? "opacity-100" : "opacity-45"} ${sortBy === column && sortOrder === "desc" ? "rotate-180" : ""}`,
    "aria-hidden": "true"
  })));

  const sortLabel = (() => {
    if (sortBy === "id") return "ID";
    if (sortBy === "date") return "Archived Date";
    return sortBy.charAt(0).toUpperCase() + sortBy.slice(1);
  })();
  const orderLabel = (() => {
    if (sortBy === "id") return sortOrder === "asc" ? "1–9" : "9–1";
    if (sortBy === "quantity") return sortOrder === "asc" ? "0–9" : "9–0";
    if (sortBy === "date") return sortOrder === "asc" ? "Old–New" : "New–Old";
    return sortOrder === "asc" ? "A–Z" : "Z–A";
  })();

  const realtimeOrderLabel = filteredArchive.length === 0 ? "No items" : sortBy === "id" || sortBy === "quantity" ? getDisplayedRangeLabel(sortBy) : orderLabel;

  // Restore a selected item back to active inventory after confirmation.
  const handleUnarchiveItem = async () => {
    if (!selectedItem) return;
    const itemToRestore = selectedItem;
    setShowUnarchiveDialog(false);
    setSelectedItem(null);
    try {
      await restoreArchivedInventoryItem(itemToRestore.id);
      toast.success(`${itemToRestore.name} restored successfully!`, {
        description: "Item returned to active inventory."
      });
    } catch (err) {
      toast.error("Failed to restore item", { description: err?.response?.data?.error || err.message });
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "archive-page min-h-screen bg-gray-50 p-4 md:p-8"
  }, /*#__PURE__*/React.createElement("style", null, `
    .archive-mobile-list {
      display: none;
    }

    @media (max-width: 760px) {
      .archive-page {
        padding: 14px;
      }

      .archive-search-card {
        margin-bottom: 16px;
      }

      .archive-search-card [data-archive-search-content] {
        padding: 16px;
        padding-top: 16px;
      }

      .archive-search-grid {
        gap: 12px;
      }

      .archive-search-field input,
      .archive-filter-trigger {
        min-height: 46px;
        border-radius: 12px;
        font-size: 14px;
      }

      .archive-list-card [data-archive-header] {
        padding: 16px 16px 0;
      }

      .archive-list-header {
        align-items: stretch;
        gap: 14px;
      }

      .archive-list-title {
        min-width: 0;
      }

      .archive-list-title [data-card-title] {
        font-size: 18px;
        line-height: 1.25;
      }

      .archive-list-title [data-card-description] {
        display: block;
        margin-top: 4px;
        font-size: 13px;
        line-height: 1.45;
      }

      .archive-list-title [data-card-description] span {
        display: block;
        margin-left: 0;
      }

      .archive-table-wrap {
        display: none;
      }

      .archive-mobile-list {
        display: grid;
        gap: 10px;
        padding: 0 16px 16px;
        margin-top: -36px;
      }

      .archive-mobile-sortbar {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        padding-bottom: 2px;
      }

      .archive-mobile-sort-button {
        min-height: 38px;
        width: 100%;
        min-width: 0;
        border-radius: 999px;
        padding: 0 10px;
        font-size: 12px;
        font-weight: 700;
        justify-content: center;
        border: 1px solid #dbe3ef;
        background: #ffffff;
        color: #334155;
        box-shadow: 0 4px 10px rgba(15, 23, 42, 0.04);
      }

      .archive-mobile-sort-button:hover {
        background: #f8fafc;
        color: #172033;
      }

      .archive-mobile-sort-button-active {
        border-color: #334155;
        background: #334155;
        color: #ffffff;
        box-shadow: 0 8px 16px rgba(15, 23, 42, 0.16);
      }

      .archive-mobile-sort-button-active:hover {
        background: #1f2937;
        color: #ffffff;
      }

      .archive-mobile-sort-icon {
        margin-left: 5px;
        height: 14px;
        width: 14px;
        flex-shrink: 0;
        opacity: 0.42;
        transform: translateY(0) rotate(0deg);
        transition: transform 180ms ease, opacity 180ms ease;
      }

      .archive-mobile-sort-button-active .archive-mobile-sort-icon {
        opacity: 1;
      }

      .archive-mobile-sort-button-active .archive-mobile-sort-icon-asc {
        transform: translateY(-2px) rotate(0deg);
        animation: archiveSortArrowAsc 220ms ease;
      }

      .archive-mobile-sort-button-active .archive-mobile-sort-icon-desc {
        transform: translateY(2px) rotate(180deg);
        animation: archiveSortArrowDesc 220ms ease;
      }

      @keyframes archiveSortArrowAsc {
        0% { transform: translateY(2px) rotate(180deg); }
        100% { transform: translateY(-2px) rotate(0deg); }
      }

      @keyframes archiveSortArrowDesc {
        0% { transform: translateY(-2px) rotate(0deg); }
        100% { transform: translateY(2px) rotate(180deg); }
      }

      .archive-mobile-card {
        min-width: 0;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        background: #ffffff;
        padding: 14px;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
      }

      .archive-mobile-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .archive-mobile-name {
        min-width: 0;
        overflow-wrap: anywhere;
        color: #0f172a;
        font-size: 15px;
        font-weight: 800;
        line-height: 1.35;
      }

      .archive-mobile-id {
        margin-top: 3px;
        color: #64748b;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 11px;
      }

      .archive-mobile-meta {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(84px, auto);
        gap: 10px;
        margin-top: 12px;
      }

      .archive-mobile-field {
        min-width: 0;
        border-radius: 12px;
        background: #f8fafc;
        padding: 10px;
      }

      .archive-mobile-label {
        display: block;
        color: #64748b;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .archive-mobile-value {
        display: block;
        margin-top: 3px;
        color: #172033;
        font-size: 13px;
        font-weight: 650;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }

      .archive-mobile-date {
        margin-top: 10px;
        color: #64748b;
        font-size: 12px;
        line-height: 1.4;
      }

      .archive-mobile-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .archive-mobile-actions button {
        min-height: 40px;
        flex: 1 1 132px;
        border-radius: 12px;
        padding: 0 12px;
        font-size: 13px;
      }

      .archive-mobile-empty {
        border: 1px dashed #cbd5e1;
        border-radius: 14px;
        background: #f8fafc;
        padding: 28px 16px;
        text-align: center;
      }

      .archive-dialog-content {
        width: calc(100vw - 24px) !important;
        max-width: 420px !important;
        max-height: none !important;
        overflow: visible !important;
        padding: 16px !important;
        border-radius: 14px !important;
        gap: 10px !important;
      }

      .archive-dialog-header {
        gap: 12px !important;
        padding-right: 24px !important;
      }

      .archive-dialog-header > div:first-child {
        width: 46px !important;
        height: 46px !important;
      }

      .archive-dialog-header svg {
        width: 22px !important;
        height: 22px !important;
      }

      .archive-dialog-header h2 {
        font-size: 20px !important;
        line-height: 1.15 !important;
      }

      .archive-dialog-header p {
        margin-top: 6px !important;
        font-size: 13px !important;
        line-height: 1.45 !important;
      }

      .archive-restore-item-card {
        padding: 12px !important;
      }

      .archive-restore-item-card > div {
        grid-template-columns: 46px minmax(0, 1fr) !important;
        gap: 12px !important;
      }

      .archive-restore-item-card > div > div:first-child {
        width: 46px !important;
        height: 46px !important;
        border-radius: 10px !important;
      }

      .archive-restore-item-card > div > div:first-child svg {
        width: 22px !important;
        height: 22px !important;
      }

      .archive-restore-item-name {
        font-size: 18px !important;
        overflow-wrap: anywhere;
      }

      .archive-restore-details-grid {
        grid-template-columns: 1fr !important;
        gap: 8px !important;
      }

      .archive-restore-details-grid > div[aria-hidden="true"] {
        display: none !important;
      }

      .archive-restore-detail-group {
        grid-template-columns: 70px minmax(0, 1fr) !important;
        row-gap: 6px !important;
      }

      .archive-restore-detail-group span {
        overflow-wrap: anywhere;
      }

      .archive-status-badge {
        flex-shrink: 0;
        font-size: 11px;
        line-height: 1.2;
        max-width: 100%;
        white-space: normal;
        text-align: center;
      }

      .archive-dialog-footer {
        flex-direction: column-reverse !important;
        gap: 8px !important;
      }

      .archive-dialog-footer button {
        width: 100% !important;
        min-width: 0 !important;
        height: 44px !important;
      }
    }

    @media (max-width: 420px) {
      .archive-page {
        padding: 12px;
      }

      .archive-list-header {
        flex-direction: column;
      }

      .archive-mobile-actions button {
        flex-basis: 100%;
      }

      .archive-mobile-sortbar {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `), /*#__PURE__*/React.createElement(PageHeader, {
    title: "Archive",
    subtitle: "Manage archived inventory items",
    icon: /*#__PURE__*/React.createElement(Archive, {
      className: "h-8 w-8"
    })
  }), /*#__PURE__*/React.createElement(Card, {
    className: "archive-search-card mb-6"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6",
    "data-archive-search-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "archive-search-grid flex flex-col md:flex-row gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "archive-search-field flex-1 relative"
  }, /*#__PURE__*/React.createElement(Search, {
    className: "absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400"
  }), /*#__PURE__*/React.createElement(Input, {
    // Text search across name or ID.
    className: "pl-10",
    placeholder: "Search by name or ID...",
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "w-full md:w-48"
  }, /*#__PURE__*/React.createElement(Select, {
    value: categoryFilter,
    onValueChange: value => setCategoryFilter(value)
    // Category dropdown to constrain results.
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "archive-filter-trigger"
  }, /*#__PURE__*/React.createElement(Filter, {
    className: "w-4 h-4 mr-2"
  }), /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "All Categories"
  })), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "all"
  }, "All Categories"), categories.map(cat => /*#__PURE__*/React.createElement(SelectItem, {
    key: cat,
    value: cat
  }, cat)))))))), /*#__PURE__*/React.createElement(Card, {
    className: "archive-list-card"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    "data-archive-header": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "archive-list-header flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", {
    className: "archive-list-title"
  }, /*#__PURE__*/React.createElement(CardTitle, null, "Archived Items"), /*#__PURE__*/React.createElement(CardDescription, null, sortedArchive.length, " ", sortedArchive.length === 1 ? 'item' : 'items', " archived", sortBy && /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500 ml-2"
  }, "\u2022 Sorted by ", sortLabel, " (", realtimeOrderLabel, ")"))))), /*#__PURE__*/React.createElement(CardContent, {
    className: "p-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "archive-table-wrap px-6 pb-6"
  }, /*#__PURE__*/React.createElement(Table, null, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, null, renderSortButton("id", "ID")), /*#__PURE__*/React.createElement(TableHead, null, renderSortButton("name", "Item Name")), /*#__PURE__*/React.createElement(TableHead, null, renderSortButton("category", "Category")), /*#__PURE__*/React.createElement(TableHead, {
    className: "text-right"
  }, renderSortButton("quantity", "Quantity", "right")), /*#__PURE__*/React.createElement(TableHead, null, renderSortButton("status", "Status")), /*#__PURE__*/React.createElement(TableHead, {
    className: "text-right"
  }, renderSortButton("date", "Archived Date", "right")), user.role === "Admin" && /*#__PURE__*/React.createElement(TableHead, null, "Actions"))), /*#__PURE__*/React.createElement(TableBody, null, sortedArchive.length === 0 ? /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableCell, {
    colSpan: user.role === "Admin" ? 7 : 6,
    className: "py-12 text-center"
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "mx-auto mb-4 h-14 w-14 text-slate-300"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "mb-2 font-semibold text-slate-700"
  }, archivedInventory.length === 0 ? "No Archived Items" : "No Archived Items Found"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-500"
  }, archivedInventory.length === 0 ? "Items archived from inventory will appear here." : "Try adjusting your search or category filter."))) : sortedArchive.map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm"
  }, item.originalInventoryId || item.id), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.category), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-right"
  }, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: item.status === "In Stock" ? "bg-green-100 text-green-700" : item.status === "Low Stock" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-right text-sm text-slate-600"
  }, formatDateTime(item.archivedAt || item.lastUpdated)), user.role === "Admin" && /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    className: "border-green-400 bg-green-50 text-green-800 hover:bg-green-100 hover:border-green-500 hover:text-green-950 transition-colors",
    title: "Restore to Inventory",
    onClick: () => {
      setSelectedItem(item);
      setShowUnarchiveDialog(true);
    }
  }, /*#__PURE__*/React.createElement(ArchiveRestore, {
    className: "w-4 h-4 mr-2"
  }), "Restore")))))))), /*#__PURE__*/React.createElement("div", {
    className: "archive-mobile-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "archive-mobile-sortbar",
    "aria-label": "Sort archived items"
  }, [["id", "ID"], ["name", "Name"], ["category", "Category"], ["quantity", "Qty"], ["status", "Status"], ["date", "Archived"]].map(([column, label]) => /*#__PURE__*/React.createElement(Button, {
    key: column,
    type: "button",
    variant: "outline",
    "aria-pressed": sortBy === column,
    "aria-label": `Sort by ${label}${sortBy === column ? `, currently ${sortOrder === "asc" ? "ascending" : "descending"}` : ""}`,
    className: `archive-mobile-sort-button ${sortBy === column ? "archive-mobile-sort-button-active" : ""}`,
    onClick: () => handleSort(column)
  }, label, /*#__PURE__*/React.createElement(ArrowUpDown, {
    className: `archive-mobile-sort-icon ${sortBy === column ? `archive-mobile-sort-icon-${sortOrder}` : ""}`,
    "aria-hidden": "true"
  })))), sortedArchive.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "archive-mobile-empty"
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "mx-auto mb-3 h-12 w-12 text-slate-300"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "mb-2 font-semibold text-slate-700"
  }, archivedInventory.length === 0 ? "No Archived Items" : "No Archived Items Found"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-500"
  }, archivedInventory.length === 0 ? "Items archived from inventory will appear here." : "Try adjusting your search or category filter.")) : sortedArchive.map(item => /*#__PURE__*/React.createElement("article", {
    key: item.id,
    className: "archive-mobile-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "archive-mobile-card-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "min-w-0"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "archive-mobile-name"
  }, item.name), /*#__PURE__*/React.createElement("p", {
    className: "archive-mobile-id"
  }, "ID: ", item.originalInventoryId || item.id)), /*#__PURE__*/React.createElement(Badge, {
    className: `archive-status-badge ${item.status === "In Stock" ? "bg-green-100 text-green-700" : item.status === "Low Stock" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`
  }, item.status)), /*#__PURE__*/React.createElement("div", {
    className: "archive-mobile-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "archive-mobile-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "archive-mobile-label"
  }, "Category"), /*#__PURE__*/React.createElement("span", {
    className: "archive-mobile-value"
  }, item.category || "Uncategorized")), /*#__PURE__*/React.createElement("div", {
    className: "archive-mobile-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "archive-mobile-label"
  }, "Quantity"), /*#__PURE__*/React.createElement("span", {
    className: "archive-mobile-value"
  }, item.quantity, " ", item.quantity === 1 ? "unit" : "units"))), /*#__PURE__*/React.createElement("p", {
    className: "archive-mobile-date"
  }, "Archived Date: ", formatDateTime(item.archivedAt || item.lastUpdated)), user.role === "Admin" && /*#__PURE__*/React.createElement("div", {
    className: "archive-mobile-actions"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "border-green-400 bg-green-50 text-green-800 hover:bg-green-100 hover:border-green-500 hover:text-green-950",
    title: "Restore to Inventory",
    onClick: () => {
      setSelectedItem(item);
      setShowUnarchiveDialog(true);
    }
  }, /*#__PURE__*/React.createElement(ArchiveRestore, {
    className: "mr-2 h-4 w-4"
  }), "Restore")))))), /*#__PURE__*/React.createElement(Dialog, {
    open: showUnarchiveDialog,
    onOpenChange: open => {
      setShowUnarchiveDialog(open);
      if (!open) {
        setSelectedItem(null);
      }
    }
  }, /*#__PURE__*/React.createElement(DialogContent, {
    className: "archive-dialog-content border border-slate-200 bg-white shadow-2xl",
    style: {
      width: "min(560px, calc(100vw - 32px))",
      maxWidth: "560px",
      padding: "22px",
      borderRadius: "14px",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(DialogHeader, {
    className: "archive-dialog-header space-y-0 text-left",
    style: {
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: "16px",
      paddingRight: "28px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "shrink-0",
    style: {
      width: "58px",
      height: "58px",
      borderRadius: "999px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #ECFDF3 0%, #DCFCE7 100%)",
      boxShadow: "inset 0 1px 8px rgba(22, 163, 74, 0.1)"
    }
  }, /*#__PURE__*/React.createElement(ArchiveRestore, {
    className: "text-green-700",
    style: {
      width: "28px",
      height: "28px"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "pt-2"
  }, /*#__PURE__*/React.createElement(DialogTitle, {
    className: "font-bold tracking-tight text-slate-950",
    style: {
      fontSize: "26px",
      lineHeight: "1.1"
    }
  }, "Restore Item"), /*#__PURE__*/React.createElement(DialogDescription, {
    className: "mt-3 leading-relaxed text-slate-600",
    style: {
      fontSize: "14px"
    }
  }, "Return this archived product to active inventory."))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center text-green-950",
    style: {
      gap: "12px",
      border: "1px solid #BBF7D0",
      background: "#F0FDF4",
      borderRadius: "10px",
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement(CheckCircle, {
    className: "shrink-0 text-green-600",
    style: {
      width: "18px",
      height: "18px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px"
    }
  }, "This item will be moved back to the active inventory list.")), /*#__PURE__*/React.createElement("div", {
    className: "archive-restore-item-card bg-white shadow-sm",
    style: {
      border: "1px solid #E2E8F0",
      borderRadius: "12px",
      padding: "16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "archive-restore-detail-group",
    style: {
      display: "grid",
      gridTemplateColumns: "58px 1fr",
      alignItems: "center",
      gap: "18px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "shrink-0",
    style: {
      width: "58px",
      height: "58px",
      borderRadius: "12px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid #BBF7D0",
      background: "#F0FDF4",
      boxShadow: "inset 0 1px 8px rgba(22, 163, 74, 0.08)"
    }
  }, /*#__PURE__*/React.createElement(ArchiveRestore, {
    className: "text-green-700",
    style: {
      width: "28px",
      height: "28px"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "min-w-0 flex-1"
  }, /*#__PURE__*/React.createElement("p", {
    className: "archive-restore-item-name truncate font-bold text-slate-950",
    style: {
      marginBottom: "12px",
      fontSize: "21px",
      lineHeight: "1.15"
    }
  }, selectedItem?.name), /*#__PURE__*/React.createElement("div", {
    className: "archive-restore-details-grid text-slate-700",
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1px 1fr",
      alignItems: "start",
      columnGap: "20px",
      fontSize: "13px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "70px 1fr",
      columnGap: "10px",
      rowGap: "10px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-600"
  }, "ID:"), /*#__PURE__*/React.createElement("span", {
    className: "font-medium text-slate-950"
  }, selectedItem?.originalInventoryId || selectedItem?.id), /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-600"
  }, "Category:"), /*#__PURE__*/React.createElement("span", {
    className: "font-medium text-slate-950"
  }, selectedItem?.category)), /*#__PURE__*/React.createElement("div", {
    "aria-hidden": "true",
    style: {
      width: "1px",
      minHeight: "50px",
      background: "#E2E8F0"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "archive-restore-detail-group",
    style: {
      display: "grid",
      gridTemplateColumns: "70px 1fr",
      columnGap: "10px",
      rowGap: "10px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-600"
  }, "Quantity:"), /*#__PURE__*/React.createElement("span", {
    className: "font-medium text-slate-950"
  }, selectedItem?.quantity ?? 0), /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-600"
  }, "Status:"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Badge, {
    className: `archive-status-badge ${selectedItem?.status === "In Stock" ? "bg-green-100 text-green-700" : selectedItem?.status === "Low Stock" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`
  }, selectedItem?.status))))))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center text-slate-800",
    style: {
      gap: "12px",
      border: "1px solid #BFDBFE",
      background: "#EFF6FF",
      borderRadius: "10px",
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement(Info, {
    className: "shrink-0 text-blue-600",
    style: {
      width: "18px",
      height: "18px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px"
    }
  }, "Restored items will appear again in the active inventory page for your branch.")), /*#__PURE__*/React.createElement(DialogFooter, {
    className: "archive-dialog-footer pt-2",
    style: {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: "10px"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "border-slate-200 bg-white text-slate-950 hover:bg-slate-50",
    style: {
      height: "38px",
      minWidth: "88px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px"
    },
    onClick: () => {
      setShowUnarchiveDialog(false);
      setSelectedItem(null);
    }
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    onClick: handleUnarchiveItem,
    className: "font-semibold shadow-lg transition-transform duration-150 active:scale-95",
    style: {
      height: "38px",
      minWidth: "132px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px",
      background: "#16A34A",
      color: "#FFFFFF",
      boxShadow: "0 14px 24px rgba(22, 163, 74, 0.18)"
    }
  }, /*#__PURE__*/React.createElement(ArchiveRestore, {
    className: "mr-2",
    style: {
      width: "16px",
      height: "16px"
    }
  }), "Restore Item")))));
}
