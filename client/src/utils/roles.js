export const ROLE_VALUES = {
  ADMIN: "Admin",
  CASHIER: "Cashier",
  INVENTORY_STAFF: "Inventory Staff",
  LEGACY_EMPLOYEE: "Employee",
};

export const ROLE_OPTIONS = [
  {
    value: ROLE_VALUES.ADMIN,
    label: "Admin / Manager",
    description: "Full system access, user management, reports, maintenance, and audit trail.",
  },
  {
    value: ROLE_VALUES.CASHIER,
    label: "Cashier",
    description: "Records customer sales and POS transactions for the assigned branch.",
  },
  {
    value: ROLE_VALUES.INVENTORY_STAFF,
    label: "Inventory Staff",
    description: "Handles inventory checking, stock in, stock out, alerts, and inventory reports.",
  },
];

export function normalizeRole(role) {
  if (role === ROLE_VALUES.LEGACY_EMPLOYEE) return ROLE_VALUES.INVENTORY_STAFF;
  return role || "";
}

export function getRoleLabel(role) {
  const normalized = normalizeRole(role);
  if (normalized === ROLE_VALUES.ADMIN) return "Admin / Manager";
  if (normalized === ROLE_VALUES.CASHIER) return "Cashier";
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
    return ["inventory", "archive", "reports"].includes(screen);
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
