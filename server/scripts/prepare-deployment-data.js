// Prepares the configured database for clean deployment by preserving users and
// inventory master data while clearing demo transactions and resetting counters.
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

const parseFirstInvoiceNumber = () => {
  const rawValue = String(process.env.DEPLOYMENT_FIRST_OFFICIAL_INVOICE_NUMBER || DEFAULT_FIRST_OFFICIAL_INVOICE_NUMBER).trim();
  if (!/^\d{6}$/.test(rawValue)) {
    throw new Error('DEPLOYMENT_FIRST_OFFICIAL_INVOICE_NUMBER must be exactly 6 digits.');
  }
  const sequence = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('DEPLOYMENT_FIRST_OFFICIAL_INVOICE_NUMBER must be 000001 or greater.');
  }
  return {
    firstInvoiceNumber: rawValue,
    lastIssuedInvoiceNumber: String(sequence - 1).padStart(6, '0'),
    lastIssuedSequence: sequence - 1
  };
};

async function getCounts(client) {
  const result = await client.query(`
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
      (SELECT COUNT(*) FROM audit_logs) AS audit_logs,
      (SELECT COUNT(*) FROM backup_logs) AS backup_logs
  `);
  return result.rows[0];
}

async function prepareDeploymentData() {
  const invoiceSetup = parseFirstInvoiceNumber();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const countsBefore = await getCounts(client);
    const yearResult = await client.query(`SELECT EXTRACT(YEAR FROM ${PHILIPPINE_NOW_SQL})::int AS invoice_year`);
    const invoiceYear = Number(yearResult.rows[0]?.invoice_year || new Date().getFullYear());
    const actorResult = await client.query(`
      SELECT user_id, full_name
      FROM users
      WHERE status = 'Active'
      ORDER BY CASE WHEN role = 'Admin' THEN 0 ELSE 1 END, user_id
      LIMIT 1
    `);
    const actor = actorResult.rows[0] || { user_id: null, full_name: 'System Admin' };

    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_number_sequences (
        document_type VARCHAR(40) NOT NULL,
        invoice_year INTEGER NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
        PRIMARY KEY (document_type, invoice_year),
        CHECK (invoice_year BETWEEN 2000 AND 9999),
        CHECK (last_number >= 0)
      )
    `);

    await client.query(`
      TRUNCATE TABLE
        purchase_items,
        purchase_transactions,
        sales_items,
        sales_transactions,
        stock_movements,
        archived_inventory,
        backup_logs
      RESTART IDENTITY
      CASCADE
    `);

    await client.query(`
      DELETE FROM audit_logs
      WHERE COALESCE(target_type, '') NOT IN ('user', 'users', 'account')
        AND action NOT ILIKE '%USER%'
        AND action NOT ILIKE '%ACCOUNT%'
        AND action NOT ILIKE '%LOGIN%'
        AND action NOT ILIKE '%PASSWORD%'
        AND action NOT ILIKE '%OTP%'
    `);

    await client.query(
      `INSERT INTO invoice_number_sequences (document_type, invoice_year, last_number, updated_at)
       VALUES ($1, $2, $3, ${PHILIPPINE_NOW_SQL})
       ON CONFLICT (document_type, invoice_year) DO UPDATE
       SET last_number = EXCLUDED.last_number,
           updated_at = ${PHILIPPINE_NOW_SQL}`,
      [SALES_INVOICE_DOCUMENT_TYPE, invoiceYear, invoiceSetup.lastIssuedSequence]
    );

    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_name, target_type, action, reason, details, created_at)
       VALUES ($1, $2, 'system_deployment', 'PREPARE_DEPLOYMENT_DATA', $3, $4::jsonb, ${PHILIPPINE_NOW_SQL})`,
      [
        actor.user_id,
        actor.full_name,
        'Prepared clean deployment data while preserving user accounts and inventory master records.',
        JSON.stringify({
          preserved: ['users', 'products', 'branch_inventory'],
          cleared: [
            'sales_transactions',
            'sales_items',
            'purchase_transactions',
            'purchase_items',
            'stock_movements',
            'archived_inventory',
            'backup_logs',
            'non-account audit logs'
          ],
          firstOfficialInvoiceNumber: invoiceSetup.firstInvoiceNumber,
          firstSystemSalesReference: `SALE-${invoiceYear}-00001`,
          invoiceYear
        })
      ]
    );

    const countsAfter = await getCounts(client);
    await client.query('COMMIT');

    console.log(JSON.stringify({
      status: 'deployment_ready',
      firstOfficialInvoiceNumber: invoiceSetup.firstInvoiceNumber,
      invoiceSequenceLastNumber: invoiceSetup.lastIssuedInvoiceNumber,
      firstSystemSalesReference: `SALE-${invoiceYear}-00001`,
      countsBefore,
      countsAfter
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to prepare deployment data:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

prepareDeploymentData();
