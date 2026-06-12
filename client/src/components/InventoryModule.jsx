// Inventory module: manages branch stock records, stock-in/stock-out movements,
// archive actions, and reorder-support values.
import React from 'react';
import { useState } from "react";
import { Plus, Minus, Archive, Search, Filter, ArrowUp, ArrowDown, AlertTriangle, Info, PackagePlus, PackageMinus, CheckCircle, Box, Pencil, X, Eye } from "lucide-react";
import { linearSearch, linearSearchAll, mergeSort } from "../utils/algorithms";
import { formatDateTime } from "../utils/format";
import { getStockStatusBadgeClass } from "../utils/statusStyles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
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
import { clearFormDraft, formatDraftSavedAt, loadFormDraft, saveFormDraft } from "../utils/formDrafts";
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
  "Electricals",
  "Kiln Dry",
  "Paints",
  "Plywood",
  "PVC Pipe / Fittings",
  "Roofing",
  "Steel",
  "Other"
];

const ARCHIVE_REASON_OPTIONS = [
  { value: "discontinued", label: "Discontinued" },
  { value: "duplicate_record", label: "Duplicate Record" },
  { value: "expired", label: "Expired" },
  { value: "no_longer_sold", label: "No Longer Sold" },
  { value: "wrong_entry", label: "Wrong Entry" },
  { value: "other", label: "Other" }
];

const getArchiveReasonLabel = value =>
  ARCHIVE_REASON_OPTIONS.find(option => option.value === value)?.label || "";

// Transaction timestamps may be backdated for real-world receiving or stock-count
// corrections. The UI splits date and time for easier entry, then recombines the
// value before sending it to the backend for reporting and audit storage.
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

// Inventory duplicate checks normalize product names aggressively so common
// hardware-store variations such as inch marks, plural units, or x-by dimensions
// do not create duplicate stock records for the same physical item.
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

// Similar-name detection intentionally requires matching numeric tokens, such as
// sizes or measurements, before prompting the user. This catches likely typos
// while avoiding false matches between different product specifications.
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

// Form sanitizers keep invalid characters out of controlled inputs before the
// data reaches inventory validation, API requests, or persisted recovery drafts.
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

// Reorder planning separates the manual low-stock threshold from the suggested
// reorder point. Alerts continue to use the manual threshold, while the preview
// helps admins explain expected stock needs during reviews.
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
const getInventoryCategoryDisplay = item => {
  const category = normalizeCategory(item?.category) || "Uncategorized";
  const note = String(item?.categoryNote || "").trim();
  return note ? `${category}: ${note}` : category;
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
    inventoryChangeRequests,
    addInventoryItem,
    updateInventoryItem,
    submitInventoryChangeRequest,
    reviewInventoryChangeRequest,
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
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  const [isMyRequestsDialogOpen, setIsMyRequestsDialogOpen] = useState(false);
  const [myRequestPage, setMyRequestPage] = useState(1);
  const [approvalRequestFilter, setApprovalRequestFilter] = useState("all");
  const [approvalRequestPage, setApprovalRequestPage] = useState(1);
  const [approvalRequestSearch, setApprovalRequestSearch] = useState("");
  const [approvalRequestSort, setApprovalRequestSort] = useState("newest");
  const [isApprovalMobileView, setIsApprovalMobileView] = useState(false);
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
  const [archiveReasonNote, setArchiveReasonNote] = useState("");
  const [recoverableInventoryDraft, setRecoverableInventoryDraft] = useState(null);
  const [archivedDuplicatePrompt, setArchivedDuplicatePrompt] = useState(null);
  const [similarDuplicatePrompt, setSimilarDuplicatePrompt] = useState(null);
  const [isRestoringArchivedDuplicate, setIsRestoringArchivedDuplicate] = useState(false);
  const [newItemSupplierMode, setNewItemSupplierMode] = useState("listed");
  const [editItemSupplierMode, setEditItemSupplierMode] = useState("listed");
  const [editItem, setEditItem] = useState({
    name: "",
    category: "",
    categoryNote: "",
    supplierName: "",
    defaultSellingPrice: "",
    costPrice: "",
    reorderLevel: "",
    leadTimeDays: "",
    safetyStock: ""
  });

  // Sorting state controls both desktop and mobile inventory tables.
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
  const canRequestInventoryMasterDataChange =
    canPerformInventoryMovement(user?.role) && !canManageInventory(user?.role);
  const canOpenInventoryMasterDataForm =
    canManageInventory(user?.role) || canRequestInventoryMasterDataChange;
  const canEditReorderPlanning = canManageInventory(user?.role);
  const canViewReorderPlanning =
    canEditReorderPlanning || canPerformInventoryMovement(user?.role);
  const inventoryTableColumnCount =
    8 + (canViewReorderPlanning ? 1 : 0) + (canShowInventoryActions ? 1 : 0);

  // Dashboard shortcuts temporarily drive Inventory filters/actions. As soon as
  // the user changes a filter manually, Inventory owns the view state again.
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
  const pendingInventoryChangeRequests = React.useMemo(
    () => (inventoryChangeRequests || []).filter(request => request.status === "pending"),
    [inventoryChangeRequests]
  );
  const myPendingInventoryChangeRequests = React.useMemo(() => (
    canRequestInventoryMasterDataChange
      ? [...(inventoryChangeRequests || [])]
        .filter(request => String(request.status || "pending").toLowerCase() === "pending")
        .sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime())
      : []
  ), [canRequestInventoryMasterDataChange, inventoryChangeRequests]);
  const myPendingInventoryChangeRequestCount = myPendingInventoryChangeRequests.length;
  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const updateApprovalViewport = () => setIsApprovalMobileView(mediaQuery.matches);
    updateApprovalViewport();
    mediaQuery.addEventListener("change", updateApprovalViewport);
    return () => mediaQuery.removeEventListener("change", updateApprovalViewport);
  }, []);
  React.useEffect(() => {
    setApprovalRequestPage(1);
  }, [isApprovalMobileView]);
  React.useEffect(() => {
    if (myPendingInventoryChangeRequestCount === 0 && isMyRequestsDialogOpen) {
      setIsMyRequestsDialogOpen(false);
      setMyRequestPage(1);
    }
  }, [isMyRequestsDialogOpen, myPendingInventoryChangeRequestCount]);
  const currentBranch = normalizeDuplicateKeyPart(user?.branch);
  const buildDuplicateKey = item => [
    normalizeInventoryIdentityName(item.name),
    normalizeDuplicateKeyPart(normalizeCategory(item.category)),
    normalizeDuplicateKeyPart(item.branch || user?.branch)
  ].join("|");
  const [newItem, setNewItem] = useState({
    name: "",
    category: "",
    categoryNote: "",
    supplierName: "",
    defaultSellingPrice: "",
    costPrice: "",
    quantity: "",
    reorderLevel: "10", // Default manual threshold
    leadTimeDays: "",
    safetyStock: ""
  });
  const inventoryDraftUserId = user?.id || user?.userId || user?.username || user?.name || "current-user";
  const inventoryDraftBranch = user?.branch || "current-branch";
  const getInventoryDraftScope = React.useCallback(module => ({
    module,
    userId: inventoryDraftUserId,
    branch: inventoryDraftBranch
  }), [inventoryDraftBranch, inventoryDraftUserId]);
  const dismissedInventoryDraftScopesRef = React.useRef(new Set());
  const getInventoryDraftScopeId = React.useCallback(scope => [
    scope?.module || "",
    scope?.branch || "",
    scope?.userId || ""
  ].join("|"), []);
  const getInventoryEditDraftModule = itemId => `inventory-edit-item-${itemId || "unknown"}`;
  const getInventoryStockInDraftModule = itemId => `inventory-stock-in-${itemId || "unknown"}`;
  const getInventoryStockOutDraftModule = itemId => `inventory-stock-out-${itemId || "unknown"}`;

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

  // Filtered inventory view for staff search and stock review workflows.
  // Combined text, category, supplier, and stock-status criteria help staff
  // isolate actionable inventory records without changing the underlying data.
  const inventoryFilterContext = linearSearchAll(inventory, item => {
    const query = searchQuery.trim().toLowerCase();
    const supplierName = item.supplierName?.trim() || "";
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      getInventoryCategoryDisplay(item).toLowerCase().includes(query) ||
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
    const nextSortOrder = sortBy === column
      ? sortOrder === 'asc' ? 'desc' : 'asc'
      : column === 'date' ? 'desc' : 'asc';
    setSortBy(column);
    setSortOrder(nextSortOrder);
  };

  // ➕ Add Item
  const renderSortIndicator = column => {
    const isActive = sortBy === column;
    const isAscending = isActive && sortOrder === "asc";
    const isDescending = isActive && sortOrder === "desc";
    return /*#__PURE__*/React.createElement("span", {
      className: `table-sort-direction ${isActive ? "table-sort-direction-active" : ""}`,
      "aria-hidden": "true"
    }, /*#__PURE__*/React.createElement(ArrowUp, {
      className: `table-sort-direction-arrow table-sort-direction-arrow-up ${isAscending ? "table-sort-direction-arrow-current" : ""} ${isDescending ? "table-sort-direction-arrow-muted" : ""}`
    }), /*#__PURE__*/React.createElement(ArrowDown, {
      className: `table-sort-direction-arrow table-sort-direction-arrow-down ${isDescending ? "table-sort-direction-arrow-current" : ""} ${isAscending ? "table-sort-direction-arrow-muted" : ""}`
    }));
  };

  const renderSortButton = (column, label, align = 'left') => /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => handleSort(column),
    className: `table-sort-header-button inventory-sort-header-button inline-flex h-8 w-full appearance-none items-center border-0 bg-transparent px-0 py-0 font-semibold shadow-none ${align === 'right' ? 'justify-end text-right' : 'justify-start text-left'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: `flex w-full items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`
  }, /*#__PURE__*/React.createElement("span", null, label), renderSortIndicator(column)));

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
    className: "inventory-pagination-button",
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
    className: "inventory-pagination-button",
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
      categoryNote: "",
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

  // Dashboard cards dispatch storage/events instead of importing this module.
  // This handler translates those cross-module intents into the same dialogs and
  // permission checks used by direct Inventory actions.
  const applyDashboardInventoryAction = React.useCallback((action, itemId = "") => {
    if (!action) return;
    if (action === "review-item-requests") {
      if (!canManageInventory(user?.role)) {
        toast.error("Item request review is available only to Admin / Owner accounts.");
        return;
      }
      setApprovalRequestFilter("all");
      setApprovalRequestSearch("");
      setApprovalRequestSort("newest");
      setApprovalRequestPage(1);
      setIsApprovalDialogOpen(true);
      return;
    }

    if (action === "add-item") {
      if (!canOpenInventoryMasterDataForm) {
        toast.error("Add Item is available only to Admin / Owner and inventory-authorized accounts.");
        return;
      }
      setDashboardPickerAction(null);
      setIsAddDialogOpen(true);
      return;
    }

    if (action === "daily-sales-deduction") {
      if (!canPerformInventoryMovement(user?.role)) {
        toast.error("Batch Stock Out is available only to Admin / Owner and inventory-authorized accounts.");
        return;
      }
      setDashboardPickerAction(null);
      setIsBatchStockOutDialogOpen(true);
      return;
    }

    if (action === "stock-in") {
      if (!canPerformInventoryMovement(user?.role)) {
        toast.error("Stock In is available only to Admin / Owner and inventory-authorized accounts.");
        return;
      }
      setDashboardPickerItemId(itemId ? String(itemId) : "");
      setDashboardPickerAction("stock-in");
      return;
    }

    if (action === "stock-out") {
      if (!canPerformInventoryMovement(user?.role)) {
        toast.error("Stock Out is available only to Admin / Owner and inventory-authorized accounts.");
        return;
      }
      setDashboardPickerItemId(itemId ? String(itemId) : "");
      setDashboardPickerAction("stock-out");
    }
  }, [canOpenInventoryMasterDataForm, user?.role]);

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
      newItem.categoryNote.trim() !== "" ||
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

  const hasBatchStockAdjustmentChanges = () => {
    return batchStockAdjustmentReason !== "" ||
      batchStockAdjustmentActualTransactionAt !== "" ||
      batchStockAdjustmentBackdateReason !== "" ||
      batchStockAdjustmentRows.some(row => row.inventoryId || row.quantity);
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
      String(editItem.categoryNote || "").trim() !== String(selectedItem.categoryNote || "").trim() ||
      editItem.supplierName.trim() !== (selectedItem.supplierName || "") ||
      String(editItem.defaultSellingPrice || "") !== String(selectedItem.defaultSellingPrice ?? "") ||
      String(editItem.costPrice || "") !== String(selectedItem.costPrice ?? "") ||
      String(editItem.reorderLevel) !== String(selectedItem.reorderLevel) ||
      String(editItem.leadTimeDays || "") !== String(selectedItem.leadTimeDays ?? "") ||
      String(editItem.safetyStock || "") !== String(selectedItem.safetyStock ?? "");
  };

  const closeAddItemDialog = ({ clearDraft = true } = {}) => {
    if (clearDraft) clearFormDraft(getInventoryDraftScope("inventory-add-item"));
    setRecoverableInventoryDraft(current => current?.kind === "addItem" ? null : current);
    setSimilarDuplicatePrompt(null);
    setArchivedDuplicatePrompt(null);
    setIsAddDialogOpen(false);
    resetAddItemForm();
  };

  const closeStockInDialog = ({ clearDraft = true } = {}) => {
    if (clearDraft && selectedItem?.id) clearFormDraft(getInventoryDraftScope(getInventoryStockInDraftModule(selectedItem.id)));
    setRecoverableInventoryDraft(current => current?.kind === "stockIn" ? null : current);
    setIsStockInDialogOpen(false);
    setSelectedItem(null);
    resetStockForm();
  };

  const closeBatchStockAdjustmentDialog = ({ clearDraft = true } = {}) => {
    if (clearDraft) clearFormDraft(getInventoryDraftScope("inventory-batch-stock-adjustment"));
    setRecoverableInventoryDraft(current => current?.kind === "batchStockAdjustment" ? null : current);
    setIsBatchStockAdjustmentDialogOpen(false);
    resetBatchStockAdjustmentForm();
  };

  const closeBatchStockOutDialog = ({ clearDraft = true } = {}) => {
    if (clearDraft) clearFormDraft(getInventoryDraftScope("inventory-batch-stock-out"));
    setRecoverableInventoryDraft(current => current?.kind === "batchStockOut" ? null : current);
    setIsBatchStockOutDialogOpen(false);
    resetBatchStockOutForm();
  };

  const closeEditDialog = ({ clearDraft = true } = {}) => {
    if (clearDraft && selectedItem?.id) clearFormDraft(getInventoryDraftScope(getInventoryEditDraftModule(selectedItem.id)));
    setRecoverableInventoryDraft(current => current?.kind === "editItem" ? null : current);
    setSimilarDuplicatePrompt(null);
    setIsEditDialogOpen(false);
    setSelectedItem(null);
    setEditItem({
      name: "",
      category: "",
      categoryNote: "",
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
    if (hasAddItemChanges()) {
      saveCurrentInventoryDraftNow();
      dismissedInventoryDraftScopesRef.current.delete(getInventoryDraftScopeId(getInventoryDraftScope("inventory-add-item")));
      closeAddItemDialog({ clearDraft: false });
      toast.info("Item draft saved.", {
        description: "Open Add Item again to resume or discard the unfinished draft."
      });
      return;
    }
    closeAddItemDialog();
  };

  const requestCloseStockInDialog = () => {
    if (hasStockFormChanges()) {
      saveCurrentInventoryDraftNow();
      if (selectedItem?.id) dismissedInventoryDraftScopesRef.current.delete(getInventoryDraftScopeId(getInventoryDraftScope(getInventoryStockInDraftModule(selectedItem.id))));
      closeStockInDialog({ clearDraft: false });
      toast.info("Stock-in draft saved.", {
        description: "Open the same Stock In form again to resume or discard it."
      });
      return;
    }
    closeStockInDialog();
  };

  const requestCloseStockOutDialog = () => {
    if (hasStockFormChanges()) {
      saveCurrentInventoryDraftNow();
      if (selectedItem?.id) dismissedInventoryDraftScopesRef.current.delete(getInventoryDraftScopeId(getInventoryDraftScope(getInventoryStockOutDraftModule(selectedItem.id))));
      closeStockOutDialog({ clearDraft: false });
      toast.info("Stock-out draft saved.", {
        description: "Open the same Stock Out form again to resume or discard it."
      });
      return;
    }
    closeStockOutDialog();
  };

  const requestCloseBatchStockAdjustmentDialog = () => {
    if (hasBatchStockAdjustmentChanges()) {
      saveCurrentInventoryDraftNow();
      dismissedInventoryDraftScopesRef.current.delete(getInventoryDraftScopeId(getInventoryDraftScope("inventory-batch-stock-adjustment")));
      closeBatchStockAdjustmentDialog({ clearDraft: false });
      toast.info("Batch stock adjustment draft saved.", {
        description: "Open Batch Stock Adjustment again to resume or discard it."
      });
      return;
    }
    closeBatchStockAdjustmentDialog();
  };

  const requestCloseBatchStockOutDialog = () => {
    if (hasBatchStockOutChanges()) {
      saveCurrentInventoryDraftNow();
      dismissedInventoryDraftScopesRef.current.delete(getInventoryDraftScopeId(getInventoryDraftScope("inventory-batch-stock-out")));
      closeBatchStockOutDialog({ clearDraft: false });
      toast.info("Batch stock-out draft saved.", {
        description: "Open Batch Non-Sales Out again to resume or discard it."
      });
      return;
    }
    closeBatchStockOutDialog();
  };

  const requestCloseEditDialog = () => {
    if (hasEditItemChanges()) {
      saveCurrentInventoryDraftNow();
      if (selectedItem?.id) dismissedInventoryDraftScopesRef.current.delete(getInventoryDraftScopeId(getInventoryDraftScope(getInventoryEditDraftModule(selectedItem.id))));
      closeEditDialog({ clearDraft: false });
      toast.info("Item edit draft saved.", {
        description: "Open the same item again to resume or discard the unfinished edits."
      });
      return;
    }
    closeEditDialog();
  };

  const closeStockOutDialog = ({ clearDraft = true } = {}) => {
    if (clearDraft && selectedItem?.id) clearFormDraft(getInventoryDraftScope(getInventoryStockOutDraftModule(selectedItem.id)));
    setRecoverableInventoryDraft(current => current?.kind === "stockOut" ? null : current);
    setIsStockOutDialogOpen(false);
    setSelectedItem(null);
    resetStockForm();
  };

  const closeArchiveDialog = () => {
    setIsArchiveDialogOpen(false);
    setSelectedItem(null);
    setArchiveReason("");
    setArchiveReasonNote("");
  };

  // Draft recovery prevents accidental data loss for unfinished inventory work.
  // Drafts are local only and never create official records, stock movements, or
  // approval requests until the user explicitly confirms the form.
  const persistInventoryDraft = React.useCallback((scope, data) => {
    saveFormDraft({ ...scope, data });
  }, []);

  const persistAddItemDraft = React.useCallback((nextItem, supplierMode = newItemSupplierMode) => {
    const hasMeaningfulInput =
      String(nextItem.name || "").trim() !== "" ||
      String(nextItem.category || "").trim() !== "" ||
      String(nextItem.categoryNote || "").trim() !== "" ||
      String(nextItem.supplierName || "").trim() !== "" ||
      String(nextItem.defaultSellingPrice || "").trim() !== "" ||
      String(nextItem.costPrice || "").trim() !== "" ||
      String(nextItem.quantity || "").trim() !== "" ||
      String(nextItem.reorderLevel || "") !== "10" ||
      String(nextItem.leadTimeDays || "").trim() !== "" ||
      String(nextItem.safetyStock || "").trim() !== "";

    if (!hasMeaningfulInput) return;
    saveFormDraft({
      ...getInventoryDraftScope("inventory-add-item"),
      data: {
        newItem: nextItem,
        supplierMode
      }
    });
  }, [getInventoryDraftScope, newItemSupplierMode]);

  const updateNewItemDraft = React.useCallback(updater => {
    setNewItem(previous => {
      const nextItem = typeof updater === "function" ? updater(previous) : updater;
      persistAddItemDraft(nextItem);
      return nextItem;
    });
  }, [persistAddItemDraft]);

  const persistEditItemDraft = React.useCallback((nextItem, supplierMode = editItemSupplierMode) => {
    if (!selectedItem?.id) return;
    saveFormDraft({
      ...getInventoryDraftScope(getInventoryEditDraftModule(selectedItem.id)),
      data: {
        itemId: selectedItem.id,
        editItem: nextItem,
        supplierMode
      }
    });
  }, [editItemSupplierMode, getInventoryDraftScope, selectedItem]);

  const updateEditItemDraft = React.useCallback(updater => {
    setEditItem(previous => {
      const nextItem = typeof updater === "function" ? updater(previous) : updater;
      persistEditItemDraft(nextItem);
      return nextItem;
    });
  }, [persistEditItemDraft]);

  const persistStockInDraft = React.useCallback(patch => {
    if (!selectedItem?.id) return;
    saveFormDraft({
      ...getInventoryDraftScope(getInventoryStockInDraftModule(selectedItem.id)),
      data: {
        itemId: selectedItem.id,
        stockAmount,
        stockInReason,
        stockActualTransactionAt,
        stockBackdateReason,
        ...patch
      }
    });
  }, [getInventoryDraftScope, selectedItem, stockAmount, stockInReason, stockActualTransactionAt, stockBackdateReason]);

  const persistStockOutDraft = React.useCallback(patch => {
    if (!selectedItem?.id) return;
    saveFormDraft({
      ...getInventoryDraftScope(getInventoryStockOutDraftModule(selectedItem.id)),
      data: {
        itemId: selectedItem.id,
        stockAmount,
        stockOutReason,
        stockActualTransactionAt,
        stockBackdateReason,
        ...patch
      }
    });
  }, [getInventoryDraftScope, selectedItem, stockAmount, stockOutReason, stockActualTransactionAt, stockBackdateReason]);

  const persistBatchStockAdjustmentDraft = React.useCallback(patch => {
    saveFormDraft({
      ...getInventoryDraftScope("inventory-batch-stock-adjustment"),
      data: {
        reason: batchStockAdjustmentReason,
        rows: batchStockAdjustmentRows,
        actualTransactionAt: batchStockAdjustmentActualTransactionAt,
        backdateReason: batchStockAdjustmentBackdateReason,
        ...patch
      }
    });
  }, [batchStockAdjustmentActualTransactionAt, batchStockAdjustmentBackdateReason, batchStockAdjustmentReason, batchStockAdjustmentRows, getInventoryDraftScope]);

  const persistBatchStockOutDraft = React.useCallback(patch => {
    saveFormDraft({
      ...getInventoryDraftScope("inventory-batch-stock-out"),
      data: {
        reason: batchStockOutReason,
        rows: batchStockOutRows,
        actualTransactionAt: batchStockOutActualTransactionAt,
        backdateReason: batchStockOutBackdateReason,
        ...patch
      }
    });
  }, [batchStockOutActualTransactionAt, batchStockOutBackdateReason, batchStockOutReason, batchStockOutRows, getInventoryDraftScope]);

  const showInventoryDraftRecovery = React.useCallback((kind, draft, scope, title, description) => {
    if (!draft?.data) return;
    if (dismissedInventoryDraftScopesRef.current.has(getInventoryDraftScopeId(scope))) return;
    setRecoverableInventoryDraft(current => {
      const nextScopeId = getInventoryDraftScopeId(scope);
      const currentScopeId = current?.scope ? getInventoryDraftScopeId(current.scope) : "";
      if (current && currentScopeId !== nextScopeId) return current;
      return {
        kind,
        data: draft.data,
        savedAt: draft.savedAt,
        scope,
        title,
        description
      };
    });
  }, [getInventoryDraftScopeId]);

  React.useEffect(() => {
    if (!isAddDialogOpen) return;
    const scope = getInventoryDraftScope("inventory-add-item");
    const draft = loadFormDraft(scope);
    showInventoryDraftRecovery(
      "addItem",
      draft,
      scope,
      "Unfinished item draft found",
      "An inventory item form was saved before it was completed. You can resume editing it or discard it. No inventory record was created."
    );
  }, [isAddDialogOpen, getInventoryDraftScope, showInventoryDraftRecovery]);

  React.useEffect(() => {
    if (!isEditDialogOpen || !selectedItem?.id) return;
    const scope = getInventoryDraftScope(getInventoryEditDraftModule(selectedItem.id));
    const draft = loadFormDraft(scope);
    if (draft?.data?.itemId && String(draft.data.itemId) !== String(selectedItem.id)) return;
    showInventoryDraftRecovery(
      "editItem",
      draft,
      scope,
      "Unfinished item edit found",
      "Item detail changes were saved before they were completed. You can resume editing them or discard the draft. The active inventory record was not changed."
    );
  }, [isEditDialogOpen, selectedItem?.id, getInventoryDraftScope, showInventoryDraftRecovery]);

  React.useEffect(() => {
    if (!isStockInDialogOpen || !selectedItem?.id) return;
    const scope = getInventoryDraftScope(getInventoryStockInDraftModule(selectedItem.id));
    const draft = loadFormDraft(scope);
    if (draft?.data?.itemId && String(draft.data.itemId) !== String(selectedItem.id)) return;
    showInventoryDraftRecovery(
      "stockIn",
      draft,
      scope,
      "Unfinished stock-in draft found",
      "A stock-in form was saved before it was confirmed. You can resume editing it or discard it. No stock was added and no movement record was created."
    );
  }, [isStockInDialogOpen, selectedItem?.id, getInventoryDraftScope, showInventoryDraftRecovery]);

  React.useEffect(() => {
    if (!isStockOutDialogOpen || !selectedItem?.id) return;
    const scope = getInventoryDraftScope(getInventoryStockOutDraftModule(selectedItem.id));
    const draft = loadFormDraft(scope);
    if (draft?.data?.itemId && String(draft.data.itemId) !== String(selectedItem.id)) return;
    showInventoryDraftRecovery(
      "stockOut",
      draft,
      scope,
      "Unfinished stock-out draft found",
      "A stock-out form was saved before it was confirmed. You can resume editing it or discard it. No stock was removed and no movement record was created."
    );
  }, [isStockOutDialogOpen, selectedItem?.id, getInventoryDraftScope, showInventoryDraftRecovery]);

  React.useEffect(() => {
    if (!isBatchStockAdjustmentDialogOpen) return;
    const scope = getInventoryDraftScope("inventory-batch-stock-adjustment");
    const draft = loadFormDraft(scope);
    showInventoryDraftRecovery(
      "batchStockAdjustment",
      draft,
      scope,
      "Unfinished batch stock adjustment found",
      "A batch stock adjustment was saved before it was confirmed. You can resume editing it or discard it. No stock was added and no movement records were created."
    );
  }, [isBatchStockAdjustmentDialogOpen, getInventoryDraftScope, showInventoryDraftRecovery]);

  React.useEffect(() => {
    if (!isBatchStockOutDialogOpen) return;
    const scope = getInventoryDraftScope("inventory-batch-stock-out");
    const draft = loadFormDraft(scope);
    showInventoryDraftRecovery(
      "batchStockOut",
      draft,
      scope,
      "Unfinished batch stock-out draft found",
      "A batch stock-out form was saved before it was confirmed. You can resume editing it or discard it. No stock was removed and no movement records were created."
    );
  }, [isBatchStockOutDialogOpen, getInventoryDraftScope, showInventoryDraftRecovery]);

  React.useEffect(() => {
    if (!isAddDialogOpen || !hasAddItemChanges()) return;
    persistInventoryDraft(getInventoryDraftScope("inventory-add-item"), {
      newItem,
      supplierMode: newItemSupplierMode
    });
  }, [isAddDialogOpen, newItem, newItemSupplierMode, getInventoryDraftScope, persistInventoryDraft]);

  React.useEffect(() => {
    if (!isEditDialogOpen || !selectedItem?.id || !hasEditItemChanges()) return;
    persistInventoryDraft(getInventoryDraftScope(getInventoryEditDraftModule(selectedItem.id)), {
      itemId: selectedItem.id,
      editItem,
      supplierMode: editItemSupplierMode
    });
  }, [isEditDialogOpen, selectedItem?.id, editItem, editItemSupplierMode, getInventoryDraftScope, persistInventoryDraft]);

  React.useEffect(() => {
    if (!isStockInDialogOpen || !selectedItem?.id || !hasStockFormChanges()) return;
    persistInventoryDraft(getInventoryDraftScope(getInventoryStockInDraftModule(selectedItem.id)), {
      itemId: selectedItem.id,
      stockAmount,
      stockInReason,
      stockActualTransactionAt,
      stockBackdateReason
    });
  }, [isStockInDialogOpen, selectedItem?.id, stockAmount, stockInReason, stockActualTransactionAt, stockBackdateReason, getInventoryDraftScope, persistInventoryDraft]);

  React.useEffect(() => {
    if (!isStockOutDialogOpen || !selectedItem?.id || !hasStockFormChanges()) return;
    persistInventoryDraft(getInventoryDraftScope(getInventoryStockOutDraftModule(selectedItem.id)), {
      itemId: selectedItem.id,
      stockAmount,
      stockOutReason,
      stockActualTransactionAt,
      stockBackdateReason
    });
  }, [isStockOutDialogOpen, selectedItem?.id, stockAmount, stockOutReason, stockActualTransactionAt, stockBackdateReason, getInventoryDraftScope, persistInventoryDraft]);

  React.useEffect(() => {
    if (!isBatchStockAdjustmentDialogOpen || !hasBatchStockAdjustmentChanges()) return;
    persistInventoryDraft(getInventoryDraftScope("inventory-batch-stock-adjustment"), {
      reason: batchStockAdjustmentReason,
      rows: batchStockAdjustmentRows,
      actualTransactionAt: batchStockAdjustmentActualTransactionAt,
      backdateReason: batchStockAdjustmentBackdateReason
    });
  }, [isBatchStockAdjustmentDialogOpen, batchStockAdjustmentReason, batchStockAdjustmentRows, batchStockAdjustmentActualTransactionAt, batchStockAdjustmentBackdateReason, getInventoryDraftScope, persistInventoryDraft]);

  React.useEffect(() => {
    if (!isBatchStockOutDialogOpen || !hasBatchStockOutChanges()) return;
    persistInventoryDraft(getInventoryDraftScope("inventory-batch-stock-out"), {
      reason: batchStockOutReason,
      rows: batchStockOutRows,
      actualTransactionAt: batchStockOutActualTransactionAt,
      backdateReason: batchStockOutBackdateReason
    });
  }, [isBatchStockOutDialogOpen, batchStockOutReason, batchStockOutRows, batchStockOutActualTransactionAt, batchStockOutBackdateReason, getInventoryDraftScope, persistInventoryDraft]);

  const saveCurrentInventoryDraftNow = React.useCallback(() => {
    if (isAddDialogOpen && hasAddItemChanges()) {
      saveFormDraft({
        ...getInventoryDraftScope("inventory-add-item"),
        data: {
          newItem,
          supplierMode: newItemSupplierMode
        }
      });
    }

    if (isEditDialogOpen && selectedItem?.id && hasEditItemChanges()) {
      saveFormDraft({
        ...getInventoryDraftScope(getInventoryEditDraftModule(selectedItem.id)),
        data: {
          itemId: selectedItem.id,
          editItem,
          supplierMode: editItemSupplierMode
        }
      });
    }

    if (isStockInDialogOpen && selectedItem?.id && hasStockFormChanges()) {
      saveFormDraft({
        ...getInventoryDraftScope(getInventoryStockInDraftModule(selectedItem.id)),
        data: {
          itemId: selectedItem.id,
          stockAmount,
          stockInReason,
          stockActualTransactionAt,
          stockBackdateReason
        }
      });
    }

    if (isStockOutDialogOpen && selectedItem?.id && hasStockFormChanges()) {
      saveFormDraft({
        ...getInventoryDraftScope(getInventoryStockOutDraftModule(selectedItem.id)),
        data: {
          itemId: selectedItem.id,
          stockAmount,
          stockOutReason,
          stockActualTransactionAt,
          stockBackdateReason
        }
      });
    }

    if (isBatchStockAdjustmentDialogOpen && hasBatchStockAdjustmentChanges()) {
      saveFormDraft({
        ...getInventoryDraftScope("inventory-batch-stock-adjustment"),
        data: {
          reason: batchStockAdjustmentReason,
          rows: batchStockAdjustmentRows,
          actualTransactionAt: batchStockAdjustmentActualTransactionAt,
          backdateReason: batchStockAdjustmentBackdateReason
        }
      });
    }

    if (isBatchStockOutDialogOpen && hasBatchStockOutChanges()) {
      saveFormDraft({
        ...getInventoryDraftScope("inventory-batch-stock-out"),
        data: {
          reason: batchStockOutReason,
          rows: batchStockOutRows,
          actualTransactionAt: batchStockOutActualTransactionAt,
          backdateReason: batchStockOutBackdateReason
        }
      });
    }
  }, [
    isAddDialogOpen,
    newItem,
    newItemSupplierMode,
    isEditDialogOpen,
    selectedItem,
    editItem,
    editItemSupplierMode,
    isStockInDialogOpen,
    isStockOutDialogOpen,
    stockAmount,
    stockInReason,
    stockOutReason,
    stockActualTransactionAt,
    stockBackdateReason,
    isBatchStockAdjustmentDialogOpen,
    batchStockAdjustmentReason,
    batchStockAdjustmentRows,
    batchStockAdjustmentActualTransactionAt,
    batchStockAdjustmentBackdateReason,
    isBatchStockOutDialogOpen,
    batchStockOutReason,
    batchStockOutRows,
    batchStockOutActualTransactionAt,
    batchStockOutBackdateReason,
    getInventoryDraftScope
  ]);

  const hasUnsavedInventoryDraftWork =
    (isAddDialogOpen && hasAddItemChanges()) ||
    (isEditDialogOpen && hasEditItemChanges()) ||
    ((isStockInDialogOpen || isStockOutDialogOpen) && hasStockFormChanges()) ||
    (isBatchStockAdjustmentDialogOpen && hasBatchStockAdjustmentChanges()) ||
    (isBatchStockOutDialogOpen && hasBatchStockOutChanges());

  // Before leaving the page, save recoverable drafts for operational forms that
  // might contain counted stock, backdate notes, or pending master-data changes.
  React.useEffect(() => {
    if (!hasUnsavedInventoryDraftWork) return undefined;
    const handleBeforeUnload = event => {
      saveCurrentInventoryDraftNow();
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedInventoryDraftWork, saveCurrentInventoryDraftNow]);

  const discardRecoveredInventoryDraft = () => {
    if (recoverableInventoryDraft?.scope) {
      clearFormDraft(recoverableInventoryDraft.scope);
      dismissedInventoryDraftScopesRef.current.add(getInventoryDraftScopeId(recoverableInventoryDraft.scope));
    }
    setRecoverableInventoryDraft(null);
  };

  const resumeRecoveredInventoryDraft = () => {
    if (!recoverableInventoryDraft?.data) return;
    const { kind, data } = recoverableInventoryDraft;
    if (recoverableInventoryDraft.scope) {
      dismissedInventoryDraftScopesRef.current.add(getInventoryDraftScopeId(recoverableInventoryDraft.scope));
    }

    if (kind === "addItem") {
      setNewItem(previous => ({ ...previous, ...data.newItem }));
      setNewItemSupplierMode(data.supplierMode || "listed");
    }

    if (kind === "editItem") {
      const draftItem = inventory.find(item => String(item.id) === String(data.itemId));
      if (!draftItem) {
        discardRecoveredInventoryDraft();
        toast.error("The draft item is no longer available in active inventory.");
        return;
      }
      setSelectedItem(draftItem);
      setEditItem(previous => ({ ...previous, ...data.editItem }));
      setEditItemSupplierMode(data.supplierMode || "listed");
    }

    if (kind === "stockIn" || kind === "stockOut") {
      const draftItem = inventory.find(item => String(item.id) === String(data.itemId));
      if (!draftItem) {
        discardRecoveredInventoryDraft();
        toast.error("The draft item is no longer available in active inventory.");
        return;
      }
      setSelectedItem(draftItem);
      setStockAmount(data.stockAmount || "");
      setStockActualTransactionAt(data.stockActualTransactionAt || "");
      setStockBackdateReason(data.stockBackdateReason || "");
      if (kind === "stockIn") {
        setStockInReason(data.stockInReason || "");
        setStockOutReason("");
      } else {
        setStockOutReason(data.stockOutReason || "");
        setStockInReason("");
      }
    }

    if (kind === "batchStockAdjustment") {
      const validRows = (data.rows || []).filter(row => row.inventoryId && inventory.some(item => String(item.id) === String(row.inventoryId)));
      setBatchStockAdjustmentReason(data.reason || "");
      setBatchStockAdjustmentRows(validRows.length ? validRows : [{ inventoryId: "", quantity: "" }]);
      setBatchStockAdjustmentActualTransactionAt(data.actualTransactionAt || "");
      setBatchStockAdjustmentBackdateReason(data.backdateReason || "");
      if ((data.rows || []).length > validRows.length) {
        toast.warning("Some draft lines were skipped because the items are no longer active.");
      }
    }

    if (kind === "batchStockOut") {
      const validRows = (data.rows || []).filter(row => row.inventoryId && inventory.some(item => String(item.id) === String(row.inventoryId)));
      setBatchStockOutReason(data.reason || "");
      setBatchStockOutRows(validRows.length ? validRows : [{ inventoryId: "", quantity: "" }]);
      setBatchStockOutActualTransactionAt(data.actualTransactionAt || "");
      setBatchStockOutBackdateReason(data.backdateReason || "");
      if ((data.rows || []).length > validRows.length) {
        toast.warning("Some draft lines were skipped because the items are no longer active.");
      }
    }

    setRecoverableInventoryDraft(null);
    toast.success("Draft recovered", {
      description: "Review the restored information before confirming the transaction."
    });
  };

  const renderInlineInventoryDraftRecovery = kind => {
    if (recoverableInventoryDraft?.kind !== kind) return null;
    return (
      <div
        className="inventory-add-field inventory-add-field-full"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "center",
          gap: "14px",
          border: "1px solid #BFDBFE",
          background: "#EFF6FF",
          borderRadius: "12px",
          padding: "12px 14px"
        }}
      >
        <div className="min-w-0">
          <p className="font-semibold text-slate-950" style={{ fontSize: "14px", lineHeight: "1.3" }}>
            {recoverableInventoryDraft?.title || "Unfinished draft found"}
          </p>
          <p className="text-slate-700" style={{ marginTop: "3px", fontSize: "12px", lineHeight: "1.45" }}>
            Last saved {formatDraftSavedAt(recoverableInventoryDraft?.savedAt)}. No official inventory record or stock movement was created.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="inventory-inline-draft-button inventory-inline-draft-button-secondary border-slate-200 bg-white text-slate-950"
            style={{ height: "34px", borderRadius: "10px", padding: "0 12px", fontSize: "12px" }}
            onClick={discardRecoveredInventoryDraft}
          >
            Discard
          </Button>
          <Button
            type="button"
            className="inventory-inline-draft-button inventory-inline-draft-button-primary bg-blue-600 text-white"
            style={{ height: "34px", borderRadius: "10px", padding: "0 12px", fontSize: "12px" }}
            onClick={resumeRecoveredInventoryDraft}
          >
            Resume Draft
          </Button>
        </div>
      </div>
    );
  };

  const renderInventoryDraftRecoveryDialog = () => /*#__PURE__*/React.createElement(Dialog, {
    open: Boolean(recoverableInventoryDraft),
    onOpenChange: open => {
      if (!open) setRecoverableInventoryDraft(null);
    }
  }, /*#__PURE__*/React.createElement(DialogContent, {
    className: "draft-recovery-dialog"
  }, /*#__PURE__*/React.createElement(DialogHeader, {
    className: "draft-recovery-header text-left"
  }, /*#__PURE__*/React.createElement("span", {
    className: "draft-recovery-icon",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement(Info, {
    className: "h-5 w-5"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(DialogTitle, {
    className: "draft-recovery-title"
  }, recoverableInventoryDraft?.title || "Unfinished draft found"), /*#__PURE__*/React.createElement(DialogDescription, {
    className: "draft-recovery-description"
  }, recoverableInventoryDraft?.description || "You can resume editing this draft or discard it."))), /*#__PURE__*/React.createElement("div", {
    className: "draft-recovery-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "draft-recovery-meta"
  }, /*#__PURE__*/React.createElement("span", null, "Last saved"), /*#__PURE__*/React.createElement("strong", null, formatDraftSavedAt(recoverableInventoryDraft?.savedAt)))), /*#__PURE__*/React.createElement("div", {
    className: "draft-recovery-actions"
  }, /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "outline",
    className: "draft-recovery-action draft-recovery-action-secondary",
    onClick: discardRecoveredInventoryDraft
  }, "Discard Draft"), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    className: "draft-recovery-action draft-recovery-action-primary",
    onClick: resumeRecoveredInventoryDraft
  }, "Resume Draft"))));
  
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

  // Approval rows compare only the fields admins need to evaluate. This keeps
  // Inventory Staff change requests focused on business impact: identity,
  // supplier, price, stock threshold, and reorder-planning values.
  const getFirstDefinedApprovalValue = (source, keys) => {
    for (const key of keys) {
      if (source?.[key] !== undefined && source?.[key] !== null) return source[key];
    }
    return undefined;
  };

  const isBlankApprovalValue = value => value === null || value === undefined || String(value).trim() === "";

  const normalizeApprovalCompareValue = (value, type = "text") => {
    if (isBlankApprovalValue(value)) return "";
    if (type === "money" || type === "stock") {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? String(numericValue) : "";
    }
    return String(value).trim();
  };

  const formatApprovalValue = (value, type = "text", emptyLabel = "Not assigned") => {
    if (isBlankApprovalValue(value)) return emptyLabel;
    if (type === "money") {
      const amount = Number(value);
      return Number.isFinite(amount) ? `P${amount.toFixed(2)}` : emptyLabel;
    }
    if (type === "stock") {
      const quantity = Number(value);
      return Number.isFinite(quantity) ? String(quantity) : emptyLabel;
    }
    return String(value);
  };

  const approvalComparableFields = [
    { label: "Item Name", beforeKeys: ["name"], afterKeys: ["name"] },
    { label: "Category", beforeKeys: ["category"], afterKeys: ["category"] },
    { label: "Category Note", beforeKeys: ["categoryNote", "category_note"], afterKeys: ["categoryNote"] },
    { label: "Supplier", beforeKeys: ["supplierName", "supplier_name"], afterKeys: ["supplierName"] },
    { label: "SRP", beforeKeys: ["defaultSellingPrice", "default_selling_price"], afterKeys: ["defaultSellingPrice"], type: "money" },
    { label: "Cost", beforeKeys: ["costPrice", "cost_price"], afterKeys: ["costPrice"], type: "money" },
    { label: "Stock", beforeKeys: ["quantity", "stock_level"], afterKeys: ["quantity"], type: "stock" },
    { label: "Manual Low-Stock Limit", beforeKeys: ["reorderLevel", "min_stock_level"], afterKeys: ["reorderLevel"], type: "stock" },
    { label: "Lead Time", beforeKeys: ["leadTimeDays", "lead_time_days"], afterKeys: ["leadTimeDays"], type: "stock" },
    { label: "Safety Stock", beforeKeys: ["safetyStock", "safety_stock"], afterKeys: ["safetyStock"], type: "stock" }
  ];

  const getApprovalChangeRows = request => {
    if (request.requestType !== "edit_item" || !request.currentSnapshot) return [];

    const payload = request.requestedPayload || {};
    const current = request.currentSnapshot || {};

    return approvalComparableFields
      .map(field => {
        const before = getFirstDefinedApprovalValue(current, field.beforeKeys);
        const after = getFirstDefinedApprovalValue(payload, field.afterKeys);
        return {
          label: field.label,
          beforeRaw: before,
          afterRaw: after,
          before: formatApprovalValue(before, field.type, "Not previously assigned"),
          after: formatApprovalValue(after, field.type, "Not provided"),
          type: field.type || "text"
        };
      })
      .filter(row => normalizeApprovalCompareValue(row.beforeRaw, row.type) !== normalizeApprovalCompareValue(row.afterRaw, row.type));
  };

  const getNewItemApprovalRows = request => {
    const payload = request.requestedPayload || {};
    return [
      { label: "Category", value: formatApprovalValue(payload.category, "text", "Not provided") },
      { label: "Category Note", value: formatApprovalValue(payload.categoryNote, "text", "Not provided") },
      { label: "Supplier", value: formatApprovalValue(payload.supplierName, "text", "Not provided") },
      { label: "SRP", value: formatApprovalValue(payload.defaultSellingPrice, "money", "Not provided") },
      { label: "Cost", value: formatApprovalValue(payload.costPrice, "money", "Not provided") },
      { label: "Initial Stock", value: formatApprovalValue(payload.quantity, "stock", "0") },
      { label: "Manual Low-Stock Limit", value: formatApprovalValue(payload.reorderLevel, "stock", "Not provided") },
      { label: "Lead Time", value: formatApprovalValue(payload.leadTimeDays, "stock", "Not provided") },
      { label: "Safety Stock", value: formatApprovalValue(payload.safetyStock, "stock", "Not provided") }
    ].filter(row => row.value !== "Not provided");
  };

  const getApprovalRequestMeta = (request, changeRows) => {
    if (request.requestType === "add_item") {
      return {
        label: "New Item",
        summary: "New inventory item awaiting approval",
        className: "border-green-200 bg-green-50 text-green-800"
      };
    }

    const changedLabels = new Set(changeRows.map(row => row.label));
    if (changedLabels.has("Stock")) {
      return {
        label: "Stock Correction",
        summary: `${changeRows.length} ${changeRows.length === 1 ? "field" : "fields"} modified`,
        className: "border-orange-200 bg-orange-50 text-orange-800"
      };
    }
    if (changedLabels.has("SRP") || changedLabels.has("Cost")) {
      return {
        label: "Price Update",
        summary: `${changeRows.length} ${changeRows.length === 1 ? "field" : "fields"} modified`,
        className: "border-blue-200 bg-blue-50 text-blue-800"
      };
    }
    if (changedLabels.has("Category")) {
      return {
        label: "Category Change",
        summary: `${changeRows.length} ${changeRows.length === 1 ? "field" : "fields"} modified`,
        className: "border-amber-200 bg-amber-50 text-amber-800"
      };
    }
    return {
      label: "Item Update",
      summary: changeRows.length > 0
        ? `${changeRows.length} ${changeRows.length === 1 ? "field" : "fields"} modified`
        : "No field differences detected",
      className: "border-slate-200 bg-slate-50 text-slate-700"
    };
  };

  const getRequestStatusMeta = status => {
    const normalizedStatus = String(status || "pending").toLowerCase();
    if (normalizedStatus === "approved") {
      return {
        label: "Approved",
        className: "border-green-200 bg-green-50 text-green-800"
      };
    }
    if (normalizedStatus === "rejected") {
      return {
        label: "Rejected",
        className: "border-red-200 bg-red-50 text-red-800"
      };
    }
    return {
      label: "Pending",
      className: "border-amber-200 bg-amber-50 text-amber-800"
    };
  };

  const renderMyInventoryRequestsDialog = () => {
    if (!canRequestInventoryMasterDataChange || myPendingInventoryChangeRequestCount === 0) return null;

    const pendingRequestCount = myPendingInventoryChangeRequestCount;
    const myRequestsPerPage = 5;
    const myRequestTotalPages = Math.max(1, Math.ceil(myPendingInventoryChangeRequests.length / myRequestsPerPage));
    const safeMyRequestPage = Math.min(Math.max(1, myRequestPage), myRequestTotalPages);
    const myRequestPageStart = myPendingInventoryChangeRequests.length === 0
      ? 0
      : (safeMyRequestPage - 1) * myRequestsPerPage + 1;
    const myRequestPageEnd = Math.min(safeMyRequestPage * myRequestsPerPage, myPendingInventoryChangeRequests.length);
    const paginatedMyInventoryChangeRequests = myPendingInventoryChangeRequests.slice(
      (safeMyRequestPage - 1) * myRequestsPerPage,
      safeMyRequestPage * myRequestsPerPage
    );

    return (
      <Dialog open={isMyRequestsDialogOpen} onOpenChange={setIsMyRequestsDialogOpen}>
        <DialogContent
          className="inventory-my-requests-dialog border border-slate-200 bg-white shadow-2xl"
          style={{
            width: "min(980px, calc(100vw - 32px))",
            maxWidth: "980px",
            maxHeight: "calc(100dvh - 56px)",
            padding: 0,
            overflow: "hidden",
            borderRadius: "16px"
          }}
        >
          <DialogHeader
            className="text-left"
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              gap: "14px",
              padding: "24px 28px 18px",
              borderBottom: "1px solid #E2E8F0"
            }}
          >
            <span
              aria-hidden="true"
              className="shrink-0"
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#EFF6FF",
                color: "#1D4ED8"
              }}
            >
              <Eye className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold text-slate-950">My Inventory Requests</DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-relaxed text-slate-700">
                Pending requests for {user?.branch || "your branch"}.
              </DialogDescription>
            </div>
          </DialogHeader>

          <style>{`
            /* Staff request tracking uses a read-only review surface so requesters can monitor status without approval controls. */
            .inventory-my-requests-body {
              display: grid;
              gap: 14px;
              padding: 18px 28px 24px;
              max-height: calc(100dvh - 180px);
              overflow-y: auto;
            }

            .inventory-my-requests-summary {
              display: block;
            }

            .inventory-my-requests-summary-card {
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              background: #f8fafc;
              padding: 12px 14px;
            }

            .inventory-my-requests-pending-summary {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
            }

            .inventory-my-request-card {
              border: 1px solid #e2e8f0;
              border-radius: 13px;
              background: #ffffff;
              padding: 16px;
            }

            .inventory-my-request-header {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto;
              gap: 12px;
              align-items: start;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 12px;
              margin-bottom: 12px;
            }

            .inventory-my-request-title {
              margin: 0;
              color: #0f172a;
              font-size: 16px;
              font-weight: 800;
              line-height: 1.25;
              overflow-wrap: anywhere;
            }

            .inventory-my-request-meta {
              margin-top: 4px;
              color: #475569;
              font-size: 12px;
              font-weight: 600;
              line-height: 1.35;
            }

            .inventory-my-request-note {
              border-radius: 10px;
              border: 1px solid #e2e8f0;
              background: #f8fafc;
              padding: 10px 12px;
              color: #334155;
              font-size: 13px;
              line-height: 1.45;
            }

            .inventory-my-requests-pagination {
              margin-top: 8px;
            }

            .inventory-my-requests-pagination-button {
              background: #ffffff;
              border-color: #cbd5e1;
              color: #334155;
              transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
            }

            .inventory-my-requests-pagination-button:not(:disabled):hover {
              background: #f1f5f9;
              border-color: #94a3b8;
              color: #0f172a;
              box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
            }

            @media (max-width: 700px) {
              .inventory-my-requests-body {
                padding: 14px;
              }

              .inventory-my-request-header {
                grid-template-columns: minmax(0, 1fr);
              }

              .inventory-my-requests-pending-summary {
                align-items: flex-start;
              }

              .inventory-my-requests-pagination {
                display: grid;
                grid-template-columns: 1fr;
                gap: 8px;
              }

              .inventory-my-requests-pagination-actions {
                display: grid;
                grid-template-columns: 1fr auto 1fr;
                align-items: center;
                gap: 6px;
              }

              .inventory-my-requests-pagination-button {
                min-width: 0;
                padding-left: 8px;
                padding-right: 8px;
              }
            }
          `}</style>

          <div className="inventory-my-requests-body">
            <div className="inventory-my-requests-summary" aria-label="Pending inventory request summary">
              <div className="inventory-my-requests-summary-card inventory-my-requests-pending-summary">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending Requests</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {pendingRequestCount === 0
                      ? "No inventory requests are waiting for admin review."
                      : "Inventory requests waiting for admin review."}
                  </p>
                </div>
                <p className="shrink-0 text-2xl font-bold text-slate-950">{pendingRequestCount}</p>
              </div>
            </div>

            <div className="grid gap-3">
                {paginatedMyInventoryChangeRequests.map(request => {
                  const changeRows = getApprovalChangeRows(request);
                  const newItemRows = getNewItemApprovalRows(request);
                  const requestMeta = getApprovalRequestMeta(request, changeRows);
                  const statusMeta = getRequestStatusMeta(request.status);
                  const payload = request.requestedPayload || {};
                  const currentItemName = String(request.currentSnapshot?.name || "").trim();
                  const requestedItemName = String(payload.name || request.itemName || currentItemName || "Inventory item").trim();
                  const displayItemName = request.requestType === "edit_item"
                    ? currentItemName || request.itemName || requestedItemName
                    : requestedItemName;
                  const reviewedText = request.reviewedAt
                    ? `Reviewed by ${request.reviewedByName || "Admin"} on ${formatDateTime(request.reviewedAt)}`
                    : "Waiting for admin review";

                  return (
                    <article key={request.id} className="inventory-my-request-card">
                      <div className="inventory-my-request-header">
                        <div className="min-w-0">
                          <p className="inventory-my-request-title">{displayItemName}</p>
                          <p className="inventory-my-request-meta">
                            {request.requestType === "edit_item" ? "Edit item request" : "New item request"} - Submitted {formatDateTime(request.requestedAt)}
                          </p>
                          <p className="inventory-my-request-meta">{reviewedText}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                          <Badge variant="outline" className={requestMeta.className}>{requestMeta.label}</Badge>
                          <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
                        </div>
                      </div>

                      {request.requestType === "add_item" ? (
                        <Table className="inventory-approval-value-table">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Field</TableHead>
                              <TableHead>Requested Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {newItemRows.length > 0 ? newItemRows.map(row => (
                              <TableRow key={`${request.id}-${row.label}`}>
                                <TableCell className="font-semibold text-slate-700">{row.label}</TableCell>
                                <TableCell className="text-slate-950">{row.value}</TableCell>
                              </TableRow>
                            )) : (
                              <TableRow>
                                <TableCell colSpan={2} className="text-sm text-slate-600">No requested values were available.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      ) : (
                        <Table className="inventory-approval-change-table">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Field</TableHead>
                              <TableHead>Current</TableHead>
                              <TableHead>Requested</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {changeRows.length > 0 ? changeRows.map(row => (
                              <TableRow key={`${request.id}-${row.label}`}>
                                <TableCell className="font-semibold text-slate-700">{row.label}</TableCell>
                                <TableCell className="text-slate-700">{row.before}</TableCell>
                                <TableCell className="font-semibold text-slate-950">{row.after}</TableCell>
                              </TableRow>
                            )) : (
                              <TableRow>
                                <TableCell colSpan={3} className="text-sm text-slate-600">No field differences were detected in this request.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      )}

                      {request.reviewNote && (
                        <p className="inventory-my-request-note mt-3">
                          <strong>Admin note:</strong> {request.reviewNote}
                        </p>
                      )}
                    </article>
                  );
                })}
                {myRequestTotalPages > 1 && (
                  <div
                    className="inventory-my-requests-pagination flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    aria-label="My inventory request pagination"
                  >
                    <p className="text-xs font-medium text-slate-600">
                      Showing {myRequestPageStart}-{myRequestPageEnd} of {myPendingInventoryChangeRequests.length} pending requests
                    </p>
                    <div className="inventory-my-requests-pagination-actions flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="inventory-my-requests-pagination-button h-8 rounded-lg text-xs font-semibold"
                        disabled={safeMyRequestPage <= 1}
                        onClick={() => setMyRequestPage(Math.max(1, safeMyRequestPage - 1))}
                      >
                        Previous
                      </Button>
                      <span className="min-w-[82px] text-center text-xs font-semibold text-slate-700">
                        Page {safeMyRequestPage} of {myRequestTotalPages}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="inventory-my-requests-pagination-button h-8 rounded-lg text-xs font-semibold"
                        disabled={safeMyRequestPage >= myRequestTotalPages}
                        onClick={() => setMyRequestPage(Math.min(myRequestTotalPages, safeMyRequestPage + 1))}
                      >
                        {isApprovalMobileView ? "Next" : "Next Page"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const renderInventoryApprovalRequestsDialog = () => {
    if (!canManageInventory(user?.role)) return null;

    const enrichedApprovalRequests = pendingInventoryChangeRequests.map(request => {
      const changeRows = getApprovalChangeRows(request);
      const newItemRows = getNewItemApprovalRows(request);
      const requestMeta = getApprovalRequestMeta(request, changeRows);
      return {
        request,
        changeRows,
        newItemRows,
        requestMeta
      };
    });
    const filterOptions = [
      { value: "all", label: "All Requests", predicate: () => true },
      { value: "new", label: "New Items", predicate: item => item.request.requestType === "add_item" },
      { value: "update", label: "Updates", predicate: item => item.request.requestType === "edit_item" },
      { value: "price", label: "Price", predicate: item => item.requestMeta.label === "Price Update" },
      { value: "stock", label: "Stock", predicate: item => item.requestMeta.label === "Stock Correction" },
      { value: "category", label: "Category", predicate: item => item.requestMeta.label === "Category Change" }
    ];
    const filterOptionsWithCounts = filterOptions.map(option => ({
      ...option,
      count: enrichedApprovalRequests.filter(option.predicate).length
    }));
    const visibleFilterOptions = filterOptionsWithCounts.filter(option => option.value === "all" || option.count > 0);
    const activeFilterOption = visibleFilterOptions.find(option => option.value === approvalRequestFilter) || filterOptionsWithCounts[0];
    const approvalSearchTerm = approvalRequestSearch.trim().toLowerCase();
    const filteredApprovalRequests = enrichedApprovalRequests
      .filter(activeFilterOption.predicate)
      .filter(item => {
        if (!approvalSearchTerm) return true;
        const searchableText = [
          item.request.itemName,
          item.request.requestedByName,
          item.requestMeta.label,
          item.requestMeta.summary,
          ...item.changeRows.flatMap(row => [row.label, row.before, row.after]),
          ...item.newItemRows.flatMap(row => [row.label, row.value])
        ].join(" ").toLowerCase();
        return searchableText.includes(approvalSearchTerm);
      })
      .sort((a, b) => {
        const aTime = new Date(a.request.requestedAt || 0).getTime();
        const bTime = new Date(b.request.requestedAt || 0).getTime();
        return approvalRequestSort === "oldest" ? aTime - bTime : bTime - aTime;
      });
    const approvalRequestsPerPage = 5;
    const approvalTotalPages = Math.max(1, Math.ceil(filteredApprovalRequests.length / approvalRequestsPerPage));
    const safeApprovalPage = Math.min(Math.max(1, approvalRequestPage), approvalTotalPages);
    const approvalPageStart = filteredApprovalRequests.length === 0
      ? 0
      : (safeApprovalPage - 1) * approvalRequestsPerPage + 1;
    const approvalPageEnd = Math.min(safeApprovalPage * approvalRequestsPerPage, filteredApprovalRequests.length);
    const paginatedApprovalRequests = filteredApprovalRequests.slice(
      (safeApprovalPage - 1) * approvalRequestsPerPage,
      safeApprovalPage * approvalRequestsPerPage
    );
    const setApprovalFilter = value => {
      setApprovalRequestFilter(value);
      setApprovalRequestPage(1);
    };

    return (
      <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
        <DialogContent
          className="inventory-approval-dialog border border-slate-200 bg-white shadow-2xl"
          style={{
            display: "grid",
            gridTemplateRows: "auto auto minmax(0, 1fr)",
            width: isApprovalMobileView ? "calc(100vw - 24px)" : "min(1240px, calc(100vw - 56px))",
            maxWidth: isApprovalMobileView ? "calc(100vw - 24px)" : "1240px",
            maxHeight: isApprovalMobileView ? "calc(100dvh - 28px)" : "calc(100dvh - 72px)",
            padding: 0,
            overflow: "hidden",
            borderRadius: isApprovalMobileView ? "16px" : "16px"
          }}
        >
          <Button
            type="button"
            variant="ghost"
            aria-label="Close inventory approval requests"
            className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            onClick={() => setIsApprovalDialogOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
          <DialogHeader
            className="text-left"
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              gap: isApprovalMobileView ? "10px" : "14px",
              padding: isApprovalMobileView ? "14px 48px 12px 14px" : "26px 78px 24px 28px",
              borderBottom: "1px solid #E2E8F0"
            }}
          >
            <span
              aria-hidden="true"
              className="shrink-0"
              style={{
                width: isApprovalMobileView ? "34px" : "42px",
                height: isApprovalMobileView ? "34px" : "42px",
                borderRadius: isApprovalMobileView ? "10px" : "12px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#FEF3C7",
                color: "#B45309"
              }}
            >
              <AlertTriangle className={isApprovalMobileView ? "h-4 w-4" : "h-5 w-5"} />
            </span>
            <div className="min-w-0">
              <DialogTitle className={isApprovalMobileView ? "text-lg font-bold leading-tight text-slate-950" : "text-xl font-bold text-slate-950"}>
                Inventory Approval Requests
              </DialogTitle>
              <DialogDescription className={isApprovalMobileView ? "mt-1 text-xs leading-snug text-slate-700" : "mt-1 text-sm leading-relaxed text-slate-700"}>
                Review item records prepared by Inventory Staff before they become official inventory records.
              </DialogDescription>
            </div>
          </DialogHeader>

          <style>{`
            /* Approval dialog layout supports admin review of pending inventory changes before records go live. */
            .inventory-approval-search-wrap {
              border-radius: 14px;
            }

            .inventory-approval-body {
              display: grid;
              gap: 16px;
              padding: 18px 28px 22px;
              background: #ffffff;
            }

            .inventory-approval-summary-panel {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              background: #ffffff;
              padding: 16px 18px;
            }

            .inventory-approval-controls {
              display: grid;
              grid-template-columns: minmax(360px, 1fr) 160px auto;
              align-items: center;
              gap: 12px;
              overflow: visible;
              padding: 0;
            }

            .inventory-approval-filter-group {
              display: flex;
              flex-wrap: nowrap;
              align-items: center;
              gap: 8px;
              justify-content: flex-end;
              min-width: 0;
            }

            .inventory-approval-dialog-list {
              min-height: 0;
              overflow-y: auto;
              overscroll-behavior: contain;
              scrollbar-gutter: stable;
            }

            .inventory-approval-dialog-list::-webkit-scrollbar {
              width: 10px;
            }

            .inventory-approval-dialog-list::-webkit-scrollbar-thumb {
              background: #cbd5e1;
              border: 3px solid #ffffff;
              border-radius: 999px;
            }

            .inventory-approval-dialog-list::-webkit-scrollbar-track {
              background: transparent;
            }

            .inventory-approval-request-card {
              border-radius: 13px;
              padding: 16px 18px 18px;
            }

            .inventory-approval-request-top {
              display: grid;
              grid-template-columns: minmax(280px, 1fr) minmax(190px, auto) auto;
              align-items: center;
              gap: 18px;
              border-bottom: 0;
              margin-bottom: 16px;
              padding-bottom: 0;
            }

            .inventory-approval-item-summary {
              min-width: 0;
            }

            .inventory-approval-request-title {
              margin: 0;
              color: #0f172a;
              font-size: 16px;
              font-weight: 800;
              line-height: 1.25;
              overflow-wrap: anywhere;
            }

            .inventory-approval-item-meta {
              margin-top: 4px;
              color: #475569;
              font-size: 12px;
              font-weight: 600;
              line-height: 1.35;
            }

            .inventory-approval-rename-note {
              margin-top: 6px;
              color: #1d4ed8;
              font-size: 12px;
              font-weight: 700;
              line-height: 1.35;
              overflow-wrap: anywhere;
            }

            .inventory-approval-requester-summary {
              min-width: 0;
            }

            .inventory-approval-request-actions {
              display: flex;
              align-items: center;
              justify-content: flex-end;
              gap: 12px;
              margin-top: 0;
            }

            .inventory-approval-change-panel {
              border-radius: 14px;
              background: #f8fafc;
            }

            .inventory-approval-change-panel-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 14px;
              border-bottom: 1px solid #e2e8f0;
              padding: 14px 16px;
            }

            .inventory-approval-change-panel-title {
              display: flex;
              align-items: flex-start;
              gap: 12px;
              min-width: 0;
            }

            .inventory-approval-change-icon {
              margin-top: 2px;
              color: #334155;
            }

            .inventory-approval-pagination {
              margin-top: 8px;
            }

            .inventory-approval-search-wrap:focus-within::after {
              content: "";
              position: absolute;
              inset: -3px;
              border: 2px solid var(--emc-interactive-yellow-soft);
              border-radius: 16px;
              pointer-events: none;
            }

            #root .inventory-approval-search-wrap .inventory-approval-search-input:not(:disabled):not([aria-disabled="true"]):focus,
            #root .inventory-approval-search-wrap .inventory-approval-search-input:not(:disabled):not([aria-disabled="true"]):focus-visible {
              border-color: var(--emc-interactive-yellow);
              outline: none;
              box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
            }

            /* Fixed comparison tables keep before-and-after values aligned for approval decisions. */
            .inventory-approval-change-table {
              table-layout: fixed;
              width: 100%;
            }

            .inventory-approval-change-table th:first-child,
            .inventory-approval-change-table td:first-child {
              width: 28%;
            }

            .inventory-approval-change-table th:nth-child(2),
            .inventory-approval-change-table td:nth-child(2) {
              width: 36%;
            }

            .inventory-approval-change-table th:nth-child(3),
            .inventory-approval-change-table td:nth-child(3) {
              width: 36%;
            }

            .inventory-approval-value-table {
              table-layout: fixed;
              width: 100%;
            }

            .inventory-approval-value-table th:first-child,
            .inventory-approval-value-table td:first-child {
              width: 34%;
            }

            .inventory-approval-value-table th:nth-child(2),
            .inventory-approval-value-table td:nth-child(2) {
              width: 66%;
            }

            .inventory-approval-change-table td,
            .inventory-approval-value-table td {
              vertical-align: top;
              overflow-wrap: anywhere;
            }

            .inventory-approval-pagination-button {
              background: #ffffff;
              border-color: #cbd5e1;
              color: #334155;
              transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
            }

            .inventory-approval-pagination-button:not(:disabled):hover {
              background: #f1f5f9;
              border-color: #94a3b8;
              color: #0f172a;
            }

            /* Mobile approval rules stack controls while preserving the audit details reviewers need. */
            @media (max-width: 760px) {
              .inventory-approval-dialog {
                display: grid;
                grid-template-rows: auto auto minmax(0, 1fr);
              }

              .inventory-approval-body {
                gap: 10px;
                padding: 10px 14px 12px;
              }

              .inventory-approval-summary-panel {
                align-items: flex-start;
                padding: 10px 12px;
                border-radius: 11px;
              }

              .inventory-approval-summary-row {
                gap: 8px;
              }

              .inventory-approval-summary-row > div {
                min-width: 0;
              }

              .inventory-approval-controls {
                display: grid;
                grid-template-columns: minmax(0, 1fr);
                gap: 8px;
                padding: 0;
                overflow: visible;
              }

              .inventory-approval-search-wrap {
                min-width: 0;
                width: 100%;
              }

              .inventory-approval-search-input {
                height: 40px;
                border-radius: 11px;
                font-size: 13px;
              }

              .inventory-approval-sort-trigger {
                width: 100%;
                height: 38px;
                min-width: 0;
              }

              .inventory-approval-filter-group {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 7px;
                width: 100%;
              }

              .inventory-approval-filter-group button {
                min-width: 0;
                width: 100%;
                height: 34px;
                justify-content: center;
                padding-left: 8px;
                padding-right: 8px;
                font-size: 11px;
              }

              .inventory-approval-dialog-list {
                min-height: 0;
              }

              .inventory-approval-request-card {
                padding: 12px;
                border-radius: 12px;
              }

              .inventory-approval-request-top {
                grid-template-columns: minmax(0, 1fr);
                margin-bottom: 10px;
                padding-bottom: 10px;
                border-bottom: 1px solid #e2e8f0;
              }

              .inventory-approval-request-actions {
                grid-column: 1 / -1;
              }

              .inventory-approval-request-title {
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                font-size: 15px;
              }

              .inventory-approval-request-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
              }

              .inventory-approval-request-actions button {
                width: 100%;
                min-height: 38px;
              }

              .inventory-approval-change-table,
              .inventory-approval-value-table,
              .inventory-approval-change-table thead,
              .inventory-approval-value-table thead,
              .inventory-approval-change-table tbody,
              .inventory-approval-value-table tbody {
                display: block;
              }

              .inventory-approval-change-table thead,
              .inventory-approval-value-table thead {
                position: absolute;
                width: 1px;
                height: 1px;
                overflow: hidden;
                clip: rect(0 0 0 0);
              }

              .inventory-approval-change-table tr,
              .inventory-approval-value-table tr {
                display: grid;
                gap: 5px;
                padding: 8px 10px;
                border-bottom: 1px solid #e2e8f0;
              }

              .inventory-approval-change-table tr:last-child,
              .inventory-approval-value-table tr:last-child {
                border-bottom: 0;
              }

              .inventory-approval-change-table td,
              .inventory-approval-value-table td {
                display: grid;
                grid-template-columns: 84px minmax(0, 1fr);
                gap: 8px;
                padding: 0;
                white-space: normal;
                overflow-wrap: anywhere;
                font-size: 12px;
                line-height: 1.3;
              }

              .inventory-approval-change-table td::before,
              .inventory-approval-value-table td::before {
                color: #64748b;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 0.03em;
                text-transform: uppercase;
              }

              .inventory-approval-change-table td:nth-child(1)::before,
              .inventory-approval-value-table td:nth-child(1)::before {
                content: "Field";
              }

              .inventory-approval-change-table td:nth-child(2)::before {
                content: "Previous";
              }

              .inventory-approval-change-table td:nth-child(3)::before {
                content: "New";
              }

              .inventory-approval-value-table td:nth-child(2)::before {
                content: "Value";
              }

              .inventory-approval-pagination {
                display: grid;
                grid-template-columns: 1fr;
                gap: 8px;
                padding: 8px 10px;
              }

              .inventory-approval-pagination-actions {
                display: grid;
                grid-template-columns: 1fr auto 1fr;
                align-items: center;
                gap: 6px;
              }

              .inventory-approval-pagination-button {
                min-width: 0;
                padding-left: 8px;
                padding-right: 8px;
              }
            }
          `}</style>
          <div className="inventory-approval-body">
            <div className="inventory-approval-summary-panel inventory-approval-summary-row">
              <div>
                <p className="text-sm font-semibold text-slate-950">Pending review</p>
                <p className={isApprovalMobileView ? "text-[11px] leading-tight text-slate-600" : "text-xs text-slate-600"}>
                  New requests update automatically while this page is open.
                </p>
              </div>
              <span className="shrink-0 text-sm text-slate-950">
                <span className="font-bold text-orange-600">{pendingInventoryChangeRequests.length}</span> Pending
              </span>
            </div>
            <div className="inventory-approval-controls">
              <div className="inventory-approval-search-wrap relative min-w-[280px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                />
                <Input
                  value={approvalRequestSearch}
                  onChange={event => {
                    setApprovalRequestSearch(event.target.value);
                    setApprovalRequestPage(1);
                  }}
                  placeholder="Search requests, requester, item, or changed values"
                  aria-label="Search inventory approval requests"
                  className="inventory-approval-search-input h-12 rounded-xl border-slate-300 bg-white pl-10 text-sm text-slate-950"
                  style={{
                    paddingRight: "44px",
                    lineHeight: "20px"
                  }}
                />
                {approvalRequestSearch && (
                  <button
                    type="button"
                    className="search-clear-button search-clear-button--absolute"
                    onClick={() => {
                      setApprovalRequestSearch("");
                      setApprovalRequestPage(1);
                    }}
                    aria-label="Clear inventory approval search"
                  >
                    <X />
                  </button>
                )}
              </div>
              <Select
                value={approvalRequestSort}
                onValueChange={value => {
                  setApprovalRequestSort(value);
                  setApprovalRequestPage(1);
                }}
              >
                <SelectTrigger
                  aria-label="Sort inventory approval requests"
                  className="inventory-approval-sort-trigger h-12 w-[160px] shrink-0 rounded-xl border-slate-200 bg-white text-sm text-slate-950"
                >
                  <SelectValue placeholder="Sort requests" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                </SelectContent>
              </Select>
              <div className="inventory-approval-filter-group flex shrink-0 flex-nowrap items-center gap-2" role="group" aria-label="Filter inventory approval requests">
              {visibleFilterOptions.map(option => {
                const count = option.count;
                const isActive = option.value === activeFilterOption.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={isActive ? undefined : "outline"}
                    className={isActive
                      ? "h-10 rounded-lg border border-blue-300 bg-blue-50 px-4 text-xs font-bold text-blue-900 shadow-sm transition-colors duration-150 hover:bg-blue-100"
                      : "h-10 rounded-lg border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-950"}
                    aria-pressed={isActive}
                    onClick={() => setApprovalFilter(option.value)}
                  >
                    {option.label}
                    <span className={isActive ? "ml-2 text-blue-700" : "ml-2 text-slate-500"}>{count}</span>
                  </Button>
                );
              })}
              </div>
            </div>
          </div>

          <div
            className="inventory-approval-dialog-list"
            style={{
              minHeight: 0,
              overflowY: "auto",
              padding: isApprovalMobileView ? "0 14px 12px" : "0 28px 22px"
            }}
          >
            {filteredApprovalRequests.length === 0 ? (
              <div
                className="text-center"
                style={{
                  border: "1px dashed #CBD5E1",
                  background: "#F8FAFC",
                  borderRadius: "12px",
                  padding: "28px 18px"
                }}
              >
                <CheckCircle className="mx-auto h-8 w-8 text-green-600" />
                <p className="mt-3 font-semibold text-slate-950">
                  {pendingInventoryChangeRequests.length === 0 ? "No pending requests" : "No requests match the current view"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {pendingInventoryChangeRequests.length === 0
                    ? "Inventory Staff requests will appear here when they need admin review."
                    : "Adjust the search, filter, or sort controls to review the remaining pending approval requests."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {paginatedApprovalRequests.map(({ request, changeRows, newItemRows, requestMeta }) => {
                  const payload = request.requestedPayload || {};
                  const currentItemName = String(request.currentSnapshot?.name || "").trim();
                  const requestedItemName = String(payload.name || request.itemName || currentItemName || "Inventory item").trim();
                  const displayItemName = request.requestType === "edit_item"
                    ? currentItemName || request.itemName || requestedItemName
                    : requestedItemName;
                  const hasRequestedNameChange = request.requestType === "edit_item"
                    && currentItemName
                    && requestedItemName
                    && currentItemName.toLowerCase() !== requestedItemName.toLowerCase();
                  const itemReferenceText = request.requestType === "edit_item"
                    ? `Existing inventory item${request.inventoryId ? ` - Inventory ID: ${request.inventoryId}` : ""}`
                    : "Proposed new inventory item - item code will be assigned after approval";
                  return (
                    <div
                      key={request.id}
                      className="inventory-approval-request-card rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div className="inventory-approval-request-top mb-4 border-b border-slate-100 pb-4">
                        <div className="inventory-approval-item-summary">
                          <p className="inventory-approval-request-title">{displayItemName}</p>
                          <p className="inventory-approval-item-meta">{itemReferenceText}</p>
                          {hasRequestedNameChange && (
                            <p className="inventory-approval-rename-note">
                              Requested name: {requestedItemName}
                            </p>
                          )}
                        </div>
                        <div className="inventory-approval-requester-summary">
                          <p className="text-sm leading-relaxed text-slate-700">
                            Requested by{" "}
                            <strong className="text-blue-700">{request.requestedByName || "Inventory Staff"}</strong>
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600">
                            {formatDateTime(request.requestedAt)}
                          </p>
                        </div>
                        <div className="inventory-approval-request-actions mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="h-10 min-w-[128px] bg-green-600 text-white hover:bg-green-700"
                            onClick={() => approveInventoryChangeRequest(request)}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-10 min-w-[128px] border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => rejectInventoryChangeRequest(request)}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>

                      <div className="inventory-approval-change-panel min-w-0 rounded-xl border border-slate-200 bg-slate-50">
                        {request.requestType === "add_item" ? (
                          <div>
                            <div className="inventory-approval-change-panel-header">
                              <div className="inventory-approval-change-panel-title">
                                <Eye className="inventory-approval-change-icon h-5 w-5" aria-hidden="true" />
                                <div>
                                  <p className="text-sm font-semibold text-slate-950">New item details</p>
                                  <p className="text-xs text-slate-600">No previous inventory record exists.</p>
                                </div>
                              </div>
                              <Badge variant="outline" className={requestMeta.className}>
                                {requestMeta.label}
                              </Badge>
                            </div>
                            <Table className="inventory-approval-value-table">
                              <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                  <TableHead className="h-9 text-xs font-bold uppercase tracking-wide text-slate-600">Field</TableHead>
                                  <TableHead className="h-9 text-xs font-bold uppercase tracking-wide text-slate-600">Value</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {newItemRows.map(row => (
                                  <TableRow key={row.label}>
                                    <TableCell className="py-2 text-xs font-semibold text-slate-700">{row.label}</TableCell>
                                    <TableCell className="py-2 text-sm font-semibold text-slate-950">{row.value}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div>
                            <div className="inventory-approval-change-panel-header">
                              <div className="inventory-approval-change-panel-title">
                                <Eye className="inventory-approval-change-icon h-5 w-5" aria-hidden="true" />
                                <div>
                                  <p className="text-sm font-semibold text-slate-950">Changed fields only</p>
                                  <p className="text-xs text-slate-600">Unchanged values are hidden to reduce review time.</p>
                                </div>
                              </div>
                              <Badge variant="outline" className={requestMeta.className}>
                                {requestMeta.label}
                              </Badge>
                            </div>
                            {changeRows.length > 0 ? (
                              <Table className="inventory-approval-change-table">
                                <TableHeader>
                                  <TableRow className="hover:bg-transparent">
                                    <TableHead className="h-9 text-xs font-bold uppercase tracking-wide text-slate-600">Field</TableHead>
                                    <TableHead className="h-9 text-xs font-bold uppercase tracking-wide text-slate-600">Previous Value</TableHead>
                                    <TableHead className="h-9 text-xs font-bold uppercase tracking-wide text-slate-600">New Value</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {changeRows.map(row => (
                                    <TableRow key={row.label}>
                                      <TableCell className="py-2 text-xs font-semibold text-slate-700">{row.label}</TableCell>
                                      <TableCell className="py-2 text-sm text-slate-700">{row.before}</TableCell>
                                      <TableCell className="py-2 text-sm font-semibold text-blue-950">{row.after}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <p className="px-3 py-4 text-sm text-slate-600">No field differences were detected in this request.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {approvalTotalPages > 1 && (
                  <div
                    className="inventory-approval-pagination flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    aria-label="Inventory approval request pagination"
                  >
                    <p className="text-xs font-medium text-slate-600">
                      Showing {approvalPageStart}-{approvalPageEnd} of {filteredApprovalRequests.length} {activeFilterOption.label.toLowerCase()}
                    </p>
                    <div className="inventory-approval-pagination-actions flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="inventory-approval-pagination-button h-8 rounded-lg text-xs font-semibold"
                        disabled={safeApprovalPage <= 1}
                        onClick={() => setApprovalRequestPage(Math.max(1, safeApprovalPage - 1))}
                      >
                        Previous
                      </Button>
                      <span className="min-w-[82px] text-center text-xs font-semibold text-slate-700">
                        Page {safeApprovalPage} of {approvalTotalPages}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="inventory-approval-pagination-button h-8 rounded-lg text-xs font-semibold"
                        disabled={safeApprovalPage >= approvalTotalPages}
                        onClick={() => setApprovalRequestPage(Math.min(approvalTotalPages, safeApprovalPage + 1))}
                      >
                        {isApprovalMobileView ? "Next" : "Next Page"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

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
      categoryNote: normalizeCategory(item.category) === "Other" ? item.categoryNote || "" : "",
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

  // Creates an inventory master record or approval request after validating item
  // identity, prices, stock thresholds, and duplicate active/archived records.
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
    const costPriceText = String(newItem.costPrice || "").trim();
    if (costPriceText && !isDecimalNumberText(costPriceText)) {
      toast.error("Cost Price must be a valid amount with up to 2 decimal places.");
      return;
    }
    const costPrice = costPriceText ? Number(costPriceText) : "";
    if (costPrice !== "" && costPrice <= 0) {
      toast.error("Cost Price must be greater than zero.");
      return;
    }
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
    const itemPayload = {
      name: cleanName,
      category: normalizeCategory(newItem.category),
      categoryNote: normalizeCategory(newItem.category) === "Other" ? newItem.categoryNote.trim() : "",
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
    };
    try {
      if (!canManageInventory(user?.role)) {
        await submitInventoryChangeRequest({
          requestType: "add_item",
          itemName: cleanName,
          requestedPayload: itemPayload
        });
        clearFormDraft(getInventoryDraftScope("inventory-add-item"));
        setIsAddDialogOpen(false);
        resetAddItemForm();
        toast.success("Item request submitted for Admin approval.", {
          description: "No official inventory record or stock movement was created yet."
        });
        return;
      }

      const addedItem = await addInventoryItem(itemPayload);
      highlightInventoryRow(addedItem?.id);
      clearFormDraft(getInventoryDraftScope("inventory-add-item"));
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
      const duplicatePendingRequest = err?.response?.data?.code === "DUPLICATE_PENDING_INVENTORY_REQUEST";
      toast.error(duplicatePendingRequest ? "Item request already pending" : "Failed to add item", {
        description: err?.response?.data?.error || err.message
      });
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

  const approveInventoryChangeRequest = async request => {
    try {
      const result = await reviewInventoryChangeRequest({ requestId: request.id, status: "approved" });
      const reviewedItem = result?.product;
      highlightInventoryRow(reviewedItem?.inventory_id?.toString?.() || reviewedItem?.id || request.inventoryId);
      toast.success(
        request.requestType === "add_item" ? "Inventory item request approved." : "Inventory edit request approved.",
        {
          description: request.requestType === "add_item"
            ? `${request.itemName} is now active in inventory.`
            : `${request.itemName} was updated.`
        }
      );
    } catch (err) {
      toast.error("Failed to approve request", {
        description: err?.response?.data?.error || err.message
      });
    }
  };

  const rejectInventoryChangeRequest = async request => {
    try {
      await reviewInventoryChangeRequest({
        requestId: request.id,
        status: "rejected",
        reviewNote: "Rejected by Admin during inventory review."
      });
      toast.info("Inventory request rejected.", {
        description: `${request.itemName} was not changed.`
      });
    } catch (err) {
      toast.error("Failed to reject request", {
        description: err?.response?.data?.error || err.message
      });
    }
  };

  // Stock In increases available quantity and records a movement reason so
  // manual adjustments remain traceable outside purchase receiving.
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
      const [updatedItem] = await batchStockAdjustment({
        items: [{ inventoryId: selectedItem.id, quantity: amount }],
        movementReason: stockInReason,
        movementNote: `Stock In recorded from inventory module. Reason: ${reasonLabel}.`,
        actualTransactionAt: stockActualTransactionAt || "",
        backdateReason: isPastTransactionDate(stockActualTransactionAt) ? stockBackdateReason.trim() : ""
      });
      highlightInventoryRow(updatedItem?.id || selectedItem.id);
      clearFormDraft(getInventoryDraftScope(getInventoryStockInDraftModule(selectedItem.id)));
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

  // Stock Out decreases available quantity for non-sales reasons such as damage,
  // expiry, transfer, or correction. Sales deductions are recorded separately.
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
      const [updatedItem] = await batchStockOut({
        items: [{ inventoryId: selectedItem.id, quantity: amount }],
        movementReason: stockOutReason,
        movementNote: `Stock Out recorded from inventory module. Reason: ${reasonLabel}.`,
        actualTransactionAt: stockActualTransactionAt || "",
        backdateReason: isPastTransactionDate(stockActualTransactionAt) ? stockBackdateReason.trim() : ""
      });
      highlightInventoryRow(updatedItem?.id || selectedItem.id);
      clearFormDraft(getInventoryDraftScope(getInventoryStockOutDraftModule(selectedItem.id)));
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

    setBatchStockAdjustmentRows(rows => {
      const nextRows = rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      );
      persistBatchStockAdjustmentDraft({ rows: nextRows });
      return nextRows;
    });
  };

  const addBatchStockAdjustmentRow = () => {
    setBatchStockAdjustmentRows(rows => {
      const nextRows = [...rows, { inventoryId: "", quantity: "" }];
      persistBatchStockAdjustmentDraft({ rows: nextRows });
      return nextRows;
    });
  };

  const removeBatchStockAdjustmentRow = index => {
    setBatchStockAdjustmentRows(rows => {
      const nextRows = rows.length === 1 ? [{ inventoryId: "", quantity: "" }] : rows.filter((_, rowIndex) => rowIndex !== index);
      persistBatchStockAdjustmentDraft({ rows: nextRows });
      return nextRows;
    });
  };

  const getBatchAdjustmentRowItem = inventoryId => inventory.find(item => String(item.id) === String(inventoryId));

  // Batch stock adjustment applies verified increases across multiple items
  // while preventing duplicate lines that would overstate a single count.
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

    setBatchStockOutRows(rows => {
      const nextRows = rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      );
      persistBatchStockOutDraft({ rows: nextRows });
      return nextRows;
    });
  };

  const addBatchStockOutRow = () => {
    setBatchStockOutRows(rows => {
      const nextRows = [...rows, { inventoryId: "", quantity: "" }];
      persistBatchStockOutDraft({ rows: nextRows });
      return nextRows;
    });
  };

  const removeBatchStockOutRow = index => {
    setBatchStockOutRows(rows => {
      const nextRows = rows.length === 1 ? [{ inventoryId: "", quantity: "" }] : rows.filter((_, rowIndex) => rowIndex !== index);
      persistBatchStockOutDraft({ rows: nextRows });
      return nextRows;
    });
  };

  const getBatchRowItem = inventoryId => inventory.find(item => String(item.id) === String(inventoryId));

  // Batch stock out applies non-sales deductions across multiple items and
  // blocks quantities that exceed current available stock.
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

  // Editing master data must preserve stock movement history; quantity remains
  // unchanged here and staff changes are routed to admin approval when required.
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
    const costPriceText = String(editItem.costPrice || "").trim();
    if (costPriceText && !isDecimalNumberText(costPriceText)) {
      toast.error("Cost Price must be a valid amount with up to 2 decimal places.");
      return;
    }
    const costPrice = costPriceText ? Number(costPriceText) : "";
    if (costPrice !== "" && costPrice <= 0) {
      toast.error("Cost Price must be greater than zero.");
      return;
    }

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

    const editPayload = {
        name: cleanName,
        category: canonicalCategory,
        categoryNote: canonicalCategory === "Other" ? editItem.categoryNote.trim() : "",
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
        expectedLastUpdated: selectedItem.lastUpdated,
        allowSimilarDuplicate
      };

    try {
      if (!canManageInventory(user?.role)) {
        await submitInventoryChangeRequest({
          requestType: "edit_item",
          inventoryId: selectedItem.id,
          itemName: cleanName,
          requestedPayload: editPayload
        });
        clearFormDraft(getInventoryDraftScope(getInventoryEditDraftModule(selectedItem.id)));
        closeEditDialog({ clearDraft: false });
        toast.success("Item edit request submitted for Admin approval.", {
          description: "The active inventory record was not changed yet."
        });
        return;
      }

      const updatedItem = await updateInventoryItem(selectedItem.id, editPayload);
      highlightInventoryRow(updatedItem?.id || selectedItem.id);
      toast.success(`${cleanName} updated successfully`, {
        description: "Item details were saved without changing stock quantity."
      });
      closeEditDialog();
    } catch (err) {
      const duplicatePendingRequest = err?.response?.data?.code === "DUPLICATE_PENDING_INVENTORY_REQUEST";
      toast.error(duplicatePendingRequest ? "Item request already pending" : "Failed to update item", {
        description: err?.response?.data?.error || err.message
      });
    }
  };

  // Archiving removes an item from active inventory without deleting historical
  // sales, purchase, stock movement, or audit references.
  const handleArchiveItem = async () => {
    if (!selectedItem) return;
    if (!archiveReason) {
      toast.error("Please select the reason for archiving this item.");
      return;
    }
    const cleanArchiveReasonNote = archiveReasonNote.trim().replace(/\s+/g, " ");
    if (archiveReason === "other" && !cleanArchiveReasonNote) {
      toast.error("Please enter the reason for choosing Other.");
      return;
    }
    const itemToArchive = selectedItem;
    const reasonLabel = archiveReason === "other" && cleanArchiveReasonNote
      ? `Other: ${cleanArchiveReasonNote}`
      : getArchiveReasonLabel(archiveReason);
    closeArchiveDialog();
    localStorage.setItem("archiveRowHighlightOriginalId", String(itemToArchive.id));
    try {
      await archiveInventoryItem(itemToArchive.id, archiveReason, cleanArchiveReasonNote);
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

        {renderInlineInventoryDraftRecovery("editItem")}

        <div className="inventory-add-form-grid">
          {renderAddSectionHeader("Basic Item Information")}

          <div className="inventory-add-field inventory-add-field-full space-y-1.5">
            <Label
              htmlFor="edit-item-name"
              className="font-semibold text-slate-950"
              style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
            >
              Item Name <span className="text-red-600">*</span>
            </Label>
            <Input
              id="edit-item-name"
              value={editItem.name}
              onChange={e => updateEditItemDraft(previous => ({
                ...previous,
                name: sanitizeInventoryTextInput(e.target.value, "Item Name", "edit-item-name-valid-characters")
              }))}
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
              Category <span className="text-red-600">*</span>
            </Label>
            <Select
              value={editItem.category}
              onValueChange={value => updateEditItemDraft(previous => ({
                ...previous,
                category: value,
                categoryNote: value === "Other" ? previous.categoryNote : ""
              }))}
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
            {editItem.category === "Other" && (
              <div className="mt-2 space-y-1">
                <Label htmlFor="edit-category-note" className="text-xs font-semibold text-slate-700">
                  Optional: note
                </Label>
                <Textarea
                  id="edit-category-note"
                  value={editItem.categoryNote}
                  maxLength={240}
                  onChange={e => updateEditItemDraft(prev => ({ ...prev, categoryNote: e.target.value.slice(0, 240) }))}
                  placeholder="E.g., Specialty hardware item not covered by the listed categories."
                  className="min-h-[68px] resize-y border-slate-300 bg-white text-sm text-slate-950"
                />
              </div>
            )}
          </div>

          {renderSupplierField({
            id: "edit-supplier",
            value: editItem.supplierName,
            mode: editItemSupplierMode,
            setMode: mode => {
              setEditItemSupplierMode(mode);
              persistEditItemDraft(editItem, mode);
            },
            onSupplierChange: supplierName => updateEditItemDraft(prev => ({ ...prev, supplierName })),
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
              onChange={e => updateEditItemDraft(previous => ({
                ...previous,
                defaultSellingPrice: sanitizeDecimalInput(e.target.value, "Default Selling Price", "edit-default-price-numbers-only")
              }))}
              placeholder="e.g., 250.00"
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            />
            <p className="text-slate-700" style={{ fontSize: "12px" }}>
              Optional. This price will automatically appear as the Unit Price when the item is selected in Sales Recording.
            </p>
          </div>

          <div className="inventory-add-field space-y-1.5">
            <Label
              htmlFor="edit-cost-price"
              className="font-semibold text-slate-950"
              style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
            >
              Cost Price
            </Label>
            <Input
              id="edit-cost-price"
              type="text"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={editItem.costPrice}
              onChange={e => updateEditItemDraft(previous => ({
                ...previous,
                costPrice: sanitizeDecimalInput(e.target.value, "Cost Price", "edit-cost-price-numbers-only")
              }))}
              placeholder="e.g., 205.00"
              className="border-slate-300 bg-white text-slate-950"
              style={{ height: "42px", borderRadius: "10px", fontSize: "14px", padding: "0 14px" }}
            />
            <p className="text-slate-700" style={{ fontSize: "12px" }}>
              Optional. This is the amount paid per unit and becomes the default Unit Cost in purchase drafts.
            </p>
          </div>

          {renderAddSectionHeader("Stock Level and Alert Threshold")}

          <div className="inventory-add-field inventory-add-field-full space-y-1.5">
            <Label
              htmlFor="edit-reorder-level"
              className="font-semibold text-slate-950"
              style={{ display: "block", marginBottom: "8px", fontSize: "14px", lineHeight: "1.25" }}
            >
              Manual Low-Stock Threshold <span className="text-red-600">*</span>
            </Label>
            <Input
              id="edit-reorder-level"
              type="text"
              min="0"
              step="1"
              inputMode="numeric"
              value={editItem.reorderLevel}
              onChange={e => updateEditItemDraft(previous => ({
                ...previous,
                reorderLevel: sanitizeWholeNumberInput(e.target.value, "Manual Low-Stock Threshold", "edit-reorder-threshold-numbers-only")
              }))}
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
              onChange={e => updateEditItemDraft(previous => ({
                ...previous,
                leadTimeDays: sanitizeWholeNumberInput(e.target.value, "Supplier Lead Time", "edit-lead-time-days-numbers-only")
              }))}
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
              onChange={e => updateEditItemDraft(previous => ({
                ...previous,
                safetyStock: sanitizeWholeNumberInput(e.target.value, "Safety Stock", "edit-safety-stock-numbers-only")
              }))}
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
            {canManageInventory(user?.role) ? "Save Changes" : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return /*#__PURE__*/React.createElement("div", {
    className: "inventory-page min-h-screen bg-gray-50 p-4 md:p-8"
  }, /*#__PURE__*/React.createElement("style", null, `
    /* Inventory list styles pair desktop tables with mobile cards for the same active item records. */
    .inventory-mobile-list {
      display: none;
    }

    /* Row highlight animation guides users back to recently changed inventory records. */
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

    /* Pagination controls limit long inventory lists without losing current result context. */
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

    .inventory-pagination-button {
      background: #ffffff;
      border-color: #cbd5e1;
      color: #0f172a;
      transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
    }

    .inventory-pagination-button:not(:disabled):hover {
      background: #f1f5f9;
      border-color: #94a3b8;
      color: #0f172a;
    }

    /* Action button states use operation-specific colors to reduce stock movement mistakes. */
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

    .inventory-approval-requests-button {
      transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
    }

    .inventory-approval-requests-button:not(:disabled):hover {
      background: #FFFBEB !important;
      border-color: #F59E0B !important;
      color: #92400E !important;
      box-shadow: 0 4px 10px rgba(245, 158, 11, 0.12);
    }

    .inventory-approval-requests-button:not(:disabled):focus-visible {
      border-color: #D97706 !important;
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22);
    }

    .inventory-my-requests-button {
      transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
    }

    .inventory-my-requests-button:not(:disabled):hover {
      background: #EFF6FF !important;
      border-color: #60A5FA !important;
      color: #1D4ED8 !important;
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.12);
    }

    .inventory-my-requests-button:not(:disabled):focus-visible {
      border-color: #2563EB !important;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.22);
    }

    /* Header grid keeps status filters and primary inventory actions aligned across admin states. */
    .inventory-list-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "title review"
        "description review"
        "status actions";
      align-items: center;
      column-gap: 18px;
      row-gap: 6px;
    }

    .inventory-list-header:not(.inventory-list-header-has-review) {
      grid-template-areas:
        "title ."
        "description ."
        "status actions";
    }

    .inventory-list-header:not(.inventory-list-header-has-review) .inventory-toolbar-review-row {
      display: none;
    }

    .inventory-list-title {
      display: contents;
    }

    .inventory-list-title > [data-slot="card-title"] {
      grid-area: title;
      min-width: 0;
      color: #0f172a;
      font-size: 18px;
      line-height: 1.25;
    }

    .inventory-list-title > [data-slot="card-description"] {
      grid-area: description;
      min-width: 0;
      margin-top: 0;
      color: #334155;
      font-size: 14px;
      line-height: 1.45;
    }

    .inventory-status-overview {
      grid-area: status;
      display: inline-flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 7px;
      min-width: 0;
      margin-top: 10px;
    }

    .inventory-toolbar-actions {
      display: contents;
    }

    .inventory-toolbar-review-row {
      grid-area: review;
      align-self: end;
      justify-self: end;
      margin-bottom: 4px;
    }

    .inventory-toolbar-primary-row {
      grid-area: actions;
      justify-self: end;
      margin-top: 10px;
    }

    .inventory-toolbar-review-row,
    .inventory-toolbar-primary-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: nowrap;
    }

    .inventory-overview-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      background: #ffffff;
      padding: 5px 9px 5px 6px;
      color: #334155;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      flex: 0 0 auto;
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
    .inventory-review-requests-button,
    .inventory-add-button {
      min-height: 42px;
      border-radius: 12px;
      padding-left: 16px;
      padding-right: 16px;
      white-space: nowrap;
    }

    .inventory-batch-stock-adjustment-button,
    .inventory-batch-stock-out-button,
    .inventory-review-requests-button {
      flex: 0 0 auto;
    }

    #root .inventory-page .inventory-review-requests-button.inventory-approval-requests-button:not(:disabled):hover {
      background: #FFFBEB !important;
      border-color: #F59E0B !important;
      color: #92400E !important;
      box-shadow: 0 4px 10px rgba(245, 158, 11, 0.12) !important;
    }

    #root .inventory-page .inventory-review-requests-button.inventory-approval-requests-button:not(:disabled):focus-visible {
      border-color: #D97706 !important;
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22) !important;
    }

    #root .inventory-page .inventory-review-requests-button.inventory-approval-requests-button:not(:disabled):hover .inventory-request-count-badge {
      background: #F59E0B !important;
      color: #ffffff !important;
    }

    .inventory-sort-header-button,
    .inventory-sort-header-button:hover,
    .inventory-sort-header-button:active,
    .inventory-sort-header-button:focus-visible {
      background: transparent;
      box-shadow: none;
      transform: none;
      color: #0f172a;
    }

    .inventory-table-header-row,
    .inventory-table-header-row:hover,
    .inventory-table-header-row > th,
    .inventory-table-header-row > th:hover,
    .inventory-table-header-row .inventory-sort-header-button,
    .inventory-table-header-row .inventory-sort-header-button:hover,
    .inventory-table-header-row .inventory-sort-header-button:active,
    .inventory-table-header-row .inventory-sort-header-button:focus,
    .inventory-table-header-row .inventory-sort-header-button:focus-visible {
      background: transparent;
      box-shadow: none;
      outline: none;
      transform: none;
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

    .inventory-restore-archived-button:not(:disabled):hover {
      background: #B45309 !important;
      color: #ffffff !important;
      transform: translateY(-1px);
      box-shadow: 0 14px 24px rgba(180, 83, 9, 0.30) !important;
    }

    .inventory-restore-archived-button:not(:disabled):focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.45), 0 14px 24px rgba(180, 83, 9, 0.26) !important;
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

    /* Responsive inventory rules switch dense tables into scan-friendly mobile cards. */
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
        grid-template-columns: 1fr;
        grid-template-areas:
          "title"
          "description"
          "status"
          "actions";
        align-items: stretch;
        gap: 14px;
        row-gap: 14px;
      }

      .inventory-list-title {
        min-width: 0;
      }

      .inventory-status-overview {
        display: grid;
        flex: 0 0 100%;
        grid-template-columns: repeat(2, minmax(0, 1fr));
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
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
      }

      .inventory-list-title > [data-slot="card-title"] {
        font-size: 18px;
        line-height: 1.25;
      }

      .inventory-list-title > [data-slot="card-description"] {
        display: block;
        margin-top: -4px;
        color: #374151;
        font-size: 13px;
        line-height: 1.45;
      }

      .inventory-list-title > [data-slot="card-description"] span {
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
      .inventory-review-requests-button,
      .inventory-add-button {
        flex: 1 1 180px;
        justify-content: center;
        min-width: 0;
      }

      .inventory-toolbar-actions {
        grid-area: actions;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        width: 100%;
      }

      .inventory-toolbar-review-row,
      .inventory-toolbar-primary-row {
        display: contents;
      }

      .inventory-toolbar-actions .inventory-review-requests-button,
      .inventory-toolbar-actions .inventory-batch-stock-adjustment-button,
      .inventory-toolbar-actions .inventory-batch-stock-out-button,
      .inventory-toolbar-actions .inventory-add-button {
        min-height: 52px;
        width: 100%;
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
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .inventory-overview-pill {
        justify-content: center;
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
      .inventory-review-requests-button,
      .inventory-add-button {
        flex-basis: auto;
        width: 100%;
      }

      .inventory-toolbar-review-row,
      .inventory-toolbar-primary-row {
        flex-direction: column;
        align-items: stretch;
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
  }), renderInventoryApprovalRequestsDialog(), renderMyInventoryRequestsDialog(), /*#__PURE__*/React.createElement(Card, {
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
    className: "pl-10 pr-11",
    placeholder: "Search active inventory by item name or item code",
    value: searchQuery,
    onChange: e => updateInventorySearchQuery(e.target.value)
  }), searchQuery && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "search-clear-button search-clear-button--absolute",
    onClick: () => updateInventorySearchQuery(""),
    "aria-label": "Clear inventory search"
  }, /*#__PURE__*/React.createElement(X, null))), /*#__PURE__*/React.createElement("div", {
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
    className: `inventory-list-header flex items-center justify-between ${(canManageInventory(user?.role) && pendingInventoryChangeRequests.length > 0) || (canRequestInventoryMasterDataChange && myPendingInventoryChangeRequestCount > 0) ? "inventory-list-header-has-review" : ""}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-list-title"
  }, /*#__PURE__*/React.createElement(CardTitle, null, "Inventory Items"), /*#__PURE__*/React.createElement(CardDescription, null, sortedInventory.length, " items found", sortBy && /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700 ml-2"
  }, "\u2022 Sorted by ", sortLabel, " (", realtimeDisplayOrderLabel, ")")), renderInventoryStatusOverview()), /*#__PURE__*/React.createElement("div", {
    className: "inventory-toolbar-actions"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-toolbar-review-row"
  }, canManageInventory(user?.role) && pendingInventoryChangeRequests.length > 0 && /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "outline",
    className: "inventory-review-requests-button inventory-approval-requests-button border-amber-200 bg-white text-amber-900 hover:bg-amber-50 font-semibold shadow-sm transition-all duration-200",
    onClick: () => setIsApprovalDialogOpen(true)
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    className: "w-4 h-4 mr-2"
  }), "Review Requests", pendingInventoryChangeRequests.length > 0 && /*#__PURE__*/React.createElement(Badge, {
    className: "inventory-request-count-badge ml-2 bg-amber-100 text-amber-900 hover:bg-amber-100"
  }, pendingInventoryChangeRequests.length)), canRequestInventoryMasterDataChange && myPendingInventoryChangeRequestCount > 0 && /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "outline",
    className: "inventory-review-requests-button inventory-my-requests-button border-blue-200 bg-white text-blue-900 hover:bg-blue-50 font-semibold shadow-sm transition-all duration-200",
    onClick: () => setIsMyRequestsDialogOpen(true)
  }, /*#__PURE__*/React.createElement(Eye, {
    className: "w-4 h-4 mr-2"
  }), "My Requests", myPendingInventoryChangeRequestCount > 0 && /*#__PURE__*/React.createElement(Badge, {
    className: "ml-2 bg-blue-100 text-blue-900 hover:bg-blue-100"
  }, myPendingInventoryChangeRequestCount))), /*#__PURE__*/React.createElement("div", {
    className: "inventory-toolbar-primary-row"
  }, canPerformInventoryMovement(user.role) && /*#__PURE__*/React.createElement(Button, {
    type: "button",
    className: "inventory-batch-stock-adjustment-button bg-green-600 text-white hover:bg-green-700 font-semibold shadow-md transition-all duration-300",
    onClick: () => setIsBatchStockAdjustmentDialogOpen(true)
  }, /*#__PURE__*/React.createElement(PackagePlus, {
    className: "w-4 h-4 mr-2"
  }), "Batch Stock In"), canPerformInventoryMovement(user.role) && /*#__PURE__*/React.createElement(Button, {
    type: "button",
    className: "inventory-batch-stock-out-button bg-red-600 text-white hover:bg-red-700 font-semibold shadow-md transition-all duration-300",
    onClick: () => setIsBatchStockOutDialogOpen(true)
  }, /*#__PURE__*/React.createElement(PackageMinus, {
    className: "w-4 h-4 mr-2"
  }), "Batch Stock Out"), canOpenInventoryMasterDataForm && /*#__PURE__*/React.createElement(Dialog, {
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
  }, "Provide the item details below to add it to your inventory.")), renderInlineInventoryDraftRecovery("addItem"), /*#__PURE__*/React.createElement("div", {
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
  }, "Item Name ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Input, {
    id: "item-name",
    value: newItem.name,
    onChange: e => {
      setArchivedDuplicatePrompt(null);
      setSimilarDuplicatePrompt(null);
      updateNewItemDraft(previous => ({
        ...previous,
        name: sanitizeInventoryTextInput(e.target.value, "Item Name", "add-item-name-valid-characters")
      }));
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
  }, "Category ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Select, {
    value: newItem.category,
    onValueChange: value => {
      setArchivedDuplicatePrompt(null);
      setSimilarDuplicatePrompt(null);
      updateNewItemDraft(previous => ({
        ...previous,
        category: value,
        categoryNote: value === "Other" ? previous.categoryNote : ""
      }));
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
  }, "Select the category that best describes the item. If none applies, choose \"Other.\""), newItem.category === "Other" && /*#__PURE__*/React.createElement("div", {
    className: "mt-2 space-y-1"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "category-note",
    className: "text-xs font-semibold text-slate-700"
  }, "Optional: note"), /*#__PURE__*/React.createElement(Textarea, {
    id: "category-note",
    value: newItem.categoryNote,
    maxLength: 240,
    onChange: e => updateNewItemDraft(prev => ({
      ...prev,
      categoryNote: e.target.value.slice(0, 240)
    })),
    placeholder: "E.g., Specialty hardware item not covered by the listed categories.",
    className: "min-h-[68px] resize-y border-slate-300 bg-white text-sm text-slate-950"
  }))), renderSupplierField({
    id: "supplier-name",
    value: newItem.supplierName,
    mode: newItemSupplierMode,
    setMode: mode => {
      setNewItemSupplierMode(mode);
      persistAddItemDraft(newItem, mode);
    },
    onSupplierChange: supplierName => updateNewItemDraft(prev => ({
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
    onChange: e => updateNewItemDraft(previous => ({
      ...previous,
      defaultSellingPrice: sanitizeDecimalInput(e.target.value, "Default Selling Price", "add-default-price-numbers-only")
    })),
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
  }, "Optional. This price will automatically appear as the Unit Price when the item is selected in Sales Recording.")), /*#__PURE__*/React.createElement("div", {
    className: "inventory-add-field space-y-1.5"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "cost-price",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Cost Price"), /*#__PURE__*/React.createElement(Input, {
    id: "cost-price",
    type: "text",
    min: "0.01",
    step: "0.01",
    inputMode: "decimal",
    value: newItem.costPrice,
    onChange: e => updateNewItemDraft(previous => ({
      ...previous,
      costPrice: sanitizeDecimalInput(e.target.value, "Cost Price", "add-cost-price-numbers-only")
    })),
    placeholder: "e.g., 205.00",
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
  }, "Optional. This is the amount paid per unit and becomes the default Unit Cost in purchase drafts.")), renderAddSectionHeader("Stock Level and Alert Threshold"), /*#__PURE__*/React.createElement("div", {
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
  }, "Initial Stock Quantity ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Input, {
    id: "quantity",
    type: "text",
    min: "0",
    step: "1",
    inputMode: "numeric",
    value: newItem.quantity,
    onChange: e => updateNewItemDraft(previous => ({
      ...previous,
      quantity: sanitizeWholeNumberInput(e.target.value, "Initial Stock Quantity", "add-initial-quantity-numbers-only")
    })),
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
  }, "Manual Low-Stock Threshold ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Input, {
    id: "reorder-level",
    type: "text",
    min: "0",
    step: "1",
    inputMode: "numeric",
    value: newItem.reorderLevel,
    onChange: e => updateNewItemDraft(previous => ({
      ...previous,
      reorderLevel: sanitizeWholeNumberInput(e.target.value, "Manual Low-Stock Threshold", "add-reorder-threshold-numbers-only")
    })),
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
    onChange: e => updateNewItemDraft(previous => ({
      ...previous,
      leadTimeDays: sanitizeWholeNumberInput(e.target.value, "Supplier Lead Time", "add-lead-time-days-numbers-only")
    })),
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
    onChange: e => updateNewItemDraft(previous => ({
      ...previous,
      safetyStock: sanitizeWholeNumberInput(e.target.value, "Safety Stock", "add-safety-stock-numbers-only")
    })),
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
    className: "inventory-add-field inventory-add-field-full text-slate-950",
    style: {
      border: "1px solid #F59E0B",
      background: "#FFFBEB",
      borderRadius: "14px",
      padding: "16px",
      display: "grid",
      gap: "14px",
      boxShadow: "0 10px 24px rgba(245, 158, 11, 0.10)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "auto minmax(0, 1fr)",
      gap: "12px",
      alignItems: "start"
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      width: "34px",
      height: "34px",
      borderRadius: "10px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#FEF3C7",
      color: "#B45309",
      border: "1px solid #FCD34D"
    }
  }, /*#__PURE__*/React.createElement(AlertTriangle, {
    style: {
      width: "18px",
      height: "18px"
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "min-w-0"
  }, /*#__PURE__*/React.createElement("p", {
    className: "font-bold text-slate-950",
    style: {
      fontSize: "15px",
      lineHeight: "1.25"
    }
  }, "Archived match found"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700",
    style: {
      marginTop: "4px",
      fontSize: "13px",
      lineHeight: "1.5"
    }
  }, "This item already exists in Archive. Restore the existing record to preserve item history and avoid duplicate inventory records."))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: "10px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid #FDE68A",
      background: "#FFFFFF",
      borderRadius: "10px",
      padding: "10px 12px",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-amber-700",
    style: {
      display: "block",
      fontSize: "11px",
      lineHeight: "1.2"
    }
  }, "Archived Item"), /*#__PURE__*/React.createElement("strong", {
    className: "text-slate-950",
    style: {
      display: "block",
      marginTop: "4px",
      fontSize: "13px",
      lineHeight: "1.35",
      overflowWrap: "anywhere"
    }
  }, archivedDuplicatePrompt.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      border: "1px solid #FDE68A",
      background: "#FFFFFF",
      borderRadius: "10px",
      padding: "10px 12px",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-amber-700",
    style: {
      display: "block",
      fontSize: "11px",
      lineHeight: "1.2"
    }
  }, "Category"), /*#__PURE__*/React.createElement("strong", {
    className: "text-slate-950",
    style: {
      display: "block",
      marginTop: "4px",
      fontSize: "13px",
      lineHeight: "1.35",
      overflowWrap: "anywhere"
    }
  }, archivedDuplicatePrompt.category))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      borderTop: "1px solid #FDE68A",
      paddingTop: "12px"
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "flex min-w-0 items-start text-slate-700",
    style: {
      gap: "8px",
      fontSize: "12px",
      lineHeight: "1.45",
      flex: "1 1 260px"
    }
  }, /*#__PURE__*/React.createElement(Info, {
    className: "shrink-0 text-blue-600",
    style: {
      width: "16px",
      height: "16px",
      marginTop: "1px"
    }
  }), /*#__PURE__*/React.createElement("span", null, "After restoring, you can edit the item details from the inventory page.")), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    className: "inventory-restore-archived-button font-semibold",
    disabled: isRestoringArchivedDuplicate,
    onClick: () => restoreArchivedDuplicate(archivedDuplicatePrompt),
    style: {
      height: "38px",
      minWidth: "128px",
      borderRadius: "10px",
      padding: "0 16px",
      fontSize: "13px",
      background: isRestoringArchivedDuplicate ? "#B45309" : "#D97706",
      color: "#FFFFFF",
      border: "1px solid #B45309",
      boxShadow: "0 10px 18px rgba(217, 119, 6, 0.24)",
      transition: "transform 150ms ease, background-color 150ms ease, box-shadow 150ms ease"
    }
  }, isRestoringArchivedDuplicate ? "Restoring..." : "Restore Item"))), /*#__PURE__*/React.createElement(DialogFooter, {
    className: "inventory-dialog-footer pt-2",
    style: {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: "10px",
      width: "100%",
      gridColumn: "1 / -1",
      alignSelf: "stretch"
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
  }, canManageInventory(user?.role) ? "Add Item" : "Submit Request")))))))), /*#__PURE__*/React.createElement(CardContent, {
    className: "p-0"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inventory-table-wrap px-6 pb-6"
  }, /*#__PURE__*/React.createElement(Table, {
    className: "table-fixed"
  }, /*#__PURE__*/React.createElement(TableHeader, null, /*#__PURE__*/React.createElement(TableRow, {
    className: "inventory-table-header-row"
  }, /*#__PURE__*/React.createElement(TableHead, {
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
  }, item.itemCode || item.id), /*#__PURE__*/React.createElement(TableCell, null, item.name), /*#__PURE__*/React.createElement(TableCell, null, getInventoryCategoryDisplay(item)), /*#__PURE__*/React.createElement(TableCell, null, item.supplierName || "Unassigned"), /*#__PURE__*/React.createElement(TableCell, {
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
  })), canOpenInventoryMasterDataForm && /*#__PURE__*/React.createElement(Button, {
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
  }, label, renderSortIndicator(column)))), sortedInventory.length === 0 ? /*#__PURE__*/React.createElement("div", {
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
  }, getInventoryCategoryDisplay(item))), /*#__PURE__*/React.createElement("div", {
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
  }), "Stock Out"), canOpenInventoryMasterDataForm && /*#__PURE__*/React.createElement(Button, {
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
  }, "Add stock for multiple items after a verified count."))), /*#__PURE__*/React.createElement("div", {
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
    className: "flex items-center text-blue-950",
    style: {
      gap: "12px",
      border: "1px solid #BFDBFE",
      background: "#EFF6FF",
      borderRadius: "10px",
      padding: "10px 12px"
    }
  }, /*#__PURE__*/React.createElement(Info, {
    className: "shrink-0 text-blue-700",
    style: {
      width: "18px",
      height: "18px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "13px"
    }
  }, "Use Purchase Entry page for supplier deliveries so supplier and document details are recorded.")), renderInlineInventoryDraftRecovery("batchStockAdjustment"), /*#__PURE__*/React.createElement("div", {
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
  }, "Adjustment Reason ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Select, {
    value: batchStockAdjustmentReason,
    onValueChange: value => {
      setBatchStockAdjustmentReason(value);
      persistBatchStockAdjustmentDraft({ reason: value });
    }
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
  }, "Item ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Select, {
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
  }, "Quantity to Add ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Input, {
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
    onChange: value => {
      handleActualTransactionDateChange(value, setBatchStockAdjustmentActualTransactionAt, "batch stock adjustment");
      persistBatchStockAdjustmentDraft({ actualTransactionAt: value });
    },
    reasonValue: batchStockAdjustmentBackdateReason,
    onReasonChange: value => {
      setBatchStockAdjustmentBackdateReason(value);
      persistBatchStockAdjustmentDraft({ backdateReason: value });
    },
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
  }, "Use this only for non-sales reductions such as verified damage, expiry, loss, transfer, or manual adjustment. Customer purchases should be recorded in the Sales module.")), renderInlineInventoryDraftRecovery("batchStockOut"), /*#__PURE__*/React.createElement("div", {
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
  }, "Stock-Out Reason ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Select, {
    value: batchStockOutReason,
    onValueChange: value => {
      setBatchStockOutReason(value);
      persistBatchStockOutDraft({ reason: value });
    }
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
    }, "Item ", /*#__PURE__*/React.createElement("span", {
      className: "text-red-600"
    }, "*")), /*#__PURE__*/React.createElement(Select, {
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
    }, "Quantity ", /*#__PURE__*/React.createElement("span", {
      className: "text-red-600"
    }, "*")), /*#__PURE__*/React.createElement(Input, {
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
    onChange: value => {
      handleActualTransactionDateChange(value, setBatchStockOutActualTransactionAt, "batch stock-out record");
      persistBatchStockOutDraft({ actualTransactionAt: value });
    },
    reasonValue: batchStockOutBackdateReason,
    onReasonChange: value => {
      setBatchStockOutBackdateReason(value);
      persistBatchStockOutDraft({ backdateReason: value });
    },
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
  }, "Inventory Item ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Select, {
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
  }, "Add quantity to increase the available stock for this item.")), renderInlineInventoryDraftRecovery("stockIn"), /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl border border-blue-100 bg-blue-50 text-blue-900",
    style: {
      padding: "12px 14px",
      fontSize: "13px",
      lineHeight: "1.45"
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      display: "block",
      marginBottom: "3px"
    }
  }, "Supplier deliveries"), /*#__PURE__*/React.createElement("span", null, "Use Purchase Entry page for supplier deliveries so supplier and document details are recorded.")), /*#__PURE__*/React.createElement("div", {
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
  }, "Quantity to Add ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Input, {
    id: "stock-in-amount",
    type: "text",
    inputMode: "numeric",
    "data-validation-label": "Stock In Quantity",
    value: stockAmount,
    onChange: e => {
      const nextAmount = sanitizeWholeNumberInput(e.target.value, "Stock In Quantity", "stock-in-quantity-numbers-only");
      setStockAmount(nextAmount);
      persistStockInDraft({ stockAmount: nextAmount });
    },
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
  }, "Reason for Stock In ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Select, {
    value: stockInReason,
    onValueChange: value => {
      setStockInReason(value);
      persistStockInDraft({ stockInReason: value });
    }
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
  }, option.label)))), stockInReason && /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700",
    style: {
      fontSize: "12px",
      lineHeight: "1.35"
    }
  }, STOCK_IN_REASON_OPTIONS.find(option => option.value === stockInReason)?.description)), renderActualTransactionDateFields({
    idPrefix: "stock-in",
    value: stockActualTransactionAt,
    onChange: value => {
      handleActualTransactionDateChange(value, setStockActualTransactionAt, "stock-in record");
      persistStockInDraft({ stockActualTransactionAt: value });
    },
    reasonValue: stockBackdateReason,
    onReasonChange: value => {
      setStockBackdateReason(value);
      persistStockInDraft({ stockBackdateReason: value });
    },
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
  }, "Remove quantity to decrease the available stock for this item.")), renderInlineInventoryDraftRecovery("stockOut"), /*#__PURE__*/React.createElement("div", {
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
  }, "Quantity to Remove ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Input, {
    id: "stock-out-amount",
    type: "text",
    inputMode: "numeric",
    "data-validation-label": "Stock Out Quantity",
    value: stockAmount,
    onChange: e => {
      const nextAmount = sanitizeWholeNumberInput(e.target.value, "Stock Out Quantity", "stock-out-quantity-numbers-only");
      setStockAmount(nextAmount);
      persistStockOutDraft({ stockAmount: nextAmount });
    },
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
  }, "Reason for Stock Out ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Select, {
    value: stockOutReason,
    onValueChange: value => {
      setStockOutReason(value);
      persistStockOutDraft({ stockOutReason: value });
    }
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
    onChange: value => {
      handleActualTransactionDateChange(value, setStockActualTransactionAt, "stock-out record");
      persistStockOutDraft({ stockActualTransactionAt: value });
    },
    reasonValue: stockBackdateReason,
    onReasonChange: value => {
      setStockBackdateReason(value);
      persistStockOutDraft({ stockBackdateReason: value });
    },
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
  }, "Reason for Archiving ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Select, {
    value: archiveReason,
    onValueChange: value => {
      setArchiveReason(value);
      if (value !== "other") {
        setArchiveReasonNote("");
      }
    }
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
  }, option.label))))), archiveReason === "other" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "archive-reason-note",
    className: "font-semibold text-slate-950",
    style: {
      display: "block",
      marginBottom: "8px",
      fontSize: "14px",
      lineHeight: "1.25"
    }
  }, "Other Reason ", /*#__PURE__*/React.createElement("span", {
    className: "text-red-600"
  }, "*")), /*#__PURE__*/React.createElement(Textarea, {
    id: "archive-reason-note",
    value: archiveReasonNote,
    onChange: event => setArchiveReasonNote(event.target.value.slice(0, 240)),
    placeholder: "E.g., Item is no longer carried by the branch but kept for past record reference.",
    className: "min-h-[88px] resize-none border-slate-300 bg-white text-slate-950",
    maxLength: 240,
    style: {
      borderRadius: "10px",
      fontSize: "14px",
      lineHeight: "1.45",
      padding: "12px 14px"
    }
  }), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-700",
    style: {
      fontSize: "12px",
      lineHeight: "1.35"
    }
  }, "Required only when Other is selected. This note is saved with the archived record.")), /*#__PURE__*/React.createElement("div", {
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
    disabled: !archiveReason || (archiveReason === "other" && !archiveReasonNote.trim()),
    style: {
      height: "38px",
      minWidth: "132px",
      borderRadius: "10px",
      padding: "0 18px",
      fontSize: "13px",
      background: "#111827",
      color: "#FFFFFF",
      opacity: archiveReason && (archiveReason !== "other" || archiveReasonNote.trim()) ? 1 : 0.58,
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
  }, similarDuplicatePrompt?.action === "edit" ? "Update Anyway" : "Add Anyway"))))), renderInventoryDraftRecoveryDialog())))));
}
