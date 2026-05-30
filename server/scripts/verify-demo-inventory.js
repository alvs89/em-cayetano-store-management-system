require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined
});

async function getScalar(query) {
  const result = await pool.query(query);
  return Number(result.rows[0]?.count || 0);
}

async function verifyDemoInventory() {
  try {
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM branch_inventory) AS inventory,
        (SELECT COUNT(*) FROM sales_transactions) AS sales,
        (SELECT COUNT(*) FROM sales_items) AS sales_items,
        (SELECT COUNT(*) FROM stock_movements) AS movements,
        (SELECT COUNT(*) FROM archived_inventory) AS archived
    `);

    const badSalesTotals = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM sales_transactions st
      LEFT JOIN (
        SELECT
          sales_transaction_id,
          SUM(quantity_sold)::int AS qty,
          SUM(subtotal)::numeric(12,2) AS total
        FROM sales_items
        GROUP BY sales_transaction_id
      ) si ON si.sales_transaction_id = st.sales_transaction_id
      WHERE st.total_quantity != COALESCE(si.qty, 0)
         OR st.subtotal_amount != COALESCE(si.total, 0)
         OR st.total_amount != GREATEST((COALESCE(si.total, 0) - COALESCE(st.discount_amount, 0))::numeric(12,2), 0::numeric)
    `);

    const negativeStock = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM branch_inventory
      WHERE stock_level < 0
    `);

    const statusMismatch = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM branch_inventory
      WHERE status != CASE
        WHEN stock_level <= 0 THEN 'Out of Stock'
        WHEN stock_level <= min_stock_level THEN 'Low Stock'
        ELSE 'In Stock'
      END
    `);

    const futureDatedRows = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT created_at FROM products
        UNION ALL SELECT last_updated AS created_at FROM branch_inventory
        UNION ALL SELECT created_at FROM stock_movements
        UNION ALL SELECT created_at FROM sales_transactions
        UNION ALL SELECT created_at FROM sales_items
        UNION ALL SELECT created_at FROM purchase_transactions
        UNION ALL SELECT created_at FROM purchase_items
        UNION ALL SELECT archived_at AS created_at FROM archived_inventory
        UNION ALL SELECT created_at FROM audit_logs
      ) dated_records
      WHERE created_at > TIMESTAMP '2026-05-30 14:20:00'
    `);

    const orphanSalesItems = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM sales_items si
      LEFT JOIN sales_transactions st ON st.sales_transaction_id = si.sales_transaction_id
      WHERE st.sales_transaction_id IS NULL
    `);

    const orphanInventory = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM branch_inventory bi
      LEFT JOIN products p ON p.product_id = bi.product_id
      WHERE p.product_id IS NULL
    `);

    const invalidPaymentRecords = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM sales_transactions
      WHERE status = 'completed'
        AND (
          (payment_method = 'cash' AND (
            amount_received IS NULL
            OR amount_received < total_amount
            OR change_amount != (amount_received - total_amount)
          ))
          OR (payment_method IN ('gcash', 'bank_transfer') AND (
            payment_confirmed IS DISTINCT FROM true
            OR amount_received != total_amount
            OR change_amount != 0
            OR payment_reference IS NULL
            OR TRIM(payment_reference) = ''
          ))
        )
    `);

    const invalidSalesItemQuantities = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM sales_items
      WHERE quantity_sold <= 0
         OR previous_quantity < 0
         OR new_quantity < 0
         OR previous_quantity - quantity_sold != new_quantity
    `);

    const salesMovementMismatch = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM sales_items si
      INNER JOIN sales_transactions st
        ON st.sales_transaction_id = si.sales_transaction_id
      WHERE st.status = 'completed'
        AND NOT EXISTS (
          SELECT 1
          FROM stock_movements sm
          WHERE sm.inventory_id = si.inventory_id
            AND sm.product_id = si.product_id
            AND sm.action = 'stock_out'
            AND sm.reason = 'sales'
            AND sm.quantity_changed = si.quantity_sold
            AND sm.previous_quantity = si.previous_quantity
            AND sm.new_quantity = si.new_quantity
            AND sm.branch = si.branch
        )
    `);

    const result = {
      counts: counts.rows[0],
      badSalesTotals,
      negativeStock,
      statusMismatch,
      orphanSalesItems,
      orphanInventory,
      invalidPaymentRecords,
      invalidSalesItemQuantities,
      salesMovementMismatch,
      futureDatedRows
    };

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Demo inventory verification failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

verifyDemoInventory();
