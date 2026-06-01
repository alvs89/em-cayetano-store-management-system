// Central stock movement reason labels keep Inventory, Reports, and Audit Trail
// terminology aligned with backend inventory movement validation.
export const STOCK_OUT_REASON_OPTIONS = [
  { value: "sales", label: "Sales", description: "Stock deducted automatically after a completed sales transaction." },
  { value: "damaged", label: "Damaged", description: "Items removed because they can no longer be sold." },
  { value: "supplier_return", label: "Supplier Return / Reject", description: "Defective items removed because they will be returned to the supplier." },
  { value: "expired", label: "Expired", description: "Items removed because they are past their usable date." },
  { value: "lost_missing", label: "Lost/Missing", description: "Items missing after checking actual stock." },
  { value: "manual_adjustment", label: "Manual Adjustment", description: "Stock corrected after a verified count." },
  { value: "branch_transfer", label: "Branch Transfer", description: "Items moved to another branch." },
  { value: "correction", label: "Correction", description: "System correction or administrative inventory adjustment." }
];

export const STOCK_IN_REASON_OPTIONS = [
  { value: "delivery_received", label: "Delivery Received", description: "New stock received from a supplier or delivery." },
  { value: "purchase_received", label: "Purchase Received", description: "Stock added through a supplier purchase entry." },
  { value: "returned_item", label: "Returned Item", description: "Returned items added back after checking their condition." },
  { value: "customer_refund", label: "Customer Refund", description: "Returned customer items added back after refund validation." },
  { value: "supplier_replacement", label: "Supplier Replacement", description: "Replacement item received from supplier at no extra charge." },
  { value: "beginning_balance", label: "Beginning Balance", description: "Starting stock entered during setup or inventory reset." },
  { value: "manual_adjustment", label: "Manual Adjustment", description: "Stock corrected after a verified count." },
  { value: "sales_cancellation", label: "Cancellation", description: "Stock restored after a sales cancellation." },
  { value: "correction", label: "Correction", description: "System correction or administrative inventory adjustment." },
  { value: "found_stock", label: "Found Stock", description: "Items found during checking that were not reflected in the system." }
];

export const MANUAL_STOCK_IN_REASON_OPTIONS = STOCK_IN_REASON_OPTIONS.filter(
  option => option.value !== "delivery_received" && option.value !== "purchase_received"
);

export const MANUAL_STOCK_OUT_REASON_OPTIONS = STOCK_OUT_REASON_OPTIONS.filter(
  option => option.value !== "sales" && option.value !== "correction"
);

const stockInReasonLabels = new Map(STOCK_IN_REASON_OPTIONS.map(option => [option.value, option.label]));
const stockOutReasonLabels = new Map(STOCK_OUT_REASON_OPTIONS.map(option => [option.value, option.label]));

const formatUnknownReason = value => String(value || "")
  .trim()
  .replace(/[_-]+/g, " ")
  .replace(/\s+/g, " ")
  .replace(/\b\w/g, char => char.toUpperCase());

export const getStockInReasonLabel = reason =>
  stockInReasonLabels.get(String(reason || "").trim().toLowerCase()) || "";

export const getStockOutReasonLabel = reason =>
  stockOutReasonLabels.get(String(reason || "").trim().toLowerCase()) || "";

export const getStockMovementReasonLabel = (reason, action = null) => {
  const normalizedReason = String(reason || "").trim().toLowerCase();
  const normalizedAction = String(action || "").trim().toLowerCase();

  if (!normalizedReason) return "-";
  if (normalizedAction === "stock_in") return getStockInReasonLabel(normalizedReason) || formatUnknownReason(normalizedReason) || "-";
  if (normalizedAction === "stock_out") return getStockOutReasonLabel(normalizedReason) || formatUnknownReason(normalizedReason) || "-";

  return getStockInReasonLabel(normalizedReason)
    || getStockOutReasonLabel(normalizedReason)
    || formatUnknownReason(normalizedReason)
    || "-";
};
