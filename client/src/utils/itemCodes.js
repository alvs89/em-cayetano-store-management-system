const CATEGORY_CODES = {
  Tools: "TOL",
  Electrical: "ELE",
  Cement: "CEM",
  Paint: "PNT",
  Plumbing: "PLB",
  Fasteners: "FAS",
  Lumber: "LBR",
  Safety: "SFT",
  Construction: "CON",
  Hardware: "HRD",
  "Office Supplies": "OFC",
  Other: "OTH"
};

const TYPE_KEYWORDS = [
  ["circuit breaker", "CIR"],
  ["claw hammer", "HAM"],
  ["ball peen hammer", "HAM"],
  ["hammer", "HAM"],
  ["wrench", "WRE"],
  ["screwdriver", "SCR"],
  ["screw", "SCR"],
  ["common nail", "NAI"],
  ["nail", "NAI"],
  ["bolt", "BLT"],
  ["blind rivet", "RIV"],
  ["rivet", "RIV"],
  ["portland cement", "POR"],
  ["cement", "CEM"],
  ["white paint", "WHT"],
  ["paint", "PNT"],
  ["primer", "PRI"],
  ["pvc pipe", "PVC"],
  ["pipe", "PIP"],
  ["faucet", "FAU"],
  ["coco lumber", "COC"],
  ["plywood", "PLY"],
  ["lumber", "LBR"],
  ["safety gloves", "GLO"],
  ["gloves", "GLO"],
  ["dust mask", "MSK"],
  ["mask", "MSK"],
  ["electrical tape", "TAP"],
  ["tape", "TAP"],
  ["wire", "WIR"],
  ["bulb", "BLB"],
  ["hinge", "HNG"],
  ["padlock", "PAD"],
  ["handle", "HDL"],
  ["angle bar", "ANG"],
  ["bar", "BAR"]
];

const padSequence = value => String(Number(value) || 0).padStart(4, "0");

const cleanName = value => String(value || "")
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const getCategoryCode = category => CATEGORY_CODES[String(category || "").trim()] || "ITM";

const getTypeCode = name => {
  const normalized = cleanName(name);
  const match = TYPE_KEYWORDS.find(([keyword]) => normalized.includes(keyword));
  if (match) return match[1];

  const fallback = normalized
    .split(/\s+/)
    .find(word => /[a-z]/.test(word) && !/^\d/.test(word));

  return (fallback || "GEN").slice(0, 3).toUpperCase().padEnd(3, "X");
};

export const formatItemCode = item => {
  const sequence = item?.productId || item?.product_id || item?.id || item?.inventory_id;
  return `${getCategoryCode(item?.category)}-${getTypeCode(item?.name)}-${padSequence(sequence)}`;
};

export const formatArchiveReferenceId = (archiveId, archivedAt) => {
  const year = archivedAt ? new Date(archivedAt).getFullYear() : new Date().getFullYear();
  return `ARC-${Number.isFinite(year) ? year : new Date().getFullYear()}-${padSequence(archiveId)}`;
};
