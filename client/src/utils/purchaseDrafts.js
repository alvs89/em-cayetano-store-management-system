// Purchase draft helpers centralize the reorder-to-purchase handoff so reports
// can prepare receiving worksheets without directly changing inventory stock.
export const PURCHASE_DRAFT_STORAGE_KEY = "emc_purchase_reorder_draft";
export const PURCHASE_DRAFT_EVENT = "emc-purchase-draft-updated";

const normalizePositiveQuantity = value => {
  const quantity = Math.floor(Number(value || 0));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
};

const normalizeUnitCost = value => {
  const cost = Number(value || 0);
  return Number.isFinite(cost) && cost > 0 ? cost.toFixed(2) : "";
};

export const buildPurchaseDraftFromReorderGroup = ({
  supplier,
  items,
  getPreparedQuantity,
  branch,
  user,
}) => {
  const draftItems = (items || [])
    .map(item => {
      const quantity = normalizePositiveQuantity(
        typeof getPreparedQuantity === "function"
          ? getPreparedQuantity(item)
          : item?.neededQuantity
      );

      if (!item?.id || quantity <= 0) return null;

      return {
        inventoryId: String(item.id),
        itemCode: item.itemCode || "",
        itemName: item.name || "Inventory item",
        category: item.category || "Uncategorized",
        currentQuantity: Number(item.quantity || 0),
        reorderLevel: Number(item.lowStockThreshold ?? item.reorderLevel ?? 0),
        suggestedQuantity: Number(item.neededQuantity || quantity),
        quantity: String(quantity),
        unitCost: normalizeUnitCost(item.costPrice),
      };
    })
    .filter(Boolean);

  return {
    id: `purchase-draft-${Date.now()}`,
    source: "supplier-reorder",
    sourceLabel: "Supplier Reorder Report",
    supplierName: String(supplier || "").trim(),
    branch: branch || "",
    createdAt: new Date().toISOString(),
    createdBy: user?.fullName || user?.username || "System user",
    remarks: "",
    items: draftItems,
  };
};

export const savePurchaseDraft = draft => {
  localStorage.setItem(PURCHASE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  window.dispatchEvent(new CustomEvent(PURCHASE_DRAFT_EVENT, { detail: draft }));
};

export const loadPurchaseDraft = () => {
  try {
    const rawDraft = localStorage.getItem(PURCHASE_DRAFT_STORAGE_KEY);
    if (!rawDraft) return null;
    const parsedDraft = JSON.parse(rawDraft);
    return parsedDraft && Array.isArray(parsedDraft.items) ? parsedDraft : null;
  } catch {
    return null;
  }
};

export const clearPurchaseDraft = () => {
  localStorage.removeItem(PURCHASE_DRAFT_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(PURCHASE_DRAFT_EVENT, { detail: null }));
};
