// Verifies demo inventory completeness and supplier/category consistency after
// seeding or refresh operations.
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
        (SELECT COUNT(*) FROM purchase_transactions) AS purchases,
        (SELECT COUNT(*) FROM purchase_items) AS purchase_items,
        (SELECT COUNT(*) FROM stock_movements) AS movements,
        (SELECT COUNT(*) FROM archived_inventory) AS archived,
        (SELECT COUNT(*) FROM inventory_change_requests) AS change_requests,
        (SELECT COUNT(*) FROM audit_logs) AS audit_logs,
        (SELECT COUNT(*) FROM system_logs) AS system_logs,
        (SELECT COUNT(*) FROM backup_logs) AS backup_logs,
        (SELECT COUNT(*) FROM branch_settings) AS branch_settings,
        (SELECT COUNT(*) FROM branch_inventory WHERE status = 'Low Stock') AS low_stock,
        (SELECT COUNT(*) FROM branch_inventory WHERE status = 'Out of Stock') AS out_of_stock,
        (SELECT COUNT(DISTINCT DATE(created_at)) FROM sales_transactions) AS sales_days
    `);

    const adminOnlyUsers = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE username <> 'admin'
         OR role <> 'Admin'
         OR status <> 'Active'
    `);

    const missingSystemAdmin = await getScalar(`
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM users
        WHERE username = 'admin'
          AND full_name = 'System Admin'
          AND role = 'Admin'
          AND status = 'Active'
      ) THEN 0 ELSE 1 END::int AS count
    `);

    const insufficientPresentationVolume = await getScalar(`
      SELECT CASE
        WHEN (SELECT COUNT(*) FROM sales_transactions) < 120 THEN 1
        WHEN (SELECT COUNT(*) FROM purchase_transactions) < 40 THEN 1
        WHEN (SELECT COUNT(*) FROM stock_movements) < 700 THEN 1
        WHEN (SELECT COUNT(*) FROM archived_inventory) < 5 THEN 1
        WHEN (SELECT COUNT(*) FROM audit_logs) < 5 THEN 1
        WHEN (SELECT COUNT(*) FROM system_logs) < 5 THEN 1
        WHEN (SELECT COUNT(*) FROM inventory_change_requests) < 4 THEN 1
        WHEN (SELECT COUNT(*) FROM backup_logs) < 1 THEN 1
        WHEN (SELECT COUNT(*) FROM branch_settings) < 2 THEN 1
        ELSE 0
      END::int AS count
    `);

    const insufficientDateSpread = await getScalar(`
      SELECT CASE
        WHEN (SELECT COUNT(*) FROM sales_transactions WHERE DATE(created_at) = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')) < 2 THEN 1
        WHEN (SELECT COUNT(*) FROM sales_transactions WHERE DATE(created_at) = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') - INTERVAL '1 day') < 2 THEN 1
        WHEN (SELECT COUNT(*) FROM sales_transactions WHERE DATE(created_at) = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') + INTERVAL '1 day' AND created_at::time BETWEEN TIME '07:30' AND TIME '09:00') < 1 THEN 1
        WHEN (SELECT COUNT(*) FROM sales_transactions WHERE created_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') - INTERVAL '7 days') < 12 THEN 1
        WHEN (SELECT COUNT(*) FROM sales_transactions WHERE created_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') - INTERVAL '30 days') < 35 THEN 1
        WHEN (SELECT COUNT(*) FROM sales_transactions WHERE created_at < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') - INTERVAL '90 days') < 20 THEN 1
        WHEN (SELECT COUNT(DISTINCT DATE(created_at)) FROM sales_transactions) < 70 THEN 1
        WHEN (SELECT MAX(daily_count) FROM (
          SELECT DATE(created_at), COUNT(*) AS daily_count
          FROM sales_transactions
          GROUP BY DATE(created_at)
        ) sales_by_day) > 8 THEN 1
        ELSE 0
      END::int AS count
    `);

    const emptyBusinessSignals = await getScalar(`
      SELECT CASE
        WHEN (SELECT COUNT(*) FROM branch_inventory WHERE status = 'Low Stock') < 2 THEN 1
        WHEN (SELECT COUNT(*) FROM branch_inventory WHERE status = 'Out of Stock') < 2 THEN 1
        WHEN (SELECT COALESCE(SUM(total_amount), 0) FROM sales_transactions WHERE status = 'completed') <= 0 THEN 1
        WHEN (SELECT COALESCE(SUM(gross_profit), 0) FROM sales_items) <= 0 THEN 1
        WHEN (SELECT COALESCE(SUM(subtotal_amount), 0) FROM purchase_transactions WHERE status = 'completed') <= 0 THEN 1
        ELSE 0
      END::int AS count
    `);

    const branchQualityGaps = await getScalar(`
      WITH branch_metrics AS (
        SELECT
          b.branch,
          COALESCE(i.inventory, 0) AS inventory,
          COALESCE(i.low_stock, 0) AS low_stock,
          COALESCE(i.out_of_stock, 0) AS out_of_stock,
          COALESCE(s.sales, 0) AS sales,
          COALESCE(s.sales_days, 0) AS sales_days,
          COALESCE(s.today_sales, 0) AS today_sales,
          COALESCE(s.yesterday_sales, 0) AS yesterday_sales,
          COALESCE(s.tomorrow_sales, 0) AS tomorrow_sales,
          COALESCE(s.last_7_days, 0) AS last_7_days,
          COALESCE(s.last_30_days, 0) AS last_30_days,
          COALESCE(s.older_than_90_days, 0) AS older_than_90_days,
          COALESCE(s.revenue, 0) AS revenue,
          COALESCE(si.sales_items, 0) AS sales_items,
          COALESCE(si.gross_profit, 0) AS gross_profit,
          COALESCE(p.purchases, 0) AS purchases,
          COALESCE(p.purchase_days, 0) AS purchase_days,
          COALESCE(p.purchase_value, 0) AS purchase_value,
          COALESCE(m.movements, 0) AS movements,
          COALESCE(a.archived, 0) AS archived,
          COALESCE(r.change_requests, 0) AS change_requests
        FROM (VALUES ('Manggahan'), ('San Rafael')) AS b(branch)
        LEFT JOIN (
          SELECT branch,
                 COUNT(*)::int AS inventory,
                 COUNT(*) FILTER (WHERE status = 'Low Stock')::int AS low_stock,
                 COUNT(*) FILTER (WHERE status = 'Out of Stock')::int AS out_of_stock
          FROM branch_inventory
          GROUP BY branch
        ) i USING (branch)
        LEFT JOIN (
          SELECT branch,
                 COUNT(*)::int AS sales,
                 COUNT(DISTINCT DATE(created_at))::int AS sales_days,
                 COUNT(*) FILTER (WHERE DATE(created_at) = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'))::int AS today_sales,
                 COUNT(*) FILTER (WHERE DATE(created_at) = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') - INTERVAL '1 day')::int AS yesterday_sales,
                 COUNT(*) FILTER (
                   WHERE DATE(created_at) = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') + INTERVAL '1 day'
                     AND created_at::time BETWEEN TIME '07:30' AND TIME '09:00'
                 )::int AS tomorrow_sales,
                 COUNT(*) FILTER (
                   WHERE created_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') - INTERVAL '7 days'
                     AND created_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') + INTERVAL '1 day'
                 )::int AS last_7_days,
                 COUNT(*) FILTER (
                   WHERE created_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') - INTERVAL '30 days'
                     AND created_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') + INTERVAL '1 day'
                 )::int AS last_30_days,
                 COUNT(*) FILTER (WHERE created_at < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') - INTERVAL '90 days')::int AS older_than_90_days,
                 COALESCE(SUM(total_amount), 0) AS revenue
          FROM sales_transactions
          WHERE status = 'completed'
          GROUP BY branch
        ) s USING (branch)
        LEFT JOIN (
          SELECT branch,
                 COUNT(*)::int AS sales_items,
                 COALESCE(SUM(gross_profit), 0) AS gross_profit
          FROM sales_items
          GROUP BY branch
        ) si USING (branch)
        LEFT JOIN (
          SELECT branch,
                 COUNT(*)::int AS purchases,
                 COUNT(DISTINCT DATE(created_at))::int AS purchase_days,
                 COALESCE(SUM(subtotal_amount), 0) AS purchase_value
          FROM purchase_transactions
          WHERE status = 'completed'
          GROUP BY branch
        ) p USING (branch)
        LEFT JOIN (
          SELECT branch, COUNT(*)::int AS movements
          FROM stock_movements
          GROUP BY branch
        ) m USING (branch)
        LEFT JOIN (
          SELECT branch, COUNT(*)::int AS archived
          FROM archived_inventory
          GROUP BY branch
        ) a USING (branch)
        LEFT JOIN (
          SELECT branch, COUNT(*)::int AS change_requests
          FROM inventory_change_requests
          GROUP BY branch
        ) r USING (branch)
      )
      SELECT COUNT(*)::int AS count
      FROM branch_metrics
      WHERE inventory < 480
         OR low_stock + out_of_stock < 3
         OR sales < 90
         OR sales_items < 220
         OR sales_days < 75
         OR today_sales < 2
         OR yesterday_sales < 2
         OR tomorrow_sales < 2
         OR last_7_days < 12
         OR last_30_days < 30
         OR older_than_90_days < 45
         OR revenue <= 0
         OR gross_profit <= 0
         OR purchases < 25
         OR purchase_days < 20
         OR purchase_value <= 0
         OR movements < 800
         OR archived < 3
         OR change_requests < 2
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
         OR ABS(st.total_amount - ROUND((GREATEST(COALESCE(si.total, 0) - COALESCE(st.discount_amount, 0), 0) + COALESCE(st.delivery_charge, 0))::numeric, 2)) > 0.01
    `);

    const invalidOfficialInvoiceNumbers = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM sales_transactions
      WHERE (
          transaction_type <> 'refund'
          AND (
            official_invoice_number IS NULL
            OR official_invoice_number !~ '^[0-9]{6}$'
          )
        )
        OR (
          transaction_type = 'refund'
          AND official_invoice_number IS NOT NULL
        )
    `);

    const duplicateOfficialInvoiceNumbers = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT branch, official_invoice_number
        FROM sales_transactions
        WHERE official_invoice_number IS NOT NULL
        GROUP BY branch, official_invoice_number
        HAVING COUNT(*) > 1
      ) duplicate_invoices
    `);

    const invoiceSequenceMismatch = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM invoice_number_sequences seq
      WHERE seq.document_type = 'sales_invoice'
        AND seq.last_number < COALESCE((
          SELECT MAX(official_invoice_number::int)
          FROM sales_transactions
          WHERE official_invoice_number ~ '^[0-9]{6}$'
            AND branch = seq.branch
        ), 0)
    `);

    const invalidVatBreakdown = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM sales_transactions
      WHERE transaction_type <> 'refund'
        AND ABS((COALESCE(vatable_sales, 0) + COALESCE(vat_amount, 0)) - GREATEST(COALESCE(subtotal_amount, 0) - COALESCE(discount_amount, 0), 0)) > 0.01
    `);

    const badPurchaseTotals = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM purchase_transactions pt
      LEFT JOIN (
        SELECT
          purchase_transaction_id,
          SUM(quantity_received)::int AS qty,
          SUM(subtotal)::numeric(12,2) AS total
        FROM purchase_items
        GROUP BY purchase_transaction_id
      ) pi ON pi.purchase_transaction_id = pt.purchase_transaction_id
      WHERE pt.total_quantity != COALESCE(pi.qty, 0)
         OR ABS(pt.subtotal_amount - COALESCE(pi.total, 0)) > 0.01
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
      WHERE created_at > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') + INTERVAL '2 minutes'
        AND NOT (
          DATE(created_at) = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila') + INTERVAL '1 day'
          AND created_at::time BETWEEN TIME '07:30' AND TIME '09:00'
        )
    `);

    const orphanSalesItems = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM sales_items si
      LEFT JOIN sales_transactions st ON st.sales_transaction_id = si.sales_transaction_id
      WHERE st.sales_transaction_id IS NULL
    `);

    const orphanPurchaseItems = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM purchase_items pi
      LEFT JOIN purchase_transactions pt ON pt.purchase_transaction_id = pi.purchase_transaction_id
      WHERE pt.purchase_transaction_id IS NULL
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

    const invalidProfitSnapshots = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM sales_items
      WHERE unit_price < 0
         OR unit_cost_at_sale < 0
         OR cost_subtotal < 0
         OR ABS(cost_subtotal - ROUND((quantity_sold * unit_cost_at_sale)::numeric, 2)) > 0.01
         OR ABS(gross_profit - ROUND((subtotal - cost_subtotal)::numeric, 2)) > 0.01
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

    const purchaseMovementMismatch = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM purchase_items pi
      INNER JOIN purchase_transactions pt
        ON pt.purchase_transaction_id = pi.purchase_transaction_id
      WHERE pt.status = 'completed'
        AND NOT EXISTS (
          SELECT 1
          FROM stock_movements sm
          WHERE sm.inventory_id = pi.inventory_id
            AND sm.product_id = pi.product_id
            AND sm.action = 'stock_in'
            AND sm.reason = 'purchase_received'
            AND sm.quantity_changed = pi.quantity_received
            AND sm.previous_quantity = pi.previous_quantity
            AND sm.new_quantity = pi.new_quantity
            AND sm.branch = pi.branch
        )
    `);

    const result = {
      counts: counts.rows[0],
      adminOnlyUsers,
      missingSystemAdmin,
      insufficientPresentationVolume,
      insufficientDateSpread,
      emptyBusinessSignals,
      branchQualityGaps,
      badSalesTotals,
      invalidOfficialInvoiceNumbers,
      duplicateOfficialInvoiceNumbers,
      invoiceSequenceMismatch,
      invalidVatBreakdown,
      badPurchaseTotals,
      negativeStock,
      statusMismatch,
      orphanSalesItems,
      orphanPurchaseItems,
      orphanInventory,
      invalidPaymentRecords,
      invalidSalesItemQuantities,
      invalidProfitSnapshots,
      salesMovementMismatch,
      purchaseMovementMismatch,
      futureDatedRows
    };

    console.log(JSON.stringify(result, null, 2));
    if (
      adminOnlyUsers !== 0 ||
      missingSystemAdmin !== 0 ||
      insufficientPresentationVolume !== 0 ||
      insufficientDateSpread !== 0 ||
      emptyBusinessSignals !== 0 ||
      branchQualityGaps !== 0 ||
      badSalesTotals !== 0 ||
      invalidOfficialInvoiceNumbers !== 0 ||
      duplicateOfficialInvoiceNumbers !== 0 ||
      invoiceSequenceMismatch !== 0 ||
      invalidVatBreakdown !== 0 ||
      badPurchaseTotals !== 0 ||
      negativeStock !== 0 ||
      statusMismatch !== 0 ||
      orphanSalesItems !== 0 ||
      orphanPurchaseItems !== 0 ||
      orphanInventory !== 0 ||
      invalidPaymentRecords !== 0 ||
      invalidSalesItemQuantities !== 0 ||
      invalidProfitSnapshots !== 0 ||
      salesMovementMismatch !== 0 ||
      purchaseMovementMismatch !== 0 ||
      futureDatedRows !== 0
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Demo inventory verification failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

verifyDemoInventory();
