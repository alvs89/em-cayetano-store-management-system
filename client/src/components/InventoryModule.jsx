import React from 'react';
import { useState } from "react";
import { Plus, Minus, Archive, Search, Filter, ArrowUpDown, AlertTriangle, Info, PackagePlus, PackageMinus, CheckCircle, Box } from "lucide-react";
import { linearSearch, linearSearchAll, mergeSort } from "../utils/algorithms";
import { formatDateTime } from "../utils/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "./ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { useData } from "./DataContext";
import { PageHeader } from "./PageHeader";

const OFFICIAL_INVENTORY_CATEGORIES = [
  "Tools",
  "Paint",
  "Cement",
  "Construction",
  "Electrical",
  "Plumbing",
  "Hardware",
  "Fasteners",
  "Lumber",
  "Safety",
  "Other"
];

const CATEGORY_ALIASES = {
  tool: "Tools",
  tools: "Tools",
  tooling: "Tools",
  paint: "Paint",
  paints: "Paint",
  cement: "Cement",
  cements: "Cement",
  construction: "Construction",
  electrical: "Electrical",
  electric: "Electrical",
  plumbing: "Plumbing",
  plumber: "Plumbing",
  hardware: "Hardware",
  fastener: "Fasteners",
  fasteners: "Fasteners",
  screw: "Fasteners",
  screws: "Fasteners",
  nail: "Fasteners",
  nails: "Fasteners",
  lumber: "Lumber",
  wood: "Lumber",
  safety: "Safety",
  misc: "Other",
  miscellaneous: "Other",
  other: "Other"
};

const normalizeDuplicateKeyPart = value => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizeCategory = value => {
  const normalized = normalizeDuplicateKeyPart(value);
  if (!normalized) return "";
  return CATEGORY_ALIASES[normalized] || normalized.replace(/\b\w/g, char => char.toUpperCase());
};
const STATUS_PRIORITY = {
  "Out of Stock": 1,
  "Low Stock": 2,
  "In Stock": 3
};

const formatUnitQuantity = quantity => `${quantity} ${Number(quantity) === 1 ? "unit" : "units"}`;

export function InventoryModule({
  user,
  onNavigate
}) {
  const {
    inventory,
    addInventoryItem,
    updateInventoryItem,
    archiveInventoryItem,
    restoreArchivedInventoryItem,
    archivedInventory,
  } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isStockInDialogOpen, setIsStockInDialogOpen] = useState(false);
  const [isStockOutDialogOpen, setIsStockOutDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [stockAmount, setStockAmount] = useState("");
  const [discardPrompt, setDiscardPrompt] = useState(null);
  const [archivedDuplicatePrompt, setArchivedDuplicatePrompt] = useState(null);
  const [isRestoringArchivedDuplicate, setIsRestoringArchivedDuplicate] = useState(false);

  // 🔄 Sorting state: track which column and direction to sort
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const categories = OFFICIAL_INVENTORY_CATEGORIES;
  const currentBranch = normalizeDuplicateKeyPart(user?.branch);
  const buildDuplicateKey = item => [
    normalizeDuplicateKeyPart(item.name),
    normalizeDuplicateKeyPart(normalizeCategory(item.category)),
    normalizeDuplicateKeyPart(item.branch || user?.branch)
  ].join("|");
  const [newItem, setNewItem] = useState({
    name: "",
    category: "",
    quantity: "",
    reorderLevel: "10" // Default reorder level
  });

  // 🔍 Filtered inventory using Linear Search Algorithm
  // Linear Search: O(n) - iterates through each item sequentially
  // Used here because we're filtering with multiple criteria (search + category)
  const filteredInventory = linearSearchAll(inventory, item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || normalizeCategory(item.category) === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getInventoryId = item => item.id || "";
  const getInventoryDate = item => new Date(item.lastUpdated || 0).getTime();

  // 📊 Sorted inventory using Merge Sort Algorithm
  // Merge Sort: O(n log n) - efficient sorting for any data size
  // Applied after filtering to maintain search/filter results
  const sortedInventory = (() => {
    const direction = sortOrder === 'asc' ? 1 : -1;
    switch (sortBy) {
      case 'id':
        return mergeSort(filteredInventory, (a, b) => getInventoryId(a).localeCompare(getInventoryId(b), undefined, { numeric: true }) * direction);
      case 'name':
        return mergeSort(filteredInventory, (a, b) => a.name.localeCompare(b.name) * direction);
      case 'category':
        return mergeSort(filteredInventory, (a, b) => normalizeCategory(a.category).localeCompare(normalizeCategory(b.category)) * direction);
      case 'quantity':
        return mergeSort(filteredInventory, (a, b) => ((a.quantity ?? 0) - (b.quantity ?? 0)) * direction);
      case 'status':
        return mergeSort(filteredInventory, (a, b) => ((STATUS_PRIORITY[a.status] ?? 999) - (STATUS_PRIORITY[b.status] ?? 999)) * direction);
      case 'date':
        return mergeSort(filteredInventory, (a, b) => (getInventoryDate(a) - getInventoryDate(b)) * direction);
      default:
        return filteredInventory;
    }
  })();

  // 🔀 Handle column header click to change sort
  const getDisplayedRangeLabel = column => {
    if (filteredInventory.length === 0) return "No items";
    if (column === 'id') {
      const ids = filteredInventory.map(item => getInventoryId(item)).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (ids.length === 0) return "No IDs";
      return sortOrder === 'asc' ? `${ids[0]}-${ids[ids.length - 1]}` : `${ids[ids.length - 1]}-${ids[0]}`;
    }
    if (column === 'quantity') {
      const quantities = filteredInventory.map(item => Number(item.quantity ?? 0));
      const min = Math.min(...quantities);
      const max = Math.max(...quantities);
      return sortOrder === 'asc' ? `${min}-${max}` : `${max}-${min}`;
    }
    return null;
  };

  const handleSort = column => {
    if (sortBy === column) {
      // Toggle sort order if clicking the same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Match archive sorting: dates default to newest first, other columns ascend first.
      setSortBy(column);
      setSortOrder(column === 'date' ? 'desc' : 'asc');
    }
  };

  // ➕ Add Item
  const renderSortButton = (column, label, align = 'left') => /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => handleSort(column),
    className: `w-full px-0 hover:bg-transparent font-semibold ${align === 'right' ? 'justify-end text-right' : 'justify-start text-left'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: `flex w-full items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement(ArrowUpDown, {
    className: `h-4 w-4 shrink-0 transition-transform ${sortBy === column ? 'opacity-100' : 'opacity-45'} ${sortBy === column && sortOrder === 'desc' ? 'rotate-180' : ''}`,
    "aria-hidden": "true"
  })));

  const resetStockForm = () => {
    setStockAmount("");
  };

  const resetAddItemForm = () => {
    setNewItem({
      name: "",
      category: "",
      quantity: "",
      reorderLevel: "10"
    });
    setArchivedDuplicatePrompt(null);
  };

  const hasAddItemChanges = () => {
    return newItem.name.trim() !== "" || newItem.category.trim() !== "" || newItem.quantity !== "" || newItem.reorderLevel !== "10";
  };

  const hasStockFormChanges = () => {
    return stockAmount !== "";
  };

  const closeAddItemDialog = () => {
    setIsAddDialogOpen(false);
    resetAddItemForm();
  };

  const closeStockInDialog = () => {
    setIsStockInDialogOpen(false);
    setSelectedItem(null);
    resetStockForm();
  };

  const requestCloseAddItemDialog = () => {
    if (hasAddItemChanges()) {
      setDiscardPrompt("addItem");
      return;
    }
    closeAddItemDialog();
  };

  const requestCloseStockInDialog = () => {
    if (hasStockFormChanges()) {
      setDiscardPrompt("stockIn");
      return;
    }
    closeStockInDialog();
  };

  const requestCloseStockOutDialog = () => {
    if (hasStockFormChanges()) {
      setDiscardPrompt("stockOut");
      return;
    }
    closeStockOutDialog();
  };

  const discardDialogCopy = {
    addItem: {
      title: "Discard new item?",
      description: "You have unsaved item details. Closing this form will remove the information you entered."
    },
    stockIn: {
      title: "Discard stock-in entry?",
      description: "You have entered a stock-in quantity. Closing this form will clear the quantity and keep the inventory unchanged."
    },
    stockOut: {
      title: "Discard stock-out entry?",
      description: "You have entered a stock-out quantity. Closing this form will clear the quantity and keep the inventory unchanged."
    }
  };

  const confirmDiscardChanges = () => {
    const prompt = discardPrompt;
    setDiscardPrompt(null);
    if (prompt === "addItem") {
      closeAddItemDialog();
      return;
    }
    if (prompt === "stockIn") {
      closeStockInDialog();
      return;
    }
    if (prompt === "stockOut") {
      closeStockOutDialog();
    }
  };

  const closeStockOutDialog = () => {
    setIsStockOutDialogOpen(false);
    setSelectedItem(null);
    resetStockForm();
  };
  
  // Human-friendly sort labels depending on column type
  const sortLabel = (() => {
    if (sortBy === 'id') return 'ID';
    if (sortBy === 'date') return 'Last Updated';
    return sortBy.charAt(0).toUpperCase() + sortBy.slice(1);
  })();
  const orderLabel = (() => {
    if (sortBy === 'id' || sortBy === 'quantity') return sortOrder === 'asc' ? '1–9' : '9–1';
    if (sortBy === 'date') return sortOrder === 'asc' ? 'Old–New' : 'New–Old';
    return sortOrder === 'asc' ? 'A–Z' : 'Z–A';
  })();

  const displayOrderLabel = (() => {
    if (sortBy === 'id') return sortOrder === 'asc' ? '1–9' : '9–1';
    if (sortBy === 'quantity') return sortOrder === 'asc' ? '0–9' : '9–0';
    if (sortBy === 'date') return sortOrder === 'asc' ? 'Old–New' : 'New–Old';
    return sortOrder === 'asc' ? 'A–Z' : 'Z–A';
  })();

  const realtimeDisplayOrderLabel = filteredInventory.length === 0 ? "No items" : sortBy === 'id' || sortBy === 'quantity' ? getDisplayedRangeLabel(sortBy) : displayOrderLabel;

  const restoreArchivedDuplicate = async archivedItem => {
    if (!archivedItem || isRestoringArchivedDuplicate) return;
    setIsRestoringArchivedDuplicate(true);
    try {
      await restoreArchivedInventoryItem(archivedItem.id);
      closeAddItemDialog();
      toast.success(`${archivedItem.name} restored successfully!`, {
        description: "Item returned to active inventory."
      });
    } catch (err) {
      toast.error("Failed to restore item", { description: err?.response?.data?.error || err.message });
    } finally {
      setIsRestoringArchivedDuplicate(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.category || !newItem.quantity || !newItem.reorderLevel) {
      toast.error("Please fill in all fields before adding an item.");
      return;
    }
    const quantity = parseInt(newItem.quantity);
    const reorderLevel = parseInt(newItem.reorderLevel);
    if (isNaN(quantity) || quantity < 0) {
      toast.error("Please enter a valid quantity.");
      return;
    }
    if (isNaN(reorderLevel) || reorderLevel < 0 || reorderLevel > 20) {
      toast.error("Reorder Level must be between 0 and 20.");
      return;
    }
    const newItemDuplicateKey = [
      normalizeDuplicateKeyPart(newItem.name),
      normalizeDuplicateKeyPart(normalizeCategory(newItem.category)),
      currentBranch
    ].join("|");

    // Check for duplicate active item by normalized name + category + branch.
    const existingItem = linearSearch(inventory, item => buildDuplicateKey(item) === newItemDuplicateKey);
    if (existingItem) {
      toast.error("Item already exists!", {
        description: `"${newItem.name}" in category "${newItem.category}" is already in inventory (ID: ${existingItem.id}). Use Stock In to add more units.`
      });

      return;
    }

    const archivedDuplicate = linearSearch(archivedInventory, item => buildDuplicateKey(item) === newItemDuplicateKey);
    if (archivedDuplicate) {
      setArchivedDuplicatePrompt(archivedDuplicate);
      return;
    }
    setArchivedDuplicatePrompt(null);
    try {
      await addInventoryItem({
        name: newItem.name,
        category: normalizeCategory(newItem.category),
        quantity,
        reorderLevel
      });
      setIsAddDialogOpen(false);
      setNewItem({ name: "", category: "", quantity: "", reorderLevel: "10" });
      if (quantity === 0) {
        toast.error(`${newItem.name} added but OUT OF STOCK!`, { description: 'Item needs immediate stocking' });
      } else if (quantity <= reorderLevel) {
        toast.warning(`${newItem.name} added but LOW ON STOCK!`, { description: `Only ${formatUnitQuantity(quantity)} - Consider restocking soon` });
      } else {
        toast.success(`${newItem.name} added successfully!`, { description: `Initial stock: ${formatUnitQuantity(quantity)}` });
      }
    } catch (err) {
      toast.error("Failed to add item", { description: err?.response?.data?.error || err.message });
    }
  };

  // 📦 Stock In
  const handleStockIn = async () => {
    if (!selectedItem || !stockAmount) {
      toast.error("Please enter a valid amount first.");
      return;
    }
    const amount = parseInt(stockAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid stock quantity.");
      return;
    }
    try {
      await updateInventoryItem(selectedItem.id, {
        ...selectedItem,
        quantity: selectedItem.quantity + amount,
        movementAction: 'stock_in',
        movementQuantity: amount,
        movementNote: `Stock In recorded from inventory module.`
      });
      setIsStockInDialogOpen(false);
      setStockAmount("");
      toast.success(`Added ${formatUnitQuantity(amount)} to ${selectedItem.name}`, {
        description: `New stock level: ${formatUnitQuantity(selectedItem.quantity + amount)}`
      });
      setSelectedItem(null);
    } catch (err) {
      toast.error("Failed to stock in", { description: err?.response?.data?.error || err.message });
    }
  };

  // 📉 Stock Out
  const handleStockOut = async () => {
    if (!selectedItem || !stockAmount) {
      toast.error("Please enter a valid amount first.");
      return;
    }
    const amount = parseInt(stockAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid stock quantity.");
      return;
    }
    if (amount > selectedItem.quantity) {
      toast.error("Insufficient stock.");
      return;
    }
    try {
      const newQuantity = selectedItem.quantity - amount;
      await updateInventoryItem(selectedItem.id, {
        ...selectedItem,
        quantity: newQuantity,
        movementAction: 'stock_out',
        movementQuantity: amount,
        movementNote: `Stock Out recorded from inventory module.`
      });
      setIsStockOutDialogOpen(false);
      setStockAmount("");
      if (newQuantity === 0) {
        toast.error(`${selectedItem.name} is now OUT OF STOCK!`, { description: `Removed ${formatUnitQuantity(amount)} - Immediate restocking required` });
      } else if (newQuantity <= selectedItem.reorderLevel) {
        toast.warning(`${selectedItem.name} is now LOW ON STOCK!`, { description: `Removed ${formatUnitQuantity(amount)} - Only ${formatUnitQuantity(newQuantity)} remaining` });
      } else {
        toast.success(`Removed ${formatUnitQuantity(amount)} from ${selectedItem.name}`, { description: `Remaining stock: ${formatUnitQuantity(newQuantity)}` });
      }
      setSelectedItem(null);
    } catch (err) {
      toast.error("Failed to stock out", { description: err?.response?.data?.error || err.message });
    }
  };

  // Archive Item
  const handleArchiveItem = async () => {
    if (!selectedItem) return;
    const itemToArchive = selectedItem;
    setIsArchiveDialogOpen(false);
    setSelectedItem(null);
    try {
      await archiveInventoryItem(itemToArchive.id);
      toast.success(`${itemToArchive.name} archived successfully!`, {
        description: 'Item moved to archive. View in Archive page.'
      });
    } catch (err) {
      toast.error("Failed to archive item", { description: err?.response?.data?.error || err.message });
    }
  };
  const getStatusBadgeClass = status => status === "In Stock" ? "bg-green-100 text-green-700" : status === "Low Stock" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700";
  return /*#__PURE__*/React.createElement("div", {
    className: "inventory-page min-h-screen bg-gray-50 p-4 md:p-8"
  }, /*#__PURE__*/React.createElement("style", null, `
    .inventory-mobile-list {
      display: none;
    }

    @media (max-width: 760px) {
      .inventory-page {
        padding: 14px;
      }

      .inventory-page .rounded-2xl,
      .inventory-page [class*="rounded-2xl"] {
        border-radius: 18px;
      }

      .inventory-search-card {
        margin-bottom: 16px;
      }

      .inventory-search-card [data-inventory-search-content] {
        padding: 16px;
        padding-top: 16px;
      }

      .inventory-search-grid {
        gap: 12px;
      }

      .inventory-search-field input,
      .inventory-filter-trigger {
        min-height: 46px;
        border-radius: 12px;
        font-size: 14px;
      }

      .inventory-list-card [data-inventory-header] {
        padding: 16px 16px 0;
      }

      .inventory-list-header {
        align-items: stretch;
        gap: 14px;
      }

      .inventory-list-title {
        min-width: 0;
      }

      .inventory-list-title [data-card-title] {
        font-size: 18px;
        line-height: 1.25;
      }

      .inventory-list-title [data-card-description] {
        display: block;
        margin-top: 4px;
        font-size: 13px;
        line-height: 1.45;
      }

      .inventory-list-title [data-card-description] span {
        display: block;
        margin-left: 0;
      }

      .inventory-add-button {
        min-height: 44px;
        justify-content: center;
        border-radius: 12px;
      }

      .inventory-table-wrap {
        display: none;
      }

      .inventory-mobile-list {
        display: grid;
        gap: 10px;
        padding: 0 16px 16px;
        margin-top: -36px;
      }

      .inventory-mobile-sortbar {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        padding-bottom: 2px;
      }

      .inventory-mobile-sort-button {
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

      .inventory-mobile-sort-button:hover {
        background: #f8fafc;
        color: #172033;
      }

      .inventory-mobile-sort-button-active {
        border-color: #334155;
        background: #334155;
        color: #ffffff;
        box-shadow: 0 8px 16px rgba(15, 23, 42, 0.16);
      }

      .inventory-mobile-sort-button-active:hover {
        background: #1f2937;
        color: #ffffff;
      }

      .inventory-mobile-sort-icon {
        margin-left: 5px;
        height: 14px;
        width: 14px;
        flex-shrink: 0;
        opacity: 0.42;
        transform: translateY(0) rotate(0deg);
        transition: transform 180ms ease, opacity 180ms ease;
      }

      .inventory-mobile-sort-button-active .inventory-mobile-sort-icon {
        opacity: 1;
      }

      .inventory-mobile-sort-button-active .inventory-mobile-sort-icon-asc {
        transform: translateY(-2px) rotate(0deg);
        animation: inventorySortArrowAsc 220ms ease;
      }

      .inventory-mobile-sort-button-active .inventory-mobile-sort-icon-desc {
        transform: translateY(2px) rotate(180deg);
        animation: inventorySortArrowDesc 220ms ease;
      }

      @keyframes inventorySortArrowAsc {
        0% { transform: translateY(2px) rotate(180deg); }
        100% { transform: translateY(-2px) rotate(0deg); }
      }

      @keyframes inventorySortArrowDesc {
        0% { transform: translateY(-2px) rotate(0deg); }
        100% { transform: translateY(2px) rotate(180deg); }
      }

      .inventory-mobile-card {
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        background: #ffffff;
        padding: 14px;
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
        min-width: 0;
      }

      .inventory-mobile-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .inventory-mobile-name {
        min-width: 0;
        overflow-wrap: anywhere;
        color: #0f172a;
        font-size: 15px;
        font-weight: 800;
        line-height: 1.35;
      }

      .inventory-mobile-id {
        margin-top: 3px;
        color: #64748b;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 11px;
      }

      .inventory-status-badge {
        flex-shrink: 0;
        max-width: 112px;
        white-space: normal;
        text-align: center;
        font-size: 11px;
        line-height: 1.2;
      }

      .inventory-mobile-meta {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(84px, auto);
        gap: 10px;
        margin-top: 12px;
      }

      .inventory-mobile-field {
        min-width: 0;
        border-radius: 12px;
        background: #f8fafc;
        padding: 10px;
      }

      .inventory-mobile-label {
        display: block;
        color: #64748b;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .inventory-mobile-value {
        display: block;
        margin-top: 3px;
        color: #172033;
        font-size: 13px;
        font-weight: 650;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }

      .inventory-mobile-date {
        margin-top: 10px;
        color: #64748b;
        font-size: 12px;
        line-height: 1.4;
      }

      .inventory-mobile-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .inventory-mobile-actions button {
        min-height: 40px;
        flex: 1 1 112px;
        border-radius: 12px;
        padding: 0 12px;
        font-size: 13px;
      }

      .inventory-mobile-empty {
        border: 1px dashed #cbd5e1;
        border-radius: 14px;
        background: #f8fafc;
        padding: 28px 16px;
        text-align: center;
      }

      .inventory-dialog-content,
      .inventory-alert-dialog-content {
        width: calc(100vw - 24px) !important;
        max-width: 420px !important;
        max-height: none !important;
        overflow: visible !important;
        padding: 16px !important;
        border-radius: 14px !important;
        gap: 10px !important;
      }

      .inventory-dialog-header {
        gap: 12px !important;
        padding-right: 24px !important;
      }

      .inventory-dialog-header > div:first-child {
        width: 46px !important;
        height: 46px !important;
      }

      .inventory-dialog-header svg {
        width: 22px !important;
        height: 22px !important;
      }

      .inventory-dialog-header h2 {
        font-size: 20px !important;
        line-height: 1.15 !important;
      }

      .inventory-dialog-header p {
        margin-top: 6px !important;
        font-size: 13px !important;
        line-height: 1.45 !important;
      }

      .inventory-dialog-content input,
      .inventory-dialog-content [role="combobox"] {
        min-height: 42px !important;
      }

      .inventory-dialog-footer,
      .inventory-alert-dialog-footer {
        flex-direction: column-reverse !important;
        gap: 8px !important;
      }

      .inventory-dialog-footer button,
      .inventory-alert-dialog-footer button {
        width: 100% !important;
        min-width: 0 !important;
        height: 44px !important;
      }

      .inventory-archive-item-card > div {
        grid-template-columns: 46px minmax(0, 1fr) !important;
        gap: 12px !important;
      }

      .inventory-archive-item-card {
        padding: 12px !important;
      }

      .inventory-archive-item-card > div > div:first-child {
        width: 46px !important;
        height: 46px !important;
        border-radius: 10px !important;
      }

      .inventory-archive-item-card > div > div:first-child svg {
        width: 22px !important;
        height: 22px !important;
      }

      .inventory-archive-item-name {
        font-size: 18px !important;
        overflow-wrap: anywhere;
      }

      .inventory-archive-details-grid {
        grid-template-columns: 1fr !important;
        gap: 8px !important;
      }

      .inventory-archive-details-grid > div[aria-hidden="true"] {
        display: none !important;
      }

      .inventory-archive-detail-group {
        grid-template-columns: 70px minmax(0, 1fr) !important;
        row-gap: 6px !important;
      }

      .inventory-archive-detail-group span {
        overflow-wrap: anywhere;
      }

      .inventory-archive-detail-group .inventory-status-badge {
        max-width: 100%;
      }
    }

    @media (max-width: 420px) {
      .inventory-page {
        padding: 12px;
      }

      .inventory-list-header {
        flex-direction: column;
      }

      .inventory-add-button {
        width: 100%;
      }

      .inventory-mobile-actions button {
        flex-basis: calc(50% - 4px);
      }

      .inventory-mobile-sortbar {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `), /*#__PURE__*/React.createElement(PageHeader, {
    title: "Inventory Management",
    subtitle: "Manage stock levels and product inventory",
    icon: /*#__PURE__*/React.createElement(Box, {
      className: "h-8 w-8"
    })
  }), /*#__PURE__*/React.createElement(Card, {
    className: "inventory-search-card mb-6"
  }, /*#__PURE__*/React.createElement(CardContent, {
    className: "pt-6",
    "data-inventory-search-content": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-search-grid flex flex-col md:flex-row gap-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-search-field flex-1 relative"
  }, /*#__PURE__*/React.createElement(Search, {
    className: "absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400"
  }), /*#__PURE__*/React.createElement(Input, {
    className: "pl-10",
    placeholder: "Search by name or ID...",
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "w-full md:w-48"
  }, /*#__PURE__*/React.createElement(Select, {
    value: categoryFilter,
    onValueChange: value => setCategoryFilter(value)
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "inventory-filter-trigger"
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
    className: "inventory-list-card"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    "data-inventory-header": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-list-header flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-list-title"
  }, /*#__PURE__*/React.createElement(CardTitle, null, "Inventory Items"), /*#__PURE__*/React.createElement(CardDescription, null, sortedInventory.length, " items found", sortBy && /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500 ml-2"
  }, "\u2022 Sorted by ", sortLabel, " (", realtimeDisplayOrderLabel, ")"))), user.role === "Admin" && /*#__PURE__*/React.createElement(Dialog, {
    open: isAddDialogOpen,
    onOpenChange: open => {
      if (open) {
        setIsAddDialogOpen(true);
      } else {
        requestCloseAddItemDialog();
      }
    }
  }, /*#__PURE__*/React.createElement(DialogTrigger, {
    asChild: true
  }, /*#__PURE__*/React.createElement(Button, {
    className: "inventory-add-button bg-slate-700 hover:bg-slate-800 text-white font-semibold shadow-md transition-all duration-300"
  }, /*#__PURE__*/React.createElement(Plus, {
    className: "w-4 h-4 mr-2"
  }), "Add Item")), /*#__PURE__*/React.createElement(DialogContent, {
    className: "inventory-dialog-content border border-slate-200 bg-white shadow-2xl",
    style: {
      width: "min(560px, calc(100vw - 32px))",
      maxWidth: "560px",
      padding: "22px",
      borderRadius: "14px",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(DialogHeader, {
    className: "inventory-dialog-header space-y-0 text-left",
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
      background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
      boxShadow: "inset 0 1px 8px rgba(37, 99, 235, 0.1)"
    }
  }, /*#__PURE__*/React.createElement(PackagePlus, {
    className: "text-blue-700",
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
  }, "Add New Item"), /*#__PURE__*/React.createElement(DialogDescription, {
    className: "mt-3 leading-relaxed text-slate-600",
    style: {
      fontSize: "14px"
    }
  }, "Enter details of the new inventory item."))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center text-blue-950",
    style: {
      gap: "12px",
      border: "1px solid #BFDBFE",
      background: "#EFF6FF",
      borderRadius: "10px",
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "shrink-0 bg-blue-600 text-white",
    style: {
      width: "18px",
      height: "18px",
      borderRadius: "999px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Plus, {
    style: {
      width: "12px",
      height: "12px"
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px"
    }
  }, "Provide the item details below to add it to your inventory.")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "item-name",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Item Name"), /*#__PURE__*/React.createElement(Input, {
    id: "item-name",
    value: newItem.name,
    onChange: e => {
      setArchivedDuplicatePrompt(null);
      setNewItem({
        ...newItem,
        name: e.target.value
      });
    },
    placeholder: "e.g., Steel Hammer",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "42px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "category",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Category"), /*#__PURE__*/React.createElement(Select, {
    value: newItem.category,
    onValueChange: value => {
      setArchivedDuplicatePrompt(null);
      setNewItem({
        ...newItem,
        category: value
      });
    }
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    id: "category",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "42px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Select a category"
  })), /*#__PURE__*/React.createElement(SelectContent, null, OFFICIAL_INVENTORY_CATEGORIES.map(category => /*#__PURE__*/React.createElement(SelectItem, {
    key: category,
    value: category
  }, category)))), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600",
    style: {
      fontSize: "12px"
    }
  }, "Select the category that best describes the item. If none applies, choose \"Other.\"")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "quantity",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Initial Quantity"), /*#__PURE__*/React.createElement(Input, {
    id: "quantity",
    type: "number",
    value: newItem.quantity,
    onChange: e => setNewItem({
      ...newItem,
      quantity: e.target.value
    }),
    placeholder: "0",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "42px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "reorder-level",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Reorder Level (Max 20)"), /*#__PURE__*/React.createElement(Input, {
    id: "reorder-level",
    type: "number",
    min: "0",
    max: "20",
    value: newItem.reorderLevel,
    onChange: e => setNewItem({
      ...newItem,
      reorderLevel: e.target.value
    }),
    placeholder: "10",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "42px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-600",
    style: {
      fontSize: "12px"
    }
  }, "Determines when item becomes \"Low Stock\". Max 20 units."))), archivedDuplicatePrompt && /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col text-amber-950",
    style: {
      gap: "12px",
      border: "1px solid #F59E0B",
      background: "#FFFBEB",
      borderRadius: "10px",
      padding: "12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "10px",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "shrink-0 text-amber-600",
    style: {
      width: "18px",
      height: "18px",
      marginTop: "1px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "min-w-0",
    style: {
      display: "grid",
      gap: "4px"
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-semibold",
    style: {
      fontSize: "13px"
    }
  }, "Archived item already exists"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px",
      lineHeight: "1.45"
    }
  }, "An archived item with the same name and category already exists. Please restore the archived item instead of creating a duplicate record."), /*#__PURE__*/React.createElement("p", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      marginTop: "4px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-amber-950",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      border: "1px solid #F59E0B",
      background: "#FEF3C7",
      borderRadius: "999px",
      padding: "5px 10px",
      fontSize: "12px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-amber-700"
  }, "Name:"), archivedDuplicatePrompt.name), /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-amber-950",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      border: "1px solid #F59E0B",
      background: "#FEF3C7",
      borderRadius: "999px",
      padding: "5px 10px",
      fontSize: "12px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-amber-700"
  }, "Category:"), archivedDuplicatePrompt.category)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    type: "button",
    className: "font-semibold shadow-sm transition-colors",
    disabled: isRestoringArchivedDuplicate,
    onClick: () => restoreArchivedDuplicate(archivedDuplicatePrompt),
    style: {
      height: "34px",
      minWidth: "112px",
      borderRadius: "10px",
      padding: "0 14px",
      fontSize: "13px",
      background: isRestoringArchivedDuplicate ? "#B45309" : "#D97706",
      color: "#FFFFFF",
      border: "1px solid #B45309",
      boxShadow: "0 8px 18px rgba(217, 119, 6, 0.22)"
    }
  }, isRestoringArchivedDuplicate ? "Restoring..." : "Restore Item"))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center text-blue-950",
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
  }, "You can edit item details later from the inventory page.")), /*#__PURE__*/React.createElement(DialogFooter, {
    className: "inventory-dialog-footer pt-2",
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
    onClick: requestCloseAddItemDialog
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "font-semibold shadow-lg",
    onClick: handleAddItem,
    disabled: Boolean(archivedDuplicatePrompt),
    style: {
      height: "38px",
      minWidth: "116px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px",
      background: archivedDuplicatePrompt ? "#94A3B8" : "#111827",
      color: "#FFFFFF",
      boxShadow: archivedDuplicatePrompt ? "none" : "0 14px 24px rgba(15, 23, 42, 0.18)"
    }
  }, "Add Item")))))), /*#__PURE__*/React.createElement(CardContent, {
    className: "p-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-table-wrap px-6 pb-6"
  }, /*#__PURE__*/React.createElement(Table, {
    className: "table-fixed"
  }, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[90px]"
  }, renderSortButton('id', 'ID')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[240px]"
  }, renderSortButton('name', 'Item Name')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[180px]"
  }, renderSortButton('category', 'Category')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[120px] text-right"
  }, renderSortButton('quantity', 'Quantity', 'right')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[150px]"
  }, renderSortButton('status', 'Status')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[160px] text-right"
  }, renderSortButton('date', 'Last Updated', 'right')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[150px] pl-3 text-left"
  }, "Actions"))), /*#__PURE__*/React.createElement(TableBody, null, sortedInventory.length === 0 ? /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableCell, {
    colSpan: 7,
    className: "py-12 text-center"
  }, /*#__PURE__*/React.createElement(Box, {
    className: "mx-auto mb-4 h-14 w-14 text-slate-300"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "mb-2 font-semibold text-slate-700"
  }, inventory.length === 0 ? "No Inventory Items" : "No Inventory Items Found"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-500"
  }, inventory.length === 0 ? "Items added to inventory will appear here." : "Try adjusting your search or category filter."))) : sortedInventory.map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm align-middle"
  }, item.id), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.category), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-right"
  }, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: item.status === "In Stock" ? "bg-green-100 text-green-700" : item.status === "Low Stock" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"
  }, item.status)), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm text-slate-600 text-right"
  }, formatDateTime(item.lastUpdated)), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-end gap-2"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    className: "border-green-500 text-green-700 hover:bg-green-50",
    title: "Stock In: Add new stock",
    onClick: () => {
      resetStockForm();
      setSelectedItem(item);
      setIsStockInDialogOpen(true);
    }
  }, /*#__PURE__*/React.createElement(Plus, {
    className: "w-4 h-4"
  })), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    className: "border-red-500 text-red-700 hover:bg-red-50",
    title: "Stock Out: Deduct stock",
    onClick: () => {
      resetStockForm();
      setSelectedItem(item);
      setIsStockOutDialogOpen(true);
    }
  }, /*#__PURE__*/React.createElement(Minus, {
    className: "w-4 h-4"
  })), user.role === "Admin" && /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    className: "border-amber-400 text-amber-800 hover:bg-amber-100 hover:border-amber-500 hover:text-amber-950 transition-colors",
    title: "Archive: Remove item from list",
    onClick: () => {
      setSelectedItem(item);
      setIsArchiveDialogOpen(true);
    }
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "w-4 h-4"
  })))))))))), /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-sortbar",
    "aria-label": "Sort inventory items"
  }, [["id", "ID"], ["name", "Name"], ["category", "Category"], ["quantity", "Qty"], ["status", "Status"], ["date", "Updated"]].map(([column, label]) => /*#__PURE__*/React.createElement(Button, {
    key: column,
    type: "button",
    variant: "outline",
    "aria-pressed": sortBy === column,
    "aria-label": `Sort by ${label}${sortBy === column ? `, currently ${sortOrder === "asc" ? "ascending" : "descending"}` : ""}`,
    className: `inventory-mobile-sort-button ${sortBy === column ? "inventory-mobile-sort-button-active" : ""}`,
    onClick: () => handleSort(column)
  }, label, /*#__PURE__*/React.createElement(ArrowUpDown, {
    className: `inventory-mobile-sort-icon ${sortBy === column ? `inventory-mobile-sort-icon-${sortOrder}` : ""}`,
    "aria-hidden": "true"
  })))), sortedInventory.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-empty"
  }, /*#__PURE__*/React.createElement(Box, {
    className: "mx-auto mb-3 h-12 w-12 text-slate-300"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "mb-2 font-semibold text-slate-700"
  }, inventory.length === 0 ? "No Inventory Items" : "No Inventory Items Found"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-500"
  }, inventory.length === 0 ? "Items added to inventory will appear here." : "Try adjusting your search or category filter.")) : sortedInventory.map(item => /*#__PURE__*/React.createElement("article", {
    key: item.id,
    className: "inventory-mobile-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-card-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "min-w-0"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "inventory-mobile-name"
  }, item.name), /*#__PURE__*/React.createElement("p", {
    className: "inventory-mobile-id"
  }, "ID: ", item.id)), /*#__PURE__*/React.createElement(Badge, {
    className: `inventory-status-badge ${getStatusBadgeClass(item.status)}`
  }, item.status)), /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inventory-mobile-label"
  }, "Category"), /*#__PURE__*/React.createElement("span", {
    className: "inventory-mobile-value"
  }, normalizeCategory(item.category) || "Uncategorized")), /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inventory-mobile-label"
  }, "Quantity"), /*#__PURE__*/React.createElement("span", {
    className: "inventory-mobile-value"
  }, item.quantity, " ", item.quantity === 1 ? "unit" : "units"))), /*#__PURE__*/React.createElement("p", {
    className: "inventory-mobile-date"
  }, "Last Updated: ", formatDateTime(item.lastUpdated)), /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-actions"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "border-green-500 text-green-700 hover:bg-green-50",
    title: "Stock In: Add new stock",
    onClick: () => {
      resetStockForm();
      setSelectedItem(item);
      setIsStockInDialogOpen(true);
    }
  }, /*#__PURE__*/React.createElement(Plus, {
    className: "mr-1 h-4 w-4"
  }), "Stock In"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "border-red-500 text-red-700 hover:bg-red-50",
    title: "Stock Out: Deduct stock",
    onClick: () => {
      resetStockForm();
      setSelectedItem(item);
      setIsStockOutDialogOpen(true);
    }
  }, /*#__PURE__*/React.createElement(Minus, {
    className: "mr-1 h-4 w-4"
  }), "Stock Out"), user.role === "Admin" && /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "border-amber-400 text-amber-800 hover:bg-amber-100 hover:border-amber-500 hover:text-amber-950",
    title: "Archive: Remove item from list",
    onClick: () => {
      setSelectedItem(item);
      setIsArchiveDialogOpen(true);
    }
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "mr-1 h-4 w-4"
  }), "Archive")))))), /*#__PURE__*/React.createElement(Dialog, {
    open: isStockInDialogOpen,
    onOpenChange: open => {
      if (open) {
        setIsStockInDialogOpen(true);
      } else {
        requestCloseStockInDialog();
      }
    }
  }, /*#__PURE__*/React.createElement(DialogContent, {
    className: "inventory-dialog-content border border-slate-200 bg-white shadow-2xl",
    style: {
      width: "min(560px, calc(100vw - 32px))",
      maxWidth: "560px",
      padding: "22px",
      borderRadius: "14px",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(DialogHeader, {
    className: "inventory-dialog-header space-y-0 text-left",
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
  }, /*#__PURE__*/React.createElement(PackagePlus, {
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
  }, "Stock In"), /*#__PURE__*/React.createElement(DialogDescription, {
    className: "mt-3 leading-relaxed text-slate-600",
    style: {
      fontSize: "14px"
    }
  }, "Add stock for: ", selectedItem?.name))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center text-green-950",
    style: {
      gap: "12px",
      border: "1px solid #BBF7D0",
      background: "#F0FDF4",
      borderRadius: "10px",
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "shrink-0 bg-green-600 text-white",
    style: {
      width: "18px",
      height: "18px",
      borderRadius: "999px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Plus, {
    style: {
      width: "12px",
      height: "12px"
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px"
    }
  }, "Add quantity to increase the available stock for this item.")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "stock-in-amount",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Quantity to Add"), /*#__PURE__*/React.createElement(Input, {
    id: "stock-in-amount",
    type: "number",
    value: stockAmount,
    onChange: e => setStockAmount(e.target.value),
    placeholder: "0",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "48px",
      borderRadius: "10px",
      fontSize: "18px",
      padding: "0 16px"
    }
  })), /*#__PURE__*/React.createElement("div", {
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
  }, "Current Stock: ", selectedItem?.quantity ?? 0, " ", (selectedItem?.quantity ?? 0) === 1 ? "unit" : "units")), /*#__PURE__*/React.createElement(DialogFooter, {
    className: "inventory-dialog-footer pt-2",
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
    onClick: requestCloseStockInDialog
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "font-semibold shadow-lg",
    onClick: handleStockIn,
    style: {
      height: "38px",
      minWidth: "150px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px",
      background: "#16A34A",
      color: "#FFFFFF",
      boxShadow: "0 14px 24px rgba(22, 163, 74, 0.18)"
    }
  }, "Confirm Stock In")))), /*#__PURE__*/React.createElement(Dialog, {
    open: isStockOutDialogOpen,
    onOpenChange: open => {
      if (open) {
        setIsStockOutDialogOpen(true);
      } else {
        requestCloseStockOutDialog();
      }
    }
  }, /*#__PURE__*/React.createElement(DialogContent, {
    className: "inventory-dialog-content border border-slate-200 bg-white shadow-2xl",
    style: {
      width: "min(560px, calc(100vw - 32px))",
      maxWidth: "560px",
      padding: "22px",
      borderRadius: "14px",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(DialogHeader, {
    className: "inventory-dialog-header space-y-0 text-left",
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
      background: "linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)",
      boxShadow: "inset 0 1px 8px rgba(220, 38, 38, 0.1)"
    }
  }, /*#__PURE__*/React.createElement(PackageMinus, {
    className: "text-red-600",
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
  }, "Stock Out"), /*#__PURE__*/React.createElement(DialogDescription, {
    className: "mt-3 leading-relaxed text-slate-600",
    style: {
      fontSize: "14px"
    }
  }, "Remove stock for: ", selectedItem?.name))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center text-red-950",
    style: {
      gap: "12px",
      border: "1px solid #FECACA",
      background: "#FEF2F2",
      borderRadius: "10px",
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "shrink-0 bg-red-600 text-white",
    style: {
      width: "18px",
      height: "18px",
      borderRadius: "999px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Minus, {
    style: {
      width: "12px",
      height: "12px"
    }
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px"
    }
  }, "Remove quantity to decrease the available stock for this item.")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "stock-out-amount",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Quantity to Remove"), /*#__PURE__*/React.createElement(Input, {
    id: "stock-out-amount",
    type: "number",
    value: stockAmount,
    onChange: e => setStockAmount(e.target.value),
    placeholder: "0",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "48px",
      borderRadius: "10px",
      fontSize: "18px",
      padding: "0 16px"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center text-red-950",
    style: {
      gap: "12px",
      border: "1px solid #FECACA",
      background: "#FEF2F2",
      borderRadius: "10px",
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement(Info, {
    className: "shrink-0 text-red-600",
    style: {
      width: "18px",
      height: "18px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px"
    }
  }, "Current Stock: ", selectedItem?.quantity ?? 0, " ", (selectedItem?.quantity ?? 0) === 1 ? "unit" : "units")), /*#__PURE__*/React.createElement(DialogFooter, {
    className: "inventory-dialog-footer pt-2",
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
    onClick: requestCloseStockOutDialog
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "font-semibold shadow-lg",
    onClick: handleStockOut,
    style: {
      height: "38px",
      minWidth: "156px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px",
      background: "#DC2626",
      color: "#FFFFFF",
      boxShadow: "0 14px 24px rgba(220, 38, 38, 0.18)"
    }
  }, "Confirm Stock Out")))), /*#__PURE__*/React.createElement(Dialog, {
    open: isArchiveDialogOpen,
    onOpenChange: open => {
      setIsArchiveDialogOpen(open);
      if (!open) {
        setSelectedItem(null);
      }
    }
  }, /*#__PURE__*/React.createElement(DialogContent, {
    className: "inventory-dialog-content border border-slate-200 bg-white shadow-2xl",
    style: {
      width: "min(560px, calc(100vw - 32px))",
      maxWidth: "560px",
      padding: "22px",
      borderRadius: "14px",
      gap: "16px"
    }
  }, /*#__PURE__*/React.createElement(DialogHeader, {
    className: "inventory-dialog-header space-y-0 text-left",
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
      background: "linear-gradient(135deg, #F4EEFF 0%, #EFE7FF 100%)",
      boxShadow: "inset 0 1px 8px rgba(109, 63, 191, 0.08)"
    }
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "text-violet-700",
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
  }, "Archive Item"), /*#__PURE__*/React.createElement(DialogDescription, {
    className: "mt-3 leading-relaxed text-slate-600",
    style: {
      fontSize: "14px"
    }
  }, "Move this item out of active inventory and into the archive."))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center text-slate-900",
    style: {
      gap: "16px",
      border: "1px solid #FED7AA",
      background: "#FFFBEB",
      borderRadius: "10px",
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "shrink-0 text-amber-500",
    style: {
      width: "18px",
      height: "18px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px"
    }
  }, "This item will no longer be available in active inventory.")), /*#__PURE__*/React.createElement("div", {
    className: "inventory-archive-item-card bg-white shadow-sm",
    style: {
      border: "1px solid #E2E8F0",
      borderRadius: "12px",
      padding: "16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
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
      border: "1px solid #EDE9FE",
      background: "#F7F2FF",
      boxShadow: "inset 0 1px 8px rgba(109, 63, 191, 0.08)"
    }
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "text-violet-700",
    style: {
      width: "28px",
      height: "28px"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "min-w-0 flex-1"
  }, /*#__PURE__*/React.createElement("p", {
    className: "inventory-archive-item-name truncate font-bold text-slate-950",
    style: {
      marginBottom: "12px",
      fontSize: "21px",
      lineHeight: "1.15"
    }
  }, selectedItem?.name), /*#__PURE__*/React.createElement("div", {
    className: "inventory-archive-details-grid text-slate-700",
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1px 1fr",
      alignItems: "start",
      columnGap: "20px",
      fontSize: "13px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-archive-detail-group",
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
  }, selectedItem?.id), /*#__PURE__*/React.createElement("span", {
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
    className: "inventory-archive-detail-group",
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
    className: `inventory-status-badge ${selectedItem?.status === "In Stock" ? "bg-green-100 text-green-700" : selectedItem?.status === "Low Stock" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`
  }, selectedItem?.status))))))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center text-slate-800",
    style: {
      gap: "16px",
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
  }, "Archived items can be restored later from the Archive page.")), /*#__PURE__*/React.createElement(DialogFooter, {
    className: "inventory-dialog-footer pt-2",
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
      setIsArchiveDialogOpen(false);
      setSelectedItem(null);
    }
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "font-semibold shadow-lg transition-transform duration-150 active:scale-95",
    onClick: handleArchiveItem,
    style: {
      height: "38px",
      minWidth: "132px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px",
      background: "#111827",
      color: "#FFFFFF",
      boxShadow: "0 14px 24px rgba(15, 23, 42, 0.18)"
    }
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "mr-2",
    style: {
      width: "16px",
      height: "16px"
    }
  }), "Archive Item"))), /*#__PURE__*/React.createElement(AlertDialog, {
    open: Boolean(discardPrompt),
    onOpenChange: open => {
      if (!open) {
        setDiscardPrompt(null);
      }
    }
  }, /*#__PURE__*/React.createElement(AlertDialogContent, {
    className: "inventory-alert-dialog-content border bg-white shadow-2xl",
    style: {
      width: "min(420px, calc(100vw - 32px))",
      maxWidth: "420px",
      padding: "24px",
      borderRadius: "14px",
      gap: "18px",
      borderColor: "#64748B",
      borderWidth: "2px",
      boxShadow: "0 22px 50px rgba(15, 23, 42, 0.26), 0 0 0 4px rgba(15, 23, 42, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.9)"
    }
  }, /*#__PURE__*/React.createElement(AlertDialogHeader, {
    showBrand: false,
    className: "px-0 pt-0"
  }, /*#__PURE__*/React.createElement(AlertDialogTitle, {
    className: "text-xl font-semibold text-slate-950"
  }, discardDialogCopy[discardPrompt]?.title || "Discard changes?"), /*#__PURE__*/React.createElement(AlertDialogDescription, {
    className: "text-sm leading-relaxed text-slate-600"
  }, discardDialogCopy[discardPrompt]?.description || "Closing this form will remove your unsaved changes.")), /*#__PURE__*/React.createElement(AlertDialogFooter, {
    className: "inventory-alert-dialog-footer px-0 pb-0",
    style: {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: "10px"
    }
  }, /*#__PURE__*/React.createElement(AlertDialogCancel, {
    className: "border-slate-200 bg-white text-slate-950 hover:bg-slate-50",
    style: {
      height: "38px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px"
    },
    onClick: () => setDiscardPrompt(null)
  }, "Keep Editing"), /*#__PURE__*/React.createElement(AlertDialogAction, {
    className: "bg-red-600 text-white hover:bg-red-700",
    style: {
      height: "38px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px"
    },
    onClick: confirmDiscardChanges
  }, "Discard"))))));
}
