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
const ALLOWED_ROLES = ['Admin', 'Employee'];
const ALLOWED_BRANCHES = ['Manggahan', 'San Rafael'];
const OFFICIAL_INVENTORY_CATEGORIES = [
  'Tools',
  'Paint',
  'Cement',
  'Construction',
  'Electrical',
  'Plumbing',
  'Hardware',
  'Fasteners',
  'Lumber',
  'Safety',
  'Other'
];
const CATEGORY_ALIASES = {
  tool: 'Tools',
  tools: 'Tools',
  tooling: 'Tools',
  paint: 'Paint',
  paints: 'Paint',
  cement: 'Cement',
  cements: 'Cement',
  construction: 'Construction',
  electrical: 'Electrical',
  electric: 'Electrical',
  plumbing: 'Plumbing',
  plumber: 'Plumbing',
  hardware: 'Hardware',
  fastener: 'Fasteners',
  fasteners: 'Fasteners',
  screw: 'Fasteners',
  screws: 'Fasteners',
  nail: 'Fasteners',
  nails: 'Fasteners',
  lumber: 'Lumber',
  wood: 'Lumber',
  safety: 'Safety',
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
    CREATE TABLE IF NOT EXISTS users (
      user_id SERIAL PRIMARY KEY,
      full_name VARCHAR(100) NOT NULL,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) CHECK (role IN ('Admin', 'Employee')) NOT NULL,
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      product_id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      category VARCHAR(50) NOT NULL,
      supplier_name VARCHAR(120),
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
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL}
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_transactions (
      sales_transaction_id SERIAL PRIMARY KEY,
      sales_number VARCHAR(40) UNIQUE NOT NULL,
      branch VARCHAR(50) NOT NULL,
      customer_type VARCHAR(40) DEFAULT 'walk_in' CHECK (customer_type IN ('walk_in', 'regular', 'contractor')),
      total_quantity INTEGER NOT NULL DEFAULT 0,
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
      sold_by INT REFERENCES users(user_id) ON DELETE SET NULL,
      sold_by_name TEXT,
      remarks TEXT,
      created_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      cancelled_at TIMESTAMP,
      cancelled_by INT REFERENCES users(user_id) ON DELETE SET NULL,
      cancel_reason TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sales_items (
      sales_item_id SERIAL PRIMARY KEY,
      sales_transaction_id INT NOT NULL REFERENCES sales_transactions(sales_transaction_id) ON DELETE CASCADE,
      inventory_id INT,
      product_id INT,
      item_name VARCHAR(150) NOT NULL,
      category VARCHAR(50) NOT NULL,
      branch VARCHAR(50) NOT NULL,
      quantity_sold INTEGER NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
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
      branch VARCHAR(50) NOT NULL,
      stock_level INTEGER DEFAULT 0,
      min_stock_level INTEGER DEFAULT 5,
      lead_time_days INTEGER,
      safety_stock INTEGER,
      average_daily_sales NUMERIC(10,2),
      status VARCHAR(20) DEFAULT 'In Stock',
      supplier_name VARCHAR(120),
      last_updated TIMESTAMP,
      archived_at TIMESTAMP DEFAULT ${PHILIPPINE_NOW_SQL},
      archive_reason VARCHAR(40),
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
    ADD COLUMN IF NOT EXISTS reason VARCHAR(40);
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ALTER COLUMN created_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE sales_transactions
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
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
    ALTER TABLE archived_inventory
    ALTER COLUMN archived_at SET DEFAULT ${PHILIPPINE_NOW_SQL};
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS archive_reason VARCHAR(40);
  `);

  await pool.query(`
    ALTER TABLE archived_inventory
    ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(120);
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
  } catch (err) {
    console.error('Email send failed:', err.message);
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
  const reorderPoint = computeReorderPoint({
    averageDailySales: row.average_daily_sales ?? row.averageDailySales,
    leadTimeDays: row.lead_time_days ?? row.leadTimeDays,
    safetyStock: row.safety_stock ?? row.safetyStock
  });
  return reorderPoint !== null ? reorderPoint : Number(row.min_stock_level ?? row.minStockLevel ?? 0);
}

function computeSuggestedOrderQuantity(row) {
  return Math.max(0, getEffectiveReorderThreshold(row) - Number(row.stock_level || 0));
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

function getMeaningfulInventoryNameTokens(value) {
  return getInventoryIdentityTokens(value).filter(token => /[a-z0-9]/.test(token));
}

function validateInventoryNameQuality(value) {
  const cleanName = cleanInventoryName(value);
  if (!cleanName) return 'Valid product name and category are required';
  if (cleanName.length > 150) return 'Item name must be 150 characters or less';
  if (!/[a-z0-9]/i.test(cleanName)) return 'Item name must include letters or numbers';

  const tokens = getMeaningfulInventoryNameTokens(cleanName);
  if (tokens.length < 2) {
    return 'Include the item size or specification, such as "Claw Hammer 16 oz."';
  }

  return null;
}

function canonicalizeInventoryCategory(value) {
  const normalized = normalizeInventoryText(value);
  return CATEGORY_ALIASES[normalized] || null;
}

function parseNonNegativeInteger(value, fieldName, { max = null } = {}) {
  const normalizedValue = value === '' || value === null || value === undefined ? 0 : Number(value);

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
  const normalizedValue = value === '' || value === null || value === undefined ? 0 : Number(value);

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

async function findProductByIdentity(client, { name, category }) {
  const canonicalCategory = canonicalizeInventoryCategory(category);
  const cleanName = cleanInventoryName(name);
  if (!canonicalCategory || !cleanName) return null;
  const normalizedIdentityName = normalizeInventoryIdentityName(cleanName);

  const existing = await client.query(
    `SELECT product_id, name, category, supplier_name
     FROM products
     WHERE LOWER(category) = LOWER($1)`,
    [canonicalCategory]
  );

  return existing.rows.find(row => normalizeInventoryIdentityName(row.name) === normalizedIdentityName) || null;
}

async function findOrCreateProduct(client, { name, category, supplierName = null }) {
  const canonicalCategory = canonicalizeInventoryCategory(category);
  const cleanName = cleanInventoryName(name);
  const cleanSupplier = cleanSupplierName(supplierName);
  if (!canonicalCategory) {
    const error = new Error('Invalid inventory category');
    error.statusCode = 400;
    throw error;
  }

  const existing = await findProductByIdentity(client, { name: cleanName, category: canonicalCategory });

  if (existing) {
    if (cleanSupplier && cleanSupplier !== existing.supplier_name) {
      await client.query(
        `UPDATE products
         SET supplier_name = $1
         WHERE product_id = $2`,
        [cleanSupplier, existing.product_id]
      );
    }
    return existing.product_id;
  }

  const inserted = await client.query(
    `INSERT INTO products (name, category, supplier_name)
     VALUES ($1, $2, $3)
     RETURNING product_id`,
    [cleanName, canonicalCategory, cleanSupplier]
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

function mapInventoryRow(row) {
  return {
    inventory_id: row.inventory_id,
    product_id: row.product_id,
    name: row.name,
    category: row.category,
    supplier_name: row.supplier_name,
    stock_level: row.stock_level,
    min_stock_level: row.min_stock_level,
    lead_time_days: row.lead_time_days,
    safety_stock: row.safety_stock,
    average_daily_sales: row.average_daily_sales,
    recommended_reorder_point: computeReorderPoint(row),
    active_low_stock_threshold: getEffectiveReorderThreshold(row),
    suggested_order_quantity: computeSuggestedOrderQuantity(row),
    status: computeInventoryStatus(Number(row.stock_level || 0), getEffectiveReorderThreshold(row)),
    branch: row.branch,
    last_updated: row.last_updated
  };
}

function mapArchivedInventoryRow(row) {
  return {
    archived_inventory_id: row.archived_inventory_id,
    original_inventory_id: row.original_inventory_id,
    product_id: row.product_id,
    name: row.name,
    category: row.category,
    supplier_name: row.supplier_name,
    stock_level: row.stock_level,
    min_stock_level: row.min_stock_level,
    lead_time_days: row.lead_time_days,
    safety_stock: row.safety_stock,
    average_daily_sales: row.average_daily_sales,
    recommended_reorder_point: computeReorderPoint(row),
    active_low_stock_threshold: getEffectiveReorderThreshold(row),
    suggested_order_quantity: computeSuggestedOrderQuantity(row),
    status: computeInventoryStatus(Number(row.stock_level || 0), getEffectiveReorderThreshold(row)),
    branch: row.branch,
    last_updated: row.last_updated,
    archive_reason: row.archive_reason,
    archived_at: row.archived_at
  };
}

function mapStockMovementRow(row) {
  return {
    movement_id: row.movement_id,
    inventory_id: row.inventory_id,
    product_id: row.product_id,
    item_name: row.item_name,
    category: row.category,
    branch: row.branch,
    action: row.action,
    quantity_changed: row.quantity_changed,
    previous_quantity: row.previous_quantity,
    new_quantity: row.new_quantity,
    reason: row.reason,
    note: row.note,
    actor_id: row.actor_id,
    actor_name: row.actor_name,
    created_at: row.created_at
  };
}

function mapSalesTransactionRow(row) {
  return {
    sales_transaction_id: row.sales_transaction_id,
    sales_number: row.sales_number,
    branch: row.branch,
    customer_type: row.customer_type,
    total_quantity: row.total_quantity,
    total_amount: row.total_amount,
    status: row.status,
    sold_by: row.sold_by,
    sold_by_name: row.sold_by_name,
    remarks: row.remarks,
    created_at: row.created_at,
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
    inventory_id: row.inventory_id,
    product_id: row.product_id,
    item_name: row.item_name,
    category: row.category,
    branch: row.branch,
    quantity_sold: row.quantity_sold,
    unit_price: row.unit_price,
    subtotal: row.subtotal,
    previous_quantity: row.previous_quantity,
    new_quantity: row.new_quantity,
    created_at: row.created_at
  };
}

const STOCK_OUT_REASONS = new Map([
  ['sales', 'Sales'],
  ['damaged', 'Damaged'],
  ['expired', 'Expired'],
  ['lost_missing', 'Lost/Missing'],
  ['manual_adjustment', 'Manual Adjustment'],
  ['branch_transfer', 'Branch Transfer'],
  ['correction', 'Correction']
]);

const STOCK_IN_REASONS = new Map([
  ['delivery_received', 'Delivery Received'],
  ['returned_item', 'Returned Item'],
  ['beginning_balance', 'Beginning Balance'],
  ['manual_adjustment', 'Manual Adjustment'],
  ['correction', 'Correction']
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
  actorId
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
       actor_name
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, (SELECT full_name FROM users WHERE user_id = $12))`,
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
      actorId
    ]
  );
}

async function generateSalesNumber(client) {
  const year = new Date().getFullYear();
  await client.query('LOCK TABLE sales_transactions IN EXCLUSIVE MODE');
  const result = await client.query(
    `SELECT COALESCE(MAX(sales_transaction_id), 0) + 1 AS next_number
     FROM sales_transactions`
  );
  const sequence = Number(result.rows[0]?.next_number || 1);
  return `SALE-${year}-${String(sequence).padStart(5, '0')}`;
}

async function refreshAverageDailySalesForInventory(client, inventoryId) {
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
  if (!firstSaleDate || totalSold <= 0) return;

  const firstDay = new Date(firstSaleDate);
  const today = new Date();
  const elapsedDays = Math.max(
    1,
    Math.ceil((today.setHours(0, 0, 0, 0) - firstDay.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)) + 1
  );
  const averageDailySales = Number((totalSold / Math.min(elapsedDays, 30)).toFixed(2));

  const inventoryResult = await client.query(
    `SELECT stock_level, min_stock_level, lead_time_days, safety_stock
     FROM branch_inventory
     WHERE inventory_id = $1
     FOR UPDATE`,
    [inventoryId]
  );

  if (inventoryResult.rowCount === 0) return null;

  const inventoryRow = inventoryResult.rows[0];
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

function normalizePasswordComparison(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

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
  return user && user.role === 'Admin';
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
        ${buildInfoCard('Role', role || 'Employee', 'security')}
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
    'create table public.users',
    'create table public.products',
    'create table public.branch_inventory'
  ];

  if (!requiredMarkers.every(marker => normalized.includes(marker))) {
    return 'The selected file does not look like a valid E.M. Cayetano PostgreSQL backup.';
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
    return res.status(403).json({ error: 'Admin access required' });
  }

  return next();
}

app.get('/', (req, res) => {
  res.send('E.M. Cayetano Trading API is Running');
});

app.post('/api/auth/register', async (req, res) => {
  const { fullName, username, email, password, branch } = req.body;
  const normalizedBranch = normalizeBranch(branch);

  if (!fullName || !username || !email || !password) {
    return res.status(400).json({ error: 'Missing required registration fields' });
  }

  if (!ALLOWED_BRANCHES.includes(normalizedBranch)) {
    return res.status(400).json({ error: 'Invalid branch selection' });
  }

  const passwordError = validatePasswordPolicy(password, { fullName, username, email });
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const safeRole = 'Employee';

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
      return res.status(403).json({ error: `Account is ${user.status}. Please contact an administrator.` });
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

app.post('/api/auth/send-otp', async (req, res) => {
  const { username } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const rateLimitKey = normalizeOtpRateLimitIdentifier('username', user.username);
    const rateLimit = checkOtpRateLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return res.status(429).json(rateLimit);
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
  const username = req.body.username;
  const code = String(req.body.code || '').replace(/\s+/g, '');
  const selectedBranch = normalizeBranch(req.body.branch);

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

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
  const { email } = req.body;

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
  const email = req.body.email;
  const otp = String(req.body.otp || '').replace(/\s+/g, '');
  const newPassword = req.body.newPassword;

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
  const fullName = String(req.body.fullName || req.body.full_name || '').trim();
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = ALLOWED_ROLES.includes(req.body.role) ? req.body.role : 'Employee';
  const branch = normalizeBranch(req.body.branch || req.user.branch);
  const temporaryPassword = generateTemporaryPassword();

  if (!fullName || !username || !email) {
    return res.status(400).json({ error: 'Full name, username, and email are required.' });
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

    sendAdminCreatedAccountEmail(user.email, user.full_name, user.username, temporaryPassword, user.branch, user.role)
      .catch(err => {
        console.error('Admin-created account email failed:', err.message);
      });

    return res.status(201).json({
      message: 'User account created',
      user,
      temporaryPassword
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
      recentSystemEvents: recentSystemEventsResult.rows,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    console.error('System summary error:', err);
    return res.status(500).json({ error: 'Failed to load system summary' });
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
         p.supplier_name,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
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
    return res.json({ products: result.rows.map(mapInventoryRow) });
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
         supplier_name,
         branch,
         stock_level,
         min_stock_level,
         lead_time_days,
         safety_stock,
         average_daily_sales,
         status,
         last_updated,
         archive_reason,
         archived_at
       FROM archived_inventory
       WHERE branch = $1
       ORDER BY archived_at DESC, archived_inventory_id DESC`,
      [req.user.branch]
    );

    return res.json({ archivedProducts: result.rows.map(mapArchivedInventoryRow) });
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
         created_at
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
         st.branch,
         st.customer_type,
         st.total_quantity,
         st.total_amount,
         st.status,
         st.sold_by,
         st.sold_by_name,
         st.remarks,
         st.created_at,
         st.cancelled_at,
         st.cancelled_by,
         st.cancel_reason,
         COALESCE(
           json_agg(
             json_build_object(
               'sales_item_id', si.sales_item_id,
               'inventory_id', si.inventory_id,
               'product_id', si.product_id,
               'item_name', si.item_name,
               'category', si.category,
               'branch', si.branch,
               'quantity_sold', si.quantity_sold,
               'unit_price', si.unit_price,
               'subtotal', si.subtotal,
               'previous_quantity', si.previous_quantity,
               'new_quantity', si.new_quantity,
               'created_at', si.created_at
             )
             ORDER BY si.sales_item_id ASC
           ) FILTER (WHERE si.sales_item_id IS NOT NULL),
           '[]'::json
         ) AS items
       FROM sales_transactions st
       LEFT JOIN sales_items si
         ON si.sales_transaction_id = st.sales_transaction_id
       WHERE st.branch = $1
       GROUP BY st.sales_transaction_id
       ORDER BY st.created_at DESC, st.sales_transaction_id DESC`,
      [req.user.branch]
    );

    return res.json({ sales: result.rows.map(mapSalesTransactionRow) });
  } catch (err) {
    console.error('Get sales error:', err);
    return res.status(500).json({ error: 'Failed to load sales records' });
  }
});

app.post('/api/sales', authenticate, async (req, res) => {
  const { customer_type = 'walk_in', items = [], remarks = '' } = req.body;
  const normalizedCustomerType = String(customer_type || 'walk_in').trim().toLowerCase();
  const allowedCustomerTypes = new Set(['walk_in', 'regular', 'contractor']);

  if (!allowedCustomerTypes.has(normalizedCustomerType)) {
    return res.status(400).json({ error: 'Please select a valid customer type.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one sold item before recording the sale.' });
  }

  const aggregatedItems = new Map();
  try {
    for (const item of items) {
      const inventoryId = Number(item?.inventory_id);
      const quantity = parseNonNegativeInteger(item?.quantity, 'Quantity sold');
      const unitPrice = parseNonNegativeDecimal(item?.unit_price ?? 0, 'Unit price', { max: 100000000 });

      if (!Number.isInteger(inventoryId) || inventoryId <= 0 || quantity <= 0) {
        return res.status(400).json({ error: 'Each sold item must include a valid product and quantity.' });
      }

      const existing = aggregatedItems.get(inventoryId) || { quantity: 0, unitPrice };
      aggregatedItems.set(inventoryId, {
        quantity: existing.quantity + quantity,
        unitPrice: unitPrice || existing.unitPrice || 0
      });
    }
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Invalid sale details.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const salesNumber = await generateSalesNumber(client);
    const soldByName = req.user.fullName || req.user.username || 'System User';
    const cleanRemarks = String(remarks || '').trim().slice(0, 500) || null;
    let totalQuantity = 0;
    let totalAmount = 0;
    const saleLines = [];
    const updatedItems = [];

    for (const [inventoryId, line] of aggregatedItems.entries()) {
      const currentResult = await client.query(
        `SELECT
           bi.inventory_id,
           bi.product_id,
           p.name,
           p.category,
           p.supplier_name,
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
      const newQuantity = previousQuantity - quantitySold;
      const nextStatus = computeInventoryStatus(newQuantity, getEffectiveReorderThreshold(currentItem));

      totalQuantity += quantitySold;
      totalAmount += subtotal;

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
        itemName: currentItem.name,
        category: currentItem.category,
        branch: currentItem.branch,
        quantitySold,
        unitPrice,
        subtotal,
        previousQuantity,
        newQuantity
      });

      updatedItems.push({
        ...updatedResult.rows[0],
        name: currentItem.name,
        category: currentItem.category,
        supplier_name: currentItem.supplier_name,
        lead_time_days: currentItem.lead_time_days,
        safety_stock: currentItem.safety_stock,
        average_daily_sales: currentItem.average_daily_sales
      });
    }

    const transactionResult = await client.query(
      `INSERT INTO sales_transactions (
         sales_number,
         branch,
         customer_type,
         total_quantity,
         total_amount,
         status,
         sold_by,
         sold_by_name,
         remarks
       )
       VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8)
       RETURNING *`,
      [
        salesNumber,
        req.user.branch,
        normalizedCustomerType,
        totalQuantity,
        Number(totalAmount.toFixed(2)),
        req.user.id,
        soldByName,
        cleanRemarks
      ]
    );

    const salesTransaction = transactionResult.rows[0];
    const insertedItems = [];

    for (const line of saleLines) {
      const itemResult = await client.query(
        `INSERT INTO sales_items (
           sales_transaction_id,
           inventory_id,
           product_id,
           item_name,
           category,
           branch,
           quantity_sold,
           unit_price,
           subtotal,
           previous_quantity,
           new_quantity
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          salesTransaction.sales_transaction_id,
          line.inventoryId,
          line.productId,
          line.itemName,
          line.category,
          line.branch,
          line.quantitySold,
          line.unitPrice,
          line.subtotal,
          line.previousQuantity,
          line.newQuantity
        ]
      );

      insertedItems.push(itemResult.rows[0]);

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
        note: `Sale recorded through Sales module (${salesNumber}).`,
        actorId: req.user.id
      });

      await refreshAverageDailySalesForInventory(client, line.inventoryId);
    }

    await recordAuditLog(client, {
      actorId: req.user.id,
      targetId: salesTransaction.sales_transaction_id,
      targetName: salesNumber,
      targetType: 'sales_transaction',
      action: 'CREATE_SALES_TRANSACTION',
      reason: 'Sales Recording',
      details: {
        branch: req.user.branch,
        customerType: normalizedCustomerType,
        totalQuantity,
        totalAmount: Number(totalAmount.toFixed(2)),
        itemCount: insertedItems.length,
        remarks: cleanRemarks
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
    console.error('Record sale error:', err);
    return res.status(500).json({ error: 'Failed to record sale. No inventory was deducted.' });
  } finally {
    client.release();
  }
});

app.post('/api/inventory', authenticate, requireAdmin, async (req, res) => {
  const {
    name,
    category,
    supplier_name,
    stock_level,
    min_stock_level,
    lead_time_days,
    safety_stock,
    average_daily_sales,
    allow_similar_duplicate = false
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cleanName = cleanInventoryName(name);
    const cleanSupplier = cleanSupplierName(supplier_name);
    const canonicalCategory = canonicalizeInventoryCategory(category);
    const nameQualityError = validateInventoryNameQuality(cleanName);
    if (nameQualityError || !canonicalCategory) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: nameQualityError || 'Valid product name and category are required' });
    }

    const stockLevel = parseNonNegativeInteger(stock_level, 'Stock level');
    const minStockLevel = parseNonNegativeInteger(min_stock_level, 'Manual low-stock threshold');
    const leadTimeDays = parseOptionalNonNegativeInteger(lead_time_days, 'Supplier lead time', { max: 365 });
    const safetyStock = parseOptionalNonNegativeInteger(safety_stock, 'Safety stock', { max: 100000 });
    const averageDailySales = parseOptionalNonNegativeDecimal(average_daily_sales, 'Average daily sales', { max: 100000 });

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

    const productId = await findOrCreateProduct(client, { name: cleanName, category: canonicalCategory, supplierName: cleanSupplier });
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
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated`,
      [productId, req.user.branch, stockLevel, minStockLevel, leadTimeDays, safetyStock, averageDailySales, status]
    );

    const merged = await client.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         p.supplier_name,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
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
        supplier: createdItem.supplier_name || 'Unassigned',
        initialQuantity: stockLevel,
        reorderLevel: minStockLevel,
        leadTimeDays,
        safetyStock,
        averageDailySales,
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
    return res.status(201).json({ product: mapInventoryRow(createdItem) });
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
           p.supplier_name,
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
        actorId: req.user.id
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
          note: movement_note || 'Daily sales or stock-out deduction recorded from inventory module.'
        }
      });

      updatedItems.push({
        ...updatedResult.rows[0],
        name: currentItem.name,
        category: currentItem.category,
        supplier_name: currentItem.supplier_name,
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

app.put('/api/inventory/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    category,
    supplier_name,
    stock_level,
    min_stock_level,
    lead_time_days,
    safety_stock,
    average_daily_sales,
    movement_action,
    movement_quantity,
    movement_reason,
    movement_note,
    allow_similar_duplicate = false
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingInventory = await client.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         p.supplier_name,
         bi.branch,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
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
    const nextAverageDailySales = average_daily_sales === undefined
      ? inventoryRow.average_daily_sales
      : parseOptionalNonNegativeDecimal(average_daily_sales, 'Average daily sales', { max: 100000 });
    const status = computeInventoryStatus(nextQuantity, getEffectiveReorderThreshold({
      min_stock_level: nextMinStockLevel,
      lead_time_days: nextLeadTimeDays,
      safety_stock: nextSafetyStock,
      average_daily_sales: nextAverageDailySales
    }));
    const previousStatus = inventoryRow.status || computeInventoryStatus(previousQuantity, getEffectiveReorderThreshold(inventoryRow));
    const shouldRefreshInventoryTimestamp = previousQuantity !== nextQuantity || previousStatus !== status;
    const cleanName = cleanInventoryName(name);
    const cleanSupplier = cleanSupplierName(supplier_name);
    const canonicalCategory = canonicalizeInventoryCategory(category);
    const nameQualityError = validateInventoryNameQuality(cleanName);
    if (nameQualityError || !canonicalCategory) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: nameQualityError || 'Valid product name and category are required' });
    }

    const identityChanged =
      normalizeInventoryText(inventoryRow.name) !== normalizeInventoryText(cleanName) ||
      canonicalizeInventoryCategory(inventoryRow.category) !== canonicalCategory;
    const supplierChanged = cleanSupplier !== cleanSupplierName(inventoryRow.supplier_name);
    const reorderLevelChanged = Number(inventoryRow.min_stock_level || 0) !== nextMinStockLevel;
    const normalizeNullableNumber = value => (value === null || value === undefined ? null : Number(value));
    const reorderPlanningChanged =
      normalizeNullableNumber(inventoryRow.lead_time_days) !== normalizeNullableNumber(nextLeadTimeDays) ||
      normalizeNullableNumber(inventoryRow.safety_stock) !== normalizeNullableNumber(nextSafetyStock) ||
      normalizeNullableNumber(inventoryRow.average_daily_sales) !== normalizeNullableNumber(nextAverageDailySales);
    const quantityChanged = previousQuantity !== nextQuantity;
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

    if (!isAdmin(req.user) && !isValidStockMovementRequest) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Admin access is required to change item details. Employees can only perform Stock In and Stock Out.'
      });
    }

    let reviewedSimilarDuplicate = null;
    if (identityChanged) {
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
      targetProductId = await findOrCreateProduct(client, { name: cleanName, category: canonicalCategory, supplierName: cleanSupplier });
    } else {
      await client.query(
        `UPDATE products
         SET name = $1,
             category = $2,
             supplier_name = $3
         WHERE product_id = $4`,
        [cleanName, canonicalCategory, cleanSupplier, productId]
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
           status = $7,
           last_updated = CASE WHEN $10 THEN ${PHILIPPINE_NOW_SQL} ELSE last_updated END
       WHERE inventory_id = $8 AND branch = $9
       RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated`,
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
        shouldRefreshInventoryTimestamp
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
         p.supplier_name,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
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
        actorId: req.user.id
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
          note: movement_note || null
        }
      });
    } else {
      const changedFields = [];
      if (inventoryRow.name !== cleanName) changedFields.push('name');
      if (inventoryRow.category !== canonicalCategory) changedFields.push('category');
      if (supplierChanged) changedFields.push('supplier');
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
              supplier: inventoryRow.supplier_name || 'Unassigned',
              reorderLevel: Number(inventoryRow.min_stock_level || 0),
              leadTimeDays: Number(inventoryRow.lead_time_days || 0),
              safetyStock: Number(inventoryRow.safety_stock || 0),
              averageDailySales: Number(inventoryRow.average_daily_sales || 0),
              recommendedReorderPoint: computeReorderPoint(inventoryRow)
            },
            current: {
              name: updatedItem.name,
              category: updatedItem.category,
              supplier: updatedItem.supplier_name || 'Unassigned',
              reorderLevel: nextMinStockLevel,
              leadTimeDays: nextLeadTimeDays,
              safetyStock: nextSafetyStock,
              averageDailySales: nextAverageDailySales,
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
    return res.json({ product: mapInventoryRow(updatedItem) });
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

  if (!normalizedArchiveReason) {
    return res.status(400).json({ error: 'Please select the reason for archiving this item.' });
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
         p.supplier_name,
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
         supplier_name,
         branch,
         stock_level,
         min_stock_level,
         lead_time_days,
         safety_stock,
         average_daily_sales,
         status,
         last_updated,
         archive_reason,
         archived_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        archivedItem.inventory_id,
        archivedItem.product_id,
        archivedItem.name,
        archivedItem.category,
        archivedItem.supplier_name,
        archivedItem.branch,
        archivedItem.stock_level,
        archivedItem.min_stock_level,
        archivedItem.lead_time_days,
        archivedItem.safety_stock,
        archivedItem.average_daily_sales,
        archivedItem.status,
        archivedItem.last_updated,
        normalizedArchiveReason,
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
      reason: getArchiveReasonLabel(normalizedArchiveReason),
      details: {
        branch: archivedItem.branch,
        category: archivedItem.category,
        supplier: archivedItem.supplier_name || 'Unassigned',
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
         branch,
         stock_level,
         min_stock_level,
         lead_time_days,
         safety_stock,
         average_daily_sales,
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
      supplierName: archivedItem.supplier_name
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
             status = $6,
             last_updated = ${PHILIPPINE_NOW_SQL}
         WHERE inventory_id = $7 AND branch = $8
         RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated`,
        [
          archivedItem.stock_level,
          archivedItem.min_stock_level,
          archivedItem.lead_time_days,
          archivedItem.safety_stock,
          archivedItem.average_daily_sales,
          computeInventoryStatus(Number(archivedItem.stock_level || 0), getEffectiveReorderThreshold(archivedItem)),
          activeItem.inventory_id,
          archivedItem.branch
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
           status,
           last_updated
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${PHILIPPINE_NOW_SQL})
         RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, lead_time_days, safety_stock, average_daily_sales, status, last_updated`,
        [
          productId,
          archivedItem.branch,
          archivedItem.stock_level,
          archivedItem.min_stock_level,
          archivedItem.lead_time_days,
          archivedItem.safety_stock,
          archivedItem.average_daily_sales,
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
         p.supplier_name,
         bi.stock_level,
         bi.min_stock_level,
         bi.lead_time_days,
         bi.safety_stock,
         bi.average_daily_sales,
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
    return res.json({ product: mapInventoryRow(merged.rows[0]) });
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
    (err, stdout, stderr) => {
      if (err) {
        const details = stderr || getPostgresToolError(err, 'pg_dump');
        console.error('Backup failed:', details);
        return res.status(500).json({ error: 'Backup failed', details });
      }

      pool.query(
        `INSERT INTO backup_logs (action, actor_id, actor_name)
         VALUES ($1, $2, (SELECT full_name FROM users WHERE user_id = $2))`,
        ['backup', req.user.id]
      ).catch((logErr) => {
        console.error('Backup log insert failed:', logErr.message);
      });
      recordAuditLog(pool, {
        actorId: req.user.id,
        targetName: 'Database Backup',
        action: 'CREATE_BACKUP'
      }).catch((logErr) => {
        console.error('Backup audit log insert failed:', logErr.message);
      });
      recordSystemLog(pool, {
        eventType: 'DATABASE_BACKUP',
        severity: 'info',
        message: 'Database backup was generated.',
        context: { delivery: 'download' },
        actorId: req.user.id
      }).catch((logErr) => {
        console.error('Backup system log insert failed:', logErr.message);
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
    'users',
    'products',
    'branch_inventory',
    'stock_movements',
    'sales_transactions',
    'sales_items',
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
      invalidSalesItems
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
             OR (role = 'Employee' AND (branch IS NULL OR TRIM(branch) = ''))
           )
           AND (
             role NOT IN ('Admin', 'Employee')
             OR status NOT IN ('Active', 'Pending', 'Inactive', 'Rejected')
             OR (role = 'Employee' AND (branch IS NULL OR TRIM(branch) = ''))
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT sales_transaction_id, transaction_number, branch, status, total_quantity, total_amount
         FROM sales_transactions
         WHERE branch = $1
           AND (
             total_quantity < 0
             OR total_amount < 0
             OR status NOT IN ('completed', 'cancelled')
             OR transaction_number IS NULL
             OR TRIM(transaction_number) = ''
           )`,
        [scopeBranch]
      ),
      pool.query(
        `SELECT si.sales_item_id, st.transaction_number, si.item_name, si.quantity_sold, si.unit_price, si.subtotal
         FROM sales_items si
         INNER JOIN sales_transactions st
           ON st.sales_transaction_id = si.sales_transaction_id
         WHERE st.branch = $1
           AND (
             si.quantity_sold <= 0
             OR si.unit_price < 0
             OR si.subtotal < 0
             OR si.previous_quantity < 0
             OR si.new_quantity < 0
             OR si.item_name IS NULL
             OR TRIM(si.item_name) = ''
           )`,
        [scopeBranch]
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
        key: 'orphan_stock_movements',
        label: 'Stock movements linked to missing inventory records',
        count: orphanMovements.rowCount
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
        label: 'Sales records with invalid totals, status, or transaction number',
        count: invalidSalesTransactions.rowCount
      },
      {
        key: 'invalid_sales_items',
        label: 'Sales line items with invalid quantity, amount, or item details',
        count: invalidSalesItems.rowCount
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

          pool.query(
            `INSERT INTO backup_logs (action, actor_id, actor_name)
             VALUES ($1, $2, (SELECT full_name FROM users WHERE user_id = $2))`,
            ['restore', req.user.id]
          ).catch((logErr) => {
            console.error('Restore log insert failed:', logErr.message);
          });
          recordAuditLog(pool, {
            actorId: req.user.id,
            targetName: 'Database Restore',
            action: 'RESTORE_DATABASE'
          }).catch((logErr) => {
            console.error('Restore audit log insert failed:', logErr.message);
          });
          recordSystemLog(pool, {
            eventType: 'DATABASE_RESTORE',
            severity: 'warning',
            message: 'Database restore completed from an uploaded SQL backup.',
            context: { source: 'uploaded_sql_backup' },
            actorId: req.user.id
          }).catch((logErr) => {
            console.error('Restore system log insert failed:', logErr.message);
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
