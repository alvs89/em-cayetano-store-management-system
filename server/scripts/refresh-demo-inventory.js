require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined
});

const BRANCHES = ['Manggahan', 'San Rafael'];

const suppliers = {
  tools: 'Rizal Industrial Tools Supply',
  electrical: 'Luzon Electrical Depot',
  cement: 'BuildPro Cement Distribution',
  paint: 'Metro Paints and Coatings',
  plumbing: 'AquaLine Plumbing Supplies',
  fasteners: 'Manila Fasteners Trading',
  lumber: 'Prime Lumber Yard',
  safety: 'SafeWorks Industrial Supply',
  hardware: 'Cayetano General Hardware Supplier',
  construction: 'Northstar Construction Materials',
  office: 'OfficeLink Business Supplies'
};

const catalog = [
  ['Claw Hammer 16 oz', 'Tools', suppliers.tools],
  ['Ball Peen Hammer 24 oz', 'Tools', suppliers.tools],
  ['Adjustable Wrench 10 in', 'Tools', suppliers.tools],
  ['Combination Wrench Set 8 pcs', 'Tools', suppliers.tools],
  ['Phillips Screwdriver 6 in', 'Tools', suppliers.tools],
  ['Flat Screwdriver 6 in', 'Tools', suppliers.tools],
  ['Long Nose Pliers 8 in', 'Tools', suppliers.tools],
  ['Steel Measuring Tape 5m', 'Tools', suppliers.tools],
  ['Spirit Level 24 in', 'Tools', suppliers.tools],
  ['Utility Knife Heavy Duty', 'Tools', suppliers.tools],
  ['Circuit Breaker 20A', 'Electrical', suppliers.electrical],
  ['Circuit Breaker 30A', 'Electrical', suppliers.electrical],
  ['LED Bulb 9W Daylight', 'Electrical', suppliers.electrical],
  ['Electrical Tape Black 18mm', 'Electrical', suppliers.electrical],
  ['THHN Wire #12', 'Electrical', suppliers.electrical],
  ['THHN Wire #14', 'Electrical', suppliers.electrical],
  ['Duplex Convenience Outlet', 'Electrical', suppliers.electrical],
  ['Single Gang Switch', 'Electrical', suppliers.electrical],
  ['Junction Box PVC 4x4 in', 'Electrical', suppliers.electrical],
  ['Extension Cord 5m', 'Electrical', suppliers.electrical],
  ['Portland Cement 40kg', 'Cement', suppliers.cement],
  ['Masonry Cement 40kg', 'Cement', suppliers.cement],
  ['Tile Adhesive 25kg', 'Cement', suppliers.cement],
  ['Skim Coat White 20kg', 'Cement', suppliers.cement],
  ['Concrete Mix 40kg', 'Cement', suppliers.cement],
  ['Semi-Gloss White Paint 1L', 'Paint', suppliers.paint],
  ['Semi-Gloss White Paint 4L', 'Paint', suppliers.paint],
  ['Red Oxide Primer 1L', 'Paint', suppliers.paint],
  ['Flat Latex Paint White 4L', 'Paint', suppliers.paint],
  ['Paint Roller 7 in', 'Paint', suppliers.paint],
  ['Paint Brush 2 in', 'Paint', suppliers.paint],
  ['Paint Thinner 1L', 'Paint', suppliers.paint],
  ['Rugby Contact Cement 250ml', 'Paint', suppliers.paint],
  ['Silicone Sealant Clear 300ml', 'Paint', suppliers.paint],
  ['PVC Pipe 1/2 in x 10 ft', 'Plumbing', suppliers.plumbing],
  ['PVC Pipe 3/4 in x 10 ft', 'Plumbing', suppliers.plumbing],
  ['PVC Elbow 1/2 in', 'Plumbing', suppliers.plumbing],
  ['PVC Coupling 3/4 in', 'Plumbing', suppliers.plumbing],
  ['Brass Faucet Standard', 'Plumbing', suppliers.plumbing],
  ['Flexible Hose 1/2 in x 18 in', 'Plumbing', suppliers.plumbing],
  ['Teflon Tape 12mm', 'Plumbing', suppliers.plumbing],
  ['Floor Drain Stainless 4 in', 'Plumbing', suppliers.plumbing],
  ['Common Nail 2 in', 'Fasteners', suppliers.fasteners],
  ['Common Nail 3 in', 'Fasteners', suppliers.fasteners],
  ['Concrete Nail 2 in', 'Fasteners', suppliers.fasteners],
  ['Wood Screw 1-1/2 in', 'Fasteners', suppliers.fasteners],
  ['Self-Drilling Screw 1 in', 'Fasteners', suppliers.fasteners],
  ['Blind Rivet 1/8 in', 'Fasteners', suppliers.fasteners],
  ['Hex Bolt 3/8 x 2 in', 'Fasteners', suppliers.fasteners],
  ['Washer 3/8 in', 'Fasteners', suppliers.fasteners],
  ['Coco Lumber 2x2x8 ft', 'Lumber', suppliers.lumber],
  ['Coco Lumber 2x3x10 ft', 'Lumber', suppliers.lumber],
  ['Marine Plywood 1/2 in 4x8 ft', 'Lumber', suppliers.lumber],
  ['Marine Plywood 3/4 in 4x8 ft', 'Lumber', suppliers.lumber],
  ['Ordinary Plywood 1/4 in 4x8 ft', 'Lumber', suppliers.lumber],
  ['Hardiflex Board 4.5mm 4x8 ft', 'Lumber', suppliers.lumber],
  ['Safety Gloves Rubberized', 'Safety', suppliers.safety],
  ['Dust Mask Disposable 20 pcs', 'Safety', suppliers.safety],
  ['Safety Goggles Clear', 'Safety', suppliers.safety],
  ['Hard Hat Yellow', 'Safety', suppliers.safety],
  ['Reflective Safety Vest', 'Safety', suppliers.safety],
  ['Padlock 50mm', 'Hardware', suppliers.hardware],
  ['Door Hinge 3 in Stainless', 'Hardware', suppliers.hardware],
  ['Cabinet Handle Stainless 4 in', 'Hardware', suppliers.hardware],
  ['Drawer Slide 14 in', 'Hardware', suppliers.hardware],
  ['Door Knob Cylindrical', 'Hardware', suppliers.hardware],
  ['Angle Bar 1-1/2 x 1/8 in', 'Construction', suppliers.construction],
  ['Steel Bar 10mm Grade 40', 'Construction', suppliers.construction],
  ['Steel Bar 12mm Grade 40', 'Construction', suppliers.construction],
  ['Tie Wire #16', 'Construction', suppliers.construction],
  ['GI Sheet Corrugated 8 ft', 'Construction', suppliers.construction],
  ['Bond Paper A4 70gsm', 'Office Supplies', suppliers.office],
  ['Receipt Book Duplicate', 'Office Supplies', suppliers.office],
  ['Ballpen Black 12 pcs', 'Office Supplies', suppliers.office],
  ['Packing Tape 2 in', 'Office Supplies', suppliers.office]
];

const branchPattern = {
  Manggahan: { offset: 0, demand: 1.15 },
  'San Rafael': { offset: 1, demand: 0.9 }
};

const philippineTimestamp = daysAgo => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(8 + (daysAgo % 10), (daysAgo * 7) % 60, 0, 0);
  return date;
};

const getInventoryPlan = (index, branch) => {
  const pattern = branchPattern[branch];
  const base = (index + pattern.offset) % 12;
  const minStock = 4 + (index % 7);
  const leadTime = 3 + (index % 8);
  const safetyStock = index % 5;
  const averageDailySales = Number((((index % 6) + 1) * pattern.demand / 2).toFixed(2));

  let stock;
  if (base === 0) stock = 0;
  else if (base === 1 || base === 2) stock = Math.max(1, minStock - (base === 1 ? 1 : 0));
  else stock = minStock + 8 + ((index * 3 + pattern.offset) % 45);

  return {
    stock,
    minStock,
    leadTime,
    safetyStock,
    averageDailySales,
    status: stock === 0 ? 'Out of Stock' : stock <= minStock ? 'Low Stock' : 'In Stock',
    lastUpdated: philippineTimestamp((index + pattern.offset) % 21)
  };
};

const insertMovement = async (client, movement) => {
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

    const adminResult = await client.query(
      `SELECT user_id, full_name
       FROM users
       WHERE role = 'Admin'
       ORDER BY user_id
       LIMIT 1`
    );
    const actor = adminResult.rows[0] || { user_id: null, full_name: 'System Admin' };

    await client.query(`
      TRUNCATE TABLE
        stock_movements,
        archived_inventory,
        branch_inventory,
        products
      RESTART IDENTITY
      CASCADE
    `);

    const insertedInventory = [];

    for (let i = 0; i < catalog.length; i += 1) {
      const [name, category, supplier] = catalog[i];
      const productResult = await client.query(
        `INSERT INTO products (name, category, supplier_name, created_at)
         VALUES ($1, $2, $3, $4)
         RETURNING product_id`,
        [name, category, supplier, philippineTimestamp((i % 25) + 3)]
      );
      const productId = productResult.rows[0].product_id;

      for (const branch of BRANCHES) {
        const plan = getInventoryPlan(i, branch);
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
            plan.leadTime,
            plan.safetyStock,
            plan.averageDailySales,
            plan.status,
            plan.lastUpdated
          ]
        );

        const inventoryId = inventoryResult.rows[0].inventory_id;
        insertedInventory.push({
          inventoryId,
          productId,
          name,
          category,
          branch,
          stock: plan.stock,
          minStock: plan.minStock,
          supplier,
          lastUpdated: plan.lastUpdated
        });

        await insertMovement(client, {
          inventoryId,
          productId,
          name,
          category,
          branch,
          action: 'initial_stock',
          quantity: plan.stock,
          previousQuantity: 0,
          newQuantity: plan.stock,
          reason: 'beginning_balance',
          note: 'Demo inventory beginning balance for system testing.',
          actorId: actor.user_id,
          actorName: actor.full_name,
          createdAt: plan.lastUpdated
        });

        if (plan.stock > plan.minStock + 5 && i % 4 === 0) {
          const soldQty = Math.min(5 + (i % 6), plan.stock - plan.minStock);
          await insertMovement(client, {
            inventoryId,
            productId,
            name,
            category,
            branch,
            action: 'stock_out',
            quantity: soldQty,
            previousQuantity: plan.stock + soldQty,
            newQuantity: plan.stock,
            reason: 'sales',
            note: 'Sample daily sales deduction for realistic stock movement history.',
            actorId: actor.user_id,
            actorName: actor.full_name,
            createdAt: philippineTimestamp((i % 12) + 1)
          });
        }

        if (plan.stock <= plan.minStock && i % 5 === 0) {
          await insertMovement(client, {
            inventoryId,
            productId,
            name,
            category,
            branch,
            action: 'stock_out',
            quantity: 1,
            previousQuantity: plan.stock + 1,
            newQuantity: plan.stock,
            reason: plan.stock === 0 ? 'sales' : 'damaged',
            note: plan.stock === 0
              ? 'Sample sale that brought the item to out-of-stock status.'
              : 'Sample damaged item deduction for testing movement reasons.',
            actorId: actor.user_id,
            actorName: actor.full_name,
            createdAt: philippineTimestamp((i % 9) + 1)
          });
        }
      }
    }

    const archiveCandidates = insertedInventory
      .filter((item, index) => index % 37 === 0)
      .slice(0, 4);

    for (const candidate of archiveCandidates) {
      await client.query(
        `INSERT INTO archived_inventory (
           original_inventory_id, product_id, name, category, branch, stock_level,
           min_stock_level, lead_time_days, safety_stock, average_daily_sales,
           status, supplier_name, last_updated, archived_at, archive_reason, archived_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 7, 1, 0.50, $8, $9, $10, $11, $12, $13)`,
        [
          candidate.inventoryId,
          candidate.productId,
          `${candidate.name} - Old Record`,
          candidate.category,
          candidate.branch,
          0,
          candidate.minStock,
          'Out of Stock',
          candidate.supplier,
          philippineTimestamp(31),
          philippineTimestamp(28),
          'duplicate_record',
          actor.user_id
        ]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_name, target_type, action, reason, details)
       VALUES ($1, $2, 'inventory_demo_seed', 'REFRESH_DEMO_INVENTORY', $3, $4::jsonb)`,
      [
        actor.user_id,
        actor.full_name,
        'Prepared realistic inventory testing data while preserving user accounts.',
        JSON.stringify({
          productsCreated: catalog.length,
          branchInventoryRecords: insertedInventory.length,
          archivedRecords: archiveCandidates.length,
          branches: BRANCHES
        })
      ]
    );

    await client.query('COMMIT');

    console.log(`Demo inventory refreshed successfully.`);
    console.log(`Products created: ${catalog.length}`);
    console.log(`Branch inventory records created: ${insertedInventory.length}`);
    console.log(`Archived sample records created: ${archiveCandidates.length}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to refresh demo inventory:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

refreshDemoInventory();
