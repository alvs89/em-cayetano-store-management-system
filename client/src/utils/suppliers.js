export const SUPPLIER_CUSTOM_VALUE = "__custom_supplier__";

export const HARDWARE_SUPPLIER_OPTIONS = [
  "ALVIN B LAVENTE",
  "AMULET MARKETING CORP",
  "BELJEM CONSTRUCTION SUPPLIES TRADING",
  "BEST POWER TRADING",
  "BOWMAN BUILDERS CORP",
  "CMA COMMERCIAL TRADING CORP",
  "CRYSTALITE",
  "DGM",
  "EXCELIN MARKETING OPC",
  "FIREFLY",
  "HODIENG",
  "HYZ STEEL TRADING",
  "LPMP TRADING",
  "MAC STEVE MARKETING",
  "ONE SAMEX DEVT CORP",
  "OPTIMAL TRADING",
  "PHT GEN MDSE",
  "PNM MARKETING",
  "QUALISTEEL ENTERPRISES",
  "ROYU",
  "SAKRETE ENTERPRISES INC",
  "THUNDER CRACKER MARKETING CORP",
  "TWINBAR METAL INDUSTRIES INC",
  "WEBERT MARKETING CORP",
  "WINACE TRADING & CONSTRUCTION SUPPLY"
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
