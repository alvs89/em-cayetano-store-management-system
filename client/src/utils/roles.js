// Role helpers centralize screen access and legacy role normalization so all
// modules enforce the same owner-level admin, Cashier, and Inventory Staff permissions.
export const ROLE_VALUES = {
  ADMIN: "Admin",
  CASHIER: "Cashier",
  INVENTORY_STAFF: "Inventory Staff",
  LEGACY_EMPLOYEE: "Employee",
};

export const ROLE_OPTIONS = [
  {
    value: ROLE_VALUES.ADMIN,
    label: "Admin / Owner",
    description: "Business owner or authorized owner-level access for users, reports, audit trail, maintenance, and full inventory control.",
  },
  {
    value: ROLE_VALUES.CASHIER,
    label: "Cashier / Encoder",
    description: "Records customer sales and receipt-based data entry for the assigned branch.",
  },
  {
    value: ROLE_VALUES.INVENTORY_STAFF,
    label: "Inventory Staff",
    description: "Handles stock checking, supplier purchase entries, stock in, stock out, alerts, and inventory reports.",
  },
];

export const REPORT_TYPE_OPTIONS = [
  { value: "summary", label: "Summary", roles: [ROLE_VALUES.ADMIN, ROLE_VALUES.INVENTORY_STAFF] },
  { value: "detailed", label: "Detailed Inventory", roles: [ROLE_VALUES.ADMIN, ROLE_VALUES.INVENTORY_STAFF] },
  { value: "low-stock", label: "Low Stock Alert", roles: [ROLE_VALUES.ADMIN, ROLE_VALUES.INVENTORY_STAFF] },
  { value: "supplier-reorder", label: "Supplier Reorder Report", roles: [ROLE_VALUES.ADMIN, ROLE_VALUES.INVENTORY_STAFF] },
  { value: "untracked-sales", label: "Untracked Sales Items", roles: [ROLE_VALUES.ADMIN, ROLE_VALUES.INVENTORY_STAFF] },
  { value: "category", label: "Category Analysis", roles: [ROLE_VALUES.ADMIN, ROLE_VALUES.INVENTORY_STAFF] },
  { value: "purchases", label: "Purchases", roles: [ROLE_VALUES.ADMIN, ROLE_VALUES.INVENTORY_STAFF] },
  { value: "movements", label: "Stock Movement History", roles: [ROLE_VALUES.ADMIN, ROLE_VALUES.INVENTORY_STAFF] },
  { value: "actual-earnings", label: "Actual Earnings", roles: [ROLE_VALUES.ADMIN] },
  { value: "sales-movements", label: "Sales-Based Stock Movement", roles: [ROLE_VALUES.ADMIN] },
];

export function normalizeRole(role) {
  if (role === ROLE_VALUES.LEGACY_EMPLOYEE) return ROLE_VALUES.INVENTORY_STAFF;
  return role || "";
}

export function getRoleLabel(role) {
  const normalized = normalizeRole(role);
  if (normalized === ROLE_VALUES.ADMIN) return "Admin / Owner";
  if (normalized === ROLE_VALUES.CASHIER) return "Cashier / Encoder";
  if (normalized === ROLE_VALUES.INVENTORY_STAFF) return "Inventory Staff";
  return role || "User";
}

export function isAdminRole(role) {
  return normalizeRole(role) === ROLE_VALUES.ADMIN;
}

export function canAccessScreen(role, screen) {
  const normalized = normalizeRole(role);
  const commonScreens = new Set(["dashboard", "search", "alerts", "help"]);

  if (commonScreens.has(screen)) return true;
  if (normalized === ROLE_VALUES.ADMIN) return true;

  if (normalized === ROLE_VALUES.CASHIER) {
    return ["inventory", "sales"].includes(screen);
  }

  if (normalized === ROLE_VALUES.INVENTORY_STAFF) {
    return ["inventory", "archive", "reports", "purchases"].includes(screen);
  }

  return false;
}

export function canManageInventory(role) {
  return normalizeRole(role) === ROLE_VALUES.ADMIN;
}

export function canRecordSales(role) {
  const normalized = normalizeRole(role);
  return normalized === ROLE_VALUES.ADMIN || normalized === ROLE_VALUES.CASHIER;
}

export function canPerformInventoryMovement(role) {
  const normalized = normalizeRole(role);
  return normalized === ROLE_VALUES.ADMIN || normalized === ROLE_VALUES.INVENTORY_STAFF;
}

export function getReportTypeOptionsForRole(role) {
  const normalized = normalizeRole(role);
  return REPORT_TYPE_OPTIONS.filter(option => option.roles.includes(normalized));
}

export function canAccessReportType(role, reportType) {
  const normalized = normalizeRole(role);
  const option = REPORT_TYPE_OPTIONS.find(item => item.value === reportType);
  return Boolean(option && option.roles.includes(normalized));
}

export function getDefaultReportTypeForRole(role) {
  return getReportTypeOptionsForRole(role)[0]?.value || "summary";
}
