import React from 'react';
import { useState } from "react";
import { Plus, Minus, Archive, Search, Filter, ArrowUpDown, AlertTriangle, Info, PackagePlus, PackageMinus, CheckCircle, Box, Pencil } from "lucide-react";
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
const INVENTORY_UNIT_ALIASES = {
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  a: "a",
  amp: "a",
  amps: "a",
  ampere: "a",
  amperes: "a",
  v: "v",
  volt: "v",
  volts: "v",
  w: "w",
  watt: "w",
  watts: "w",
  in: "in",
  inch: "in",
  inches: "in",
  mm: "mm",
  millimeter: "mm",
  millimeters: "mm",
  cm: "cm",
  centimeter: "cm",
  centimeters: "cm",
  m: "m",
  meter: "m",
  meters: "m",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  g: "g",
  gram: "g",
  grams: "g",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  ft: "ft",
  foot: "ft",
  feet: "ft",
  feets: "ft",
  pc: "pc",
  pcs: "pc",
  piece: "pc",
  pieces: "pc"
};

const normalizeDuplicateKeyPart = value => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const singularizeDuplicateToken = token => {
  const normalizedToken = token.replace(/([a-z])\1{2,}/g, "$1$1");
  if (!/^[a-z]+$/.test(normalizedToken) || normalizedToken.length <= 3 || /(ss|us|is)$/.test(normalizedToken)) return normalizedToken;
  if (normalizedToken.endsWith("ies") && normalizedToken.length > 4) return `${normalizedToken.slice(0, -3)}y`;
  if (normalizedToken.endsWith("es") && /(ches|shes|xes|zes|ses)$/.test(normalizedToken)) return normalizedToken.slice(0, -2);
  if (normalizedToken.endsWith("s")) return normalizedToken.slice(0, -1);
  return normalizedToken;
};
const normalizeInventoryIdentityToken = token => {
  const cleanedToken = String(token ?? "").replace(/\.$/, "");
  const directUnitAlias = INVENTORY_UNIT_ALIASES[cleanedToken];
  if (directUnitAlias) return directUnitAlias;
  const singularToken = singularizeDuplicateToken(cleanedToken);
  return INVENTORY_UNIT_ALIASES[singularToken] || singularToken;
};
const normalizeInventoryIdentityName = value =>
  normalizeDuplicateKeyPart(value)
    .replace(/[“”]/g, '"')
    .replace(/[’']/g, "")
    .replace(/(\d+(?:\/\d+)?)\s*"/g, "$1 in")
    .replace(/\bby\b/g, "x")
    .replace(/(\d)\s*(?:x|\u00d7|\*)\s*(\d)/gi, "$1x$2")
    .replace(/(\d)\s*(?:x|\u00d7|\*)\s*(\d)/gi, "$1x$2")
    .replace(/([a-z])-([a-z])/g, "$1 $2")
    .replace(/(\d+)\s*\/\s*(\d+)/g, "$1/$2")
    .replace(/#\s*(\d+)/g, "#$1")
    .replace(/[^a-z0-9#./-]+/g, " ")
    .replace(/(\d)([a-z]+)/g, "$1 $2")
    .replace(/([a-z]+)(\d)/g, "$1 $2")
    .replace(/(\d)\s*[x×]\s*(\d)/gi, "$1x$2")
    .replace(/(\d)\s*[x×]\s*(\d)/gi, "$1x$2")
    .replace(/(\d+x\d+)\s*x\s*(\d)/gi, "$1x$2")
    .split(" ")
    .filter(Boolean)
    .map(normalizeInventoryIdentityToken)
    .join(" ");
const getInventoryIdentityTokens = value => normalizeInventoryIdentityName(value).split(" ").filter(Boolean);
const validateInventoryNameQuality = value => {
  const cleanName = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!cleanName) return "Please provide a valid item name.";
  if (cleanName.length > 150) return "Item name must be 150 characters or less.";
  if (!/[a-z0-9]/i.test(cleanName)) return "Item name must include letters or numbers.";
  if (getInventoryIdentityTokens(cleanName).filter(token => /[a-z0-9]/.test(token)).length < 2) {
    return "Include the item size or specification, such as \"Claw Hammer 16 oz.\"";
  }
  return null;
};
const isNumericIdentityToken = value => /\d/.test(value);
const levenshteinDistance = (left, right) => {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
};
const areInventoryNameTokensSimilar = (left, right) => {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;
  const distance = levenshteinDistance(left, right);
  return distance <= (Math.max(left.length, right.length) >= 6 ? 2 : 1);
};
const areLikelyDuplicateInventoryNames = (leftName, rightName) => {
  const leftTokens = getInventoryIdentityTokens(leftName);
  const rightTokens = getInventoryIdentityTokens(rightName);
  if (!leftTokens.length || leftTokens.length !== rightTokens.length) return false;

  const leftNumeric = leftTokens.filter(isNumericIdentityToken).join("|");
  const rightNumeric = rightTokens.filter(isNumericIdentityToken).join("|");
  if (leftNumeric !== rightNumeric) return false;

  let fuzzyMatches = 0;
  for (let index = 0; index < leftTokens.length; index += 1) {
    if (!areInventoryNameTokensSimilar(leftTokens[index], rightTokens[index])) return false;
    if (leftTokens[index] !== rightTokens[index]) fuzzyMatches += 1;
  }

  return fuzzyMatches > 0;
};
const isWholeNumberText = value => /^\d+$/.test(String(value ?? "").trim());
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

const INVENTORY_ITEMS_PER_PAGE = 50;

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
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [stockAmount, setStockAmount] = useState("");
  const [discardPrompt, setDiscardPrompt] = useState(null);
  const [archivedDuplicatePrompt, setArchivedDuplicatePrompt] = useState(null);
  const [similarDuplicatePrompt, setSimilarDuplicatePrompt] = useState(null);
  const [isRestoringArchivedDuplicate, setIsRestoringArchivedDuplicate] = useState(false);
  const [editItem, setEditItem] = useState({
    name: "",
    category: "",
    reorderLevel: ""
  });

  // 🔄 Sorting state: track which column and direction to sort
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const categories = OFFICIAL_INVENTORY_CATEGORIES;
  const currentBranch = normalizeDuplicateKeyPart(user?.branch);
  const buildDuplicateKey = item => [
    normalizeInventoryIdentityName(item.name),
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

  const totalPages = Math.max(1, Math.ceil(sortedInventory.length / INVENTORY_ITEMS_PER_PAGE));
  const paginatedInventory = sortedInventory.slice((currentPage - 1) * INVENTORY_ITEMS_PER_PAGE, currentPage * INVENTORY_ITEMS_PER_PAGE);
  const paginationStart = sortedInventory.length === 0 ? 0 : (currentPage - 1) * INVENTORY_ITEMS_PER_PAGE + 1;
  const paginationEnd = Math.min(currentPage * INVENTORY_ITEMS_PER_PAGE, sortedInventory.length);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, sortBy, sortOrder]);

  React.useEffect(() => {
    setCurrentPage(page => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  // 🔀 Handle column header click to change sort
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

  const renderInventoryPagination = () => sortedInventory.length > INVENTORY_ITEMS_PER_PAGE ? /*#__PURE__*/React.createElement("div", {
    className: "inventory-pagination",
    "aria-label": "Inventory pagination"
  }, /*#__PURE__*/React.createElement("p", {
    className: "inventory-pagination-summary"
  }, "Showing ", paginationStart, "-", paginationEnd, " of ", sortedInventory.length, " items"), /*#__PURE__*/React.createElement("div", {
    className: "inventory-pagination-actions"
  }, /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "outline",
    disabled: currentPage <= 1,
    onClick: () => setCurrentPage(page => Math.max(1, page - 1))
  }, "Previous"), /*#__PURE__*/React.createElement("span", {
    className: "inventory-pagination-page"
  }, "Page ", currentPage, " of ", totalPages), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "outline",
    disabled: currentPage >= totalPages,
    onClick: () => setCurrentPage(page => Math.min(totalPages, page + 1))
  }, "Next Page"))) : null;

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
    setSimilarDuplicatePrompt(null);
  };

  const hasAddItemChanges = () => {
    return newItem.name.trim() !== "" || newItem.category.trim() !== "" || newItem.quantity !== "" || newItem.reorderLevel !== "10";
  };

  const hasStockFormChanges = () => {
    return stockAmount !== "";
  };

  const hasEditItemChanges = () => {
    if (!selectedItem) return false;
    return editItem.name.trim() !== selectedItem.name || normalizeCategory(editItem.category) !== normalizeCategory(selectedItem.category) || String(editItem.reorderLevel) !== String(selectedItem.reorderLevel);
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

  const closeEditDialog = () => {
    setIsEditDialogOpen(false);
    setSelectedItem(null);
    setEditItem({
      name: "",
      category: "",
      reorderLevel: ""
    });
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

  const requestCloseEditDialog = () => {
    if (hasEditItemChanges()) {
      setDiscardPrompt("editItem");
      return;
    }
    closeEditDialog();
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
    },
    editItem: {
      title: "Discard item edits?",
      description: "You have unsaved item detail changes. Closing this form will keep the current inventory record unchanged."
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
      return;
    }
    if (prompt === "editItem") {
      closeEditDialog();
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
  const displayOrderLabel = (() => {
    if (sortBy === 'id' || sortBy === 'quantity') return sortOrder === 'asc' ? 'Low to High' : 'High to Low';
    if (sortBy === 'date') return sortOrder === 'asc' ? 'Oldest First' : 'Newest First';
    return sortOrder === 'asc' ? 'A to Z' : 'Z to A';
  })();

  const realtimeDisplayOrderLabel = filteredInventory.length === 0 ? "No items" : displayOrderLabel;

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

  const openEditDialog = item => {
    setSelectedItem(item);
    setEditItem({
      name: item.name || "",
      category: normalizeCategory(item.category) || item.category || "",
      reorderLevel: String(item.reorderLevel ?? 10)
    });
    setIsEditDialogOpen(true);
  };

  const handleAddItem = async ({ allowSimilarDuplicate = false } = {}) => {
    if (!newItem.name || !newItem.category || !newItem.quantity || !newItem.reorderLevel) {
      toast.error("Please fill in all fields before adding an item.");
      return;
    }
    const cleanName = newItem.name.trim().replace(/\s+/g, " ");
    const nameQualityError = validateInventoryNameQuality(cleanName);
    if (nameQualityError) {
      toast.error("Please enter a more specific item name", { description: nameQualityError });
      return;
    }

    const quantity = parseInt(newItem.quantity);
    if (!isWholeNumberText(newItem.reorderLevel)) {
      toast.error("Reorder Level must be a whole number.");
      return;
    }

    const reorderLevel = Number(newItem.reorderLevel);
    if (isNaN(quantity) || quantity < 0) {
      toast.error("Please enter a valid quantity.");
      return;
    }
    if (isNaN(reorderLevel) || reorderLevel < 0 || reorderLevel > 20) {
      toast.error("Reorder Level must be between 0 and 20.");
      return;
    }
    const newItemDuplicateKey = [
      normalizeInventoryIdentityName(cleanName),
      normalizeDuplicateKeyPart(normalizeCategory(newItem.category)),
      currentBranch
    ].join("|");

    // Check for duplicate active item by normalized item identity + category + branch.
    const existingItem = linearSearch(inventory, item => buildDuplicateKey(item) === newItemDuplicateKey);
    if (existingItem) {
      toast.error("Possible duplicate item found", {
        description: `"${existingItem.name}" already exists in ${normalizeCategory(newItem.category)} (ID: ${existingItem.id}). Use Stock In if this is the same product.`
      });

      return;
    }

    const similarActiveItem = linearSearch(
      inventory,
      item =>
        normalizeDuplicateKeyPart(normalizeCategory(item.category)) === normalizeDuplicateKeyPart(normalizeCategory(newItem.category)) &&
        normalizeDuplicateKeyPart(item.branch || user?.branch) === currentBranch &&
        areLikelyDuplicateInventoryNames(item.name, cleanName)
    );

    if (similarActiveItem && !allowSimilarDuplicate) {
      setSimilarDuplicatePrompt({
        item: similarActiveItem,
        source: "active",
        proposedName: cleanName,
        proposedCategory: normalizeCategory(newItem.category)
      });
      return;
    }

    const archivedDuplicate = linearSearch(archivedInventory, item => buildDuplicateKey(item) === newItemDuplicateKey);
    if (archivedDuplicate) {
      setArchivedDuplicatePrompt(archivedDuplicate);
      return;
    }
    const similarArchivedItem = linearSearch(
      archivedInventory,
      item =>
        normalizeDuplicateKeyPart(normalizeCategory(item.category)) === normalizeDuplicateKeyPart(normalizeCategory(newItem.category)) &&
        normalizeDuplicateKeyPart(item.branch || user?.branch) === currentBranch &&
        areLikelyDuplicateInventoryNames(item.name, cleanName)
    );

    if (similarArchivedItem && !allowSimilarDuplicate) {
      setSimilarDuplicatePrompt({
        item: similarArchivedItem,
        source: "archived",
        proposedName: cleanName,
        proposedCategory: normalizeCategory(newItem.category)
      });
      return;
    }
    setArchivedDuplicatePrompt(null);
    setSimilarDuplicatePrompt(null);
    try {
      await addInventoryItem({
        name: cleanName,
        category: normalizeCategory(newItem.category),
        quantity,
        reorderLevel,
        allowSimilarDuplicate
      });
      setIsAddDialogOpen(false);
      setNewItem({ name: "", category: "", quantity: "", reorderLevel: "10" });
      if (quantity === 0) {
        toast.error(`${cleanName} added but OUT OF STOCK!`, { description: 'Item needs immediate stocking' });
      } else if (quantity <= reorderLevel) {
        toast.warning(`${cleanName} added but LOW ON STOCK!`, { description: `Only ${formatUnitQuantity(quantity)} - Consider restocking soon` });
      } else {
        toast.success(`${cleanName} added successfully!`, { description: `Initial stock: ${formatUnitQuantity(quantity)}` });
      }
    } catch (err) {
      toast.error("Failed to add item", { description: err?.response?.data?.error || err.message });
    }
  };

  const confirmAddSimilarItem = () => {
    const action = similarDuplicatePrompt?.action;
    setSimilarDuplicatePrompt(null);
    if (action === "edit") {
      handleEditItem({ allowSimilarDuplicate: true });
      return;
    }
    handleAddItem({ allowSimilarDuplicate: true });
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

  const handleEditItem = async ({ allowSimilarDuplicate = false } = {}) => {
    if (!selectedItem) return;
    const cleanName = editItem.name.trim().replace(/\s+/g, " ");
    const canonicalCategory = normalizeCategory(editItem.category);
    if (!isWholeNumberText(editItem.reorderLevel)) {
      toast.error("Reorder Level must be a whole number.");
      return;
    }

    const reorderLevel = Number(editItem.reorderLevel);

    if (!cleanName || !canonicalCategory) {
      toast.error("Please provide a valid item name and category.");
      return;
    }
    const nameQualityError = validateInventoryNameQuality(cleanName);
    if (nameQualityError) {
      toast.error("Please enter a more specific item name", { description: nameQualityError });
      return;
    }
    if (isNaN(reorderLevel) || reorderLevel < 0 || reorderLevel > 20) {
      toast.error("Reorder Level must be between 0 and 20.");
      return;
    }

    const editedItemDuplicateKey = [
      normalizeInventoryIdentityName(cleanName),
      normalizeDuplicateKeyPart(canonicalCategory),
      currentBranch
    ].join("|");
    const activeExactDuplicate = linearSearch(
      inventory,
      item => item.id !== selectedItem.id && buildDuplicateKey(item) === editedItemDuplicateKey
    );
    if (activeExactDuplicate) {
      toast.error("Failed to update item", {
        description: `"${activeExactDuplicate.name}" already exists in ${canonicalCategory}. Use that existing item if this is the same product.`
      });
      return;
    }

    const archivedExactDuplicate = linearSearch(
      archivedInventory,
      item => buildDuplicateKey(item) === editedItemDuplicateKey
    );
    if (archivedExactDuplicate) {
      toast.error("Failed to update item", {
        description: "An archived item with the same name and category already exists. Please restore the archived item instead of creating a duplicate record."
      });
      return;
    }

    const identityChanged =
      normalizeInventoryIdentityName(selectedItem.name) !== normalizeInventoryIdentityName(cleanName) ||
      normalizeDuplicateKeyPart(normalizeCategory(selectedItem.category)) !== normalizeDuplicateKeyPart(canonicalCategory);

    if (identityChanged && !allowSimilarDuplicate) {
      const similarActiveItem = linearSearch(
        inventory,
        item =>
          item.id !== selectedItem.id &&
          normalizeDuplicateKeyPart(normalizeCategory(item.category)) === normalizeDuplicateKeyPart(canonicalCategory) &&
          normalizeDuplicateKeyPart(item.branch || user?.branch) === currentBranch &&
          areLikelyDuplicateInventoryNames(item.name, cleanName)
      );

      if (similarActiveItem) {
        setSimilarDuplicatePrompt({
          item: similarActiveItem,
          source: "active",
          action: "edit",
          proposedName: cleanName,
          proposedCategory: canonicalCategory
        });
        return;
      }

      const similarArchivedItem = linearSearch(
        archivedInventory,
        item =>
          normalizeDuplicateKeyPart(normalizeCategory(item.category)) === normalizeDuplicateKeyPart(canonicalCategory) &&
          normalizeDuplicateKeyPart(item.branch || user?.branch) === currentBranch &&
          areLikelyDuplicateInventoryNames(item.name, cleanName)
      );

      if (similarArchivedItem) {
        setSimilarDuplicatePrompt({
          item: similarArchivedItem,
          source: "archived",
          action: "edit",
          proposedName: cleanName,
          proposedCategory: canonicalCategory
        });
        return;
      }
    }

    try {
      await updateInventoryItem(selectedItem.id, {
        name: cleanName,
        category: canonicalCategory,
        quantity: selectedItem.quantity,
        reorderLevel,
        allowSimilarDuplicate
      });
      toast.success(`${cleanName} updated successfully`, {
        description: "Item details were saved without changing stock quantity."
      });
      closeEditDialog();
    } catch (err) {
      toast.error("Failed to update item", { description: err?.response?.data?.error || err.message });
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
  const renderEditDialog = () => (
    <Dialog
      open={isEditDialogOpen}
      onOpenChange={open => {
        if (open) {
          setIsEditDialogOpen(true);
        } else {
          requestCloseEditDialog();
        }
      }}
    >
      <DialogContent
        className="inventory-dialog-content border border-slate-200 bg-white shadow-2xl"
        onOpenAutoFocus={event => event.preventDefault()}
        style={{
          width: "min(560px, calc(100vw - 32px))",
          maxWidth: "560px",
          padding: "22px",
          borderRadius: "14px",
          gap: "16px"
        }}
      >
        <DialogHeader
          className="inventory-dialog-header space-y-0 text-left"
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            gap: "16px",
            paddingRight: "28px"
          }}
        >
          <div
            className="shrink-0"
            style={{
              width: "58px",
              height: "58px",
              borderRadius: "999px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
              boxShadow: "inset 0 1px 8px rgba(37, 99, 235, 0.1)"
            }}
          >
            <Pencil className="text-blue-700" style={{ width: "28px", height: "28px" }} />
          </div>
          <div className="pt-2">
            <DialogTitle
              className="font-bold tracking-tight text-slate-950"
              style={{ fontSize: "26px", lineHeight: "1.1" }}
            >
              Edit Item Details
            </DialogTitle>
            <DialogDescription
              className="mt-3 leading-relaxed text-slate-600"
              style={{ fontSize: "14px" }}
            >
              Update item identity details without changing stock quantity.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div
          className="flex items-center text-blue-950"
          style={{
            gap: "12px",
            border: "1px solid #BFDBFE",
            background: "#EFF6FF",
            borderRadius: "10px",
            padding: "10px 12px"
          }}
        >
          <Info className="shrink-0 text-blue-600" style={{ width: "18px", height: "18px" }} />
          <p style={{ fontSize: "13px" }}>
            Stock quantity remains controlled through Stock In and Stock Out so movement history stays accurate.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="edit-item-name"
              className="font-semibold text-slate-950"
              style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
            >
              Item Name
            </Label>
            <Input
              id="edit-item-name"
              value={editItem.name}
              onChange={e => setEditItem({ ...editItem, name: e.target.value })}
              placeholder="e.g., Steel Hammer"
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="edit-category"
              className="font-semibold text-slate-950"
              style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
            >
              Category
            </Label>
            <Select
              value={editItem.category}
              onValueChange={value => setEditItem({ ...editItem, category: value })}
            >
              <SelectTrigger
                id="edit-category"
                className="border-slate-300 bg-white text-slate-950"
                style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
              >
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {OFFICIAL_INVENTORY_CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="edit-reorder-level"
              className="font-semibold text-slate-950"
              style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
            >
              Reorder Level (Max 20)
            </Label>
            <Input
              id="edit-reorder-level"
              type="number"
              min="0"
              max="20"
              step="1"
              inputMode="numeric"
              value={editItem.reorderLevel}
              onChange={e => setEditItem({ ...editItem, reorderLevel: e.target.value })}
              placeholder="10"
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            />
            <p className="text-slate-600" style={{ fontSize: "12px" }}>
              Determines when the item is marked as Low Stock.
            </p>
          </div>
        </div>

        <DialogFooter
          className="inventory-dialog-footer pt-2"
          style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}
        >
          <Button
            variant="outline"
            className="modal-button-cancel border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
            style={{ height: "38px", minWidth: "88px", borderRadius: "10px", padding: "0 18px", fontSize: "13px" }}
            onClick={requestCloseEditDialog}
          >
            Cancel
          </Button>
          <Button
            className="modal-button-primary font-semibold shadow-lg"
            onClick={handleEditItem}
            disabled={!hasEditItemChanges()}
            style={{
              height: "38px",
              minWidth: "132px",
              borderRadius: "10px",
              padding: "0 18px",
              fontSize: "13px",
              background: hasEditItemChanges() ? "#2563EB" : "#94A3B8",
              color: "#FFFFFF",
              boxShadow: hasEditItemChanges() ? "0 14px 24px rgba(37, 99, 235, 0.18)" : "none"
            }}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return /*#__PURE__*/React.createElement("div", {
    className: "inventory-page min-h-screen bg-gray-50 p-4 md:p-8"
  }, /*#__PURE__*/React.createElement("style", null, `
    .inventory-mobile-list {
      display: none;
    }

    .inventory-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      border-top: 1px solid #e2e8f0;
      padding: 16px 24px 20px;
    }

    .inventory-pagination-summary,
    .inventory-pagination-page {
      color: #475569;
      font-size: 14px;
    }

    .inventory-pagination-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .inventory-pagination-actions button {
      min-width: 104px;
    }

    .inventory-action-stock-in,
    .inventory-action-stock-out,
    .inventory-action-edit,
    .inventory-action-archive {
      transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
    }

    .inventory-action-stock-in:not(:disabled):hover {
      background: #DCFCE7 !important;
      border-color: #16A34A !important;
      color: #15803D !important;
      box-shadow: 0 8px 18px rgba(22, 163, 74, 0.16);
      transform: translateY(-1px);
    }

    .inventory-action-stock-out:not(:disabled):hover {
      background: #FEE2E2 !important;
      border-color: #DC2626 !important;
      color: #B91C1C !important;
      box-shadow: 0 8px 18px rgba(220, 38, 38, 0.16);
      transform: translateY(-1px);
    }

    .inventory-action-edit:not(:disabled):hover {
      background: #DBEAFE !important;
      border-color: #2563EB !important;
      color: #1D4ED8 !important;
      box-shadow: 0 8px 18px rgba(37, 99, 235, 0.16);
      transform: translateY(-1px);
    }

    .inventory-action-archive:not(:disabled):hover {
      background: #FEF3C7 !important;
      border-color: #D97706 !important;
      color: #92400E !important;
      box-shadow: 0 8px 18px rgba(217, 119, 6, 0.18);
      transform: translateY(-1px);
    }

    .inventory-action-stock-in:not(:disabled):focus-visible {
      border-color: #16A34A !important;
      box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.22);
    }

    .inventory-action-stock-out:not(:disabled):focus-visible {
      border-color: #DC2626 !important;
      box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.22);
    }

    .inventory-action-edit:not(:disabled):focus-visible {
      border-color: #2563EB !important;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.22);
    }

    .inventory-action-archive:not(:disabled):focus-visible {
      border-color: #D97706 !important;
      box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.22);
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

      .inventory-pagination {
        flex-direction: column;
        align-items: stretch;
        padding: 14px 16px 16px;
      }

      .inventory-pagination-summary,
      .inventory-pagination-page {
        text-align: center;
      }

      .inventory-pagination-actions {
        display: grid;
        grid-template-columns: 1fr;
      }

      .inventory-pagination-actions button {
        width: 100%;
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

      .inventory-duplicate-dialog {
        max-width: min(100vw - 24px, 420px) !important;
      }

      .inventory-duplicate-main {
        grid-template-columns: 1fr !important;
        gap: 12px !important;
      }

      .inventory-duplicate-icon-panel {
        display: none !important;
      }

      .inventory-duplicate-copy {
        text-align: center;
      }

      .inventory-duplicate-accent {
        margin-left: auto;
        margin-right: auto;
      }

      .inventory-duplicate-note {
        grid-template-columns: 1fr !important;
        align-items: stretch !important;
        gap: 14px !important;
        text-align: center;
      }

      .inventory-duplicate-note-icon {
        display: none !important;
      }

      .inventory-duplicate-dialog .inventory-alert-dialog-footer {
        width: 100% !important;
        flex-direction: column-reverse !important;
        gap: 10px !important;
      }

      .inventory-duplicate-dialog .inventory-alert-dialog-footer button {
        width: 100% !important;
        min-height: 48px !important;
        border-radius: 12px !important;
        font-size: 14px !important;
      }

      .inventory-duplicate-dialog .inventory-alert-dialog-footer button:last-child {
        box-shadow: 0 10px 18px rgba(220, 38, 38, 0.18) !important;
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
    placeholder: "Search active inventory by item name or ID",
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
      setSimilarDuplicatePrompt(null);
      setNewItem({
        ...newItem,
        name: e.target.value
      });
    },
    placeholder: "e.g., Claw Hammer 16 oz",
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
  }, "Enter a specific item name with its size or specification. Example: Claw Hammer 16 oz.")), /*#__PURE__*/React.createElement("div", {
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
      setSimilarDuplicatePrompt(null);
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
    step: "1",
    inputMode: "numeric",
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
    className: "modal-button-cancel border-slate-200 bg-white text-slate-950 hover:bg-slate-50",
    style: {
      height: "38px",
      minWidth: "88px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px"
    },
    onClick: requestCloseAddItemDialog
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "modal-button-dark font-semibold shadow-lg",
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
  }, inventory.length === 0 ? "Items added to inventory will appear here." : "Try adjusting your search or category filter."))) : paginatedInventory.map(item => /*#__PURE__*/React.createElement(TableRow, {
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
    className: "inventory-action-stock-in border-green-500 text-green-700 hover:bg-green-50",
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
    className: "inventory-action-stock-out border-red-500 text-red-700 hover:bg-red-50",
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
    className: "inventory-action-edit border-blue-500 text-blue-700 hover:bg-blue-100",
    title: "Edit item details",
    onClick: () => openEditDialog(item)
  }, /*#__PURE__*/React.createElement(Pencil, {
    className: "w-4 h-4"
  })), user.role === "Admin" && /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    className: "inventory-action-archive border-amber-400 text-amber-800 hover:bg-amber-100 hover:border-amber-500 hover:text-amber-950",
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
  }, inventory.length === 0 ? "Items added to inventory will appear here." : "Try adjusting your search or category filter.")) : paginatedInventory.map(item => /*#__PURE__*/React.createElement("article", {
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
    className: "inventory-action-stock-in border-green-500 text-green-700 hover:bg-green-50",
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
    className: "inventory-action-stock-out border-red-500 text-red-700 hover:bg-red-50",
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
    className: "inventory-action-edit border-blue-500 text-blue-700 hover:bg-blue-100",
    title: "Edit item details",
    onClick: () => openEditDialog(item)
  }, /*#__PURE__*/React.createElement(Pencil, {
    className: "mr-1 h-4 w-4"
  }), "Edit"), user.role === "Admin" && /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "inventory-action-archive border-amber-400 text-amber-800 hover:bg-amber-100 hover:border-amber-500 hover:text-amber-950",
    title: "Archive: Remove item from list",
    onClick: () => {
      setSelectedItem(item);
      setIsArchiveDialogOpen(true);
    }
  }, /*#__PURE__*/React.createElement(Archive, {
    className: "mr-1 h-4 w-4"
  }), "Archive")))))), renderInventoryPagination(), renderEditDialog(), /*#__PURE__*/React.createElement(Dialog, {
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
    className: "modal-button-cancel border-slate-200 bg-white text-slate-950 hover:bg-slate-50",
    style: {
      height: "38px",
      minWidth: "88px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px"
    },
    onClick: requestCloseStockInDialog
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "modal-button-success font-semibold shadow-lg",
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
    className: "modal-button-cancel border-slate-200 bg-white text-slate-950 hover:bg-slate-50",
    style: {
      height: "38px",
      minWidth: "88px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px"
    },
    onClick: requestCloseStockOutDialog
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "modal-button-danger font-semibold shadow-lg",
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
    className: "modal-button-cancel border-slate-200 bg-white text-slate-950 hover:bg-slate-50",
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
    className: "modal-button-dark font-semibold shadow-lg transition-transform duration-150 active:scale-95",
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
    open: Boolean(similarDuplicatePrompt),
    onOpenChange: open => {
      if (!open) {
        setSimilarDuplicatePrompt(null);
      }
    }
  }, /*#__PURE__*/React.createElement(AlertDialogContent, {
    className: "inventory-alert-dialog-content inventory-duplicate-dialog border bg-white shadow-2xl",
    style: {
      width: "min(560px, calc(100vw - 32px))",
      maxWidth: "560px",
      padding: "24px",
      borderRadius: "14px",
      gap: "18px",
      borderColor: "#FF0000",
      borderWidth: "1px",
      boxShadow: "0 22px 50px rgba(15, 23, 42, 0.20)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-duplicate-main",
    style: {
      display: "grid",
      gridTemplateColumns: "56px minmax(0, 1fr)",
      gap: "16px",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-duplicate-icon-panel",
    style: {
      display: "flex",
      justifyContent: "center",
      paddingTop: "2px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex shrink-0 items-center justify-center",
    style: {
      width: "52px",
      height: "52px",
      borderRadius: "14px",
      background: "#FEF2F2",
      border: "1px solid #FECACA",
      color: "#FF0000"
    }
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    style: {
      width: "26px",
      height: "26px"
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "inventory-duplicate-copy min-w-0",
    style: {}
  }, /*#__PURE__*/React.createElement(AlertDialogTitle, {
    className: "font-bold leading-tight text-slate-950",
    style: {
      fontSize: "22px",
      letterSpacing: "0"
    }
  }, "Possible duplicate item"), /*#__PURE__*/React.createElement("div", {
    className: "inventory-duplicate-accent",
    style: {
      width: "48px",
      height: "3px",
      borderRadius: "999px",
      background: "#FF0000",
      marginTop: "10px",
      marginBottom: "16px"
    }
  }), /*#__PURE__*/React.createElement(AlertDialogDescription, {
    className: "text-sm leading-6 text-slate-700"
  }, similarDuplicatePrompt?.source === "archived" ? "An archived item named " : "An active item named ", /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-red-600"
  }, `"${similarDuplicatePrompt?.item?.name || "Matching item"}"`), " looks very similar to ", /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-red-600"
  }, `"${similarDuplicatePrompt?.proposedName || newItem.name || "this item"}"`), similarDuplicatePrompt?.action === "edit" ? ". If this is the same product, review the edit and use the existing item. If it is truly a different product, you may update it anyway." : similarDuplicatePrompt?.source === "archived" ? ". If this is the same product, cancel and restore the archived record. If it is truly a different product, you may add it as a separate record." : ". If this is the same product, cancel and use Stock In. If it is truly a different product, you may add it as a separate record."), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 flex max-w-full flex-col items-start text-sm leading-5 text-slate-600"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-800"
  }, "Category:"), " ", /*#__PURE__*/React.createElement("span", {
    className: "text-slate-950"
  }, normalizeCategory(similarDuplicatePrompt?.proposedCategory || similarDuplicatePrompt?.item?.category || newItem.category))), similarDuplicatePrompt?.item?.id ? /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-800"
  }, "ID:"), " ", /*#__PURE__*/React.createElement("span", {
    className: "text-slate-950"
  }, similarDuplicatePrompt.item.id)) : null))), /*#__PURE__*/React.createElement("div", {
    className: "inventory-duplicate-note",
    style: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      alignItems: "center",
      gap: "14px",
      borderTop: "1px solid #E5E7EB",
      marginTop: "2px",
      paddingTop: "18px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 text-slate-700"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-duplicate-note-icon flex shrink-0 items-center justify-center",
    style: {
      width: "32px",
      height: "32px",
      borderRadius: "999px",
      background: "#FEF9C3",
      color: "#FF0000"
    }
  }, /*#__PURE__*/React.createElement(Info, {
    style: {
      width: "17px",
      height: "17px"
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "text-sm leading-5 text-slate-600"
  }, "Please review before proceeding.")), /*#__PURE__*/React.createElement(AlertDialogFooter, {
    className: "inventory-alert-dialog-footer px-0 pb-0",
    style: {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: "10px"
    }
  }, /*#__PURE__*/React.createElement(AlertDialogCancel, {
    className: "modal-button-cancel border-slate-200 bg-white text-slate-950 hover:bg-slate-50",
    style: {
      height: "38px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px"
    },
    onClick: () => setSimilarDuplicatePrompt(null)
  }, similarDuplicatePrompt?.action === "edit" ? "Review Edit" : "Review Item"), /*#__PURE__*/React.createElement(AlertDialogAction, {
    className: "modal-button-danger bg-red-600 font-semibold text-white hover:bg-red-700",
    style: {
      height: "38px",
      minWidth: "124px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px"
    },
    onClick: confirmAddSimilarItem
  }, similarDuplicatePrompt?.action === "edit" ? "Update Anyway" : "Add Anyway"))))), /*#__PURE__*/React.createElement(AlertDialog, {
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
    className: "modal-button-cancel border-slate-200 bg-white text-slate-950 hover:bg-slate-50",
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
