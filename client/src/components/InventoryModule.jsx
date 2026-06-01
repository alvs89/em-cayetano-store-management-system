// Inventory module: manages branch stock records, stock-in/stock-out movements,
// archive actions, and reorder-support values.
import React from 'react';
import { useState } from "react";
import { Plus, Minus, Archive, Search, Filter, ArrowUpDown, AlertTriangle, Info, PackagePlus, PackageMinus, CheckCircle, Box, Pencil } from "lucide-react";
import { linearSearch, linearSearchAll, mergeSort } from "../utils/algorithms";
import { formatDateTime } from "../utils/format";
import { getStockStatusBadgeClass } from "../utils/statusStyles";
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
import { canManageInventory, canPerformInventoryMovement } from "../utils/roles";
import {
  MANUAL_STOCK_IN_REASON_OPTIONS,
  MANUAL_STOCK_OUT_REASON_OPTIONS,
  STOCK_IN_REASON_OPTIONS,
  getStockInReasonLabel,
  getStockOutReasonLabel,
} from "../utils/stockMovementReasons";
import {
  HARDWARE_SUPPLIER_OPTIONS,
  SUPPLIER_CUSTOM_VALUE,
  getSupplierSelectValue,
  isListedSupplier,
  sanitizeSupplierInput,
} from "../utils/suppliers";

const OFFICIAL_INVENTORY_CATEGORIES = [
  "Roofing",
  "PVC Pipe / Fittings",
  "Steel",
  "Kiln Dry",
  "Plywood",
  "Electricals",
  "Paints",
  "Other"
];

const ARCHIVE_REASON_OPTIONS = [
  { value: "discontinued", label: "Discontinued" },
  { value: "duplicate_record", label: "Duplicate Record" },
  { value: "wrong_entry", label: "Wrong Entry" },
  { value: "expired", label: "Expired" },
  { value: "no_longer_sold", label: "No Longer Sold" },
  { value: "other", label: "Other" }
];

const getArchiveReasonLabel = value =>
  ARCHIVE_REASON_OPTIONS.find(option => option.value === value)?.label || "";

const toTransactionDateInputValue = value => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

const getDatePartFromDateTime = value => String(value || "").slice(0, 10);
const getTimePartFromDateTime = value => String(value || "").slice(11, 16);
const getCurrentDateTimeInputValue = () => toTransactionDateInputValue(new Date());
const getCurrentDatePart = () => getCurrentDateTimeInputValue().slice(0, 10);
const getCurrentTimePart = () => getCurrentDateTimeInputValue().slice(11, 16);
const combineActualTransactionDateTime = (datePart, timePart) =>
  datePart && timePart ? `${datePart}T${timePart}` : "";

const isPastTransactionDate = value => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now() - 60 * 1000;
};

const CATEGORY_ALIASES = {
  roofing: "Roofing",
  roof: "Roofing",
  yero: "Roofing",
  pvc: "PVC Pipe / Fittings",
  "pvc pipe / fittings": "PVC Pipe / Fittings",
  "pvc pipes / fittings": "PVC Pipe / Fittings",
  "pvc pipe": "PVC Pipe / Fittings",
  "pvc pipes": "PVC Pipe / Fittings",
  fittings: "PVC Pipe / Fittings",
  fitting: "PVC Pipe / Fittings",
  plumbing: "PVC Pipe / Fittings",
  plumber: "PVC Pipe / Fittings",
  steel: "Steel",
  construction: "Steel",
  metal: "Steel",
  "kiln dry": "Kiln Dry",
  kiln: "Kiln Dry",
  lumber: "Kiln Dry",
  wood: "Kiln Dry",
  plywood: "Plywood",
  electricals: "Electricals",
  electrical: "Electricals",
  electric: "Electricals",
  paint: "Paints",
  paints: "Paints",
  tool: "Other",
  tools: "Other",
  tooling: "Other",
  cement: "Other",
  cements: "Other",
  hardware: "Other",
  fastener: "Other",
  fasteners: "Other",
  screw: "Other",
  screws: "Other",
  nail: "Other",
  nails: "Other",
  safety: "Other",
  misc: "Other",
  miscellaneous: "Other",
  other: "Other",
  others: "Other"
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
const isDecimalNumberText = value => /^\d+(?:\.\d{1,2})?$/.test(String(value ?? "").trim());
const notifyNumbersOnly = (fieldName, toastId) => {
  toast.warning(`${fieldName} accepts numbers only.`, {
    id: toastId,
    duration: 2400
  });
};
const sanitizeWholeNumberInput = (value, fieldName, toastId) => {
  const rawValue = String(value ?? "");
  const cleaned = rawValue.replace(/\D/g, "");
  if (rawValue !== cleaned) notifyNumbersOnly(fieldName, toastId);
  return cleaned;
};
const sanitizeDecimalInput = (value, fieldName, toastId, decimalPlaces = 2) => {
  const rawValue = String(value ?? "");
  if (/[^0-9.]/.test(rawValue) || (rawValue.match(/\./g) || []).length > 1) {
    notifyNumbersOnly(fieldName, toastId);
  }
  const cleaned = rawValue.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  const decimals = decimalParts.join("").slice(0, decimalPlaces);
  return decimalParts.length > 0 ? `${whole}.${decimals}` : whole;
};
const sanitizeInventoryTextInput = (value, fieldName, toastId) => {
  const rawValue = String(value ?? "");
  const cleaned = rawValue.replace(/[^A-Za-z0-9À-ÖØ-öø-ÿÑñ #./,'"()&+_-]/g, "");
  if (rawValue !== cleaned) {
    toast.warning(`${fieldName} accepts letters, numbers, and common item characters only.`, {
      id: toastId,
      duration: 2600
    });
  }
  return cleaned;
};
const getActiveLowStockThreshold = item =>
  Number(item?.activeLowStockThreshold ?? item?.reorderLevel ?? 0);
const getRecommendedReorderPoint = item => (
  item?.recommendedReorderPoint === "" || item?.recommendedReorderPoint === null || item?.recommendedReorderPoint === undefined
    ? null
    : Number(item.recommendedReorderPoint)
);
const formatOptionalDays = value => {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return "No supplier lead time set yet.";
  return `${days} day${days === 1 ? "" : "s"}`;
};
const getReorderSupportMessage = item => {
  if (!String(item?.supplierName || "").trim()) return "Supplier planning value is unavailable because no supplier is assigned.";
  const recommended = getRecommendedReorderPoint(item);
  if (recommended === null) return "No supplier lead time set yet.";
  return `Suggested reorder point: ${recommended} unit${recommended === 1 ? "" : "s"}.`;
};
const parsePlanningNumber = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const getEstimatedReorderPreview = ({ supplierName, averageDailySales, leadTimeDays, safetyStock }) => {
  if (!String(supplierName || "").trim()) {
    return {
      value: null,
      message: "Supplier planning value is unavailable because no supplier is assigned."
    };
  }

  const sales = parsePlanningNumber(averageDailySales);
  const leadTime = parsePlanningNumber(leadTimeDays);
  const buffer = parsePlanningNumber(safetyStock) ?? 0;

  if (sales !== null && sales < 0) {
    return {
      value: null,
      message: "Average Daily Sales must be 0 or higher."
    };
  }

  if (leadTime === null || leadTime <= 0) {
    return {
      value: null,
      message: "Enter Supplier Lead Time to preview the suggested reorder point."
    };
  }

  const estimate = Math.ceil(Math.max(0, sales ?? 0) * Math.max(0, leadTime) + Math.max(0, buffer));
  return {
    value: estimate,
    message: `Suggested reorder point: ${estimate} unit${estimate === 1 ? "" : "s"}.`
  };
};
const getComputedStockStatus = item => {
  const quantity = Number(item?.quantity || 0);
  if (quantity <= 0) return "Out of Stock";
  return quantity <= getActiveLowStockThreshold(item) ? "Low Stock" : "In Stock";
};
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
    batchStockAdjustment,
    batchStockOut,
    archiveInventoryItem,
    restoreArchivedInventoryItem,
    archivedInventory,
  } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isStockInDialogOpen, setIsStockInDialogOpen] = useState(false);
  const [isStockOutDialogOpen, setIsStockOutDialogOpen] = useState(false);
  const [isBatchStockAdjustmentDialogOpen, setIsBatchStockAdjustmentDialogOpen] = useState(false);
  const [isBatchStockOutDialogOpen, setIsBatchStockOutDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [stockAmount, setStockAmount] = useState("");
  const [stockInReason, setStockInReason] = useState("");
  const [stockOutReason, setStockOutReason] = useState("");
  const [stockActualTransactionAt, setStockActualTransactionAt] = useState("");
  const [stockBackdateReason, setStockBackdateReason] = useState("");
  const [batchStockAdjustmentReason, setBatchStockAdjustmentReason] = useState("");
  const [batchStockAdjustmentRows, setBatchStockAdjustmentRows] = useState([{ inventoryId: "", quantity: "" }]);
  const [batchStockAdjustmentActualTransactionAt, setBatchStockAdjustmentActualTransactionAt] = useState("");
  const [batchStockAdjustmentBackdateReason, setBatchStockAdjustmentBackdateReason] = useState("");
  const [batchStockOutReason, setBatchStockOutReason] = useState("");
  const [batchStockOutRows, setBatchStockOutRows] = useState([{ inventoryId: "", quantity: "" }]);
  const [batchStockOutActualTransactionAt, setBatchStockOutActualTransactionAt] = useState("");
  const [batchStockOutBackdateReason, setBatchStockOutBackdateReason] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [discardPrompt, setDiscardPrompt] = useState(null);
  const [archivedDuplicatePrompt, setArchivedDuplicatePrompt] = useState(null);
  const [similarDuplicatePrompt, setSimilarDuplicatePrompt] = useState(null);
  const [isRestoringArchivedDuplicate, setIsRestoringArchivedDuplicate] = useState(false);
  const [newItemSupplierMode, setNewItemSupplierMode] = useState("listed");
  const [editItemSupplierMode, setEditItemSupplierMode] = useState("listed");
  const [editItem, setEditItem] = useState({
    name: "",
    category: "",
    supplierName: "",
    defaultSellingPrice: "",
    costPrice: "",
    reorderLevel: "",
    leadTimeDays: "",
    safetyStock: ""
  });

  // 🔄 Sorting state: track which column and direction to sort
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isDashboardTemporaryInventoryFilterActive, setIsDashboardTemporaryInventoryFilterActive] = useState(false);
  const [highlightedInventoryRowId, setHighlightedInventoryRowId] = useState(null);
  const [dashboardPickerAction, setDashboardPickerAction] = useState(null);
  const [dashboardPickerItemId, setDashboardPickerItemId] = useState("");
  const categories = OFFICIAL_INVENTORY_CATEGORIES;
  const hasActiveInventoryFilters =
    searchQuery.trim() !== "" ||
    categoryFilter !== "all" ||
    supplierFilter !== "all" ||
    stockStatusFilter !== "all";
  const canShowInventoryActions =
    canPerformInventoryMovement(user?.role) || canManageInventory(user?.role);
  const canEditReorderPlanning = canManageInventory(user?.role);
  const canViewReorderPlanning =
    canEditReorderPlanning || canPerformInventoryMovement(user?.role);
  const inventoryTableColumnCount =
    8 + (canViewReorderPlanning ? 1 : 0) + (canShowInventoryActions ? 1 : 0);
  const markInventoryFiltersManual = () => {
    setIsDashboardTemporaryInventoryFilterActive(false);
  };
  const updateInventorySearchQuery = value => {
    markInventoryFiltersManual();
    setSearchQuery(value);
    setCurrentPage(1);
  };
  const updateInventoryCategoryFilter = value => {
    markInventoryFiltersManual();
    setCategoryFilter(value);
    setCurrentPage(1);
  };
  const updateInventorySupplierFilter = value => {
    markInventoryFiltersManual();
    setSupplierFilter(value);
    setCurrentPage(1);
  };
  const updateInventoryStatusFilter = value => {
    markInventoryFiltersManual();
    setStockStatusFilter(value);
    setCurrentPage(1);
  };
  const clearInventoryFilters = () => {
    markInventoryFiltersManual();
    setSearchQuery("");
    setCategoryFilter("all");
    setSupplierFilter("all");
    setStockStatusFilter("all");
    setCurrentPage(1);
  };
  const supplierFilterOptions = React.useMemo(() => {
    const supplierNames = new Set();
    inventory.forEach(item => {
      const supplierName = item.supplierName?.trim();
      if (supplierName) supplierNames.add(supplierName);
    });

    return mergeSort([...supplierNames], (a, b) => a.localeCompare(b));
  }, [inventory]);
  const currentBranch = normalizeDuplicateKeyPart(user?.branch);
  const buildDuplicateKey = item => [
    normalizeInventoryIdentityName(item.name),
    normalizeDuplicateKeyPart(normalizeCategory(item.category)),
    normalizeDuplicateKeyPart(item.branch || user?.branch)
  ].join("|");
  const [newItem, setNewItem] = useState({
    name: "",
    category: "",
    supplierName: "",
    defaultSellingPrice: "",
    costPrice: "",
    quantity: "",
    reorderLevel: "10", // Default manual threshold
    leadTimeDays: "",
    safetyStock: ""
  });

  const getStockPreview = direction => {
    const currentStock = Number(selectedItem?.quantity || 0);
    const enteredQuantity = Math.max(0, Number(stockAmount || 0));
    const signedQuantity = direction === "out" ? -enteredQuantity : enteredQuantity;
    const newStockBalance = direction === "out"
      ? currentStock - enteredQuantity
      : currentStock + enteredQuantity;

    return {
      currentStock,
      enteredQuantity,
      signedQuantity,
      newStockBalance
    };
  };

  const formatStockUnits = value => `${value} ${value === 1 ? "unit" : "units"}`;

  const renderStockPreview = direction => {
    const preview = getStockPreview(direction);
    const isStockOut = direction === "out";
    const lowStockThreshold = getActiveLowStockThreshold(selectedItem);
    const tone = isStockOut
      ? {
          text: "text-red-950",
          icon: "text-red-600",
          border: "#FECACA",
          background: "#FEF2F2",
          rowBorder: "#FECACA",
          rowBackground: "#FFFFFF"
        }
      : {
          text: "text-green-950",
          icon: "text-green-600",
          border: "#BBF7D0",
          background: "#F0FDF4",
          rowBorder: "#BBF7D0",
          rowBackground: "#FFFFFF"
        };
    const rows = [
      ["Current Stock", formatStockUnits(preview.currentStock)],
      [isStockOut ? "Stock Out Quantity" : "Stock In Quantity", `${isStockOut ? "-" : "+"}${formatStockUnits(preview.enteredQuantity)}`],
      ["New Stock Balance", formatStockUnits(preview.newStockBalance)],
      ["Low-Stock Threshold", formatStockUnits(Number(lowStockThreshold))]
    ];

    return /*#__PURE__*/React.createElement("div", {
      className: `inventory-stock-preview ${tone.text}`,
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "10px",
        border: `1px solid ${tone.border}`,
        background: tone.background,
        borderRadius: "12px",
        padding: "14px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        textAlign: "center"
      }
    }, isStockOut ? /*#__PURE__*/React.createElement(Info, {
      className: `shrink-0 ${tone.icon}`,
      style: {
        width: "20px",
        height: "20px"
      }
    }) : /*#__PURE__*/React.createElement(CheckCircle, {
      className: `shrink-0 ${tone.icon}`,
      style: {
        width: "20px",
        height: "20px"
      }
    }), /*#__PURE__*/React.createElement("p", {
      className: "font-semibold",
      style: {
        fontSize: "16px",
        lineHeight: "1.25"
      }
    }, "Stock Preview")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "8px"
      }
    }, rows.map(([label, value]) => /*#__PURE__*/React.createElement("div", {
      key: label,
      style: {
        border: `1px solid ${tone.rowBorder}`,
        background: tone.rowBackground,
        borderRadius: "10px",
        padding: "9px 10px",
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-slate-700",
      style: {
        fontSize: "12px",
        lineHeight: "1.2",
        marginBottom: "4px"
      }
    }, label), /*#__PURE__*/React.createElement("p", {
      className: "font-semibold text-slate-950",
      style: {
        fontSize: "14px",
        lineHeight: "1.25",
        overflowWrap: "anywhere"
      }
    }, value)))));
  };

  const renderActualTransactionDateFields = ({
    idPrefix,
    value,
    onChange,
    reasonValue,
    onReasonChange,
    recordLabel = "record"
  }) => {
    const datePart = getDatePartFromDateTime(value);
    const timePart = getTimePartFromDateTime(value);
    return /*#__PURE__*/React.createElement("div", {
      className: "space-y-2"
    }, /*#__PURE__*/React.createElement(Label, {
      className: "font-semibold text-slate-950",
      style: {
        display: "block",
        marginBottom: "8px",
        fontSize: "14px",
        lineHeight: "1.25"
      }
    }, "Actual Transaction Date, optional"), /*#__PURE__*/React.createElement("div", {
      className: "actual-transaction-split-grid"
    }, /*#__PURE__*/React.createElement("div", {
      className: "actual-transaction-split-field"
    }, /*#__PURE__*/React.createElement(Label, {
      htmlFor: `${idPrefix}-actual-transaction-date`,
      className: "actual-transaction-split-label"
    }, "Date"), /*#__PURE__*/React.createElement(Input, {
      id: `${idPrefix}-actual-transaction-date`,
      type: "date",
      value: datePart,
      max: getCurrentDatePart(),
      onChange: event => {
        const nextDate = event.target.value;
        onChange(nextDate ? combineActualTransactionDateTime(nextDate, timePart || getCurrentTimePart()) : "");
      },
      className: "actual-transaction-part-input"
    })), /*#__PURE__*/React.createElement("div", {
      className: "actual-transaction-split-field"
    }, /*#__PURE__*/React.createElement(Label, {
      htmlFor: `${idPrefix}-actual-transaction-time`,
      className: "actual-transaction-split-label"
    }, "Time"), /*#__PURE__*/React.createElement(Input, {
      id: `${idPrefix}-actual-transaction-time`,
      type: "time",
      value: timePart,
      onChange: event => {
        const nextTime = event.target.value;
        onChange(nextTime ? combineActualTransactionDateTime(datePart || getCurrentDatePart(), nextTime) : "");
      },
      className: "actual-transaction-part-input"
    }))), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700",
    style: {
      fontSize: "12px",
      lineHeight: "1.45"
    }
  }, "Use this if the transaction was recorded manually and encoded later. Leave both blank to use the current date and time."), isPastTransactionDate(value) && /*#__PURE__*/React.createElement("div", {
    className: "space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-semibold text-amber-900"
  }, `This ${recordLabel} will be saved as a backdated transaction.`), /*#__PURE__*/React.createElement(Label, {
    htmlFor: `${idPrefix}-backdate-reason`,
    className: "block text-sm font-semibold text-amber-950"
  }, "Backdate reason, optional"), /*#__PURE__*/React.createElement(Input, {
    id: `${idPrefix}-backdate-reason`,
    value: reasonValue,
    maxLength: 240,
    onChange: event => onReasonChange(event.target.value),
    placeholder: "Example: Encoded after power outage",
    className: "h-11 rounded-xl border-amber-200 bg-white text-slate-950"
  })));
  };

  const highlightInventoryRow = React.useCallback(id => {
    if (!id) return;
    const normalizedId = String(id);
    setHighlightedInventoryRowId(normalizedId);
    window.setTimeout(() => {
      setHighlightedInventoryRowId(currentId => currentId === normalizedId ? null : currentId);
    }, 2400);
  }, []);

  // 🔍 Filtered inventory using Linear Search Algorithm
  // Linear Search: O(n) - iterates through each item sequentially
  // Used here because we're filtering with multiple criteria (search + category)
  const inventoryFilterContext = linearSearchAll(inventory, item => {
    const query = searchQuery.trim().toLowerCase();
    const supplierName = item.supplierName?.trim() || "";
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.itemCode?.toLowerCase().includes(query) ||
      String(item.id || "").toLowerCase().includes(query) ||
      item.productId?.toLowerCase().includes(query);
    const matchesCategory = categoryFilter === "all" || normalizeCategory(item.category) === categoryFilter;
    const matchesSupplier = supplierFilter === "all" ||
      (supplierFilter === "unassigned" ? !supplierName : supplierName === supplierFilter);
    return matchesSearch && matchesCategory && matchesSupplier;
  });

  const filteredInventory = stockStatusFilter === "all"
    ? inventoryFilterContext
    : linearSearchAll(inventoryFilterContext, item => getComputedStockStatus(item) === stockStatusFilter);

  const inventoryStatusOverview = React.useMemo(() => {
    return inventoryFilterContext.reduce((summary, item) => {
      const status = getComputedStockStatus(item);
      return {
        ...summary,
        [status]: (summary[status] || 0) + 1
      };
    }, {
      "Out of Stock": 0,
      "Low Stock": 0,
      "In Stock": 0
    });
  }, [inventoryFilterContext]);

  const inventoryStatusOverviewItems = [
    {
      status: "all",
      label: "All Items",
      count: inventoryFilterContext.length,
      className: "inventory-overview-pill-all"
    },
    {
      status: "Out of Stock",
      label: "Out of Stock",
      count: inventoryStatusOverview["Out of Stock"],
      className: "inventory-overview-pill-out"
    },
    {
      status: "Low Stock",
      label: "Low Stock",
      count: inventoryStatusOverview["Low Stock"],
      className: "inventory-overview-pill-low"
    },
    {
      status: "In Stock",
      label: "In Stock",
      count: inventoryStatusOverview["In Stock"],
      className: "inventory-overview-pill-in"
    }
  ];

  const getInventoryId = item => item.id || "";
  const getInventoryDate = item => new Date(item.lastUpdated || 0).getTime();
  const compareOptionalNumber = (a, b, getValue, direction) => {
    const aValue = Number(getValue(a));
    const bValue = Number(getValue(b));
    const aHasValue = Number.isFinite(aValue) && aValue > 0;
    const bHasValue = Number.isFinite(bValue) && bValue > 0;

    if (!aHasValue && !bHasValue) return 0;
    if (!aHasValue) return 1;
    if (!bHasValue) return -1;
    return (aValue - bValue) * direction;
  };

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
      case 'supplier':
        return mergeSort(filteredInventory, (a, b) => (a.supplierName || '').localeCompare(b.supplierName || '') * direction);
      case 'srp':
        return mergeSort(filteredInventory, (a, b) => compareOptionalNumber(a, b, item => item.defaultSellingPrice, direction));
      case 'quantity':
        return mergeSort(filteredInventory, (a, b) => ((a.quantity ?? 0) - (b.quantity ?? 0)) * direction);
      case 'status':
        return mergeSort(filteredInventory, (a, b) => ((STATUS_PRIORITY[getComputedStockStatus(a)] ?? 999) - (STATUS_PRIORITY[getComputedStockStatus(b)] ?? 999)) * direction);
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
  }, [searchQuery, categoryFilter, supplierFilter, stockStatusFilter, sortBy, sortOrder]);

  React.useEffect(() => {
    setCurrentPage(page => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  React.useEffect(() => {
    if (!highlightedInventoryRowId) return;
    const highlightedIndex = sortedInventory.findIndex(item => String(item.id) === highlightedInventoryRowId);
    if (highlightedIndex < 0) return;
    const highlightedPage = Math.floor(highlightedIndex / INVENTORY_ITEMS_PER_PAGE) + 1;
    setCurrentPage(page => page === highlightedPage ? page : highlightedPage);
  }, [highlightedInventoryRowId, sortedInventory]);

  React.useEffect(() => {
    if (!highlightedInventoryRowId) return;
    const timeoutId = window.setTimeout(() => {
      const target = Array.from(document.querySelectorAll("[data-inventory-record-id]"))
        .find(element => element.getAttribute("data-inventory-record-id") === highlightedInventoryRowId);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      if (typeof target.focus === "function") {
        target.focus({ preventScroll: true });
      }
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedInventoryRowId, currentPage]);

  const focusInventoryRecord = React.useCallback(id => {
    if (!id) return;
    const normalizedId = String(id);
    if (!inventory.some(item => String(item.id) === normalizedId)) return;
    setSearchQuery("");
    setCategoryFilter("all");
    setSupplierFilter("all");
    setStockStatusFilter("all");
    setSortBy("name");
    setSortOrder("asc");
    setCurrentPage(1);
    highlightInventoryRow(normalizedId);
  }, [inventory, highlightInventoryRow]);

  React.useEffect(() => {
    const pendingHighlightId = localStorage.getItem("inventoryRowHighlightId");
    if (!pendingHighlightId) return;
    if (!inventory.some(item => String(item.id) === pendingHighlightId)) return;
    highlightInventoryRow(pendingHighlightId);
    localStorage.removeItem("inventoryRowHighlightId");
  }, [inventory, highlightInventoryRow]);

  React.useEffect(() => {
    const handleInventoryRowHighlight = event => {
      const highlightedId = event.detail?.id;
      if (highlightedId) highlightInventoryRow(highlightedId);
    };
    window.addEventListener("inventory-row-highlight", handleInventoryRowHighlight);
    return () => window.removeEventListener("inventory-row-highlight", handleInventoryRowHighlight);
  }, [highlightInventoryRow]);

  React.useEffect(() => {
    const pendingFocusId = localStorage.getItem("inventoryFocusItemId");
    if (pendingFocusId && inventory.some(item => String(item.id) === pendingFocusId)) {
      localStorage.removeItem("inventoryFocusItemId");
      focusInventoryRecord(pendingFocusId);
    }

    const handleInventoryFocusItem = event => {
      const focusedId = event.detail?.id;
      if (focusedId) {
        localStorage.removeItem("inventoryFocusItemId");
        focusInventoryRecord(focusedId);
      }
    };

    window.addEventListener("inventory-focus-item", handleInventoryFocusItem);
    return () => window.removeEventListener("inventory-focus-item", handleInventoryFocusItem);
  }, [inventory, focusInventoryRecord]);

  // 🔀 Handle column header click to change sort
  const handleSort = column => {
    markInventoryFiltersManual();
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

  const renderStaticHeaderLabel = (label, align = 'left') => /*#__PURE__*/React.createElement("span", {
    className: `block w-full font-semibold text-slate-950 ${align === 'right' ? 'text-right' : 'text-left'}`
  }, label);

  const renderInventoryStatusOverview = () => /*#__PURE__*/React.createElement("div", {
    className: "inventory-status-overview",
    "aria-label": "Inventory status overview"
  }, inventoryStatusOverviewItems.map(item => /*#__PURE__*/React.createElement("button", {
    key: item.status,
    type: "button",
    className: `inventory-overview-pill ${item.className} ${(item.status === "all" ? stockStatusFilter === "all" : stockStatusFilter === item.status) ? "inventory-overview-pill-active" : ""}`,
    onClick: () => updateInventoryStatusFilter(item.status),
    "aria-pressed": item.status === "all" ? stockStatusFilter === "all" : stockStatusFilter === item.status,
    title: item.status === "all" ? "Show all inventory items" : `Show ${item.label} items`
  }, /*#__PURE__*/React.createElement("span", {
    className: "inventory-overview-count"
  }, item.count), /*#__PURE__*/React.createElement("span", {
    className: "inventory-overview-label"
  }, item.label))));

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
    onClick: () => {
      markInventoryFiltersManual();
      setCurrentPage(page => Math.max(1, page - 1));
    }
  }, "Previous"), /*#__PURE__*/React.createElement("span", {
    className: "inventory-pagination-page"
  }, "Page ", currentPage, " of ", totalPages), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "outline",
    disabled: currentPage >= totalPages,
    onClick: () => {
      markInventoryFiltersManual();
      setCurrentPage(page => Math.min(totalPages, page + 1));
    }
  }, "Next Page"))) : null;

  const resetStockForm = () => {
    setStockAmount("");
    setStockInReason("");
    setStockOutReason("");
    setStockActualTransactionAt("");
    setStockBackdateReason("");
  };

  const resetBatchStockAdjustmentForm = () => {
    setBatchStockAdjustmentReason("");
    setBatchStockAdjustmentRows([{ inventoryId: "", quantity: "" }]);
    setBatchStockAdjustmentActualTransactionAt("");
    setBatchStockAdjustmentBackdateReason("");
  };

  const resetBatchStockOutForm = () => {
    setBatchStockOutReason("");
    setBatchStockOutRows([{ inventoryId: "", quantity: "" }]);
    setBatchStockOutActualTransactionAt("");
    setBatchStockOutBackdateReason("");
  };

  const resetAddItemForm = () => {
    setNewItem({
      name: "",
      category: "",
      supplierName: "",
      defaultSellingPrice: "",
      costPrice: "",
      quantity: "",
      reorderLevel: "10",
      leadTimeDays: "",
      safetyStock: ""
    });
    setNewItemSupplierMode("listed");
    setArchivedDuplicatePrompt(null);
    setSimilarDuplicatePrompt(null);
  };

  const applyDashboardInventoryAction = React.useCallback((action, itemId = "") => {
    if (!action) return;
    if (action === "add-item") {
      if (!canManageInventory(user?.role)) {
        toast.error("Admin / Manager access is required to add a new inventory item.");
        return;
      }
      setDashboardPickerAction(null);
      setIsAddDialogOpen(true);
      return;
    }

    if (action === "daily-sales-deduction") {
      if (!canPerformInventoryMovement(user?.role)) {
        toast.error("Batch Stock Out is available only to Admin / Manager and Inventory Staff accounts.");
        return;
      }
      setDashboardPickerAction(null);
      setIsBatchStockOutDialogOpen(true);
      return;
    }

    if (action === "stock-in") {
      if (!canPerformInventoryMovement(user?.role)) {
        toast.error("Stock In is available only to Admin / Manager and Inventory Staff accounts.");
        return;
      }
      setDashboardPickerItemId(itemId ? String(itemId) : "");
      setDashboardPickerAction("stock-in");
      return;
    }

    if (action === "stock-out") {
      if (!canPerformInventoryMovement(user?.role)) {
        toast.error("Stock Out is available only to Admin / Manager and Inventory Staff accounts.");
        return;
      }
      setDashboardPickerItemId(itemId ? String(itemId) : "");
      setDashboardPickerAction("stock-out");
    }
  }, [user?.role]);

  const applyDashboardInventoryStatusFilter = React.useCallback(status => {
    const allowedStatuses = new Set(["all", ...Object.keys(STATUS_PRIORITY)]);
    const nextStatus = allowedStatuses.has(status) ? status : "all";

    setIsDashboardTemporaryInventoryFilterActive(true);
    setSearchQuery("");
    setCategoryFilter("all");
    setSupplierFilter("all");
    setStockStatusFilter(nextStatus);
    setCurrentPage(1);
  }, []);

  const resetDashboardInventoryFilters = React.useCallback(() => {
    localStorage.removeItem("dashboardInventoryStatusFilter");
    localStorage.removeItem("dashboardInventoryAction");
    localStorage.removeItem("dashboardInventoryItemId");
    localStorage.removeItem("dashboardSearchStatusFilter");
    if (!isDashboardTemporaryInventoryFilterActive) return;
    setSearchQuery("");
    setCategoryFilter("all");
    setSupplierFilter("all");
    setStockStatusFilter("all");
    setCurrentPage(1);
    setIsDashboardTemporaryInventoryFilterActive(false);
  }, [isDashboardTemporaryInventoryFilterActive]);

  React.useEffect(() => {
    const shouldResetInventory = localStorage.getItem("dashboardInventoryReset") === "true";
    const pendingAction = localStorage.getItem("dashboardInventoryAction");
    const pendingItemId = localStorage.getItem("dashboardInventoryItemId") || "";
    const pendingStatusFilter = localStorage.getItem("dashboardInventoryStatusFilter");
    if (shouldResetInventory) {
      localStorage.removeItem("dashboardInventoryReset");
      window.setTimeout(() => resetDashboardInventoryFilters(), 0);
    }
    if (pendingAction) {
      localStorage.removeItem("dashboardInventoryAction");
      localStorage.removeItem("dashboardInventoryItemId");
      window.setTimeout(() => applyDashboardInventoryAction(pendingAction, pendingItemId), 0);
    }
    if (pendingStatusFilter) {
      localStorage.removeItem("dashboardInventoryStatusFilter");
      window.setTimeout(() => applyDashboardInventoryStatusFilter(pendingStatusFilter), 0);
    }

    const handleDashboardInventoryAction = event => {
      localStorage.removeItem("dashboardInventoryAction");
      localStorage.removeItem("dashboardInventoryItemId");
      applyDashboardInventoryAction(event.detail?.action, event.detail?.itemId || "");
    };
    const handleDashboardInventoryStatusFilter = event => {
      localStorage.removeItem("dashboardInventoryStatusFilter");
      applyDashboardInventoryStatusFilter(event.detail?.status || "all");
    };
    const handleDashboardInventoryReset = () => {
      localStorage.removeItem("dashboardInventoryReset");
      resetDashboardInventoryFilters();
    };

    window.addEventListener("dashboard-inventory-action", handleDashboardInventoryAction);
    window.addEventListener("dashboard-inventory-status-filter", handleDashboardInventoryStatusFilter);
    window.addEventListener("dashboard-inventory-reset", handleDashboardInventoryReset);
    return () => {
      window.removeEventListener("dashboard-inventory-action", handleDashboardInventoryAction);
      window.removeEventListener("dashboard-inventory-status-filter", handleDashboardInventoryStatusFilter);
      window.removeEventListener("dashboard-inventory-reset", handleDashboardInventoryReset);
    };
  }, [applyDashboardInventoryAction, applyDashboardInventoryStatusFilter, resetDashboardInventoryFilters]);

  const closeDashboardPicker = () => {
    setDashboardPickerAction(null);
    setDashboardPickerItemId("");
  };

  const continueDashboardStockAction = () => {
    const item = inventory.find(inventoryItem => String(inventoryItem.id) === String(dashboardPickerItemId));
    if (!item) {
      toast.error("Please select an inventory item first.");
      return;
    }

    setSelectedItem(item);
    resetStockForm();
    closeDashboardPicker();

    if (dashboardPickerAction === "stock-in") {
      setIsStockInDialogOpen(true);
      return;
    }

    if (dashboardPickerAction === "stock-out") {
      setIsStockOutDialogOpen(true);
    }
  };

  const hasAddItemChanges = () => {
    return newItem.name.trim() !== "" ||
      newItem.category.trim() !== "" ||
      newItem.supplierName.trim() !== "" ||
      newItem.defaultSellingPrice.trim() !== "" ||
      newItem.costPrice.trim() !== "" ||
      newItem.quantity !== "" ||
      newItem.reorderLevel !== "10" ||
      newItem.leadTimeDays !== "" ||
      newItem.safetyStock !== "";
  };

  const hasStockFormChanges = () => {
    return stockAmount !== "" || stockInReason !== "" || stockOutReason !== "" || stockActualTransactionAt !== "" || stockBackdateReason !== "";
  };

  const hasBatchStockOutChanges = () => {
    return batchStockOutReason !== "" ||
      batchStockOutActualTransactionAt !== "" ||
      batchStockOutBackdateReason !== "" ||
      batchStockOutRows.some(row => row.inventoryId || row.quantity);
  };

  const hasEditItemChanges = () => {
    if (!selectedItem) return false;
    return editItem.name.trim() !== selectedItem.name ||
      normalizeCategory(editItem.category) !== normalizeCategory(selectedItem.category) ||
      editItem.supplierName.trim() !== (selectedItem.supplierName || "") ||
      String(editItem.defaultSellingPrice || "") !== String(selectedItem.defaultSellingPrice ?? "") ||
      String(editItem.costPrice || "") !== String(selectedItem.costPrice ?? "") ||
      String(editItem.reorderLevel) !== String(selectedItem.reorderLevel) ||
      String(editItem.leadTimeDays || "") !== String(selectedItem.leadTimeDays ?? "") ||
      String(editItem.safetyStock || "") !== String(selectedItem.safetyStock ?? "");
  };

  const closeAddItemDialog = () => {
    setDiscardPrompt(null);
    setSimilarDuplicatePrompt(null);
    setArchivedDuplicatePrompt(null);
    setIsAddDialogOpen(false);
    resetAddItemForm();
  };

  const closeStockInDialog = () => {
    setIsStockInDialogOpen(false);
    setSelectedItem(null);
    resetStockForm();
  };

  const closeBatchStockAdjustmentDialog = () => {
    setIsBatchStockAdjustmentDialogOpen(false);
    resetBatchStockAdjustmentForm();
  };

  const closeBatchStockOutDialog = () => {
    setIsBatchStockOutDialogOpen(false);
    resetBatchStockOutForm();
  };

  const closeEditDialog = () => {
    setDiscardPrompt(null);
    setSimilarDuplicatePrompt(null);
    setIsEditDialogOpen(false);
    setSelectedItem(null);
    setEditItem({
      name: "",
      category: "",
      supplierName: "",
      defaultSellingPrice: "",
      reorderLevel: "",
      costPrice: "",
      leadTimeDays: "",
      safetyStock: ""
    });
    setEditItemSupplierMode("listed");
  };

  const requestCloseAddItemDialog = () => {
    closeAddItemDialog();
  };

  const requestCloseStockInDialog = () => {
    closeStockInDialog();
  };

  const requestCloseStockOutDialog = () => {
    closeStockOutDialog();
  };

  const requestCloseBatchStockAdjustmentDialog = () => {
    closeBatchStockAdjustmentDialog();
  };

  const requestCloseBatchStockOutDialog = () => {
    closeBatchStockOutDialog();
  };

  const requestCloseEditDialog = () => {
    closeEditDialog();
  };

  const discardDialogCopy = {
    addItem: {
      title: "Discard new item?",
      description: "You have unsaved item details. Closing this form will remove the information you entered."
    },
    stockIn: {
      title: "Discard stock-in entry?",
      description: "You have entered stock-in details. Closing this form will clear the quantity and reason, and keep the inventory unchanged."
    },
    stockOut: {
      title: "Discard stock-out entry?",
      description: "You have entered stock-out details. Closing this form will clear the quantity and reason, and keep the inventory unchanged."
    },
    batchStockOut: {
      title: "Discard batch stock-out entry?",
      description: "You have entered batch stock-out details. Closing this form will clear all selected items and keep the inventory unchanged."
    },
    editItem: {
      title: "Discard item edits?",
      description: "You have unsaved item detail changes. Closing this form will keep the current inventory record unchanged."
    }
  };

  const confirmDiscardChanges = promptOverride => {
    const prompt = promptOverride || discardPrompt;
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
    if (prompt === "batchStockOut") {
      closeBatchStockOutDialog();
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

  const closeArchiveDialog = () => {
    setIsArchiveDialogOpen(false);
    setSelectedItem(null);
    setArchiveReason("");
  };
  
  // Human-friendly sort labels depending on column type
  const sortLabel = (() => {
    if (sortBy === 'id') return 'Item Code';
    if (sortBy === 'date') return 'Last Updated';
    return sortBy.charAt(0).toUpperCase() + sortBy.slice(1);
  })();
  const displayOrderLabel = (() => {
    if (sortBy === 'id' || sortBy === 'quantity') return sortOrder === 'asc' ? 'Low to High' : 'High to Low';
    if (sortBy === 'date') return sortOrder === 'asc' ? 'Oldest First' : 'Newest First';
    return sortOrder === 'asc' ? 'A to Z' : 'Z to A';
  })();

  const realtimeDisplayOrderLabel = filteredInventory.length === 0 ? "No items" : displayOrderLabel;

  const renderAddSectionHeader = title => (
    <div className="inventory-add-section-title">
      <span className="inventory-add-section-title-text">{title}</span>
    </div>
  );

  const renderSupplierField = ({
    id,
    value,
    mode,
    setMode,
    onSupplierChange,
    toastId,
    helperText
  }) => {
    const trimmedValue = String(value || "").trim();
    const listedSupplierSelected = isListedSupplier(trimmedValue);
    const isCustomSupplier = mode === "custom" || (trimmedValue !== "" && !listedSupplierSelected);
    const supplierSelectValue = getSupplierSelectValue(trimmedValue, mode);

    return (
      <div className="inventory-add-field space-y-1.5">
        <Label
          htmlFor={id}
          className="font-semibold text-slate-950"
          style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
        >
          Supplier
        </Label>
        <div className="inventory-supplier-field-group">
          <Select
            value={supplierSelectValue}
            onValueChange={selectedValue => {
              if (selectedValue === SUPPLIER_CUSTOM_VALUE) {
                setMode("custom");
                if (listedSupplierSelected) onSupplierChange("");
                return;
              }

              setMode("listed");
              onSupplierChange(selectedValue);
            }}
          >
            <SelectTrigger
              id={id}
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            >
              <SelectValue placeholder="Select a supplier" />
            </SelectTrigger>
          <SelectContent>
            {HARDWARE_SUPPLIER_OPTIONS.map(supplier => (
              <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
            ))}
            <SelectItem value={SUPPLIER_CUSTOM_VALUE}>Other supplier / not listed</SelectItem>
          </SelectContent>
          </Select>
          {isCustomSupplier && (
            <Input
              id={`${id}-custom`}
              value={value}
              onChange={e => {
                const cleaned = sanitizeSupplierInput(e.target.value);
                if (cleaned !== e.target.value) {
                  toast.warning("Supplier name accepts letters, numbers, and common business characters only.", {
                    id: toastId,
                    duration: 2600
                  });
                }
                onSupplierChange(cleaned);
              }}
              placeholder="Enter supplier name"
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            />
          )}
        </div>
        <p className="text-slate-700" style={{ fontSize: "12px" }}>
          {helperText}
        </p>
      </div>
    );
  };

  const renderEstimatedReorderSummary = ({
    supplierName,
    averageDailySales,
    leadTimeDays,
    safetyStock
  }) => {
    const preview = getEstimatedReorderPreview({
      supplierName,
      averageDailySales,
      leadTimeDays,
      safetyStock
    });
    const salesValue = parsePlanningNumber(averageDailySales);
    const leadTimeValue = parsePlanningNumber(leadTimeDays);
    const safetyStockValue = parsePlanningNumber(safetyStock) ?? 0;

    return (
      <div
        className="inventory-add-field inventory-add-field-full inventory-reorder-summary text-slate-950"
        style={{
          border: "1px solid #BFDBFE",
          background: "linear-gradient(135deg, #EFF6FF 0%, #F8FBFF 100%)",
          borderRadius: "12px",
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }}
      >
        <div className="inventory-reorder-summary-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <p className="inventory-reorder-summary-label font-semibold text-slate-950" style={{ fontSize: "13px", lineHeight: "1.25" }}>
              Suggested Reorder Point
            </p>
            <p className="inventory-reorder-summary-value text-slate-950 font-bold" style={{ fontSize: "20px", lineHeight: "1.25", marginTop: "4px" }}>
              {preview.value !== null ? `${preview.value} unit${preview.value === 1 ? "" : "s"}` : "Needs Sales Data"}
            </p>
          </div>
        </div>

        <p className="inventory-reorder-summary-message text-slate-950 leading-relaxed" style={{ fontSize: "13px" }}>
          {preview.value !== null
            ? "Stock status and alerts use the Manual Low-Stock Threshold."
            : preview.message}
        </p>

        <div
          className="inventory-reorder-summary-metrics text-slate-700"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            fontSize: "12px",
            lineHeight: "1.25"
          }}
        >
          <span>Average Daily Sales: <strong className="text-slate-950">{`${salesValue ?? 0} units/day`}</strong></span>
          <span>Supplier Lead Time: <strong className="text-slate-950">{leadTimeValue ? `${leadTimeValue} day${leadTimeValue === 1 ? "" : "s"}` : "Not set"}</strong></span>
          <span>Safety Stock: <strong className="text-slate-950">{safetyStockValue}</strong></span>
        </div>

        <p className="inventory-reorder-summary-formula text-slate-700 leading-relaxed" style={{ fontSize: "12px" }}>
          Formula: Average Daily Sales x Supplier Lead Time + Safety Stock. Average Daily Sales is calculated from completed sales history.
        </p>
      </div>
    );
  };

  const renderAverageDailySalesDisplay = averageDailySales => {
    const salesValue = parsePlanningNumber(averageDailySales);
    const displayValue = salesValue === null ? 0 : salesValue;

    return (
      <div className="inventory-add-field inventory-add-field-full space-y-1.5">
        <Label
          className="font-semibold text-slate-950"
          style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
        >
          Average Daily Sales
        </Label>
        <div
          className="border border-slate-200 bg-slate-50 text-slate-950"
          style={{
            minHeight: "42px",
            borderRadius: "10px",
            fontSize: "14px",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap"
          }}
        >
          <strong>{displayValue} unit{displayValue === 1 ? "" : "s"}/day</strong>
          {salesValue === null || salesValue === 0 ? (
            <span className="text-slate-700" style={{ fontSize: "12px" }}>Not enough sales data yet</span>
          ) : null}
        </div>
        <p className="text-slate-700" style={{ fontSize: "12px" }}>
          Calculated from completed sales history. New items show 0 until sales are recorded.
        </p>
      </div>
    );
  };

  const renderReorderPlanningCompact = item => {
    const preview = getEstimatedReorderPreview({
      supplierName: item?.supplierName,
      averageDailySales: item?.averageDailySales,
      leadTimeDays: item?.leadTimeDays,
      safetyStock: item?.safetyStock
    });
    const leadTimeValue = parsePlanningNumber(item?.leadTimeDays);
    const safetyStockValue = parsePlanningNumber(item?.safetyStock) ?? 0;

    return (
      <div className="inventory-reorder-compact text-sm leading-tight text-slate-950">
        <div className="font-semibold">
          {preview.value !== null ? `${preview.value} units` : "Needs Sales Data"}
        </div>
        <div className="mt-1 text-xs text-slate-700">
          Lead: {leadTimeValue ? `${leadTimeValue}d` : "Not set"} · Safety: {safetyStockValue}
        </div>
      </div>
    );
  };

  const restoreArchivedDuplicate = async archivedItem => {
    if (!archivedItem || isRestoringArchivedDuplicate) return;
    setIsRestoringArchivedDuplicate(true);
    try {
      const restoredItem = await restoreArchivedInventoryItem(archivedItem.id);
      const restoredId = restoredItem?.id || archivedItem.originalInventoryId;
      if (restoredId) highlightInventoryRow(restoredId);
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
    const supplierName = item.supplierName || "";
    setSelectedItem(item);
    setEditItem({
      name: item.name || "",
      category: normalizeCategory(item.category) || item.category || "",
      supplierName,
      defaultSellingPrice: item.defaultSellingPrice === null || item.defaultSellingPrice === undefined || item.defaultSellingPrice === "" ? "" : String(item.defaultSellingPrice),
      costPrice: item.costPrice === null || item.costPrice === undefined || item.costPrice === "" ? "" : String(item.costPrice),
      reorderLevel: String(item.reorderLevel ?? 10),
      leadTimeDays: item.leadTimeDays === null || item.leadTimeDays === undefined || item.leadTimeDays === "" ? "" : String(item.leadTimeDays),
      safetyStock: item.safetyStock === null || item.safetyStock === undefined || item.safetyStock === "" ? "" : String(item.safetyStock)
    });
    setEditItemSupplierMode(supplierName && !isListedSupplier(supplierName) ? "custom" : "listed");
    setIsEditDialogOpen(true);
  };

  const validateActualTransactionDate = value => {
    if (!value) return true;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      toast.error("Actual transaction date must be valid.");
      return false;
    }
    if (date.getTime() > Date.now() + 60 * 1000) {
      toast.error("Actual transaction date cannot be in the future.");
      return false;
    }
    return true;
  };

  const handleActualTransactionDateChange = (value, setter, recordLabel = "record") => {
    setter(value);
    if (isPastTransactionDate(value)) {
      toast.info(`This ${recordLabel} will be saved as a backdated transaction.`, {
        description: "The transaction date will be used for reports, while the encoded date is kept in the audit trail."
      });
    }
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

    if (!isWholeNumberText(newItem.quantity)) {
      toast.error("Initial quantity must be a whole number.");
      return;
    }
    const quantity = Number(newItem.quantity);
    if (!isWholeNumberText(newItem.reorderLevel)) {
      toast.error("Manual Low-Stock Threshold must be a whole number.");
      return;
    }

    const reorderLevel = Number(newItem.reorderLevel);
    const defaultSellingPriceText = String(newItem.defaultSellingPrice || "").trim();
    if (defaultSellingPriceText && !isDecimalNumberText(defaultSellingPriceText)) {
      toast.error("Default Selling Price must be a valid amount with up to 2 decimal places.");
      return;
    }
    const defaultSellingPrice = defaultSellingPriceText ? Number(defaultSellingPriceText) : "";
    if (defaultSellingPrice !== "" && defaultSellingPrice <= 0) {
      toast.error("Default Selling Price must be greater than zero.");
      return;
    }
    const costPrice = newItem.costPrice || "";
    if (isNaN(quantity) || quantity < 0) {
      toast.error("Please enter a valid quantity.");
      return;
    }
    if (isNaN(reorderLevel) || reorderLevel < 0) {
      toast.error("Manual Low-Stock Threshold must be 0 or higher.");
      return;
    }
    if (newItem.leadTimeDays && (!isWholeNumberText(newItem.leadTimeDays) || Number(newItem.leadTimeDays) <= 0)) {
      toast.error("Supplier lead time must be a valid number of days.");
      return;
    }
    if (newItem.safetyStock && (!isWholeNumberText(newItem.safetyStock) || Number(newItem.safetyStock) < 0)) {
      toast.error("Safety stock must be a whole number.");
      return;
    }
    const newItemDuplicateKey = [
      normalizeInventoryIdentityName(cleanName),
      normalizeDuplicateKeyPart(normalizeCategory(newItem.category)),
      currentBranch
    ].join("|");

    const existingNameDuplicate = linearSearch(
      inventory,
      item =>
        normalizeInventoryIdentityName(item.name) === normalizeInventoryIdentityName(cleanName) &&
        normalizeDuplicateKeyPart(item.branch || user?.branch) === currentBranch
    );
    if (existingNameDuplicate) {
      toast.error("Inventory item already exists", {
        description: `"${existingNameDuplicate.name}" already exists under ${normalizeCategory(existingNameDuplicate.category)} (${existingNameDuplicate.status || "Active"}). Use Stock In if this is the same product${existingNameDuplicate.status === "Out of Stock" ? " because out-of-stock items are still active inventory records" : ""}.`
      });

      return;
    }

    const archivedNameDuplicate = linearSearch(
      archivedInventory,
      item =>
        normalizeInventoryIdentityName(item.name) === normalizeInventoryIdentityName(cleanName) &&
        normalizeDuplicateKeyPart(item.branch || user?.branch) === currentBranch
    );
    if (archivedNameDuplicate) {
      setArchivedDuplicatePrompt(archivedNameDuplicate);
      return;
    }

    // Check for duplicate active item by normalized item identity + category + branch.
    const existingItem = linearSearch(inventory, item => buildDuplicateKey(item) === newItemDuplicateKey);
    if (existingItem) {
      toast.error("Possible duplicate item found", {
        description: `"${existingItem.name}" already exists in ${normalizeCategory(newItem.category)} (Item Code: ${existingItem.itemCode || existingItem.id}). Use Stock In if this is the same product.`
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
      const addedItem = await addInventoryItem({
        name: cleanName,
        category: normalizeCategory(newItem.category),
        supplierName: newItem.supplierName.trim().replace(/\s+/g, " "),
        defaultSellingPrice,
        costPrice,
        quantity,
        reorderLevel,
        leadTimeDays: newItem.leadTimeDays === "" ? "" : Number(newItem.leadTimeDays),
        safetyStock: newItem.safetyStock === "" ? "" : Number(newItem.safetyStock),
        averageDailySalesMode: "auto",
        manualAverageDailySales: "",
        averageDailySalesOverrideReason: "",
        allowSimilarDuplicate
      });
      highlightInventoryRow(addedItem?.id);
      setIsAddDialogOpen(false);
      resetAddItemForm();
      if (quantity === 0) {
        toast.error(`${cleanName} added but OUT OF STOCK!`, { description: 'Item needs immediate stocking' });
      } else if (quantity <= getActiveLowStockThreshold({ reorderLevel })) {
        toast.warning(`${cleanName} added but LOW ON STOCK!`, { description: `Only ${formatUnitQuantity(quantity)} - Consider restocking soon` });
      } else {
        toast.success(`${cleanName} added successfully!`, { description: `Initial stock: ${formatUnitQuantity(quantity)}` });
      }
    } catch (err) {
      toast.error("Failed to add item", { description: err?.response?.data?.error || err.message });
    }
  };

  const confirmAddSimilarItem = promptOverride => {
    const prompt = promptOverride || similarDuplicatePrompt;
    const action = prompt?.action;
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
    if (!isWholeNumberText(stockAmount)) {
      toast.error("Stock In quantity must be a whole number.");
      return;
    }
    const amount = Number(stockAmount);
    if (amount <= 0) {
      toast.error("Stock In quantity must be greater than zero.");
      return;
    }
    if (!stockInReason) {
      toast.error("Please select the reason for this Stock In transaction.");
      return;
    }
    if (!validateActualTransactionDate(stockActualTransactionAt)) return;
    try {
      const reasonLabel = getStockInReasonLabel(stockInReason);
      const updatedItem = await updateInventoryItem(selectedItem.id, {
        ...selectedItem,
        quantity: selectedItem.quantity + amount,
        movementAction: 'stock_in',
        movementQuantity: amount,
        movementReason: stockInReason,
        movementNote: `Stock In recorded from inventory module. Reason: ${reasonLabel}.`,
        actualTransactionAt: stockActualTransactionAt || "",
        backdateReason: isPastTransactionDate(stockActualTransactionAt) ? stockBackdateReason.trim() : ""
      });
      highlightInventoryRow(updatedItem?.id || selectedItem.id);
      setIsStockInDialogOpen(false);
      resetStockForm();
      toast.success(`Added ${formatUnitQuantity(amount)} to ${selectedItem.name}`, {
        description: `Reason: ${reasonLabel}. New stock level: ${formatUnitQuantity(selectedItem.quantity + amount)}`
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
    if (!isWholeNumberText(stockAmount)) {
      toast.error("Stock Out quantity must be a whole number.");
      return;
    }
    const amount = Number(stockAmount);
    if (amount <= 0) {
      toast.error("Stock Out quantity must be greater than zero.");
      return;
    }
    if (amount > selectedItem.quantity) {
      toast.error("Insufficient stock.");
      return;
    }
    if (!stockOutReason) {
      toast.error("Please select the reason for this Stock Out transaction.");
      return;
    }
    if (!validateActualTransactionDate(stockActualTransactionAt)) return;
    try {
      const newQuantity = selectedItem.quantity - amount;
      const reasonLabel = getStockOutReasonLabel(stockOutReason);
      const updatedItem = await updateInventoryItem(selectedItem.id, {
        ...selectedItem,
        quantity: newQuantity,
        movementAction: 'stock_out',
        movementQuantity: amount,
        movementReason: stockOutReason,
        movementNote: `Stock Out recorded from inventory module. Reason: ${reasonLabel}.`,
        actualTransactionAt: stockActualTransactionAt || "",
        backdateReason: isPastTransactionDate(stockActualTransactionAt) ? stockBackdateReason.trim() : ""
      });
      highlightInventoryRow(updatedItem?.id || selectedItem.id);
      setIsStockOutDialogOpen(false);
      resetStockForm();
      if (newQuantity === 0) {
        toast.error(`${selectedItem.name} is now OUT OF STOCK!`, { description: `Removed ${formatUnitQuantity(amount)} for ${reasonLabel}. Immediate restocking required` });
      } else if (newQuantity <= getActiveLowStockThreshold(selectedItem)) {
        toast.warning(`${selectedItem.name} is now LOW ON STOCK!`, { description: `Removed ${formatUnitQuantity(amount)} for ${reasonLabel}. Only ${formatUnitQuantity(newQuantity)} remaining` });
      } else {
        toast.success(`Removed ${formatUnitQuantity(amount)} from ${selectedItem.name}`, { description: `Reason: ${reasonLabel}. Remaining stock: ${formatUnitQuantity(newQuantity)}` });
      }
      setSelectedItem(null);
    } catch (err) {
      toast.error("Failed to stock out", { description: err?.response?.data?.error || err.message });
    }
  };

  const updateBatchStockAdjustmentRow = (index, field, value) => {
    if (field === "inventoryId" && value) {
      const duplicateRow = batchStockAdjustmentRows.find((row, rowIndex) =>
        rowIndex !== index && String(row.inventoryId) === String(value)
      );
      if (duplicateRow) {
        const duplicateItem = getBatchAdjustmentRowItem(value);
        toast.error("Item already added to adjustment", {
          description: duplicateItem
            ? `${duplicateItem.name} is already included. Update its quantity in the existing row instead.`
            : "Please update the quantity in the existing row instead."
        });
        return;
      }
    }

    setBatchStockAdjustmentRows(rows => rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row
    ));
  };

  const addBatchStockAdjustmentRow = () => {
    setBatchStockAdjustmentRows(rows => [...rows, { inventoryId: "", quantity: "" }]);
  };

  const removeBatchStockAdjustmentRow = index => {
    setBatchStockAdjustmentRows(rows => rows.length === 1 ? [{ inventoryId: "", quantity: "" }] : rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const getBatchAdjustmentRowItem = inventoryId => inventory.find(item => String(item.id) === String(inventoryId));

  const handleBatchStockAdjustment = async () => {
    if (!batchStockAdjustmentReason) {
      toast.error("Please select the stock-in reason for this adjustment.");
      return;
    }

    const preparedRows = batchStockAdjustmentRows
      .map(row => ({
        inventoryId: row.inventoryId,
        quantity: isWholeNumberText(row.quantity) ? Number(row.quantity) : NaN
      }))
      .filter(row => row.inventoryId || row.quantity);

    if (preparedRows.length === 0) {
      toast.error("Add at least one item to process the adjustment.");
      return;
    }

    const selectedInventoryIds = preparedRows.map(row => String(row.inventoryId));
    const duplicateInventoryId = selectedInventoryIds.find((inventoryId, index) =>
      inventoryId && selectedInventoryIds.indexOf(inventoryId) !== index
    );
    if (duplicateInventoryId) {
      const duplicateItem = getBatchAdjustmentRowItem(duplicateInventoryId);
      toast.error("Duplicate item in adjustment", {
        description: duplicateItem
          ? `${duplicateItem.name} appears more than once. Keep one row and update its quantity.`
          : "Each item should appear only once in a batch adjustment."
      });
      return;
    }

    for (const row of preparedRows) {
      const item = getBatchAdjustmentRowItem(row.inventoryId);
      if (!item || Number.isNaN(row.quantity) || row.quantity <= 0) {
        toast.error("Each adjustment line must have a valid item and quantity.");
        return;
      }
    }
    if (!validateActualTransactionDate(batchStockAdjustmentActualTransactionAt)) return;

    try {
      const reasonLabel = getStockInReasonLabel(batchStockAdjustmentReason);
      const updatedItems = await batchStockAdjustment({
        items: preparedRows,
        movementReason: batchStockAdjustmentReason,
        movementNote: `Batch stock adjustment recorded from inventory module. Reason: ${reasonLabel}.`,
        actualTransactionAt: batchStockAdjustmentActualTransactionAt || "",
        backdateReason: isPastTransactionDate(batchStockAdjustmentActualTransactionAt) ? batchStockAdjustmentBackdateReason.trim() : ""
      });
      highlightInventoryRow(updatedItems?.[0]?.id);
      closeBatchStockAdjustmentDialog();
      toast.success("Batch stock adjustment completed successfully.", {
        description: `${preparedRows.length} line${preparedRows.length === 1 ? "" : "s"} processed. Reason: ${reasonLabel}.`
      });
    } catch (err) {
      toast.error("Failed to process adjustment", { description: err?.response?.data?.error || err.message });
    }
  };

  const updateBatchStockOutRow = (index, field, value) => {
    if (field === "inventoryId" && value) {
      const duplicateRow = batchStockOutRows.find((row, rowIndex) =>
        rowIndex !== index && String(row.inventoryId) === String(value)
      );
      if (duplicateRow) {
        const duplicateItem = getBatchRowItem(value);
        toast.error("Item already added to batch", {
          description: duplicateItem
            ? `${duplicateItem.name} is already included. Update its quantity in the existing row instead.`
            : "Please update the quantity in the existing row instead."
        });
        return;
      }
    }

    setBatchStockOutRows(rows => rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row
    ));
  };

  const addBatchStockOutRow = () => {
    setBatchStockOutRows(rows => [...rows, { inventoryId: "", quantity: "" }]);
  };

  const removeBatchStockOutRow = index => {
    setBatchStockOutRows(rows => rows.length === 1 ? [{ inventoryId: "", quantity: "" }] : rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const getBatchRowItem = inventoryId => inventory.find(item => String(item.id) === String(inventoryId));

  const handleBatchStockOut = async () => {
    if (!batchStockOutReason) {
      toast.error("Please select the stock-out reason for this deduction.");
      return;
    }

    const preparedRows = batchStockOutRows
      .map(row => ({
        inventoryId: row.inventoryId,
        quantity: isWholeNumberText(row.quantity) ? Number(row.quantity) : NaN
      }))
      .filter(row => row.inventoryId || row.quantity);

    if (preparedRows.length === 0) {
      toast.error("Add at least one item to process the deduction.");
      return;
    }

    const selectedInventoryIds = preparedRows.map(row => String(row.inventoryId));
    const duplicateInventoryId = selectedInventoryIds.find((inventoryId, index) =>
      inventoryId && selectedInventoryIds.indexOf(inventoryId) !== index
    );
    if (duplicateInventoryId) {
      const duplicateItem = getBatchRowItem(duplicateInventoryId);
      toast.error("Duplicate item in batch", {
        description: duplicateItem
          ? `${duplicateItem.name} appears more than once. Keep one row and update its quantity.`
          : "Each item should appear only once in a batch transaction."
      });
      return;
    }

    for (const row of preparedRows) {
      const item = getBatchRowItem(row.inventoryId);
      if (!item || Number.isNaN(row.quantity) || row.quantity <= 0) {
        toast.error("Each batch line must have a valid item and quantity.");
        return;
      }
      if (row.quantity > item.quantity) {
        toast.error(`${item.name} has only ${formatUnitQuantity(item.quantity)} available.`);
        return;
      }
    }
    if (!validateActualTransactionDate(batchStockOutActualTransactionAt)) return;

    try {
      const reasonLabel = getStockOutReasonLabel(batchStockOutReason);
      const updatedItems = await batchStockOut({
        items: preparedRows,
        movementReason: batchStockOutReason,
        movementNote: `Daily sales or stock-out deduction recorded from inventory module. Reason: ${reasonLabel}.`,
        actualTransactionAt: batchStockOutActualTransactionAt || "",
        backdateReason: isPastTransactionDate(batchStockOutActualTransactionAt) ? batchStockOutBackdateReason.trim() : ""
      });
      highlightInventoryRow(updatedItems?.[0]?.id);
      closeBatchStockOutDialog();
      toast.success("Batch non-sales stock out completed successfully.", {
        description: `${preparedRows.length} line${preparedRows.length === 1 ? "" : "s"} processed. Reason: ${reasonLabel}.`
      });
    } catch (err) {
      toast.error("Failed to process deduction", { description: err?.response?.data?.error || err.message });
    }
  };

  const handleEditItem = async ({ allowSimilarDuplicate = false } = {}) => {
    if (!selectedItem) return;
    const cleanName = editItem.name.trim().replace(/\s+/g, " ");
    const canonicalCategory = normalizeCategory(editItem.category);
    if (!isWholeNumberText(editItem.reorderLevel)) {
      toast.error("Manual Low-Stock Threshold must be a whole number.");
      return;
    }

    const reorderLevel = Number(editItem.reorderLevel);
    const defaultSellingPriceText = String(editItem.defaultSellingPrice || "").trim();
    if (defaultSellingPriceText && !isDecimalNumberText(defaultSellingPriceText)) {
      toast.error("Default Selling Price must be a valid amount with up to 2 decimal places.");
      return;
    }
    const defaultSellingPrice = defaultSellingPriceText ? Number(defaultSellingPriceText) : "";
    if (defaultSellingPrice !== "" && defaultSellingPrice <= 0) {
      toast.error("Default Selling Price must be greater than zero.");
      return;
    }
    const costPrice = selectedItem.costPrice === null || selectedItem.costPrice === undefined || selectedItem.costPrice === ""
      ? ""
      : selectedItem.costPrice;

    if (!cleanName || !canonicalCategory) {
      toast.error("Please provide a valid item name and category.");
      return;
    }
    const nameQualityError = validateInventoryNameQuality(cleanName);
    if (nameQualityError) {
      toast.error("Please enter a more specific item name", { description: nameQualityError });
      return;
    }
    if (isNaN(reorderLevel) || reorderLevel < 0) {
      toast.error("Manual Low-Stock Threshold must be 0 or higher.");
      return;
    }
    if (editItem.leadTimeDays && (!isWholeNumberText(editItem.leadTimeDays) || Number(editItem.leadTimeDays) <= 0)) {
      toast.error("Supplier lead time must be a valid number of days.");
      return;
    }
    if (editItem.safetyStock && (!isWholeNumberText(editItem.safetyStock) || Number(editItem.safetyStock) < 0)) {
      toast.error("Safety stock must be a whole number.");
      return;
    }

    const editedItemDuplicateKey = [
      normalizeInventoryIdentityName(cleanName),
      normalizeDuplicateKeyPart(canonicalCategory),
      currentBranch
    ].join("|");
    const activeNameDuplicate = linearSearch(
      inventory,
      item =>
        item.id !== selectedItem.id &&
        normalizeInventoryIdentityName(item.name) === normalizeInventoryIdentityName(cleanName) &&
        normalizeDuplicateKeyPart(item.branch || user?.branch) === currentBranch
    );
    if (activeNameDuplicate) {
      toast.error("Failed to update item", {
        description: `"${activeNameDuplicate.name}" already exists under ${normalizeCategory(activeNameDuplicate.category)} (${activeNameDuplicate.status || "Active"}). Use that existing item if this is the same product.`
      });
      return;
    }

    const archivedNameDuplicate = linearSearch(
      archivedInventory,
      item =>
        normalizeInventoryIdentityName(item.name) === normalizeInventoryIdentityName(cleanName) &&
        normalizeDuplicateKeyPart(item.branch || user?.branch) === currentBranch
    );
    if (archivedNameDuplicate) {
      toast.error("Failed to update item", {
        description: "An archived item with the same name already exists. Please restore the archived item instead of creating a duplicate record."
      });
      return;
    }

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
      const updatedItem = await updateInventoryItem(selectedItem.id, {
        name: cleanName,
        category: canonicalCategory,
        supplierName: editItem.supplierName.trim().replace(/\s+/g, " "),
        defaultSellingPrice,
        costPrice,
        quantity: selectedItem.quantity,
        reorderLevel,
        leadTimeDays: editItem.leadTimeDays === "" ? "" : Number(editItem.leadTimeDays),
        safetyStock: editItem.safetyStock === "" ? "" : Number(editItem.safetyStock),
        averageDailySalesMode: "auto",
        manualAverageDailySales: "",
        averageDailySalesOverrideReason: "",
        allowSimilarDuplicate
      });
      highlightInventoryRow(updatedItem?.id || selectedItem.id);
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
    if (!archiveReason) {
      toast.error("Please select the reason for archiving this item.");
      return;
    }
    const itemToArchive = selectedItem;
    const reasonLabel = getArchiveReasonLabel(archiveReason);
    closeArchiveDialog();
    localStorage.setItem("archiveRowHighlightOriginalId", String(itemToArchive.id));
    try {
      await archiveInventoryItem(itemToArchive.id, archiveReason);
      toast.success(`${itemToArchive.name} archived successfully!`, {
        description: `Reason: ${reasonLabel}. Item moved to Archive.`
      });
    } catch (err) {
      localStorage.removeItem("archiveRowHighlightOriginalId");
      toast.error("Failed to archive item", { description: err?.response?.data?.error || err.message });
    }
  };
  const getStatusBadgeClass = getStockStatusBadgeClass;
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
        className="inventory-dialog-content inventory-add-dialog-content inventory-edit-dialog-content border border-slate-200 bg-white shadow-2xl"
        onOpenAutoFocus={event => event.preventDefault()}
        style={{
          width: "min(860px, calc(100vw - 32px))",
          maxWidth: "860px",
          padding: "24px",
          borderRadius: "14px",
          gap: "14px"
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
              className="mt-3 leading-relaxed text-slate-950"
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

        <div className="inventory-add-form-grid">
          {renderAddSectionHeader("Basic Item Information")}

          <div className="inventory-add-field inventory-add-field-full space-y-1.5">
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
              onChange={e => setEditItem({
                ...editItem,
                name: sanitizeInventoryTextInput(e.target.value, "Item Name", "edit-item-name-valid-characters")
              })}
              placeholder="e.g., Steel Hammer"
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            />
          </div>

          <div className="inventory-add-field space-y-1.5">
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

          {renderSupplierField({
            id: "edit-supplier",
            value: editItem.supplierName,
            mode: editItemSupplierMode,
            setMode: setEditItemSupplierMode,
            onSupplierChange: supplierName => setEditItem(prev => ({ ...prev, supplierName })),
            toastId: "edit-supplier-valid-characters",
            helperText: "Optional. Select a supplier if known, or choose Other supplier / not listed to type a new one."
          })}

          <div className="inventory-add-field space-y-1.5">
            <Label
              htmlFor="edit-default-selling-price"
              className="font-semibold text-slate-950"
              style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
            >
              Default Selling Price
            </Label>
            <Input
              id="edit-default-selling-price"
              type="text"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={editItem.defaultSellingPrice}
              onChange={e => setEditItem({
                ...editItem,
                defaultSellingPrice: sanitizeDecimalInput(e.target.value, "Default Selling Price", "edit-default-price-numbers-only")
              })}
              placeholder="e.g., 250.00"
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            />
            <p className="text-slate-700" style={{ fontSize: "12px" }}>
              Optional. This price will automatically appear as the Unit Price when the item is selected in Sales Recording.
            </p>
          </div>

          {renderAddSectionHeader("Stock Level and Alert Threshold")}

          <div className="inventory-add-field inventory-add-field-full space-y-1.5">
            <Label
              htmlFor="edit-reorder-level"
              className="font-semibold text-slate-950"
              style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
            >
              Manual Low-Stock Threshold
            </Label>
            <Input
              id="edit-reorder-level"
              type="text"
              min="0"
              step="1"
              inputMode="numeric"
              value={editItem.reorderLevel}
              onChange={e => setEditItem({
                ...editItem,
                reorderLevel: sanitizeWholeNumberInput(e.target.value, "Manual Low-Stock Threshold", "edit-reorder-threshold-numbers-only")
              })}
              placeholder="10"
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            />
            <p className="text-slate-700" style={{ fontSize: "12px" }}>
              The item will be marked Low Stock when its quantity is equal to or below this number.
            </p>
          </div>

          {renderAddSectionHeader("Supplier Lead Time Support")}

          <div className="inventory-add-field space-y-1.5">
            <Label
              htmlFor="edit-lead-time-days"
              className="font-semibold text-slate-950"
              style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
            >
              Supplier Lead Time
            </Label>
            <Input
              id="edit-lead-time-days"
              type="text"
              inputMode="numeric"
              value={editItem.leadTimeDays}
              onChange={e => setEditItem({
                ...editItem,
                leadTimeDays: sanitizeWholeNumberInput(e.target.value, "Supplier Lead Time", "edit-lead-time-days-numbers-only")
              })}
              placeholder="e.g., 7 days"
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            />
            <p className="text-slate-700" style={{ fontSize: "12px" }}>
              Optional. Use the usual delivery period for the assigned supplier.
            </p>
          </div>

          <div className="inventory-add-field space-y-1.5">
            <Label
              htmlFor="edit-safety-stock"
              className="font-semibold text-slate-950"
              style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
            >
              Safety Stock
            </Label>
            <Input
              id="edit-safety-stock"
              type="text"
              inputMode="numeric"
              value={editItem.safetyStock}
              onChange={e => setEditItem({
                ...editItem,
                safetyStock: sanitizeWholeNumberInput(e.target.value, "Safety Stock", "edit-safety-stock-numbers-only")
              })}
              placeholder="e.g., 10"
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            />
            <p className="text-slate-700" style={{ fontSize: "12px" }}>
              Optional buffer stock added to the suggested reorder point.
            </p>
          </div>

          {renderAverageDailySalesDisplay(selectedItem?.averageDailySales)}

          {renderEstimatedReorderSummary({
            supplierName: editItem.supplierName,
            averageDailySales: selectedItem?.averageDailySales,
            leadTimeDays: editItem.leadTimeDays,
            safetyStock: editItem.safetyStock
          })}

        </div>

        <DialogFooter
          className="inventory-dialog-footer pt-2"
          style={{ display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}
        >
          <Button
            type="button"
            variant="outline"
            className="modal-button-cancel border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
            style={{ height: "38px", minWidth: "88px", borderRadius: "10px", padding: "0 18px", fontSize: "13px" }}
            onClick={requestCloseEditDialog}
          >
            Cancel
          </Button>
          <Button
            type="button"
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

    .inventory-row-highlight {
      animation: inventoryRowHighlightPulse 2.4s ease-out;
      box-shadow: inset 4px 0 0 #F59E0B;
    }

    .inventory-row-highlight > td {
      background: #FFF7D6 !important;
      transition: background-color 240ms ease, box-shadow 240ms ease;
    }

    .inventory-mobile-card.inventory-row-highlight {
      background: #FFF7D6 !important;
      border-color: #F59E0B !important;
      box-shadow: inset 4px 0 0 #F59E0B, 0 14px 28px rgba(245, 158, 11, 0.14);
    }

    @keyframes inventoryRowHighlightPulse {
      0% {
        background: #FEF3C7;
        box-shadow: inset 4px 0 0 #F59E0B, 0 0 0 0 rgba(245, 158, 11, 0.24);
      }
      65% {
        background: #FFF7D6;
        box-shadow: inset 4px 0 0 #F59E0B, 0 0 0 8px rgba(245, 158, 11, 0);
      }
      100% {
        background: transparent;
        box-shadow: inset 0 0 0 transparent, 0 0 0 0 rgba(245, 158, 11, 0);
      }
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

    .inventory-list-header {
      gap: 12px;
      flex-wrap: wrap;
    }

    .inventory-list-title {
      flex: 1 1 320px;
      min-width: 0;
    }

    .inventory-status-overview {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }

    .inventory-overview-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 30px;
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      background: #ffffff;
      padding: 5px 10px 5px 6px;
      color: #334155;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }

    .inventory-overview-pill:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
    }

    .inventory-overview-pill-active {
      box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.22);
    }

    .inventory-overview-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 22px;
      border-radius: 999px;
      padding: 0 7px;
      background: #f8fafc;
      color: #0f172a;
      font-size: 12px;
      font-weight: 800;
    }

    .inventory-overview-label {
      white-space: nowrap;
    }

    .inventory-overview-pill-all {
      border-color: #cbd5e1;
      background: #f8fafc;
      color: #334155;
    }

    .inventory-overview-pill-all .inventory-overview-count {
      background: #e2e8f0;
      color: #0f172a;
    }

    .inventory-overview-pill-out {
      border-color: #fecaca;
      background: #fff1f2;
      color: #991b1b;
    }

    .inventory-overview-pill-out .inventory-overview-count {
      background: #fee2e2;
      color: #991b1b;
    }

    .inventory-overview-pill-low {
      border-color: #fde68a;
      background: #fffbeb;
      color: #92400e;
    }

    .inventory-overview-pill-low .inventory-overview-count {
      background: #fef3c7;
      color: #92400e;
    }

    .inventory-overview-pill-in {
      border-color: #bbf7d0;
      background: #f0fdf4;
      color: #166534;
    }

    .inventory-overview-pill-in .inventory-overview-count {
      background: #dcfce7;
      color: #166534;
    }

    .inventory-search-grid {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) repeat(2, minmax(170px, 210px)) 132px;
      gap: 14px;
      align-items: center;
    }

    .inventory-search-field {
      min-width: 0;
    }

    .inventory-filter-actions {
      display: contents;
    }

    .inventory-filter-control {
      min-width: 0;
    }

    .inventory-search-field input,
    .inventory-filter-trigger {
      min-height: 42px;
      border-radius: 12px;
      background: #f8fafc;
      border-color: #e2e8f0;
      color: #0f172a;
    }

    .inventory-filter-trigger {
      width: 100%;
      justify-content: flex-start;
      gap: 10px;
    }

    .inventory-filter-trigger [data-placeholder] {
      color: #64748b;
    }

    .inventory-filter-trigger [data-slot="select-value"] {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .inventory-filter-trigger > svg:last-child {
      margin-left: auto;
    }

    .inventory-filter-trigger > svg:first-child {
      margin-right: 0;
    }

    .inventory-clear-filters-button {
      min-height: 42px;
      width: 100%;
      border-radius: 12px;
      border-color: #cbd5e1;
      background: #ffffff;
      color: #334155;
      font-weight: 600;
      padding-left: 16px;
      padding-right: 16px;
      white-space: nowrap;
    }

    .inventory-clear-filters-button:not(:disabled):hover {
      background: #f8fafc;
      border-color: #94a3b8;
      color: #0f172a;
    }

    .inventory-batch-stock-adjustment-button,
    .inventory-batch-stock-out-button,
    .inventory-add-button {
      min-height: 46px;
      border-radius: 12px;
      padding-left: 18px;
      padding-right: 18px;
      white-space: nowrap;
    }

    .inventory-batch-stock-adjustment-button,
    .inventory-batch-stock-out-button {
      flex: 0 0 auto;
    }

    .inventory-dialog-content {
      max-height: calc(100dvh - 32px) !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    .inventory-dialog-content::-webkit-scrollbar {
      width: 10px;
    }

    .inventory-dialog-content::-webkit-scrollbar-thumb {
      background: #CBD5E1;
      border: 3px solid #FFFFFF;
      border-radius: 999px;
    }

    .inventory-dialog-content::-webkit-scrollbar-track {
      background: transparent;
    }

    .inventory-add-dialog-content {
      scrollbar-gutter: stable both-edges;
    }

    .inventory-add-dialog-content .inventory-dialog-header {
      align-items: center !important;
      margin-bottom: 2px;
    }

    .inventory-add-dialog-content .inventory-dialog-header > div:first-child {
      width: 54px !important;
      height: 54px !important;
    }

    .inventory-add-dialog-content .inventory-dialog-header h2 {
      font-size: 25px !important;
    }

    .inventory-add-dialog-content .inventory-dialog-header p {
      margin-top: 7px !important;
      line-height: 1.45 !important;
    }

    .inventory-add-dialog-content .flex.items-center.text-blue-950 {
      min-height: 40px;
      border-radius: 10px !important;
      padding: 9px 12px !important;
    }

    .inventory-add-form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 13px 16px;
      align-items: start;
    }

    .inventory-add-section-title,
    .inventory-add-field-full {
      grid-column: 1 / -1;
    }

    .inventory-add-section-title {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
      margin-top: 10px;
      border: 0 !important;
      border-radius: 10px !important;
      background: linear-gradient(90deg, #f1f5f9 0%, #f8fbff 100%) !important;
      padding: 10px 13px !important;
      color: #0f172a !important;
      box-shadow: inset 0 0 0 1px #e2e8f0;
    }

    .inventory-add-section-title:first-child {
      margin-top: 0;
    }

    .inventory-add-section-title::before {
      content: "";
      width: 3px;
      height: 20px;
      flex: 0 0 3px;
      border-radius: 999px;
      background: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .inventory-add-section-title-text {
      min-width: 0;
      flex: 0 1 auto;
      color: #0f172a;
      font-size: 14px;
      font-weight: 750;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .inventory-add-field label,
    .inventory-add-dialog-content label {
      color: #0f172a;
    }

    .inventory-add-field input,
    .inventory-add-field [role="combobox"],
    .inventory-add-dialog-content input,
    .inventory-add-dialog-content [role="combobox"] {
      min-height: 42px;
      border-radius: 10px;
      border-color: #cbd5e1;
      background: #ffffff;
    }

    .inventory-supplier-field-group {
      display: grid;
      gap: 8px;
    }

    .inventory-reorder-summary {
      min-width: 0;
    }

    .inventory-reorder-summary > * {
      min-width: 0;
    }

    .inventory-reorder-summary-value,
    .inventory-reorder-summary-message,
    .inventory-reorder-summary-formula,
    .inventory-reorder-summary-metrics {
      overflow-wrap: anywhere;
    }

    .inventory-reorder-summary-metrics span {
      min-width: 0;
      display: inline-flex;
      gap: 4px;
      align-items: baseline;
      flex-wrap: wrap;
    }

    .inventory-reorder-compact {
      min-width: 0;
      max-width: 100%;
      overflow-wrap: anywhere;
    }

    .inventory-add-field p {
      line-height: 1.35;
    }

    .inventory-add-dialog-content .inventory-dialog-footer {
      margin-top: 0;
      padding-top: 2px !important;
    }

    .inventory-archive-general-warning {
      align-items: flex-start;
      margin-top: 2px;
    }

    .inventory-archive-general-warning svg,
    .inventory-archive-stock-warning svg,
    .inventory-archive-info-note svg {
      margin-top: 1px;
    }

    .inventory-archive-item-card {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .inventory-archive-item-name {
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .inventory-archive-stock-warning {
      align-items: flex-start;
      margin-top: 2px;
    }

    .inventory-archive-reason-field {
      margin-top: 2px;
    }

    .inventory-archive-info-note {
      align-items: flex-start;
      margin-top: 2px;
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
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .inventory-search-field {
        grid-column: 1 / -1;
      }

      .inventory-filter-actions {
        display: contents;
      }

      .inventory-filter-control,
      .inventory-clear-filters-button {
        width: 100%;
      }

      .inventory-search-field input,
      .inventory-filter-trigger {
        min-height: 44px;
        border-radius: 12px;
        font-size: 14px;
      }

      .inventory-clear-filters-button {
        min-height: 44px;
      }

      .inventory-list-card [data-inventory-header] {
        padding: 16px 16px 0;
      }

      .inventory-list-header {
        align-items: stretch;
        gap: 14px;
        row-gap: 14px;
      }

      .inventory-list-title {
        flex-basis: 100%;
        min-width: 0;
      }

      .inventory-status-overview {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        width: 100%;
        gap: 8px;
        margin-top: 12px;
      }

      .inventory-overview-pill {
        justify-content: center;
        min-width: 0;
        padding: 6px 8px;
      }

      .inventory-overview-label {
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .inventory-list-title [data-card-title] {
        font-size: 18px;
        line-height: 1.25;
      }

      .inventory-list-title [data-card-description] {
        display: block;
        margin-top: 4px;
        color: #374151;
        font-size: 13px;
        line-height: 1.45;
      }

      .inventory-list-title [data-card-description] span {
        display: block;
        margin-left: 0;
        color: #374151;
      }

      .inventory-add-button {
        min-height: 44px;
        justify-content: center;
        border-radius: 12px;
      }

      .inventory-batch-stock-adjustment-button,
      .inventory-batch-stock-out-button,
      .inventory-add-button {
        flex: 1 1 180px;
        justify-content: center;
        min-width: 0;
      }

      .inventory-table-wrap {
        display: none;
      }

      .inventory-mobile-list {
        display: grid;
        gap: 10px;
        padding: 0 16px 16px;
        margin-top: 14px;
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
        padding: 2px 0 4px;
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
        color: #374151;
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

      .inventory-mobile-reorder-field {
        grid-column: 1 / -1;
      }

      .inventory-mobile-label {
        display: block;
        color: #374151;
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
        color: #374151;
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
        max-height: calc(100dvh - 24px) !important;
        overflow-y: auto !important;
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

      .inventory-reorder-summary {
        padding: 12px !important;
        gap: 8px !important;
      }

      .inventory-reorder-summary-header {
        gap: 8px !important;
      }

      .inventory-reorder-summary-label,
      .inventory-reorder-summary-message {
        font-size: 12px !important;
      }

      .inventory-reorder-summary-value {
        font-size: 18px !important;
      }

      .inventory-reorder-summary-metrics {
        display: grid !important;
        grid-template-columns: 1fr;
        gap: 6px !important;
        font-size: 12px !important;
      }

      .inventory-reorder-summary-formula {
        font-size: 11.5px !important;
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

      .inventory-add-dialog-content {
        width: calc(100vw - 24px) !important;
        max-width: 460px !important;
        padding: 16px !important;
      }

      .inventory-add-form-grid {
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .inventory-add-section-title,
      .inventory-add-field-full,
      .inventory-add-field {
        grid-column: 1 / -1;
      }

      .inventory-archive-item-card > div {
        grid-template-columns: 46px minmax(0, 1fr) !important;
        gap: 12px !important;
      }

      .inventory-archive-item-card {
        gap: 12px !important;
        padding: 12px !important;
      }

      .inventory-archive-stock-warning,
      .inventory-archive-info-note,
      .inventory-archive-general-warning {
        gap: 10px !important;
        padding: 10px 12px !important;
      }

      .inventory-archive-reason-field {
        margin-top: 0;
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
        gap: 12px;
      }

      .inventory-status-overview {
        grid-template-columns: 1fr;
      }

      .inventory-overview-pill {
        justify-content: space-between;
      }

      .inventory-search-grid {
        grid-template-columns: 1fr;
      }

      .inventory-filter-actions {
        grid-template-columns: 1fr;
      }

      .inventory-add-button {
        width: 100%;
      }

      .inventory-batch-stock-adjustment-button,
      .inventory-batch-stock-out-button,
      .inventory-add-button {
        flex-basis: auto;
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
    className: "inventory-search-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-search-field relative"
  }, /*#__PURE__*/React.createElement(Search, {
    className: "absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400"
  }), /*#__PURE__*/React.createElement(Input, {
    className: "pl-10",
    placeholder: "Search active inventory by item name or item code",
    value: searchQuery,
    onChange: e => updateInventorySearchQuery(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "inventory-filter-actions"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-filter-control"
  }, /*#__PURE__*/React.createElement(Select, {
    value: categoryFilter,
    onValueChange: value => updateInventoryCategoryFilter(value)
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
  }, cat))))), /*#__PURE__*/React.createElement("div", {
    className: "inventory-filter-control"
  }, /*#__PURE__*/React.createElement(Select, {
    value: supplierFilter,
    onValueChange: value => updateInventorySupplierFilter(value)
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "inventory-filter-trigger"
  }, /*#__PURE__*/React.createElement(Filter, {
    className: "w-4 h-4 mr-2"
  }), /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "All Suppliers"
  })), /*#__PURE__*/React.createElement(SelectContent, null, /*#__PURE__*/React.createElement(SelectItem, {
    value: "all"
  }, "All Suppliers"), supplierFilterOptions.map(supplier => /*#__PURE__*/React.createElement(SelectItem, {
    key: supplier,
    value: supplier
  }, supplier)), /*#__PURE__*/React.createElement(SelectItem, {
    value: "unassigned"
  }, "No supplier assigned")))), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "outline",
    className: "inventory-clear-filters-button",
    disabled: !hasActiveInventoryFilters,
    onClick: clearInventoryFilters
  }, "Clear Filters"))))), /*#__PURE__*/React.createElement(Card, {
    className: "inventory-list-card"
  }, /*#__PURE__*/React.createElement(CardHeader, {
    "data-inventory-header": true
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-list-header flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-list-title"
  }, /*#__PURE__*/React.createElement(CardTitle, null, "Inventory Items"), /*#__PURE__*/React.createElement(CardDescription, null, sortedInventory.length, " items found", sortBy && /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 ml-2"
  }, "\u2022 Sorted by ", sortLabel, " (", realtimeDisplayOrderLabel, ")")), renderInventoryStatusOverview()), canPerformInventoryMovement(user.role) && /*#__PURE__*/React.createElement(Button, {
    type: "button",
    className: "inventory-batch-stock-adjustment-button bg-green-600 text-white hover:bg-green-700 font-semibold shadow-md transition-all duration-300",
    onClick: () => setIsBatchStockAdjustmentDialogOpen(true)
  }, /*#__PURE__*/React.createElement(PackagePlus, {
    className: "w-4 h-4 mr-2"
  }), "Batch Stock Adjustment"), canPerformInventoryMovement(user.role) && /*#__PURE__*/React.createElement(Button, {
    type: "button",
    className: "inventory-batch-stock-out-button bg-red-600 text-white hover:bg-red-700 font-semibold shadow-md transition-all duration-300",
    onClick: () => setIsBatchStockOutDialogOpen(true)
  }, /*#__PURE__*/React.createElement(PackageMinus, {
    className: "w-4 h-4 mr-2"
  }), "Batch Non-Sales Out"), canManageInventory(user.role) && /*#__PURE__*/React.createElement(Dialog, {
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
    className: "inventory-dialog-content inventory-add-dialog-content border border-slate-200 bg-white shadow-2xl",
    style: {
      width: "min(860px, calc(100vw - 32px))",
      maxWidth: "860px",
      padding: "24px",
      borderRadius: "14px",
      gap: "14px"
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
    className: "mt-3 leading-relaxed text-slate-950",
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
    className: "inventory-add-form-grid"
  }, renderAddSectionHeader("Basic Item Information"), /*#__PURE__*/React.createElement("div", {
    className: "inventory-add-field inventory-add-field-full space-y-1.5"
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
        name: sanitizeInventoryTextInput(e.target.value, "Item Name", "add-item-name-valid-characters")
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
    className: "text-slate-700",
    style: {
      fontSize: "12px"
    }
  }, "Enter a specific item name with its size or specification. Example: Claw Hammer 16 oz.")), /*#__PURE__*/React.createElement("div", {
    className: "inventory-add-field space-y-1.5"
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
    className: "text-slate-700",
    style: {
      fontSize: "12px"
    }
  }, "Select the category that best describes the item. If none applies, choose \"Other.\"")), renderSupplierField({
    id: "supplier-name",
    value: newItem.supplierName,
    mode: newItemSupplierMode,
    setMode: setNewItemSupplierMode,
    onSupplierChange: supplierName => setNewItem(prev => ({
      ...prev,
      supplierName
    })),
    toastId: "add-supplier-valid-characters",
    helperText: "Optional. Select a supplier if known, or choose Other supplier / not listed to type a new one."
  }), /*#__PURE__*/React.createElement("div", {
    className: "inventory-add-field space-y-1.5"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "default-selling-price",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Default Selling Price"), /*#__PURE__*/React.createElement(Input, {
    id: "default-selling-price",
    type: "text",
    min: "0.01",
    step: "0.01",
    inputMode: "decimal",
    value: newItem.defaultSellingPrice,
    onChange: e => setNewItem({
      ...newItem,
      defaultSellingPrice: sanitizeDecimalInput(e.target.value, "Default Selling Price", "add-default-price-numbers-only")
    }),
    placeholder: "e.g., 250.00",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "42px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700",
    style: {
      fontSize: "12px"
    }
  }, "Optional. This price will automatically appear as the Unit Price when the item is selected in Sales Recording.")), renderAddSectionHeader("Stock Level and Alert Threshold"), /*#__PURE__*/React.createElement("div", {
    className: "inventory-add-field space-y-1.5"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "quantity",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Initial Stock Quantity"), /*#__PURE__*/React.createElement(Input, {
    id: "quantity",
    type: "text",
    min: "0",
    step: "1",
    inputMode: "numeric",
    value: newItem.quantity,
    onChange: e => setNewItem({
      ...newItem,
      quantity: sanitizeWholeNumberInput(e.target.value, "Initial Stock Quantity", "add-initial-quantity-numbers-only")
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
    className: "inventory-add-field space-y-1.5"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "reorder-level",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Manual Low-Stock Threshold"), /*#__PURE__*/React.createElement(Input, {
    id: "reorder-level",
    type: "text",
    min: "0",
    step: "1",
    inputMode: "numeric",
    value: newItem.reorderLevel,
    onChange: e => setNewItem({
      ...newItem,
      reorderLevel: sanitizeWholeNumberInput(e.target.value, "Manual Low-Stock Threshold", "add-reorder-threshold-numbers-only")
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
    className: "text-slate-700",
    style: {
      fontSize: "12px"
    }
  }, "The item will be marked Low Stock when its quantity is equal to or below this number.")), renderAddSectionHeader("Supplier Lead Time Support"), /*#__PURE__*/React.createElement("div", {
    className: "inventory-add-field space-y-1.5"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "add-lead-time-days",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Supplier Lead Time"), /*#__PURE__*/React.createElement(Input, {
    id: "add-lead-time-days",
    type: "text",
    inputMode: "numeric",
    value: newItem.leadTimeDays,
    onChange: e => setNewItem({
      ...newItem,
      leadTimeDays: sanitizeWholeNumberInput(e.target.value, "Supplier Lead Time", "add-lead-time-days-numbers-only")
    }),
    placeholder: "e.g., 7 days",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "42px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700",
    style: {
      fontSize: "12px"
    }
  }, "Optional. Use the supplier's usual delivery period.")), /*#__PURE__*/React.createElement("div", {
    className: "inventory-add-field space-y-1.5"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "add-safety-stock",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Safety Stock"), /*#__PURE__*/React.createElement(Input, {
    id: "add-safety-stock",
    type: "text",
    inputMode: "numeric",
    value: newItem.safetyStock,
    onChange: e => setNewItem({
      ...newItem,
      safetyStock: sanitizeWholeNumberInput(e.target.value, "Safety Stock", "add-safety-stock-numbers-only")
    }),
    placeholder: "e.g., 10",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "42px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700",
    style: {
      fontSize: "12px"
    }
  }, "Optional buffer stock added to the suggested reorder point.")), renderAverageDailySalesDisplay(0), renderEstimatedReorderSummary({
    supplierName: newItem.supplierName,
    averageDailySales: 0,
    leadTimeDays: newItem.leadTimeDays,
    safetyStock: newItem.safetyStock
  }), archivedDuplicatePrompt && /*#__PURE__*/React.createElement("div", {
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
    type: "button",
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
    type: "button",
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
  }, renderSortButton('id', 'Item Code')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[240px]"
  }, renderSortButton('name', 'Item Name')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[180px]"
  }, renderSortButton('category', 'Category')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[190px]"
  }, renderSortButton('supplier', 'Supplier')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[130px] text-right"
  }, renderSortButton('srp', 'SRP', 'right')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[120px] text-right"
  }, renderSortButton('quantity', 'Quantity', 'right')), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[150px]"
  }, renderSortButton('status', 'Status')), canViewReorderPlanning && /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[150px]"
  }, renderStaticHeaderLabel("Suggested Point")), /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[160px] text-right"
  }, renderSortButton('date', 'Last Updated', 'right')), canShowInventoryActions && /*#__PURE__*/React.createElement(TableHead, {
    className: "w-[150px] pl-3 text-left"
  }, renderStaticHeaderLabel("Actions")))), /*#__PURE__*/React.createElement(TableBody, null, sortedInventory.length === 0 ? /*#__PURE__*/React.createElement(TableRow, null, /*#__PURE__*/React.createElement(TableCell, {
    colSpan: inventoryTableColumnCount,
    className: "py-12 text-center"
  }, /*#__PURE__*/React.createElement(Box, {
    className: "mx-auto mb-4 h-14 w-14 text-slate-300"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "mb-2 font-semibold text-slate-700"
  }, inventory.length === 0 ? "No Inventory Items" : "No Inventory Items Found"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-700"
  }, inventory.length === 0 ? "Items added to inventory will appear here." : "Try adjusting your search or category filter."))) : paginatedInventory.map(item => /*#__PURE__*/React.createElement(TableRow, {
    key: item.id,
    tabIndex: -1,
    "data-inventory-record-id": String(item.id),
    className: highlightedInventoryRowId === String(item.id) ? "inventory-row-highlight" : ""
  }, /*#__PURE__*/React.createElement(TableCell, {
    className: "font-mono text-sm align-middle"
  }, item.itemCode || item.id), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, item.category), /*#__PURE__*/React.createElement(TableCell, null, item.supplierName || "Unassigned"), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-right font-medium text-slate-900"
  }, item.defaultSellingPrice ? `P${Number(item.defaultSellingPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "No price"), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-right"
  }, item.quantity), /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement(Badge, {
    className: getStatusBadgeClass(getComputedStockStatus(item))
  }, getComputedStockStatus(item))), canViewReorderPlanning && /*#__PURE__*/React.createElement(TableCell, null, renderReorderPlanningCompact(item)), /*#__PURE__*/React.createElement(TableCell, {
    className: "text-sm text-slate-700 text-right"
  }, formatDateTime(item.lastUpdated)), canShowInventoryActions && /*#__PURE__*/React.createElement(TableCell, null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-end gap-2"
  }, canPerformInventoryMovement(user.role) && /*#__PURE__*/React.createElement(Button, {
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
  })), canPerformInventoryMovement(user.role) && /*#__PURE__*/React.createElement(Button, {
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
  })), canManageInventory(user.role) && /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "outline",
    className: "inventory-action-edit border-blue-500 text-blue-700 hover:bg-blue-100",
    title: "Edit item details",
    onClick: () => openEditDialog(item)
  }, /*#__PURE__*/React.createElement(Pencil, {
    className: "w-4 h-4"
  })), canManageInventory(user.role) && /*#__PURE__*/React.createElement(Button, {
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
  }, [["id", "Code"], ["name", "Name"], ["category", "Category"], ["supplier", "Supplier"], ["srp", "SRP"], ["quantity", "Qty"], ["status", "Status"], ["date", "Updated"]].map(([column, label]) => /*#__PURE__*/React.createElement(Button, {
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
    className: "text-sm text-slate-700"
  }, inventory.length === 0 ? "Items added to inventory will appear here." : "Try adjusting your search or category filter.")) : paginatedInventory.map(item => /*#__PURE__*/React.createElement("article", {
    key: item.id,
    tabIndex: -1,
    "data-inventory-record-id": String(item.id),
    className: `inventory-mobile-card ${highlightedInventoryRowId === String(item.id) ? "inventory-row-highlight" : ""}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-card-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "min-w-0"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "inventory-mobile-name"
  }, item.name), /*#__PURE__*/React.createElement("p", {
    className: "inventory-mobile-id"
  }, "Item Code: ", item.itemCode || item.id)), /*#__PURE__*/React.createElement(Badge, {
    className: `inventory-status-badge ${getStatusBadgeClass(getComputedStockStatus(item))}`
  }, getComputedStockStatus(item))), /*#__PURE__*/React.createElement("div", {
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
  }, "Supplier"), /*#__PURE__*/React.createElement("span", {
    className: "inventory-mobile-value"
  }, item.supplierName || "Unassigned")), /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inventory-mobile-label"
  }, "Quantity"), /*#__PURE__*/React.createElement("span", {
    className: "inventory-mobile-value"
  }, item.quantity, " ", item.quantity === 1 ? "unit" : "units")), canViewReorderPlanning && /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-field inventory-mobile-reorder-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inventory-mobile-label"
  }, "Suggested Point"), /*#__PURE__*/React.createElement("span", {
    className: "inventory-mobile-value"
  }, renderReorderPlanningCompact(item)))), /*#__PURE__*/React.createElement("p", {
    className: "inventory-mobile-date"
  }, "Last Updated: ", formatDateTime(item.lastUpdated)), canShowInventoryActions && /*#__PURE__*/React.createElement("div", {
    className: "inventory-mobile-actions"
  }, canPerformInventoryMovement(user.role) && /*#__PURE__*/React.createElement(Button, {
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
  }), "Stock In"), canPerformInventoryMovement(user.role) && /*#__PURE__*/React.createElement(Button, {
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
  }), "Stock Out"), canManageInventory(user.role) && /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "inventory-action-edit border-blue-500 text-blue-700 hover:bg-blue-100",
    title: "Edit item details",
    onClick: () => openEditDialog(item)
  }, /*#__PURE__*/React.createElement(Pencil, {
    className: "mr-1 h-4 w-4"
  }), "Edit"), canManageInventory(user.role) && /*#__PURE__*/React.createElement(Button, {
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
    open: isBatchStockAdjustmentDialogOpen,
    onOpenChange: open => {
      if (open) {
        setIsBatchStockAdjustmentDialogOpen(true);
      } else {
        requestCloseBatchStockAdjustmentDialog();
      }
    }
  }, /*#__PURE__*/React.createElement(DialogContent, {
    className: "inventory-dialog-content border border-slate-200 bg-white shadow-2xl",
    style: {
      width: "min(720px, calc(100vw - 32px))",
      maxWidth: "720px",
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
  }, "Batch Stock Adjustment"), /*#__PURE__*/React.createElement(DialogDescription, {
    className: "mt-3 leading-relaxed text-slate-950",
    style: {
      fontSize: "14px"
    }
  }, "Add stock for multiple items when correcting inventory counts. Use Purchase Entry instead when the stock came from a supplier DR/SI."))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center text-green-950",
    style: {
      gap: "12px",
      border: "1px solid #BBF7D0",
      background: "#F0FDF4",
      borderRadius: "10px",
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement(Info, {
    className: "shrink-0 text-green-700",
    style: {
      width: "18px",
      height: "18px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px"
    }
  }, "This creates stock movement and audit records only. It does not create purchase records or supplier reports.")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "batch-stock-adjustment-reason",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Adjustment Reason"), /*#__PURE__*/React.createElement(Select, {
    value: batchStockAdjustmentReason,
    onValueChange: setBatchStockAdjustmentReason
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    id: "batch-stock-adjustment-reason",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      minHeight: "46px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Select why stock is being added"
  })), /*#__PURE__*/React.createElement(SelectContent, null, MANUAL_STOCK_IN_REASON_OPTIONS.map(option => /*#__PURE__*/React.createElement(SelectItem, {
    key: option.value,
    value: option.value
  }, option.label))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, batchStockAdjustmentRows.map((row, index) => /*#__PURE__*/React.createElement("div", {
    key: index,
    className: "grid gap-2 md:grid-cols-[1fr_120px_auto]",
    style: {
      alignItems: "end"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-1"
  }, /*#__PURE__*/React.createElement(Label, {
    className: "text-xs font-semibold text-slate-700"
  }, "Item"), /*#__PURE__*/React.createElement(Select, {
    value: row.inventoryId,
    onValueChange: value => updateBatchStockAdjustmentRow(index, "inventoryId", value)
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      minHeight: "42px",
      borderRadius: "10px"
    }
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Select inventory item"
  })), /*#__PURE__*/React.createElement(SelectContent, null, inventory.map(item => /*#__PURE__*/React.createElement(SelectItem, {
    key: item.id,
    value: String(item.id),
    disabled: batchStockAdjustmentRows.some((selectedRow, rowIndex) => rowIndex !== index && String(selectedRow.inventoryId) === String(item.id))
  }, item.name, " - current stock ", item.quantity))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-1"
  }, /*#__PURE__*/React.createElement(Label, {
    className: "text-xs font-semibold text-slate-700"
  }, "Quantity to Add"), /*#__PURE__*/React.createElement(Input, {
    type: "text",
    inputMode: "numeric",
    "data-validation-label": "Batch Stock Adjustment Quantity",
    min: "1",
    value: row.quantity,
    onChange: e => updateBatchStockAdjustmentRow(
      index,
      "quantity",
      sanitizeWholeNumberInput(e.target.value, "Batch Stock Adjustment Quantity", "batch-stock-adjustment-quantity-numbers-only")
    ),
    placeholder: "0",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "42px",
      borderRadius: "10px"
    }
  })), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "outline",
    className: "border-slate-200 text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-red-700 hover:shadow-sm",
    onClick: () => removeBatchStockAdjustmentRow(index),
    style: {
      height: "42px",
      borderRadius: "10px"
    }
  }, "Remove"))), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "outline",
    className: "w-full border-slate-200 text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-green-200 hover:bg-green-50 hover:text-green-700 hover:shadow-sm",
    onClick: addBatchStockAdjustmentRow
  }, /*#__PURE__*/React.createElement(Plus, {
    className: "mr-2 h-4 w-4"
  }), "Add Another Item")), renderActualTransactionDateFields({
    idPrefix: "batch-stock-adjustment",
    value: batchStockAdjustmentActualTransactionAt,
    onChange: value => handleActualTransactionDateChange(value, setBatchStockAdjustmentActualTransactionAt, "batch stock adjustment"),
    reasonValue: batchStockAdjustmentBackdateReason,
    onReasonChange: setBatchStockAdjustmentBackdateReason,
    recordLabel: "batch stock adjustment"
  }), /*#__PURE__*/React.createElement(DialogFooter, {
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
    onClick: requestCloseBatchStockAdjustmentDialog
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "modal-button-success font-semibold shadow-lg",
    onClick: handleBatchStockAdjustment,
    style: {
      height: "38px",
      minWidth: "170px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px",
      background: "#16A34A",
      color: "#FFFFFF",
      boxShadow: "0 14px 24px rgba(22, 163, 74, 0.18)"
    }
  }, "Confirm Adjustment")))), /*#__PURE__*/React.createElement(Dialog, {
    open: isBatchStockOutDialogOpen,
    onOpenChange: open => {
      if (open) {
        setIsBatchStockOutDialogOpen(true);
      } else {
        requestCloseBatchStockOutDialog();
      }
    }
  }, /*#__PURE__*/React.createElement(DialogContent, {
    className: "inventory-dialog-content border border-slate-200 bg-white shadow-2xl",
    style: {
      width: "min(720px, calc(100vw - 32px))",
      maxWidth: "720px",
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
  }, "Batch Non-Sales Stock Out"), /*#__PURE__*/React.createElement(DialogDescription, {
    className: "mt-3 leading-relaxed text-slate-950",
    style: {
      fontSize: "14px"
    }
  }, "Deduct multiple damaged, expired, missing, transferred, or corrected items in one transaction while keeping movement history accurate."))), /*#__PURE__*/React.createElement("div", {
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
  }, "Use this only for non-sales reductions such as verified damage, expiry, loss, transfer, or manual adjustment. Customer purchases should be recorded in the Sales module.")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "batch-stock-out-reason",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Stock-Out Reason"), /*#__PURE__*/React.createElement(Select, {
    value: batchStockOutReason,
    onValueChange: setBatchStockOutReason
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    id: "batch-stock-out-reason",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      minHeight: "46px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Select why these stocks are being removed"
  })), /*#__PURE__*/React.createElement(SelectContent, null, MANUAL_STOCK_OUT_REASON_OPTIONS.map(option => /*#__PURE__*/React.createElement(SelectItem, {
    key: option.value,
    value: option.value
  }, option.label))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, batchStockOutRows.map((row, index) => {
    const selectedBatchItem = getBatchRowItem(row.inventoryId);
    const selectedIdsInOtherRows = new Set(batchStockOutRows.filter((_, rowIndex) => rowIndex !== index).map(item => String(item.inventoryId)).filter(Boolean));
    return /*#__PURE__*/React.createElement("div", {
      key: index,
      className: "grid gap-2 md:grid-cols-[1fr_120px_auto]",
      style: {
        alignItems: "end"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "space-y-1"
    }, /*#__PURE__*/React.createElement(Label, {
      className: "text-xs font-semibold text-slate-700"
    }, "Item"), /*#__PURE__*/React.createElement(Select, {
      value: row.inventoryId,
      onValueChange: value => updateBatchStockOutRow(index, "inventoryId", value)
    }, /*#__PURE__*/React.createElement(SelectTrigger, {
      className: "border-slate-300 bg-white text-slate-950",
      style: {
        minHeight: "42px",
        borderRadius: "10px"
      }
    }, /*#__PURE__*/React.createElement(SelectValue, {
      placeholder: "Select inventory item"
    })), /*#__PURE__*/React.createElement(SelectContent, null, inventory.filter(item => item.quantity > 0).map(item => /*#__PURE__*/React.createElement(SelectItem, {
      key: item.id,
      value: String(item.id),
      disabled: selectedIdsInOtherRows.has(String(item.id))
    }, item.name, " - ", item.quantity, " available"))))), /*#__PURE__*/React.createElement("div", {
      className: "space-y-1"
    }, /*#__PURE__*/React.createElement(Label, {
      className: "text-xs font-semibold text-slate-700"
    }, "Quantity"), /*#__PURE__*/React.createElement(Input, {
      type: "text",
      inputMode: "numeric",
      "data-validation-label": "Batch Stock Out Quantity",
      min: "1",
      max: selectedBatchItem?.quantity || undefined,
      value: row.quantity,
      onChange: e => updateBatchStockOutRow(
        index,
        "quantity",
        sanitizeWholeNumberInput(e.target.value, "Batch Stock Out Quantity", "batch-stock-out-quantity-numbers-only")
      ),
      placeholder: "0",
      className: "border-slate-300 bg-white text-slate-950",
      style: {
        height: "42px",
        borderRadius: "10px"
      }
    })), /*#__PURE__*/React.createElement(Button, {
      type: "button",
      variant: "outline",
      className: "border-slate-200 text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-red-700 hover:shadow-sm",
      onClick: () => removeBatchStockOutRow(index),
      style: {
        height: "42px",
        borderRadius: "10px"
      }
    }, "Remove"));
  }), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "outline",
    className: "w-full border-slate-200 text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-green-200 hover:bg-green-50 hover:text-green-700 hover:shadow-sm",
    onClick: addBatchStockOutRow
  }, /*#__PURE__*/React.createElement(Plus, {
    className: "mr-2 h-4 w-4"
  }), "Add Another Item")), renderActualTransactionDateFields({
    idPrefix: "batch-stock-out",
    value: batchStockOutActualTransactionAt,
    onChange: value => handleActualTransactionDateChange(value, setBatchStockOutActualTransactionAt, "batch stock-out record"),
    reasonValue: batchStockOutBackdateReason,
    onReasonChange: setBatchStockOutBackdateReason,
    recordLabel: "batch stock-out record"
  }), /*#__PURE__*/React.createElement(DialogFooter, {
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
    onClick: requestCloseBatchStockOutDialog
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "modal-button-danger font-semibold shadow-lg",
    onClick: handleBatchStockOut,
    style: {
      height: "38px",
      minWidth: "150px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px",
      background: "#DC2626",
      color: "#FFFFFF",
      boxShadow: "0 14px 24px rgba(220, 38, 38, 0.18)"
    }
  }, "Confirm Deduction")))), /*#__PURE__*/React.createElement(Dialog, {
    open: Boolean(dashboardPickerAction),
    onOpenChange: open => {
      if (!open) closeDashboardPicker();
    }
  }, /*#__PURE__*/React.createElement(DialogContent, {
    className: "inventory-dialog-content border border-slate-200 bg-white shadow-2xl",
    style: {
      width: "min(680px, calc(100vw - 32px))",
      maxWidth: "680px",
      padding: "22px",
      borderRadius: "14px",
      gap: "16px",
      overflow: "visible"
    }
  }, /*#__PURE__*/React.createElement(DialogHeader, {
    className: "space-y-1 text-left"
  }, /*#__PURE__*/React.createElement(DialogTitle, {
    className: "text-2xl font-bold tracking-tight text-slate-950"
  }, dashboardPickerAction === "stock-in" ? "Record Stock In" : "Record Stock Out"), /*#__PURE__*/React.createElement(DialogDescription, {
    className: "text-slate-950"
  }, dashboardPickerAction === "stock-in" ? "Choose the item that received new stock. The Stock In form will open next." : "Choose the item to deduct. The Stock Out form will open next.")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "dashboard-stock-action-item",
    className: "font-semibold text-slate-950"
  }, "Inventory Item"), /*#__PURE__*/React.createElement(Select, {
    value: dashboardPickerItemId,
    onValueChange: setDashboardPickerItemId
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    id: "dashboard-stock-action-item",
    className: "h-auto min-h-[46px] items-center border-slate-300 bg-white py-3 text-left text-slate-950 whitespace-normal [&_[data-slot=select-value]]:line-clamp-none [&_[data-slot=select-value]]:whitespace-normal [&_[data-slot=select-value]]:break-words [&_[data-slot=select-value]]:leading-snug",
    style: {
      borderRadius: "10px",
      whiteSpace: "normal",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Select inventory item"
  })), /*#__PURE__*/React.createElement(SelectContent, {
    className: "max-w-[min(680px,calc(100vw-32px))]"
  }, inventory.map(item => /*#__PURE__*/React.createElement(SelectItem, {
    key: item.id,
    value: String(item.id),
    disabled: dashboardPickerAction === "stock-out" && Number(item.quantity || 0) <= 0,
    className: "whitespace-normal break-words py-2 leading-snug",
    textValue: `${item.itemCode || item.id} - ${item.name} (${item.quantity} ${Number(item.quantity) === 1 ? "unit" : "units"})`
  }, item.itemCode || item.id, " - ", item.name, " (", item.quantity, " ", Number(item.quantity) === 1 ? "unit" : "units", ")")))), dashboardPickerAction === "stock-out" && /*#__PURE__*/React.createElement("p", {
    className: "text-xs leading-relaxed text-slate-700"
  }, "Items with zero stock are disabled because there is no available quantity to deduct."), /*#__PURE__*/React.createElement(DialogFooter, {
    className: "flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end"
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    className: "w-full border-slate-200 bg-white text-slate-950 hover:bg-slate-50 sm:w-auto",
    onClick: closeDashboardPicker
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: dashboardPickerAction === "stock-in" ? "w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto" : "w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto",
    onClick: continueDashboardStockAction
  }, dashboardPickerAction === "stock-in" ? "Continue to Stock In" : "Continue to Stock Out")))), /*#__PURE__*/React.createElement(Dialog, {
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
    className: "mt-3 max-w-full break-words leading-relaxed text-slate-950",
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
    type: "text",
    inputMode: "numeric",
    "data-validation-label": "Stock In Quantity",
    value: stockAmount,
    onChange: e => setStockAmount(sanitizeWholeNumberInput(e.target.value, "Stock In Quantity", "stock-in-quantity-numbers-only")),
    placeholder: "0",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "48px",
      borderRadius: "10px",
      fontSize: "18px",
      padding: "0 16px"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "stock-in-reason",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Reason for Stock In"), /*#__PURE__*/React.createElement(Select, {
    value: stockInReason,
    onValueChange: setStockInReason
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    id: "stock-in-reason",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      minHeight: "48px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Select why this stock is being added"
  })), /*#__PURE__*/React.createElement(SelectContent, null, MANUAL_STOCK_IN_REASON_OPTIONS.map(option => /*#__PURE__*/React.createElement(SelectItem, {
    key: option.value,
    value: option.value
  }, option.label)))), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700",
    style: {
      fontSize: "12px",
      lineHeight: "1.45"
    }
  }, "For supplier deliveries, use Purchase Entry, so supplier and document details are recorded."), stockInReason && /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700",
    style: {
      fontSize: "12px",
      lineHeight: "1.35"
    }
  }, STOCK_IN_REASON_OPTIONS.find(option => option.value === stockInReason)?.description)), renderActualTransactionDateFields({
    idPrefix: "stock-in",
    value: stockActualTransactionAt,
    onChange: value => handleActualTransactionDateChange(value, setStockActualTransactionAt, "stock-in record"),
    reasonValue: stockBackdateReason,
    onReasonChange: setStockBackdateReason,
    recordLabel: "stock-in record"
  }), renderStockPreview("in"), /*#__PURE__*/React.createElement(DialogFooter, {
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
    className: "mt-3 max-w-full break-words leading-relaxed text-slate-950",
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
    type: "text",
    inputMode: "numeric",
    "data-validation-label": "Stock Out Quantity",
    value: stockAmount,
    onChange: e => setStockAmount(sanitizeWholeNumberInput(e.target.value, "Stock Out Quantity", "stock-out-quantity-numbers-only")),
    placeholder: "0",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      height: "48px",
      borderRadius: "10px",
      fontSize: "18px",
      padding: "0 16px"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "stock-out-reason",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Reason for Stock Out"), /*#__PURE__*/React.createElement(Select, {
    value: stockOutReason,
    onValueChange: setStockOutReason
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    id: "stock-out-reason",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      minHeight: "48px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Select why this stock is being removed"
  })), /*#__PURE__*/React.createElement(SelectContent, null, MANUAL_STOCK_OUT_REASON_OPTIONS.map(option => /*#__PURE__*/React.createElement(SelectItem, {
    key: option.value,
    value: option.value
  }, option.label)))), stockOutReason && /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700",
    style: {
      fontSize: "12px",
      lineHeight: "1.35"
    }
  }, MANUAL_STOCK_OUT_REASON_OPTIONS.find(option => option.value === stockOutReason)?.description)
  ), renderActualTransactionDateFields({
    idPrefix: "stock-out",
    value: stockActualTransactionAt,
    onChange: value => handleActualTransactionDateChange(value, setStockActualTransactionAt, "stock-out record"),
    reasonValue: stockBackdateReason,
    onReasonChange: setStockBackdateReason,
    recordLabel: "stock-out record"
  }), renderStockPreview("out"), /*#__PURE__*/React.createElement(DialogFooter, {
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
      if (open) {
        setIsArchiveDialogOpen(true);
      } else {
        closeArchiveDialog();
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
    className: "mt-3 leading-relaxed text-slate-950",
    style: {
      fontSize: "14px"
    }
  }, "Move this item out of active inventory and into the archive."))), /*#__PURE__*/React.createElement("div", {
    className: "inventory-archive-general-warning flex items-center text-slate-900",
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
      gridTemplateColumns: "58px minmax(0, 1fr)",
      alignItems: "start",
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
    className: "inventory-archive-item-name font-bold text-slate-950",
    style: {
      marginBottom: "12px",
      fontSize: "21px",
      lineHeight: "1.22"
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
    className: "font-semibold text-slate-700"
  }, "Item Code:"), /*#__PURE__*/React.createElement("span", {
    className: "font-medium text-slate-950"
  }, selectedItem?.itemCode || selectedItem?.id), /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-700"
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
    className: "font-semibold text-slate-700"
  }, "Quantity:"), /*#__PURE__*/React.createElement("span", {
    className: "font-medium text-slate-950"
  }, selectedItem?.quantity ?? 0), /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-700"
  }, "Status:"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Badge, {
    className: `inventory-status-badge ${getStatusBadgeClass(getComputedStockStatus(selectedItem))}`
  }, getComputedStockStatus(selectedItem))))))), (selectedItem?.quantity ?? 0) > 0 && /*#__PURE__*/React.createElement("div", {
    className: "inventory-archive-stock-warning flex items-center text-orange-950",
    style: {
      gap: "12px",
      border: "1px solid #FDBA74",
      background: "#FFF7ED",
      borderRadius: "10px",
      padding: "12px 14px"
    }
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "shrink-0 text-orange-600",
    style: {
      width: "18px",
      height: "18px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px",
      lineHeight: "1.45"
    }
  }, "This item still has available stock. Archiving it will remove it from active inventory, but the archived record can still be reviewed later.")), /*#__PURE__*/React.createElement("div", {
    className: "inventory-archive-reason-field space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "archive-reason",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Reason for Archiving"), /*#__PURE__*/React.createElement(Select, {
    value: archiveReason,
    onValueChange: setArchiveReason
  }, /*#__PURE__*/React.createElement(SelectTrigger, {
    id: "archive-reason",
    className: "border-slate-300 bg-white text-slate-950",
    style: {
      minHeight: "44px",
      borderRadius: "10px",
      fontSize: "14px",
      padding: "0 14px"
    }
  }, /*#__PURE__*/React.createElement(SelectValue, {
    placeholder: "Select why this item is being archived"
  })), /*#__PURE__*/React.createElement(SelectContent, null, ARCHIVE_REASON_OPTIONS.map(option => /*#__PURE__*/React.createElement(SelectItem, {
    key: option.value,
    value: option.value
  }, option.label))))), /*#__PURE__*/React.createElement("div", {
    className: "inventory-archive-info-note flex items-center text-slate-800",
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
    onClick: closeArchiveDialog
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    className: "modal-button-dark font-semibold shadow-lg transition-transform duration-150 active:scale-95",
    onClick: handleArchiveItem,
    disabled: !archiveReason,
    style: {
      height: "38px",
      minWidth: "132px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px",
      background: "#111827",
      color: "#FFFFFF",
      opacity: archiveReason ? 1 : 0.58,
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
    className: "mt-3 flex max-w-full flex-col items-start text-sm leading-5 text-slate-700"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-800"
  }, "Category:"), " ", /*#__PURE__*/React.createElement("span", {
    className: "text-slate-950"
  }, normalizeCategory(similarDuplicatePrompt?.proposedCategory || similarDuplicatePrompt?.item?.category || newItem.category))), similarDuplicatePrompt?.item?.id ? /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-slate-800"
  }, "Item Code:"), " ", /*#__PURE__*/React.createElement("span", {
    className: "text-slate-950"
  }, similarDuplicatePrompt.item.itemCode || similarDuplicatePrompt.item.id)) : null))), /*#__PURE__*/React.createElement("div", {
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
    className: "text-sm leading-5 text-slate-700"
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
    onClick: event => {
      event.preventDefault();
      confirmAddSimilarItem(similarDuplicatePrompt);
    }
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
    className: "text-sm leading-relaxed text-slate-700"
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
    onClick: event => {
      event.preventDefault();
      confirmDiscardChanges(discardPrompt);
    }
  }, "Discard")))))))));
}
