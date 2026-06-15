// Shared data provider for inventory, sales, purchases, alerts, archives, and
// audit-related state used throughout the store management system.
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { apiUrl } from "../utils/api";
import { formatArchiveReferenceId, formatItemCode } from "../utils/itemCodes";
import { canPerformInventoryMovement, isAdminRole } from "../utils/roles";

const DataContext = createContext(undefined);

const formatUnitQuantity = quantity => `${quantity} ${Number(quantity) === 1 ? "unit" : "units"}`;
const DAY_MS = 24 * 60 * 60 * 1000;

// Client-side status calculations mirror the backend so the UI can display
// immediate stock state while waiting for refreshed server data.
const computeStockStatusFromLevels = (quantity, reorderLevel) => {
  const stockLevel = Number(quantity || 0);
  const threshold = Number(reorderLevel || 0);
  if (stockLevel <= 0) return "Out of Stock";
  return stockLevel <= threshold ? "Low Stock" : "In Stock";
};

const normalizeOptionalNumber = value => (
  value === null || value === undefined || value === "" ? "" : Number(value)
);

const OFFICIAL_INVOICE_NUMBER_PATTERN = /^\d{6}$/;
const LEGACY_SALES_INVOICE_NUMBER_PATTERN = /^SI-\d{4}-(\d{6})$/i;

// Preserve compatibility with older sales records that stored invoice numbers
// as system references while newer records store the six-digit official booklet
// number separately.
const extractLegacyOfficialInvoiceNumber = value => {
  const match = String(value || "").trim().match(LEGACY_SALES_INVOICE_NUMBER_PATTERN);
  return match ? match[1] : "";
};

const resolveOfficialInvoiceNumber = (officialInvoiceNumber, salesNumber) => {
  const cleanOfficialInvoiceNumber = String(officialInvoiceNumber || "").trim();
  if (OFFICIAL_INVOICE_NUMBER_PATTERN.test(cleanOfficialInvoiceNumber)) {
    return cleanOfficialInvoiceNumber;
  }
  return extractLegacyOfficialInvoiceNumber(cleanOfficialInvoiceNumber)
    || extractLegacyOfficialInvoiceNumber(salesNumber)
    || cleanOfficialInvoiceNumber;
};

const getEffectiveLowStockThreshold = product =>
  normalizeOptionalNumber(product.active_low_stock_threshold ?? product.min_stock_level ?? 0);

// Normalizes backend approval-request rows into the same camelCase shape used by
// the Inventory module review dialog.
const mapInventoryChangeRequest = request => ({
  id: request.request_id?.toString() ?? '',
  requestType: request.request_type || '',
  branch: request.branch || '',
  inventoryId: request.inventory_id?.toString() || '',
  itemName: request.item_name || '',
  requestedPayload: request.requested_payload || {},
  currentSnapshot: request.current_snapshot || null,
  status: request.status || 'pending',
  requestedBy: request.requested_by,
  requestedByName: request.requested_by_name || 'System User',
  reviewedBy: request.reviewed_by,
  reviewedByName: request.reviewed_by_name || '',
  reviewNote: request.review_note || '',
  requestedAt: request.requested_at ? new Date(request.requested_at).toISOString() : '',
  reviewedAt: request.reviewed_at ? new Date(request.reviewed_at).toISOString() : '',
});

const getStockAlertEventId = (prefix, item) => {
  const quantity = Number(item.quantity);
  const quantityKey = Number.isFinite(quantity) ? quantity : "unknown";
  const timestampKey = item.lastUpdated || "no-timestamp";

  return `${prefix}-${item.id}-${quantityKey}-${timestampKey}`;
};

// Stock alerts are generated from current inventory state instead of stored as
// permanent rows, so repeated refreshes do not duplicate low/out-of-stock notices.
const generateInventoryAlerts = inventory => {
  const alerts = [];
  inventory.forEach(item => {
    const timestampRaw = item.lastUpdated || new Date().toISOString();

    if (item.status === 'Out of Stock') {
      alerts.push({
        id: getStockAlertEventId('out', item),
        type: 'warning',
        title: 'Out of Stock',
        message: `${item.name} is completely out of stock`,
        timestampRaw,
        read: false,
        actionable: true,
        relatedModule: 'reports',
        actionLabel: 'Review Stock',
        reportType: 'low-stock',
        reportCategory: item.category
      });
    } else if (item.status === 'Low Stock') {
      alerts.push({
        id: getStockAlertEventId('low', item),
        type: 'warning',
        title: 'Low Stock Alert',
        message: `${item.name} is running low (${formatUnitQuantity(item.quantity)} remaining)`,
        timestampRaw,
        read: false,
        actionable: true,
        relatedModule: 'reports',
        actionLabel: 'Review Stock',
        reportType: 'low-stock',
        reportCategory: item.category
      });
    }
  });
  return alerts;
};

const parseSystemEventContext = context => {
  if (!context) return {};
  if (typeof context === "object") return context;
  try {
    return JSON.parse(context);
  } catch {
    return {};
  }
};

const buildSystemEventAlert = event => {
  const context = parseSystemEventContext(event.context);
  const timestampRaw = event.created_at ? new Date(event.created_at).toISOString() : new Date().toISOString();
  const baseAlert = {
    id: `system-event-${event.id}`,
    type: event.severity === "warning" ? "warning" : "info",
    title: "System Notice",
    message: event.message || "A system maintenance action was completed.",
    timestampRaw,
    read: false,
    actionable: true,
    relatedModule: "maintenance"
  };

  switch (event.event_type) {
    case "DATABASE_BACKUP":
      return {
        ...baseAlert,
        type: "info",
        title: "Database Backup Created",
        message: "A full database backup was generated and downloaded."
      };
    case "DATABASE_RESTORE":
      return {
        ...baseAlert,
        type: "info",
        title: "Database Restore Completed",
        message: "The system was restored from an uploaded SQL backup."
      };
    case "SYSTEM_LOG_CLEANUP": {
      const clearedCount = Number(context.clearedCount || 0);
      return {
        ...baseAlert,
        type: "info",
        title: "System Logs Checked",
        message: clearedCount > 0
          ? `${clearedCount} eligible non-critical system log${clearedCount === 1 ? "" : "s"} were cleared.`
          : "System log cleanup completed with no eligible records to remove."
      };
    }
    case "DATABASE_OPTIMIZATION":
      return {
        ...baseAlert,
        type: "info",
        title: "Database Optimized",
        message: "Application database table statistics were refreshed."
      };
    case "DATA_INTEGRITY_CHECK": {
      const issueCount = Number(context.issueCount || 0);
      return {
        ...baseAlert,
        type: issueCount > 0 ? "warning" : "info",
        title: issueCount > 0 ? "Data Integrity Issues Found" : "Data Integrity Check Passed",
        message: issueCount > 0
          ? `The latest data integrity check found ${issueCount} issue${issueCount === 1 ? "" : "s"} for review.`
          : "The latest data integrity check found no issues."
      };
    }
    default:
      return baseAlert;
  }
};

// Admin-only system alerts surface operational risks such as missing backups
// and maintenance events without exposing these notices to sales or inventory-only accounts.
const generateSystemAlerts = (summary, role) => {
  const alerts = [];

  if (isAdminRole(role)) {
    if (summary.lastBackupAt) {
      const backupTime = new Date(summary.lastBackupAt).getTime();
      const ageDays = Math.floor((Date.now() - backupTime) / (1000 * 60 * 60 * 24));

      if (ageDays >= 3) {
        alerts.push({
          id: 'backup-reminder',
          type: 'info',
          title: 'System Backup Reminder',
          message: 'The most recent backup was completed.',
          timestampRaw: summary.lastBackupAt || new Date().toISOString(),
          read: false,
          actionable: true,
          relatedModule: 'maintenance'
        });
      }
    } else {
      alerts.push({
        id: 'backup-missing',
        type: 'warning',
        title: 'No Backup Recorded',
        message: 'No system backup has been recorded yet.',
        timestampRaw: new Date().toISOString(),
        read: false,
        actionable: true,
        relatedModule: 'maintenance'
      });
    }

    (summary.recentSystemEvents || []).forEach(event => {
      alerts.push(buildSystemEventAlert(event));
    });
  }

  return alerts;
};

// Supplier payment alerts are limited to inventory-authorized roles because
// credit purchases affect receiving follow-up and supplier payment tracking.
const generateSupplierPaymentAlerts = (purchases, role) => {
  if (!canPerformInventoryMovement(role)) return [];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return (purchases || [])
    .filter(purchase => (
      purchase.status !== 'cancelled' &&
      purchase.paymentTerms === 'credit' &&
      purchase.paymentStatus !== 'paid' &&
      purchase.paymentDueDate
    ))
    .map(purchase => {
      const dueDate = new Date(purchase.paymentDueDate);
      if (Number.isNaN(dueDate.getTime())) return null;
      dueDate.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.ceil((dueDate.getTime() - todayStart.getTime()) / DAY_MS);
      if (daysUntilDue > 30) return null;

      const isOverdue = daysUntilDue < 0;
      const isDueToday = daysUntilDue === 0;
      const dueLabel = isOverdue
        ? `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'} overdue`
        : isDueToday
          ? 'due today'
          : `due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;

      return {
        id: `supplier-payment-${purchase.id}-${purchase.paymentDueDate}`,
        type: isOverdue || daysUntilDue <= 7 ? 'warning' : 'info',
        title: isOverdue ? 'Overdue Supplier Payment' : 'Supplier Payment Reminder',
        message: `${purchase.supplierName || 'Supplier'} payment for ${purchase.purchaseNumber || 'purchase'} is ${dueLabel}. Amount: ${formatCurrencyForAlert(purchase.subtotalAmount)}.`,
        timestampRaw: purchase.paymentDueDate,
        read: false,
        actionable: true,
        relatedModule: 'purchases',
        actionLabel: 'Review Purchase',
        purchaseId: purchase.id,
        purchaseNumber: purchase.purchaseNumber
      };
    })
    .filter(Boolean);
};

const formatCurrencyForAlert = value =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(Number(value || 0));

const normalizeAlertLookupText = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const getApprovedRequestInventoryId = (request, inventory) => {
  if (request.inventoryId) return String(request.inventoryId);

  const requestedName = normalizeAlertLookupText(
    request.requestedPayload?.name || request.itemName || request.currentSnapshot?.name
  );
  if (!requestedName) return '';

  const requestedCategory = normalizeAlertLookupText(
    request.requestedPayload?.category || request.currentSnapshot?.category
  );
  const matchingItem = (inventory || []).find(item => {
    const sameName = normalizeAlertLookupText(item.name) === requestedName;
    const sameBranch = !request.branch || !item.branch || item.branch === request.branch;
    const sameCategory = !requestedCategory || normalizeAlertLookupText(item.category) === requestedCategory;
    return sameName && sameBranch && sameCategory;
  });

  return matchingItem?.id ? String(matchingItem.id) : '';
};

// Staff review alerts are generated from approved/rejected inventory change
// requests so requesters receive professional feedback without keeping reviewed
// items inside the pending request tracker.
const generateReviewedInventoryRequestAlerts = (requests, inventory, role) => {
  if (isAdminRole(role) || !canPerformInventoryMovement(role)) return [];

  return (requests || [])
    .filter(request => ['approved', 'rejected'].includes(String(request.status || '').toLowerCase()))
    .map(request => {
      const status = String(request.status || '').toLowerCase();
      const isApproved = status === 'approved';
      const targetInventoryId = getApprovedRequestInventoryId(request, inventory);
      const itemName = request.requestedPayload?.name
        || request.itemName
        || request.currentSnapshot?.name
        || 'Inventory item';
      const isNewItemRequest = request.requestType === 'add_item';
      const reviewedAt = request.reviewedAt || new Date().toISOString();

      return {
        id: `inventory-request-${status}-${request.id}-${targetInventoryId || 'no-target'}-${reviewedAt}`,
        type: isApproved ? 'success' : 'warning',
        title: isApproved ? 'Inventory Request Approved' : 'Inventory Request Rejected',
        message: isApproved
          ? (isNewItemRequest
            ? `${itemName} was approved and added to branch inventory.`
            : `The requested inventory changes for ${itemName} were approved.`)
          : `The inventory request for ${itemName} was rejected.${request.reviewNote ? ` Admin note: ${request.reviewNote}` : ''}`,
        timestampRaw: reviewedAt,
        read: false,
        actionable: isApproved && Boolean(targetInventoryId),
        relatedModule: isApproved && targetInventoryId ? 'inventory' : '',
        actionLabel: isApproved && targetInventoryId ? 'View Item' : '',
        alertCategory: 'inventory-requests',
        inventoryId: isApproved ? targetInventoryId : '',
        requestId: request.id
      };
    });
};

export function DataProvider({ children }) {
  const [inventory, setInventory] = useState([]);
  const [archivedInventory, setArchivedInventory] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [salesTransactions, setSalesTransactions] = useState([]);
  const [purchaseTransactions, setPurchaseTransactions] = useState([]);
  const [inventoryChangeRequests, setInventoryChangeRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [inventoryError, setInventoryError] = useState(null);
  const [systemSummary, setSystemSummary] = useState({
    pendingRegistrations: [],
    lastBackupAt: null,
    recentSystemEvents: [],
    dailySalesTarget: null,
    dailySalesTargetUpdatedAt: null,
    dailySalesTargetUpdatedBy: null
  });
  const [dismissedAlertIds, setDismissedAlertIds] = useState(() => {
    try {
      const stored = localStorage.getItem("dismissed_alert_ids");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [readAlertIds, setReadAlertIds] = useState(() => {
    try {
      const stored = localStorage.getItem("read_alert_ids");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [activeUserRole, setActiveUserRole] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored).role : null;
    } catch {
      return null;
    }
  });

  // Fetch inventory from backend and map database columns to the frontend shape
  // expected by modules, reports, alerts, and stock movement previews.
  const fetchInventory = useCallback(async (options = {}) => {
    const { showLoading = true } = options;
    if (showLoading) {
      setLoadingInventory(true);
      setInventoryError(null);
    }
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setInventory([]);
        return;
      }
      const res = await axios.get(apiUrl("/api/inventory"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const items = (res.data.products || []).map((p) => {
        const mapped = {
          id: p.inventory_id?.toString() ?? '',
          productId: p.product_id?.toString() ?? '',
          name: p.name,
          category: p.category,
          categoryNote: p.category_note || '',
          supplierName: p.supplier_name || '',
          defaultSellingPrice: p.default_selling_price === null || p.default_selling_price === undefined ? '' : Number(p.default_selling_price),
          costPrice: p.cost_price === null || p.cost_price === undefined ? '' : Number(p.cost_price),
          quantity: p.stock_level,
          reservedQuantity: Number(p.reserved_stock || 0),
          availableQuantity: p.available_stock === null || p.available_stock === undefined
            ? Number(p.stock_level || 0)
            : Number(p.available_stock || 0),
          reorderLevel: p.min_stock_level,
          leadTimeDays: normalizeOptionalNumber(p.lead_time_days),
          safetyStock: normalizeOptionalNumber(p.safety_stock),
          averageDailySales: normalizeOptionalNumber(p.average_daily_sales),
          averageDailySalesMode: p.average_daily_sales_mode || 'auto',
          manualAverageDailySales: normalizeOptionalNumber(p.manual_average_daily_sales),
          averageDailySalesOverrideReason: p.average_daily_sales_override_reason || '',
          recommendedReorderPoint: normalizeOptionalNumber(p.recommended_reorder_point),
          activeLowStockThreshold: getEffectiveLowStockThreshold(p),
          suggestedOrderQuantity: normalizeOptionalNumber(p.suggested_order_quantity),
          status: p.status || computeStockStatusFromLevels(p.stock_level, getEffectiveLowStockThreshold(p)),
          branch: p.branch,
          // preserve full ISO timestamp so the UI can display accurate relative times
          lastUpdated: p.last_updated ? new Date(p.last_updated).toISOString() : '',
        };
        return {
          ...mapped,
          itemCode: formatItemCode(mapped)
        };
      });
      setInventory(items);
    } catch (err) {
      setInventoryError(err?.response?.data?.error || err.message || "Failed to load inventory");
      if (showLoading) {
        setInventory([]);
      }
    } finally {
      if (showLoading) {
        setLoadingInventory(false);
      }
    }
  }, []);

  const fetchArchivedInventory = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setArchivedInventory([]);
        return;
      }
      const res = await axios.get(apiUrl("/api/archive"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const items = (res.data.archivedProducts || []).map((p) => {
        const mapped = {
          id: p.archived_inventory_id?.toString() ?? '',
          originalInventoryId: p.original_inventory_id?.toString() ?? '',
          productId: p.product_id?.toString() ?? '',
          name: p.name,
          category: p.category,
          categoryNote: p.category_note || '',
          supplierName: p.supplier_name || '',
          defaultSellingPrice: p.default_selling_price === null || p.default_selling_price === undefined ? '' : Number(p.default_selling_price),
          costPrice: p.cost_price === null || p.cost_price === undefined ? '' : Number(p.cost_price),
          quantity: p.stock_level,
          reorderLevel: p.min_stock_level,
          leadTimeDays: normalizeOptionalNumber(p.lead_time_days),
          safetyStock: normalizeOptionalNumber(p.safety_stock),
          averageDailySales: normalizeOptionalNumber(p.average_daily_sales),
          averageDailySalesMode: p.average_daily_sales_mode || 'auto',
          manualAverageDailySales: normalizeOptionalNumber(p.manual_average_daily_sales),
          averageDailySalesOverrideReason: p.average_daily_sales_override_reason || '',
          recommendedReorderPoint: normalizeOptionalNumber(p.recommended_reorder_point),
          activeLowStockThreshold: getEffectiveLowStockThreshold(p),
          suggestedOrderQuantity: normalizeOptionalNumber(p.suggested_order_quantity),
          status: p.status || computeStockStatusFromLevels(p.stock_level, getEffectiveLowStockThreshold(p)),
          branch: p.branch,
          // preserve full ISO timestamps for accuracy in alerts and history
          lastUpdated: p.last_updated ? new Date(p.last_updated).toISOString() : '',
          archiveReason: p.archive_reason || '',
          archiveReasonNote: p.archive_reason_note || '',
          archivedAt: p.archived_at ? new Date(p.archived_at).toISOString() : '',
        };
        return {
          ...mapped,
          itemCode: formatItemCode(mapped),
          archiveCode: formatArchiveReferenceId(mapped.id, mapped.archivedAt)
        };
      });
      setArchivedInventory(items);
    } catch (err) {
      setArchivedInventory([]);
    }
  }, []);

  const fetchInventoryChangeRequests = useCallback(async () => {
    const token = localStorage.getItem("token");
    let storedUser = null;
    try {
      storedUser = JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      storedUser = null;
    }
    if (!token || !canPerformInventoryMovement(storedUser?.role)) {
      setInventoryChangeRequests([]);
      return [];
    }
    try {
      const res = await axios.get(apiUrl("/api/inventory/change-requests"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const requests = (res.data.requests || []).map(mapInventoryChangeRequest);
      setInventoryChangeRequests(requests);
      return requests;
    } catch {
      setInventoryChangeRequests([]);
      return [];
    }
  }, []);

  const submitInventoryChangeRequest = async ({ requestType, inventoryId = null, itemName, requestedPayload }) => {
    const token = localStorage.getItem("token");
    const res = await axios.post(
      apiUrl("/api/inventory/change-requests"),
      {
        request_type: requestType,
        inventory_id: inventoryId,
        item_name: itemName,
        requested_payload: requestedPayload,
      },
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    try {
      localStorage.setItem("inventory-change-request-submitted-at", new Date().toISOString());
      window.dispatchEvent(new Event("inventory-change-request-submitted"));
    } catch {
      // Ignore browser storage/event failures; the server record has already been created.
    }
    await fetchInventoryChangeRequests();
    await fetchInventory({ showLoading: false });
    return mapInventoryChangeRequest(res.data.request || {});
  };

  const reviewInventoryChangeRequest = async ({ requestId, status, reviewNote = "" }) => {
    const token = localStorage.getItem("token");
    const res = await axios.post(
      apiUrl(`/api/inventory/change-requests/${requestId}/status`),
      { status, review_note: reviewNote },
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    await fetchInventoryChangeRequests();
    await fetchInventory({ showLoading: false });
    return {
      request: mapInventoryChangeRequest(res.data.request || {}),
      product: res.data.product || null,
    };
  };

  const fetchStockMovements = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setStockMovements([]);
        return;
      }
      const res = await axios.get(apiUrl("/api/stock-movements"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const movements = (res.data.movements || []).map((movement) => ({
        id: movement.movement_id?.toString() ?? '',
        inventoryId: movement.inventory_id?.toString() ?? '',
        productId: movement.product_id?.toString() ?? '',
        itemName: movement.item_name,
        category: movement.category,
        branch: movement.branch,
        action: movement.action,
        quantityChanged: Number(movement.quantity_changed || 0),
        previousQuantity: Number(movement.previous_quantity || 0),
        newQuantity: Number(movement.new_quantity || 0),
        reason: movement.reason || '',
        note: movement.note || '',
        actorId: movement.actor_id?.toString() ?? '',
        actorName: movement.actor_name || '',
        createdAt: movement.created_at ? new Date(movement.created_at).toISOString() : '',
        encodedAt: movement.encoded_at ? new Date(movement.encoded_at).toISOString() : '',
        backdateReason: movement.backdate_reason || '',
      }));
      setStockMovements(movements);
    } catch (err) {
      console.error('Failed to load stock movements:', err);
      setStockMovements([]);
    }
  }, []);

  const mapSalesTransaction = (sale) => ({
    id: sale.sales_transaction_id?.toString() ?? '',
    salesNumber: sale.sales_number || '',
    officialInvoiceNumber: sale.transaction_type === 'refund'
      ? ''
      : resolveOfficialInvoiceNumber(sale.official_invoice_number, sale.sales_number),
    officialInvoiceExpectedNumber: resolveOfficialInvoiceNumber(
      sale.official_invoice_expected_number,
      sale.official_invoice_expected_number
    ),
    officialInvoiceExceptionReason: sale.official_invoice_exception_reason || '',
    branch: sale.branch || '',
    customerType: sale.customer_type || 'walk_in',
    customerName: sale.customer_name || 'C',
    customerTin: sale.customer_tin || '',
    customerAddress: sale.customer_address || 'C',
    totalQuantity: Number(sale.total_quantity || 0),
    subtotalAmount: Number(sale.subtotal_amount || sale.total_amount || 0),
    discountAmount: Number(sale.discount_amount || 0),
    discountType: sale.discount_type || 'none',
    discountLabel: sale.discount_label || '',
    deliveryCharge: Number(sale.delivery_charge || 0),
    vatableSales: Number(sale.vatable_sales || 0),
    vatAmount: Number(sale.vat_amount || 0),
    totalAmount: Number(sale.total_amount || 0),
    paymentMethod: sale.payment_method || 'cash',
    amountReceived: sale.amount_received === null || sale.amount_received === undefined ? null : Number(sale.amount_received || 0),
    changeAmount: Number(sale.change_amount || 0),
    paymentReference: sale.payment_reference || '',
    paymentConfirmed: Boolean(sale.payment_confirmed),
    paymentConfirmedBy: sale.payment_confirmed_by_name || '',
    paymentConfirmedAt: sale.payment_confirmed_at ? new Date(sale.payment_confirmed_at).toISOString() : '',
    status: sale.status || 'completed',
    transactionType: sale.transaction_type || 'sale',
    referenceSalesTransactionId: sale.reference_sales_transaction_id?.toString() ?? '',
    referenceSalesNumber: sale.reference_sales_number || '',
    referenceOfficialInvoiceNumber: resolveOfficialInvoiceNumber(
      sale.reference_official_invoice_number,
      sale.reference_sales_number
    ),
    soldBy: sale.sold_by?.toString() ?? '',
    soldByName: sale.sold_by_name || '',
    remarks: sale.remarks || '',
    createdAt: sale.created_at ? new Date(sale.created_at).toISOString() : '',
    encodedAt: sale.encoded_at ? new Date(sale.encoded_at).toISOString() : '',
    backdateReason: sale.backdate_reason || '',
    cancelledAt: sale.cancelled_at ? new Date(sale.cancelled_at).toISOString() : '',
    cancelReason: sale.cancel_reason || '',
    items: (sale.items || []).map((item) => ({
      id: item.sales_item_id?.toString() ?? '',
      itemType: item.item_type || (item.is_inventory_item === false ? 'non_inventory' : 'inventory'),
      inventoryId: item.inventory_id?.toString() ?? '',
      productId: item.product_id?.toString() ?? '',
      isInventoryItem: item.is_inventory_item !== false,
      itemName: item.item_name || '',
      category: item.category || '',
      categoryNote: item.category_note || '',
      branch: item.branch || '',
      quantitySold: Number(item.quantity_sold || 0),
      unitPrice: Number(item.unit_price || 0),
      unitCostAtSale: Number(item.unit_cost_at_sale || 0),
      subtotal: Number(item.subtotal || 0),
      costSubtotal: Number(item.cost_subtotal || 0),
      grossProfit: Number(item.gross_profit || 0),
      profitMarginPercent: Number(item.profit_margin_percent || 0),
      previousQuantity: item.previous_quantity === null || item.previous_quantity === undefined ? null : Number(item.previous_quantity || 0),
      newQuantity: item.new_quantity === null || item.new_quantity === undefined ? null : Number(item.new_quantity || 0),
      refundForSalesItemId: item.refund_for_sales_item_id?.toString() ?? '',
      refundedQuantity: Number(item.refunded_quantity || 0),
      refundedAmount: Number(item.refunded_amount || 0),
      createdAt: item.created_at ? new Date(item.created_at).toISOString() : '',
    })),
  });

  const fetchSalesTransactions = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setSalesTransactions([]);
        return;
      }
      const res = await axios.get(apiUrl("/api/sales"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const sales = (res.data.sales || []).map(mapSalesTransaction);
      setSalesTransactions(sales);
    } catch (err) {
      console.error('Failed to load sales records:', err);
      setSalesTransactions([]);
    }
  }, []);

  const getNextSalesInvoiceNumber = useCallback(async () => {
    const token = localStorage.getItem("token");
    const res = await axios.get(apiUrl("/api/sales/next-invoice-number"), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return String(res.data?.invoice_number || "").trim();
  }, []);

  const mapPurchaseTransaction = (purchase) => {
    const purchaseTransactionId = purchase.purchase_transaction_id ?? purchase.purchaseTransactionId ?? purchase.id ?? '';
    return {
      id: purchaseTransactionId?.toString() ?? '',
      purchaseTransactionId: purchaseTransactionId?.toString() ?? '',
      purchaseNumber: purchase.purchase_number || purchase.purchaseNumber || '',
      branch: purchase.branch || '',
      supplierName: purchase.supplier_name || purchase.supplierName || '',
      documentType: purchase.document_type || purchase.documentType || 'DR',
      documentTypeNote: purchase.document_type_note || purchase.documentTypeNote || '',
      documentNumber: purchase.document_number || purchase.documentNumber || '',
      paymentTerms: purchase.payment_terms || purchase.paymentTerms || 'cash',
      creditTermsDays: purchase.credit_terms_days === null || purchase.credit_terms_days === undefined
        ? (purchase.creditTermsDays === null || purchase.creditTermsDays === undefined ? '' : Number(purchase.creditTermsDays))
        : Number(purchase.credit_terms_days),
      paymentDueDate: purchase.payment_due_date
        ? new Date(purchase.payment_due_date).toISOString()
        : purchase.paymentDueDate || '',
      paymentStatus: purchase.payment_status || purchase.paymentStatus || 'not_applicable',
      paymentPaidAt: purchase.payment_paid_at
        ? new Date(purchase.payment_paid_at).toISOString()
        : purchase.paymentPaidAt || '',
      paymentPaidBy: purchase.payment_paid_by?.toString() ?? purchase.paymentPaidBy?.toString() ?? '',
      paymentPaidByName: purchase.payment_paid_by_name || purchase.paymentPaidByName || '',
      subtotalAmount: Number(purchase.subtotal_amount ?? purchase.subtotalAmount ?? 0),
      totalQuantity: Number(purchase.total_quantity ?? purchase.totalQuantity ?? 0),
      remarks: purchase.remarks || '',
      status: purchase.status || 'completed',
      encodedBy: purchase.encoded_by?.toString() ?? purchase.encodedBy?.toString() ?? '',
      encodedByName: purchase.encoded_by_name || purchase.encodedByName || '',
      createdAt: purchase.created_at ? new Date(purchase.created_at).toISOString() : purchase.createdAt || '',
      encodedAt: purchase.encoded_at ? new Date(purchase.encoded_at).toISOString() : purchase.encodedAt || '',
      backdateReason: purchase.backdate_reason || purchase.backdateReason || '',
      cancelledAt: purchase.cancelled_at ? new Date(purchase.cancelled_at).toISOString() : purchase.cancelledAt || '',
      cancelReason: purchase.cancel_reason || purchase.cancelReason || '',
      items: (purchase.items || []).map((item) => ({
        id: item.purchase_item_id?.toString() ?? item.id?.toString() ?? '',
        inventoryId: item.inventory_id?.toString() ?? item.inventoryId?.toString() ?? '',
        productId: item.product_id?.toString() ?? item.productId?.toString() ?? '',
        itemName: item.item_name || item.itemName || '',
        category: item.category || '',
        categoryNote: item.category_note || item.categoryNote || '',
        branch: item.branch || '',
        quantityReceived: Number(item.quantity_received ?? item.quantityReceived ?? 0),
        unitCost: Number(item.unit_cost ?? item.unitCost ?? 0),
        subtotal: Number(item.subtotal || 0),
        previousQuantity: Number(item.previous_quantity ?? item.previousQuantity ?? 0),
        newQuantity: Number(item.new_quantity ?? item.newQuantity ?? 0),
        createdAt: item.created_at ? new Date(item.created_at).toISOString() : item.createdAt || '',
      })),
    };
  };

  const fetchPurchaseTransactions = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setPurchaseTransactions([]);
        return;
      }
      const res = await axios.get(apiUrl("/api/purchases"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setPurchaseTransactions((res.data.purchases || []).map(mapPurchaseTransaction));
    } catch (err) {
      console.error('Failed to load purchase records:', err);
      setPurchaseTransactions([]);
    }
  }, []);

  const refreshSystemSummary = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setSystemSummary({
          pendingRegistrations: [],
          lastBackupAt: null,
          recentSystemEvents: [],
          dailySalesTarget: null,
          dailySalesTargetUpdatedAt: null,
          dailySalesTargetUpdatedBy: null
        });
        return;
      }
      const response = await axios.get(apiUrl("/api/system/summary"), {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setSystemSummary(response.data || {});
    } catch (err) {
      console.error('Failed to load system summary:', err);
    }
  }, []);

  const updateDailySalesTarget = useCallback(async (dailySalesTarget) => {
    const token = localStorage.getItem("token");
    const response = await axios.put(
      apiUrl("/api/system/daily-sales-target"),
      { daily_sales_target: dailySalesTarget },
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    await refreshSystemSummary();
    return response.data;
  }, [refreshSystemSummary]);

  useEffect(() => {
    fetchInventory();
    fetchArchivedInventory();
    fetchStockMovements();
    fetchSalesTransactions();
    fetchPurchaseTransactions();
    fetchInventoryChangeRequests();
    refreshSystemSummary();
  }, [fetchInventory, fetchArchivedInventory, fetchStockMovements, fetchSalesTransactions, fetchPurchaseTransactions, fetchInventoryChangeRequests, refreshSystemSummary]);

  // Authentication, restore, and maintenance events can change every shared
  // dataset at once, so the provider refreshes all module state from the server.
  useEffect(() => {
    const handleAuthStateChanged = () => {
      try {
        const stored = localStorage.getItem("user");
        setActiveUserRole(stored ? JSON.parse(stored).role : null);
      } catch {
        setActiveUserRole(null);
      }
      fetchInventory();
      fetchArchivedInventory();
      fetchStockMovements();
      fetchSalesTransactions();
      fetchPurchaseTransactions();
      fetchInventoryChangeRequests();
      refreshSystemSummary();
    };

    window.addEventListener('auth-state-changed', handleAuthStateChanged);
    window.addEventListener('database-restored', handleAuthStateChanged);
    window.addEventListener('maintenance-action-completed', handleAuthStateChanged);
    return () => {
      window.removeEventListener('auth-state-changed', handleAuthStateChanged);
      window.removeEventListener('database-restored', handleAuthStateChanged);
      window.removeEventListener('maintenance-action-completed', handleAuthStateChanged);
    };
  }, [fetchInventory, fetchArchivedInventory, fetchStockMovements, fetchSalesTransactions, fetchPurchaseTransactions, fetchInventoryChangeRequests, refreshSystemSummary]);

  // Keep dashboards and module views current during local multi-tab use. These
  // intervals complement event-based refreshes after writes and maintenance work.
  useEffect(() => {
    const id = setInterval(fetchInventory, 30000);

    return () => clearInterval(id);
  }, [fetchInventory]);

  useEffect(() => {
    const id = setInterval(fetchStockMovements, 30000);

    return () => clearInterval(id);
  }, [fetchStockMovements]);

  useEffect(() => {
    const id = setInterval(fetchSalesTransactions, 30000);

    return () => clearInterval(id);
  }, [fetchSalesTransactions]);

  useEffect(() => {
    const id = setInterval(fetchPurchaseTransactions, 30000);

    return () => clearInterval(id);
  }, [fetchPurchaseTransactions]);

  useEffect(() => {
    const intervalMs = isAdminRole(activeUserRole) ? 10000 : 30000;
    const id = setInterval(refreshSystemSummary, intervalMs);

    return () => clearInterval(id);
  }, [activeUserRole, refreshSystemSummary]);

  useEffect(() => {
    if (!isAdminRole(activeUserRole)) return undefined;

    const refreshAdminAlerts = () => {
      refreshSystemSummary();
    };
    const handleStorage = event => {
      if (event.key === "registration-submitted-at") {
        refreshAdminAlerts();
      }
    };

    window.addEventListener("registration-submitted", refreshAdminAlerts);
    window.addEventListener("focus", refreshAdminAlerts);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("registration-submitted", refreshAdminAlerts);
      window.removeEventListener("focus", refreshAdminAlerts);
      window.removeEventListener("storage", handleStorage);
    };
  }, [activeUserRole, refreshSystemSummary]);

  useEffect(() => {
    if (!canPerformInventoryMovement(activeUserRole)) return undefined;

    const refreshApprovalRequests = () => {
      fetchInventoryChangeRequests();
      if (!isAdminRole(activeUserRole)) {
        fetchInventory({ showLoading: false });
      }
    };
    const handleStorage = event => {
      if (event.key === "inventory-change-request-submitted-at") {
        refreshApprovalRequests();
      }
    };

    refreshApprovalRequests();
    const intervalId = setInterval(refreshApprovalRequests, isAdminRole(activeUserRole) ? 15000 : 10000);
    window.addEventListener("inventory-change-request-submitted", refreshApprovalRequests);
    window.addEventListener("focus", refreshApprovalRequests);
    window.addEventListener("storage", handleStorage);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("inventory-change-request-submitted", refreshApprovalRequests);
      window.removeEventListener("focus", refreshApprovalRequests);
      window.removeEventListener("storage", handleStorage);
    };
  }, [activeUserRole, fetchInventory, fetchInventoryChangeRequests]);

  useEffect(() => {
    try {
      localStorage.setItem("dismissed_alert_ids", JSON.stringify(dismissedAlertIds));
    } catch {
      // Ignore storage write failures.
    }
  }, [dismissedAlertIds]);

  useEffect(() => {
    try {
      localStorage.setItem("read_alert_ids", JSON.stringify(readAlertIds));
    } catch {
      // Ignore storage write failures.
    }
  }, [readAlertIds]);

  const alerts = useMemo(() => {
    const inventoryAlerts = generateInventoryAlerts(inventory);
    const systemAlerts = generateSystemAlerts(systemSummary, activeUserRole);
    const supplierPaymentAlerts = generateSupplierPaymentAlerts(purchaseTransactions, activeUserRole);
    const reviewedRequestAlerts = generateReviewedInventoryRequestAlerts(inventoryChangeRequests, inventory, activeUserRole);
    return [...inventoryAlerts, ...systemAlerts, ...supplierPaymentAlerts, ...reviewedRequestAlerts]
      .filter(alert => !dismissedAlertIds.includes(alert.id))
      .map(alert => ({
        ...alert,
        read: readAlertIds.includes(alert.id)
      }))
      .sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1;
        const aTime = new Date(a.timestampRaw || a.timestamp || 0).getTime();
        const bTime = new Date(b.timestampRaw || b.timestamp || 0).getTime();
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      });
  }, [activeUserRole, dismissedAlertIds, inventory, inventoryChangeRequests, purchaseTransactions, readAlertIds, systemSummary]);

  const unreadAlertCount = alerts.filter(alert => !alert.read).length;
  const warningAlertCount = alerts.filter(alert => alert.type === "warning").length;
  const infoAlertCount = alerts.filter(alert => alert.type === "info").length;
  const successAlertCount = alerts.filter(alert => alert.type === "success").length;

  const auditAction = useCallback(async (action, target = {}) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      await axios.post(
        apiUrl("/api/audit-logs"),
        {
          action,
          target_id: target.targetId,
          target_name: target.targetName,
          target_type: target.targetType,
          reason: target.reason,
          details: target.details,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error("Failed to record audit log:", err);
    }
  }, []);

  const markAlertRead = (id) => {
    if (readAlertIds.includes(id)) return;

    const alert = alerts.find(item => item.id === id);
    setReadAlertIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    auditAction("MARK_ALERT_READ", {
      targetName: alert ? `${alert.title}: ${alert.message}` : `Alert ${id}`,
    });
  };

  const unmarkAlertRead = (id) => {
    setReadAlertIds(prev => prev.filter(alertId => alertId !== id));
  };

  const dismissAlert = (id) => {
    const alert = alerts.find(item => item.id === id);
    setDismissedAlertIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    auditAction("DISMISS_ALERT", {
      targetName: alert ? `${alert.title}: ${alert.message}` : `Alert ${id}`,
    });
  };

  const markAllAlertsRead = (targetAlertIds = null) => {
    const idsToMark = Array.isArray(targetAlertIds) ? targetAlertIds : alerts.map(alert => alert.id);
    setReadAlertIds(prev => Array.from(new Set([...prev, ...idsToMark])));
    auditAction("MARK_ALL_ALERTS_READ", {
      targetName: `${idsToMark.length} alert${idsToMark.length === 1 ? "" : "s"}`,
    });
  };

  const unmarkAllAlertsRead = (targetAlertIds = null) => {
    const idsToUnmark = Array.isArray(targetAlertIds) ? targetAlertIds : alerts.map(alert => alert.id);
    setReadAlertIds(prev => prev.filter(alertId => !idsToUnmark.includes(alertId)));
  };

  // Add new inventory item. The backend remains the source of truth for item
  // codes, audit logging, duplicate enforcement, and branch ownership.
  const addInventoryItem = async (item) => {
    const token = localStorage.getItem("token");
    const res = await axios.post(
      apiUrl("/api/inventory"),
      {
        name: item.name,
        category: item.category,
        category_note: item.categoryNote,
        supplier_name: item.supplierName,
        default_selling_price: item.defaultSellingPrice,
        cost_price: item.costPrice,
        stock_level: item.quantity,
        min_stock_level: item.reorderLevel,
        lead_time_days: item.leadTimeDays,
        safety_stock: item.safetyStock,
        average_daily_sales_mode: item.averageDailySalesMode || "auto",
        manual_average_daily_sales: item.manualAverageDailySales,
        average_daily_sales_override_reason: item.averageDailySalesOverrideReason,
        allow_similar_duplicate: Boolean(item.allowSimilarDuplicate),
      },
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    await fetchInventory();
    await fetchArchivedInventory();
    await fetchStockMovements();
    return res.data.product;
  };

  // Update inventory item for master-data edits and single-item movements.
  // Stock changes include movement metadata so audit trail and reports can
  // distinguish receiving, manual adjustment, and non-sales deduction activity.
  const updateInventoryItem = async (id, updates) => {
    const token = localStorage.getItem("token");
    // Optimistic UI update: only refresh the visible timestamp for stock quantity changes.
    // Name/category/reorder edits should not make existing stock alerts look newly created.
    setInventory((prev) =>
      prev.map((it) =>
        it.id === id
          ? (() => {
              const nextQuantity = typeof updates.quantity === 'number' ? updates.quantity : it.quantity;
              const nextReorderLevel = updates.reorderLevel ?? it.reorderLevel;
              const nextActiveThreshold = updates.activeLowStockThreshold ?? nextReorderLevel;
              const quantityChanged = nextQuantity !== it.quantity;
              return {
                ...it,
                name: updates.name ?? it.name,
                category: updates.category ?? it.category,
                categoryNote: updates.categoryNote ?? it.categoryNote,
                supplierName: updates.supplierName ?? it.supplierName,
                defaultSellingPrice: updates.defaultSellingPrice ?? it.defaultSellingPrice,
                costPrice: updates.costPrice ?? it.costPrice,
                quantity: nextQuantity,
                reorderLevel: nextReorderLevel,
                leadTimeDays: updates.leadTimeDays ?? it.leadTimeDays,
                safetyStock: updates.safetyStock ?? it.safetyStock,
                averageDailySales: updates.averageDailySales ?? it.averageDailySales,
                averageDailySalesMode: updates.averageDailySalesMode ?? it.averageDailySalesMode,
                manualAverageDailySales: updates.manualAverageDailySales ?? it.manualAverageDailySales,
                averageDailySalesOverrideReason: updates.averageDailySalesOverrideReason ?? it.averageDailySalesOverrideReason,
                recommendedReorderPoint: updates.recommendedReorderPoint ?? it.recommendedReorderPoint,
                activeLowStockThreshold: nextActiveThreshold,
                status: computeStockStatusFromLevels(nextQuantity, nextActiveThreshold),
                lastUpdated: quantityChanged ? new Date().toISOString() : it.lastUpdated,
              };
            })()
          : it
      )
    );

    try {
      const res = await axios.put(
        apiUrl(`/api/inventory/${id}`),
        {
          name: updates.name,
          category: updates.category,
          category_note: updates.categoryNote,
          supplier_name: updates.supplierName,
          default_selling_price: updates.defaultSellingPrice,
          cost_price: updates.costPrice,
          stock_level: updates.quantity,
          min_stock_level: updates.reorderLevel,
          lead_time_days: updates.leadTimeDays,
          safety_stock: updates.safetyStock,
          average_daily_sales_mode: updates.averageDailySalesMode,
          manual_average_daily_sales: updates.manualAverageDailySales,
          average_daily_sales_override_reason: updates.averageDailySalesOverrideReason,
          movement_action: updates.movementAction,
          movement_quantity: updates.movementQuantity,
          movement_reason: updates.movementReason,
          movement_note: updates.movementNote,
          expected_last_updated: updates.expectedLastUpdated,
          actual_transaction_at: updates.actualTransactionAt,
          backdate_reason: updates.backdateReason,
          allow_similar_duplicate: Boolean(updates.allowSimilarDuplicate),
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );

      // Re-sync with server to ensure canonical state after backend validation,
      // trigger-generated averages, item-code formatting, and audit writes.
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      return res.data.product;
    } catch (err) {
      // On error, reload from server to revert optimistic changes.
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      throw err;
    }
  };

  // Batch stock out handles verified non-sales deductions in one API call while
  // preserving one movement trail per affected item.
  const batchStockOut = async ({ items, movementReason, movementNote, actualTransactionAt, backdateReason }) => {
    const token = localStorage.getItem("token");
    try {
      const res = await axios.post(
        apiUrl("/api/inventory/batch-stock-out"),
        {
          items: items.map(item => ({
            inventory_id: item.inventoryId,
            quantity: item.quantity,
          })),
          movement_reason: movementReason,
          movement_note: movementNote,
          actual_transaction_at: actualTransactionAt,
          backdate_reason: backdateReason,
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      return res.data.products || [];
    } catch (err) {
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      throw err;
    }
  };

  // Batch stock adjustment handles verified increases that are not purchase
  // receipts, such as count corrections or owner-approved inventory adjustments.
  const batchStockAdjustment = async ({ items, movementReason, movementNote, actualTransactionAt, backdateReason }) => {
    const token = localStorage.getItem("token");
    try {
      const res = await axios.post(
        apiUrl("/api/inventory/batch-stock-adjustment"),
        {
          items: items.map(item => ({
            inventory_id: item.inventoryId,
            quantity: item.quantity,
          })),
          movement_reason: movementReason,
          movement_note: movementNote,
          actual_transaction_at: actualTransactionAt,
          backdate_reason: backdateReason,
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      return res.data.products || [];
    } catch (err) {
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      throw err;
    }
  };

  // Sales recording posts the entire checkout transaction so the backend can
  // atomically validate invoice sequence, deduct tracked stock, compute profit,
  // and write audit/history rows.
  const recordSale = async ({ officialInvoiceNumber, invoiceSequenceExceptionReason, customerType, customerName, customerTin, customerAddress, items, remarks, paymentMethod, discountType, discountAmount, deliveryCharge, amountReceived, paymentReference, paymentConfirmed, actualTransactionAt, backdateReason }) => {
    const token = localStorage.getItem("token");
    try {
      const res = await axios.post(
        apiUrl("/api/sales"),
        {
          official_invoice_number: officialInvoiceNumber,
          invoice_sequence_exception_reason: invoiceSequenceExceptionReason,
          customer_type: customerType,
          customer_name: customerName,
          customer_tin: customerTin,
          customer_address: customerAddress,
          remarks,
          payment_method: paymentMethod,
          discount_type: discountType,
          discount_amount: discountAmount,
          delivery_charge: deliveryCharge,
          amount_received: amountReceived,
          payment_reference: paymentReference,
          payment_confirmed: paymentConfirmed,
          actual_transaction_at: actualTransactionAt,
          backdate_reason: backdateReason,
          items: items.map(item => ({
            inventory_id: item.inventoryId,
            item_type: item.isManual ? 'non_inventory' : 'inventory',
            is_manual: Boolean(item.isManual),
            item_name: item.itemName,
            category: item.category,
            category_note: item.categoryNote,
            quantity: item.quantity,
            unit_price: item.unitPrice,
          })),
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      await fetchSalesTransactions();
      await fetchPurchaseTransactions();
      return mapSalesTransaction(res.data.sale || {});
    } catch (err) {
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      await fetchSalesTransactions();
      await fetchPurchaseTransactions();
      throw err;
    }
  };

  // Refunds are separate transactions linked to the original sale. The backend
  // restores eligible tracked stock and prevents over-refunding prior quantities.
  const refundSale = async ({
    saleId,
    items,
    refundReason,
    itemCondition,
    restockDecision,
    refundPolicyAcknowledged,
    actualTransactionAt,
    backdateReason
  }) => {
    const token = localStorage.getItem("token");
    try {
      const res = await axios.post(
        apiUrl(`/api/sales/${saleId}/refund`),
        {
          refund_reason: refundReason,
          item_condition: itemCondition,
          restock_decision: restockDecision,
          refund_policy_acknowledged: refundPolicyAcknowledged,
          actual_transaction_at: actualTransactionAt,
          backdate_reason: backdateReason,
          items: items.map(item => ({
            sales_item_id: item.salesItemId,
            quantity: item.quantity,
            refund_amount: item.refundAmount,
          })),
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      await fetchSalesTransactions();
      await fetchPurchaseTransactions();
      return mapSalesTransaction(res.data.sale || {});
    } catch (err) {
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      await fetchSalesTransactions();
      await fetchPurchaseTransactions();
      throw err;
    }
  };

  // Purchase receiving posts supplier document details and line costs together
  // so stock, average costs, supplier payments, and movement history stay aligned.
  const recordPurchase = async ({ supplierName, documentType, documentTypeNote, documentNumber, paymentTerms, creditTermsDays, remarks, items, actualTransactionAt, backdateReason }) => {
    const token = localStorage.getItem("token");
    try {
      const res = await axios.post(
        apiUrl("/api/purchases"),
        {
          supplier_name: supplierName,
          document_type: documentType,
          document_type_note: documentTypeNote,
          document_number: documentNumber,
          payment_terms: paymentTerms,
          credit_terms_days: creditTermsDays,
          remarks,
          actual_transaction_at: actualTransactionAt,
          backdate_reason: backdateReason,
          items: items.map(item => ({
            inventory_id: item.inventoryId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
          })),
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      await fetchPurchaseTransactions();
      return mapPurchaseTransaction(res.data.purchase || {});
    } catch (err) {
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      await fetchPurchaseTransactions();
      throw err;
    }
  };

  // Payment updates refresh both purchase history and supplier-payment alerts so
  // paid credit purchases stop appearing as actionable follow-ups.
  const updatePurchasePaymentStatus = async (purchaseId, paymentStatus) => {
    const token = localStorage.getItem("token");
    try {
      const normalizedPurchaseId = String(purchaseId || '').trim();
      if (!normalizedPurchaseId) {
        throw new Error('Purchase record is missing its system reference.');
      }
      const res = await axios.post(
        apiUrl(`/api/purchases/${encodeURIComponent(normalizedPurchaseId)}/payment-status`),
        { payment_status: paymentStatus },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const supplierPaymentAlertPrefix = `supplier-payment-${purchaseId}-`;
      setDismissedAlertIds(prev => prev.filter(id => !String(id).startsWith(supplierPaymentAlertPrefix)));
      setReadAlertIds(prev => prev.filter(id => !String(id).startsWith(supplierPaymentAlertPrefix)));
      await fetchPurchaseTransactions();
      return mapPurchaseTransaction(res.data.purchase || {});
    } catch (err) {
      await fetchPurchaseTransactions();
      throw err;
    }
  };

  // Sale cancellation is an admin-level reversal of the full sale. Partial
  // customer returns should use refund records instead.
  const cancelSale = async (saleId, cancelReason) => {
    const token = localStorage.getItem("token");
    try {
      const res = await axios.post(
        apiUrl(`/api/sales/${saleId}/cancel`),
        { cancel_reason: cancelReason },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      await fetchSalesTransactions();
      return mapSalesTransaction(res.data.sale || {});
    } catch (err) {
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      await fetchSalesTransactions();
      throw err;
    }
  };

  // Archive inventory item without deleting its historical references. Reports,
  // sales history, purchases, and stock movements can still resolve the record.
  const archiveInventoryItem = async (id, archiveReason, archiveReasonNote = "") => {
    const token = localStorage.getItem("token");

    try {
      await axios.delete(apiUrl(`/api/inventory/${id}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        data: {
          archive_reason: archiveReason,
          archive_reason_note: archiveReasonNote,
        },
      });
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
    } catch (err) {
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      throw err;
    }
  };

  const restoreArchivedInventoryItem = async (id) => {
    const token = localStorage.getItem("token");

    try {
      const res = await axios.post(
        apiUrl(`/api/archive/${id}/restore`),
        {},
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      return res.data.product;
    } catch (err) {
      await fetchInventory();
      await fetchArchivedInventory();
      await fetchStockMovements();
      throw err;
    }
  };

  return (
    <DataContext.Provider
      value={{
        inventory,
        setInventory,
        archivedInventory,
        setArchivedInventory,
        stockMovements,
        salesTransactions,
        purchaseTransactions,
        inventoryChangeRequests,
        fetchStockMovements,
        fetchSalesTransactions,
        getNextSalesInvoiceNumber,
        fetchPurchaseTransactions,
        fetchInventoryChangeRequests,
        users,
        setUsers,
        loadingInventory,
        inventoryError,
        fetchInventory,
        fetchArchivedInventory,
        addInventoryItem,
        updateInventoryItem,
        submitInventoryChangeRequest,
        reviewInventoryChangeRequest,
        batchStockAdjustment,
        batchStockOut,
        recordSale,
        refundSale,
        recordPurchase,
        updatePurchasePaymentStatus,
        cancelSale,
        archiveInventoryItem,
        restoreArchivedInventoryItem,
        alerts,
        systemSummary,
        unreadAlertCount,
        warningAlertCount,
        infoAlertCount,
        successAlertCount,
        markAlertRead,
        dismissAlert,
        markAllAlertsRead,
        unmarkAllAlertsRead,
        unmarkAlertRead,
        auditAction,
        refreshSystemSummary,
        updateDailySalesTarget,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}
