// Verifies the clean deployment state after transactional demo data is cleared.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined
});

const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Manila';
const PHILIPPINE_NOW_SQL = `(CURRENT_TIMESTAMP AT TIME ZONE '${APP_TIME_ZONE}')`;
const SALES_INVOICE_DOCUMENT_TYPE = 'sales_invoice';
const DEFAULT_FIRST_OFFICIAL_INVOICE_NUMBER = '000001';

const getFirstInvoiceSequence = () => {
  const rawValue = String(process.env.DEPLOYMENT_FIRST_OFFICIAL_INVOICE_NUMBER || DEFAULT_FIRST_OFFICIAL_INVOICE_NUMBER).trim();
  if (!/^\d{6}$/.test(rawValue)) return 1;
  return Number.parseInt(rawValue, 10);
};

async function getScalar(query, params = []) {
  const result = await pool.query(query, params);
  return Number(result.rows[0]?.count || 0);
}

async function verifyDeploymentData() {
  try {
    const firstInvoiceSequence = getFirstInvoiceSequence();
    const expectedLastInvoiceSequence = firstInvoiceSequence - 1;
    const countsResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM branch_inventory) AS inventory,
        (SELECT COUNT(*) FROM sales_transactions) AS sales,
        (SELECT COUNT(*) FROM sales_items) AS sales_items,
        (SELECT COUNT(*) FROM purchase_transactions) AS purchases,
        (SELECT COUNT(*) FROM purchase_items) AS purchase_items,
        (SELECT COUNT(*) FROM stock_movements) AS stock_movements,
        (SELECT COUNT(*) FROM archived_inventory) AS archived_inventory,
        (SELECT COUNT(*) FROM backup_logs) AS backup_logs
    `);

    const transactionDataRemaining = await getScalar(`
      SELECT (
        (SELECT COUNT(*) FROM sales_transactions) +
        (SELECT COUNT(*) FROM sales_items) +
        (SELECT COUNT(*) FROM purchase_transactions) +
        (SELECT COUNT(*) FROM purchase_items) +
        (SELECT COUNT(*) FROM stock_movements) +
        (SELECT COUNT(*) FROM archived_inventory) +
        (SELECT COUNT(*) FROM backup_logs)
      )::int AS count
    `);

    const missingInventoryMasterData = await getScalar(`
      SELECT CASE
        WHEN (SELECT COUNT(*) FROM products) = 0 THEN 1
        WHEN (SELECT COUNT(*) FROM branch_inventory) = 0 THEN 1
        WHEN (SELECT COUNT(*) FROM users) = 0 THEN 1
        ELSE 0
      END::int AS count
    `);

    const invoiceSequenceMismatch = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM invoice_number_sequences
      WHERE document_type = $1
        AND invoice_year = EXTRACT(YEAR FROM ${PHILIPPINE_NOW_SQL})::int
        AND last_number = $2
    `, [SALES_INVOICE_DOCUMENT_TYPE, expectedLastInvoiceSequence]);

    const orphanInventory = await getScalar(`
      SELECT COUNT(*)::int AS count
      FROM branch_inventory bi
      LEFT JOIN products p ON p.product_id = bi.product_id
      WHERE p.product_id IS NULL
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

    const result = {
      counts: countsResult.rows[0],
      expectedFirstOfficialInvoiceNumber: String(firstInvoiceSequence).padStart(6, '0'),
      expectedFirstSystemSalesReference: `SALE-${new Date().getFullYear()}-00001`,
      transactionDataRemaining,
      missingInventoryMasterData,
      invoiceSequenceReady: invoiceSequenceMismatch === 1,
      orphanInventory,
      negativeStock,
      statusMismatch
    };

    console.log(JSON.stringify(result, null, 2));
    if (
      transactionDataRemaining !== 0 ||
      missingInventoryMasterData !== 0 ||
      invoiceSequenceMismatch !== 1 ||
      orphanInventory !== 0 ||
      negativeStock !== 0 ||
      statusMismatch !== 0
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Deployment verification failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

verifyDeploymentData();
