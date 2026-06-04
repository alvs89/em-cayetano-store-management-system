// Refreshes demo inventory records from the official catalog while preserving
// the same schema and stock-status rules used by the running application.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const { buildEmCayetanoCatalog } = require('./em-cayetano-catalog');
const { getOfficialSupplierForProduct } = require('./supplier-master-list');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined
});

const BRANCHES = ['Manggahan', 'San Rafael'];

const CATALOG = buildEmCayetanoCatalog();
const PRESENTATION_NOW = new Date();
const PRESENTATION_YEAR = PRESENTATION_NOW.getFullYear();
const SALES_INVOICE_DOCUMENT_TYPE = 'sales_invoice';
const SALES_INVOICE_SEQUENCE_DIGITS = 6;
const SALES_INVOICE_MAX_NUMBER = Number('9'.repeat(SALES_INVOICE_SEQUENCE_DIGITS));
const DEMO_OFFICIAL_INVOICE_START_NUMBER = 1;

if (CATALOG.length === 0) {
  throw new Error('E.M. Cayetano product catalog is empty.');
}

const getSupplierForItem = getOfficialSupplierForProduct;

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
    customerType: 'hardware_reseller',
    paymentMethod: 'gcash',
    paymentReference: 'GCASH-6531849207',
    discountType: 'store_promo_5',
    daysAgo: 0,
    hour: 11,
    minute: 5,
    remarks: 'Reseller bought common plumbing fittings and electrical wire.',
    items: [
      ['PVC PIPE -- ORANGE 1/2', 4],
      ['COUPLING -- ORANGE 2"', 5],
      ['ROYU -- #14 (2.0) (per mtr)', 18]
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
    customerType: 'walk_in',
    paymentMethod: 'cash',
    cashTendered: 1500,
    discountType: 'none',
    daysAgo: 0,
    hour: 16,
    minute: 5,
    remarks: 'Afternoon counter sale for paint and primer.',
    items: [
      ['BOYSEN - LATEX (STONE) -- B 701 FLAT LATEX WHT 1L', 1],
      ['PRIMER -- B 310 RED OXIDE METAL PRIMER 1L', 2]
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
    branch: 'Manggahan',
    customerType: 'contractor',
    paymentMethod: 'bank_transfer',
    paymentReference: 'MBTC-EMC-20260601-0926',
    discountType: 'bulk_project_10',
    daysAgo: 1,
    hour: 9,
    minute: 26,
    remarks: 'Repeat contractor order for roofing and lumber materials.',
    items: [
      ['LONG SPAN -- RED/GRN/BLU 8 - 5 grooves', 2],
      ['COCO -- 2X2X8', 6],
      ['C-PURLINS MANIPIS -- 2X3 9KG (9.2kg)', 2]
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
    customerType: 'regular',
    paymentMethod: 'cash',
    cashTendered: 2500,
    discountType: 'none',
    daysAgo: 0,
    hour: 15,
    minute: 25,
    remarks: 'Regular customer bought roofing and electrical materials.',
    items: [
      ['CORRUGATED - RED/GRN -- RED/GREEN 10', 3],
      ['ROYU -- #12 (3.5) (per mtr)', 8],
      ['PANEL BOX -- 2BR', 1]
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
  },
  {
    branch: 'San Rafael',
    customerType: 'hardware_reseller',
    paymentMethod: 'gcash',
    paymentReference: 'GCASH-9182074451',
    discountType: 'store_promo_5',
    daysAgo: 1,
    hour: 11,
    minute: 50,
    remarks: 'Hardware reseller replenished fast-moving plumbing items.',
    items: [
      ['PVC PIPE -- NELTEX 1', 5],
      ['PVC PIPE -- ORANGE 1/2', 4],
      ['ELBOW 1/4 90deg -- ORANGE 2"', 6]
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
  const date = new Date(PRESENTATION_NOW);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date > PRESENTATION_NOW ? new Date(PRESENTATION_NOW) : date;
};

const formatSalesNumber = sequence => `SALE-${PRESENTATION_YEAR}-${String(sequence).padStart(5, '0')}`;
const formatOfficialInvoiceNumber = sequence => String(sequence).padStart(SALES_INVOICE_SEQUENCE_DIGITS, '0');
const formatPurchaseNumber = sequence => `PUR-${PRESENTATION_YEAR}-${String(sequence).padStart(5, '0')}`;

const calculateLineProfit = ({ quantity, unitPrice, unitCost }) => {
  const quantitySold = Number(quantity || 0);
  const cost = Number(unitCost || 0);
  const subtotal = Number((quantitySold * Number(unitPrice || 0)).toFixed(2));
  const costSubtotal = Number((quantitySold * cost).toFixed(2));
  const grossProfit = Number((subtotal - costSubtotal).toFixed(2));
  const profitMarginPercent = subtotal > 0
    ? Number(((grossProfit / subtotal) * 100).toFixed(2))
    : 0;

  return {
    unitCostAtSale: Number(cost.toFixed(2)),
    subtotal,
    costSubtotal,
    grossProfit,
    profitMarginPercent
  };
};

const computeVatBreakdown = taxableAmount => {
  const grossAmount = Number(taxableAmount || 0);
  const vatableSales = Number((grossAmount / 1.12).toFixed(2));
  const vatAmount = Number((grossAmount - vatableSales).toFixed(2));
  return { vatableSales, vatAmount };
};

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

const computeStatus = (stock, minStock) => {
  if (stock <= 0) return 'Out of Stock';
  if (stock <= minStock) return 'Low Stock';
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
    status: computeStatus(stock, minStock)
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
      CREATE TABLE IF NOT EXISTS invoice_number_sequences (
        document_type VARCHAR(40) NOT NULL,
        invoice_year INTEGER NOT NULL,
        branch VARCHAR(50) NOT NULL DEFAULT 'Manggahan',
        last_number INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'),
        PRIMARY KEY (document_type, invoice_year, branch),
        CHECK (invoice_year BETWEEN 2000 AND 9999),
        CHECK (last_number BETWEEN 0 AND ${SALES_INVOICE_MAX_NUMBER})
      )
    `);
    await client.query(`
      ALTER TABLE invoice_number_sequences
      ADD COLUMN IF NOT EXISTS branch VARCHAR(50);
    `);
    await client.query(`
      UPDATE invoice_number_sequences
      SET branch = 'Manggahan'
      WHERE branch IS NULL OR TRIM(branch) = '';
    `);
    await client.query(`
      ALTER TABLE invoice_number_sequences
      ALTER COLUMN branch SET NOT NULL;
    `);
    await client.query(`
      ALTER TABLE invoice_number_sequences
      DROP CONSTRAINT IF EXISTS invoice_number_sequences_last_number_check;
    `);
    await client.query(`
      UPDATE invoice_number_sequences
      SET last_number = LEAST(GREATEST(COALESCE(last_number, 0), 0), ${SALES_INVOICE_MAX_NUMBER});
    `);
    await client.query(`
      ALTER TABLE invoice_number_sequences
      ADD CONSTRAINT invoice_number_sequences_last_number_check
      CHECK (last_number BETWEEN 0 AND ${SALES_INVOICE_MAX_NUMBER});
    `);
    await client.query(`
      ALTER TABLE invoice_number_sequences
      DROP CONSTRAINT IF EXISTS invoice_number_sequences_pkey;
    `);
    await client.query(`
      ALTER TABLE invoice_number_sequences
      ADD CONSTRAINT invoice_number_sequences_pkey PRIMARY KEY (document_type, invoice_year, branch);
    `);
    await client.query(`
      DROP INDEX IF EXISTS sales_transactions_official_invoice_number_unique;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS sales_transactions_branch_official_invoice_number_unique
      ON sales_transactions (branch, official_invoice_number)
      WHERE official_invoice_number IS NOT NULL;
    `);

    await client.query(`
      TRUNCATE TABLE
        purchase_items,
        purchase_transactions,
        sales_items,
        sales_transactions,
        stock_movements,
        archived_inventory,
        branch_inventory,
        products
      RESTART IDENTITY
      CASCADE
    `);

    await client.query(
      `DELETE FROM invoice_number_sequences
       WHERE document_type = $1
         AND invoice_year = $2`,
      [SALES_INVOICE_DOCUMENT_TYPE, PRESENTATION_YEAR]
    );

    await client.query(`
      DELETE FROM audit_logs
      WHERE COALESCE(target_type, '') NOT IN ('user', 'users', 'account')
        AND action NOT ILIKE '%USER%'
        AND action NOT ILIKE '%ACCOUNT%'
        AND action NOT ILIKE '%LOGIN%'
        AND action NOT ILIKE '%PASSWORD%'
        AND action NOT ILIKE '%OTP%'
    `);

    await client.query(`
      UPDATE audit_logs
      SET created_at = TIMESTAMP '2026-05-30 14:20:00'
      WHERE created_at > TIMESTAMP '2026-05-30 14:20:00'
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
    const branchInvoiceSequences = new Map(BRANCHES.map(branch => [branch, DEMO_OFFICIAL_INVOICE_START_NUMBER]));
    for (const sale of SALES_PLANS) {
      const actor = await findActor(client, sale.branch);
      const saleTime = philippineTimestamp(sale.daysAgo, sale.hour, sale.minute);
      const branchInvoiceSequence = branchInvoiceSequences.get(sale.branch) || DEMO_OFFICIAL_INVOICE_START_NUMBER;
      const branchOfficialInvoiceNumber = formatOfficialInvoiceNumber(branchInvoiceSequence);
      branchInvoiceSequences.set(sale.branch, branchInvoiceSequence + 1);
      const saleLines = sale.items.map(([itemName, quantity]) => {
        const inventory = inventoryByBranchAndName.get(`${sale.branch}|${itemName}`);
        if (!inventory) throw new Error(`Missing inventory row for ${sale.branch} - ${itemName}`);
        const previousQuantity = inventory.currentStock;
        const newQuantity = previousQuantity - quantity;
        if (newQuantity < 0) throw new Error(`Not enough stock for sample sale: ${itemName}`);
        inventory.currentStock = newQuantity;
        const unitPrice = Number(inventory.price);
        const profit = calculateLineProfit({
          quantity,
          unitPrice,
          unitCost: inventory.costPrice
        });
        return {
          inventory,
          quantity,
          previousQuantity,
          newQuantity,
          unitPrice,
          subtotal: profit.subtotal,
          unitCostAtSale: profit.unitCostAtSale,
          costSubtotal: profit.costSubtotal,
          grossProfit: profit.grossProfit,
          profitMarginPercent: profit.profitMarginPercent
        };
      });
      const totalQuantity = saleLines.reduce((sum, line) => sum + line.quantity, 0);
      const subtotalAmount = Number(saleLines.reduce((sum, line) => sum + line.subtotal, 0).toFixed(2));
      const discountDetails = getDiscountDetails(sale.discountType, subtotalAmount, sale.discountAmount);
      const discountAmount = Math.min(discountDetails.amount, subtotalAmount);
      const totalAmount = Number(Math.max(subtotalAmount - discountAmount, 0).toFixed(2));
      const { vatableSales, vatAmount } = computeVatBreakdown(totalAmount);
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
           discount_amount, discount_type, discount_label, delivery_charge,
           vatable_sales, vat_amount, total_amount,
           payment_method, amount_received, change_amount, payment_reference,
           payment_confirmed, payment_confirmed_by, payment_confirmed_by_name,
           payment_confirmed_at, status, sold_by, sold_by_name, remarks,
           created_at, official_invoice_number, official_invoice_expected_number,
           official_invoice_exception_reason
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12,
                 $13, $14, $15, true, $16, $17, $18, 'completed',
                 $19, $20, $21, $22, $23, $24, NULL)
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
          vatableSales,
          vatAmount,
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
          saleTime,
          branchOfficialInvoiceNumber,
          branchOfficialInvoiceNumber
        ]
      );
      salesSequence += 1;

      const salesTransactionId = transactionResult.rows[0].sales_transaction_id;
      for (const line of saleLines) {
        await client.query(
          `INSERT INTO sales_items (
             sales_transaction_id, inventory_id, product_id, item_name, category,
             branch, quantity_sold, unit_price, unit_cost_at_sale, subtotal,
             cost_subtotal, gross_profit, profit_margin_percent,
             previous_quantity, new_quantity, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            salesTransactionId,
            line.inventory.inventoryId,
            line.inventory.productId,
            line.inventory.name,
            line.inventory.category,
            line.inventory.branch,
            line.quantity,
            line.unitPrice,
            line.unitCostAtSale,
            line.subtotal,
            line.costSubtotal,
            line.grossProfit,
            line.profitMarginPercent,
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

    const branchInvoiceRanges = {};
    for (const branch of BRANCHES) {
      const nextSequence = branchInvoiceSequences.get(branch) || DEMO_OFFICIAL_INVOICE_START_NUMBER;
      const lastBranchInvoiceNumber = nextSequence - 1;
      branchInvoiceRanges[branch] = `${formatOfficialInvoiceNumber(DEMO_OFFICIAL_INVOICE_START_NUMBER)}–${formatOfficialInvoiceNumber(lastBranchInvoiceNumber)}`;
      await client.query(
        `INSERT INTO invoice_number_sequences (document_type, invoice_year, branch, last_number, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (document_type, invoice_year, branch) DO UPDATE
         SET last_number = EXCLUDED.last_number,
             updated_at = EXCLUDED.updated_at`,
        [
          SALES_INVOICE_DOCUMENT_TYPE,
          PRESENTATION_YEAR,
          branch,
          lastBranchInvoiceNumber,
          philippineTimestamp(0, 17, 0)
        ]
      );
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
          officialInvoiceRanges: branchInvoiceRanges,
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
