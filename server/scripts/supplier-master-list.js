// Master supplier reference list and matching helpers used by inventory,
// purchase entry, and demo-data refresh scripts.
const OFFICIAL_SUPPLIERS = [
  'ALVIN B LAVENTE',
  'AMULET MARKETING CORP',
  'BELJEM CONSTRUCTION SUPPLIES TRADING',
  'BEST POWER TRADING',
  'BOWMAN BUILDERS CORP',
  'CMA COMMERCIAL TRADING CORP',
  'CRYSTALITE',
  'DGM',
  'EXCELIN MARKETING OPC',
  'FIREFLY',
  'HODIENG',
  'HYZ STEEL TRADING',
  'LPMP TRADING',
  'MAC STEVE MARKETING',
  'ONE SAMEX DEVT CORP',
  'OPTIMAL TRADING',
  'PHT GEN MDSE',
  'PNM MARKETING',
  'QUALISTEEL ENTERPRISES',
  'ROYU',
  'SAKRETE ENTERPRISES INC',
  'THUNDER CRACKER MARKETING CORP',
  'TWINBAR METAL INDUSTRIES INC',
  'WEBERT MARKETING CORP',
  'WINACE TRADING & CONSTRUCTION SUPPLY'
];

const normalizeSupplierName = value =>
  String(value || '').trim().replace(/\s+/g, ' ');

const CATEGORY_SUPPLIERS = {
  Roofing: 'TWINBAR METAL INDUSTRIES INC',
  'PVC Pipe / Fittings': 'OPTIMAL TRADING',
  Steel: 'HYZ STEEL TRADING',
  'Kiln Dry': 'BELJEM CONSTRUCTION SUPPLIES TRADING',
  Plywood: 'BOWMAN BUILDERS CORP',
  Electricals: 'BEST POWER TRADING',
  Paints: 'AMULET MARKETING CORP',
  Other: 'PHT GEN MDSE'
};

const FALLBACK_SUPPLIERS = [
  'PHT GEN MDSE',
  'WINACE TRADING & CONSTRUCTION SUPPLY',
  'CMA COMMERCIAL TRADING CORP',
  'MAC STEVE MARKETING',
  'LPMP TRADING',
  'WEBERT MARKETING CORP'
];

const getOfficialSupplierName = value => {
  const normalized = normalizeSupplierName(value);
  if (!normalized) return '';
  if (OFFICIAL_SUPPLIERS.includes(normalized)) return normalized;
  return '';
};

const getOfficialSupplierForProduct = (item, index = 0) => {
  const name = String(item?.name || '').toUpperCase();
  const category = item?.category || 'Other';

  // Keep a small, deliberate group unassigned for client verification and UI testing.
  if ((index + 1) % 13 === 0) return null;

  if (name.includes('ROYU')) return 'ROYU';
  if (name.includes('FIREFLY')) return 'FIREFLY';
  if (name.includes('NELTEX')) return 'OPTIMAL TRADING';
  if (name.includes('THUNDERBOLT')) return 'THUNDER CRACKER MARKETING CORP';
  if (name.includes('BOYSEN')) return 'AMULET MARKETING CORP';
  if (name.includes('PHELPS DODGE')) return 'PNM MARKETING';
  if (name.includes('CRYSTALITE') || name.includes('POLYCARBONATE') || name.includes('FIBER GLASS')) return 'CRYSTALITE';
  if (name.includes('SAKRETE') || name.includes('CEMENT')) return 'SAKRETE ENTERPRISES INC';
  if (name.includes('C-PURLINS') || name.includes('ANGLE BAR') || name.includes('FLAT BAR') || name.includes('TUBULAR')) return 'HYZ STEEL TRADING';
  if (name.includes('WIRE') || name.includes('STEEL MATTING') || name.includes('GI PIPE')) return 'QUALISTEEL ENTERPRISES';
  if (name.includes('PANEL BOX') || name.includes('BREAKER') || name.includes('FUSE') || name.includes('NEMA')) return 'BEST POWER TRADING';
  if (name.includes('LAMP') || name.includes('FLOURESCENT') || name.includes('CIRCULAR')) return 'FIREFLY';
  if (name.includes('PVC PIPE') || name.includes('ELBOW') || name.includes('COUPLING') || name.includes('TEE') || name.includes('WYE')) return 'OPTIMAL TRADING';
  if (name.includes('COCO') || name.includes('ECO 4')) return 'WINACE TRADING & CONSTRUCTION SUPPLY';
  if (name.includes('PLYWOOD') || name.includes('MARINE') || name.includes('PHENOLIC') || name.includes('SHERA')) return 'BOWMAN BUILDERS CORP';
  if (name.includes('LONG SPAN') || name.includes('CORRUGATED') || name.includes('GUTTER') || name.includes('PLAIN SHEET')) return 'TWINBAR METAL INDUSTRIES INC';

  return CATEGORY_SUPPLIERS[category] || FALLBACK_SUPPLIERS[index % FALLBACK_SUPPLIERS.length];
};

module.exports = {
  OFFICIAL_SUPPLIERS,
  getOfficialSupplierName,
  getOfficialSupplierForProduct,
  normalizeSupplierName
};
