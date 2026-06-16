/**
 * Profitability Helpers
 *
 * Calculates actual earnings for dashboards and reports using sale-time cost
 * snapshots. Keeping this logic in one utility prevents each report from
 * making slightly different assumptions about discounts, delivery charges, and
 * historical item costs.
 */
import { isCancelledSale } from './salesTransactionStatus';

const toNumber = value => {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const roundMoney = value => Number(toNumber(value).toFixed(2));

export const getSaleLineProfit = (sale, item) => {
  const lineSubtotal = roundMoney(item?.subtotal);
  const saleSubtotal = roundMoney(sale?.subtotalAmount ?? sale?.subtotal_amount ?? sale?.totalAmount);
  const discountAmount = roundMoney(sale?.discountAmount ?? sale?.discount_amount);
  // Allocate transaction-level discounts proportionally to each line so item
  // profit reports match the final amount the customer actually paid.
  const discountShare = saleSubtotal === 0
    ? 0
    : roundMoney((lineSubtotal / saleSubtotal) * discountAmount);
  const netSales = roundMoney(lineSubtotal - discountShare);
  // Prefer stored cost snapshots from the completed sale. The fallback supports
  // older records that only stored quantity and unit cost at sale time.
  const storedCost = item?.costSubtotal ?? item?.cost_subtotal;
  const costUsed = storedCost === null || storedCost === undefined
    ? roundMoney(toNumber(item?.quantitySold ?? item?.quantity_sold) * toNumber(item?.unitCostAtSale ?? item?.unit_cost_at_sale))
    : roundMoney(storedCost);
  const actualProfit = roundMoney(netSales - costUsed);
  const profitMargin = Math.abs(netSales) > 0
    ? Number(((actualProfit / Math.abs(netSales)) * 100).toFixed(2))
    : 0;

  return {
    grossSales: lineSubtotal,
    discountShare,
    netSales,
    puhunanUsed: costUsed,
    actualProfit,
    profitMargin
  };
};

export const getProfitabilitySummary = (sales = []) =>
  (sales || []).reduce((summary, sale) => {
    if (!sale || isCancelledSale(sale)) return summary;

    const deliveryCharge = roundMoney(sale?.deliveryCharge ?? sale?.delivery_charge);
    (sale.items || []).forEach(item => {
      const line = getSaleLineProfit(sale, item);
      summary.totalSales = roundMoney(summary.totalSales + line.netSales);
      summary.puhunanUsed = roundMoney(summary.puhunanUsed + line.puhunanUsed);
      summary.actualProfit = roundMoney(summary.actualProfit + line.actualProfit);
      summary.unitsSold += toNumber(item.quantitySold ?? item.quantity_sold);
    });

    // Delivery fees are treated as revenue in summary profit because they are
    // part of the collected sale total and have no tracked item cost here.
    summary.deliveryCharges = roundMoney(summary.deliveryCharges + deliveryCharge);
    summary.totalSales = roundMoney(summary.totalSales + deliveryCharge);
    summary.actualProfit = roundMoney(summary.actualProfit + deliveryCharge);

    return {
      ...summary,
      profitMargin: Math.abs(summary.totalSales) > 0
        ? Number(((summary.actualProfit / Math.abs(summary.totalSales)) * 100).toFixed(2))
        : 0
    };
  }, {
    totalSales: 0,
    puhunanUsed: 0,
    actualProfit: 0,
    profitMargin: 0,
    unitsSold: 0,
    deliveryCharges: 0
  });

export const getProductProfitability = (sales = []) => {
  const groupedProducts = new Map();

  (sales || []).forEach(sale => {
    if (!sale || isCancelledSale(sale)) return;

    (sale.items || []).forEach(item => {
      const itemName = String(item.itemName || item.item_name || '').trim();
      if (!itemName) return;

      // Inventory items group by stable inventory id. Manual/non-inventory
      // lines fall back to normalized name and category for report continuity.
      const key = item.inventoryId || item.inventory_id
        ? `inventory:${item.inventoryId || item.inventory_id}`
        : `item:${itemName.toLowerCase()}|${String(item.category || 'Other').toLowerCase()}`;
      const existing = groupedProducts.get(key) || {
        itemName,
        category: item.category || 'Other',
        quantitySold: 0,
        totalSales: 0,
        puhunanUsed: 0,
        actualProfit: 0,
        profitMargin: 0
      };
      const line = getSaleLineProfit(sale, item);

      existing.quantitySold += toNumber(item.quantitySold ?? item.quantity_sold);
      existing.totalSales = roundMoney(existing.totalSales + line.netSales);
      existing.puhunanUsed = roundMoney(existing.puhunanUsed + line.puhunanUsed);
      existing.actualProfit = roundMoney(existing.actualProfit + line.actualProfit);
      existing.profitMargin = Math.abs(existing.totalSales) > 0
        ? Number(((existing.actualProfit / Math.abs(existing.totalSales)) * 100).toFixed(2))
        : 0;

      groupedProducts.set(key, existing);
    });
  });

  return Array.from(groupedProducts.values())
    .sort((a, b) => b.actualProfit - a.actualProfit || b.totalSales - a.totalSales || a.itemName.localeCompare(b.itemName));
};
