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
const SALES_INVOICE_SEQUENCE_DIGITS = 6;
const SALES_INVOICE_MAX_NUMBER = Number('9'.repeat(SALES_INVOICE_SEQUENCE_DIGITS));
const DEFAULT_FIRST_OFFICIAL_INVOICE_NUMBER = '000001';

const parseFirstInvoiceNumber = () => {
  const rawValue = String(process.env.DEPLOYMENT_FIRST_OFFICIAL_INVOICE_NUMBER || DEFAULT_FIRST_OFFICIAL_INVOICE_NUMBER).trim();
  if (!/^\d{6}$/.test(rawValue)) {
    throw new Error('DEPLOYMENT_FIRST_OFFICIAL_INVOICE_NUMBER must be exactly 6 digits.');
  }
  const sequence = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > SALES_INVOICE_MAX_NUMBER) {
    throw new Error('DEPLOYMENT_FIRST_OFFICIAL_INVOICE_NUMBER must be from 000001 to 999999.');
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

async function getInventoryResetSummary(client) {
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM archived_inventory) AS archived_items,
      (SELECT COUNT(*)
       FROM archived_inventory ai
       INNER JOIN products p ON p.product_id = ai.product_id
       WHERE ai.product_id IS NOT NULL) AS restorable_archived_items,
      (SELECT COUNT(*)
       FROM branch_inventory
       WHERE stock_level IS NULL
          OR min_stock_level IS NULL
          OR stock_level < 0
          OR min_stock_level < 0
          OR average_daily_sales IS NOT NULL
          OR manual_average_daily_sales IS NOT NULL
          OR COALESCE(NULLIF(TRIM(average_daily_sales_override_reason), ''), '') <> ''
          OR average_daily_sales_mode <> 'auto'
          OR lead_time_days IS NOT NULL
          OR safety_stock IS NOT NULL) AS inventory_rows_needing_refresh
  `);
  return result.rows[0];
}

async function prepareDeploymentData() {
  const invoiceSetup = parseFirstInvoiceNumber();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const countsBefore = await getCounts(client);
    const inventoryResetBefore = await getInventoryResetSummary(client);
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
        branch VARCHAR(50) NOT NULL DEFAULT 'Manggahan',
        last_number INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
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
      INSERT INTO branch_inventory (
        product_id,
        branch,
        stock_level,
        min_stock_level,
        lead_time_days,
        safety_stock,
        average_daily_sales,
        average_daily_sales_mode,
        manual_average_daily_sales,
        average_daily_sales_override_reason,
        status,
        last_updated
      )
      SELECT
        ai.product_id,
        ai.branch,
        GREATEST(COALESCE(ai.stock_level, 0), 0),
        GREATEST(COALESCE(ai.min_stock_level, 5), 0),
        NULL,
        NULL,
        NULL,
        'auto',
        NULL,
        NULL,
        CASE
          WHEN GREATEST(COALESCE(ai.stock_level, 0), 0) <= 0 THEN 'Out of Stock'
          WHEN GREATEST(COALESCE(ai.stock_level, 0), 0) <= GREATEST(COALESCE(ai.min_stock_level, 5), 0) THEN 'Low Stock'
          ELSE 'In Stock'
        END,
        ${PHILIPPINE_NOW_SQL}
      FROM archived_inventory ai
      INNER JOIN products p ON p.product_id = ai.product_id
      WHERE ai.product_id IS NOT NULL
      ON CONFLICT (product_id, branch) DO UPDATE
      SET stock_level = GREATEST(COALESCE(branch_inventory.stock_level, 0), EXCLUDED.stock_level),
          min_stock_level = GREATEST(COALESCE(branch_inventory.min_stock_level, 0), EXCLUDED.min_stock_level),
          lead_time_days = NULL,
          safety_stock = NULL,
          average_daily_sales = NULL,
          average_daily_sales_mode = 'auto',
          manual_average_daily_sales = NULL,
          average_daily_sales_override_reason = NULL,
          status = CASE
            WHEN GREATEST(COALESCE(branch_inventory.stock_level, 0), EXCLUDED.stock_level) <= 0 THEN 'Out of Stock'
            WHEN GREATEST(COALESCE(branch_inventory.stock_level, 0), EXCLUDED.stock_level) <= GREATEST(COALESCE(branch_inventory.min_stock_level, 0), EXCLUDED.min_stock_level) THEN 'Low Stock'
            ELSE 'In Stock'
          END,
          last_updated = ${PHILIPPINE_NOW_SQL}
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

    await client.query(`
      UPDATE branch_inventory
      SET stock_level = GREATEST(COALESCE(stock_level, 0), 0),
          min_stock_level = GREATEST(COALESCE(min_stock_level, 5), 0),
          lead_time_days = NULL,
          safety_stock = NULL,
          average_daily_sales = NULL,
          average_daily_sales_mode = 'auto',
          manual_average_daily_sales = NULL,
          average_daily_sales_override_reason = NULL,
          status = CASE
            WHEN GREATEST(COALESCE(stock_level, 0), 0) <= 0 THEN 'Out of Stock'
            WHEN GREATEST(COALESCE(stock_level, 0), 0) <= GREATEST(COALESCE(min_stock_level, 5), 0) THEN 'Low Stock'
            ELSE 'In Stock'
          END,
          last_updated = ${PHILIPPINE_NOW_SQL}
    `);

    await client.query(`
      WITH known_branches AS (
        SELECT DISTINCT branch
        FROM users
        WHERE branch IS NOT NULL AND TRIM(branch) <> ''
        UNION
        SELECT DISTINCT branch
        FROM branch_inventory
        WHERE branch IS NOT NULL AND TRIM(branch) <> ''
        UNION
        VALUES ('Manggahan'), ('San Rafael')
      )
      INSERT INTO invoice_number_sequences (document_type, invoice_year, branch, last_number, updated_at)
      SELECT $1, $2, branch, $3, ${PHILIPPINE_NOW_SQL}
      FROM known_branches
      ON CONFLICT (document_type, invoice_year, branch) DO UPDATE
      SET last_number = EXCLUDED.last_number,
          updated_at = ${PHILIPPINE_NOW_SQL}
    `, [SALES_INVOICE_DOCUMENT_TYPE, invoiceYear, invoiceSetup.lastIssuedSequence]);

    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_name, target_type, action, reason, details, created_at)
       VALUES ($1, $2, 'system_deployment', 'PREPARE_DEPLOYMENT_DATA', $3, $4::jsonb, ${PHILIPPINE_NOW_SQL})`,
      [
        actor.user_id,
        actor.full_name,
        'Prepared clean deployment data while preserving user accounts, products, and active inventory records.',
        JSON.stringify({
          preserved: ['users', 'products', 'branch_inventory stock counts'],
          refreshed: [
            'stock statuses',
            'negative or missing stock values',
            'average daily sales planning values',
            'manual average daily sales overrides',
            'supplier lead time and safety stock planning fields',
            'archived inventory restored when linked to a product, then cleared'
          ],
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
          invoiceSequenceScope: 'per_branch',
          firstSystemSalesReference: `SALE-${invoiceYear}-00001`,
          inventoryResetBefore,
          invoiceYear
        })
      ]
    );

    const countsAfter = await getCounts(client);
    const inventoryResetAfter = await getInventoryResetSummary(client);
    await client.query('COMMIT');

    console.log(JSON.stringify({
      status: 'deployment_ready',
      firstOfficialInvoiceNumber: invoiceSetup.firstInvoiceNumber,
      invoiceSequenceLastNumber: invoiceSetup.lastIssuedInvoiceNumber,
      firstSystemSalesReference: `SALE-${invoiceYear}-00001`,
      countsBefore,
      countsAfter,
      inventoryResetBefore,
      inventoryResetAfter
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
