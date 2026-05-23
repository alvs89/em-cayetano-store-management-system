require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined
});

const BRANCHES = ['Manggahan', 'San Rafael'];

const CATEGORY_SUPPLIERS = {
  Tools: 'Rizal Industrial',
  Electrical: 'Phelps Dodge Wires',
  Cement: 'Holcim Philippines',
  Paint: 'Boysen Paints',
  Plumbing: 'Neltex Development',
  Fasteners: 'Metro Hardware Supply',
  Lumber: 'Cebu Atlantic Hardware',
  Safety: 'Ace Hardware',
  Hardware: 'Handyman',
  Construction: 'Republic Cement',
  'Office Supplies': 'Metro Hardware Supply',
  Other: 'Wilcon Depot'
};

const CATALOG = [
  { name: 'Claw Hammer 16 oz', category: 'Tools', price: 245 },
  { name: 'Ball Peen Hammer 24 oz', category: 'Tools', price: 320 },
  { name: 'Adjustable Wrench 10 in', category: 'Tools', price: 385 },
  { name: 'Combination Wrench Set 8 pcs', category: 'Tools', price: 690 },
  { name: 'Phillips Screwdriver 6 in', category: 'Tools', price: 95 },
  { name: 'Flat Screwdriver 6 in', category: 'Tools', price: 95 },
  { name: 'Long Nose Pliers 8 in', category: 'Tools', price: 210 },
  { name: 'Steel Measuring Tape 5m', category: 'Tools', price: 165 },
  { name: 'Circuit Breaker 20A', category: 'Electrical', price: 285 },
  { name: 'Circuit Breaker 30A', category: 'Electrical', price: 315 },
  { name: 'LED Bulb 9W Daylight', category: 'Electrical', price: 85 },
  { name: 'Electrical Tape Black 18mm', category: 'Electrical', price: 38 },
  { name: 'THHN Wire #12 per Meter', category: 'Electrical', price: 42 },
  { name: 'THHN Wire #14 per Meter', category: 'Electrical', price: 32 },
  { name: 'Duplex Convenience Outlet', category: 'Electrical', price: 145 },
  { name: 'Portland Cement 40kg', category: 'Cement', price: 285 },
  { name: 'Masonry Cement 40kg', category: 'Cement', price: 255 },
  { name: 'Tile Adhesive 25kg', category: 'Cement', price: 335 },
  { name: 'Skim Coat White 20kg', category: 'Cement', price: 410 },
  { name: 'Semi-Gloss White Paint 1L', category: 'Paint', price: 285 },
  { name: 'Semi-Gloss White Paint 4L', category: 'Paint', price: 980 },
  { name: 'Red Oxide Primer 1L', category: 'Paint', price: 265 },
  { name: 'Paint Roller 7 in', category: 'Paint', price: 135 },
  { name: 'Paint Brush 2 in', category: 'Paint', price: 58 },
  { name: 'PVC Pipe 1/2 in x 10 ft', category: 'Plumbing', price: 115 },
  { name: 'PVC Pipe 3/4 in x 10 ft', category: 'Plumbing', price: 155 },
  { name: 'PVC Elbow 1/2 in', category: 'Plumbing', price: 18 },
  { name: 'PVC Coupling 3/4 in', category: 'Plumbing', price: 22 },
  { name: 'Brass Faucet Standard', category: 'Plumbing', price: 265 },
  { name: 'Teflon Tape 12mm', category: 'Plumbing', price: 18 },
  { name: 'Common Nail 2 in per kg', category: 'Fasteners', price: 95 },
  { name: 'Common Nail 3 in per kg', category: 'Fasteners', price: 98 },
  { name: 'Concrete Nail 2 in per kg', category: 'Fasteners', price: 125 },
  { name: 'Wood Screw 1-1/2 in per box', category: 'Fasteners', price: 145 },
  { name: 'Hex Bolt 3/8 x 2 in', category: 'Fasteners', price: 12 },
  { name: 'Coco Lumber 2x2x8 ft', category: 'Lumber', price: 95 },
  { name: 'Coco Lumber 2x3x10 ft', category: 'Lumber', price: 165 },
  { name: 'Marine Plywood 1/2 in 4x8 ft', category: 'Lumber', price: 980 },
  { name: 'Marine Plywood 3/4 in 4x8 ft', category: 'Lumber', price: 1350 },
  { name: 'Hardiflex Board 4.5mm 4x8 ft', category: 'Lumber', price: 515 },
  { name: 'Safety Gloves Rubberized', category: 'Safety', price: 85 },
  { name: 'Dust Mask Disposable 20 pcs', category: 'Safety', price: 120 },
  { name: 'Safety Goggles Clear', category: 'Safety', price: 145 },
  { name: 'Hard Hat Yellow', category: 'Safety', price: 220 },
  { name: 'Padlock 50mm', category: 'Hardware', price: 185 },
  { name: 'Door Hinge 3 in Stainless', category: 'Hardware', price: 78 },
  { name: 'Cabinet Handle Stainless 4 in', category: 'Hardware', price: 95 },
  { name: 'Door Knob Cylindrical', category: 'Hardware', price: 395 },
  { name: 'Angle Bar 1-1/2 x 1/8 in', category: 'Construction', price: 520 },
  { name: 'Steel Bar 10mm Grade 40', category: 'Construction', price: 185 },
  { name: 'Steel Bar 12mm Grade 40', category: 'Construction', price: 265 },
  { name: 'Tie Wire #16 per kg', category: 'Construction', price: 92 },
  { name: 'GI Sheet Corrugated 8 ft', category: 'Construction', price: 455 },
  { name: 'Receipt Book Duplicate', category: 'Office Supplies', price: 65 }
];

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
      ['Semi-Gloss White Paint 1L', 2],
      ['Paint Brush 2 in', 3],
      ['Electrical Tape Black 18mm', 4]
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
      ['Portland Cement 40kg', 6],
      ['Common Nail 3 in per kg', 2],
      ['Tie Wire #16 per kg', 3]
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
      ['PVC Pipe 1/2 in x 10 ft', 4],
      ['PVC Elbow 1/2 in', 8],
      ['Teflon Tape 12mm', 5]
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
      ['LED Bulb 9W Daylight', 5],
      ['Duplex Convenience Outlet', 2],
      ['THHN Wire #14 per Meter', 12]
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
      ['GI Sheet Corrugated 8 ft', 4],
      ['Steel Bar 10mm Grade 40', 6],
      ['Hard Hat Yellow', 2]
    ]
  }
];

const NON_SALES_OUT_PLANS = [
  { branch: 'Manggahan', item: 'Claw Hammer 16 oz', quantity: 1, reason: 'damaged', daysAgo: 3 },
  { branch: 'Manggahan', item: 'Safety Goggles Clear', quantity: 1, reason: 'lost_missing', daysAgo: 5 },
  { branch: 'San Rafael', item: 'Red Oxide Primer 1L', quantity: 1, reason: 'damaged', daysAgo: 4 },
  { branch: 'San Rafael', item: 'Door Hinge 3 in Stainless', quantity: 2, reason: 'manual_adjustment', daysAgo: 6 }
];

const STOCK_IN_PLANS = [
  { branch: 'Manggahan', item: 'Portland Cement 40kg', quantity: 30, daysAgo: 5 },
  { branch: 'Manggahan', item: 'Semi-Gloss White Paint 4L', quantity: 12, daysAgo: 7 },
  { branch: 'Manggahan', item: 'THHN Wire #12 per Meter', quantity: 50, daysAgo: 4 },
  { branch: 'San Rafael', item: 'LED Bulb 9W Daylight', quantity: 24, daysAgo: 5 },
  { branch: 'San Rafael', item: 'GI Sheet Corrugated 8 ft', quantity: 16, daysAgo: 8 },
  { branch: 'San Rafael', item: 'PVC Pipe 3/4 in x 10 ft', quantity: 18, daysAgo: 6 }
];

const STOCK_OVERRIDES = new Map([
  ['Manggahan|Adjustable Wrench 10 in', 0],
  ['Manggahan|Circuit Breaker 30A', 0],
  ['Manggahan|Marine Plywood 3/4 in 4x8 ft', 2],
  ['Manggahan|Door Knob Cylindrical', 3],
  ['Manggahan|Steel Bar 12mm Grade 40', 4],
  ['San Rafael|Masonry Cement 40kg', 0],
  ['San Rafael|Paint Roller 7 in', 1],
  ['San Rafael|Concrete Nail 2 in per kg', 2],
  ['San Rafael|Safety Gloves Rubberized', 3],
  ['San Rafael|Padlock 50mm', 4]
]);

const philippineTimestamp = (daysAgo, hour = 8, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
};

const formatSalesNumber = sequence => `SALE-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`;

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

    for (let index = 0; index < CATALOG.length; index += 1) {
      const item = CATALOG[index];
      const supplier = CATEGORY_SUPPLIERS[item.category] || 'Wilcon Depot';
      const productResult = await client.query(
        `INSERT INTO products (name, category, supplier_name, default_selling_price, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING product_id`,
        [item.name, item.category, supplier, item.price, philippineTimestamp(28 - (index % 14), 8, 10)]
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
            reason: 'delivery_received',
            note: 'Supplier delivery received and encoded by inventory staff.',
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
      inventoryByBranchAndName.get('Manggahan|Flat Screwdriver 6 in'),
      inventoryByBranchAndName.get('Manggahan|Circuit Breaker 20A'),
      inventoryByBranchAndName.get('San Rafael|PVC Coupling 3/4 in'),
      inventoryByBranchAndName.get('San Rafael|Cabinet Handle Stainless 4 in')
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
