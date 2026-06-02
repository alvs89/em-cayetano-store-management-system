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
        SELECT official_invoice_number
        FROM sales_transactions
        WHERE official_invoice_number IS NOT NULL
        GROUP BY official_invoice_number
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
      WHERE created_at > TIMESTAMP '2026-05-30 14:20:00'
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
      salesMovementMismatch,
      purchaseMovementMismatch,
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
