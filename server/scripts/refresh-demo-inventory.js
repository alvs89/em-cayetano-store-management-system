require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const { buildEmCayetanoCatalog } = require('./em-cayetano-catalog');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined
});

const BRANCHES = ['Manggahan', 'San Rafael'];

const CATEGORY_SUPPLIERS = {
  Roofing: 'Metro Hardware Supply',
  'PVC Pipe / Fittings': 'Neltex Development',
  Steel: 'Rizal Industrial',
  'Kiln Dry': 'Cebu Atlantic Hardware',
  Plywood: 'Cebu Atlantic Hardware',
  Electricals: 'Phelps Dodge Wires',
  Paints: 'Boysen Paints',
  Other: 'Wilcon Depot'
};

const CATALOG = buildEmCayetanoCatalog();

if (CATALOG.length === 0) {
  throw new Error('E.M. Cayetano product catalog is empty.');
}

const getSupplierForItem = (item, index) => {
  const name = String(item.name || '').toUpperCase();
  if ((index + 1) % 13 === 0) return null;
  if (name.includes('NELTEX')) return 'Neltex Development';
  if (name.includes('BOYSEN')) return 'Boysen Paints';
  if (name.includes('PHELPS DODGE')) return 'Phelps Dodge Wires';
  if (name.includes('ROYU')) return 'Metro Hardware Supply';
  if (name.includes('APO')) return 'Metro Hardware Supply';
  if (name.includes('C-PURLINS') || name.includes('ANGLE BAR') || name.includes('FLAT BAR')) return 'Rizal Industrial';
  return CATEGORY_SUPPLIERS[item.category] || 'Metro Hardware Supply';
};

const SALES_PLANS = [
  {
    branch: 'Manggahan',
    customerType: 'walk_in',
    paymentMethod: 'cash',
    discountType: 'none',
    daysAgo: 0,
    hour: 9,
    minute: 15,
    remarks: 'Morning walk-in sales encoded after receipt checking.',
    items: [
      ['BOYSEN - LATEX (STONE) -- B 701 FLAT LATEX WHT 1L', 2],
      ['PRIMER -- B 310 RED OXIDE METAL PRIMER 1L', 3],
      ['ROYU -- #14 (2.0) (per mtr)', 12]
    ]
  },
  {
    branch: 'Manggahan',
    customerType: 'contractor',
    paymentMethod: 'bank_transfer',
    paymentReference: 'BPI-EMC-20260522-1435',
    discountType: 'bulk_project_10',
    daysAgo: 0,
    hour: 14,
    minute: 35,
    remarks: 'Project buyer purchase for house repair materials.',
    items: [
      ['LONG SPAN -- RED/GRN/BLU 8 - 5 grooves', 4],
      ['COCO -- 2X2X8', 8],
      ['C-PURLINS MANIPIS -- 2X3 9KG (9.2kg)', 3]
    ]
  },
  {
    branch: 'Manggahan',
    customerType: 'regular',
    paymentMethod: 'gcash',
    paymentReference: 'GCASH-8427195630',
    discountType: 'store_promo_5',
    daysAgo: 1,
    hour: 16,
    minute: 20,
    remarks: 'Regular customer purchase for plumbing repair.',
    items: [
      ['PVC PIPE -- ORANGE 1/2', 5],
      ['ELBOW 1/4 90deg -- ORANGE 2"', 8],
      ['COUPLING -- ORANGE 2"', 6]
    ]
  },
  {
    branch: 'San Rafael',
    customerType: 'walk_in',
    paymentMethod: 'cash',
    cashTendered: 1000,
    discountType: 'none',
    daysAgo: 0,
    hour: 10,
    minute: 40,
    remarks: 'Counter sales for electrical items.',
    items: [
      ['FLOURESCENT LAMP only -- Philips 20w', 4],
      ['PANEL BOX -- 2BR', 1],
      ['ROYU -- #12 (3.5) (per mtr)', 10]
    ]
  },
  {
    branch: 'San Rafael',
    customerType: 'contractor',
    paymentMethod: 'bank_transfer',
    paymentReference: 'BDO-PO-20260520-1310',
    discountType: 'bulk_project_10',
    daysAgo: 2,
    hour: 13,
    minute: 10,
    remarks: 'Small contractor purchase for roofing support.',
    items: [
      ['CORRUGATED (G.26) MANIPIS -- 8', 6],
      ['ANGLE BAR (3/16) MANIPIS -- 3/16 X 1 - Red', 4],
      ['STEEL MATTING -- #10 MANIPIS', 2]
    ]
  }
];

const NON_SALES_OUT_PLANS = [
  { branch: 'Manggahan', item: 'PLASTIC SHEET 8" -- BLUE', quantity: 1, reason: 'damaged', daysAgo: 3 },
  { branch: 'Manggahan', item: 'COLORED GUTTER -- FLASHING RED/GRN/BLU', quantity: 1, reason: 'lost_missing', daysAgo: 5 },
  { branch: 'San Rafael', item: 'BOYSEN - ENAMEL (WOOD & STEEL) -- B 690 QDE BLACK .25L', quantity: 1, reason: 'damaged', daysAgo: 4 },
  { branch: 'San Rafael', item: 'COCO -- 2X3X8', quantity: 2, reason: 'manual_adjustment', daysAgo: 6 }
];

const STOCK_IN_PLANS = [
  { branch: 'Manggahan', item: 'LONG SPAN -- RED/GRN/BLU 10 - 5 grooves', quantity: 30, daysAgo: 5 },
  { branch: 'Manggahan', item: 'BOYSEN - LATEX (STONE) -- B 710 GLOSS LATEX WHT 4L', quantity: 12, daysAgo: 7 },
  { branch: 'Manggahan', item: 'PHELPS DODGE -- #12 (3.5) 150m (per box)', quantity: 8, daysAgo: 4 },
  { branch: 'San Rafael', item: 'PVC PIPE -- NELTEX 1', quantity: 18, daysAgo: 5 },
  { branch: 'San Rafael', item: 'CORRUGATED - RED/GRN -- RED/GREEN 10', quantity: 16, daysAgo: 8 },
  { branch: 'San Rafael', item: 'ANGLE BAR 1/4 (MAKAPAL) -- 1/4 X 1 - Grn', quantity: 18, daysAgo: 6 }
];

const STOCK_OVERRIDES = new Map([
  ['Manggahan|ELBOW 1/8 45deg -- ORANGE 6"', 0],
  ['Manggahan|C-PURLINS MAKAPAL -- WALL CLIP', 0],
  ['Manggahan|MARINE -- 3/4 L-M (imp)', 2],
  ['Manggahan|GUTTER -- GUTTER 8X24 MAKAPAL', 3],
  ['Manggahan|ANGLE BAR (3/16) MANIPIS -- 3/16 X 1 1/2 - Red', 4],
  ['San Rafael|BOYSEN - WATER PROOFING -- 7760 PLEXIBOND 16L', 0],
  ['San Rafael|PVC PIPE -- BLACK 4"', 1],
  ['San Rafael|ORDINARY -- 3/4 L-O (imp)', 2],
  ['San Rafael|PANEL BOX -- 10BR', 3],
  ['San Rafael|CORRUGATED (G.24) MAKAPAL -- 8', 4],
  ['Manggahan|LONG SPAN -- RED/GRN/BLU 10 - 5 grooves', 45],
  ['Manggahan|BOYSEN - LATEX (STONE) -- B 710 GLOSS LATEX WHT 4L', 28],
  ['Manggahan|PHELPS DODGE -- #12 (3.5) 150m (per box)', 12],
  ['San Rafael|PVC PIPE -- NELTEX 1', 36],
  ['San Rafael|CORRUGATED - RED/GRN -- RED/GREEN 10', 28],
  ['San Rafael|ANGLE BAR 1/4 (MAKAPAL) -- 1/4 X 1 - Grn', 30]
]);

const philippineTimestamp = (daysAgo, hour = 8, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
};

const formatSalesNumber = sequence => `SALE-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`;
const formatPurchaseNumber = sequence => `PUR-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`;

const getDiscountDetails = (discountType, subtotalAmount, customAmount = 0) => {
  const normalizedType = String(discountType || 'none').trim().toLowerCase();
  const subtotal = Number(subtotalAmount || 0);
  const presets = {
    none: { type: 'none', label: 'No Discount', amount: 0 },
    store_promo_5: {
      type: 'store_promo_5',
      label: 'Store Promo 5%',
      amount: Number((subtotal * 0.05).toFixed(2))
    },
    bulk_project_10: {
      type: 'bulk_project_10',
      label: 'Bulk / Project Discount 10%',
      amount: Number((subtotal * 0.10).toFixed(2))
    },
    custom_amount: {
      type: 'custom_amount',
      label: 'Manual Discount',
      amount: Number(customAmount || 0)
    }
  };

  return presets[normalizedType] || presets.none;
};

const computeStatus = (stock, minStock, leadTimeDays, safetyStock, averageDailySales) => {
  const hasPlanning = [leadTimeDays, safetyStock, averageDailySales].every(value => value !== null && value !== undefined);
  const recommended = hasPlanning
    ? Math.ceil(Number(averageDailySales) * Number(leadTimeDays) + Number(safetyStock))
    : null;
  const threshold = recommended ?? minStock;

  if (stock <= 0) return 'Out of Stock';
  if (stock <= threshold) return 'Low Stock';
  return 'In Stock';
};

const getPlan = (index, branch) => {
  const branchOffset = branch === 'Manggahan' ? 0 : 2;
  const minStock = 6 + ((index + branchOffset) % 7);
  const leadTimeDays = 3 + ((index + branchOffset) % 8);
  const safetyStock = 2 + (index % 4);
  const averageDailySales = Number((0.35 + ((index + branchOffset) % 6) * 0.22).toFixed(2));
  const overrideKey = `${branch}|${CATALOG[index].name}`;
  const stock = STOCK_OVERRIDES.has(overrideKey)
    ? STOCK_OVERRIDES.get(overrideKey)
    : minStock + 9 + ((index * 5 + branchOffset) % 38);

  return {
    stock,
    minStock,
    leadTimeDays,
    safetyStock,
    averageDailySales,
    status: computeStatus(stock, minStock, leadTimeDays, safetyStock, averageDailySales)
  };
};

const findActor = async (client, branch, role = null) => {
  const result = await client.query(
    `SELECT user_id, full_name
     FROM users
     WHERE status = 'Active'
       AND ($1::text IS NULL OR branch = $1)
       AND ($2::text IS NULL OR role = $2)
     ORDER BY CASE WHEN role = 'Admin' THEN 0 ELSE 1 END, user_id
     LIMIT 1`,
    [branch, role]
  );

  if (result.rowCount > 0) return result.rows[0];

  const fallback = await client.query(
    `SELECT user_id, full_name
     FROM users
     WHERE status = 'Active'
     ORDER BY CASE WHEN role = 'Admin' THEN 0 ELSE 1 END, user_id
     LIMIT 1`
  );

  return fallback.rows[0] || { user_id: null, full_name: 'System Admin' };
};

const insertMovement = async (client, movement) => {
  if (Number(movement.quantity) <= 0 || Number(movement.previousQuantity) === Number(movement.newQuantity)) return;

  await client.query(
    `INSERT INTO stock_movements (
       inventory_id, product_id, item_name, category, branch, action,
       quantity_changed, previous_quantity, new_quantity, reason,
       note, actor_id, actor_name, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      movement.inventoryId,
      movement.productId,
      movement.name,
      movement.category,
      movement.branch,
      movement.action,
      movement.quantity,
      movement.previousQuantity,
      movement.newQuantity,
      movement.reason,
      movement.note,
      movement.actorId,
      movement.actorName,
      movement.createdAt
    ]
  );
};

async function refreshDemoInventory() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const primaryAdmin = await findActor(client, 'Manggahan', 'Admin');

    await client.query(`
      TRUNCATE TABLE
        purchase_items,
        purchase_transactions,
        sales_items,
        sales_transactions,
        stock_movements,
        archived_inventory,
        branch_inventory,
        products,
        audit_logs,
        backup_logs,
        system_logs
      RESTART IDENTITY
      CASCADE
    `);

    const stockInMap = new Map(STOCK_IN_PLANS.map(plan => [`${plan.branch}|${plan.item}`, plan]));
    const nonSalesOutMap = new Map(NON_SALES_OUT_PLANS.map(plan => [`${plan.branch}|${plan.item}`, plan]));
    const salesQuantityMap = new Map();

    for (const sale of SALES_PLANS) {
      for (const [itemName, quantity] of sale.items) {
        const key = `${sale.branch}|${itemName}`;
        salesQuantityMap.set(key, (salesQuantityMap.get(key) || 0) + quantity);
      }
    }

    const inventoryByBranchAndName = new Map();
    const productRows = [];
    const inventoryRows = [];
    const purchaseSeedLines = [];

    for (let index = 0; index < CATALOG.length; index += 1) {
      const item = CATALOG[index];
      const supplier = getSupplierForItem(item, index);
      const productResult = await client.query(
        `INSERT INTO products (name, category, supplier_name, default_selling_price, cost_price, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING product_id`,
        [item.name, item.category, supplier, item.price, item.costPrice, philippineTimestamp(28 - (index % 14), 8, 10)]
      );
      const productId = productResult.rows[0].product_id;
      productRows.push({ ...item, supplier, productId });

      for (const branch of BRANCHES) {
        const key = `${branch}|${item.name}`;
        const plan = getPlan(index, branch);
        const stockInPlan = stockInMap.get(key);
        const nonSalesPlan = nonSalesOutMap.get(key);
        const salesQty = salesQuantityMap.get(key) || 0;
        const stockInQty = stockInPlan?.quantity || 0;
        const nonSalesOutQty = nonSalesPlan?.quantity || 0;
        const beginningStock = plan.stock - stockInQty + salesQty + nonSalesOutQty;

        const inventoryResult = await client.query(
          `INSERT INTO branch_inventory (
             product_id, branch, stock_level, min_stock_level, lead_time_days,
             safety_stock, average_daily_sales, status, last_updated
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING inventory_id`,
          [
            productId,
            branch,
            plan.stock,
            plan.minStock,
            plan.leadTimeDays,
            plan.safetyStock,
            plan.averageDailySales,
            plan.status,
            philippineTimestamp(0, 16, 45)
          ]
        );

        const inventoryId = inventoryResult.rows[0].inventory_id;
        const actor = await findActor(client, branch);
        const row = {
          inventoryId,
          productId,
          name: item.name,
          category: item.category,
          supplier,
          price: item.price,
          costPrice: item.costPrice,
          branch,
          currentStock: beginningStock,
          finalStock: plan.stock,
          minStock: plan.minStock,
          leadTimeDays: plan.leadTimeDays,
          safetyStock: plan.safetyStock,
          averageDailySales: plan.averageDailySales,
          status: plan.status,
          actor
        };

        inventoryRows.push(row);
        inventoryByBranchAndName.set(key, row);

        await insertMovement(client, {
          inventoryId,
          productId,
          name: item.name,
          category: item.category,
          branch,
          action: 'initial_stock',
          quantity: beginningStock,
          previousQuantity: 0,
          newQuantity: beginningStock,
          reason: 'beginning_balance',
          note: 'Opening stock balance for clean presentation data.',
          actorId: actor.user_id,
          actorName: actor.full_name,
          createdAt: philippineTimestamp(14 + (index % 7), 8, 30)
        });

        if (stockInPlan) {
          const previousQuantity = row.currentStock;
          row.currentStock += stockInPlan.quantity;
          purchaseSeedLines.push({
            inventory: row,
            quantity: stockInPlan.quantity,
            previousQuantity,
            newQuantity: row.currentStock,
            createdAt: philippineTimestamp(stockInPlan.daysAgo, 10, 20)
          });
          await insertMovement(client, {
            inventoryId,
            productId,
            name: item.name,
            category: item.category,
            branch,
            action: 'stock_in',
            quantity: stockInPlan.quantity,
            previousQuantity,
            newQuantity: row.currentStock,
            reason: 'purchase_received',
            note: 'Supplier purchase received through Purchase Entry seed data.',
            actorId: actor.user_id,
            actorName: actor.full_name,
            createdAt: philippineTimestamp(stockInPlan.daysAgo, 10, 20)
          });
        }

        if (nonSalesPlan) {
          const previousQuantity = row.currentStock;
          row.currentStock -= nonSalesPlan.quantity;
          await insertMovement(client, {
            inventoryId,
            productId,
            name: item.name,
            category: item.category,
            branch,
            action: 'stock_out',
            quantity: nonSalesPlan.quantity,
            previousQuantity,
            newQuantity: row.currentStock,
            reason: nonSalesPlan.reason,
            note: 'Non-sales stock deduction recorded after physical verification.',
            actorId: actor.user_id,
            actorName: actor.full_name,
            createdAt: philippineTimestamp(nonSalesPlan.daysAgo, 15, 5)
          });
        }
      }
    }

    let purchaseSequence = 1;
    for (const line of purchaseSeedLines) {
      const actor = await findActor(client, line.inventory.branch);
      const unitCost = Number(line.inventory.costPrice || Math.max(Number(line.inventory.price || 0) * 0.82, 0).toFixed(2));
      const subtotal = Number((unitCost * line.quantity).toFixed(2));
      const purchaseResult = await client.query(
        `INSERT INTO purchase_transactions (
           purchase_number, branch, supplier_name, document_type, document_number,
           payment_terms, subtotal_amount, total_quantity, remarks,
           status, encoded_by, encoded_by_name, created_at
         )
         VALUES ($1, $2, $3, 'DR', $4, $5, $6, $7, $8, 'completed', $9, $10, $11)
         RETURNING purchase_transaction_id`,
        [
          formatPurchaseNumber(purchaseSequence),
          line.inventory.branch,
          line.inventory.supplier || 'Unassigned Supplier',
          `DR-${String(purchaseSequence).padStart(4, '0')}`,
          purchaseSequence % 2 === 0 ? 'cod' : 'cash',
          subtotal,
          line.quantity,
          'Seeded supplier delivery for presentation data.',
          actor.user_id,
          actor.full_name,
          line.createdAt
        ]
      );

      await client.query(
        `INSERT INTO purchase_items (
           purchase_transaction_id, inventory_id, product_id, item_name,
           category, branch, quantity_received, unit_cost, subtotal,
           previous_quantity, new_quantity, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          purchaseResult.rows[0].purchase_transaction_id,
          line.inventory.inventoryId,
          line.inventory.productId,
          line.inventory.name,
          line.inventory.category,
          line.inventory.branch,
          line.quantity,
          unitCost,
          subtotal,
          line.previousQuantity,
          line.newQuantity,
          line.createdAt
        ]
      );

      purchaseSequence += 1;
    }

    let salesSequence = 1;
    for (const sale of SALES_PLANS) {
      const actor = await findActor(client, sale.branch);
      const saleTime = philippineTimestamp(sale.daysAgo, sale.hour, sale.minute);
      const saleLines = sale.items.map(([itemName, quantity]) => {
        const inventory = inventoryByBranchAndName.get(`${sale.branch}|${itemName}`);
        if (!inventory) throw new Error(`Missing inventory row for ${sale.branch} - ${itemName}`);
        const previousQuantity = inventory.currentStock;
        const newQuantity = previousQuantity - quantity;
        if (newQuantity < 0) throw new Error(`Not enough stock for sample sale: ${itemName}`);
        inventory.currentStock = newQuantity;
        const unitPrice = Number(inventory.price);
        const subtotal = Number((quantity * unitPrice).toFixed(2));
        return {
          inventory,
          quantity,
          previousQuantity,
          newQuantity,
          unitPrice,
          subtotal
        };
      });
      const totalQuantity = saleLines.reduce((sum, line) => sum + line.quantity, 0);
      const subtotalAmount = Number(saleLines.reduce((sum, line) => sum + line.subtotal, 0).toFixed(2));
      const discountDetails = getDiscountDetails(sale.discountType, subtotalAmount, sale.discountAmount);
      const discountAmount = Math.min(discountDetails.amount, subtotalAmount);
      const totalAmount = Number(Math.max(subtotalAmount - discountAmount, 0).toFixed(2));
      const paymentMethod = sale.paymentMethod || 'cash';
      const amountReceived = paymentMethod === 'cash'
        ? Number(Math.max(Number(sale.cashTendered || totalAmount), totalAmount).toFixed(2))
        : totalAmount;
      const changeAmount = paymentMethod === 'cash'
        ? Number((amountReceived - totalAmount).toFixed(2))
        : 0;
      const paymentReference = ['gcash', 'bank_transfer'].includes(paymentMethod)
        ? sale.paymentReference
        : null;

      const transactionResult = await client.query(
        `INSERT INTO sales_transactions (
           sales_number, branch, customer_type, total_quantity, subtotal_amount,
           discount_amount, discount_type, discount_label, total_amount,
           payment_method, amount_received, change_amount, payment_reference,
           payment_confirmed, payment_confirmed_by, payment_confirmed_by_name,
           payment_confirmed_at, status, sold_by, sold_by_name, remarks, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 true, $14, $15, $16, 'completed', $17, $18, $19, $20)
         RETURNING sales_transaction_id`,
        [
          formatSalesNumber(salesSequence),
          sale.branch,
          sale.customerType,
          totalQuantity,
          subtotalAmount,
          discountAmount,
          discountDetails.type,
          discountDetails.label,
          totalAmount,
          paymentMethod,
          amountReceived,
          changeAmount,
          paymentReference,
          actor.user_id,
          actor.full_name,
          saleTime,
          actor.user_id,
          actor.full_name,
          sale.remarks,
          saleTime
        ]
      );
      salesSequence += 1;

      const salesTransactionId = transactionResult.rows[0].sales_transaction_id;
      for (const line of saleLines) {
        await client.query(
          `INSERT INTO sales_items (
             sales_transaction_id, inventory_id, product_id, item_name, category,
             branch, quantity_sold, unit_price, subtotal, previous_quantity,
             new_quantity, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            salesTransactionId,
            line.inventory.inventoryId,
            line.inventory.productId,
            line.inventory.name,
            line.inventory.category,
            line.inventory.branch,
            line.quantity,
            line.unitPrice,
            line.subtotal,
            line.previousQuantity,
            line.newQuantity,
            saleTime
          ]
        );

        await insertMovement(client, {
          inventoryId: line.inventory.inventoryId,
          productId: line.inventory.productId,
          name: line.inventory.name,
          category: line.inventory.category,
          branch: line.inventory.branch,
          action: 'stock_out',
          quantity: line.quantity,
          previousQuantity: line.previousQuantity,
          newQuantity: line.newQuantity,
          reason: 'sales',
          note: `Sales Recording ${formatSalesNumber(salesSequence - 1)}.`,
          actorId: actor.user_id,
          actorName: actor.full_name,
          createdAt: saleTime
        });
      }
    }

    for (const inventory of inventoryRows) {
      if (inventory.currentStock !== inventory.finalStock) {
        throw new Error(`Stock mismatch for ${inventory.branch} - ${inventory.name}: expected ${inventory.finalStock}, computed ${inventory.currentStock}`);
      }
    }

    const archiveCandidates = [
      inventoryByBranchAndName.get('Manggahan|PLAIN SHEET (G.26) MANIPIS -- 3X8X26'),
      inventoryByBranchAndName.get('Manggahan|C-PURLINS MAKAPAL -- WALL ANGLE'),
      inventoryByBranchAndName.get('San Rafael|COUPLING -- BLACK 3"'),
      inventoryByBranchAndName.get('San Rafael|FLOURESCENT LAMP only -- Firefly 8w')
    ].filter(Boolean);

    for (const candidate of archiveCandidates) {
      await client.query(
        `INSERT INTO archived_inventory (
           original_inventory_id, product_id, name, category, supplier_name,
           default_selling_price, branch, stock_level, min_stock_level,
           lead_time_days, safety_stock, average_daily_sales, status,
           last_updated, archived_at, archive_reason, archived_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11,
                 'Out of Stock', $12, $13, $14, $15)`,
        [
          candidate.inventoryId,
          candidate.productId,
          `${candidate.name} - Old Record`,
          candidate.category,
          candidate.supplier,
          candidate.price,
          candidate.branch,
          candidate.minStock,
          candidate.leadTimeDays,
          candidate.safetyStock,
          candidate.averageDailySales,
          philippineTimestamp(35, 11, 0),
          philippineTimestamp(32, 14, 10),
          'duplicate_record',
          primaryAdmin.user_id
        ]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_name, target_type, action, reason, details, created_at)
       VALUES ($1, $2, 'inventory_demo_seed', 'REFRESH_PRESENTATION_DATA', $3, $4::jsonb, $5)`,
      [
        primaryAdmin.user_id,
        primaryAdmin.full_name,
        'Cleaned business data and loaded realistic hardware store presentation records while preserving user accounts.',
        JSON.stringify({
          productsCreated: productRows.length,
          branchInventoryRecords: inventoryRows.length,
          salesTransactionsCreated: SALES_PLANS.length,
          purchaseTransactionsCreated: purchaseSeedLines.length,
          archivedRecordsCreated: archiveCandidates.length,
          branches: BRANCHES
        }),
        philippineTimestamp(0, 17, 0)
      ]
    );

    await client.query('COMMIT');

    console.log('Presentation data refresh completed successfully.');
    console.log(`Products created: ${productRows.length}`);
    console.log(`Branch inventory records created: ${inventoryRows.length}`);
    console.log(`Sales transactions created: ${SALES_PLANS.length}`);
    console.log(`Purchase transactions created: ${purchaseSeedLines.length}`);
    console.log(`Archived records created: ${archiveCandidates.length}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to refresh presentation data:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

refreshDemoInventory();
