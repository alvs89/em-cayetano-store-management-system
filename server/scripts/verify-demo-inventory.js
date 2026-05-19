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
         OR st.total_amount != COALESCE(si.total, 0)
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
        WHEN stock_level <= COALESCE(CEIL(average_daily_sales * lead_time_days + safety_stock), min_stock_level) THEN 'Low Stock'
        ELSE 'In Stock'
      END
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

    const result = {
      counts: counts.rows[0],
      badSalesTotals,
      negativeStock,
      statusMismatch,
      orphanSalesItems,
      orphanInventory
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
