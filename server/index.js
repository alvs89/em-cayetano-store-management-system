// Backend API server for authentication, inventory, sales, purchases, reports,
// audit trail, backup/restore, and maintenance workflows.
require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { Pool, types } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;
const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const OTP_RATE_LIMIT_MAX_RESENDS = 5;
const OTP_RATE_LIMIT_MAX_REQUESTS = OTP_RATE_LIMIT_MAX_RESENDS + 1; // initial send + allowed resends
const APP_TIME_ZONE = 'Asia/Manila';
const APP_TIMESTAMP_OFFSET = '+08:00';
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password12',
  'password123',
  'admin123',
  'admin1234',
  'qwerty123',
  'qwerty1234',
  'abcdefgh',
  'abcdefghi',
  'abcdefghij',
  'abcdefg123',
  'abcdef123',
  'abc12345',
  'abc123456',
  'abcd1234',
  'qwertyui',
  'qwertyuiop',
  'asdfghjk',
  'asdfghjkl',
  'zxcvbnm1',
  'zxcvbnm12',
  'letmein123',
  'welcome123',
  'store123',
  'emcayetano',
  'emcayetano123'
]);
const SYSTEM_LOG_RETENTION_DAYS = Math.max(
  1,
  Number.parseInt(process.env.SYSTEM_LOG_RETENTION_DAYS || '30', 10) || 30
);
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-secret');
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || process.env.CLIENT_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const ALLOWED_ROLES = ['Admin', 'Cashier', 'Inventory Staff'];
const ALLOWED_BRANCHES = ['Manggahan', 'San Rafael'];
const OFFICIAL_INVENTORY_CATEGORIES = [
  'Roofing',
  'PVC Pipe / Fittings',
  'Steel',
  'Kiln Dry',
  'Plywood',
  'Electricals',
  'Paints',
  'Other'
];
const CATEGORY_ALIASES = {
  roofing: 'Roofing',
  roof: 'Roofing',
  yero: 'Roofing',
  pvc: 'PVC Pipe / Fittings',
  'pvc pipe / fittings': 'PVC Pipe / Fittings',
  'pvc pipes / fittings': 'PVC Pipe / Fittings',
  'pvc pipe': 'PVC Pipe / Fittings',
  'pvc pipes': 'PVC Pipe / Fittings',
  plumbing: 'PVC Pipe / Fittings',
  plumber: 'PVC Pipe / Fittings',
  fittings: 'PVC Pipe / Fittings',
  fitting: 'PVC Pipe / Fittings',
  steel: 'Steel',
  construction: 'Steel',
  metal: 'Steel',
  'kiln dry': 'Kiln Dry',
  kiln: 'Kiln Dry',
  lumber: 'Kiln Dry',
  wood: 'Kiln Dry',
  plywood: 'Plywood',
  electricals: 'Electricals',
  electrical: 'Electricals',
  electric: 'Electricals',
  paint: 'Paints',
  paints: 'Paints',
  tool: 'Other',
  tools: 'Other',
  tooling: 'Other',
  cement: 'Other',
  cements: 'Other',
  hardware: 'Other',
  fastener: 'Other',
  fasteners: 'Other',
  screw: 'Other',
  screws: 'Other',
  nail: 'Other',
  nails: 'Other',
  safety: 'Other',
  misc: 'Other',
  miscellaneous: 'Other',
  other: 'Other'
};
const INVENTORY_UNIT_ALIASES = {
  ounce: 'oz',
  ounces: 'oz',
  oz: 'oz',
  a: 'a',
  amp: 'a',
  amps: 'a',
  ampere: 'a',
  amperes: 'a',
  v: 'v',
  volt: 'v',
  volts: 'v',
  w: 'w',
  watt: 'w',
  watts: 'w',
  in: 'in',
  inch: 'in',
  inches: 'in',
  mm: 'mm',
  millimeter: 'mm',
  millimeters: 'mm',
  cm: 'cm',
  centimeter: 'cm',
  centimeters: 'cm',
  m: 'm',
  meter: 'm',
  meters: 'm',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  g: 'g',
  gram: 'g',
  grams: 'g',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  ft: 'ft',
  foot: 'ft',
  feet: 'ft',
  feets: 'ft',
  pc: 'pc',
  pcs: 'pc',
  piece: 'pc',
  pieces: 'pc'
};

// In-memory OTP request tracking is suitable for this single-server/local setup.
// For multi-instance production deployments, replace this with database-backed
// or Redis-backed rate limiting so attempts are shared across server instances.
const otpRequestBuckets = new Map();

// PostgreSQL TIMESTAMP values are stored without timezone metadata. This system
// stores them as Philippine local time, so parse them with an explicit +08:00
// offset instead of the Node process timezone.
types.setTypeParser(1114, (value) => new Date(`${value.replace(' ', 'T')}${APP_TIMESTAMP_OFFSET}`));

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured in production.');
}

if (process.env.NODE_ENV === 'production' && CORS_ALLOWED_ORIGINS.length === 0) {
  throw new Error('CORS_ORIGIN must be configured in production.');
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || CORS_ALLOWED_ORIGINS.length === 0 || CORS_ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err);
});

pool.on('connect', (client) => {
  client.query(`SET TIME ZONE '${APP_TIME_ZONE}'; SET search_path TO public;`).catch((err) => {
    console.error('Failed to initialize database session settings:', err.message);
  });
});

const PHILIPPINE_NOW_SQL = `(CURRENT_TIMESTAMP AT TIME ZONE '${APP_TIME_ZONE}')`;
const BACKDATE_FUTURE_TOLERANCE_MS = 60 * 1000;
const SALES_INVOICE_DOCUMENT_TYPE = 'sales_invoice';
const SALES_INVOICE_SEQUENCE_DIGITS = 6;
const SALES_INVOICE_NUMBER_PATTERN = '^[0-9]{6}$';
const SALES_INVOICE_MAX_NUMBER = Number('9'.repeat(SALES_INVOICE_SEQUENCE_DIGITS));
const LEGACY_SALES_INVOICE_NUMBER_PATTERN = `^SI-[0-9]{4}-[0-9]{${SALES_INVOICE_SEQUENCE_DIGITS}}$`;
const LEGACY_SALES_INVOICE_NUMBER_REGEX = new RegExp(`^SI-\\d{4}-(\\d{${SALES_INVOICE_SEQUENCE_DIGITS}})$`, 'i');
const SALES_INVOICE_START_NUMBER = Math.max(
  1,
  Number.parseInt(process.env.SALES_INVOICE_START_NUMBER || '1', 10) || 1
);

function extractLegacyOfficialSalesInvoiceNumber(value) {
  const match = String(value || '').trim().match(LEGACY_SALES_INVOICE_NUMBER_REGEX);
  return match ? match[1] : '';
}

function resolveOfficialSalesInvoiceNumber(officialInvoiceNumber, salesNumber) {
  const cleanOfficialInvoiceNumber = String(officialInvoiceNumber || '').trim();
  if (new RegExp(SALES_INVOICE_NUMBER_PATTERN).test(cleanOfficialInvoiceNumber)) {
    return cleanOfficialInvoiceNumber;
  }
  return extractLegacyOfficialSalesInvoiceNumber(cleanOfficialInvoiceNumber)
    || extractLegacyOfficialSalesInvoiceNumber(salesNumber)
    || cleanOfficialInvoiceNumber;
}

async function ensureSchema() {
  await pool.query('CREATE SCHEMA IF NOT EXISTS public;');
  await pool.query('SET search_path TO public;');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_key TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL}
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_number_sequences (
      document_type VARCHAR(40) NOT NULL,
      invoice_year INTEGER NOT NULL,
      branch VARCHAR(50) NOT NULL DEFAULT 'Manggahan',
      last_number INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      PRIMARY KEY (document_type, invoice_year, branch),
      CHECK (invoice_year BETWEEN 2000 AND 9999),
      CHECK (last_number BETWEEN 0 AND ${SALES_INVOICE_MAX_NUMBER})
    );
  `);
  await pool.query(`
    ALTER TABLE invoice_number_sequences
    ADD COLUMN IF NOT EXISTS branch VARCHAR(50);
  `);
  await pool.query(`
    UPDATE invoice_number_sequences
    SET branch = 'Manggahan'
    WHERE branch IS NULL OR TRIM(branch) = '';
  `);
  await pool.query(`
    ALTER TABLE invoice_number_sequences
    ALTER COLUMN branch SET NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE invoice_number_sequences
    DROP CONSTRAINT IF EXISTS invoice_number_sequences_last_number_check;
  `);
  await pool.query(`
    UPDATE invoice_number_sequences
    SET last_number = LEAST(GREATEST(COALESCE(last_number, 0), 0), ${SALES_INVOICE_MAX_NUMBER});
  `);
  await pool.query(`
    ALTER TABLE invoice_number_sequences
    ADD CONSTRAINT invoice_number_sequences_last_number_check
    CHECK (last_number BETWEEN 0 AND ${SALES_INVOICE_MAX_NUMBER});
  `);
  await pool.query(`
    ALTER TABLE invoice_number_sequences
    DROP CONSTRAINT IF EXISTS invoice_number_sequences_pkey;
  `);
  await pool.query(`
    ALTER TABLE invoice_number_sequences
    ADD CONSTRAINT invoice_number_sequences_pkey PRIMARY KEY (document_type, invoice_year, branch);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id SERIAL PRIMARY KEY,
      full_name VARCHAR(100) NOT NULL,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(30) CHECK (role IN ('Admin', 'Cashier', 'Inventory Staff')) NOT NULL,
      branch VARCHAR(50),
      status VARCHAR(20) DEFAULT 'Active',
      must_change_password BOOLEAN DEFAULT false,
      otp_code VARCHAR(10),
      otp_expires TIMESTAMP,
      login_otp_code VARCHAR(10),
      login_otp_expires TIMESTAMP,
      reset_otp_code VARCHAR(10),
      reset_otp_expires TIMESTAMP,
      token_version INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL}
    );
  `);

  // Removed out-of-scope Daily Operations / Invoice Series modules. Drop legacy tables
  // if they exist in older Neon databases so they cannot be mistaken for active data.
  await pool.query('DROP TABLE IF EXISTS invoice_series_entries CASCADE;');
  await pool.query('DROP TABLE IF EXISTS daily_operations CASCADE;');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      product_id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      category VARCHAR(50) NOT NULL,
      category_note TEXT,
      supplier_name VARCHAR(120),
      default_selling_price NUMERIC(12,2),
      cost_price NUMERIC(12,2),
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL}
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS branch_inventory (
      inventory_id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
      branch VARCHAR(50) NOT NULL,
      stock_level INTEGER DEFAULT 0,
      min_stock_level INTEGER DEFAULT 5,
      lead_time_days INTEGER,
      safety_stock INTEGER,
      average_daily_sales NUMERIC(10,2),
      average_daily_sales_mode VARCHAR(20) DEFAULT 'auto',
      manual_average_daily_sales NUMERIC(10,2),
      average_daily_sales_override_reason TEXT,
      status VARCHAR(20) DEFAULT 'In Stock',
      last_updated TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      UNIQUE (product_id, branch)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      movement_id SERIAL PRIMARY KEY,
      inventory_id INT,
      product_id INT,
      item_name VARCHAR(150) NOT NULL,
      category VARCHAR(50) NOT NULL,
      branch VARCHAR(50) NOT NULL,
      action VARCHAR(20) CHECK (action IN ('stock_in', 'stock_out', 'initial_stock', 'adjustment')) NOT NULL,
      quantity_changed INTEGER NOT NULL,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      reason VARCHAR(40),
      note TEXT,
      actor_id INT REFERENCES users(user_id) ON DELETE SET NULL,
      actor_name TEXT,
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      encoded_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      backdate_reason TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_transactions (
      sales_transaction_id SERIAL PRIMARY KEY,
      sales_number VARCHAR(40) UNIQUE NOT NULL,
      official_invoice_number VARCHAR(40),
      official_invoice_expected_number VARCHAR(40),
      official_invoice_exception_reason TEXT,
      branch VARCHAR(50) NOT NULL,
      customer_type VARCHAR(40) DEFAULT 'walk_in' CHECK (customer_type IN ('walk_in', 'sister_company', 'hardware_reseller', 'regular', 'contractor')),
      customer_name VARCHAR(160) NOT NULL DEFAULT 'C',
      customer_tin VARCHAR(80),
      customer_address VARCHAR(240) NOT NULL DEFAULT 'C',
      total_quantity INTEGER NOT NULL DEFAULT 0,
      subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount_type VARCHAR(40) DEFAULT 'none',
      discount_label VARCHAR(120),
      delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
      vatable_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
      vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(30) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'gcash', 'bank_transfer', 'credit')),
      amount_received NUMERIC(12,2),
      change_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      payment_reference VARCHAR(120),
      payment_confirmed BOOLEAN NOT NULL DEFAULT false,
      payment_confirmed_by INT REFERENCES users(user_id) ON DELETE SET NULL,
      payment_confirmed_by_name TEXT,
      payment_confirmed_at TIMESTAMP,
      status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
      transaction_type VARCHAR(20) DEFAULT 'sale' CHECK (transaction_type IN ('sale', 'refund')),
      reference_sales_transaction_id INT REFERENCES sales_transactions(sales_transaction_id) ON DELETE SET NULL,
      sold_by INT REFERENCES users(user_id) ON DELETE SET NULL,
      sold_by_name TEXT,
      remarks TEXT,
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      encoded_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      backdate_reason TEXT,
      cancelled_at TIMESTAMP,
      cancelled_by INT REFERENCES users(user_id) ON DELETE SET NULL,
      cancel_reason TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_items (
      sales_item_id SERIAL PRIMARY KEY,
      sales_transaction_id INT NOT NULL REFERENCES sales_transactions(sales_transaction_id) ON DELETE CASCADE,
      item_type VARCHAR(20) NOT NULL DEFAULT 'inventory' CHECK (item_type IN ('inventory', 'non_inventory')),
      inventory_id INT,
      product_id INT,
      is_inventory_item BOOLEAN NOT NULL DEFAULT true,
      item_name VARCHAR(150) NOT NULL,
      category VARCHAR(50) NOT NULL,
      category_note TEXT,
      branch VARCHAR(50) NOT NULL,
      quantity_sold INTEGER NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      unit_cost_at_sale NUMERIC(12,2) NOT NULL DEFAULT 0,
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      cost_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      gross_profit NUMERIC(12,2) NOT NULL DEFAULT 0,
      profit_margin_percent NUMERIC(7,2) NOT NULL DEFAULT 0,
      previous_quantity INTEGER,
      new_quantity INTEGER,
      refund_for_sales_item_id INT REFERENCES sales_items(sales_item_id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL}
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_transactions (
      purchase_transaction_id SERIAL PRIMARY KEY,
      purchase_number VARCHAR(40) UNIQUE NOT NULL,
      branch VARCHAR(50) NOT NULL,
      supplier_name VARCHAR(120) NOT NULL,
      document_type VARCHAR(20) DEFAULT 'DR' CHECK (document_type IN ('DR', 'SI', 'OR', 'OTHER')),
      document_type_note TEXT,
      document_number VARCHAR(80),
      payment_terms VARCHAR(30) DEFAULT 'cash' CHECK (payment_terms IN ('cash', 'cod', 'credit', 'branch_transfer')),
      subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_quantity INTEGER NOT NULL DEFAULT 0,
      remarks TEXT,
      status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
      encoded_by INT REFERENCES users(user_id) ON DELETE SET NULL,
      encoded_by_name TEXT,
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      encoded_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      backdate_reason TEXT,
      cancelled_at TIMESTAMP,
      cancelled_by INT REFERENCES users(user_id) ON DELETE SET NULL,
      cancel_reason TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      purchase_item_id SERIAL PRIMARY KEY,
      purchase_transaction_id INT NOT NULL REFERENCES purchase_transactions(purchase_transaction_id) ON DELETE CASCADE,
      inventory_id INT REFERENCES branch_inventory(inventory_id) ON DELETE SET NULL,
      product_id INT REFERENCES products(product_id) ON DELETE SET NULL,
      item_name VARCHAR(150) NOT NULL,
      category VARCHAR(50) NOT NULL,
      category_note TEXT,
      branch VARCHAR(50) NOT NULL,
      quantity_received INTEGER NOT NULL,
      unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      previous_quantity INTEGER NOT NULL DEFAULT 0,
      new_quantity INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL}
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS archived_inventory (
      archived_inventory_id SERIAL PRIMARY KEY,
      original_inventory_id INT,
      product_id INT,
      name VARCHAR(150) NOT NULL,
      category VARCHAR(50) NOT NULL,
      category_note TEXT,
      branch VARCHAR(50) NOT NULL,
      stock_level INTEGER DEFAULT 0,
      min_stock_level INTEGER DEFAULT 5,
      lead_time_days INTEGER,
      safety_stock INTEGER,
      average_daily_sales NUMERIC(10,2),
      average_daily_sales_mode VARCHAR(20) DEFAULT 'auto',
      manual_average_daily_sales NUMERIC(10,2),
      average_daily_sales_override_reason TEXT,
      status VARCHAR(20) DEFAULT 'In Stock',
      supplier_name VARCHAR(120),
      default_selling_price NUMERIC(12,2),
      cost_price NUMERIC(12,2),
      last_updated TIMESTAMP,
      archived_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      archive_reason VARCHAR(40),
      archive_reason_note TEXT,
      archived_by INT REFERENCES users(user_id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      actor_id INT,
      actor_name TEXT,
      target_id INT,
      target_name TEXT,
      target_type VARCHAR(60),
      action TEXT,
      reason TEXT,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL}
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backup_logs (
      id SERIAL PRIMARY KEY,
      action VARCHAR(20) NOT NULL,
      actor_id INT,
      actor_name TEXT,
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL}
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS branch_settings (
      branch VARCHAR(50) PRIMARY KEY,
      daily_sales_target NUMERIC(12,2),
      updated_by INT REFERENCES users(user_id) ON DELETE SET NULL,
      updated_by_name TEXT,
      updated_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL}
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(80) NOT NULL,
      severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error')),
      message TEXT NOT NULL,
      context JSONB DEFAULT '{}'::jsonb,
      actor_id INT REFERENCES users(user_id) ON DELETE SET NULL,
      actor_name TEXT,
      is_security BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL}
    );
  `);

  await pool.query(`
    ALTER TABLE users
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE users
    ALTER COLUMN role TYPE VARCHAR(30);
  `);

  await pool.query(`
    ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check;
  `);

  await pool.query(`
    UPDATE users
    SET role = 'Inventory Staff'
    WHERE role = 'Employee';
  `);

  await pool.query(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('Admin', 'Cashier', 'Inventory Staff'));
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
  `);

  await pool.query(`
    ALTER TABLE products
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(120);
  `);

  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS category_note TEXT;
  `);

  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS default_selling_price NUMERIC(12,2);
  `);

  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2);
  `);

  await pool.query(`
    ALTER TABLE branch_inventory
    ALTER COLUMN last_updated SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE branch_inventory
    ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;
  `);

  await pool.query(`
    ALTER TABLE branch_inventory
    ADD COLUMN IF NOT EXISTS safety_stock INTEGER;
  `);

  await pool.query(`
    ALTER TABLE branch_inventory
    ADD COLUMN IF NOT EXISTS average_daily_sales NUMERIC(10,2);
  `);

  await pool.query(`
    ALTER TABLE branch_inventory
    ADD COLUMN IF NOT EXISTS average_daily_sales_mode VARCHAR(20) DEFAULT 'auto';
  `);

  await pool.query(`
    ALTER TABLE branch_inventory
    ADD COLUMN IF NOT EXISTS manual_average_daily_sales NUMERIC(10,2);
  `);

  await pool.query(`
    ALTER TABLE branch_inventory
    ADD COLUMN IF NOT EXISTS average_daily_sales_override_reason TEXT;
  `);

  await pool.query(`
    ALTER TABLE branch_inventory
    ALTER COLUMN lead_time_days DROP DEFAULT,
    ALTER COLUMN safety_stock DROP DEFAULT,
    ALTER COLUMN average_daily_sales DROP DEFAULT;
  `);

  await pool.query(`
    ALTER TABLE stock_movements
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);
  await pool.query(`
    ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS encoded_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL};
  `);
  await pool.query(`
    ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS backdate_reason TEXT;
  `);
  await pool.query(`
    UPDATE stock_movements
    SET encoded_at = COALESCE(encoded_at, created_at, ${PHILIPPINE_NOW_SQL})
    WHERE encoded_at IS NULL;
  `);

  await pool.query(`
    ALTER TABLE stock_movements
    ADD COLUMN IF NOT EXISTS reason VARCHAR(40);
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS encoded_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL};
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS backdate_reason TEXT;
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) DEFAULT 'sale';
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    DROP CONSTRAINT IF EXISTS sales_transactions_transaction_type_check;
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD CONSTRAINT sales_transactions_transaction_type_check CHECK (transaction_type IN ('sale', 'refund'));
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS reference_sales_transaction_id INT REFERENCES sales_transactions(sales_transaction_id) ON DELETE SET NULL;
  `);
  await pool.query(`
    UPDATE sales_transactions
    SET transaction_type = COALESCE(NULLIF(TRIM(transaction_type), ''), 'sale')
    WHERE transaction_type IS NULL OR TRIM(transaction_type) = '';
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS official_invoice_number VARCHAR(40);
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS official_invoice_expected_number VARCHAR(40);
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS official_invoice_exception_reason TEXT;
  `);
  await pool.query(`
    DROP INDEX IF EXISTS sales_transactions_official_invoice_number_unique;
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    DROP CONSTRAINT IF EXISTS sales_transactions_official_invoice_number_check;
  `);
  await pool.query(`
    WITH legacy_invoice_candidates AS (
      SELECT
        sales_transaction_id,
        branch,
        RIGHT(
          CASE
            WHEN TRIM(COALESCE(official_invoice_number, '')) ~ '${LEGACY_SALES_INVOICE_NUMBER_PATTERN}'
              THEN TRIM(official_invoice_number)
            ELSE TRIM(sales_number)
          END,
          ${SALES_INVOICE_SEQUENCE_DIGITS}
        ) AS legacy_invoice_number
      FROM sales_transactions
      WHERE transaction_type <> 'refund'
        AND (
          TRIM(COALESCE(official_invoice_number, '')) ~ '${LEGACY_SALES_INVOICE_NUMBER_PATTERN}'
          OR (
            (
              official_invoice_number IS NULL
              OR TRIM(official_invoice_number) = ''
              OR official_invoice_number !~ '${SALES_INVOICE_NUMBER_PATTERN}'
            )
            AND TRIM(sales_number) ~ '${LEGACY_SALES_INVOICE_NUMBER_PATTERN}'
          )
        )
    ),
    unique_legacy_invoice_candidates AS (
      SELECT
        sales_transaction_id,
        branch,
        legacy_invoice_number,
        COUNT(*) OVER (PARTITION BY branch, legacy_invoice_number) AS duplicate_count
      FROM legacy_invoice_candidates
    )
    UPDATE sales_transactions st
    SET official_invoice_number = ulic.legacy_invoice_number
    FROM unique_legacy_invoice_candidates ulic
    WHERE st.sales_transaction_id = ulic.sales_transaction_id
      AND ulic.duplicate_count = 1
      AND NOT EXISTS (
        SELECT 1
        FROM sales_transactions existing_st
        WHERE existing_st.sales_transaction_id <> st.sales_transaction_id
          AND existing_st.branch = st.branch
          AND existing_st.official_invoice_number = ulic.legacy_invoice_number
      );
  `);
  await pool.query(`
    WITH existing_max AS (
      SELECT
        branch,
        COALESCE(
          MAX(
            CASE
              WHEN official_invoice_number ~ '${SALES_INVOICE_NUMBER_PATTERN}'
                THEN official_invoice_number::int
              WHEN official_invoice_number ~ '${LEGACY_SALES_INVOICE_NUMBER_PATTERN}'
                THEN GREATEST(${SALES_INVOICE_START_NUMBER} - 1, RIGHT(official_invoice_number, ${SALES_INVOICE_SEQUENCE_DIGITS})::int)
              ELSE NULL
            END
          ),
          ${SALES_INVOICE_START_NUMBER} - 1
        ) AS last_number
      FROM sales_transactions
      WHERE transaction_type <> 'refund'
      GROUP BY branch
    ),
    missing_sales AS (
      SELECT
        sales_transaction_id,
        branch,
        ROW_NUMBER() OVER (
          PARTITION BY branch
          ORDER BY COALESCE(created_at, ${PHILIPPINE_NOW_SQL}), sales_transaction_id
        ) AS invoice_sequence
      FROM sales_transactions
      WHERE transaction_type <> 'refund'
        AND (
          official_invoice_number IS NULL
          OR TRIM(official_invoice_number) = ''
          OR official_invoice_number !~ '${SALES_INVOICE_NUMBER_PATTERN}'
        )
    )
    UPDATE sales_transactions st
    SET official_invoice_number = LPAD((em.last_number + ms.invoice_sequence)::text, ${SALES_INVOICE_SEQUENCE_DIGITS}, '0')
    FROM missing_sales ms
    INNER JOIN existing_max em ON em.branch = ms.branch
    WHERE st.sales_transaction_id = ms.sales_transaction_id;
  `);
  await pool.query(`
    UPDATE sales_transactions
    SET official_invoice_number = NULL
    WHERE transaction_type = 'refund'
      AND official_invoice_number IS NOT NULL;
  `);
  await pool.query(`
    UPDATE sales_transactions
    SET official_invoice_expected_number = official_invoice_number
    WHERE transaction_type <> 'refund'
      AND official_invoice_expected_number IS NULL
      AND official_invoice_number ~ '${SALES_INVOICE_NUMBER_PATTERN}';
  `);
  await pool.query(`
    UPDATE sales_transactions
    SET official_invoice_expected_number = NULL,
        official_invoice_exception_reason = NULL
    WHERE transaction_type = 'refund'
      AND (
        official_invoice_expected_number IS NOT NULL
        OR official_invoice_exception_reason IS NOT NULL
      );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS sales_transactions_branch_official_invoice_number_unique
    ON sales_transactions (branch, official_invoice_number)
    WHERE official_invoice_number IS NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD CONSTRAINT sales_transactions_official_invoice_number_check
    CHECK (
      (
        transaction_type = 'refund'
        AND official_invoice_number IS NULL
      )
      OR (
        transaction_type <> 'refund'
        AND official_invoice_number IS NOT NULL
        AND official_invoice_number ~ '${SALES_INVOICE_NUMBER_PATTERN}'
      )
    );
  `);
  await pool.query(`
    INSERT INTO invoice_number_sequences (document_type, invoice_year, branch, last_number, updated_at)
    SELECT
      '${SALES_INVOICE_DOCUMENT_TYPE}',
      EXTRACT(YEAR FROM ${PHILIPPINE_NOW_SQL})::int AS invoice_year,
      branch,
      LEAST(GREATEST(MAX(official_invoice_number::int), ${SALES_INVOICE_START_NUMBER} - 1), ${SALES_INVOICE_MAX_NUMBER}) AS last_number,
      ${PHILIPPINE_NOW_SQL}
    FROM sales_transactions
    WHERE official_invoice_number ~ '${SALES_INVOICE_NUMBER_PATTERN}'
    GROUP BY branch
    ON CONFLICT (document_type, invoice_year, branch) DO UPDATE
    SET last_number = LEAST(GREATEST(invoice_number_sequences.last_number, EXCLUDED.last_number), ${SALES_INVOICE_MAX_NUMBER}),
        updated_at = ${PHILIPPINE_NOW_SQL};
  `);
  await pool.query(`
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
    SELECT
      '${SALES_INVOICE_DOCUMENT_TYPE}',
      EXTRACT(YEAR FROM ${PHILIPPINE_NOW_SQL})::int,
      branch,
      ${SALES_INVOICE_START_NUMBER} - 1,
      ${PHILIPPINE_NOW_SQL}
    FROM known_branches
    ON CONFLICT (document_type, invoice_year, branch) DO NOTHING;
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(160) NOT NULL DEFAULT 'C';
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS customer_tin VARCHAR(80);
  `);
  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS customer_address VARCHAR(240) NOT NULL DEFAULT 'C';
  `);
  await pool.query(`
    UPDATE sales_transactions
    SET
      customer_name = COALESCE(NULLIF(TRIM(customer_name), ''), 'C'),
      customer_address = COALESCE(NULLIF(TRIM(customer_address), ''), 'C')
    WHERE customer_name IS NULL
       OR TRIM(customer_name) = ''
       OR customer_address IS NULL
       OR TRIM(customer_address) = '';
  `);
  await pool.query(`
    UPDATE sales_transactions
    SET encoded_at = COALESCE(encoded_at, created_at, ${PHILIPPINE_NOW_SQL})
    WHERE encoded_at IS NULL;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    DROP CONSTRAINT IF EXISTS sales_transactions_customer_type_check;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD CONSTRAINT sales_transactions_customer_type_check
    CHECK (customer_type IN ('walk_in', 'sister_company', 'hardware_reseller', 'regular', 'contractor'));
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS discount_type VARCHAR(40) DEFAULT 'none';
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS discount_label VARCHAR(120);
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS vatable_sales NUMERIC(12,2) NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'cash';
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS amount_received NUMERIC(12,2);
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS change_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(120);
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN NOT NULL DEFAULT false;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS payment_confirmed_by INT REFERENCES users(user_id) ON DELETE SET NULL;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS payment_confirmed_by_name TEXT;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP;
  `);

  await pool.query(`
    UPDATE sales_transactions
    SET subtotal_amount = total_amount
    WHERE subtotal_amount = 0 AND total_amount > 0;
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
  `);

  await pool.query(`
    ALTER TABLE sales_items
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE sales_items
    ADD COLUMN IF NOT EXISTS is_inventory_item BOOLEAN NOT NULL DEFAULT true;
  `);

  await pool.query(`
    ALTER TABLE sales_items
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'inventory';
  `);

  await pool.query(`
    ALTER TABLE sales_items
    ADD COLUMN IF NOT EXISTS category_note TEXT;
  `);

  await pool.query(`
    ALTER TABLE sales_items
    DROP CONSTRAINT IF EXISTS sales_items_item_type_check;
  `);

  await pool.query(`
    ALTER TABLE sales_items
    ADD CONSTRAINT sales_items_item_type_check CHECK (item_type IN ('inventory', 'non_inventory'));
  `);

  await pool.query(`
    UPDATE sales_items
    SET item_type = CASE WHEN is_inventory_item = false OR inventory_id IS NULL THEN 'non_inventory' ELSE 'inventory' END
    WHERE item_type IS NULL OR item_type = 'inventory';
  `);

  await pool.query(`
    ALTER TABLE sales_items
    ALTER COLUMN previous_quantity DROP NOT NULL,
    ALTER COLUMN new_quantity DROP NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE sales_items
    ADD COLUMN IF NOT EXISTS refund_for_sales_item_id INT REFERENCES sales_items(sales_item_id) ON DELETE SET NULL;
  `);
  await pool.query(`
    ALTER TABLE sales_items
    ADD COLUMN IF NOT EXISTS unit_cost_at_sale NUMERIC(12,2) NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE sales_items
    ADD COLUMN IF NOT EXISTS cost_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE sales_items
    ADD COLUMN IF NOT EXISTS gross_profit NUMERIC(12,2) NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE sales_items
    ADD COLUMN IF NOT EXISTS profit_margin_percent NUMERIC(7,2) NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    UPDATE sales_items si
    SET unit_cost_at_sale = COALESCE(p.cost_price, 0)
    FROM products p
    WHERE si.product_id = p.product_id
      AND si.is_inventory_item = true
      AND si.unit_cost_at_sale = 0
      AND COALESCE(p.cost_price, 0) > 0;
  `);
  await pool.query(`
    UPDATE sales_items
    SET unit_cost_at_sale = unit_price
    WHERE (is_inventory_item = false OR item_type = 'non_inventory' OR inventory_id IS NULL)
      AND unit_cost_at_sale = 0
      AND unit_price > 0;
  `);
  await pool.query(`
    UPDATE sales_items
    SET cost_subtotal = ROUND((quantity_sold * unit_cost_at_sale)::numeric, 2),
        gross_profit = ROUND((subtotal - (quantity_sold * unit_cost_at_sale))::numeric, 2),
        profit_margin_percent = CASE
          WHEN ABS(subtotal) > 0
            THEN ROUND(((subtotal - (quantity_sold * unit_cost_at_sale)) / ABS(subtotal) * 100)::numeric, 2)
          ELSE 0
        END
    WHERE cost_subtotal = 0
       OR gross_profit = 0
       OR profit_margin_percent = 0;
  `);

  await pool.query(`
    ALTER TABLE purchase_transactions
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);
  await pool.query(`
    ALTER TABLE purchase_transactions
    ADD COLUMN IF NOT EXISTS encoded_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL};
  `);
  await pool.query(`
    ALTER TABLE purchase_transactions
    ADD COLUMN IF NOT EXISTS document_type_note TEXT;
  `);
  await pool.query(`
    ALTER TABLE purchase_transactions
    ADD COLUMN IF NOT EXISTS backdate_reason TEXT;
  `);
  await pool.query(`
    UPDATE purchase_transactions
    SET encoded_at = COALESCE(encoded_at, created_at, ${PHILIPPINE_NOW_SQL})
    WHERE encoded_at IS NULL;
  `);

  await pool.query(`
    ALTER TABLE purchase_items
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE purchase_items
    ADD COLUMN IF NOT EXISTS category_note TEXT;
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ALTER COLUMN archived_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS archive_reason VARCHAR(40);
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS archive_reason_note TEXT;
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS category_note TEXT;
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(120);
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS default_selling_price NUMERIC(12,2);
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2);
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS safety_stock INTEGER;
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS average_daily_sales NUMERIC(10,2);
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS average_daily_sales_mode VARCHAR(20) DEFAULT 'auto';
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS manual_average_daily_sales NUMERIC(10,2);
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS average_daily_sales_override_reason TEXT;
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ALTER COLUMN lead_time_days DROP DEFAULT,
    ALTER COLUMN safety_stock DROP DEFAULT,
    ALTER COLUMN average_daily_sales DROP DEFAULT;
  `);

  await pool.query(`
    ALTER TABLE audit_logs
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS target_type VARCHAR(60);
  `);

  await pool.query(`
    ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS reason TEXT;
  `);

  await pool.query(`
    ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE backup_logs
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE system_logs
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_system_logs_cleanup
    ON system_logs (created_at)
    WHERE is_security = false AND severity IN ('debug', 'info');
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS login_otp_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS login_otp_expires TIMESTAMP,
    ADD COLUMN IF NOT EXISTS reset_otp_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS reset_otp_expires TIMESTAMP;
  `);

  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE products
    DROP COLUMN IF EXISTS price
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    DROP COLUMN IF EXISTS price
  `);

  const hasLegacyInventoryColumns = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'products'
      AND column_name IN ('stock_level', 'min_stock_level', 'status', 'last_updated')
  `);

  if (hasLegacyInventoryColumns.rowCount > 0) {
    await pool.query(`
      INSERT INTO branch_inventory (product_id, branch, stock_level, min_stock_level, status, last_updated)
      SELECT
        p.product_id,
        'Manggahan',
        COALESCE(p.stock_level, 0),
        COALESCE(p.min_stock_level, 5),
        COALESCE(p.status, 'In Stock'),
        COALESCE(p.last_updated, ${PHILIPPINE_NOW_SQL})
      FROM products p
      WHERE NOT EXISTS (
        SELECT 1
        FROM branch_inventory bi
        WHERE bi.product_id = p.product_id
      )
    `);

    await pool.query(`
      ALTER TABLE products
      DROP COLUMN IF EXISTS stock_level,
      DROP COLUMN IF EXISTS min_stock_level,
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS last_updated
    `);
  }

  await migrateTimestampStorageToPhilippineTime();
}

async function migrateTimestampStorageToPhilippineTime() {
  const migrationKey = 'philippine_timestamp_storage_v1';
  const alreadyApplied = await pool.query(
    'SELECT 1 FROM schema_migrations WHERE migration_key = $1',
    [migrationKey]
  );

  if (alreadyApplied.rowCount > 0) {
    return;
  }

  const timestampColumns = [
    ['users', ['created_at', 'otp_expires', 'login_otp_expires', 'reset_otp_expires']],
    ['products', ['created_at']],
    ['branch_inventory', ['last_updated']],
    ['stock_movements', ['created_at']],
    ['archived_inventory', ['last_updated', 'archived_at']],
    ['audit_logs', ['created_at']],
    ['backup_logs', ['created_at']],
    ['system_logs', ['created_at']],
    ['sales_transactions', ['created_at', 'cancelled_at']],
    ['sales_items', ['created_at']]
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [table, columns] of timestampColumns) {
      for (const column of columns) {
        await client.query(`
          UPDATE ${table}
          SET ${column} = ${column} + INTERVAL '8 hours'
          WHERE ${column} IS NOT NULL
        `);
      }
    }

    await client.query(
      'INSERT INTO schema_migrations (migration_key) VALUES ($1)',
      [migrationKey]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function createTransporter() {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  return nodemailer.createTransport({
    jsonTransport: true
  });
}

const transporter = createTransporter();

async function sendMail(mailOptions) {
  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (err) {
    console.error('Email send failed:', err.message);
    return false;
  }
}

function emailFrom(label) {
  return process.env.EMAIL_USER
    ? `"${label}" <${process.env.EMAIL_USER}>`
    : `"${label}" <no-reply@localhost>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailShell({ eyebrow, title, intro, accent = '#b91c1c', body, footerNote }) {
  const safeEyebrow = escapeHtml(eyebrow || 'System Notice');
  const safeTitle = escapeHtml(title || 'E.M. Cayetano Trading');
  const safeIntro = escapeHtml(intro || '');
  const safeFooter = escapeHtml(
    footerNote || 'This is an automated message from the E.M. Cayetano Trading system.'
  );

  return `
    <div style="margin:0;padding:24px 12px;background-color:#f3f4f6;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d1d5db;border-radius:18px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#7f1d1d 0%,#b91c1c 38%,#facc15 100%);padding:28px 32px 24px;">
          <div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#fef3c7;font-weight:700;margin-bottom:10px;">
            ${safeEyebrow}
          </div>
          <div style="font-family:Arial,sans-serif;font-size:28px;line-height:1.2;color:#ffffff;font-weight:800;margin:0 0 10px;">
            ${safeTitle}
          </div>
          <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#fefce8;max-width:520px;">
            ${safeIntro}
          </div>
        </div>

        <div style="padding:30px 32px 18px;">
          <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#1f2937;">
            ${body}
          </div>
        </div>

        <div style="padding:0 32px 28px;">
          <div style="border-top:1px solid #e5e7eb;padding-top:18px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7280;">
            <div style="font-weight:700;color:${accent};margin-bottom:4px;">E.M. Cayetano Trading System</div>
            <div>Manggahan and San Rafael Branches</div>
            <div style="margin-top:8px;">${safeFooter}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildInfoCard(label, value, tone = 'neutral') {
  const tones = {
    neutral: { bg: '#f9fafb', border: '#e5e7eb', text: '#111827' },
    success: { bg: '#ecfdf5', border: '#86efac', text: '#166534' },
    warning: { bg: '#fff7ed', border: '#fdba74', text: '#9a3412' },
    danger: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
    security: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' }
  };
  const palette = tones[tone] || tones.neutral;

  return `
    <div style="margin:18px 0;padding:16px 18px;background:${palette.bg};border:1px solid ${palette.border};border-radius:14px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#6b7280;margin-bottom:6px;">
        ${escapeHtml(label)}
      </div>
      <div style="font-size:18px;line-height:1.5;font-weight:700;color:${palette.text};">
        ${escapeHtml(value)}
      </div>
    </div>
  `;
}

function buildChangeComparison(label, previousValue, nextValue, tone = 'security') {
  const tones = {
    neutral: { newBg: '#f9fafb', newBorder: '#d1d5db', newText: '#111827', pillBg: '#111827', pillText: '#ffffff' },
    success: { newBg: '#ecfdf5', newBorder: '#86efac', newText: '#166534', pillBg: '#166534', pillText: '#ffffff' },
    warning: { newBg: '#fff7ed', newBorder: '#fdba74', newText: '#9a3412', pillBg: '#c2410c', pillText: '#ffffff' },
    danger: { newBg: '#fef2f2', newBorder: '#fca5a5', newText: '#991b1b', pillBg: '#b91c1c', pillText: '#ffffff' },
    security: { newBg: '#eff6ff', newBorder: '#93c5fd', newText: '#1d4ed8', pillBg: '#1d4ed8', pillText: '#ffffff' }
  };
  const palette = tones[tone] || tones.security;

  return `
    <div style="margin:20px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0 10px;">
        <tr>
          <td style="width:48%;vertical-align:top;padding:0;">
            <div style="border:1px solid #e5e7eb;background:#f9fafb;border-radius:14px;padding:16px 18px;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;color:#6b7280;margin-bottom:8px;">
                Previous ${escapeHtml(label)}
              </div>
              <div style="font-size:18px;line-height:1.5;font-weight:700;color:#374151;">
                ${escapeHtml(previousValue || 'Not set')}
              </div>
            </div>
          </td>
          <td style="width:4%;text-align:center;vertical-align:middle;font-size:20px;color:#9ca3af;padding:0 8px;">
            &#8594;
          </td>
          <td style="width:48%;vertical-align:top;padding:0;">
            <div style="border:2px solid ${palette.newBorder};background:${palette.newBg};border-radius:14px;padding:16px 18px;box-shadow:0 8px 24px rgba(17,24,39,0.08);">
              <div style="display:inline-block;margin-bottom:8px;padding:4px 10px;border-radius:999px;background:${palette.pillBg};color:${palette.pillText};font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">
                New ${escapeHtml(label)}
              </div>
              <div style="font-size:20px;line-height:1.5;font-weight:800;color:${palette.newText};">
                ${escapeHtml(nextValue || 'Not set')}
              </div>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function buildOtpBlock(code) {
  return `
    <div style="margin:20px 0;padding:20px;background:#111827;border-radius:16px;text-align:center;">
      <div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#fcd34d;font-weight:700;margin-bottom:10px;">
        Verification Code
      </div>
      <div style="font-family:'Courier New',monospace;font-size:36px;line-height:1.1;letter-spacing:10px;color:#ffffff;font-weight:700;">
        ${escapeHtml(code)}
      </div>
      <div style="margin-top:10px;font-family:Arial,sans-serif;font-size:13px;color:#d1d5db;">
        Expires in 2 minutes
      </div>
    </div>
  `;
}

function buildBulletList(items) {
  const listItems = items
    .filter(Boolean)
    .map((item) => `<li style="margin:0 0 8px;">${escapeHtml(item)}</li>`)
    .join('');

  return `
    <ul style="margin:16px 0 0 18px;padding:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#374151;">
      ${listItems}
    </ul>
  `;
}

function computeInventoryStatus(stockLevel, minStockLevel) {
  if (stockLevel <= 0) return 'Out of Stock';
  if (stockLevel <= minStockLevel) return 'Low Stock';
  return 'In Stock';
}

function hasReorderPlanningValue(value) {
  return value !== '' && value !== null && value !== undefined;
}

function computeReorderPoint({ averageDailySales = null, leadTimeDays = null, safetyStock = null } = {}) {
  if (
    !hasReorderPlanningValue(averageDailySales) ||
    !hasReorderPlanningValue(leadTimeDays) ||
    !hasReorderPlanningValue(safetyStock)
  ) {
    return null;
  }

  return Math.ceil(
    Math.max(0, Number(averageDailySales || 0)) * Math.max(0, Number(leadTimeDays || 0)) +
    Math.max(0, Number(safetyStock || 0))
  );
}

function getEffectiveReorderThreshold(row = {}) {
  return Number(row.min_stock_level ?? row.minStockLevel ?? 0);
}

function computeSuggestedOrderQuantity(row) {
  const reorderPoint = computeReorderPoint({
    averageDailySales: row.average_daily_sales ?? row.averageDailySales,
    leadTimeDays: row.lead_time_days ?? row.leadTimeDays,
    safetyStock: row.safety_stock ?? row.safetyStock
  });
  const advisoryPlanningPoint = reorderPoint !== null ? reorderPoint : getEffectiveReorderThreshold(row);
  return Math.max(0, advisoryPlanningPoint - Number(row.stock_level || 0));
}

function normalizeAverageDailySalesMode(value) {
  return value === 'manual' ? 'manual' : 'auto';
}

function cleanAverageDailySalesOverrideReason(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim().replace(/\s+/g, ' ');
  return cleaned || null;
}

function formatDateAsPhilippineTimestamp(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseOptionalActualTransactionAt(value, fieldName = 'Actual transaction date') {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const rawValue = String(value).trim();
  const localMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (localMatch) {
    const [, year, month, day, hour, minute, second = '00'] = localMatch;
    const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${APP_TIMESTAMP_OFFSET}`);
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    const hourNumber = Number(hour);
    const minuteNumber = Number(minute);
    const secondNumber = Number(second);
    const normalized = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber, hourNumber, minuteNumber, secondNumber));
    const isValidCalendarDate =
      normalized.getUTCFullYear() === yearNumber &&
      normalized.getUTCMonth() === monthNumber - 1 &&
      normalized.getUTCDate() === dayNumber &&
      hourNumber >= 0 && hourNumber <= 23 &&
      minuteNumber >= 0 && minuteNumber <= 59 &&
      secondNumber >= 0 && secondNumber <= 59;

    if (!isValidCalendarDate || Number.isNaN(parsed.getTime())) {
      const err = new Error(`${fieldName} must be a valid date and time.`);
      err.statusCode = 400;
      throw err;
    }
    if (parsed.getTime() > Date.now() + BACKDATE_FUTURE_TOLERANCE_MS) {
      const err = new Error(`${fieldName} cannot be in the future.`);
      err.statusCode = 400;
      throw err;
    }

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    const err = new Error(`${fieldName} must be a valid date and time.`);
    err.statusCode = 400;
    throw err;
  }
  if (parsed.getTime() > Date.now() + BACKDATE_FUTURE_TOLERANCE_MS) {
    const err = new Error(`${fieldName} cannot be in the future.`);
    err.statusCode = 400;
    throw err;
  }
  return formatDateAsPhilippineTimestamp(parsed);
}

function cleanBackdateReason(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim().replace(/\s+/g, ' ');
  return cleaned.slice(0, 240) || null;
}

function cleanInvoiceSequenceExceptionReason(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim().replace(/\s+/g, ' ');
  return cleaned.slice(0, 240) || null;
}

function getTransactionTiming(body = {}) {
  const actualTransactionAt = parseOptionalActualTransactionAt(body.actual_transaction_at);
  return {
    actualTransactionAt,
    backdateReason: cleanBackdateReason(body.backdate_reason)
  };
}

async function calculateRecentAverageDailySales(client, inventoryId) {
  const result = await client.query(
    `SELECT
       COALESCE(SUM(si.quantity_sold), 0) AS total_sold,
       MIN(st.created_at)::date AS first_sale_date
     FROM sales_items si
     INNER JOIN sales_transactions st
       ON st.sales_transaction_id = si.sales_transaction_id
     WHERE si.inventory_id = $1
       AND st.status = 'completed'
       AND st.created_at >= (${PHILIPPINE_NOW_SQL} - INTERVAL '30 days')`,
    [inventoryId]
  );

  const totalSold = Number(result.rows[0]?.total_sold || 0);
  const firstSaleDate = result.rows[0]?.first_sale_date;
  if (!firstSaleDate || totalSold <= 0) return null;

  const firstDay = new Date(firstSaleDate);
  const today = new Date();
  const elapsedDays = Math.max(
    1,
    Math.ceil((today.setHours(0, 0, 0, 0) - firstDay.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)) + 1
  );

  return Number((totalSold / Math.min(elapsedDays, 30)).toFixed(2));
}

function normalizeInventoryText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function singularizeInventoryToken(token) {
  const normalizedToken = token.replace(/([a-z])\1{2,}/g, '$1$1');
  if (!/^[a-z]+$/.test(normalizedToken) || normalizedToken.length <= 3 || /(ss|us|is)$/.test(normalizedToken)) return normalizedToken;
  if (normalizedToken.endsWith('ies') && normalizedToken.length > 4) return `${normalizedToken.slice(0, -3)}y`;
  if (normalizedToken.endsWith('es') && /(ches|shes|xes|zes|ses)$/.test(normalizedToken)) return normalizedToken.slice(0, -2);
  if (normalizedToken.endsWith('s')) return normalizedToken.slice(0, -1);
  return normalizedToken;
}

function normalizeInventoryIdentityToken(token) {
  const cleanedToken = String(token ?? '').replace(/\.$/, '');
  const directUnitAlias = INVENTORY_UNIT_ALIASES[cleanedToken];
  if (directUnitAlias) return directUnitAlias;
  const singularToken = singularizeInventoryToken(cleanedToken);
  return INVENTORY_UNIT_ALIASES[singularToken] || singularToken;
}

function normalizeInventoryIdentityName(value) {
  return normalizeInventoryText(value)
    .replace(/[“”]/g, '"')
    .replace(/[’']/g, '')
    .replace(/(\d+(?:\/\d+)?)\s*"/g, '$1 in')
    .replace(/\bby\b/g, 'x')
    .replace(/(\d)\s*(?:x|\u00d7|\*)\s*(\d)/gi, '$1x$2')
    .replace(/(\d)\s*(?:x|\u00d7|\*)\s*(\d)/gi, '$1x$2')
    .replace(/([a-z])-([a-z])/g, '$1 $2')
    .replace(/(\d+)\s*\/\s*(\d+)/g, '$1/$2')
    .replace(/#\s*(\d+)/g, '#$1')
    .replace(/[^a-z0-9#./-]+/g, ' ')
    .replace(/(\d)([a-z]+)/g, '$1 $2')
    .replace(/([a-z]+)(\d)/g, '$1 $2')
    .replace(/(\d)\s*[x×]\s*(\d)/gi, '$1x$2')
    .replace(/(\d)\s*[x×]\s*(\d)/gi, '$1x$2')
    .replace(/(\d+x\d+)\s*x\s*(\d)/gi, '$1x$2')
    .split(' ')
    .filter(Boolean)
    .map(normalizeInventoryIdentityToken)
    .join(' ');
}

function getInventoryIdentityTokens(value) {
  return normalizeInventoryIdentityName(value).split(' ').filter(Boolean);
}

function isNumericIdentityToken(value) {
  return /\d/.test(value);
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function areInventoryNameTokensSimilar(left, right) {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;
  const distance = levenshteinDistance(left, right);
  return distance <= (Math.max(left.length, right.length) >= 6 ? 2 : 1);
}

function areLikelyDuplicateInventoryNames(leftName, rightName) {
  const leftTokens = getInventoryIdentityTokens(leftName);
  const rightTokens = getInventoryIdentityTokens(rightName);
  if (!leftTokens.length || leftTokens.length !== rightTokens.length) return false;

  const leftNumeric = leftTokens.filter(isNumericIdentityToken).join('|');
  const rightNumeric = rightTokens.filter(isNumericIdentityToken).join('|');
  if (leftNumeric !== rightNumeric) return false;

  let fuzzyMatches = 0;
  for (let index = 0; index < leftTokens.length; index += 1) {
    if (!areInventoryNameTokensSimilar(leftTokens[index], rightTokens[index])) return false;
    if (leftTokens[index] !== rightTokens[index]) fuzzyMatches += 1;
  }

  return fuzzyMatches > 0;
}

function cleanInventoryName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function cleanSupplierName(value) {
  const cleanName = String(value ?? '').trim().replace(/\s+/g, ' ');
  return cleanName ? cleanName.slice(0, 120) : null;
}

function cleanOptionalContextNote(value, { maxLength = 240 } = {}) {
  const cleanNote = String(value ?? '').trim().replace(/\s+/g, ' ');
  return cleanNote ? cleanNote.slice(0, maxLength) : null;
}

function cleanCategoryNote(value, category) {
  return canonicalizeInventoryCategory(category) === 'Other'
    ? cleanOptionalContextNote(value)
    : null;
}

function hasValidInventoryTextCharacters(value) {
  return /^[A-Za-z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u00D1\u00F1 #./,'"()&+_-]+$/.test(String(value || ''));
}

function getMeaningfulInventoryNameTokens(value) {
  return getInventoryIdentityTokens(value).filter(token => /[a-z0-9]/.test(token));
}

function validateInventoryNameQuality(value) {
  const cleanName = cleanInventoryName(value);
  if (!cleanName) return 'Valid product name and category are required';
  if (cleanName.length > 150) return 'Item name must be 150 characters or less';
  if (!hasValidInventoryTextCharacters(cleanName)) {
    return 'Item name accepts letters, numbers, and common item characters only';
  }
  if (!/[a-z0-9]/i.test(cleanName)) return 'Item name must include letters or numbers';

  const tokens = getMeaningfulInventoryNameTokens(cleanName);
  if (tokens.length < 2) {
    return 'Include the item size or specification, such as "Claw Hammer 16 oz."';
  }

  return null;
}

function validateSupplierNameQuality(value) {
  if (!value) return null;
  if (value.length > 120) return 'Supplier name must be 120 characters or less';
  if (!hasValidInventoryTextCharacters(value)) {
    return 'Supplier name accepts letters, numbers, and common business characters only';
  }
  return null;
}

function canonicalizeInventoryCategory(value) {
  const normalized = normalizeInventoryText(value);
  return CATEGORY_ALIASES[normalized] || null;
}

function parseNonNegativeInteger(value, fieldName, { max = null } = {}) {
  if (value === '' || value === null || value === undefined) {
    const error = new Error(`${fieldName} is required`);
    error.statusCode = 400;
    throw error;
  }

  const rawValue = String(value).trim();
  if (!/^\d+$/.test(rawValue)) {
    const error = new Error(`${fieldName} must be a non-negative whole number`);
    error.statusCode = 400;
    throw error;
  }

  const normalizedValue = Number(rawValue);

  if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
    const error = new Error(`${fieldName} must be a non-negative whole number`);
    error.statusCode = 400;
    throw error;
  }

  if (Number.isInteger(max) && normalizedValue > max) {
    const error = new Error(`${fieldName} must be ${max} or less`);
    error.statusCode = 400;
    throw error;
  }

  return normalizedValue;
}

function parseNonNegativeDecimal(value, fieldName, { max = null } = {}) {
  if (value === '' || value === null || value === undefined) {
    const error = new Error(`${fieldName} is required`);
    error.statusCode = 400;
    throw error;
  }

  const rawValue = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(rawValue)) {
    const error = new Error(`${fieldName} must be a non-negative number with up to 2 decimal places`);
    error.statusCode = 400;
    throw error;
  }

  const normalizedValue = Number(rawValue);

  if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
    const error = new Error(`${fieldName} must be a non-negative number`);
    error.statusCode = 400;
    throw error;
  }

  if (Number.isFinite(max) && normalizedValue > max) {
    const error = new Error(`${fieldName} must be ${max} or less`);
    error.statusCode = 400;
    throw error;
  }

  return Number(normalizedValue.toFixed(2));
}

function parseOptionalNonNegativeInteger(value, fieldName, { max = null } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  return parseNonNegativeInteger(value, fieldName, { max });
}

function parseOptionalNonNegativeDecimal(value, fieldName, { max = null } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  return parseNonNegativeDecimal(value, fieldName, { max });
}

function formatCurrencyForLog(value) {
  return `PHP ${Number(value || 0).toFixed(2)}`;
}

function parseOptionalPositiveDecimal(value, fieldName, { max = null } = {}) {
  const parsed = parseOptionalNonNegativeDecimal(value, fieldName, { max });
  if (parsed !== null && parsed <= 0) {
    const error = new Error(`${fieldName} must be greater than zero.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

function calculateSalesLineProfit({ quantitySold, unitCostAtSale, subtotal }) {
  const quantity = Number(quantitySold || 0);
  const unitCost = Number(unitCostAtSale || 0);
  const lineSubtotal = Number(subtotal || 0);
  const costSubtotal = Number((quantity * unitCost).toFixed(2));
  const grossProfit = Number((lineSubtotal - costSubtotal).toFixed(2));
  const profitMarginPercent = Math.abs(lineSubtotal) > 0
    ? Number(((grossProfit / Math.abs(lineSubtotal)) * 100).toFixed(2))
    : 0;

  return {
    unitCostAtSale: Number(unitCost.toFixed(2)),
    costSubtotal,
    grossProfit,
    profitMarginPercent
  };
}

async function findProductByIdentity(client, { name, category }) {
  const canonicalCategory = canonicalizeInventoryCategory(category);
  const cleanName = cleanInventoryName(name);
  if (!canonicalCategory || !cleanName) return null;
  const normalizedIdentityName = normalizeInventoryIdentityName(cleanName);

  const existing = await client.query(
    `SELECT product_id, name, category, category_note, supplier_name, default_selling_price, cost_price
     FROM products
     WHERE LOWER(category) = LOWER($1)`,
    [canonicalCategory]
  );

  return existing.rows.find(row => normalizeInventoryIdentityName(row.name) === normalizedIdentityName) || null;
}

async function findOrCreateProduct(client, { name, category, categoryNote = null, supplierName = null, defaultSellingPrice = null, costPrice = null }) {
  const canonicalCategory = canonicalizeInventoryCategory(category);
  const cleanName = cleanInventoryName(name);
  const cleanNote = cleanCategoryNote(categoryNote, canonicalCategory);
  const cleanSupplier = cleanSupplierName(supplierName);
  if (!canonicalCategory) {
    const error = new Error('Invalid inventory category');
    error.statusCode = 400;
    throw error;
  }

  const existing = await findProductByIdentity(client, { name: cleanName, category: canonicalCategory });

  if (existing) {
    const existingDefaultPrice = existing.default_selling_price === null || existing.default_selling_price === undefined
      ? null
      : Number(existing.default_selling_price);
    const nextDefaultPrice = defaultSellingPrice === null || defaultSellingPrice === undefined
      ? existingDefaultPrice
      : Number(defaultSellingPrice);
    const existingCostPrice = existing.cost_price === null || existing.cost_price === undefined
      ? null
      : Number(existing.cost_price);
    const nextCostPrice = costPrice === null || costPrice === undefined
      ? existingCostPrice
      : Number(costPrice);
    const shouldUpdateSupplier = cleanSupplier && cleanSupplier !== existing.supplier_name;
    const shouldUpdateCategoryNote = cleanNote !== cleanOptionalContextNote(existing.category_note);
    const shouldUpdateDefaultPrice = nextDefaultPrice !== existingDefaultPrice;
    const shouldUpdateCostPrice = nextCostPrice !== existingCostPrice;

    if (shouldUpdateSupplier || shouldUpdateCategoryNote || shouldUpdateDefaultPrice || shouldUpdateCostPrice) {
      await client.query(
        `UPDATE products
         SET supplier_name = $1,
             default_selling_price = $2,
             cost_price = $3,
             category_note = $4
         WHERE product_id = $5`,
        [
          shouldUpdateSupplier ? cleanSupplier : existing.supplier_name,
          nextDefaultPrice,
          nextCostPrice,
          cleanNote,
          existing.product_id
        ]
      );
    }
    return existing.product_id;
  }

  const inserted = await client.query(
    `INSERT INTO products (name, category, category_note, supplier_name, default_selling_price, cost_price)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING product_id`,
    [cleanName, canonicalCategory, cleanNote, cleanSupplier, defaultSellingPrice, costPrice]
  );

  return inserted.rows[0].product_id;
}

async function findSimilarActiveInventoryItem(client, { branch, name, category, excludeInventoryId = null }) {
  const targetIdentityName = normalizeInventoryIdentityName(name);
  const canonicalCategory = canonicalizeInventoryCategory(category);
  if (!branch || !targetIdentityName || !canonicalCategory) return null;

  const result = await client.query(
    `SELECT bi.inventory_id, p.name, p.category
     FROM branch_inventory bi
     INNER JOIN products p ON p.product_id = bi.product_id
     WHERE bi.branch = $1
       AND ($2::int IS NULL OR bi.inventory_id <> $2::int)
       AND LOWER(p.category) = LOWER($3)`,
    [branch, excludeInventoryId, canonicalCategory]
  );

  const exactMatch = result.rows.find(row => normalizeInventoryIdentityName(row.name) === targetIdentityName);
  if (exactMatch) return { ...exactMatch, match_type: 'exact' };

  const fuzzyMatch = result.rows.find(row => areLikelyDuplicateInventoryNames(row.name, name));
  if (fuzzyMatch) return { ...fuzzyMatch, match_type: 'similar' };

  return null;
}

async function findExactActiveInventoryItemByName(client, { branch, name, excludeInventoryId = null }) {
  const targetIdentityName = normalizeInventoryIdentityName(name);
  if (!branch || !targetIdentityName) return null;

  const result = await client.query(
    `SELECT bi.inventory_id, p.name, p.category, bi.stock_level, bi.status
     FROM branch_inventory bi
     INNER JOIN products p ON p.product_id = bi.product_id
     WHERE bi.branch = $1
       AND ($2::int IS NULL OR bi.inventory_id <> $2::int)`,
    [branch, excludeInventoryId]
  );

  const exactMatch = result.rows.find(row => normalizeInventoryIdentityName(row.name) === targetIdentityName);
  return exactMatch ? { ...exactMatch, match_type: 'exact' } : null;
}

async function findSimilarArchivedInventoryItem(client, { branch, name, category }) {
  const targetIdentityName = normalizeInventoryIdentityName(name);
  const canonicalCategory = canonicalizeInventoryCategory(category);
  if (!branch || !targetIdentityName || !canonicalCategory) return null;

  const result = await client.query(
    `SELECT archived_inventory_id, name, category
     FROM archived_inventory
     WHERE branch = $1
       AND LOWER(category) = LOWER($2)`,
    [branch, canonicalCategory]
  );

  const exactMatch = result.rows.find(row => normalizeInventoryIdentityName(row.name) === targetIdentityName);
  if (exactMatch) return { ...exactMatch, match_type: 'exact' };

  const fuzzyMatch = result.rows.find(row => areLikelyDuplicateInventoryNames(row.name, name));
  if (fuzzyMatch) return { ...fuzzyMatch, match_type: 'similar' };

  return null;
}

async function findExactArchivedInventoryItemByName(client, { branch, name }) {
  const targetIdentityName = normalizeInventoryIdentityName(name);
  if (!branch || !targetIdentityName) return null;

  const result = await client.query(
    `SELECT archived_inventory_id, name, category, stock_level, status
     FROM archived_inventory
     WHERE branch = $1`,
    [branch]
  );

  const exactMatch = result.rows.find(row => normalizeInventoryIdentityName(row.name) === targetIdentityName);
  return exactMatch ? { ...exactMatch, match_type: 'exact' } : null;
}

function mapInventoryRow(row, options = {}) {
  const mapped = {
    inventory_id: row.inventory_id,
    product_id: row.product_id,
    name: row.name,
    category: row.category,
    category_note: row.category_note,
    supplier_name: row.supplier_name,
    default_selling_price: row.default_selling_price,
    stock_level: row.stock_level,
    min_stock_level: row.min_stock_level,
    lead_time_days: row.lead_time_days,
    safety_stock: row.safety_stock,
    average_daily_sales: row.average_daily_sales,
    average_daily_sales_mode: row.average_daily_sales_mode || 'auto',
    manual_average_daily_sales: row.manual_average_daily_sales,
    average_daily_sales_override_reason: row.average_daily_sales_override_reason,
    recommended_reorder_point: computeReorderPoint(row),
    active_low_stock_threshold: getEffectiveReorderThreshold(row),
    suggested_order_quantity: computeSuggestedOrderQuantity(row),
    status: computeInventoryStatus(Number(row.stock_level || 0), getEffectiveReorderThreshold(row)),
    branch: row.branch,
    last_updated: row.last_updated
  };
  if (options.includeCostPrice) {
    mapped.cost_price = row.cost_price;
  }
  return mapped;
}

function mapArchivedInventoryRow(row, options = {}) {
  const mapped = {
    archived_inventory_id: row.archived_inventory_id,
    original_inventory_id: row.original_inventory_id,
    product_id: row.product_id,
    name: row.name,
    category: row.category,
    category_note: row.category_note,
    supplier_name: row.supplier_name,
    default_selling_price: row.default_selling_price,
    stock_level: row.stock_level,
    min_stock_level: row.min_stock_level,
    lead_time_days: row.lead_time_days,
    safety_stock: row.safety_stock,
    average_daily_sales: row.average_daily_sales,
    average_daily_sales_mode: row.average_daily_sales_mode || 'auto',
    manual_average_daily_sales: row.manual_average_daily_sales,
    average_daily_sales_override_reason: row.average_daily_sales_override_reason,
    recommended_reorder_point: computeReorderPoint(row),
    active_low_stock_threshold: getEffectiveReorderThreshold(row),
    suggested_order_quantity: computeSuggestedOrderQuantity(row),
    status: computeInventoryStatus(Number(row.stock_level || 0), getEffectiveReorderThreshold(row)),
    branch: row.branch,
    last_updated: row.last_updated,
    archive_reason: row.archive_reason,
    archive_reason_note: row.archive_reason_note,
    archived_at: row.archived_at
  };
  if (options.includeCostPrice) {
    mapped.cost_price = row.cost_price;
  }
  return mapped;
}

function mapStockMovementRow(row) {
  return {
    movement_id: row.movement_id,
    inventory_id: row.inventory_id,
    product_id: row.product_id,
    item_name: row.item_name,
    category: row.category,
    category_note: row.category_note,
    branch: row.branch,
    action: row.action,
    quantity_changed: row.quantity_changed,
    previous_quantity: row.previous_quantity,
    new_quantity: row.new_quantity,
    reason: row.reason,
    note: row.note,
    actor_id: row.actor_id,
    actor_name: row.actor_name,
    created_at: row.created_at,
    encoded_at: row.encoded_at,
    backdate_reason: row.backdate_reason
  };
}

function mapSalesTransactionRow(row) {
  const transactionType = row.transaction_type || 'sale';
  const officialInvoiceNumber = transactionType === 'refund'
    ? null
    : resolveOfficialSalesInvoiceNumber(row.official_invoice_number, row.sales_number);
  const referenceOfficialInvoiceNumber = resolveOfficialSalesInvoiceNumber(
    row.reference_official_invoice_number,
    row.reference_sales_number
  );

  return {
    sales_transaction_id: row.sales_transaction_id,
    sales_number: row.sales_number,
    official_invoice_number: officialInvoiceNumber,
    official_invoice_expected_number: row.official_invoice_expected_number,
    official_invoice_exception_reason: row.official_invoice_exception_reason,
    reference_sales_number: row.reference_sales_number,
    reference_official_invoice_number: referenceOfficialInvoiceNumber,
    branch: row.branch,
    customer_type: row.customer_type,
    customer_name: row.customer_name || 'C',
    customer_tin: row.customer_tin || '',
    customer_address: row.customer_address || 'C',
    total_quantity: row.total_quantity,
    subtotal_amount: row.subtotal_amount,
    discount_amount: row.discount_amount,
    discount_type: row.discount_type || 'none',
    discount_label: row.discount_label,
    delivery_charge: row.delivery_charge,
    vatable_sales: row.vatable_sales,
    vat_amount: row.vat_amount,
    total_amount: row.total_amount,
    payment_method: row.payment_method,
    amount_received: row.amount_received,
    change_amount: row.change_amount,
    payment_reference: row.payment_reference,
    payment_confirmed: row.payment_confirmed,
    payment_confirmed_by: row.payment_confirmed_by,
    payment_confirmed_by_name: row.payment_confirmed_by_name,
    payment_confirmed_at: row.payment_confirmed_at,
    status: row.status,
    transaction_type: transactionType,
    reference_sales_transaction_id: row.reference_sales_transaction_id,
    sold_by: row.sold_by,
    sold_by_name: row.sold_by_name,
    remarks: row.remarks,
    created_at: row.created_at,
    encoded_at: row.encoded_at,
    backdate_reason: row.backdate_reason,
    cancelled_at: row.cancelled_at,
    cancelled_by: row.cancelled_by,
    cancel_reason: row.cancel_reason,
    items: row.items || []
  };
}

function mapSalesItemRow(row) {
  return {
    sales_item_id: row.sales_item_id,
    sales_transaction_id: row.sales_transaction_id,
    item_type: row.item_type || (row.is_inventory_item === false ? 'non_inventory' : 'inventory'),
    inventory_id: row.inventory_id,
    product_id: row.product_id,
    is_inventory_item: row.is_inventory_item,
    item_name: row.item_name,
    category: row.category,
    category_note: row.category_note,
    branch: row.branch,
    quantity_sold: row.quantity_sold,
    unit_price: row.unit_price,
    unit_cost_at_sale: row.unit_cost_at_sale,
    subtotal: row.subtotal,
    cost_subtotal: row.cost_subtotal,
    gross_profit: row.gross_profit,
    profit_margin_percent: row.profit_margin_percent,
    previous_quantity: row.previous_quantity,
    new_quantity: row.new_quantity,
    refund_for_sales_item_id: row.refund_for_sales_item_id,
    refunded_quantity: row.refunded_quantity,
    refunded_amount: row.refunded_amount,
    created_at: row.created_at
  };
}

function mapPurchaseTransactionRow(row) {
  return {
    purchase_transaction_id: row.purchase_transaction_id,
    purchase_number: row.purchase_number,
    branch: row.branch,
    supplier_name: row.supplier_name,
    document_type: row.document_type,
    document_type_note: row.document_type_note,
    document_number: row.document_number,
    payment_terms: row.payment_terms,
    subtotal_amount: row.subtotal_amount,
    total_quantity: row.total_quantity,
    remarks: row.remarks,
    status: row.status,
    encoded_by: row.encoded_by,
    encoded_by_name: row.encoded_by_name,
    created_at: row.created_at,
    encoded_at: row.encoded_at,
    backdate_reason: row.backdate_reason,
    cancelled_at: row.cancelled_at,
    cancelled_by: row.cancelled_by,
    cancel_reason: row.cancel_reason,
    items: row.items || []
  };
}

function mapPurchaseItemRow(row) {
  return {
    purchase_item_id: row.purchase_item_id,
    purchase_transaction_id: row.purchase_transaction_id,
    inventory_id: row.inventory_id,
    product_id: row.product_id,
    item_name: row.item_name,
    category: row.category,
    branch: row.branch,
    quantity_received: row.quantity_received,
    unit_cost: row.unit_cost,
    subtotal: row.subtotal,
    previous_quantity: row.previous_quantity,
    new_quantity: row.new_quantity,
    created_at: row.created_at
  };
}

function computeVatBreakdown(totalAmount) {
  const gross = Number(totalAmount || 0);
  const vatableSales = Number((gross / 1.12).toFixed(2));
  const vatAmount = Number((gross - vatableSales).toFixed(2));
  return { vatableSales, vatAmount };
}

function getDiscountDetails(discountType, subtotalAmount, customDiscountAmount = 0) {
  const normalizedType = String(discountType || 'none').trim().toLowerCase();
  const roundedSubtotal = Number(subtotalAmount || 0);
  const presets = {
    none: { type: 'none', label: 'No Discount', amount: 0 },
    store_promo_5: {
      type: 'store_promo_5',
      label: 'Store Promo 5%',
      amount: Number((roundedSubtotal * 0.05).toFixed(2))
    },
    bulk_project_10: {
      type: 'bulk_project_10',
      label: 'Bulk / Project Discount 10%',
      amount: Number((roundedSubtotal * 0.10).toFixed(2))
    },
    custom_amount: {
      type: 'custom_amount',
      label: 'Manual Discount',
      amount: Number(customDiscountAmount || 0)
    }
  };

  return presets[normalizedType] || null;
}

const STOCK_OUT_REASONS = new Map([
  ['sales', 'Sales'],
  ['damaged', 'Damaged'],
  ['supplier_return', 'Supplier Return/Reject'],
  ['expired', 'Expired'],
  ['lost_missing', 'Lost/Missing'],
  ['manual_adjustment', 'Manual Adjustment'],
  ['branch_transfer', 'Branch Transfer'],
  ['correction', 'Correction']
]);

const STOCK_IN_REASONS = new Map([
  ['delivery_received', 'Delivery Received'],
  ['purchase_received', 'Purchase Received'],
  ['returned_item', 'Returned Item'],
  ['customer_refund', 'Customer Refund'],
  ['supplier_replacement', 'Supplier Replacement'],
  ['beginning_balance', 'Beginning Balance'],
  ['manual_adjustment', 'Manual Adjustment'],
  ['sales_cancellation', 'Cancellation'],
  ['correction', 'Correction'],
  ['found_stock', 'Found Stock']
]);

const ARCHIVE_REASONS = new Map([
  ['discontinued', 'Discontinued'],
  ['duplicate_record', 'Duplicate Record'],
  ['wrong_entry', 'Wrong Entry'],
  ['expired', 'Expired'],
  ['no_longer_sold', 'No Longer Sold'],
  ['other', 'Other']
]);

function normalizeStockMovementReasonForAction(action, reason) {
  const normalized = String(reason || '').trim().toLowerCase();
  if (action === 'stock_in') return STOCK_IN_REASONS.has(normalized) ? normalized : null;
  if (action === 'stock_out') return STOCK_OUT_REASONS.has(normalized) ? normalized : null;
  return null;
}

function getStockMovementReasonLabel(reason, action = null) {
  if (action === 'stock_in') return STOCK_IN_REASONS.get(reason) || '';
  if (action === 'stock_out') return STOCK_OUT_REASONS.get(reason) || '';
  return STOCK_IN_REASONS.get(reason) || STOCK_OUT_REASONS.get(reason) || '';
}

function normalizeArchiveReason(reason) {
  const normalized = String(reason || '').trim().toLowerCase();
  return ARCHIVE_REASONS.has(normalized) ? normalized : null;
}

function getArchiveReasonLabel(reason) {
  return ARCHIVE_REASONS.get(reason) || '';
}

async function recordStockMovement(client, {
  inventoryId,
  productId,
  itemName,
  category,
  branch,
  action,
  quantityChanged,
  previousQuantity,
  newQuantity,
  reason = null,
  note,
  actorId,
  actualTransactionAt = null,
  backdateReason = null
}) {
  if (!action || Number(quantityChanged) <= 0 || Number(previousQuantity) === Number(newQuantity)) {
    return;
  }

  await client.query(
    `INSERT INTO stock_movements (
       inventory_id,
       product_id,
       item_name,
       category,
       branch,
       action,
       quantity_changed,
       previous_quantity,
       new_quantity,
       reason,
       note,
       actor_id,
       actor_name,
       created_at,
       encoded_at,
       backdate_reason
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, (SELECT full_name FROM users WHERE user_id = $12), COALESCE($13::timestamp, ${PHILIPPINE_NOW_SQL}), ${PHILIPPINE_NOW_SQL}, $14)`,
    [
      inventoryId,
      productId,
      itemName,
      category,
      branch,
      action,
      Number(quantityChanged),
      Number(previousQuantity),
      Number(newQuantity),
      reason || null,
      note || null,
      actorId,
      actualTransactionAt,
      backdateReason || null
    ]
  );
}

async function generateSalesNumber(client, transactionType = 'sale') {
  const year = new Date().getFullYear();
  const prefix = transactionType === 'refund' ? 'REFUND' : 'SALE';
  await client.query('LOCK TABLE sales_transactions IN EXCLUSIVE MODE');
  if (prefix === 'REFUND') {
    const result = await client.query(
      `SELECT COALESCE(MAX(RIGHT(sales_number, 5)::int), 0) + 1 AS next_number
       FROM sales_transactions
       WHERE sales_number LIKE $1
         AND RIGHT(sales_number, 5) ~ '^[0-9]{5}$'`,
      [`${prefix}-${year}-%`]
    );
    const sequence = Number(result.rows[0]?.next_number || 1);
    return `${prefix}-${year}-${String(sequence).padStart(5, '0')}`;
  }
  const result = await client.query(
    `SELECT COALESCE(MAX(sales_transaction_id), 0) + 1 AS next_number
     FROM sales_transactions`
  );
  const sequence = Number(result.rows[0]?.next_number || 1);
  return `${prefix}-${year}-${String(sequence).padStart(5, '0')}`;
}

function formatOfficialSalesInvoiceNumber(sequence) {
  const safeSequence = Number.parseInt(sequence, 10);
  if (!Number.isInteger(safeSequence) || safeSequence < SALES_INVOICE_START_NUMBER || safeSequence > SALES_INVOICE_MAX_NUMBER) {
    return '';
  }
  return String(safeSequence).padStart(SALES_INVOICE_SEQUENCE_DIGITS, '0');
}

function normalizeOfficialSalesInvoiceNumber(value) {
  return String(value || '').trim().replace(/\D/g, '');
}

function getNextOfficialSalesInvoiceSequence(lastNumber) {
  const safeLastNumber = Number.parseInt(lastNumber, 10);
  if (!Number.isInteger(safeLastNumber) || safeLastNumber < SALES_INVOICE_START_NUMBER) {
    return SALES_INVOICE_START_NUMBER;
  }
  return safeLastNumber >= SALES_INVOICE_MAX_NUMBER
    ? SALES_INVOICE_START_NUMBER
    : safeLastNumber + 1;
}

async function getSalesInvoiceSequenceYear(client) {
  const yearResult = await client.query(`SELECT EXTRACT(YEAR FROM ${PHILIPPINE_NOW_SQL})::int AS invoice_year`);
  return Number(yearResult.rows[0]?.invoice_year || new Date().getFullYear());
}

function getSalesInvoiceSequenceBranch(branch) {
  return String(branch || '').trim() || 'Manggahan';
}

async function ensureSalesInvoiceSequence(client, branch) {
  const invoiceYear = await getSalesInvoiceSequenceYear(client);
  const sequenceBranch = getSalesInvoiceSequenceBranch(branch);
  const maxResult = await client.query(
    `SELECT GREATEST(
       COALESCE(MAX(official_invoice_number::int), 0),
       $1::int - 1
     ) AS last_number
     FROM sales_transactions
     WHERE official_invoice_number ~ $2
       AND branch = $3`,
    [SALES_INVOICE_START_NUMBER, SALES_INVOICE_NUMBER_PATTERN, sequenceBranch]
  );
  const lastNumber = Number(maxResult.rows[0]?.last_number || (SALES_INVOICE_START_NUMBER - 1));

  await client.query(
    `INSERT INTO invoice_number_sequences (document_type, invoice_year, branch, last_number, updated_at)
     VALUES ($1, $2, $3, $4, ${PHILIPPINE_NOW_SQL})
     ON CONFLICT (document_type, invoice_year, branch) DO UPDATE
     SET last_number = LEAST(GREATEST(invoice_number_sequences.last_number, EXCLUDED.last_number), $5::int),
         updated_at = ${PHILIPPINE_NOW_SQL}
     RETURNING last_number`,
    [SALES_INVOICE_DOCUMENT_TYPE, invoiceYear, sequenceBranch, Math.min(lastNumber, SALES_INVOICE_MAX_NUMBER), SALES_INVOICE_MAX_NUMBER]
  );

  return { invoiceYear, sequenceBranch };
}

async function peekNextOfficialSalesInvoiceNumber(client, branch) {
  const { invoiceYear, sequenceBranch } = await ensureSalesInvoiceSequence(client, branch);
  const result = await client.query(
    `SELECT last_number
     FROM invoice_number_sequences
     WHERE document_type = $1
       AND invoice_year = $2
       AND branch = $3`,
    [SALES_INVOICE_DOCUMENT_TYPE, invoiceYear, sequenceBranch]
  );
  const sequence = getNextOfficialSalesInvoiceSequence(result.rows[0]?.last_number);
  return formatOfficialSalesInvoiceNumber(sequence);
}

async function lockOfficialSalesInvoiceSequence(client, branch) {
  const { invoiceYear, sequenceBranch } = await ensureSalesInvoiceSequence(client, branch);
  const result = await client.query(
    `SELECT last_number
     FROM invoice_number_sequences
     WHERE document_type = $1
       AND invoice_year = $2
       AND branch = $3
     FOR UPDATE`,
    [SALES_INVOICE_DOCUMENT_TYPE, invoiceYear, sequenceBranch]
  );

  if (result.rowCount === 0) {
    throw new Error('Sales invoice sequence is not initialized.');
  }

  const lastNumber = Math.min(Number(result.rows[0]?.last_number || 0), SALES_INVOICE_MAX_NUMBER);
  const nextNumber = getNextOfficialSalesInvoiceSequence(lastNumber);
  return {
    invoiceYear,
    branch: sequenceBranch,
    lastNumber,
    nextNumber,
    nextInvoiceNumber: formatOfficialSalesInvoiceNumber(nextNumber)
  };
}

async function advanceOfficialSalesInvoiceSequence(client, invoiceYear, branch, officialInvoiceNumber) {
  const sequence = Number.parseInt(officialInvoiceNumber, 10);
  if (!Number.isInteger(sequence) || sequence < SALES_INVOICE_START_NUMBER || sequence > SALES_INVOICE_MAX_NUMBER) return;
  const sequenceBranch = getSalesInvoiceSequenceBranch(branch);
  await client.query(
    `UPDATE invoice_number_sequences
     SET last_number = CASE
           WHEN last_number >= $5::int THEN $3::int
           ELSE GREATEST(last_number, $3::int)
         END,
         updated_at = ${PHILIPPINE_NOW_SQL}
     WHERE document_type = $1
       AND invoice_year = $2
       AND branch = $4`,
    [SALES_INVOICE_DOCUMENT_TYPE, invoiceYear, sequence, sequenceBranch, SALES_INVOICE_MAX_NUMBER]
  );
}

async function generatePurchaseNumber(client) {
  const year = new Date().getFullYear();
  await client.query('LOCK TABLE purchase_transactions IN EXCLUSIVE MODE');
  const result = await client.query(
    `SELECT COALESCE(MAX(purchase_transaction_id), 0) + 1 AS next_number
     FROM purchase_transactions`
  );
  const sequence = Number(result.rows[0]?.next_number || 1);
  return `PUR-${year}-${String(sequence).padStart(5, '0')}`;
}

async function refreshAverageDailySalesForInventory(client, inventoryId) {
  const inventoryResult = await client.query(
    `SELECT stock_level, min_stock_level, lead_time_days, safety_stock,
            average_daily_sales_mode, manual_average_daily_sales
     FROM branch_inventory
     WHERE inventory_id = $1
     FOR UPDATE`,
    [inventoryId]
  );

  if (inventoryResult.rowCount === 0) return null;

  const inventoryRow = inventoryResult.rows[0];
  const mode = normalizeAverageDailySalesMode(inventoryRow.average_daily_sales_mode);
  const averageDailySales = mode === 'manual'
    ? (inventoryRow.manual_average_daily_sales === null || inventoryRow.manual_average_daily_sales === undefined
        ? null
        : Number(inventoryRow.manual_average_daily_sales))
    : await calculateRecentAverageDailySales(client, inventoryId);
  const nextStatus = computeInventoryStatus(
    Number(inventoryRow.stock_level || 0),
    getEffectiveReorderThreshold({
      ...inventoryRow,
      average_daily_sales: averageDailySales
    })
  );

  await client.query(
    `UPDATE branch_inventory
     SET average_daily_sales = $1,
         status = $2,
         last_updated = ${PHILIPPINE_NOW_SQL}
     WHERE inventory_id = $3`,
    [averageDailySales, nextStatus, inventoryId]
  );

  return { averageDailySales, status: nextStatus };
}

const ALLOWED_CLIENT_AUDIT_ACTIONS = new Set([
  'EXPORT_REPORT',
  'MARK_ALERT_READ',
  'MARK_ALL_ALERTS_READ',
  'DISMISS_ALERT',
  'CONVERT_NON_INVENTORY_ITEM',
  'CLEAR_LOGS',
  'OPTIMIZE_DATABASE',
  'CHECK_DATA_INTEGRITY'
]);

async function recordAuditLog(db, {
  actorId,
  actorName,
  targetId = null,
  targetName = null,
  targetType = null,
  action,
  reason = null,
  details = null
}) {
  if (!actorId || !action) return;

  const safeDetails = details && typeof details === 'object' && !Array.isArray(details)
    ? details
    : {};

  await db.query(
    `INSERT INTO audit_logs (actor_id, actor_name, target_id, target_name, target_type, action, reason, details)
     VALUES ($1, COALESCE($2, (SELECT full_name FROM users WHERE user_id = $1), 'Unknown User'), $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      actorId,
      actorName || null,
      Number.isInteger(Number(targetId)) ? Number(targetId) : null,
      targetName || null,
      targetType || null,
      action,
      reason || null,
      JSON.stringify(safeDetails)
    ]
  );
}

async function recordAuditLogSafely(db, details) {
  try {
    await recordAuditLog(db, details);
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

async function recordSystemLog(db, {
  eventType,
  severity = 'info',
  message,
  context = {},
  actorId = null,
  actorName = null,
  isSecurity = false
}) {
  if (!eventType || !message) return;

  await db.query(
    `INSERT INTO system_logs (event_type, severity, message, context, actor_id, actor_name, is_security)
     VALUES ($1, $2, $3, $4::jsonb, $5, COALESCE($6, (SELECT full_name FROM users WHERE user_id = $5)), $7)`,
    [
      eventType,
      ['debug', 'info', 'warning', 'error'].includes(severity) ? severity : 'info',
      message,
      JSON.stringify(context || {}),
      Number.isInteger(Number(actorId)) ? Number(actorId) : null,
      actorName || null,
      Boolean(isSecurity)
    ]
  );
}

function normalizeBranch(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanPersonName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanUsername(value) {
  return String(value || '').trim();
}

function validatePersonName(value) {
  const cleanName = cleanPersonName(value);
  if (!cleanName) return 'Full name is required.';
  if (cleanName.length > 120) return 'Full name must be 120 characters or less.';
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿÑñ]+(?:[ .'-][A-Za-zÀ-ÖØ-öø-ÿÑñ]+)*$/.test(cleanName)) {
    return 'Full name should contain letters only. Spaces, hyphens, apostrophes, and periods are allowed.';
  }
  return null;
}

function validateUsername(value) {
  const cleanValue = cleanUsername(value);
  if (!cleanValue) return 'Username is required.';
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(cleanValue)) {
    return 'Username should be 3 to 30 characters and use letters, numbers, dots, underscores, or hyphens only.';
  }
  return null;
}

function validateEmailAddress(value) {
  const cleanValue = String(value || '').trim().toLowerCase();
  if (!cleanValue) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanValue) || cleanValue.length > 254) {
    return 'Please enter a valid email address.';
  }
  return null;
}

// Normalize password comparison inputs so policy checks are resilient to casing,
// punctuation, and spacing differences in usernames, emails, and full names.
function normalizePasswordComparison(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Account-derived terms are blocked from passwords to reduce predictable
// credentials without requiring staff to memorize overly complex rules.
function getAccountPasswordTerms({ fullName, username, email } = {}) {
  const terms = [];
  const normalizedUsername = normalizePasswordComparison(username);
  const emailValue = String(email || '').toLowerCase().trim();
  const emailLocalPart = normalizePasswordComparison(emailValue.split('@')[0]);
  const nameParts = String(fullName || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(normalizePasswordComparison)
    .filter(part => part.length >= 4);

  if (normalizedUsername.length >= 4) terms.push(normalizedUsername);
  if (emailLocalPart.length >= 4) terms.push(emailLocalPart);
  terms.push(...nameParts);

  return Array.from(new Set(terms));
}

function validatePasswordPolicy(password, accountDetails = {}) {
  const passwordText = String(password || '');
  const normalizedPassword = normalizePasswordComparison(passwordText);

  if (!passwordText.trim() || !/[a-z0-9]/i.test(passwordText)) {
    return 'Password must include at least one letter or number.';
  }

  if (passwordText.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }

  if (passwordText.length > PASSWORD_MAX_LENGTH) {
    return `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`;
  }

  if (COMMON_PASSWORDS.has(normalizedPassword)) {
    return 'This password is too common. Please choose a stronger password.';
  }

  const matchingAccountTerm = getAccountPasswordTerms(accountDetails).find(term => normalizedPassword.includes(term));
  if (matchingAccountTerm) {
    return 'This password is too similar to your account details. Please choose a stronger password.';
  }

  return null;
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 10; i += 1) {
    suffix += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `Temp-${suffix}`;
}

function isAdmin(user) {
  return normalizeRole(user?.role) === 'Admin';
}

function normalizeRole(role) {
  return role === 'Employee' ? 'Inventory Staff' : role;
}

function canRecordSales(user) {
  const role = normalizeRole(user?.role);
  return role === 'Admin' || role === 'Cashier';
}

function canPerformInventoryMovement(user) {
  const role = normalizeRole(user?.role);
  return role === 'Admin' || role === 'Inventory Staff';
}

function getRoleLabel(role) {
  const normalized = normalizeRole(role);
  if (normalized === 'Admin') return 'Admin / Manager';
  if (normalized === 'Cashier') return 'Cashier / Encoder';
  if (normalized === 'Inventory Staff') return 'Inventory Staff';
  return role || 'User';
}

function signToken(user, branchOverride) {
  return jwt.sign(
    {
      id: user.user_id,
      role: user.role,
      branch: branchOverride || user.branch,
      tokenVersion: user.token_version || 0
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

async function sendPendingRegistrationEmail(toEmail, fullName, branch) {
  await sendMail({
    from: emailFrom('E.M. Cayetano Trading Notifications'),
    to: toEmail,
    subject: 'Your registration is pending approval',
    html: buildEmailShell({
      eyebrow: 'Registration Update',
      title: 'Registration Received',
      intro: 'Your account request has entered the review queue and is waiting for branch administrator approval.',
      accent: '#b45309',
      body: `
        <p>Hello <strong>${escapeHtml(fullName || 'Team Member')}</strong>,</p>
        <p>Thank you for registering for the E.M. Cayetano Trading system. We have successfully received your request.</p>
        ${buildInfoCard('Selected Branch', branch || 'Pending branch assignment', 'warning')}
        <p>Your account will remain unavailable until an administrator reviews and activates it.</p>
        ${buildBulletList([
          'Wait for an approval update from the system.',
          'Use the same email inbox for future login verification codes.',
          'Contact your branch administrator if you submitted the wrong branch.'
        ])}
      `
    })
  });
}

async function sendActivationEmail(toEmail, fullName) {
  await sendMail({
    from: emailFrom('E.M. Cayetano Trading Notifications'),
    to: toEmail,
    subject: 'Your account is now active',
    html: buildEmailShell({
      eyebrow: 'Account Approved',
      title: 'You Are Ready To Sign In',
      intro: 'Your account has been approved and activated in the store management system.',
      accent: '#166534',
      body: `
        <p>Hello <strong>${escapeHtml(fullName || 'Team Member')}</strong>,</p>
        <p>Your access is now active. You can sign in using the username and password you registered with.</p>
        ${buildInfoCard('Account Status', 'Active', 'success')}
        <p>For added security, the system may ask for a one-time verification code during login.</p>
        ${buildBulletList([
          'Open the login page and enter your credentials.',
          'Check this inbox for your verification code if prompted.',
          'Contact your administrator if you cannot access your assigned branch.'
        ])}
      `
    })
  });
}

async function sendAdminCreatedAccountEmail(toEmail, fullName, username, temporaryPassword, branch, role) {
  await sendMail({
    from: emailFrom('E.M. Cayetano Trading Notifications'),
    to: toEmail,
    subject: 'Your E.M. Cayetano account has been created',
    html: buildEmailShell({
      eyebrow: 'Account Created',
      title: 'Your System Account Is Ready',
      intro: 'An administrator created your account for the E.M. Cayetano Trading store management system.',
      accent: '#1d4ed8',
      body: `
        <p>Hello <strong>${escapeHtml(fullName || 'Team Member')}</strong>,</p>
        <p>You may now sign in using the temporary credentials below. For security, the system will ask you to change this password after your first successful login.</p>
        ${buildInfoCard('Username', username || 'Not provided', 'security')}
        ${buildInfoCard('Temporary Password', temporaryPassword || 'Provided by administrator', 'warning')}
        ${buildInfoCard('Assigned Branch', branch || 'Not specified', 'security')}
        ${buildInfoCard('Role', getRoleLabel(role || 'Inventory Staff'), 'security')}
        ${buildBulletList([
          'Do not share your temporary password with anyone.',
          'Log in using your assigned branch.',
          'Choose a new password that is easy for you to remember but hard for others to guess.'
        ])}
      `,
      footerNote: 'If you did not expect this account, please contact your branch administrator.'
    })
  });
}

async function sendRejectionEmail(toEmail, fullName, branch) {
  await sendMail({
    from: emailFrom('E.M. Cayetano Trading Notifications'),
    to: toEmail,
    subject: 'Update on your registration request',
    html: buildEmailShell({
      eyebrow: 'Registration Update',
      title: 'Registration Not Approved',
      intro: 'Your recent account request could not be approved at this time.',
      accent: '#991b1b',
      body: `
        <p>Hello <strong>${escapeHtml(fullName || 'Team Member')}</strong>,</p>
        <p>After review, your registration for the system was not approved.</p>
        ${buildInfoCard('Branch', branch || 'Not specified', 'danger')}
        <p>If you believe this decision needs clarification, please contact your branch administrator before submitting another request.</p>
      `
    })
  });
}

async function sendDeactivationEmail(toEmail, fullName, branch) {
  await sendMail({
    from: emailFrom('E.M. Cayetano Trading Notifications'),
    to: toEmail,
    subject: 'Your account has been deactivated',
    html: buildEmailShell({
      eyebrow: 'Account Status Update',
      title: 'Account Deactivated',
      intro: 'Your system access has been turned off and login is no longer available until reactivation.',
      accent: '#991b1b',
      body: `
        <p>Hello <strong>${escapeHtml(fullName || 'Team Member')}</strong>,</p>
        <p>Your account for the <strong>${escapeHtml(branch || 'assigned')}</strong> branch has been deactivated.</p>
        ${buildInfoCard('System Access', 'Inactive', 'danger')}
        <p>If this change was unexpected, please contact an administrator so they can review your account status.</p>
      `
    })
  });
}

async function sendRoleChangeEmail(toEmail, fullName, oldRole, newRole) {
  await sendMail({
    from: emailFrom('E.M. Cayetano Trading Notifications'),
    to: toEmail,
    subject: 'Your role has been updated',
    html: buildEmailShell({
      eyebrow: 'Permissions Update',
      title: 'Your Role Has Changed',
      intro: 'Your access permissions in the system were updated by an administrator.',
      accent: '#1d4ed8',
      body: `
        <p>Hello <strong>${escapeHtml(fullName || 'Team Member')}</strong>,</p>
        <p>Your account role has been updated. Please review the previous and new role shown below.</p>
        ${buildChangeComparison('Role', oldRole || 'Unknown', newRole || 'Unknown', 'security')}
        <p>This change will apply the next time you log in.</p>
      `
    })
  });
}

async function sendBranchTransferEmail(toEmail, fullName, oldBranch, newBranch) {
  await sendMail({
    from: emailFrom('E.M. Cayetano Trading Notifications'),
    to: toEmail,
    subject: 'Your branch assignment has been updated',
    html: buildEmailShell({
      eyebrow: 'Branch Transfer',
      title: 'Your Branch Assignment Was Updated',
      intro: 'Your system access has been moved to a different branch so your records and permissions match your latest assignment.',
      accent: '#7c3aed',
      body: `
        <p>Hello <strong>${escapeHtml(fullName || 'Team Member')}</strong>,</p>
        <p>Your branch assignment has been updated. Please review the previous and new branch shown below.</p>
        ${buildChangeComparison('Branch', oldBranch || 'Unknown', newBranch || 'Unknown', 'warning')}
        <p>The next time you log in, your account will use the new branch.</p>
      `
    })
  });
}

async function sendOtpEmail(user, otp, subject, intro) {
  await sendMail({
    from: emailFrom('E.M. Cayetano Trading - Security'),
    to: user.email,
    subject,
    html: buildEmailShell({
      eyebrow: 'Security Verification',
      title: subject,
      intro,
      accent: '#1d4ed8',
      body: `
        <p>Hello <strong>${escapeHtml(user.full_name || user.username || 'there')}</strong>,</p>
        <p>Use the verification code below to continue. For your protection, this code expires quickly and should not be shared.</p>
        ${buildOtpBlock(otp)}
        <p>If you did not initiate this action, please notify your administrator and secure your account immediately.</p>
      `,
      footerNote: 'Security emails are sent automatically whenever account verification is required.'
    })
  });
}

function normalizeOtpRateLimitIdentifier(type, value) {
  return `${type}:${String(value || '').trim().toLowerCase()}`;
}

function formatRetryAfter(seconds) {
  const safeSeconds = Math.max(1, Number(seconds) || 1);
  if (safeSeconds < 60) {
    return `${safeSeconds} second${safeSeconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  const minuteText = `${minutes} minute${minutes === 1 ? '' : 's'}`;

  if (remainingSeconds === 0) {
    return minuteText;
  }

  return `${minuteText} and ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`;
}

function getPostgresToolPath(envKey, commandName) {
  return process.env[envKey] || commandName;
}

function getPostgresToolError(err, commandName) {
  if (err && err.code === 'ENOENT') {
    return `${commandName} was not found. Install PostgreSQL client tools or set the ${commandName === 'pg_dump' ? 'PG_DUMP_PATH' : 'PSQL_PATH'} environment variable to the full executable path.`;
  }

  return err?.message || `${commandName} failed`;
}

const RESTORE_APP_TABLES = [
  'schema_migrations',
  'system_logs',
  'sales_items',
  'sales_transactions',
  'purchase_items',
  'purchase_transactions',
  'stock_movements',
  'archived_inventory',
  'branch_inventory',
  'products',
  'audit_logs',
  'backup_logs',
  'users'
];

function getRestoreValidationError(sql) {
  const normalized = String(sql || '').toLowerCase();
  const requiredMarkers = [
    'postgresql database dump',
    'create table public.schema_migrations',
    'create table public.users',
    'create table public.products',
    'create table public.branch_inventory',
    'create table public.stock_movements',
    'create table public.sales_transactions',
    'create table public.sales_items',
    'create table public.purchase_transactions',
    'create table public.purchase_items',
    'create table public.archived_inventory',
    'create table public.audit_logs',
    'create table public.backup_logs',
    'create table public.system_logs'
  ];

  if (!requiredMarkers.every(marker => normalized.includes(marker))) {
    return 'The selected file does not look like a complete E.M. Cayetano PostgreSQL backup.';
  }

  const blockedPatterns = [
    /\bdrop\s+database\b/i,
    /\bcreate\s+database\b/i,
    /\\connect\b/i,
    /\\c\b/i
  ];

  if (blockedPatterns.some(pattern => pattern.test(sql))) {
    return 'The backup contains database-level commands that are not allowed in this restore operation.';
  }

  return null;
}

function buildRestoreScript(sql) {
  const stagingSchema = `restore_validation_${Date.now()}`;
  const escapedStagingSchema = stagingSchema.replace(/"/g, '""');
  const stagedSql = sql
    .replace(/\bpublic\./g, `${stagingSchema}.`)
    .replace(/'public\./g, `'${stagingSchema}.`);
  const dropStatements = RESTORE_APP_TABLES
    .map(table => `DROP TABLE IF EXISTS public.${table} CASCADE;`)
    .join('\n');

  return [
    '-- Restore script generated by the E.M. Cayetano maintenance module.',
    '-- The uploaded backup is loaded into a temporary schema first.',
    '-- Live application tables are replaced only after the backup proves it can restore successfully.',
    'SET client_min_messages = warning;',
    `DROP SCHEMA IF EXISTS "${escapedStagingSchema}" CASCADE;`,
    `CREATE SCHEMA "${escapedStagingSchema}";`,
    '',
    stagedSql,
    '',
    dropStatements,
    '',
    sql,
    '',
    `DROP SCHEMA IF EXISTS "${escapedStagingSchema}" CASCADE;`
  ].join('\n');
}

function toPhilippineTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');
}

function checkOtpRateLimit(identifier) {
  const now = Date.now();
  // Keep only requests inside the rolling window before evaluating both the
  // total request cap and the shorter resend cooldown.
  const recentRequests = (otpRequestBuckets.get(identifier) || [])
    .filter(timestamp => now - timestamp < OTP_RATE_LIMIT_WINDOW_MS);

  if (recentRequests.length >= OTP_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((OTP_RATE_LIMIT_WINDOW_MS - (now - recentRequests[0])) / 1000)
    );
    const message = `Too many OTP requests used. You have reached the resend limit for now. Please wait ${formatRetryAfter(retryAfterSeconds)} before requesting a new code.`;
    otpRequestBuckets.set(identifier, recentRequests);
    return {
      allowed: false,
      message,
      error: message,
      retryAfterSeconds,
      remainingAttempts: 0
    };
  }

  const lastRequestAt = recentRequests[recentRequests.length - 1];
  if (lastRequestAt && now - lastRequestAt < OTP_RESEND_COOLDOWN_MS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - lastRequestAt)) / 1000)
    );
    const message = `A verification code was already sent. Please wait ${formatRetryAfter(retryAfterSeconds)} before another code can be sent.`;
    otpRequestBuckets.set(identifier, recentRequests);
    return {
      allowed: false,
      message,
      error: message,
      retryAfterSeconds,
      remainingAttempts: Math.max(0, OTP_RATE_LIMIT_MAX_REQUESTS - recentRequests.length)
    };
  }

  otpRequestBuckets.set(identifier, recentRequests);
  return {
    allowed: true,
    remainingAttempts: Math.max(0, OTP_RATE_LIMIT_MAX_REQUESTS - recentRequests.length)
  };
}

function recordOtpRequest(identifier) {
  const now = Date.now();
  const recentRequests = (otpRequestBuckets.get(identifier) || [])
    .filter(timestamp => now - timestamp < OTP_RATE_LIMIT_WINDOW_MS);
  recentRequests.push(now);
  otpRequestBuckets.set(identifier, recentRequests);

  const remainingAttempts = Math.max(0, OTP_RATE_LIMIT_MAX_REQUESTS - recentRequests.length);
  const retryAfterSeconds = remainingAttempts === 0
    ? Math.max(1, Math.ceil((OTP_RATE_LIMIT_WINDOW_MS - (now - recentRequests[0])) / 1000))
    : Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000);

  return {
    remainingAttempts: Math.min(OTP_RATE_LIMIT_MAX_RESENDS, remainingAttempts),
    retryAfterSeconds
  };
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT user_id, full_name, username, role, branch, token_version, status FROM users WHERE user_id = $1',
      [decoded.id]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const dbUser = result.rows[0];
    if ((dbUser.token_version || 0) !== (decoded.tokenVersion || 0)) {
      return res.status(401).json({ error: 'Session invalidated' });
    }

    if (dbUser.status !== 'Active') {
      return res.status(403).json({ error: `Account is ${dbUser.status}` });
    }

    req.user = {
      id: dbUser.user_id,
      fullName: dbUser.full_name,
      username: dbUser.username,
      role: decoded.role,
      branch: decoded.branch || dbUser.branch
    };

    return next();
  } catch (err) {
    if (err && err.code === '42P01') {
      console.error('Authentication failed because a required table is missing:', err.message);
      try {
        await ensureSchema();
      } catch (schemaErr) {
        console.error('Schema recovery failed after authentication table error:', schemaErr.message);
      }
      return res.status(503).json({
        error: 'Database is not ready. Please wait a moment and try again.'
      });
    }

    console.error('JWT verify failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Admin / Manager access required' });
  }

  return next();
}

app.get('/', (req, res) => {
  res.send('E.M. Cayetano Trading API is Running');
});

app.post('/api/auth/register', async (req, res) => {
  return res.status(410).json({
    error: 'Account requests are disabled. Please ask the Admin / Manager to create your account.'
  });

  const { password, branch } = req.body;
  const fullName = cleanPersonName(req.body.fullName);
  const username = cleanUsername(req.body.username);
  const email = String(req.body.email || '').trim().toLowerCase();
  const normalizedBranch = normalizeBranch(branch);

  if (!fullName || !username || !email || !password) {
    return res.status(400).json({ error: 'Missing required registration fields' });
  }

  const nameError = validatePersonName(fullName);
  if (nameError) {
    return res.status(400).json({ error: nameError });
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return res.status(400).json({ error: usernameError });
  }

  const emailError = validateEmailAddress(email);
  if (emailError) {
    return res.status(400).json({ error: emailError });
  }

  if (!ALLOWED_BRANCHES.includes(normalizedBranch)) {
    return res.status(400).json({ error: 'Invalid branch selection' });
  }

  const passwordError = validatePasswordPolicy(password, { fullName, username, email });
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const safeRole = 'Inventory Staff';

  try {
    const existing = await pool.query(
      'SELECT 1 FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    if (existing.rowCount > 0) {
      return res.status(400).json({ error: 'Username or Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await pool.query(
      `INSERT INTO users (full_name, username, email, password_hash, role, branch, status, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pending', false)
       RETURNING user_id, username, role, status, branch`,
      [fullName, username, email, passwordHash, safeRole, normalizedBranch]
    );

    sendPendingRegistrationEmail(email, fullName, normalizedBranch);

    return res.json({
      message: 'Registration submitted for approval',
      user: inserted.rows[0]
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password, branch } = req.body;
  const selectedBranch = normalizeBranch(branch);

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(password || '', user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ error: 'Your account does not have access. Please contact an administrator.' });
    }

    if (!selectedBranch) {
      return res.status(400).json({ error: 'Branch selection is required.' });
    }

    if (!isAdmin(user) && user.branch && user.branch !== selectedBranch) {
      return res.status(403).json({
        error: `Access denied: Your registered branch is ${user.branch}. Please log in using that branch.`
      });
    }

    return res.json({
      message: '2FA Required',
      require2fa: true,
      username: user.username,
      email: user.email
    });
  } catch (err) {
    if (err && err.code === '42P01') {
      console.error('Login failed because a required table is missing:', err.message);
      try {
        await ensureSchema();
      } catch (schemaErr) {
        console.error('Schema recovery failed after login table error:', schemaErr.message);
        return res.status(503).json({
          error: 'Database is not ready. Please restart the server and try again.'
        });
      }
      return res.status(503).json({
        error: 'Database tables were restored. Please try logging in again.'
      });
    }

    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/api/auth/assigned-branch', async (req, res) => {
  const username = cleanUsername(req.body.username);
  const password = req.body.password || '';
  const usernameError = validateUsername(username);
  if (usernameError || !password) {
    return res.status(400).json({ error: 'Enter username and password first.' });
  }

  try {
    const userResult = await pool.query(
      'SELECT user_id, username, password_hash, role, branch, status FROM users WHERE username = $1',
      [username]
    );
    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ error: 'Your account does not have access. Please contact an administrator.' });
    }

    return res.json({
      branch: isAdmin(user) ? '' : normalizeBranch(user.branch),
      branchLocked: !isAdmin(user),
      role: user.role
    });
  } catch (err) {
    console.error('Assigned branch lookup error:', err);
    return res.status(500).json({ error: 'Failed to check assigned branch.' });
  }
});

app.post('/api/auth/send-otp', async (req, res) => {
  const username = cleanUsername(req.body.username);
  const usernameError = validateUsername(username);
  if (usernameError) {
    return res.status(400).json({ error: usernameError });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    if (user.status !== 'Active') {
      return res.status(403).json({ error: 'Your account does not have access. Please contact an administrator.' });
    }

    const rateLimitKey = normalizeOtpRateLimitIdentifier('username', user.username);
    const rateLimit = checkOtpRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      const existingExpiry = user.login_otp_expires ? new Date(user.login_otp_expires) : null;
      const existingExpiresAt = existingExpiry && !Number.isNaN(existingExpiry.getTime())
        ? existingExpiry.toISOString()
        : undefined;
      return res.status(429).json({
        ...rateLimit,
        expiresAt: existingExpiresAt,
        serverTime: Date.now()
      });
    }

    const issuedAt = Date.now();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(issuedAt + OTP_TTL_MS);

    await pool.query(
      'UPDATE users SET login_otp_code = $1, login_otp_expires = $2 WHERE user_id = $3',
      [otp, toPhilippineTimestamp(expiresAt), user.user_id]
    );

    await sendOtpEmail(user, otp, '2FA Login Verification', 'Use this code to complete your login.');
    const { remainingAttempts, retryAfterSeconds } = recordOtpRequest(rateLimitKey);
    const attemptText = remainingAttempts === 1 ? 'attempt' : 'attempts';
    const message = remainingAttempts === 0
      ? `Verification code sent. This was your last resend attempt for now. Please enter it before it expires. You can request another code in ${formatRetryAfter(retryAfterSeconds)}.`
      : `Verification code sent. You have ${remainingAttempts} resend ${attemptText} remaining.`;

    return res.json({
      message,
      expiresAt: expiresAt.toISOString(),
      serverTime: issuedAt,
      retryAfterSeconds,
      remainingAttempts
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const username = cleanUsername(req.body.username);
  const code = String(req.body.code || '').replace(/\s+/g, '');
  const selectedBranch = normalizeBranch(req.body.branch);
  const usernameError = validateUsername(username);
  if (usernameError) {
    return res.status(400).json({ error: usernameError });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Please enter the full 6-digit code' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    if (user.status !== 'Active') {
      return res.status(403).json({ error: 'Your account does not have access. Please contact an administrator.' });
    }

    if (user.login_otp_code !== code) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    if (!user.login_otp_expires || new Date(user.login_otp_expires).getTime() + 15000 < Date.now()) {
      return res.status(400).json({ error: 'Code expired' });
    }

    if (!isAdmin(user) && selectedBranch && selectedBranch !== user.branch) {
      return res.status(403).json({ error: 'Selected branch does not match your account' });
    }

    await pool.query(
      'UPDATE users SET login_otp_code = NULL, login_otp_expires = NULL WHERE user_id = $1',
      [user.user_id]
    );

    const sessionBranch = isAdmin(user) && selectedBranch ? selectedBranch : user.branch;
    const token = signToken(user, sessionBranch);

    return res.json({
      message: 'Login Verified',
      token,
      user: {
        ...user,
        branch: sessionBranch
      }
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const emailError = validateEmailAddress(email);
  if (emailError) {
    return res.status(400).json({ error: emailError });
  }

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const user = userResult.rows[0];
    const rateLimitKey = normalizeOtpRateLimitIdentifier('email', user.email || email);
    const rateLimit = checkOtpRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return res.status(429).json(rateLimit);
    }

    const issuedAt = Date.now();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(issuedAt + OTP_TTL_MS);

    await pool.query(
      'UPDATE users SET reset_otp_code = $1, reset_otp_expires = $2 WHERE email = $3',
      [otp, toPhilippineTimestamp(expiresAt), email]
    );

    await sendOtpEmail(user, otp, 'Password Reset Verification', 'Use this code to reset your password.');
    const { remainingAttempts, retryAfterSeconds } = recordOtpRequest(rateLimitKey);
    const attemptText = remainingAttempts === 1 ? 'attempt' : 'attempts';
    const message = remainingAttempts === 0
      ? `Verification code sent. This was your last resend attempt for now. Please enter it before it expires. You can request another code in ${formatRetryAfter(retryAfterSeconds)}.`
      : `Verification code sent. You have ${remainingAttempts} resend ${attemptText} remaining.`;

    return res.json({
      message,
      expiresAt: expiresAt.toISOString(),
      serverTime: issuedAt,
      retryAfterSeconds,
      remainingAttempts
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Failed to send code' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const otp = String(req.body.otp || '').replace(/\s+/g, '');
  const newPassword = req.body.newPassword;

  const emailError = validateEmailAddress(email);
  if (emailError) {
    return res.status(400).json({ error: emailError });
  }

  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: 'Please enter the full 6-digit code' });
  }

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const expiresMs = user.reset_otp_expires ? new Date(user.reset_otp_expires).getTime() : 0;

    if (user.reset_otp_code !== otp || Date.now() - expiresMs > 15000) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const passwordError = validatePasswordPolicy(newPassword, {
      fullName: user.full_name,
      username: user.username,
      email: user.email
    });
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           reset_otp_code = NULL,
           reset_otp_expires = NULL,
           must_change_password = false,
           -- Bump token_version so any existing sessions are forced to sign in again.
           token_version = COALESCE(token_version, 0) + 1
       WHERE user_id = $2`,
      [newHash, user.user_id]
    );

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/api/auth/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  try {
    const userResult = await pool.query(
      `SELECT user_id, full_name, username, email, password_hash, role, branch, token_version
       FROM users
       WHERE user_id = $1`,
      [req.user.id]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const currentPasswordMatches = await bcrypt.compare(currentPassword || '', user.password_hash);
    if (!currentPasswordMatches) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const passwordError = validatePasswordPolicy(newPassword, {
      fullName: user.full_name,
      username: user.username,
      email: user.email
    });
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const updated = await pool.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = false,
           token_version = COALESCE(token_version, 0) + 1
       WHERE user_id = $2
       RETURNING user_id, full_name, username, email, role, branch, status, must_change_password, token_version`,
      [newHash, user.user_id]
    );

    const updatedUser = updated.rows[0];
    await recordAuditLogSafely(pool, {
      actorId: updatedUser.user_id,
      targetId: updatedUser.user_id,
      targetName: updatedUser.full_name,
      targetType: 'user_account',
      action: 'CHANGE_OWN_PASSWORD',
      reason: 'User changed temporary or current password.',
      details: {
        branch: updatedUser.branch,
        role: updatedUser.role
      }
    });

    return res.json({
      message: 'Password changed successfully',
      token: signToken(updatedUser, updatedUser.branch),
      user: updatedUser
    });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, full_name, username, email, role, branch, status, must_change_password, created_at
       FROM users
       WHERE branch = $1
       ORDER BY created_at DESC NULLS LAST`,
      [req.user.branch]
    );

    return res.json({ users: result.rows });
  } catch (err) {
    console.error('Fetch users error:', err);
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

app.post('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  const fullName = cleanPersonName(req.body.fullName || req.body.full_name);
  const username = cleanUsername(req.body.username);
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = ALLOWED_ROLES.includes(req.body.role) ? req.body.role : 'Inventory Staff';
  const branch = normalizeBranch(req.body.branch || req.user.branch);
  const temporaryPassword = generateTemporaryPassword();

  if (!fullName || !username || !email) {
    return res.status(400).json({ error: 'Full name, username, and email are required.' });
  }

  const nameError = validatePersonName(fullName);
  if (nameError) {
    return res.status(400).json({ error: nameError });
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return res.status(400).json({ error: usernameError });
  }

  const emailError = validateEmailAddress(email);
  if (emailError) {
    return res.status(400).json({ error: emailError });
  }

  if (!ALLOWED_BRANCHES.includes(branch)) {
    return res.status(400).json({ error: 'Invalid branch selection.' });
  }

  try {
    const existing = await pool.query(
      'SELECT 1 FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existing.rowCount > 0) {
      return res.status(400).json({ error: 'Username or email already exists.' });
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const inserted = await pool.query(
      `INSERT INTO users (full_name, username, email, password_hash, role, branch, status, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, 'Active', true)
       RETURNING user_id, full_name, username, email, role, branch, status, must_change_password, created_at`,
      [fullName, username, email, passwordHash, role, branch]
    );

    const user = inserted.rows[0];
    await recordAuditLogSafely(pool, {
      actorId: req.user.id,
      targetId: user.user_id,
      targetName: user.full_name,
      targetType: 'user_account',
      action: 'CREATE_USER_ACCOUNT',
      reason: 'Admin created an official user account with a temporary password.',
      details: {
        username: user.username,
        branch: user.branch,
        role: user.role,
        mustChangePassword: true
      }
    });

    const emailSent = await sendAdminCreatedAccountEmail(
      user.email,
      user.full_name,
      user.username,
      temporaryPassword,
      user.branch,
      user.role
    );
    const emailDeliveryStatus = process.env.EMAIL_USER && process.env.EMAIL_PASS
      ? (emailSent ? 'sent' : 'failed')
      : 'local_preview';

    return res.status(201).json({
      message: 'User account created',
      user,
      temporaryPassword,
      emailDeliveryStatus
    });
  } catch (err) {
    console.error('Create user account error:', err);
    return res.status(500).json({ error: 'Failed to create user account' });
  }
});

app.post('/api/audit-logs', authenticate, async (req, res) => {
  const action = String(req.body.action || '').trim().toUpperCase();
  const targetName = typeof req.body.target_name === 'string' ? req.body.target_name.trim() : null;
  const targetType = typeof req.body.target_type === 'string' ? req.body.target_type.trim() : null;
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : null;
  const details = req.body.details && typeof req.body.details === 'object' ? req.body.details : null;
  const targetId = req.body.target_id;

  if (!ALLOWED_CLIENT_AUDIT_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'Unsupported audit action' });
  }

  try {
    await recordAuditLog(pool, {
      actorId: req.user.id,
      targetId,
      targetName,
      targetType,
      action,
      reason,
      details
    });
    return res.status(201).json({ message: 'Audit log recorded' });
  } catch (err) {
    console.error('Create audit log error:', err);
    return res.status(500).json({ error: 'Failed to record audit log' });
  }
});

app.get('/api/audit-logs', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, actor_id, actor_name, target_id, target_name, target_type, action, reason, details, created_at
       FROM audit_logs
       ORDER BY created_at DESC, id DESC
       LIMIT 500`
    );
    return res.json({ auditLogs: result.rows });
  } catch (err) {
    console.error('Fetch audit logs error:', err);
    return res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

app.post('/api/admin/users/:id/approve', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const update = await pool.query(
      `UPDATE users
       SET status = 'Active'
       WHERE user_id = $1 AND branch = $2
       RETURNING user_id, full_name, email, username, branch, status, role, must_change_password, created_at`,
      [id, req.user.branch]
    );

    if (update.rowCount === 0) {
      return res.status(404).json({ error: 'User not found in this branch' });
    }

    const user = update.rows[0];
    await recordAuditLogSafely(pool, {
      actorId: req.user.id,
      targetId: user.user_id,
      targetName: user.full_name,
      targetType: 'user_account',
      action: 'APPROVE_USER',
      reason: 'Pending employee account approved.',
      details: {
        username: user.username,
        branch: user.branch,
        role: user.role,
        previousStatus: 'Pending',
        newStatus: user.status
      }
    });
    sendActivationEmail(user.email, user.full_name);

    return res.json({ message: 'User approved and activated', user });
  } catch (err) {
    console.error('Approve user error:', err);
    return res.status(500).json({ error: 'Failed to approve user' });
  }
});

app.post('/api/admin/users/:id/reject', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const current = await pool.query(
      `SELECT user_id, full_name, email, branch, status
       FROM users
       WHERE user_id = $1 AND branch = $2`,
      [id, req.user.branch]
    );

    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'User not found in this branch' });
    }

    const previous = current.rows[0];
    const update = await pool.query(
      `UPDATE users
       SET status = 'Inactive', token_version = COALESCE(token_version, 0) + 1
       WHERE user_id = $1 AND branch = $2
       RETURNING user_id, full_name, email, username, branch, status, role, must_change_password, created_at`,
      [id, req.user.branch]
    );

    const user = update.rows[0];
    await recordAuditLogSafely(pool, {
      actorId: req.user.id,
      targetId: user.user_id,
      targetName: user.full_name,
      targetType: 'user_account',
      action: previous.status === 'Pending' ? 'REJECT_USER' : 'DEACTIVATE_USER',
      reason: previous.status === 'Pending'
        ? 'Pending employee account rejected.'
        : 'Active employee account deactivated.',
      details: {
        branch: user.branch,
        previousStatus: previous.status,
        newStatus: user.status
      }
    });
    if (previous.status === 'Pending') {
      sendRejectionEmail(user.email, user.full_name, user.branch);
    } else {
      sendDeactivationEmail(user.email, user.full_name, user.branch);
    }

    return res.json({ message: 'User rejected/deactivated', user });
  } catch (err) {
    console.error('Reject user error:', err);
    return res.status(500).json({ error: 'Failed to reject user' });
  }
});

app.post('/api/admin/users/:id/role', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const newRole = String(req.body.role || '').trim();

  if (!ALLOWED_ROLES.includes(newRole)) {
    return res.status(400).json({ error: 'Invalid role selection' });
  }

  try {
    const userResult = await pool.query(
      `SELECT user_id, full_name, email, username, branch, role, status
       FROM users
       WHERE user_id = $1 AND branch = $2`,
      [id, req.user.branch]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found in this branch' });
    }

    const targetUser = userResult.rows[0];
    if (targetUser.role === newRole) {
      return res.status(400).json({ error: 'User already has this role' });
    }

    if (targetUser.role === 'Admin' && newRole !== 'Admin') {
      const adminCount = await pool.query(
        `SELECT COUNT(*)::int AS count FROM users WHERE role = 'Admin' AND status = 'Active'`
      );
      if ((adminCount.rows[0]?.count || 0) <= 1) {
        return res.status(400).json({
          error: 'Cannot change role: At least one Admin is required to manage the system.'
        });
      }
    }

    const updated = await pool.query(
      `UPDATE users
       SET role = $1, token_version = COALESCE(token_version, 0) + 1
       WHERE user_id = $2
       RETURNING user_id, full_name, email, username, branch, role, status, must_change_password, token_version, created_at`,
      [newRole, id]
    );

    const updatedUser = updated.rows[0];
    await recordAuditLogSafely(pool, {
      actorId: req.user.id,
      targetId: updatedUser.user_id,
      targetName: updatedUser.full_name,
      targetType: 'user_account',
      action: `CHANGE_ROLE: ${targetUser.role} to ${newRole}`,
      reason: 'User role changed by admin.',
      details: {
        branch: updatedUser.branch,
        previousRole: targetUser.role,
        newRole
      }
    });

    sendRoleChangeEmail(updatedUser.email, updatedUser.full_name, targetUser.role, newRole);

    return res.json({
      message: 'User role updated',
      user: updatedUser,
      selfDemoted: req.user.id === updatedUser.user_id && newRole !== 'Admin'
    });
  } catch (err) {
    console.error('Update role error:', err);
    return res.status(500).json({ error: 'Failed to update user role' });
  }
});

app.post('/api/admin/users/:id/branch', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const newBranch = normalizeBranch(req.body.branch);

  if (!ALLOWED_BRANCHES.includes(newBranch)) {
    return res.status(400).json({ error: 'Invalid branch selection' });
  }

  try {
    const userResult = await pool.query(
      `SELECT user_id, full_name, email, username, branch, role, status
       FROM users
       WHERE user_id = $1 AND branch = $2`,
      [id, req.user.branch]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found in this branch' });
    }

    const user = userResult.rows[0];
    if (user.branch === newBranch) {
      return res.status(400).json({ error: 'User is already in the selected branch' });
    }

    const updated = await pool.query(
      `UPDATE users
       SET branch = $1, token_version = COALESCE(token_version, 0) + 1
       WHERE user_id = $2
       RETURNING user_id, full_name, email, username, branch, role, status, must_change_password, created_at`,
      [newBranch, id]
    );

    const updatedUser = updated.rows[0];
    await recordAuditLogSafely(pool, {
      actorId: req.user.id,
      targetId: updatedUser.user_id,
      targetName: updatedUser.full_name,
      targetType: 'user_account',
      action: `CHANGE_BRANCH: ${user.branch} to ${newBranch}`,
      reason: 'User branch assignment changed by admin.',
      details: {
        previousBranch: user.branch,
        newBranch,
        role: updatedUser.role,
        status: updatedUser.status
      }
    });
    sendBranchTransferEmail(updatedUser.email, updatedUser.full_name, user.branch, newBranch);

    return res.json({ message: 'User branch updated', user: updatedUser });
  } catch (err) {
    console.error('Transfer user branch error:', err);
    return res.status(500).json({ error: 'Failed to transfer user branch' });
  }
});

app.get('/api/system/summary', authenticate, async (req, res) => {
  try {
    const activeUsersResult = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE branch = $1 AND status = 'Active'`,
      [req.user.branch]
    );

    const pendingUsersResult = isAdmin(req.user)
      ? await pool.query(
          `SELECT user_id, full_name, username, branch, created_at
           FROM users
           WHERE branch = $1 AND status = 'Pending'
           ORDER BY created_at DESC`,
          [req.user.branch]
        )
      : { rows: [] };

    const latestBackupResult = await pool.query(
      `SELECT action, actor_name, created_at
       FROM backup_logs
       WHERE action = 'backup'
       ORDER BY created_at DESC
       LIMIT 1`
    );

    const latestRestoreResult = await pool.query(
      `SELECT action, actor_name, created_at
       FROM backup_logs
       WHERE action = 'restore'
       ORDER BY created_at DESC
       LIMIT 1`
    );

    const branchSettingsResult = await pool.query(
      `SELECT daily_sales_target, updated_by_name, updated_at
       FROM branch_settings
       WHERE branch = $1`,
      [req.user.branch]
    );

    const recentSystemEventsResult = isAdmin(req.user)
      ? await pool.query(
          `SELECT id, event_type, severity, message, context, actor_name, created_at
           FROM system_logs
           WHERE event_type IN (
             'DATABASE_BACKUP',
             'DATABASE_RESTORE',
             'SYSTEM_LOG_CLEANUP',
             'DATABASE_OPTIMIZATION',
             'DATA_INTEGRITY_CHECK'
           )
             AND created_at >= (${PHILIPPINE_NOW_SQL} - INTERVAL '7 days')
           ORDER BY created_at DESC, id DESC
           LIMIT 12`
        )
      : { rows: [] };

    return res.json({
      databaseStatus: 'Online',
      activeUserCount: activeUsersResult.rows[0]?.count || 0,
      pendingRegistrations: pendingUsersResult.rows,
      lastBackupAt: latestBackupResult.rows[0]?.created_at || null,
      lastBackupBy: latestBackupResult.rows[0]?.actor_name || null,
      lastRestoreAt: latestRestoreResult.rows[0]?.created_at || null,
      lastRestoreBy: latestRestoreResult.rows[0]?.actor_name || null,
      dailySalesTarget: branchSettingsResult.rows[0]?.daily_sales_target ?? null,
      dailySalesTargetUpdatedBy: branchSettingsResult.rows[0]?.updated_by_name || null,
      dailySalesTargetUpdatedAt: branchSettingsResult.rows[0]?.updated_at || null,
      recentSystemEvents: recentSystemEventsResult.rows,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    console.error('System summary error:', err);
    return res.status(500).json({ error: 'Failed to load system summary' });
  }
});

app.put('/api/system/daily-sales-target', authenticate, requireAdmin, async (req, res) => {
  try {
    const targetAmount = parseOptionalPositiveDecimal(req.body?.daily_sales_target, 'Daily sales target', { max: 100000000 });

    const result = await pool.query(
      `INSERT INTO branch_settings (branch, daily_sales_target, updated_by, updated_by_name, updated_at)
       VALUES ($1, $2, $3, $4, ${PHILIPPINE_NOW_SQL})
       ON CONFLICT (branch)
       DO UPDATE SET
         daily_sales_target = EXCLUDED.daily_sales_target,
         updated_by = EXCLUDED.updated_by,
         updated_by_name = EXCLUDED.updated_by_name,
         updated_at = ${PHILIPPINE_NOW_SQL}
       RETURNING branch, daily_sales_target, updated_by_name, updated_at`,
      [req.user.branch, targetAmount, req.user.id, req.user.fullName || req.user.username || 'System User']
    );

    await recordAuditLogSafely(pool, {
      actorId: req.user.id,
      targetName: req.user.branch,
      targetType: 'branch_settings',
      action: 'UPDATE_DAILY_SALES_TARGET',
      details: {
        branch: req.user.branch,
        dailySalesTarget: targetAmount
      }
    });

    return res.json({
      dailySalesTarget: result.rows[0]?.daily_sales_target ?? null,
      dailySalesTargetUpdatedBy: result.rows[0]?.updated_by_name || null,
      dailySalesTargetUpdatedAt: result.rows[0]?.updated_at || null
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Update daily sales target error:', err);
    return res.status(500).json({ error: 'Failed to update daily sales target' });
  }
});

app.get('/api/inventory', authenticate, async (req, res) => {
  try {
    if (!req.user.branch) {
      return res.status(400).json({ error: 'Branch is required to load inventory' });
    }

    const result = await pool.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         p.category_note,
         p.supplier_name,
         p.default_selling_price,
         p.cost_price,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
         bi.average_daily_sales_mode,
         bi.manual_average_daily_sales,
         bi.average_daily_sales_override_reason,
         bi.status,
         bi.branch,
         bi.last_updated
       FROM branch_inventory bi
       INNER JOIN products p ON p.product_id = bi.product_id
       WHERE bi.branch = $1
         AND NOT EXISTS (
           SELECT 1
           FROM archived_inventory ai
           WHERE ai.product_id = bi.product_id
             AND ai.branch = bi.branch
         )
       ORDER BY p.name ASC`,
      [req.user.branch]
    );
    return res.json({ products: result.rows.map(row => mapInventoryRow(row, { includeCostPrice: isAdmin(req.user) })) });
  } catch (err) {
    console.error('Fetch products error:', err);
    return res.status(500).json({ error: 'Failed to load products' });
  }
});

app.get('/api/archive', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         archived_inventory_id,
         original_inventory_id,
         product_id,
         name,
         category,
         category_note,
         supplier_name,
         default_selling_price,
         cost_price,
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
         last_updated,
         archive_reason,
         archive_reason_note,
         archived_at
       FROM archived_inventory
       WHERE branch = $1
       ORDER BY archived_at DESC, archived_inventory_id DESC`,
      [req.user.branch]
    );

    return res.json({ archivedProducts: result.rows.map(row => mapArchivedInventoryRow(row, { includeCostPrice: isAdmin(req.user) })) });
  } catch (err) {
    console.error('Get archive error:', err);
    return res.status(500).json({ error: 'Failed to load archive' });
  }
});

app.get('/api/stock-movements', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         movement_id,
         inventory_id,
         product_id,
         item_name,
         category,
         branch,
         action,
         quantity_changed,
         previous_quantity,
         new_quantity,
         reason,
         note,
         actor_id,
         actor_name,
         created_at,
         encoded_at,
         backdate_reason
       FROM stock_movements
       WHERE branch = $1
       ORDER BY created_at DESC, movement_id DESC`,
      [req.user.branch]
    );

    return res.json({ movements: result.rows.map(mapStockMovementRow) });
  } catch (err) {
    console.error('Get stock movements error:', err);
    return res.status(500).json({ error: 'Failed to load stock movements' });
  }
});

app.get('/api/sales', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         st.sales_transaction_id,
         st.sales_number,
         st.official_invoice_number,
         st.official_invoice_expected_number,
         st.official_invoice_exception_reason,
         reference_st.sales_number AS reference_sales_number,
         reference_st.official_invoice_number AS reference_official_invoice_number,
         st.branch,
         st.customer_type,
         st.customer_name,
         st.customer_tin,
         st.customer_address,
         st.total_quantity,
         st.subtotal_amount,
         st.discount_amount,
         st.discount_type,
         st.discount_label,
         st.delivery_charge,
         st.vatable_sales,
         st.vat_amount,
         st.total_amount,
         st.payment_method,
         st.amount_received,
         st.change_amount,
         st.payment_reference,
         st.payment_confirmed,
         st.payment_confirmed_by,
         st.payment_confirmed_by_name,
         st.payment_confirmed_at,
         st.status,
         st.transaction_type,
         st.reference_sales_transaction_id,
         st.sold_by,
         st.sold_by_name,
         st.remarks,
         st.created_at,
         st.encoded_at,
         st.backdate_reason,
         st.cancelled_at,
         st.cancelled_by,
         st.cancel_reason,
         COALESCE(
           json_agg(
             json_build_object(
               'sales_item_id', si.sales_item_id,
               'item_type', si.item_type,
               'inventory_id', si.inventory_id,
               'product_id', si.product_id,
               'is_inventory_item', si.is_inventory_item,
               'item_name', si.item_name,
               'category', si.category,
               'category_note', si.category_note,
               'branch', si.branch,
               'quantity_sold', si.quantity_sold,
               'unit_price', si.unit_price,
               'unit_cost_at_sale', si.unit_cost_at_sale,
               'subtotal', si.subtotal,
               'cost_subtotal', si.cost_subtotal,
               'gross_profit', si.gross_profit,
               'profit_margin_percent', si.profit_margin_percent,
               'previous_quantity', si.previous_quantity,
               'new_quantity', si.new_quantity,
               'refund_for_sales_item_id', si.refund_for_sales_item_id,
               'refunded_quantity', COALESCE((
                 SELECT SUM(ABS(refund_si.quantity_sold))
                 FROM sales_items refund_si
                 INNER JOIN sales_transactions refund_st
                   ON refund_st.sales_transaction_id = refund_si.sales_transaction_id
                 WHERE refund_st.reference_sales_transaction_id = st.sales_transaction_id
                   AND refund_st.transaction_type = 'refund'
                   AND refund_st.status = 'completed'
                   AND refund_si.refund_for_sales_item_id = si.sales_item_id
               ), 0),
               'refunded_amount', COALESCE((
                 SELECT SUM(ABS(refund_si.subtotal))
                 FROM sales_items refund_si
                 INNER JOIN sales_transactions refund_st
                   ON refund_st.sales_transaction_id = refund_si.sales_transaction_id
                 WHERE refund_st.reference_sales_transaction_id = st.sales_transaction_id
                   AND refund_st.transaction_type = 'refund'
                   AND refund_st.status = 'completed'
                   AND refund_si.refund_for_sales_item_id = si.sales_item_id
               ), 0),
               'created_at', si.created_at
             )
             ORDER BY si.sales_item_id ASC
           ) FILTER (WHERE si.sales_item_id IS NOT NULL),
           '[]'::json
         ) AS items
       FROM sales_transactions st
       LEFT JOIN sales_transactions reference_st
         ON reference_st.sales_transaction_id = st.reference_sales_transaction_id
       LEFT JOIN sales_items si
         ON si.sales_transaction_id = st.sales_transaction_id
       WHERE st.branch = $1
       GROUP BY st.sales_transaction_id, reference_st.sales_number, reference_st.official_invoice_number
       ORDER BY st.created_at DESC, st.sales_transaction_id DESC`,
      [req.user.branch]
    );

    return res.json({ sales: result.rows.map(mapSalesTransactionRow) });
  } catch (err) {
    console.error('Get sales error:', err);
    return res.status(500).json({ error: 'Failed to load sales records' });
  }
});

app.get('/api/sales/next-invoice-number', authenticate, async (req, res) => {
  if (!canRecordSales(req.user)) {
    return res.status(403).json({
      error: 'Invoice number preview is available only to Admin / Manager and Cashier / Encoder accounts.'
    });
  }

  const client = await pool.connect();
  try {
    const invoiceNumber = await peekNextOfficialSalesInvoiceNumber(client, req.user.branch);
    return res.json({
      invoice_number: invoiceNumber,
      format: 'six_digit_numeric',
      branch: getSalesInvoiceSequenceBranch(req.user.branch),
      editable: true
    });
  } catch (err) {
    console.error('Preview sales invoice number error:', err);
    return res.status(500).json({ error: 'Failed to preview the next invoice number.' });
  } finally {
    client.release();
  }
});

app.post('/api/sales', authenticate, async (req, res) => {
  const {
    official_invoice_number = '',
    invoice_sequence_exception_reason = '',
    customer_type = 'walk_in',
    customer_name = '',
    customer_tin = '',
    customer_address = '',
    items = [],
    remarks = '',
    payment_method = 'cash',
    discount_type = 'none',
    discount_amount = 0,
    delivery_charge = 0,
    amount_received = null,
    payment_reference = '',
    payment_confirmed = false
  } = req.body;
  const normalizedCustomerType = String(customer_type || 'walk_in').trim().toLowerCase();
  const cleanCustomerName = String(customer_name || '').trim().replace(/\s+/g, ' ') || 'C';
  const cleanCustomerTin = String(customer_tin || '').trim().replace(/\s+/g, ' ') || null;
  const cleanCustomerAddress = String(customer_address || '').trim().replace(/\s+/g, ' ') || 'C';
  const allowedCustomerTypes = new Set(['walk_in', 'sister_company', 'hardware_reseller', 'regular', 'contractor']);
  const normalizedPaymentMethod = String(payment_method || 'cash').trim().toLowerCase();
  const allowedPaymentMethods = new Set(['cash', 'gcash', 'bank_transfer', 'credit']);
  const requiresPaymentConfirmation = ['gcash', 'bank_transfer'].includes(normalizedPaymentMethod);
  const cleanPaymentReference = String(payment_reference || '').trim().slice(0, 120) || null;
  const isPaymentConfirmed = payment_confirmed === true || payment_confirmed === 'true';
  const cleanOfficialInvoiceNumber = normalizeOfficialSalesInvoiceNumber(official_invoice_number);
  const cleanInvoiceSequenceReason = cleanInvoiceSequenceExceptionReason(invoice_sequence_exception_reason);
  let transactionTiming;
  try {
    transactionTiming = getTransactionTiming(req.body);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  if (!canRecordSales(req.user)) {
    return res.status(403).json({
      error: 'Sales recording is available only to Admin / Manager and Cashier / Encoder accounts.'
    });
  }

  if (!allowedCustomerTypes.has(normalizedCustomerType)) {
    return res.status(400).json({ error: 'Please select a valid customer type.' });
  }

  if (String(official_invoice_number || '').trim() && cleanOfficialInvoiceNumber !== String(official_invoice_number || '').trim()) {
    return res.status(400).json({ error: 'Sales Invoice Number must contain numbers only.' });
  }

  if (cleanOfficialInvoiceNumber && !new RegExp(SALES_INVOICE_NUMBER_PATTERN).test(cleanOfficialInvoiceNumber)) {
    return res.status(400).json({
      error: `Sales Invoice Number must be exactly ${SALES_INVOICE_SEQUENCE_DIGITS} digits.`
    });
  }

  if (!cleanOfficialInvoiceNumber) {
    return res.status(400).json({
      error: 'Enter the 6-digit Sales Invoice Number from the booklet before recording the sale.'
    });
  }

  const enteredOfficialInvoiceSequence = Number.parseInt(cleanOfficialInvoiceNumber, 10);
  if (
    !Number.isInteger(enteredOfficialInvoiceSequence) ||
    enteredOfficialInvoiceSequence < SALES_INVOICE_START_NUMBER ||
    enteredOfficialInvoiceSequence > SALES_INVOICE_MAX_NUMBER
  ) {
    return res.status(400).json({
      error: `Sales Invoice Number must be from ${formatOfficialSalesInvoiceNumber(SALES_INVOICE_START_NUMBER)} to ${formatOfficialSalesInvoiceNumber(SALES_INVOICE_MAX_NUMBER)}.`
    });
  }

  if (cleanCustomerName.length > 160) {
    return res.status(400).json({ error: 'Registered name must be 160 characters or fewer.' });
  }

  if (cleanCustomerTin && cleanCustomerTin.length > 80) {
    return res.status(400).json({ error: 'TIN must be 80 characters or fewer.' });
  }

  if (cleanCustomerTin && !/^[0-9-]+$/.test(cleanCustomerTin)) {
    return res.status(400).json({ error: 'TIN must contain numbers and dashes only.' });
  }

  if (cleanCustomerAddress.length > 240) {
    return res.status(400).json({ error: 'Business address must be 240 characters or fewer.' });
  }

  if (!allowedPaymentMethods.has(normalizedPaymentMethod)) {
    return res.status(400).json({ error: 'Please select a valid payment method.' });
  }

  if (requiresPaymentConfirmation && !isPaymentConfirmed) {
    return res.status(400).json({
      error: 'Please confirm that the GCash or bank transfer payment was received before completing the sale.'
    });
  }

  if (cleanPaymentReference && !/^[A-Za-z0-9 ._#/-]+$/.test(cleanPaymentReference)) {
    return res.status(400).json({
      error: 'Payment reference may only contain letters, numbers, spaces, dash, slash, period, underscore, or #.'
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one sold item before recording the sale.' });
  }

  const aggregatedItems = new Map();
  const manualItems = [];
  try {
    for (const item of items) {
      const isManualItem =
        item?.item_type === 'non_inventory' ||
        item?.is_manual === true ||
        item?.is_inventory_item === false ||
        !item?.inventory_id;
      const quantity = parseNonNegativeInteger(item?.quantity, 'Quantity sold');
      const unitPrice = parseNonNegativeDecimal(item?.unit_price, 'Unit price', { max: 100000000 });

      if (quantity <= 0) {
        return res.status(400).json({ error: 'Each sold item must include a valid quantity.' });
      }

      if (unitPrice <= 0) {
        return res.status(400).json({ error: 'Unit price is required and must be greater than zero for every sold item.' });
      }

      if (isManualItem) {
        const itemName = String(item?.item_name || '').trim().replace(/\s+/g, ' ');
        const category = canonicalizeInventoryCategory(item?.category || 'Other') || 'Other';
        const categoryNote = cleanCategoryNote(item?.category_note, category);
        if (!itemName || itemName.length > 150) {
          return res.status(400).json({ error: 'Manual sale items must include an item description of 150 characters or less.' });
        }
        manualItems.push({
          itemName,
          category,
          categoryNote,
          quantity,
          unitPrice,
          subtotal: Number((quantity * unitPrice).toFixed(2))
        });
        continue;
      }

      const inventoryId = Number(item?.inventory_id);

      if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
        return res.status(400).json({ error: 'Each inventory sale item must include a valid product.' });
      }

      if (aggregatedItems.has(inventoryId)) {
        return res.status(400).json({ error: 'Each sold item should appear only once in a sales transaction.' });
      }

      const existing = aggregatedItems.get(inventoryId) || { quantity: 0, unitPrice };
      aggregatedItems.set(inventoryId, {
        quantity: existing.quantity + quantity,
        unitPrice
      });
    }
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Invalid sale details.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const salesNumber = await generateSalesNumber(client);
    const officialInvoiceNumber = cleanOfficialInvoiceNumber;
    const duplicateInvoiceResult = await client.query(
      `SELECT sales_transaction_id
       FROM sales_transactions
       WHERE official_invoice_number = $1
         AND branch = $2
       LIMIT 1`,
      [officialInvoiceNumber, req.user.branch]
    );
    if (duplicateInvoiceResult.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Sales Invoice Number ${officialInvoiceNumber} has already been used.` });
    }

    const sequenceState = await lockOfficialSalesInvoiceSequence(client, req.user.branch);
    const expectedOfficialInvoiceNumber = sequenceState.nextInvoiceNumber;
    const enteredInvoiceSequence = enteredOfficialInvoiceSequence;
    const isBehindCurrentSequence = enteredInvoiceSequence < sequenceState.nextNumber;
    const isSkippingAhead = enteredInvoiceSequence > sequenceState.nextNumber;
    const skippedInvoiceCount = isSkippingAhead ? enteredInvoiceSequence - sequenceState.nextNumber : 0;
    const skippedInvoiceFrom = isSkippingAhead ? expectedOfficialInvoiceNumber : null;
    const skippedInvoiceTo = isSkippingAhead
      ? formatOfficialSalesInvoiceNumber(enteredInvoiceSequence - 1)
      : null;

    if (isBehindCurrentSequence) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Sales Invoice Number ${officialInvoiceNumber} is behind the current sequence. The next expected Sales Invoice Number is ${expectedOfficialInvoiceNumber}.`
      });
    }

    if (isSkippingAhead && (!cleanInvoiceSequenceReason || cleanInvoiceSequenceReason.length < 5)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Sales Invoice Number ${officialInvoiceNumber} skips ${expectedOfficialInvoiceNumber}. Enter the booklet reason before saving.`
      });
    }

    await advanceOfficialSalesInvoiceSequence(client, sequenceState.invoiceYear, sequenceState.branch, officialInvoiceNumber);
    const soldByName = req.user.fullName || req.user.username || 'System User';
    const cleanRemarks = String(remarks || '').trim().slice(0, 500) || null;
    let totalQuantity = 0;
    let subtotalAmount = 0;
    const saleLines = [];
    const updatedItems = [];
    const salePriceOverrides = [];

    for (const [inventoryId, line] of aggregatedItems.entries()) {
      const currentResult = await client.query(
        `SELECT
           bi.inventory_id,
           bi.product_id,
           p.name,
           p.category,
           p.category_note,
           p.supplier_name,
           p.default_selling_price,
           p.cost_price,
           bi.branch,
           bi.stock_level,
           bi.min_stock_level,
           bi.lead_time_days,
           bi.safety_stock,
           bi.average_daily_sales,
           bi.status,
           bi.last_updated
         FROM branch_inventory bi
         INNER JOIN products p ON p.product_id = bi.product_id
         WHERE bi.inventory_id = $1 AND bi.branch = $2
         FOR UPDATE`,
        [inventoryId, req.user.branch]
      );

      if (currentResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `One selected item was not found in your branch inventory.` });
      }

      const currentItem = currentResult.rows[0];
      const previousQuantity = Number(currentItem.stock_level || 0);
      const quantitySold = Number(line.quantity || 0);

      if (quantitySold > previousQuantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `${currentItem.name} has only ${previousQuantity} unit${previousQuantity === 1 ? '' : 's'} available.`
        });
      }

      const unitPrice = Number(line.unitPrice || 0);
      const subtotal = Number((quantitySold * unitPrice).toFixed(2));
      const lineProfit = calculateSalesLineProfit({
        quantitySold,
        unitCostAtSale: currentItem.cost_price,
        subtotal
      });
      const defaultSellingPrice = Number(currentItem.default_selling_price || 0);
      const hasTransactionPriceOverride = defaultSellingPrice > 0 && Math.abs(defaultSellingPrice - unitPrice) > 0.009;
      if (hasTransactionPriceOverride) {
        salePriceOverrides.push({
          inventoryId,
          productId: currentItem.product_id,
          itemName: currentItem.name,
          inventorySrp: defaultSellingPrice,
          soldUnitPrice: unitPrice,
          difference: Number((unitPrice - defaultSellingPrice).toFixed(2)),
          inventorySrpUpdated: false,
          scope: 'sale_transaction_only'
        });
      }
      const newQuantity = previousQuantity - quantitySold;
      const nextStatus = computeInventoryStatus(newQuantity, getEffectiveReorderThreshold(currentItem));

      totalQuantity += quantitySold;
      subtotalAmount += subtotal;

      const updatedResult = await client.query(
        `UPDATE branch_inventory
         SET stock_level = $1,
             status = $2,
             last_updated = ${PHILIPPINE_NOW_SQL}
         WHERE inventory_id = $3 AND branch = $4
         RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated`,
        [newQuantity, nextStatus, inventoryId, req.user.branch]
      );

      saleLines.push({
        inventoryId,
        productId: currentItem.product_id,
        isInventoryItem: true,
        itemName: currentItem.name,
        category: currentItem.category,
        categoryNote: currentItem.category_note || null,
        branch: currentItem.branch,
        quantitySold,
        unitPrice,
        subtotal,
        unitCostAtSale: lineProfit.unitCostAtSale,
        costSubtotal: lineProfit.costSubtotal,
        grossProfit: lineProfit.grossProfit,
        profitMarginPercent: lineProfit.profitMarginPercent,
        previousQuantity,
        newQuantity
      });

      updatedItems.push({
        ...updatedResult.rows[0],
        name: currentItem.name,
        category: currentItem.category,
        category_note: currentItem.category_note,
        supplier_name: currentItem.supplier_name,
        default_selling_price: currentItem.default_selling_price,
        cost_price: currentItem.cost_price,
        lead_time_days: currentItem.lead_time_days,
        safety_stock: currentItem.safety_stock,
        average_daily_sales: currentItem.average_daily_sales
      });
    }

    manualItems.forEach(line => {
      totalQuantity += line.quantity;
      subtotalAmount += line.subtotal;
      saleLines.push({
        inventoryId: null,
        productId: null,
        isInventoryItem: false,
        itemName: line.itemName,
        category: line.category,
        categoryNote: line.categoryNote || null,
        branch: req.user.branch,
        quantitySold: line.quantity,
        unitPrice: line.unitPrice,
        subtotal: line.subtotal,
        unitCostAtSale: line.unitPrice,
        costSubtotal: line.subtotal,
        grossProfit: 0,
        profitMarginPercent: 0,
        previousQuantity: null,
        newQuantity: null
      });
    });

    const roundedSubtotalAmount = Number(subtotalAmount.toFixed(2));
    const inferredDiscountType = String(discount_type || '').trim()
      ? discount_type
      : Number(discount_amount || 0) > 0 ? 'custom_amount' : 'none';
    const parsedCustomDiscountAmount = parseNonNegativeDecimal(discount_amount, 'Discount amount', { max: 100000000 });
    const discountDetails = getDiscountDetails(inferredDiscountType, roundedSubtotalAmount, parsedCustomDiscountAmount);

    if (!discountDetails) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Please select a valid discount option.' });
    }

    const roundedDiscountAmount = Number(discountDetails.amount.toFixed(2));
    const roundedDeliveryCharge = parseNonNegativeDecimal(delivery_charge, 'Delivery charge', { max: 100000000 });

    if (discountDetails.type === 'custom_amount' && roundedDiscountAmount <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Manual discount must be greater than zero, or choose No Discount.' });
    }

    if (roundedDiscountAmount > roundedSubtotalAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Discount cannot be greater than the sales subtotal.' });
    }

    const taxableSalesAmount = Math.max(Number((roundedSubtotalAmount - roundedDiscountAmount).toFixed(2)), 0);
    const netTotalAmount = Number((taxableSalesAmount + roundedDeliveryCharge).toFixed(2));
    const { vatableSales, vatAmount } = computeVatBreakdown(taxableSalesAmount);
    const parsedAmountReceived = amount_received === null || amount_received === undefined || amount_received === ''
      ? null
      : parseNonNegativeDecimal(amount_received, 'Amount received', { max: 100000000 });
    const effectiveAmountReceived = normalizedPaymentMethod === 'cash'
      ? Number((parsedAmountReceived || 0).toFixed(2))
      : netTotalAmount;

    if (normalizedPaymentMethod === 'cash' && effectiveAmountReceived < netTotalAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Amount received must be equal to or greater than the total amount due.' });
    }

    const changeAmount = normalizedPaymentMethod === 'cash'
      ? Number((effectiveAmountReceived - netTotalAmount).toFixed(2))
      : 0;

    const transactionResult = await client.query(
      `INSERT INTO sales_transactions (
         sales_number,
         branch,
         customer_type,
         customer_name,
         customer_tin,
         customer_address,
         total_quantity,
         subtotal_amount,
         discount_amount,
         discount_type,
         discount_label,
         delivery_charge,
         vatable_sales,
         vat_amount,
         total_amount,
         payment_method,
         amount_received,
         change_amount,
         payment_reference,
         payment_confirmed,
         payment_confirmed_by,
         payment_confirmed_by_name,
         payment_confirmed_at,
         status,
         sold_by,
         sold_by_name,
         remarks,
         created_at,
         encoded_at,
         backdate_reason,
         official_invoice_number,
         official_invoice_expected_number,
         official_invoice_exception_reason
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, true, $20, $21, ${PHILIPPINE_NOW_SQL}, 'completed', $22, $23, $24, COALESCE($25::timestamp, ${PHILIPPINE_NOW_SQL}), ${PHILIPPINE_NOW_SQL}, $26, $27, $28, $29)
       RETURNING *`,
      [
        salesNumber,
        req.user.branch,
        normalizedCustomerType,
        cleanCustomerName,
        cleanCustomerTin,
        cleanCustomerAddress,
        totalQuantity,
        roundedSubtotalAmount,
        roundedDiscountAmount,
        discountDetails.type,
        discountDetails.label,
        roundedDeliveryCharge,
        vatableSales,
        vatAmount,
        netTotalAmount,
        normalizedPaymentMethod,
        effectiveAmountReceived,
        changeAmount,
        cleanPaymentReference,
        req.user.id,
        soldByName,
        req.user.id,
        soldByName,
        cleanRemarks,
        transactionTiming.actualTransactionAt,
        transactionTiming.backdateReason,
        officialInvoiceNumber,
        expectedOfficialInvoiceNumber,
        isSkippingAhead ? cleanInvoiceSequenceReason : null
      ]
    );

    const salesTransaction = transactionResult.rows[0];
    const insertedItems = [];

    for (const line of saleLines) {
      const itemResult = await client.query(
        `INSERT INTO sales_items (
           sales_transaction_id,
           item_type,
           inventory_id,
           product_id,
           is_inventory_item,
           item_name,
           category,
           category_note,
           branch,
           quantity_sold,
           unit_price,
           unit_cost_at_sale,
           subtotal,
           cost_subtotal,
           gross_profit,
           profit_margin_percent,
           previous_quantity,
           new_quantity,
           created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, COALESCE($19::timestamp, ${PHILIPPINE_NOW_SQL}))
         RETURNING *`,
        [
          salesTransaction.sales_transaction_id,
          line.isInventoryItem ? 'inventory' : 'non_inventory',
          line.inventoryId,
          line.productId,
          line.isInventoryItem,
          line.itemName,
          line.category,
          line.categoryNote || null,
          line.branch,
          line.quantitySold,
          line.unitPrice,
          line.unitCostAtSale,
          line.subtotal,
          line.costSubtotal,
          line.grossProfit,
          line.profitMarginPercent,
          line.previousQuantity,
          line.newQuantity,
          transactionTiming.actualTransactionAt
        ]
      );

      insertedItems.push(itemResult.rows[0]);

      if (!line.isInventoryItem) {
        continue;
      }

      await recordStockMovement(client, {
        inventoryId: line.inventoryId,
        productId: line.productId,
        itemName: line.itemName,
        category: line.category,
        branch: line.branch,
        action: 'stock_out',
        quantityChanged: line.quantitySold,
        previousQuantity: line.previousQuantity,
        newQuantity: line.newQuantity,
        reason: 'sales',
        note: `Sale recorded through Sales module. Invoice ${officialInvoiceNumber}; system ref ${salesNumber}.`,
        actorId: req.user.id,
        actualTransactionAt: transactionTiming.actualTransactionAt,
        backdateReason: transactionTiming.backdateReason
      });

      await refreshAverageDailySalesForInventory(client, line.inventoryId);
    }

    await recordAuditLog(client, {
      actorId: req.user.id,
      targetId: salesTransaction.sales_transaction_id,
      targetName: officialInvoiceNumber,
      targetType: 'sales_transaction',
      action: 'CREATE_SALES_INVOICE',
      reason: 'Sales Recording',
      details: {
        branch: req.user.branch,
        officialInvoiceNumber,
        salesNumber,
        expectedOfficialInvoiceNumber,
        invoiceSequenceException: isSkippingAhead ? {
          type: 'skipped_forward',
          skippedFrom: skippedInvoiceFrom,
          skippedTo: skippedInvoiceTo,
          skippedCount: skippedInvoiceCount,
          reason: cleanInvoiceSequenceReason
        } : null,
        customerType: normalizedCustomerType,
        customerName: cleanCustomerName,
        customerTinProvided: Boolean(cleanCustomerTin),
        customerAddress: cleanCustomerAddress,
        totalQuantity,
        subtotalAmount: roundedSubtotalAmount,
        discountAmount: roundedDiscountAmount,
        discountType: discountDetails.type,
        discountLabel: discountDetails.label,
        deliveryCharge: roundedDeliveryCharge,
        vatableSales,
        vatAmount,
        totalAmount: netTotalAmount,
        paymentMethod: normalizedPaymentMethod,
        amountReceived: effectiveAmountReceived,
        changeAmount,
        paymentReference: cleanPaymentReference,
        paymentConfirmed: true,
        paymentConfirmedBy: soldByName,
        itemCount: insertedItems.length,
        salePriceOverrides,
        remarks: cleanRemarks,
        actualTransactionAt: salesTransaction.created_at,
        encodedAt: salesTransaction.encoded_at,
        backdateReason: transactionTiming.backdateReason
      }
    });

    await client.query('COMMIT');

    return res.status(201).json({
      sale: mapSalesTransactionRow({
        ...salesTransaction,
        items: insertedItems.map(mapSalesItemRow)
      }),
      products: updatedItems.map(mapInventoryRow)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (err.code === '23505' && String(err.constraint || '').includes('official_invoice_number')) {
      return res.status(409).json({ error: 'That Sales Invoice Number has already been used. Please check the invoice booklet number and try again.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'One sale detail no longer matches an active system record. Refresh the page, reselect the item, and try again.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'One sale detail did not pass a system rule. Review the SI number, item quantity, payment, and selected item, then try again.' });
    }
    console.error('Record sale error:', err);
    return res.status(500).json({
      error: 'The sale could not be saved because the database rejected part of the transaction. No inventory was deducted. Please refresh and try again, then check the server console if it repeats.'
    });
  } finally {
    client.release();
  }
});

app.post('/api/sales/:id/refund', authenticate, async (req, res) => {
  const salesTransactionId = Number(req.params.id);
  const cleanReason = String(req.body?.refund_reason || req.body?.reason || '').trim().slice(0, 500);
  const refundItems = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!canRecordSales(req.user)) {
    return res.status(403).json({
      error: 'Refund recording is available only to Admin / Manager and Cashier / Encoder accounts.'
    });
  }

  if (!Number.isInteger(salesTransactionId) || salesTransactionId <= 0) {
    return res.status(400).json({ error: 'Please select a valid sales record to refund.' });
  }

  if (cleanReason.length < 5) {
    return res.status(400).json({ error: 'Please enter a clear refund reason.' });
  }

  if (refundItems.length === 0) {
    return res.status(400).json({ error: 'Select at least one item to refund.' });
  }

  let transactionTiming;
  try {
    transactionTiming = getTransactionTiming(req.body);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const saleResult = await client.query(
      `SELECT *
       FROM sales_transactions
       WHERE sales_transaction_id = $1
         AND branch = $2
       FOR UPDATE`,
      [salesTransactionId, req.user.branch]
    );

    if (saleResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sales record was not found for this branch.' });
    }

    const originalSale = saleResult.rows[0];
    const originalInvoiceNumber = resolveOfficialSalesInvoiceNumber(
      originalSale.official_invoice_number,
      originalSale.sales_number
    ) || originalSale.sales_number;
    if (originalSale.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cancelled sales cannot be refunded.' });
    }

    if ((originalSale.transaction_type || 'sale') === 'refund') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Refund records cannot be refunded again.' });
    }

    const originalItemsResult = await client.query(
      `SELECT *
       FROM sales_items
       WHERE sales_transaction_id = $1
       ORDER BY sales_item_id ASC`,
      [salesTransactionId]
    );

    if (originalItemsResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This sales record has no item lines to refund.' });
    }

    const refundedResult = await client.query(
      `SELECT
         si.refund_for_sales_item_id,
         COALESCE(SUM(ABS(si.quantity_sold)), 0) AS refunded_quantity,
         COALESCE(SUM(ABS(si.subtotal)), 0) AS refunded_amount
       FROM sales_items si
       INNER JOIN sales_transactions st
         ON st.sales_transaction_id = si.sales_transaction_id
       WHERE st.reference_sales_transaction_id = $1
         AND st.transaction_type = 'refund'
         AND st.status = 'completed'
         AND si.refund_for_sales_item_id IS NOT NULL
       GROUP BY si.refund_for_sales_item_id`,
      [salesTransactionId]
    );

    const originalItemsById = new Map(originalItemsResult.rows.map(item => [Number(item.sales_item_id), item]));
    const refundedByItemId = new Map(refundedResult.rows.map(row => [
      Number(row.refund_for_sales_item_id),
      {
        quantity: Number(row.refunded_quantity || 0),
        amount: Number(row.refunded_amount || 0)
      }
    ]));
    const seenItemIds = new Set();
    const preparedRefundLines = [];

    for (const item of refundItems) {
      const salesItemId = Number(item?.sales_item_id || item?.salesItemId);
      if (!Number.isInteger(salesItemId) || salesItemId <= 0 || !originalItemsById.has(salesItemId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'One selected refund item is not part of this sale.' });
      }

      if (seenItemIds.has(salesItemId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Each refund item should appear only once.' });
      }
      seenItemIds.add(salesItemId);

      const originalItem = originalItemsById.get(salesItemId);
      const originalQuantity = Number(originalItem.quantity_sold || 0);
      const originalSubtotal = Number(originalItem.subtotal || 0);
      const alreadyRefunded = refundedByItemId.get(salesItemId) || { quantity: 0, amount: 0 };
      const remainingQuantity = originalQuantity - alreadyRefunded.quantity;
      const remainingAmount = Number((originalSubtotal - alreadyRefunded.amount).toFixed(2));
      const refundQuantity = parseNonNegativeInteger(item?.quantity, 'Refund quantity');
      const refundAmount = item?.refund_amount === undefined || item?.refund_amount === null || item?.refund_amount === ''
        ? Number((refundQuantity * Number(originalItem.unit_price || 0)).toFixed(2))
        : parseNonNegativeDecimal(item?.refund_amount, 'Refund amount', { max: 100000000 });

      if (refundQuantity <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Refund quantity must be greater than zero.' });
      }

      if (refundQuantity > remainingQuantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `${originalItem.item_name} has only ${remainingQuantity} refundable unit${remainingQuantity === 1 ? '' : 's'} remaining.`
        });
      }

      if (refundAmount <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Refund amount must be greater than zero.' });
      }

      if (refundAmount > remainingAmount + 0.009) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Refund amount for ${originalItem.item_name} cannot exceed ${formatCurrencyForLog(remainingAmount)}.`
        });
      }

      preparedRefundLines.push({
        originalItem,
        salesItemId,
        refundQuantity,
        refundAmount
      });
    }

    let totalRefundQuantity = 0;
    let totalRefundAmount = 0;
    const insertedItems = [];
    const restoredItems = [];
    const stockRestoreDetails = [];

    for (const line of preparedRefundLines) {
      const { originalItem, refundQuantity, refundAmount, salesItemId } = line;
      totalRefundQuantity += refundQuantity;
      totalRefundAmount += refundAmount;

      let previousQuantity = null;
      let newQuantity = null;

      if (originalItem.is_inventory_item !== false && originalItem.inventory_id) {
        const inventoryResult = await client.query(
          `SELECT
             bi.inventory_id,
             bi.product_id,
             p.name,
             p.category,
             p.category_note,
             p.supplier_name,
             p.default_selling_price,
             bi.branch,
             bi.stock_level,
             bi.min_stock_level,
             bi.lead_time_days,
             bi.safety_stock,
             bi.average_daily_sales,
             bi.status,
             bi.last_updated
           FROM branch_inventory bi
           INNER JOIN products p ON p.product_id = bi.product_id
           WHERE bi.inventory_id = $1
             AND bi.branch = $2
           FOR UPDATE`,
          [originalItem.inventory_id, req.user.branch]
        );

        if (inventoryResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: `${originalItem.item_name} is no longer available in active inventory. Refund cannot restore stock safely.` });
        }

        const currentItem = inventoryResult.rows[0];
        previousQuantity = Number(currentItem.stock_level || 0);
        newQuantity = previousQuantity + refundQuantity;
        const nextStatus = computeInventoryStatus(newQuantity, getEffectiveReorderThreshold(currentItem));

        const updatedResult = await client.query(
          `UPDATE branch_inventory
           SET stock_level = $1,
               status = $2,
               last_updated = ${PHILIPPINE_NOW_SQL}
           WHERE inventory_id = $3
             AND branch = $4
           RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated`,
          [newQuantity, nextStatus, originalItem.inventory_id, req.user.branch]
        );

        await recordStockMovement(client, {
          inventoryId: originalItem.inventory_id,
          productId: originalItem.product_id,
          itemName: originalItem.item_name,
          category: originalItem.category,
          branch: originalItem.branch,
          action: 'stock_in',
          quantityChanged: refundQuantity,
          previousQuantity,
          newQuantity,
          reason: 'customer_refund',
          note: `Customer refund for Invoice ${originalInvoiceNumber}. System ref ${originalSale.sales_number}. Reason: ${cleanReason}`,
          actorId: req.user.id,
          actualTransactionAt: transactionTiming.actualTransactionAt,
          backdateReason: transactionTiming.backdateReason
        });

        await refreshAverageDailySalesForInventory(client, originalItem.inventory_id);

        restoredItems.push({
          ...updatedResult.rows[0],
          name: currentItem.name,
          category: currentItem.category,
          supplier_name: currentItem.supplier_name,
          default_selling_price: currentItem.default_selling_price,
          lead_time_days: currentItem.lead_time_days,
          safety_stock: currentItem.safety_stock,
          average_daily_sales: currentItem.average_daily_sales
        });

        stockRestoreDetails.push({
          inventoryId: originalItem.inventory_id,
          itemName: originalItem.item_name,
          quantity: refundQuantity,
          previousQuantity,
          newQuantity
        });
      }

      line.previousQuantity = previousQuantity;
      line.newQuantity = newQuantity;
      line.refundSubtotal = Number((-refundAmount).toFixed(2));
      line.refundProfit = calculateSalesLineProfit({
        quantitySold: -refundQuantity,
        unitCostAtSale: originalItem.unit_cost_at_sale,
        subtotal: line.refundSubtotal
      });
    }

    const roundedRefundTotal = Number(totalRefundAmount.toFixed(2));
    const negativeRefundTotal = Number((-roundedRefundTotal).toFixed(2));
    const { vatableSales, vatAmount } = computeVatBreakdown(negativeRefundTotal);
    const refundNumber = await generateSalesNumber(client, 'refund');
    const encodedByName = req.user.fullName || req.user.username || 'System User';

    const refundTransactionResult = await client.query(
      `INSERT INTO sales_transactions (
         sales_number,
         branch,
         customer_type,
         customer_name,
         customer_tin,
         customer_address,
         total_quantity,
         subtotal_amount,
         discount_amount,
         discount_type,
         discount_label,
         delivery_charge,
         vatable_sales,
         vat_amount,
         total_amount,
         payment_method,
         amount_received,
         change_amount,
         payment_reference,
         payment_confirmed,
         payment_confirmed_by,
         payment_confirmed_by_name,
         payment_confirmed_at,
         status,
         transaction_type,
         reference_sales_transaction_id,
         sold_by,
         sold_by_name,
         remarks,
         created_at,
         encoded_at,
         backdate_reason
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 'none', 'Refund', 0, $9, $10, $11, $12, $13, 0, $14, true, $15, $16, ${PHILIPPINE_NOW_SQL}, 'completed', 'refund', $17, $18, $19, $20, COALESCE($21::timestamp, ${PHILIPPINE_NOW_SQL}), ${PHILIPPINE_NOW_SQL}, $22)
       RETURNING *`,
      [
        refundNumber,
        req.user.branch,
        originalSale.customer_type,
        originalSale.customer_name || 'C',
        originalSale.customer_tin,
        originalSale.customer_address || 'C',
        -totalRefundQuantity,
        negativeRefundTotal,
        vatableSales,
        vatAmount,
        negativeRefundTotal,
        originalSale.payment_method || 'cash',
        negativeRefundTotal,
        originalSale.payment_reference,
        req.user.id,
        encodedByName,
        salesTransactionId,
        req.user.id,
        encodedByName,
        `Refund for Invoice ${originalInvoiceNumber}. System ref ${originalSale.sales_number}. Reason: ${cleanReason}`,
        transactionTiming.actualTransactionAt,
        transactionTiming.backdateReason
      ]
    );

    const refundTransaction = refundTransactionResult.rows[0];

    for (const line of preparedRefundLines) {
      const { originalItem, refundQuantity, refundSubtotal, previousQuantity, newQuantity, salesItemId } = line;
      const itemResult = await client.query(
        `INSERT INTO sales_items (
           sales_transaction_id,
           item_type,
           inventory_id,
           product_id,
           is_inventory_item,
           item_name,
           category,
           category_note,
           branch,
           quantity_sold,
           unit_price,
           unit_cost_at_sale,
           subtotal,
           cost_subtotal,
           gross_profit,
           profit_margin_percent,
           previous_quantity,
           new_quantity,
           refund_for_sales_item_id,
           created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, COALESCE($20::timestamp, ${PHILIPPINE_NOW_SQL}))
         RETURNING *`,
        [
          refundTransaction.sales_transaction_id,
          originalItem.item_type || (originalItem.is_inventory_item === false ? 'non_inventory' : 'inventory'),
          originalItem.inventory_id,
          originalItem.product_id,
          originalItem.is_inventory_item !== false,
          originalItem.item_name,
          originalItem.category,
          originalItem.category_note || null,
          originalItem.branch,
          -refundQuantity,
          originalItem.unit_price,
          line.refundProfit.unitCostAtSale,
          refundSubtotal,
          line.refundProfit.costSubtotal,
          line.refundProfit.grossProfit,
          line.refundProfit.profitMarginPercent,
          previousQuantity,
          newQuantity,
          salesItemId,
          transactionTiming.actualTransactionAt
        ]
      );
      insertedItems.push(itemResult.rows[0]);
    }

    await recordAuditLog(client, {
      actorId: req.user.id,
      targetId: refundTransaction.sales_transaction_id,
      targetName: refundNumber,
      targetType: 'sales_transaction',
      action: 'CREATE_SALES_REFUND',
      reason: 'Customer Refund',
      details: {
        branch: req.user.branch,
        originalSalesTransactionId: salesTransactionId,
        originalSalesNumber: originalSale.sales_number,
        originalOfficialInvoiceNumber: originalInvoiceNumber,
        refundNumber,
        refundReason: cleanReason,
        totalRefundQuantity,
        totalRefundAmount: roundedRefundTotal,
        stockRestoreDetails,
        actualTransactionAt: refundTransaction.created_at,
        encodedAt: refundTransaction.encoded_at,
        backdateReason: transactionTiming.backdateReason
      }
    });

    await client.query('COMMIT');

    return res.status(201).json({
      sale: mapSalesTransactionRow({
        ...refundTransaction,
        reference_sales_number: originalSale.sales_number,
        reference_official_invoice_number: originalInvoiceNumber,
        items: insertedItems.map(mapSalesItemRow)
      }),
      products: restoredItems.map(mapInventoryRow)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Refund sale error:', err);
    return res.status(500).json({ error: 'Failed to record refund. No inventory was restored.' });
  } finally {
    client.release();
  }
});

app.post('/api/sales/:id/cancel', authenticate, requireAdmin, async (req, res) => {
  const salesTransactionId = Number(req.params.id);
  const cleanReason = String(req.body?.cancel_reason || '').trim().slice(0, 500);

  if (!Number.isInteger(salesTransactionId) || salesTransactionId <= 0) {
    return res.status(400).json({ error: 'Please select a valid sales record to cancel.' });
  }

  if (cleanReason.length < 5) {
    return res.status(400).json({ error: 'Please enter a clear cancellation reason.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const saleResult = await client.query(
      `SELECT *
       FROM sales_transactions
       WHERE sales_transaction_id = $1
         AND branch = $2
       FOR UPDATE`,
      [salesTransactionId, req.user.branch]
    );

    if (saleResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sales record was not found for this branch.' });
    }

    const sale = saleResult.rows[0];
    const saleInvoiceNumber = resolveOfficialSalesInvoiceNumber(
      sale.official_invoice_number,
      sale.sales_number
    ) || sale.sales_number;
    if (sale.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This sales record has already been cancelled.' });
    }

    if ((sale.transaction_type || 'sale') === 'refund') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Refund records cannot be cancelled. Review the original sales record instead.' });
    }

    const refundActivityResult = await client.query(
      `SELECT 1
       FROM sales_transactions
       WHERE reference_sales_transaction_id = $1
         AND branch = $2
         AND transaction_type = 'refund'
         AND status = 'completed'
       LIMIT 1`,
      [salesTransactionId, req.user.branch]
    );

    if (refundActivityResult.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This sale already has refund activity. Use the refund workflow for additional returns instead of cancelling the entire sale.' });
    }

    const itemsResult = await client.query(
      `SELECT *
       FROM sales_items
       WHERE sales_transaction_id = $1
       ORDER BY sales_item_id ASC`,
      [salesTransactionId]
    );

    if (itemsResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This sales record has no item lines to restore.' });
    }

    const restoredItems = [];

    for (const saleItem of itemsResult.rows) {
      if (saleItem.is_inventory_item === false || !saleItem.inventory_id) {
        continue;
      }

      const inventoryResult = await client.query(
        `SELECT
           bi.inventory_id,
           bi.product_id,
           p.name,
           p.category,
           p.category_note,
           p.supplier_name,
           p.default_selling_price,
           bi.branch,
           bi.stock_level,
           bi.min_stock_level,
           bi.lead_time_days,
           bi.safety_stock,
           bi.average_daily_sales,
           bi.status,
           bi.last_updated
         FROM branch_inventory bi
         INNER JOIN products p ON p.product_id = bi.product_id
         WHERE bi.inventory_id = $1
           AND bi.branch = $2
         FOR UPDATE`,
        [saleItem.inventory_id, req.user.branch]
      );

      if (inventoryResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `${saleItem.item_name} is no longer available in active inventory. Restore cannot be completed safely.` });
      }

      const currentItem = inventoryResult.rows[0];
      const previousQuantity = Number(currentItem.stock_level || 0);
      const restoredQuantity = Number(saleItem.quantity_sold || 0);
      const newQuantity = previousQuantity + restoredQuantity;
      const nextStatus = computeInventoryStatus(newQuantity, getEffectiveReorderThreshold(currentItem));

      const updatedResult = await client.query(
        `UPDATE branch_inventory
         SET stock_level = $1,
             status = $2,
             last_updated = ${PHILIPPINE_NOW_SQL}
         WHERE inventory_id = $3
           AND branch = $4
         RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated`,
        [newQuantity, nextStatus, saleItem.inventory_id, req.user.branch]
      );

      await recordStockMovement(client, {
        inventoryId: saleItem.inventory_id,
        productId: saleItem.product_id,
        itemName: saleItem.item_name,
        category: saleItem.category,
        branch: saleItem.branch,
        action: 'stock_in',
        quantityChanged: restoredQuantity,
        previousQuantity,
        newQuantity,
        reason: 'sales_cancellation',
        note: `Cancelled Sales Invoice ${saleInvoiceNumber}. System ref ${sale.sales_number}. Reason: ${cleanReason}`,
        actorId: req.user.id
      });

      await refreshAverageDailySalesForInventory(client, saleItem.inventory_id);

      restoredItems.push({
        ...updatedResult.rows[0],
        name: currentItem.name,
        category: currentItem.category,
        category_note: currentItem.category_note,
        supplier_name: currentItem.supplier_name,
        default_selling_price: currentItem.default_selling_price,
        lead_time_days: currentItem.lead_time_days,
        safety_stock: currentItem.safety_stock,
        average_daily_sales: currentItem.average_daily_sales
      });
    }

    const cancelledSaleResult = await client.query(
      `UPDATE sales_transactions
       SET status = 'cancelled',
           cancelled_at = ${PHILIPPINE_NOW_SQL},
           cancelled_by = $1,
           cancel_reason = $2
       WHERE sales_transaction_id = $3
       RETURNING *`,
      [req.user.id, cleanReason, salesTransactionId]
    );

    await recordAuditLog(client, {
      actorId: req.user.id,
      targetId: salesTransactionId,
      targetName: saleInvoiceNumber,
      targetType: 'sales_transaction',
      action: 'CANCEL_SALES_INVOICE',
      reason: 'Sales Cancellation',
      details: {
        branch: req.user.branch,
        officialInvoiceNumber: saleInvoiceNumber,
        salesNumber: sale.sales_number,
        cancelReason: cleanReason,
        totalQuantity: Number(sale.total_quantity || 0),
        totalAmount: Number(sale.total_amount || 0),
        restoredItemCount: itemsResult.rowCount
      }
    });

    await client.query('COMMIT');

    return res.json({
      sale: mapSalesTransactionRow({
        ...cancelledSaleResult.rows[0],
        items: itemsResult.rows.map(mapSalesItemRow)
      }),
      products: restoredItems.map(mapInventoryRow)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Cancel sale error:', err);
    return res.status(500).json({ error: 'Failed to cancel sale. Inventory was not restored.' });
  } finally {
    client.release();
  }
});

app.get('/api/purchases', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         pt.purchase_transaction_id,
         pt.purchase_number,
         pt.branch,
         pt.supplier_name,
         pt.document_type,
         pt.document_type_note,
         pt.document_number,
         pt.payment_terms,
         pt.subtotal_amount,
         pt.total_quantity,
         pt.remarks,
         pt.status,
         pt.encoded_by,
         pt.encoded_by_name,
         pt.created_at,
         pt.encoded_at,
         pt.backdate_reason,
         pt.cancelled_at,
         pt.cancelled_by,
         pt.cancel_reason,
         COALESCE(
           json_agg(
             json_build_object(
               'purchase_item_id', pi.purchase_item_id,
               'inventory_id', pi.inventory_id,
               'product_id', pi.product_id,
               'item_name', pi.item_name,
               'category', pi.category,
               'category_note', pi.category_note,
               'branch', pi.branch,
               'quantity_received', pi.quantity_received,
               'unit_cost', pi.unit_cost,
               'subtotal', pi.subtotal,
               'previous_quantity', pi.previous_quantity,
               'new_quantity', pi.new_quantity,
               'created_at', pi.created_at
             )
             ORDER BY pi.purchase_item_id ASC
           ) FILTER (WHERE pi.purchase_item_id IS NOT NULL),
           '[]'::json
         ) AS items
       FROM purchase_transactions pt
       LEFT JOIN purchase_items pi
         ON pi.purchase_transaction_id = pt.purchase_transaction_id
       WHERE pt.branch = $1
       GROUP BY pt.purchase_transaction_id
       ORDER BY pt.created_at DESC, pt.purchase_transaction_id DESC`,
      [req.user.branch]
    );

    return res.json({ purchases: result.rows.map(mapPurchaseTransactionRow) });
  } catch (err) {
    console.error('Get purchases error:', err);
    return res.status(500).json({ error: 'Failed to load purchase records' });
  }
});

app.post('/api/purchases', authenticate, async (req, res) => {
  if (!canPerformInventoryMovement(req.user)) {
    return res.status(403).json({
      error: 'Purchase entry is available only to Admin / Manager and Inventory Staff accounts.'
    });
  }

  const {
    supplier_name,
    document_type = 'DR',
    document_type_note = '',
    document_number = '',
    payment_terms = 'cash',
    remarks = '',
    items = []
  } = req.body;
  const cleanSupplierName = String(supplier_name || '').trim().replace(/\s+/g, ' ');
  const normalizedDocumentType = String(document_type || 'DR').trim().toUpperCase();
  const cleanDocumentTypeNote = String(document_type_note || '').trim().replace(/\s+/g, ' ').slice(0, 240);
  const normalizedPaymentTerms = String(payment_terms || 'cash').trim().toLowerCase();
  const cleanDocumentNumber = String(document_number || '').trim().slice(0, 80) || null;
  const cleanRemarks = String(remarks || '').trim().slice(0, 500) || null;
  const allowedDocumentTypes = new Set(['DR', 'SI', 'OR', 'OTHER']);
  const allowedPaymentTerms = new Set(['cash', 'cod', 'credit', 'branch_transfer']);
  let transactionTiming;
  try {
    transactionTiming = getTransactionTiming(req.body);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  if (!cleanSupplierName || cleanSupplierName.length > 120) {
    return res.status(400).json({ error: 'Supplier name is required and must be 120 characters or less.' });
  }

  if (!allowedDocumentTypes.has(normalizedDocumentType)) {
    return res.status(400).json({ error: 'Please select a valid purchase document type.' });
  }

  if (normalizedDocumentType === 'OTHER' && !cleanDocumentTypeNote) {
    return res.status(400).json({ error: 'Please enter a short note for the Other document type.' });
  }

  if (!allowedPaymentTerms.has(normalizedPaymentTerms)) {
    return res.status(400).json({ error: 'Please select valid payment terms.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one received item before saving the purchase.' });
  }

  const preparedItems = [];
  try {
    for (const item of items) {
      const inventoryId = Number(item?.inventory_id);
      const quantity = parseNonNegativeInteger(item?.quantity, 'Quantity received');
      const unitCost = parseNonNegativeDecimal(item?.unit_cost, 'Unit cost', { max: 100000000 });

      if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
        return res.status(400).json({ error: 'Each purchase item must select an active inventory item.' });
      }

      if (quantity <= 0) {
        return res.status(400).json({ error: 'Quantity received must be greater than zero.' });
      }

      if (unitCost < 0) {
        return res.status(400).json({ error: 'Unit cost cannot be negative.' });
      }

      preparedItems.push({
        inventoryId,
        quantity,
        unitCost,
        subtotal: Number((quantity * unitCost).toFixed(2))
      });
    }
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Invalid purchase details.' });
  }

  const duplicateInventoryIds = new Set();
  for (const item of preparedItems) {
    if (duplicateInventoryIds.has(item.inventoryId)) {
      return res.status(400).json({ error: 'Each purchase item should appear only once. Combine duplicate quantities into one line.' });
    }
    duplicateInventoryIds.add(item.inventoryId);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const purchaseNumber = await generatePurchaseNumber(client);
    const encodedByName = req.user.fullName || req.user.username || 'System User';
    let totalQuantity = 0;
    let subtotalAmount = 0;
    const purchaseLines = [];
    const updatedItems = [];

    for (const line of preparedItems) {
      const currentResult = await client.query(
        `SELECT
           bi.inventory_id,
           bi.product_id,
           p.name,
           p.category,
           p.category_note,
           p.supplier_name,
           p.default_selling_price,
           bi.branch,
           bi.stock_level,
           bi.min_stock_level,
           bi.lead_time_days,
           bi.safety_stock,
           bi.average_daily_sales,
           bi.status,
           bi.last_updated
         FROM branch_inventory bi
         INNER JOIN products p ON p.product_id = bi.product_id
         WHERE bi.inventory_id = $1 AND bi.branch = $2
         FOR UPDATE`,
        [line.inventoryId, req.user.branch]
      );

      if (currentResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'One selected purchase item was not found in your branch inventory.' });
      }

      const currentItem = currentResult.rows[0];
      const previousQuantity = Number(currentItem.stock_level || 0);
      const newQuantity = previousQuantity + line.quantity;
      const nextStatus = computeInventoryStatus(newQuantity, getEffectiveReorderThreshold(currentItem));

      const updatedResult = await client.query(
        `UPDATE branch_inventory
         SET stock_level = $1,
             status = $2,
             last_updated = ${PHILIPPINE_NOW_SQL}
         WHERE inventory_id = $3 AND branch = $4
         RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated`,
        [newQuantity, nextStatus, line.inventoryId, req.user.branch]
      );

      totalQuantity += line.quantity;
      subtotalAmount += line.subtotal;
      purchaseLines.push({
        inventoryId: line.inventoryId,
        productId: currentItem.product_id,
        itemName: currentItem.name,
        category: currentItem.category,
        categoryNote: currentItem.category_note || null,
        branch: currentItem.branch,
        quantityReceived: line.quantity,
        unitCost: line.unitCost,
        subtotal: line.subtotal,
        previousQuantity,
        newQuantity
      });

      updatedItems.push({
        ...updatedResult.rows[0],
        name: currentItem.name,
        category: currentItem.category,
        category_note: currentItem.category_note,
        supplier_name: currentItem.supplier_name,
        default_selling_price: currentItem.default_selling_price,
        lead_time_days: currentItem.lead_time_days,
        safety_stock: currentItem.safety_stock,
        average_daily_sales: currentItem.average_daily_sales
      });
    }

    const roundedSubtotalAmount = Number(subtotalAmount.toFixed(2));
    const transactionResult = await client.query(
      `INSERT INTO purchase_transactions (
         purchase_number,
         branch,
         supplier_name,
         document_type,
         document_type_note,
         document_number,
         payment_terms,
         subtotal_amount,
         total_quantity,
         remarks,
         status,
         encoded_by,
         encoded_by_name,
         created_at,
         encoded_at,
         backdate_reason
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed', $11, $12, COALESCE($13::timestamp, ${PHILIPPINE_NOW_SQL}), ${PHILIPPINE_NOW_SQL}, $14)
       RETURNING *`,
      [
        purchaseNumber,
        req.user.branch,
        cleanSupplierName,
        normalizedDocumentType,
        cleanDocumentTypeNote || null,
        cleanDocumentNumber,
        normalizedPaymentTerms,
        roundedSubtotalAmount,
        totalQuantity,
        cleanRemarks,
        req.user.id,
        encodedByName,
        transactionTiming.actualTransactionAt,
        transactionTiming.backdateReason
      ]
    );

    const purchaseTransaction = transactionResult.rows[0];
    const insertedItems = [];

    for (const line of purchaseLines) {
      const itemResult = await client.query(
        `INSERT INTO purchase_items (
           purchase_transaction_id,
           inventory_id,
           product_id,
           item_name,
           category,
           category_note,
           branch,
           quantity_received,
           unit_cost,
           subtotal,
           previous_quantity,
           new_quantity,
           created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamp, ${PHILIPPINE_NOW_SQL}))
         RETURNING *`,
        [
          purchaseTransaction.purchase_transaction_id,
          line.inventoryId,
          line.productId,
          line.itemName,
          line.category,
          line.categoryNote || null,
          line.branch,
          line.quantityReceived,
          line.unitCost,
          line.subtotal,
          line.previousQuantity,
          line.newQuantity,
          transactionTiming.actualTransactionAt
        ]
      );
      insertedItems.push(itemResult.rows[0]);

      await recordStockMovement(client, {
        inventoryId: line.inventoryId,
        productId: line.productId,
        itemName: line.itemName,
        category: line.category,
        branch: line.branch,
        action: 'stock_in',
        quantityChanged: line.quantityReceived,
        previousQuantity: line.previousQuantity,
        newQuantity: line.newQuantity,
        reason: 'purchase_received',
        note: `Purchase entry ${purchaseNumber} from ${cleanSupplierName}${cleanDocumentNumber ? ` (${normalizedDocumentType} ${cleanDocumentNumber})` : ''}.`,
        actorId: req.user.id,
        actualTransactionAt: transactionTiming.actualTransactionAt,
        backdateReason: transactionTiming.backdateReason
      });
    }

    await recordAuditLog(client, {
      actorId: req.user.id,
      targetId: purchaseTransaction.purchase_transaction_id,
      targetName: purchaseNumber,
      targetType: 'purchase_transaction',
      action: 'CREATE_PURCHASE_TRANSACTION',
      reason: 'Purchase Entry',
      details: {
        branch: req.user.branch,
        supplierName: cleanSupplierName,
        documentType: normalizedDocumentType,
        documentTypeNote: cleanDocumentTypeNote || null,
        documentNumber: cleanDocumentNumber,
        paymentTerms: normalizedPaymentTerms,
        totalQuantity,
        subtotalAmount: roundedSubtotalAmount,
        itemCount: insertedItems.length,
        remarks: cleanRemarks,
        actualTransactionAt: purchaseTransaction.created_at,
        encodedAt: purchaseTransaction.encoded_at,
        backdateReason: transactionTiming.backdateReason
      }
    });

    await client.query('COMMIT');

    return res.status(201).json({
      purchase: mapPurchaseTransactionRow({
        ...purchaseTransaction,
        items: insertedItems.map(mapPurchaseItemRow)
      }),
      products: updatedItems.map(mapInventoryRow)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Record purchase error:', err);
    return res.status(500).json({ error: 'Failed to save purchase. No inventory was added.' });
  } finally {
    client.release();
  }
});

app.post('/api/inventory', authenticate, requireAdmin, async (req, res) => {
  const {
    name,
    category,
    category_note,
    supplier_name,
    default_selling_price,
    cost_price,
    stock_level,
    min_stock_level,
    lead_time_days,
    safety_stock,
    average_daily_sales,
    average_daily_sales_mode,
    manual_average_daily_sales,
    average_daily_sales_override_reason,
    allow_similar_duplicate = false
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cleanName = cleanInventoryName(name);
    const cleanSupplier = cleanSupplierName(supplier_name);
    const canonicalCategory = canonicalizeInventoryCategory(category);
    const categoryNote = cleanCategoryNote(category_note, canonicalCategory);
    const nameQualityError = validateInventoryNameQuality(cleanName);
    if (nameQualityError || !canonicalCategory) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: nameQualityError || 'Valid product name and category are required' });
    }

    const supplierQualityError = validateSupplierNameQuality(cleanSupplier);
    if (supplierQualityError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: supplierQualityError });
    }

    const activeExactNameDuplicate = await findExactActiveInventoryItemByName(client, {
      branch: req.user.branch,
      name: cleanName
    });

    if (activeExactNameDuplicate) {
      await client.query('ROLLBACK');
      await recordAuditLogSafely(pool, {
        actorId: req.user.id,
        targetId: activeExactNameDuplicate.inventory_id,
        targetName: cleanName,
        action: `BLOCKED_EXACT_ACTIVE_NAME_DUPLICATE: attempted "${cleanName}"`
      });
      return res.status(400).json({
        error: `This product already exists in the current branch inventory: ${activeExactNameDuplicate.name} (${activeExactNameDuplicate.category}). Use Stock In if this is the same product, even if it is currently out of stock.`
      });
    }

    const archivedExactNameDuplicate = await findExactArchivedInventoryItemByName(client, {
      branch: req.user.branch,
      name: cleanName
    });

    if (archivedExactNameDuplicate) {
      await client.query('ROLLBACK');
      await recordAuditLogSafely(pool, {
        actorId: req.user.id,
        targetId: archivedExactNameDuplicate.archived_inventory_id,
        targetName: cleanName,
        action: `BLOCKED_EXACT_ARCHIVED_NAME_DUPLICATE: attempted "${cleanName}"`
      });
      return res.status(400).json({
        error: `An archived item with the same name already exists: ${archivedExactNameDuplicate.name} (${archivedExactNameDuplicate.category}). Restore the archived item instead of creating a duplicate record.`
      });
    }

    const stockLevel = parseNonNegativeInteger(stock_level, 'Stock level');
    const minStockLevel = parseNonNegativeInteger(min_stock_level, 'Manual low-stock threshold');
    const defaultSellingPrice = parseOptionalPositiveDecimal(default_selling_price, 'Default selling price', { max: 100000000 });
    const costPrice = parseOptionalPositiveDecimal(cost_price, 'Cost price', { max: 100000000 });
    const leadTimeDays = parseOptionalNonNegativeInteger(lead_time_days, 'Supplier lead time', { max: 365 });
    const safetyStock = parseOptionalNonNegativeInteger(safety_stock, 'Safety stock', { max: 100000 });
    const averageDailySalesMode = normalizeAverageDailySalesMode(average_daily_sales_mode);
    const manualAverageDailySales = averageDailySalesMode === 'manual'
      ? parseOptionalNonNegativeDecimal(manual_average_daily_sales ?? average_daily_sales, 'Manual average daily sales', { max: 100000 })
      : null;
    if (averageDailySalesMode === 'manual' && manualAverageDailySales === null) {
      throw Object.assign(new Error('Manual average daily sales is required when manual override is enabled.'), { statusCode: 400 });
    }
    const averageDailySalesOverrideReason = averageDailySalesMode === 'manual'
      ? cleanAverageDailySalesOverrideReason(average_daily_sales_override_reason)
      : null;
    const averageDailySales = averageDailySalesMode === 'manual' ? manualAverageDailySales : null;

    const archivedDuplicate = await findSimilarArchivedInventoryItem(client, {
      branch: req.user.branch,
      name: cleanName,
      category: canonicalCategory
    });

    if (archivedDuplicate?.match_type === 'exact') {
      await client.query('ROLLBACK');
      await recordAuditLogSafely(pool, {
        actorId: req.user.id,
        targetId: archivedDuplicate.archived_inventory_id,
        targetName: cleanName,
        action: `BLOCKED_EXACT_ARCHIVED_DUPLICATE: attempted "${cleanName}"`
      });
      return res.status(400).json({
        error: 'An archived item with the same name and category already exists. Please restore the archived item instead of creating a duplicate record.'
      });
    }

    if (archivedDuplicate && !allow_similar_duplicate) {
      await client.query('ROLLBACK');
      await recordAuditLogSafely(pool, {
        actorId: req.user.id,
        targetId: archivedDuplicate.archived_inventory_id,
        targetName: cleanName,
        action: `REVIEW_SIMILAR_ARCHIVED_DUPLICATE: "${cleanName}" similar to "${archivedDuplicate.name}"`
      });
      return res.status(409).json({
        error: `A similar archived item already exists: ${archivedDuplicate.name}. Restore it if this is the same product, or confirm that this is a separate item.`
      });
    }

    const activeSimilarDuplicate = await findSimilarActiveInventoryItem(client, {
      branch: req.user.branch,
      name: cleanName,
      category: canonicalCategory
    });

    if (activeSimilarDuplicate?.match_type === 'exact') {
      await client.query('ROLLBACK');
      await recordAuditLogSafely(pool, {
        actorId: req.user.id,
        targetId: activeSimilarDuplicate.inventory_id,
        targetName: cleanName,
        action: `BLOCKED_EXACT_ACTIVE_DUPLICATE: attempted "${cleanName}"`
      });
      return res.status(400).json({
        error: `This product already exists in the current branch inventory: ${activeSimilarDuplicate.name}. Use Stock In if this is the same product.`
      });
    }

    if (activeSimilarDuplicate && !allow_similar_duplicate) {
      await client.query('ROLLBACK');
      await recordAuditLogSafely(pool, {
        actorId: req.user.id,
        targetId: activeSimilarDuplicate.inventory_id,
        targetName: cleanName,
        action: `REVIEW_SIMILAR_ACTIVE_DUPLICATE: "${cleanName}" similar to "${activeSimilarDuplicate.name}"`
      });
      return res.status(409).json({
        error: `A similar active item already exists: ${activeSimilarDuplicate.name}. Use Stock In if this is the same product, or confirm that this is a separate item.`
      });
    }

    const productId = await findOrCreateProduct(client, {
      name: cleanName,
      category: canonicalCategory,
      categoryNote,
      supplierName: cleanSupplier,
      defaultSellingPrice,
      costPrice
    });
    const status = computeInventoryStatus(stockLevel, getEffectiveReorderThreshold({
      min_stock_level: minStockLevel,
      lead_time_days: leadTimeDays,
      safety_stock: safetyStock,
      average_daily_sales: averageDailySales
    }));

    const duplicateCheck = await client.query(
      `SELECT inventory_id
       FROM branch_inventory
       WHERE product_id = $1 AND branch = $2`,
      [productId, req.user.branch]
    );

    if (duplicateCheck.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This product already exists in the current branch inventory' });
    }

    const result = await client.query(
      `INSERT INTO branch_inventory (
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
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, average_daily_sales_mode, manual_average_daily_sales, average_daily_sales_override_reason, status, last_updated`,
      [
        productId,
        req.user.branch,
        stockLevel,
        minStockLevel,
        leadTimeDays,
        safetyStock,
        averageDailySales,
        averageDailySalesMode,
        manualAverageDailySales,
        averageDailySalesOverrideReason,
        status
      ]
    );

    const merged = await client.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         p.category_note,
         p.supplier_name,
         p.default_selling_price,
         p.cost_price,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
         bi.average_daily_sales_mode,
         bi.manual_average_daily_sales,
         bi.average_daily_sales_override_reason,
         bi.status,
         bi.branch,
         bi.last_updated
       FROM branch_inventory bi
       INNER JOIN products p ON p.product_id = bi.product_id
       WHERE bi.inventory_id = $1`,
      [result.rows[0].inventory_id]
    );

    const createdItem = merged.rows[0];
    await recordAuditLog(client, {
      actorId: req.user.id,
      targetId: createdItem.inventory_id,
      targetName: createdItem.name,
      targetType: 'inventory_item',
      action: 'ADD_ITEM',
      details: {
        branch: createdItem.branch,
        category: createdItem.category,
        categoryNote: createdItem.category_note || null,
        supplier: createdItem.supplier_name || 'Unassigned',
        defaultSellingPrice,
        costPrice,
        initialQuantity: stockLevel,
        reorderLevel: minStockLevel,
        leadTimeDays,
        safetyStock,
        averageDailySales,
        averageDailySalesMode,
        manualAverageDailySales,
        averageDailySalesOverrideReason,
        recommendedReorderPoint: computeReorderPoint({
          averageDailySales,
          leadTimeDays,
          safetyStock
        }),
        status
      }
    });

    if (allow_similar_duplicate && (activeSimilarDuplicate || archivedDuplicate)) {
      await recordAuditLog(client, {
        actorId: req.user.id,
        targetId: createdItem.inventory_id,
        targetName: createdItem.name,
        targetType: 'inventory_item',
        action: `CONFIRMED_SIMILAR_ITEM_CREATION: created "${createdItem.name}"`,
        reason: 'Admin confirmed the item is separate from the possible duplicate.',
        details: {
          branch: createdItem.branch,
          category: createdItem.category,
          reviewedAgainst: activeSimilarDuplicate?.name || archivedDuplicate?.name || null
        }
      });
    }

    if (stockLevel > 0) {
      await recordStockMovement(client, {
        inventoryId: createdItem.inventory_id,
        productId: createdItem.product_id,
        itemName: createdItem.name,
        category: createdItem.category,
        branch: createdItem.branch,
        action: 'initial_stock',
        quantityChanged: stockLevel,
        previousQuantity: 0,
        newQuantity: stockLevel,
        reason: 'beginning_balance',
        note: 'Initial stock recorded when item was added.',
        actorId: req.user.id
      });
    }

    await client.query('COMMIT');
    return res.status(201).json({ product: mapInventoryRow(createdItem, { includeCostPrice: true }) });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Add product error:', err);
    return res.status(500).json({ error: 'Failed to add product' });
  } finally {
    client.release();
  }
});

app.post('/api/inventory/batch-stock-out', authenticate, async (req, res) => {
  const { items = [], movement_reason, movement_note } = req.body;
  const normalizedMovementReason = normalizeStockMovementReasonForAction('stock_out', movement_reason);
  let transactionTiming;
  try {
    transactionTiming = getTransactionTiming(req.body);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  if (!canPerformInventoryMovement(req.user)) {
    return res.status(403).json({
      error: 'Batch Stock Out is available only to Admin / Manager and Inventory Staff accounts.'
    });
  }

  if (!normalizedMovementReason) {
    return res.status(400).json({ error: 'Please select the stock-out reason for this deduction.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one item to process a batch Stock Out.' });
  }

  const aggregatedItems = new Map();
  try {
    for (const item of items) {
      const inventoryId = Number(item?.inventory_id);
      const quantity = parseNonNegativeInteger(item?.quantity, 'Stock Out quantity');
      if (!Number.isInteger(inventoryId) || inventoryId <= 0 || quantity <= 0) {
        return res.status(400).json({ error: 'Each batch Stock Out line must include a valid item and quantity.' });
      }
      aggregatedItems.set(inventoryId, (aggregatedItems.get(inventoryId) || 0) + quantity);
    }
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Invalid batch Stock Out details.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updatedItems = [];
    for (const [inventoryId, quantity] of aggregatedItems.entries()) {
      const currentResult = await client.query(
        `SELECT
           bi.inventory_id,
           bi.product_id,
           p.name,
           p.category,
           p.category_note,
           p.supplier_name,
           p.default_selling_price,
           bi.branch,
           bi.stock_level,
           bi.min_stock_level,
           bi.lead_time_days,
           bi.safety_stock,
           bi.average_daily_sales,
           bi.status,
           bi.last_updated
         FROM branch_inventory bi
         INNER JOIN products p ON p.product_id = bi.product_id
         WHERE bi.inventory_id = $1 AND bi.branch = $2
         FOR UPDATE`,
        [inventoryId, req.user.branch]
      );

      if (currentResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Inventory item ${inventoryId} was not found in your branch.` });
      }

      const currentItem = currentResult.rows[0];
      const previousQuantity = Number(currentItem.stock_level || 0);
      if (quantity > previousQuantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `${currentItem.name} has only ${previousQuantity} unit${previousQuantity === 1 ? '' : 's'} available.`
        });
      }

      const nextQuantity = previousQuantity - quantity;
      const nextStatus = computeInventoryStatus(nextQuantity, getEffectiveReorderThreshold(currentItem));
      const updatedResult = await client.query(
        `UPDATE branch_inventory
         SET stock_level = $1,
             status = $2,
             last_updated = ${PHILIPPINE_NOW_SQL}
         WHERE inventory_id = $3 AND branch = $4
         RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated`,
        [nextQuantity, nextStatus, inventoryId, req.user.branch]
      );

      await recordStockMovement(client, {
        inventoryId,
        productId: currentItem.product_id,
        itemName: currentItem.name,
        category: currentItem.category,
        branch: currentItem.branch,
        action: 'stock_out',
        quantityChanged: quantity,
        previousQuantity,
        newQuantity: nextQuantity,
        reason: normalizedMovementReason,
        note: movement_note || 'Daily sales or stock-out deduction recorded from inventory module.',
        actorId: req.user.id,
        actualTransactionAt: transactionTiming.actualTransactionAt,
        backdateReason: transactionTiming.backdateReason
      });

      await recordAuditLog(client, {
        actorId: req.user.id,
        targetId: inventoryId,
        targetName: currentItem.name,
        targetType: 'inventory_item',
        action: `BATCH_STOCK_OUT: ${getStockMovementReasonLabel(normalizedMovementReason, 'stock_out')}`,
        reason: getStockMovementReasonLabel(normalizedMovementReason, 'stock_out'),
        details: {
          branch: currentItem.branch,
          category: currentItem.category,
          supplier: currentItem.supplier_name || 'Unassigned',
          quantityChanged: quantity,
          previousQuantity,
          newQuantity: nextQuantity,
          status: nextStatus,
          note: movement_note || 'Daily sales or stock-out deduction recorded from inventory module.',
          actualTransactionAt: transactionTiming.actualTransactionAt,
          backdateReason: transactionTiming.backdateReason
        }
      });

      updatedItems.push({
        ...updatedResult.rows[0],
        name: currentItem.name,
        category: currentItem.category,
        supplier_name: currentItem.supplier_name,
        default_selling_price: currentItem.default_selling_price,
        lead_time_days: currentItem.lead_time_days,
        safety_stock: currentItem.safety_stock,
        average_daily_sales: currentItem.average_daily_sales
      });
    }

    await client.query('COMMIT');
    return res.json({ products: updatedItems.map(mapInventoryRow) });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Batch stock out error:', err);
    return res.status(500).json({ error: 'Failed to process batch Stock Out' });
  } finally {
    client.release();
  }
});

app.post('/api/inventory/batch-stock-adjustment', authenticate, async (req, res) => {
  const { items = [], movement_reason, movement_note } = req.body;
  const normalizedMovementReason = normalizeStockMovementReasonForAction('stock_in', movement_reason);
  let transactionTiming;
  try {
    transactionTiming = getTransactionTiming(req.body);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  if (!canPerformInventoryMovement(req.user)) {
    return res.status(403).json({
      error: 'Batch Stock Adjustment is available only to Admin / Manager and Inventory Staff accounts.'
    });
  }

  if (!normalizedMovementReason) {
    return res.status(400).json({ error: 'Please select the stock-in reason for this adjustment.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one item to process a batch Stock Adjustment.' });
  }

  const aggregatedItems = new Map();
  try {
    for (const item of items) {
      const inventoryId = Number(item?.inventory_id);
      const quantity = parseNonNegativeInteger(item?.quantity, 'Stock Adjustment quantity');
      if (!Number.isInteger(inventoryId) || inventoryId <= 0 || quantity <= 0) {
        return res.status(400).json({ error: 'Each batch Stock Adjustment line must include a valid item and quantity.' });
      }
      aggregatedItems.set(inventoryId, (aggregatedItems.get(inventoryId) || 0) + quantity);
    }
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Invalid batch Stock Adjustment details.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updatedItems = [];
    for (const [inventoryId, quantity] of aggregatedItems.entries()) {
      const currentResult = await client.query(
        `SELECT
           bi.inventory_id,
           bi.product_id,
           p.name,
           p.category,
           p.category_note,
           p.supplier_name,
           p.default_selling_price,
           bi.branch,
           bi.stock_level,
           bi.min_stock_level,
           bi.lead_time_days,
           bi.safety_stock,
           bi.average_daily_sales,
           bi.status,
           bi.last_updated
         FROM branch_inventory bi
         INNER JOIN products p ON p.product_id = bi.product_id
         WHERE bi.inventory_id = $1 AND bi.branch = $2
         FOR UPDATE`,
        [inventoryId, req.user.branch]
      );

      if (currentResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Inventory item ${inventoryId} was not found in your branch.` });
      }

      const currentItem = currentResult.rows[0];
      const previousQuantity = Number(currentItem.stock_level || 0);
      const nextQuantity = previousQuantity + quantity;
      const nextStatus = computeInventoryStatus(nextQuantity, getEffectiveReorderThreshold(currentItem));
      const updatedResult = await client.query(
        `UPDATE branch_inventory
         SET stock_level = $1,
             status = $2,
             last_updated = ${PHILIPPINE_NOW_SQL}
         WHERE inventory_id = $3 AND branch = $4
         RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated`,
        [nextQuantity, nextStatus, inventoryId, req.user.branch]
      );

      await recordStockMovement(client, {
        inventoryId,
        productId: currentItem.product_id,
        itemName: currentItem.name,
        category: currentItem.category,
        branch: currentItem.branch,
        action: 'stock_in',
        quantityChanged: quantity,
        previousQuantity,
        newQuantity: nextQuantity,
        reason: normalizedMovementReason,
        note: movement_note || 'Batch stock adjustment recorded from inventory module.',
        actorId: req.user.id,
        actualTransactionAt: transactionTiming.actualTransactionAt,
        backdateReason: transactionTiming.backdateReason
      });

      await recordAuditLog(client, {
        actorId: req.user.id,
        targetId: inventoryId,
        targetName: currentItem.name,
        targetType: 'inventory_item',
        action: `BATCH_STOCK_ADJUSTMENT: ${getStockMovementReasonLabel(normalizedMovementReason, 'stock_in')}`,
        reason: getStockMovementReasonLabel(normalizedMovementReason, 'stock_in'),
        details: {
          branch: currentItem.branch,
          category: currentItem.category,
          supplier: currentItem.supplier_name || 'Unassigned',
          quantityChanged: quantity,
          previousQuantity,
          newQuantity: nextQuantity,
          status: nextStatus,
          note: movement_note || 'Batch stock adjustment recorded from inventory module.',
          actualTransactionAt: transactionTiming.actualTransactionAt,
          backdateReason: transactionTiming.backdateReason
        }
      });

      updatedItems.push({
        ...updatedResult.rows[0],
        name: currentItem.name,
        category: currentItem.category,
        supplier_name: currentItem.supplier_name,
        default_selling_price: currentItem.default_selling_price,
        lead_time_days: currentItem.lead_time_days,
        safety_stock: currentItem.safety_stock,
        average_daily_sales: currentItem.average_daily_sales
      });
    }

    await client.query('COMMIT');
    return res.json({ products: updatedItems.map(mapInventoryRow) });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Batch stock adjustment error:', err);
    return res.status(500).json({ error: 'Failed to process batch Stock Adjustment' });
  } finally {
    client.release();
  }
});

app.put('/api/inventory/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    category,
    category_note,
    supplier_name,
    default_selling_price,
    cost_price,
    stock_level,
    min_stock_level,
    lead_time_days,
    safety_stock,
    average_daily_sales,
    average_daily_sales_mode,
    manual_average_daily_sales,
    average_daily_sales_override_reason,
    movement_action,
    movement_quantity,
    movement_reason,
    movement_note,
    allow_similar_duplicate = false
  } = req.body;
  let transactionTiming;
  try {
    transactionTiming = getTransactionTiming(req.body);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingInventory = await client.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         p.category_note,
         p.supplier_name,
         p.default_selling_price,
         p.cost_price,
         bi.branch,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
         bi.average_daily_sales_mode,
         bi.manual_average_daily_sales,
         bi.average_daily_sales_override_reason,
         bi.status
       FROM branch_inventory bi
       INNER JOIN products p ON p.product_id = bi.product_id
       WHERE bi.inventory_id = $1 AND bi.branch = $2`,
      [id, req.user.branch]
    );

    if (existingInventory.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const inventoryRow = existingInventory.rows[0];
    const productId = inventoryRow.product_id;
    const previousQuantity = Number(inventoryRow.stock_level || 0);
    const nextQuantity = parseNonNegativeInteger(stock_level, 'Stock level');
    const nextMinStockLevel = parseNonNegativeInteger(min_stock_level, 'Manual low-stock threshold');
    const nextLeadTimeDays = lead_time_days === undefined
      ? inventoryRow.lead_time_days
      : parseOptionalNonNegativeInteger(lead_time_days, 'Supplier lead time', { max: 365 });
    const nextSafetyStock = safety_stock === undefined
      ? inventoryRow.safety_stock
      : parseOptionalNonNegativeInteger(safety_stock, 'Safety stock', { max: 100000 });
    const nextAverageDailySalesMode = average_daily_sales_mode === undefined
      ? normalizeAverageDailySalesMode(inventoryRow.average_daily_sales_mode)
      : normalizeAverageDailySalesMode(average_daily_sales_mode);
    const nextManualAverageDailySales = nextAverageDailySalesMode === 'manual'
      ? parseOptionalNonNegativeDecimal(
          manual_average_daily_sales ?? average_daily_sales ?? inventoryRow.manual_average_daily_sales,
          'Manual average daily sales',
          { max: 100000 }
        )
      : null;
    if (nextAverageDailySalesMode === 'manual' && nextManualAverageDailySales === null) {
      throw Object.assign(new Error('Manual average daily sales is required when manual override is enabled.'), { statusCode: 400 });
    }
    const nextAverageDailySales = nextAverageDailySalesMode === 'manual'
      ? nextManualAverageDailySales
      : await calculateRecentAverageDailySales(client, id);
    const nextAverageDailySalesOverrideReason = nextAverageDailySalesMode === 'manual'
      ? cleanAverageDailySalesOverrideReason(
          average_daily_sales_override_reason === undefined
            ? inventoryRow.average_daily_sales_override_reason
            : average_daily_sales_override_reason
        )
      : null;
    const nextDefaultSellingPrice = default_selling_price === undefined
      ? (inventoryRow.default_selling_price === null || inventoryRow.default_selling_price === undefined ? null : Number(inventoryRow.default_selling_price))
      : parseOptionalPositiveDecimal(default_selling_price, 'Default selling price', { max: 100000000 });
    const nextCostPrice = cost_price === undefined
      ? (inventoryRow.cost_price === null || inventoryRow.cost_price === undefined ? null : Number(inventoryRow.cost_price))
      : parseOptionalPositiveDecimal(cost_price, 'Cost price', { max: 100000000 });
    const status = computeInventoryStatus(nextQuantity, getEffectiveReorderThreshold({
      min_stock_level: nextMinStockLevel,
      lead_time_days: nextLeadTimeDays,
      safety_stock: nextSafetyStock,
      average_daily_sales: nextAverageDailySales
    }));
    const previousStatus = inventoryRow.status || computeInventoryStatus(previousQuantity, getEffectiveReorderThreshold(inventoryRow));
    const cleanName = cleanInventoryName(name);
    const cleanSupplier = cleanSupplierName(supplier_name);
    const canonicalCategory = canonicalizeInventoryCategory(category);
    const categoryNote = cleanCategoryNote(category_note, canonicalCategory);
    const nameQualityError = validateInventoryNameQuality(cleanName);
    if (nameQualityError || !canonicalCategory) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: nameQualityError || 'Valid product name and category are required' });
    }

    const supplierQualityError = validateSupplierNameQuality(cleanSupplier);
    if (supplierQualityError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: supplierQualityError });
    }

    const identityChanged =
      normalizeInventoryText(inventoryRow.name) !== normalizeInventoryText(cleanName) ||
      canonicalizeInventoryCategory(inventoryRow.category) !== canonicalCategory;
    const normalizeNullableNumber = value => (value === null || value === undefined ? null : Number(value));
    const supplierChanged = cleanSupplier !== cleanSupplierName(inventoryRow.supplier_name);
    const categoryNoteChanged = cleanOptionalContextNote(inventoryRow.category_note) !== categoryNote;
    const defaultSellingPriceChanged =
      normalizeNullableNumber(inventoryRow.default_selling_price) !== normalizeNullableNumber(nextDefaultSellingPrice);
    const costPriceChanged =
      normalizeNullableNumber(inventoryRow.cost_price) !== normalizeNullableNumber(nextCostPrice);
    const reorderLevelChanged = Number(inventoryRow.min_stock_level || 0) !== nextMinStockLevel;
    const reorderPlanningChanged =
      normalizeNullableNumber(inventoryRow.lead_time_days) !== normalizeNullableNumber(nextLeadTimeDays) ||
      normalizeNullableNumber(inventoryRow.safety_stock) !== normalizeNullableNumber(nextSafetyStock) ||
      normalizeNullableNumber(inventoryRow.average_daily_sales) !== normalizeNullableNumber(nextAverageDailySales) ||
      normalizeAverageDailySalesMode(inventoryRow.average_daily_sales_mode) !== nextAverageDailySalesMode ||
      normalizeNullableNumber(inventoryRow.manual_average_daily_sales) !== normalizeNullableNumber(nextManualAverageDailySales) ||
      cleanAverageDailySalesOverrideReason(inventoryRow.average_daily_sales_override_reason) !== nextAverageDailySalesOverrideReason;
    const quantityChanged = previousQuantity !== nextQuantity;
    const shouldRefreshInventoryTimestamp =
      quantityChanged ||
      previousStatus !== status ||
      identityChanged ||
      supplierChanged ||
      categoryNoteChanged ||
      defaultSellingPriceChanged ||
      costPriceChanged ||
      reorderLevelChanged ||
      reorderPlanningChanged;
    const allowedMovementActions = ['stock_in', 'stock_out'];
    const action = allowedMovementActions.includes(movement_action) ? movement_action : null;
    const normalizedMovementReason = action ? normalizeStockMovementReasonForAction(action, movement_reason) : null;
    const inferredQuantityChanged = Math.abs(nextQuantity - previousQuantity);
    const parsedMovementQuantity = movement_quantity === undefined || movement_quantity === null || movement_quantity === ''
      ? inferredQuantityChanged
      : parseNonNegativeInteger(movement_quantity, 'Movement quantity');
    const expectedDirectionIsValid =
      (action === 'stock_in' && nextQuantity > previousQuantity) ||
      (action === 'stock_out' && nextQuantity < previousQuantity);
    const isValidStockMovementRequest =
      action &&
      quantityChanged &&
      expectedDirectionIsValid &&
      parsedMovementQuantity > 0 &&
      parsedMovementQuantity === inferredQuantityChanged &&
      !identityChanged &&
      !supplierChanged &&
      !defaultSellingPriceChanged &&
      !costPriceChanged &&
      !reorderLevelChanged &&
      !reorderPlanningChanged;

    if (action && quantityChanged && !expectedDirectionIsValid) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: action === 'stock_in'
          ? 'Stock In must increase the current stock quantity.'
          : 'Stock Out must decrease the current stock quantity.'
      });
    }

    if (action && parsedMovementQuantity !== inferredQuantityChanged) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Movement quantity must match the stock quantity change.'
      });
    }

    if (action && !normalizedMovementReason) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: action === 'stock_in'
          ? 'Please select the reason for this Stock In transaction.'
          : 'Please select the reason for this Stock Out transaction.'
      });
    }

    if (!canPerformInventoryMovement(req.user)) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Stock In and Stock Out are available only to Admin / Manager and Inventory Staff accounts.'
      });
    }

    if (!isAdmin(req.user) && !isValidStockMovementRequest) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Admin / Manager access is required to change item details. Inventory Staff can only perform Stock In and Stock Out.'
      });
    }

    let reviewedSimilarDuplicate = null;
    if (identityChanged) {
      const activeExactNameDuplicate = await findExactActiveInventoryItemByName(client, {
        branch: req.user.branch,
        name: cleanName,
        excludeInventoryId: Number(id)
      });

      if (activeExactNameDuplicate) {
        await client.query('ROLLBACK');
        await recordAuditLogSafely(pool, {
          actorId: req.user.id,
          targetId: activeExactNameDuplicate.inventory_id,
          targetName: cleanName,
          action: `BLOCKED_EXACT_ACTIVE_NAME_DUPLICATE_EDIT: attempted "${cleanName}"`
        });
        return res.status(400).json({
          error: `Another active inventory item already uses this name: ${activeExactNameDuplicate.name} (${activeExactNameDuplicate.category}). Use that existing item if this is the same product.`
        });
      }

      const archivedExactNameDuplicate = await findExactArchivedInventoryItemByName(client, {
        branch: req.user.branch,
        name: cleanName
      });

      if (archivedExactNameDuplicate) {
        await client.query('ROLLBACK');
        await recordAuditLogSafely(pool, {
          actorId: req.user.id,
          targetId: archivedExactNameDuplicate.archived_inventory_id,
          targetName: cleanName,
          action: `BLOCKED_EXACT_ARCHIVED_NAME_DUPLICATE_EDIT: attempted "${cleanName}"`
        });
        return res.status(400).json({
          error: `An archived item with the same name already exists: ${archivedExactNameDuplicate.name} (${archivedExactNameDuplicate.category}). Restore the archived item instead of creating a duplicate record.`
        });
      }

      const activeDuplicate = await findSimilarActiveInventoryItem(client, {
        branch: req.user.branch,
        name: cleanName,
        category: canonicalCategory,
        excludeInventoryId: Number(id)
      });

      if (activeDuplicate?.match_type === 'exact') {
        await client.query('ROLLBACK');
        await recordAuditLogSafely(pool, {
          actorId: req.user.id,
          targetId: activeDuplicate.inventory_id,
          targetName: cleanName,
          action: `BLOCKED_EXACT_ACTIVE_DUPLICATE_EDIT: attempted "${cleanName}"`
        });
        return res.status(400).json({
          error: `Another active inventory item already uses this name and category: ${activeDuplicate.name}. Use that existing item if this is the same product.`
        });
      }

      if (activeDuplicate && !allow_similar_duplicate) {
        await client.query('ROLLBACK');
        await recordAuditLogSafely(pool, {
          actorId: req.user.id,
          targetId: activeDuplicate.inventory_id,
          targetName: cleanName,
          action: `REVIEW_SIMILAR_ACTIVE_DUPLICATE_EDIT: "${cleanName}" similar to "${activeDuplicate.name}"`
        });
        return res.status(409).json({
          error: `The edited item name is very similar to an active item: ${activeDuplicate.name}. Review the match before updating this item.`
        });
      }

      if (activeDuplicate) {
        reviewedSimilarDuplicate = activeDuplicate;
      }

      const archivedDuplicate = await findSimilarArchivedInventoryItem(client, {
        branch: req.user.branch,
        name: cleanName,
        category: canonicalCategory
      });

      if (archivedDuplicate?.match_type === 'exact') {
        await client.query('ROLLBACK');
        await recordAuditLogSafely(pool, {
          actorId: req.user.id,
          targetId: archivedDuplicate.archived_inventory_id,
          targetName: cleanName,
          action: `BLOCKED_EXACT_ARCHIVED_DUPLICATE_EDIT: attempted "${cleanName}"`
        });
        return res.status(400).json({
          error: 'An archived item with the same name and category already exists. Please restore the archived item instead of creating a duplicate record.'
        });
      }

      if (archivedDuplicate && !allow_similar_duplicate) {
        await client.query('ROLLBACK');
        await recordAuditLogSafely(pool, {
          actorId: req.user.id,
          targetId: archivedDuplicate.archived_inventory_id,
          targetName: cleanName,
          action: `REVIEW_SIMILAR_ARCHIVED_DUPLICATE_EDIT: "${cleanName}" similar to "${archivedDuplicate.name}"`
        });
        return res.status(409).json({
          error: `The edited item name is very similar to an archived item: ${archivedDuplicate.name}. Review the match before updating this item.`
        });
      }

      if (archivedDuplicate) {
        reviewedSimilarDuplicate = archivedDuplicate;
      }
    }

    let targetProductId = productId;
    if (identityChanged) {
      targetProductId = await findOrCreateProduct(client, {
        name: cleanName,
        category: canonicalCategory,
        categoryNote,
        supplierName: cleanSupplier,
        defaultSellingPrice: nextDefaultSellingPrice,
        costPrice: nextCostPrice
      });
    } else {
      await client.query(
        `UPDATE products
         SET name = $1,
             category = $2,
             category_note = $3,
             supplier_name = $4,
             default_selling_price = $5,
             cost_price = $6
         WHERE product_id = $7`,
        [cleanName, canonicalCategory, categoryNote, cleanSupplier, nextDefaultSellingPrice, nextCostPrice, productId]
      );
    }

    const branchUsage = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM branch_inventory
       WHERE product_id = $1`,
      [productId]
    );

    const result = await client.query(
      `UPDATE branch_inventory
       SET product_id = $1,
           stock_level = $2,
           min_stock_level = $3,
           lead_time_days = $4,
           safety_stock = $5,
           average_daily_sales = $6,
           average_daily_sales_mode = $11,
           manual_average_daily_sales = $12,
           average_daily_sales_override_reason = $13,
           status = $7,
           last_updated = CASE WHEN $10 THEN ${PHILIPPINE_NOW_SQL} ELSE last_updated END
       WHERE inventory_id = $8 AND branch = $9
       RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, average_daily_sales_mode, manual_average_daily_sales, average_daily_sales_override_reason, status, last_updated`,
      [
        targetProductId,
        nextQuantity,
        nextMinStockLevel,
        nextLeadTimeDays,
        nextSafetyStock,
        nextAverageDailySales,
        status,
        id,
        req.user.branch,
        shouldRefreshInventoryTimestamp,
        nextAverageDailySalesMode,
        nextManualAverageDailySales,
        nextAverageDailySalesOverrideReason
      ]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const merged = await client.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         p.category_note,
         p.supplier_name,
         p.default_selling_price,
         p.cost_price,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
         bi.average_daily_sales_mode,
         bi.manual_average_daily_sales,
         bi.average_daily_sales_override_reason,
         bi.status,
         bi.branch,
         bi.last_updated
       FROM branch_inventory bi
       INNER JOIN products p ON p.product_id = bi.product_id
       WHERE bi.inventory_id = $1`,
      [id]
    );

    if (identityChanged && (branchUsage.rows[0]?.count || 0) <= 1) {
      await client.query(
        `DELETE FROM products
         WHERE product_id = $1
           AND NOT EXISTS (
             SELECT 1
             FROM branch_inventory
             WHERE product_id = $1
           )`,
        [productId]
      );
    }

    const updatedItem = merged.rows[0];
    if (action && parsedMovementQuantity > 0 && previousQuantity !== nextQuantity) {
      await recordStockMovement(client, {
        inventoryId: updatedItem.inventory_id,
        productId: updatedItem.product_id,
        itemName: updatedItem.name,
        category: updatedItem.category,
        branch: updatedItem.branch,
        action,
        quantityChanged: parsedMovementQuantity,
        previousQuantity,
        newQuantity: nextQuantity,
        reason: normalizedMovementReason,
        note: movement_note || null,
        actorId: req.user.id,
        actualTransactionAt: transactionTiming.actualTransactionAt,
        backdateReason: transactionTiming.backdateReason
      });
      await recordAuditLog(client, {
        actorId: req.user.id,
        targetId: updatedItem.inventory_id,
        targetName: updatedItem.name,
        targetType: 'inventory_item',
        action: action === 'stock_in'
          ? `STOCK_IN: ${getStockMovementReasonLabel(normalizedMovementReason, action)}`
          : `STOCK_OUT: ${getStockMovementReasonLabel(normalizedMovementReason, action)}`,
        reason: getStockMovementReasonLabel(normalizedMovementReason, action),
        details: {
          branch: updatedItem.branch,
          category: updatedItem.category,
          supplier: updatedItem.supplier_name || 'Unassigned',
          quantityChanged: parsedMovementQuantity,
          previousQuantity,
          newQuantity: nextQuantity,
          status: updatedItem.status,
          note: movement_note || null,
          actualTransactionAt: transactionTiming.actualTransactionAt,
          backdateReason: transactionTiming.backdateReason
        }
      });
    } else {
      const changedFields = [];
      if (inventoryRow.name !== cleanName) changedFields.push('name');
      if (inventoryRow.category !== canonicalCategory) changedFields.push('category');
      if (categoryNoteChanged) changedFields.push('category note');
      if (supplierChanged) changedFields.push('supplier');
      if (defaultSellingPriceChanged) changedFields.push('default selling price');
      if (costPriceChanged) changedFields.push('cost price');
      if (previousQuantity !== nextQuantity) changedFields.push('quantity');
      if (Number(inventoryRow.min_stock_level || 0) !== nextMinStockLevel) changedFields.push('reorder level');
      if (reorderPlanningChanged) changedFields.push('reorder planning');
      if (changedFields.length > 0) {
        await recordAuditLog(client, {
          actorId: req.user.id,
          targetId: updatedItem.inventory_id,
          targetName: updatedItem.name,
          targetType: 'inventory_item',
          action: 'UPDATE_ITEM',
          reason: `Updated ${changedFields.join(', ')}.`,
          details: {
            branch: updatedItem.branch,
            changedFields,
            previous: {
              name: inventoryRow.name,
              category: inventoryRow.category,
              categoryNote: inventoryRow.category_note || null,
              supplier: inventoryRow.supplier_name || 'Unassigned',
              defaultSellingPrice: normalizeNullableNumber(inventoryRow.default_selling_price),
              costPrice: normalizeNullableNumber(inventoryRow.cost_price),
              reorderLevel: Number(inventoryRow.min_stock_level || 0),
              leadTimeDays: Number(inventoryRow.lead_time_days || 0),
              safetyStock: Number(inventoryRow.safety_stock || 0),
              averageDailySales: Number(inventoryRow.average_daily_sales || 0),
              averageDailySalesMode: normalizeAverageDailySalesMode(inventoryRow.average_daily_sales_mode),
              manualAverageDailySales: normalizeNullableNumber(inventoryRow.manual_average_daily_sales),
              averageDailySalesOverrideReason: inventoryRow.average_daily_sales_override_reason || null,
              recommendedReorderPoint: computeReorderPoint(inventoryRow)
            },
            current: {
              name: updatedItem.name,
              category: updatedItem.category,
              categoryNote: updatedItem.category_note || null,
              supplier: updatedItem.supplier_name || 'Unassigned',
              defaultSellingPrice: normalizeNullableNumber(updatedItem.default_selling_price),
              costPrice: normalizeNullableNumber(updatedItem.cost_price),
              reorderLevel: nextMinStockLevel,
              leadTimeDays: nextLeadTimeDays,
              safetyStock: nextSafetyStock,
              averageDailySales: nextAverageDailySales,
              averageDailySalesMode: nextAverageDailySalesMode,
              manualAverageDailySales: nextManualAverageDailySales,
              averageDailySalesOverrideReason: nextAverageDailySalesOverrideReason,
              recommendedReorderPoint: computeReorderPoint(updatedItem)
            }
          }
        });
        if (allow_similar_duplicate && reviewedSimilarDuplicate) {
          await recordAuditLog(client, {
            actorId: req.user.id,
            targetId: updatedItem.inventory_id,
            targetName: updatedItem.name,
            targetType: 'inventory_item',
            action: `CONFIRMED_SIMILAR_ITEM_UPDATE: updated "${updatedItem.name}"`,
            reason: 'Admin confirmed the updated item is separate from the possible duplicate.',
            details: {
              branch: updatedItem.branch,
              reviewedAgainst: reviewedSimilarDuplicate.name || null
            }
          });
        }
      }
    }

    await client.query('COMMIT');
    return res.json({ product: mapInventoryRow(updatedItem, { includeCostPrice: isAdmin(req.user) }) });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Update product error:', err);
    return res.status(500).json({ error: 'Failed to update product' });
  } finally {
    client.release();
  }
});

app.delete('/api/inventory/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const normalizedArchiveReason = normalizeArchiveReason(req.body?.archive_reason);
  const archiveReasonNote = String(req.body?.archive_reason_note || '').trim().replace(/\s+/g, ' ').slice(0, 240);

  if (!normalizedArchiveReason) {
    return res.status(400).json({ error: 'Please select the reason for archiving this item.' });
  }

  if (normalizedArchiveReason === 'other' && !archiveReasonNote) {
    return res.status(400).json({ error: 'Please enter the reason for choosing Other.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inventorySnapshot = await client.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         p.category_note,
         p.supplier_name,
         p.default_selling_price,
         p.cost_price,
         bi.branch,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
         bi.average_daily_sales_mode,
         bi.manual_average_daily_sales,
         bi.average_daily_sales_override_reason,
         bi.status,
         bi.last_updated
       FROM branch_inventory bi
       INNER JOIN products p ON p.product_id = bi.product_id
       WHERE bi.inventory_id = $1 AND bi.branch = $2`,
      [id, req.user.branch]
    );

    if (inventorySnapshot.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const archivedItem = inventorySnapshot.rows[0];
    await client.query(
      `INSERT INTO archived_inventory (
         original_inventory_id,
         product_id,
         name,
         category,
         category_note,
         supplier_name,
         default_selling_price,
         cost_price,
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
         last_updated,
         archive_reason,
         archive_reason_note,
         archived_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
      [
        archivedItem.inventory_id,
        archivedItem.product_id,
        archivedItem.name,
        archivedItem.category,
        archivedItem.category_note,
        archivedItem.supplier_name,
        archivedItem.default_selling_price,
        archivedItem.cost_price,
        archivedItem.branch,
        archivedItem.stock_level,
        archivedItem.min_stock_level,
        archivedItem.lead_time_days,
        archivedItem.safety_stock,
        archivedItem.average_daily_sales,
        archivedItem.average_daily_sales_mode,
        archivedItem.manual_average_daily_sales,
        archivedItem.average_daily_sales_override_reason,
        archivedItem.status,
        archivedItem.last_updated,
        normalizedArchiveReason,
        archiveReasonNote || null,
        req.user.id
      ]
    );

    const inventoryResult = await client.query(
      `DELETE FROM branch_inventory
       WHERE inventory_id = $1 AND branch = $2
       RETURNING inventory_id, product_id`,
      [id, req.user.branch]
    );

    if (inventoryResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const productId = inventoryResult.rows[0].product_id;
    await client.query(
      `DELETE FROM products
       WHERE product_id = $1
         AND NOT EXISTS (
           SELECT 1
           FROM branch_inventory
           WHERE product_id = $1
         )`,
      [productId]
    );

    await recordAuditLog(client, {
      actorId: req.user.id,
      targetId: archivedItem.inventory_id,
      targetName: archivedItem.name,
      targetType: 'inventory_item',
      action: `ARCHIVE_ITEM: ${getArchiveReasonLabel(normalizedArchiveReason)}`,
      reason: normalizedArchiveReason === 'other' && archiveReasonNote
        ? `Other: ${archiveReasonNote}`
        : getArchiveReasonLabel(normalizedArchiveReason),
      details: {
        branch: archivedItem.branch,
        category: archivedItem.category,
        supplier: archivedItem.supplier_name || 'Unassigned',
        archiveReason: getArchiveReasonLabel(normalizedArchiveReason),
        archiveReasonNote: archiveReasonNote || null,
        quantityAtArchive: Number(archivedItem.stock_level || 0),
        reorderLevel: Number(archivedItem.min_stock_level || 0),
        leadTimeDays: Number(archivedItem.lead_time_days || 0),
        safetyStock: Number(archivedItem.safety_stock || 0),
        averageDailySales: Number(archivedItem.average_daily_sales || 0),
        recommendedReorderPoint: computeReorderPoint(archivedItem),
        status: archivedItem.status
      }
    });

    await client.query('COMMIT');
    return res.json({ message: 'Product archived/removed', product_id: id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Archive product error:', err);
    return res.status(500).json({ error: 'Failed to archive product' });
  } finally {
    client.release();
  }
});

app.post('/api/archive/:id/restore', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const archivedResult = await client.query(
      `SELECT
         archived_inventory_id,
         original_inventory_id,
         product_id,
         name,
         category,
         supplier_name,
         default_selling_price,
         cost_price,
         branch,
         stock_level,
         min_stock_level,
         lead_time_days,
         safety_stock,
         average_daily_sales,
         average_daily_sales_mode,
         manual_average_daily_sales,
         average_daily_sales_override_reason,
         status
       FROM archived_inventory
       WHERE archived_inventory_id = $1 AND branch = $2`,
      [id, req.user.branch]
    );

    if (archivedResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Archived item not found' });
    }

    const archivedItem = archivedResult.rows[0];
    const productId = await findOrCreateProduct(client, {
      name: archivedItem.name,
      category: canonicalizeInventoryCategory(archivedItem.category) || 'Other',
      categoryNote: archivedItem.category_note,
      supplierName: archivedItem.supplier_name,
      defaultSellingPrice: archivedItem.default_selling_price === null || archivedItem.default_selling_price === undefined
        ? null
        : Number(archivedItem.default_selling_price),
      costPrice: archivedItem.cost_price === null || archivedItem.cost_price === undefined
        ? null
        : Number(archivedItem.cost_price)
    });

    const existingInventory = await client.query(
      `SELECT inventory_id, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated
       FROM branch_inventory
       WHERE product_id = $1 AND branch = $2`,
      [productId, archivedItem.branch]
    );

    if (existingInventory.rowCount === 0) {
      const activeSimilarDuplicate = await findSimilarActiveInventoryItem(client, {
        branch: archivedItem.branch,
        name: archivedItem.name,
        category: canonicalizeInventoryCategory(archivedItem.category) || 'Other'
      });

      if (activeSimilarDuplicate) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `A similar active inventory item already exists: ${activeSimilarDuplicate.name}. Review the active item before restoring this archived copy.`
        });
      }
    }

    let restoredInventoryId;
    if (existingInventory.rowCount > 0) {
      const activeItem = existingInventory.rows[0];
      const isStaleArchiveConflict =
        Number(activeItem.stock_level || 0) === 0 &&
        activeItem.status === 'Out of Stock';

      if (!isStaleArchiveConflict) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'This archived item already exists as an active inventory item. Review the active item before restoring the archived copy.'
        });
      }

      const reconciled = await client.query(
        `UPDATE branch_inventory
         SET stock_level = $1,
             min_stock_level = $2,
             lead_time_days = $3,
             safety_stock = $4,
             average_daily_sales = $5,
             average_daily_sales_mode = $9,
             manual_average_daily_sales = $10,
             average_daily_sales_override_reason = $11,
             status = $6,
             last_updated = ${PHILIPPINE_NOW_SQL}
         WHERE inventory_id = $7 AND branch = $8
         RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, average_daily_sales_mode, manual_average_daily_sales, average_daily_sales_override_reason, status, last_updated`,
        [
          archivedItem.stock_level,
          archivedItem.min_stock_level,
          archivedItem.lead_time_days,
          archivedItem.safety_stock,
          archivedItem.average_daily_sales,
          computeInventoryStatus(Number(archivedItem.stock_level || 0), getEffectiveReorderThreshold(archivedItem)),
          activeItem.inventory_id,
          archivedItem.branch,
          normalizeAverageDailySalesMode(archivedItem.average_daily_sales_mode),
          archivedItem.manual_average_daily_sales,
          archivedItem.average_daily_sales_override_reason
        ]
      );
      restoredInventoryId = reconciled.rows[0].inventory_id;
    } else {
      const restored = await client.query(
        `INSERT INTO branch_inventory (
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ${PHILIPPINE_NOW_SQL})
         RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, average_daily_sales_mode, manual_average_daily_sales, average_daily_sales_override_reason, status, last_updated`,
        [
          productId,
          archivedItem.branch,
          archivedItem.stock_level,
          archivedItem.min_stock_level,
          archivedItem.lead_time_days,
          archivedItem.safety_stock,
          archivedItem.average_daily_sales,
          normalizeAverageDailySalesMode(archivedItem.average_daily_sales_mode),
          archivedItem.manual_average_daily_sales,
          archivedItem.average_daily_sales_override_reason,
          computeInventoryStatus(Number(archivedItem.stock_level || 0), getEffectiveReorderThreshold(archivedItem)),
        ]
      );
      restoredInventoryId = restored.rows[0].inventory_id;
    }

    if (archivedItem.original_inventory_id) {
      await client.query(
        `UPDATE stock_movements
         SET inventory_id = $1,
             product_id = $2
         WHERE inventory_id = $3
           AND branch = $4`,
        [restoredInventoryId, productId, archivedItem.original_inventory_id, archivedItem.branch]
      );
    }

    await client.query(
      `DELETE FROM archived_inventory
       WHERE archived_inventory_id = $1`,
      [id]
    );

    const merged = await client.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         p.category_note,
         p.supplier_name,
         p.default_selling_price,
         p.cost_price,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
         bi.average_daily_sales_mode,
         bi.manual_average_daily_sales,
         bi.average_daily_sales_override_reason,
         bi.status,
         bi.branch,
         bi.last_updated
       FROM branch_inventory bi
       INNER JOIN products p ON p.product_id = bi.product_id
       WHERE bi.inventory_id = $1`,
      [restoredInventoryId]
    );

    await recordAuditLog(client, {
      actorId: req.user.id,
      targetId: restoredInventoryId,
      targetName: archivedItem.name,
      targetType: 'inventory_item',
      action: 'RESTORE_ITEM',
      reason: 'Archived item restored to active inventory.',
      details: {
        branch: archivedItem.branch,
        category: archivedItem.category,
        supplier: archivedItem.supplier_name || 'Unassigned',
        restoredFromArchiveId: Number(id),
        quantityRestored: Number(archivedItem.stock_level || 0),
        reorderLevel: Number(archivedItem.min_stock_level || 0),
        leadTimeDays: Number(archivedItem.lead_time_days || 0),
        safetyStock: Number(archivedItem.safety_stock || 0),
        averageDailySales: Number(archivedItem.average_daily_sales || 0),
        recommendedReorderPoint: computeReorderPoint(archivedItem)
      }
    });

    await client.query('COMMIT');
    return res.json({ product: mapInventoryRow(merged.rows[0], { includeCostPrice: true }) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Restore archived product error:', err);
    return res.status(500).json({ error: 'Failed to restore archived product' });
  } finally {
    client.release();
  }
});

app.get('/api/maintenance/backup', authenticate, requireAdmin, async (req, res) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  execFile(
    getPostgresToolPath('PG_DUMP_PATH', 'pg_dump'),
    ['--no-owner', '--no-privileges', '--format=plain', `--dbname=${dbUrl}`],
    async (err, stdout, stderr) => {
      if (err) {
        const details = stderr || getPostgresToolError(err, 'pg_dump');
        console.error('Backup failed:', details);
        return res.status(500).json({ error: 'Backup failed', details });
      }

      const logResults = await Promise.allSettled([
        pool.query(
          `INSERT INTO backup_logs (action, actor_id, actor_name)
           VALUES ($1, $2, (SELECT full_name FROM users WHERE user_id = $2))`,
          ['backup', req.user.id]
        ),
        recordAuditLog(pool, {
          actorId: req.user.id,
          targetName: 'Database Backup',
          action: 'CREATE_BACKUP'
        }),
        recordSystemLog(pool, {
          eventType: 'DATABASE_BACKUP',
          severity: 'info',
          message: 'Database backup was generated.',
          context: { delivery: 'download' },
          actorId: req.user.id
        })
      ]);
      logResults
        .filter(result => result.status === 'rejected')
        .forEach(result => {
          console.error('Backup log write failed:', result.reason?.message || result.reason);
        });

      res.setHeader('Content-disposition', `attachment; filename=backup_${Date.now()}.sql`);
      res.setHeader('Content-Type', 'application/sql');
      return res.send(stdout);
    }
  );
});

app.post('/api/maintenance/clear-logs', authenticate, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cleanupResult = await client.query(
      `DELETE FROM system_logs
       WHERE is_security = false
         AND severity IN ('debug', 'info')
         AND created_at < (${PHILIPPINE_NOW_SQL} - ($1::int * INTERVAL '1 day'))
       RETURNING id`,
      [SYSTEM_LOG_RETENTION_DAYS]
    );

    await recordSystemLog(client, {
      eventType: 'SYSTEM_LOG_CLEANUP',
      severity: 'info',
      message: cleanupResult.rowCount > 0
        ? `Cleared ${cleanupResult.rowCount} eligible non-critical system log(s).`
        : 'System log cleanup completed with no eligible records.',
      context: {
        clearedCount: cleanupResult.rowCount,
        retentionDays: SYSTEM_LOG_RETENTION_DAYS,
        criteria: 'non-security debug/info logs older than retention window'
      },
      actorId: req.user.id
    });

    await recordAuditLog(client, {
      actorId: req.user.id,
      targetName: 'System Logs',
      action: cleanupResult.rowCount > 0
        ? `CLEAR_LOGS: ${cleanupResult.rowCount} removed`
        : 'CLEAR_LOGS: no eligible records'
    });

    await client.query('COMMIT');

    const clearedCount = cleanupResult.rowCount;
    return res.json({
      message: clearedCount > 0
        ? 'Old non-critical system logs cleared successfully.'
        : `No eligible non-critical logs older than ${SYSTEM_LOG_RETENTION_DAYS} days were found to clear.`,
      clearedCount,
      retentionDays: SYSTEM_LOG_RETENTION_DAYS
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Clear logs error:', err);
    return res.status(500).json({ error: 'Failed to clear logs' });
  } finally {
    client.release();
  }
});

app.post('/api/maintenance/optimize', authenticate, requireAdmin, async (req, res) => {
  const tables = [
    'schema_migrations',
    'users',
    'products',
    'branch_inventory',
    'stock_movements',
    'sales_transactions',
    'sales_items',
    'purchase_transactions',
    'purchase_items',
    'archived_inventory',
    'audit_logs',
    'backup_logs',
    'system_logs'
  ];

  try {
    for (const table of tables) {
      await pool.query(`ANALYZE ${table}`);
    }

    await recordAuditLogSafely(pool, {
      actorId: req.user.id,
      targetName: 'Database Optimization',
      action: 'OPTIMIZE_DATABASE'
    });
    await recordSystemLog(pool, {
      eventType: 'DATABASE_OPTIMIZATION',
      severity: 'info',
      message: 'Database table statistics were refreshed.',
      context: { analyzedTables: tables },
      actorId: req.user.id
    });

    return res.json({
      message: 'Database optimized successfully.',
      analyzedTables: tables
    });
  } catch (err) {
    console.error('Optimize database error:', err);
    return res.status(500).json({ error: 'Optimization failed' });
  }
});

app.post('/api/maintenance/integrity-check', authenticate, requireAdmin, async (req, res) => {
  try {
    const scopeBranch = req.user.branch;
    const [
      duplicateInventory,
      invalidInventory,
      missingProducts,
      orphanMovements,
      activeArchivedConflicts,
      invalidUsers,
      invalidSalesTransactions,
      invalidSalesItems,
      duplicateProductCatalogItems,
      incompleteProductDetails,
      invalidArchivedInventory,
      orphanSalesItems,
      invalidSalesItemLinks,
      salesTotalMismatches,
      invalidPurchaseTransactions,
      invalidPurchaseItems,
      orphanPurchaseItems,
      invalidPurchaseItemLinks,
      purchaseTotalMismatches,
      purchaseMovementMismatches,
      orphanAuditLogs,
      orphanSystemLogs,
      orphanBackupLogs
    ] = await Promise.all([
      pool.query(
        `SELECT branch, product_id, COUNT(*)::int AS count
         FROM branch_inventory
         WHERE branch = $1
         GROUP BY branch, product_id
         HAVING COUNT(*) > 1`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT bi.inventory_id, p.name, bi.branch, bi.stock_level, bi.min_stock_level, bi.status
         FROM branch_inventory bi
         INNER JOIN products p ON p.product_id = bi.product_id
         WHERE bi.branch = $1
           AND (
             bi.stock_level < 0
             OR bi.min_stock_level < 0
             OR bi.lead_time_days < 0
             OR bi.safety_stock < 0
             OR bi.average_daily_sales < 0
             OR bi.status IS NULL
             OR TRIM(bi.status) = ''
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT DISTINCT p.product_id
         FROM products p
         INNER JOIN branch_inventory bi ON bi.product_id = p.product_id
         WHERE bi.branch = $1
           AND (
             p.name IS NULL
             OR TRIM(p.name) = ''
             OR p.category IS NULL
             OR TRIM(p.category) = ''
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT sm.movement_id
         FROM stock_movements sm
         LEFT JOIN branch_inventory bi ON bi.inventory_id = sm.inventory_id
         LEFT JOIN archived_inventory ai
           ON ai.original_inventory_id = sm.inventory_id
          AND ai.branch = sm.branch
         WHERE sm.inventory_id IS NOT NULL
           AND sm.branch = $1
           AND bi.inventory_id IS NULL
           AND ai.archived_inventory_id IS NULL`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT ai.archived_inventory_id, ai.name, ai.category, ai.branch
         FROM archived_inventory ai
         INNER JOIN products p
           ON LOWER(TRIM(p.name)) = LOWER(TRIM(ai.name))
          AND LOWER(TRIM(p.category)) = LOWER(TRIM(ai.category))
         INNER JOIN branch_inventory bi
           ON bi.product_id = p.product_id
          AND bi.branch = ai.branch
         WHERE ai.branch = $1`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT user_id, username, role, branch, status
         FROM users
         WHERE (
             branch = $1
             OR (role IN ('Cashier', 'Inventory Staff') AND (branch IS NULL OR TRIM(branch) = ''))
           )
           AND (
             role NOT IN ('Admin', 'Cashier', 'Inventory Staff')
             OR status NOT IN ('Active', 'Pending', 'Inactive', 'Rejected')
             OR (role IN ('Cashier', 'Inventory Staff') AND (branch IS NULL OR TRIM(branch) = ''))
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT sales_transaction_id, sales_number, official_invoice_number, official_invoice_expected_number, branch, status, transaction_type, total_quantity, subtotal_amount, discount_amount, total_amount, payment_method, change_amount
         FROM sales_transactions
         WHERE branch = $1
           AND (
             (transaction_type <> 'refund' AND total_quantity < 0)
             OR (transaction_type <> 'refund' AND subtotal_amount < 0)
             OR discount_amount < 0
             OR (transaction_type <> 'refund' AND total_amount < 0)
             OR (transaction_type = 'refund' AND total_amount >= 0)
             OR change_amount < 0
             OR (transaction_type <> 'refund' AND discount_amount > subtotal_amount)
             OR payment_method NOT IN ('cash', 'gcash', 'bank_transfer', 'credit')
             OR status NOT IN ('completed', 'cancelled')
             OR transaction_type NOT IN ('sale', 'refund')
             OR sales_number IS NULL
             OR TRIM(sales_number) = ''
             OR (transaction_type <> 'refund' AND (
                  official_invoice_number IS NULL
                  OR TRIM(official_invoice_number) = ''
                  OR official_invoice_number !~ $2
                  OR official_invoice_expected_number IS NULL
                  OR TRIM(official_invoice_expected_number) = ''
                  OR official_invoice_expected_number !~ $2
                ))
             OR (transaction_type = 'refund' AND (
                  official_invoice_number IS NOT NULL
                  OR official_invoice_expected_number IS NOT NULL
                  OR official_invoice_exception_reason IS NOT NULL
                ))
           )`,
        [scopeBranch, SALES_INVOICE_NUMBER_PATTERN]
      ),
      pool.query(
        `SELECT si.sales_item_id, st.sales_number, si.item_name, si.quantity_sold, si.unit_price, si.unit_cost_at_sale, si.subtotal, si.cost_subtotal, si.gross_profit
         FROM sales_items si
         INNER JOIN sales_transactions st
           ON st.sales_transaction_id = si.sales_transaction_id
         WHERE st.branch = $1
           AND (
             (st.transaction_type <> 'refund' AND si.quantity_sold <= 0)
             OR (st.transaction_type = 'refund' AND si.quantity_sold >= 0)
             OR si.unit_price < 0
             OR si.unit_cost_at_sale < 0
             OR (st.transaction_type <> 'refund' AND si.subtotal < 0)
             OR (st.transaction_type = 'refund' AND si.subtotal >= 0)
             OR ABS(si.cost_subtotal - ROUND((si.quantity_sold * si.unit_cost_at_sale)::numeric, 2)) > 0.01
             OR ABS(si.gross_profit - ROUND((si.subtotal - si.cost_subtotal)::numeric, 2)) > 0.01
             OR si.previous_quantity < 0
             OR si.new_quantity < 0
             OR si.item_type NOT IN ('inventory', 'non_inventory')
             OR si.branch <> st.branch
             OR si.item_name IS NULL
             OR TRIM(si.item_name) = ''
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT LOWER(TRIM(p.name)) AS normalized_name, LOWER(TRIM(p.category)) AS normalized_category, COUNT(*)::int AS count
         FROM products p
         INNER JOIN branch_inventory bi ON bi.product_id = p.product_id
         WHERE bi.branch = $1
         GROUP BY LOWER(TRIM(p.name)), LOWER(TRIM(p.category))
         HAVING COUNT(*) > 1`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT DISTINCT p.product_id, p.name, p.category, p.category_note, p.supplier_name, p.default_selling_price, p.cost_price
         FROM products p
         INNER JOIN branch_inventory bi ON bi.product_id = p.product_id
         WHERE bi.branch = $1
           AND (
             p.supplier_name IS NULL
             OR TRIM(p.supplier_name) = ''
             OR p.default_selling_price IS NULL
             OR p.default_selling_price <= 0
             OR p.default_selling_price > 100000000
             OR p.cost_price < 0
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT archived_inventory_id, name, category, branch, stock_level, min_stock_level, default_selling_price, cost_price
         FROM archived_inventory
         WHERE branch = $1
           AND (
             stock_level < 0
             OR min_stock_level < 0
             OR name IS NULL
             OR TRIM(name) = ''
             OR category IS NULL
             OR TRIM(category) = ''
             OR default_selling_price < 0
             OR cost_price < 0
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT si.sales_item_id
         FROM sales_items si
         LEFT JOIN sales_transactions st ON st.sales_transaction_id = si.sales_transaction_id
         WHERE st.sales_transaction_id IS NULL`
      ),
      pool.query(
        `SELECT si.sales_item_id, st.sales_number, si.item_type, si.inventory_id, si.product_id, si.item_name
         FROM sales_items si
         INNER JOIN sales_transactions st ON st.sales_transaction_id = si.sales_transaction_id
         LEFT JOIN branch_inventory bi
           ON bi.inventory_id = si.inventory_id
          AND bi.branch = st.branch
         LEFT JOIN products p ON p.product_id = si.product_id
         WHERE st.branch = $1
           AND (
             (si.item_type = 'inventory' AND (si.inventory_id IS NULL OR bi.inventory_id IS NULL OR si.product_id IS NULL OR p.product_id IS NULL))
             OR (si.item_type = 'non_inventory' AND (si.is_inventory_item = true OR si.inventory_id IS NOT NULL OR si.product_id IS NOT NULL))
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT st.sales_transaction_id, st.sales_number, st.total_quantity, st.subtotal_amount, st.discount_amount, st.delivery_charge, st.total_amount,
                COALESCE(SUM(si.quantity_sold), 0)::int AS item_quantity,
                COALESCE(ROUND(SUM(si.subtotal)::numeric, 2), 0)::numeric AS item_subtotal
         FROM sales_transactions st
         LEFT JOIN sales_items si ON si.sales_transaction_id = st.sales_transaction_id
         WHERE st.branch = $1
         GROUP BY st.sales_transaction_id
         HAVING st.total_quantity <> COALESCE(SUM(si.quantity_sold), 0)::int
            OR ABS(st.subtotal_amount - COALESCE(ROUND(SUM(si.subtotal)::numeric, 2), 0)) > 0.01
            OR ABS(st.total_amount - ROUND((st.subtotal_amount - st.discount_amount + st.delivery_charge)::numeric, 2)) > 0.01`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT purchase_transaction_id, purchase_number, branch, supplier_name, document_type, payment_terms, subtotal_amount, total_quantity, status
         FROM purchase_transactions
         WHERE branch = $1
           AND (
             purchase_number IS NULL
             OR TRIM(purchase_number) = ''
             OR supplier_name IS NULL
             OR TRIM(supplier_name) = ''
             OR document_type NOT IN ('DR', 'SI', 'OR', 'OTHER')
             OR payment_terms NOT IN ('cash', 'cod', 'credit', 'branch_transfer')
             OR subtotal_amount < 0
             OR total_quantity < 0
             OR status NOT IN ('completed', 'cancelled')
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT pi.purchase_item_id, pt.purchase_number, pi.item_name, pi.quantity_received, pi.unit_cost, pi.subtotal, pi.previous_quantity, pi.new_quantity
         FROM purchase_items pi
         INNER JOIN purchase_transactions pt ON pt.purchase_transaction_id = pi.purchase_transaction_id
         WHERE pt.branch = $1
           AND (
             pi.branch <> pt.branch
             OR pi.quantity_received <= 0
             OR pi.unit_cost < 0
             OR pi.subtotal < 0
             OR pi.previous_quantity < 0
             OR pi.new_quantity < 0
             OR pi.new_quantity <> pi.previous_quantity + pi.quantity_received
             OR ABS(pi.subtotal - ROUND((pi.quantity_received * pi.unit_cost)::numeric, 2)) > 0.01
             OR pi.item_name IS NULL
             OR TRIM(pi.item_name) = ''
             OR pi.category IS NULL
             OR TRIM(pi.category) = ''
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT pi.purchase_item_id
         FROM purchase_items pi
         LEFT JOIN purchase_transactions pt ON pt.purchase_transaction_id = pi.purchase_transaction_id
         WHERE pt.purchase_transaction_id IS NULL`
      ),
      pool.query(
        `SELECT pi.purchase_item_id, pt.purchase_number, pi.inventory_id, pi.product_id, pi.item_name
         FROM purchase_items pi
         INNER JOIN purchase_transactions pt ON pt.purchase_transaction_id = pi.purchase_transaction_id
         LEFT JOIN branch_inventory bi
           ON bi.inventory_id = pi.inventory_id
          AND bi.branch = pt.branch
         LEFT JOIN products p ON p.product_id = pi.product_id
         WHERE pt.branch = $1
           AND (
             pi.inventory_id IS NULL
             OR bi.inventory_id IS NULL
             OR pi.product_id IS NULL
             OR p.product_id IS NULL
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT pt.purchase_transaction_id, pt.purchase_number, pt.total_quantity, pt.subtotal_amount,
                COALESCE(SUM(pi.quantity_received), 0)::int AS item_quantity,
                COALESCE(ROUND(SUM(pi.subtotal)::numeric, 2), 0)::numeric AS item_subtotal
         FROM purchase_transactions pt
         LEFT JOIN purchase_items pi ON pi.purchase_transaction_id = pt.purchase_transaction_id
         WHERE pt.branch = $1
         GROUP BY pt.purchase_transaction_id
         HAVING pt.total_quantity <> COALESCE(SUM(pi.quantity_received), 0)::int
            OR ABS(pt.subtotal_amount - COALESCE(ROUND(SUM(pi.subtotal)::numeric, 2), 0)) > 0.01`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT pi.purchase_item_id, pt.purchase_number, pi.inventory_id, pi.quantity_received, pi.previous_quantity, pi.new_quantity
         FROM purchase_items pi
         INNER JOIN purchase_transactions pt ON pt.purchase_transaction_id = pi.purchase_transaction_id
         LEFT JOIN stock_movements sm
           ON sm.inventory_id = pi.inventory_id
          AND sm.product_id = pi.product_id
          AND sm.branch = pt.branch
          AND sm.action = 'stock_in'
          AND sm.reason = 'purchase_received'
          AND sm.quantity_changed = pi.quantity_received
          AND sm.previous_quantity = pi.previous_quantity
          AND sm.new_quantity = pi.new_quantity
          AND sm.note ILIKE '%' || pt.purchase_number || '%'
         WHERE pt.branch = $1
           AND pt.status = 'completed'
           AND sm.movement_id IS NULL`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT al.id, al.actor_id
         FROM audit_logs al
         LEFT JOIN users u ON u.user_id = al.actor_id
         WHERE al.actor_id IS NOT NULL
           AND u.user_id IS NULL`
      ),
      pool.query(
        `SELECT sl.id, sl.actor_id
         FROM system_logs sl
         LEFT JOIN users u ON u.user_id = sl.actor_id
         WHERE sl.actor_id IS NOT NULL
           AND u.user_id IS NULL`
      ),
      pool.query(
        `SELECT bl.id, bl.actor_id
         FROM backup_logs bl
         LEFT JOIN users u ON u.user_id = bl.actor_id
         WHERE bl.actor_id IS NOT NULL
           AND u.user_id IS NULL`
      )
    ]);

    const inventoryStatusResult = await pool.query(
      `SELECT
         bi.inventory_id,
         p.name,
         bi.branch,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
         bi.status
       FROM branch_inventory bi
       INNER JOIN products p ON p.product_id = bi.product_id
       WHERE bi.branch = $1`,
      [scopeBranch]
    );

    const statusMismatches = inventoryStatusResult.rows.filter(row => (
      row.status !== computeInventoryStatus(Number(row.stock_level || 0), getEffectiveReorderThreshold(row))
    ));

    const checks = [
      {
        key: 'duplicate_inventory',
        label: 'Duplicate inventory records',
        count: duplicateInventory.rowCount
      },
      {
        key: 'invalid_inventory_values',
        label: 'Invalid stock or reorder values',
        count: invalidInventory.rowCount
      },
      {
        key: 'missing_product_fields',
        label: 'Products with missing name or category',
        count: missingProducts.rowCount
      },
      {
        key: 'duplicate_product_catalog_items',
        label: 'Duplicate product names/categories in active inventory',
        count: duplicateProductCatalogItems.rowCount
      },
      {
        key: 'incomplete_product_details',
        label: 'Active products with missing supplier, SRP, or invalid price details',
        count: incompleteProductDetails.rowCount
      },
      {
        key: 'orphan_stock_movements',
        label: 'Stock movements linked to missing inventory records',
        count: orphanMovements.rowCount
      },
      {
        key: 'invalid_archived_inventory',
        label: 'Archived inventory records with invalid item or price details',
        count: invalidArchivedInventory.rowCount
      },
      {
        key: 'active_archived_conflicts',
        label: 'Archived records that also exist in active inventory',
        count: activeArchivedConflicts.rowCount
      },
      {
        key: 'invalid_users',
        label: 'Users with invalid role, status, or branch',
        count: invalidUsers.rowCount
      },
      {
        key: 'invalid_sales_transactions',
        label: 'Sales records with invalid totals, status, or invoice/transaction number',
        count: invalidSalesTransactions.rowCount
      },
      {
        key: 'invalid_sales_items',
        label: 'Sales line items with invalid quantity, amount, or item details',
        count: invalidSalesItems.rowCount
      },
      {
        key: 'orphan_sales_items',
        label: 'Sales line items without a parent sales transaction',
        count: orphanSalesItems.rowCount
      },
      {
        key: 'invalid_sales_item_links',
        label: 'Sales line items with incorrect inventory/manual item links',
        count: invalidSalesItemLinks.rowCount
      },
      {
        key: 'sales_total_mismatches',
        label: 'Sales records where totals do not match item lines',
        count: salesTotalMismatches.rowCount
      },
      {
        key: 'invalid_purchase_transactions',
        label: 'Purchase records with invalid supplier, terms, status, or totals',
        count: invalidPurchaseTransactions.rowCount
      },
      {
        key: 'invalid_purchase_items',
        label: 'Purchase line items with invalid quantity, cost, subtotal, or stock impact',
        count: invalidPurchaseItems.rowCount
      },
      {
        key: 'orphan_purchase_items',
        label: 'Purchase line items without a parent purchase record',
        count: orphanPurchaseItems.rowCount
      },
      {
        key: 'invalid_purchase_item_links',
        label: 'Purchase line items linked to missing inventory or product records',
        count: invalidPurchaseItemLinks.rowCount
      },
      {
        key: 'purchase_total_mismatches',
        label: 'Purchase records where totals do not match item lines',
        count: purchaseTotalMismatches.rowCount
      },
      {
        key: 'purchase_movement_mismatches',
        label: 'Completed purchase items without matching stock-in movement records',
        count: purchaseMovementMismatches.rowCount
      },
      {
        key: 'orphan_audit_logs',
        label: 'Audit logs linked to missing user accounts',
        count: orphanAuditLogs.rowCount
      },
      {
        key: 'orphan_system_logs',
        label: 'System logs linked to missing user accounts',
        count: orphanSystemLogs.rowCount
      },
      {
        key: 'orphan_backup_logs',
        label: 'Backup logs linked to missing user accounts',
        count: orphanBackupLogs.rowCount
      },
      {
        key: 'status_mismatches',
        label: 'Inventory records with inconsistent stock status',
        count: statusMismatches.length
      }
    ];

    const issueCount = checks.reduce((total, check) => total + check.count, 0);

    await recordAuditLogSafely(pool, {
      actorId: req.user.id,
      targetName: 'Data Integrity Check',
      action: issueCount > 0 ? `CHECK_DATA_INTEGRITY: ${issueCount} issue(s)` : 'CHECK_DATA_INTEGRITY: no issues'
    });
    await recordSystemLog(pool, {
      eventType: 'DATA_INTEGRITY_CHECK',
      severity: issueCount > 0 ? 'warning' : 'info',
      message: issueCount > 0
        ? `Data integrity check found ${issueCount} issue(s).`
        : 'Data integrity check completed with no issues.',
      context: { issueCount, checks, scopeBranch },
      actorId: req.user.id
    });

    return res.json({
      message: issueCount > 0
        ? 'Current branch data integrity check completed with issues.'
        : 'No current branch data integrity issues found.',
      issueCount,
      checks,
      scopeBranch,
      checkedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Integrity check error:', err);
    return res.status(500).json({ error: 'Data integrity check failed' });
  }
});

app.post(
  '/api/maintenance/restore',
  authenticate,
  requireAdmin,
  express.raw({ type: 'application/sql', limit: '10mb' }),
  async (req, res) => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return res.status(500).json({ error: 'DATABASE_URL not set' });
    }

    if (!req.body || !req.body.length) {
      return res.status(400).json({ error: 'No SQL file uploaded' });
    }

    const tempFile = path.join(os.tmpdir(), `restore_${Date.now()}.sql`);

    try {
      const uploadedSql = req.body.toString('utf8');
      const validationError = getRestoreValidationError(uploadedSql);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      fs.writeFileSync(tempFile, buildRestoreScript(uploadedSql));
      execFile(
        getPostgresToolPath('PSQL_PATH', 'psql'),
        ['--dbname', dbUrl, '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', tempFile],
        async (err, stdout, stderr) => {
          try {
            fs.unlinkSync(tempFile);
          } catch (unlinkErr) {
            console.error('Failed to remove temp restore file:', unlinkErr.message);
          }

          if (err) {
            const details = stderr || getPostgresToolError(err, 'psql');
            console.error('Restore failed:', details);
            return res.status(500).json({ error: 'Restore failed', details });
          }

          try {
            await ensureSchema();
          } catch (schemaErr) {
            console.error('Post-restore schema initialization failed:', schemaErr.message);
            return res.status(500).json({
              error: 'Restore completed, but schema initialization failed',
              details: schemaErr.message
            });
          }

          const logResults = await Promise.allSettled([
            pool.query(
              `INSERT INTO backup_logs (action, actor_id, actor_name)
               VALUES ($1, $2, (SELECT full_name FROM users WHERE user_id = $2))`,
              ['restore', req.user.id]
            ),
            recordAuditLog(pool, {
              actorId: req.user.id,
              targetName: 'Database Restore',
              action: 'RESTORE_DATABASE'
            }),
            recordSystemLog(pool, {
              eventType: 'DATABASE_RESTORE',
              severity: 'warning',
              message: 'Database restore completed from an uploaded SQL backup.',
              context: { source: 'uploaded_sql_backup' },
              actorId: req.user.id
            })
          ]);
          logResults
            .filter(result => result.status === 'rejected')
            .forEach(result => {
              console.error('Restore log write failed:', result.reason?.message || result.reason);
            });

          return res.json({ message: 'Database restored successfully', output: stdout });
        }
      );
    } catch (err) {
      console.error('Restore write failed:', err);
      return res.status(500).json({ error: 'Restore failed', details: err.message });
    }
  }
);

async function start() {
  try {
    await ensureSchema();
    console.log('Connected to PostgreSQL database');
  } catch (err) {
    console.error('Database initialization error:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
