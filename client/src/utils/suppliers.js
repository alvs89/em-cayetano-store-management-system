export const SUPPLIER_CUSTOM_VALUE = "__custom_supplier__";

export const HARDWARE_SUPPLIER_OPTIONS = [
  "One Samix",
  "Susi Hardware",
  "Rizal Industrial",
  "Metro Hardware Supply",
  "Cebu Atlantic Hardware",
  "Wilcon Depot",
  "Handyman",
  "Ace Hardware",
  "Davies Paints",
  "Boysen Paints",
  "Holcim Philippines",
  "Republic Cement",
  "Phelps Dodge Wires",
  "Neltex Development"
];

export const normalizeSupplierName = value =>
  String(value || "").trim().replace(/\s+/g, " ");

export const isListedSupplier = value =>
  HARDWARE_SUPPLIER_OPTIONS.includes(normalizeSupplierName(value));

export const getSupplierSelectValue = (value, mode = "listed") => {
  const supplierName = normalizeSupplierName(value);
  if (mode === "custom" || (supplierName && !isListedSupplier(supplierName))) {
    return SUPPLIER_CUSTOM_VALUE;
  }
  return isListedSupplier(supplierName) ? supplierName : "";
};

export const sanitizeSupplierInput = value =>
  String(value ?? "").replace(/[^A-Za-z0-9\u00C0-\u00FF #./,'"()&+_-]/g, "").slice(0, 120);
