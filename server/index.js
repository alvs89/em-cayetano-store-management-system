require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
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

// PostgreSQL TIMESTAMP values are stored without timezone metadata. The database
// uses UTC timestamps, so parse them as UTC instead of the Node process timezone.
types.setTypeParser(1114, (value) => new Date(`${value}Z`));

app.use(cors());
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

async function ensureSchema() {
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
      otp_code VARCHAR(10),
      otp_expires TIMESTAMP,
      token_version INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      product_id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      category VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS branch_inventory (
      inventory_id SERIAL PRIMARY KEY,
      product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
      branch VARCHAR(50) NOT NULL,
      stock_level INTEGER DEFAULT 0,
      min_stock_level INTEGER DEFAULT 5,
      status VARCHAR(20) DEFAULT 'In Stock',
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      note TEXT,
      actor_id INT REFERENCES users(user_id) ON DELETE SET NULL,
      actor_name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      status VARCHAR(20) DEFAULT 'In Stock',
      last_updated TIMESTAMP,
      archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      action TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backup_logs (
      id SERIAL PRIMARY KEY,
      action VARCHAR(20) NOT NULL,
      actor_id INT,
      actor_name TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
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
        COALESCE(p.last_updated, CURRENT_TIMESTAMP)
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

function normalizeInventoryText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanInventoryName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function canonicalizeInventoryCategory(value) {
  const normalized = normalizeInventoryText(value);
  return CATEGORY_ALIASES[normalized] || null;
}

async function findOrCreateProduct(client, { name, category }) {
  const canonicalCategory = canonicalizeInventoryCategory(category);
  const cleanName = cleanInventoryName(name);
  if (!canonicalCategory) {
    const error = new Error('Invalid inventory category');
    error.statusCode = 400;
    throw error;
  }

  const existing = await client.query(
    `SELECT product_id, name, category
     FROM products
     WHERE LOWER(REGEXP_REPLACE(TRIM(name), '\\s+', ' ', 'g')) = LOWER($1)
       AND LOWER(category) = LOWER($2)
     LIMIT 1`,
    [cleanName, canonicalCategory]
  );

  if (existing.rowCount > 0) {
    return existing.rows[0].product_id;
  }

  const inserted = await client.query(
    `INSERT INTO products (name, category)
     VALUES ($1, $2)
     RETURNING product_id`,
    [cleanName, canonicalCategory]
  );

  return inserted.rows[0].product_id;
}

function mapInventoryRow(row) {
  return {
    inventory_id: row.inventory_id,
    product_id: row.product_id,
    name: row.name,
    category: row.category,
    stock_level: row.stock_level,
    min_stock_level: row.min_stock_level,
    status: row.status,
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
    stock_level: row.stock_level,
    min_stock_level: row.min_stock_level,
    status: row.status,
    branch: row.branch,
    last_updated: row.last_updated,
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
    note: row.note,
    actor_id: row.actor_id,
    actor_name: row.actor_name,
    created_at: row.created_at
  };
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
       note,
       actor_id,
       actor_name
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, (SELECT full_name FROM users WHERE user_id = $11))`,
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
      note || null,
      actorId
    ]
  );
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
  action
}) {
  if (!actorId || !action) return;

  await db.query(
    `INSERT INTO audit_logs (actor_id, actor_name, target_id, target_name, action)
     VALUES ($1, COALESCE($2, (SELECT full_name FROM users WHERE user_id = $1), 'Unknown User'), $3, $4, $5)`,
    [
      actorId,
      actorName || null,
      Number.isInteger(Number(targetId)) ? Number(targetId) : null,
      targetName || null,
      action
    ]
  );
}

function normalizeBranch(value) {
  return typeof value === 'string' ? value.trim() : '';
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
    process.env.JWT_SECRET || 'dev-secret',
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

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const result = await pool.query(
      'SELECT user_id, role, branch, token_version, status FROM users WHERE user_id = $1',
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
      role: decoded.role,
      branch: decoded.branch || dbUser.branch
    };

    return next();
  } catch (err) {
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
  const { fullName, username, email, password, role, branch } = req.body;
  const normalizedBranch = normalizeBranch(branch);

  if (!fullName || !username || !email || !password) {
    return res.status(400).json({ error: 'Missing required registration fields' });
  }

  if (!ALLOWED_BRANCHES.includes(normalizedBranch)) {
    return res.status(400).json({ error: 'Invalid branch selection' });
  }

  const safeRole = ALLOWED_ROLES.includes(role) ? role : 'Employee';

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
      `INSERT INTO users (full_name, username, email, password_hash, role, branch, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pending')
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
    const issuedAt = Date.now();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(issuedAt + OTP_TTL_MS);

    await pool.query(
      'UPDATE users SET otp_code = $1, otp_expires = $2 WHERE user_id = $3',
      [otp, expiresAt, user.user_id]
    );

    await sendOtpEmail(user, otp, '2FA Login Verification', 'Use this code to complete your login.');

    return res.json({
      message: 'OTP sent successfully to email',
      expiresAt: expiresAt.toISOString(),
      serverTime: issuedAt
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

    if (user.otp_code !== code) {
      return res.status(400).json({ error: 'Invalid code' });
    }

    if (!user.otp_expires || new Date(user.otp_expires).getTime() + 15000 < Date.now()) {
      return res.status(400).json({ error: 'Code expired' });
    }

    if (!isAdmin(user) && selectedBranch && selectedBranch !== user.branch) {
      return res.status(403).json({ error: 'Selected branch does not match your account' });
    }

    await pool.query(
      'UPDATE users SET otp_code = NULL, otp_expires = NULL WHERE user_id = $1',
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
    const issuedAt = Date.now();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(issuedAt + OTP_TTL_MS);

    await pool.query(
      'UPDATE users SET otp_code = $1, otp_expires = $2 WHERE email = $3',
      [otp, expiresAt, email]
    );

    await sendOtpEmail(user, otp, 'Password Reset Verification', 'Use this code to reset your password.');

    return res.json({
      message: 'OTP sent',
      expiresAt: expiresAt.toISOString(),
      serverTime: issuedAt
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
    const expiresMs = user.otp_expires ? new Date(user.otp_expires).getTime() : 0;

    if (user.otp_code !== otp || Date.now() - expiresMs > 15000) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users
       SET password_hash = $1, otp_code = NULL, otp_expires = NULL, token_version = COALESCE(token_version, 0) + 1
       WHERE user_id = $2`,
      [newHash, user.user_id]
    );

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Server Error' });
  }
});

app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, full_name, username, email, role, branch, status, created_at
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

app.post('/api/audit-logs', authenticate, async (req, res) => {
  const action = String(req.body.action || '').trim().toUpperCase();
  const targetName = typeof req.body.target_name === 'string' ? req.body.target_name.trim() : null;
  const targetId = req.body.target_id;

  if (!ALLOWED_CLIENT_AUDIT_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'Unsupported audit action' });
  }

  try {
    await recordAuditLog(pool, {
      actorId: req.user.id,
      targetId,
      targetName,
      action
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
      `SELECT id, actor_id, actor_name, target_id, target_name, action, created_at
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
       RETURNING user_id, full_name, email, username, branch, status, role, created_at`,
      [id, req.user.branch]
    );

    if (update.rowCount === 0) {
      return res.status(404).json({ error: 'User not found in this branch' });
    }

    const user = update.rows[0];
    await recordAuditLog(pool, {
      actorId: req.user.id,
      targetId: user.user_id,
      targetName: user.full_name,
      action: 'APPROVE_USER'
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
       RETURNING user_id, full_name, email, username, branch, status, role, created_at`,
      [id, req.user.branch]
    );

    const user = update.rows[0];
    await recordAuditLog(pool, {
      actorId: req.user.id,
      targetId: user.user_id,
      targetName: user.full_name,
      action: previous.status === 'Pending' ? 'REJECT_USER' : 'DEACTIVATE_USER'
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
       RETURNING user_id, full_name, email, username, branch, role, status, token_version, created_at`,
      [newRole, id]
    );

    const updatedUser = updated.rows[0];
    await recordAuditLog(pool, {
      actorId: req.user.id,
      targetId: updatedUser.user_id,
      targetName: updatedUser.full_name,
      action: `CHANGE_ROLE: ${targetUser.role} to ${newRole}`
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
       RETURNING user_id, full_name, email, username, branch, role, status, created_at`,
      [newBranch, id]
    );

    const updatedUser = updated.rows[0];
    await recordAuditLog(pool, {
      actorId: req.user.id,
      targetId: updatedUser.user_id,
      targetName: updatedUser.full_name,
      action: `CHANGE_BRANCH: ${user.branch} to ${newBranch}`
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

    return res.json({
      databaseStatus: 'Online',
      activeUserCount: activeUsersResult.rows[0]?.count || 0,
      pendingRegistrations: pendingUsersResult.rows,
      lastBackupAt: latestBackupResult.rows[0]?.created_at || null,
      lastBackupBy: latestBackupResult.rows[0]?.actor_name || null
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

    const defaultStatus = computeInventoryStatus(0, 5);

    await pool.query(
      `INSERT INTO branch_inventory (product_id, branch, stock_level, min_stock_level, status)
       SELECT p.product_id, $1::varchar, 0, 5, $2
       FROM products p
       WHERE NOT EXISTS (
         SELECT 1
         FROM branch_inventory bi
         WHERE bi.product_id = p.product_id
           AND bi.branch = $1::varchar
       )`,
      [req.user.branch, defaultStatus]
    );

    const result = await pool.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         bi.stock_level,
         bi.min_stock_level,
         bi.status,
         bi.branch,
         bi.last_updated
       FROM branch_inventory bi
       INNER JOIN products p ON p.product_id = bi.product_id
       WHERE bi.branch = $1
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
         branch,
         stock_level,
         min_stock_level,
         status,
         last_updated,
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

app.post('/api/inventory', authenticate, requireAdmin, async (req, res) => {
  const { name, category, stock_level, min_stock_level } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cleanName = cleanInventoryName(name);
    const canonicalCategory = canonicalizeInventoryCategory(category);
    if (!cleanName || !canonicalCategory) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Valid product name and category are required' });
    }

    const archivedDuplicate = await client.query(
      `SELECT archived_inventory_id, category
       FROM archived_inventory
       WHERE branch = $1
         AND LOWER(REGEXP_REPLACE(TRIM(name), '\\s+', ' ', 'g')) = LOWER($2)
       LIMIT 20`,
      [req.user.branch, cleanName]
    );

    if (archivedDuplicate.rows.some(row => canonicalizeInventoryCategory(row.category) === canonicalCategory)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'An archived item with the same name and category already exists. Please restore the archived item instead of creating a duplicate record.'
      });
    }

    const productId = await findOrCreateProduct(client, { name: cleanName, category: canonicalCategory });
    const status = computeInventoryStatus(Number(stock_level || 0), Number(min_stock_level || 0));

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
      `INSERT INTO branch_inventory (product_id, branch, stock_level, min_stock_level, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, status, last_updated`,
      [productId, req.user.branch, Number(stock_level || 0), Number(min_stock_level || 0), status]
    );

    const merged = await client.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         bi.stock_level,
         bi.min_stock_level,
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
      action: 'ADD_ITEM'
    });

    if (Number(stock_level || 0) > 0) {
      await recordStockMovement(client, {
        inventoryId: createdItem.inventory_id,
        productId: createdItem.product_id,
        itemName: createdItem.name,
        category: createdItem.category,
        branch: createdItem.branch,
        action: 'initial_stock',
        quantityChanged: Number(stock_level || 0),
        previousQuantity: 0,
        newQuantity: Number(stock_level || 0),
        note: 'Initial stock recorded when item was added.',
        actorId: req.user.id
      });
    }

    await client.query('COMMIT');
    return res.status(201).json({ product: mapInventoryRow(createdItem) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add product error:', err);
    return res.status(500).json({ error: 'Failed to add product' });
  } finally {
    client.release();
  }
});

app.put('/api/inventory/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, category, stock_level, min_stock_level, movement_action, movement_quantity, movement_note } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingInventory = await client.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         bi.branch,
         bi.stock_level,
         bi.min_stock_level
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
    const nextQuantity = Number(stock_level || 0);
    const status = computeInventoryStatus(Number(stock_level || 0), Number(min_stock_level || 0));
    const cleanName = cleanInventoryName(name);
    const canonicalCategory = canonicalizeInventoryCategory(category);
    if (!cleanName || !canonicalCategory) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Valid product name and category are required' });
    }

    await client.query(
      `UPDATE products
       SET name = $1,
           category = $2
       WHERE product_id = $3`,
      [cleanName, canonicalCategory, productId]
    );

    const result = await client.query(
      `UPDATE branch_inventory
       SET stock_level = $1,
           min_stock_level = $2,
           status = $3,
           last_updated = CURRENT_TIMESTAMP
       WHERE inventory_id = $4 AND branch = $5
       RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, status, last_updated`,
      [Number(stock_level || 0), Number(min_stock_level || 0), status, id, req.user.branch]
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
         bi.stock_level,
         bi.min_stock_level,
         bi.status,
         bi.branch,
         bi.last_updated
       FROM branch_inventory bi
       INNER JOIN products p ON p.product_id = bi.product_id
       WHERE bi.inventory_id = $1`,
      [id]
    );

    const updatedItem = merged.rows[0];
    const allowedMovementActions = ['stock_in', 'stock_out'];
    const action = allowedMovementActions.includes(movement_action) ? movement_action : null;
    const inferredQuantityChanged = Math.abs(nextQuantity - previousQuantity);
    const quantityChanged = Number(movement_quantity || inferredQuantityChanged);
    if (action && quantityChanged > 0 && previousQuantity !== nextQuantity) {
      const expectedDirectionIsValid =
        (action === 'stock_in' && nextQuantity > previousQuantity) ||
        (action === 'stock_out' && nextQuantity < previousQuantity);

      if (expectedDirectionIsValid) {
        await recordStockMovement(client, {
          inventoryId: updatedItem.inventory_id,
          productId: updatedItem.product_id,
          itemName: updatedItem.name,
          category: updatedItem.category,
          branch: updatedItem.branch,
          action,
          quantityChanged,
          previousQuantity,
          newQuantity: nextQuantity,
          note: movement_note || null,
          actorId: req.user.id
        });
        await recordAuditLog(client, {
          actorId: req.user.id,
          targetId: updatedItem.inventory_id,
          targetName: updatedItem.name,
          action: action === 'stock_in' ? 'STOCK_IN' : 'STOCK_OUT'
        });
      }
    } else {
      const changedFields = [];
      if (inventoryRow.name !== cleanName) changedFields.push('name');
      if (inventoryRow.category !== canonicalCategory) changedFields.push('category');
      if (previousQuantity !== nextQuantity) changedFields.push('quantity');
      if (Number(inventoryRow.min_stock_level || 0) !== Number(min_stock_level || 0)) changedFields.push('reorder level');
      if (changedFields.length > 0) {
        await recordAuditLog(client, {
          actorId: req.user.id,
          targetId: updatedItem.inventory_id,
          targetName: updatedItem.name,
          action: 'UPDATE_ITEM'
        });
      }
    }

    await client.query('COMMIT');
    return res.json({ product: mapInventoryRow(updatedItem) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update product error:', err);
    return res.status(500).json({ error: 'Failed to update product' });
  } finally {
    client.release();
  }
});

app.delete('/api/inventory/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inventorySnapshot = await client.query(
      `SELECT
         bi.inventory_id,
         bi.product_id,
         p.name,
         p.category,
         bi.branch,
         bi.stock_level,
         bi.min_stock_level,
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
         branch,
         stock_level,
         min_stock_level,
         status,
         last_updated,
         archived_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        archivedItem.inventory_id,
        archivedItem.product_id,
        archivedItem.name,
        archivedItem.category,
        archivedItem.branch,
        archivedItem.stock_level,
        archivedItem.min_stock_level,
        archivedItem.status,
        archivedItem.last_updated,
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
      action: 'ARCHIVE_ITEM'
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
         product_id,
         name,
         category,
         branch,
         stock_level,
         min_stock_level,
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
      category: canonicalizeInventoryCategory(archivedItem.category) || 'Other'
    });

    const existingInventory = await client.query(
      `SELECT inventory_id
       FROM branch_inventory
       WHERE product_id = $1 AND branch = $2`,
      [productId, archivedItem.branch]
    );

    if (existingInventory.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This product already exists in the current branch inventory' });
    }

    const restored = await client.query(
      `INSERT INTO branch_inventory (product_id, branch, stock_level, min_stock_level, status, last_updated)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING inventory_id, product_id, branch, stock_level, min_stock_level, status, last_updated`,
      [
        productId,
        archivedItem.branch,
        archivedItem.stock_level,
        archivedItem.min_stock_level,
        archivedItem.status,
      ]
    );

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
         bi.stock_level,
         bi.min_stock_level,
         bi.status,
         bi.branch,
         bi.last_updated
       FROM branch_inventory bi
       INNER JOIN products p ON p.product_id = bi.product_id
       WHERE bi.inventory_id = $1`,
      [restored.rows[0].inventory_id]
    );

    await recordAuditLog(client, {
      actorId: req.user.id,
      targetId: restored.rows[0].inventory_id,
      targetName: archivedItem.name,
      action: 'RESTORE_ITEM'
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
    'pg_dump',
    ['--no-owner', '--no-privileges', '--format=plain', `--dbname=${dbUrl}`],
    (err, stdout, stderr) => {
      if (err) {
        console.error('Backup failed:', stderr || err.message);
        return res.status(500).json({ error: 'Backup failed', details: stderr || err.message });
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

      res.setHeader('Content-disposition', `attachment; filename=backup_${Date.now()}.sql`);
      res.setHeader('Content-Type', 'application/sql');
      return res.send(stdout);
    }
  );
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
      fs.writeFileSync(tempFile, req.body);
      execFile('psql', [dbUrl, '-f', tempFile], (err, stdout, stderr) => {
        try {
          fs.unlinkSync(tempFile);
        } catch (unlinkErr) {
          console.error('Failed to remove temp restore file:', unlinkErr.message);
        }

        if (err) {
          console.error('Restore failed:', stderr || err.message);
          return res.status(500).json({ error: 'Restore failed', details: stderr || err.message });
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

        return res.json({ message: 'Database restored successfully', output: stdout });
      });
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
