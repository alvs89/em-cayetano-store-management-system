// server/index.js
// Express API for auth (login + 2FA), registration, password reset, and email delivery.
require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto'); // Built-in Node module for random numbers
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const OTP_TTL_MS = 120 * 1000; // 2 minutes

// 1. MIDDLEWARE (Security & Data Parsing)
app.use(cors()); // Allows your React client to talk to this server
app.use(express.json()); // Allows server to read JSON body from requests
app.use(express.static(path.join(__dirname, '../client/public'))); // Serve logo and other public assets

// 2. DATABASE CONNECTION (Neon/Postgres over SSL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon/Cloud providers
  }
});

// Ensure auxiliary columns exist
pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;")
  .catch(err => console.error('❌ Failed to ensure token_version column:', err));

// ✅ ADD THIS BLOCK: Global Error Listener
// This prevents the server from crashing when the database connection drops momentarily
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle database client', err);
  // Do not process.exit() here; just log it so the server keeps running
});

// EMAIL TRANSPORTER
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// JWT auth middleware with admin gate
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = authHeader.replace('Bearer ', '').trim();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    // Validate token version against DB to support session invalidation
    pool.query('SELECT token_version FROM users WHERE user_id = $1', [decoded.id])
      .then(result => {
        const dbVersion = result.rows[0]?.token_version ?? 0;
        if (dbVersion !== (decoded.tokenVersion ?? 0)) {
          return res.status(401).json({ error: 'Session invalidated' });
        }
        return next();
      })
      .catch(err => {
        console.error('Auth version check failed:', err);
        return res.status(401).json({ error: 'Unauthorized' });
      });
  } catch (err) {
    console.error('JWT verify failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}


// Test DB Connection on Startup
pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL Database'))
  .catch(err => console.error('❌ Database Connection Error:', err.message));

// 3. API ROUTES

// Health Check Route
app.get('/', (req, res) => {
  res.send('E.M. Cayetano Trading API is Running (v1.0)');
});

// UPDATED LOGIN ROUTE (With 2FA Enforcement + Branch Validation)
app.post('/api/auth/login', async (req, res) => {
  const { username, password, branch } = req.body;

  try {
    const userQuery = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (userQuery.rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = userQuery.rows[0];

    if (user.status !== 'Active') {
      return res.status(403).json({ error: `Account is ${user.status}. Please contact an administrator.` });
    }

    // Enforce branch match for all users (including Admin)
    if (!branch) {
      return res.status(400).json({ error: 'Branch selection is required.' });
    }

    const requestedBranch = branch.trim();
    if (user.branch && user.branch !== requestedBranch) {
      return res.status(403).json({
        error: `Access denied: Your registered branch is ${user.branch}. Please log in using that branch.`
      });
    }

    // Validate password (2FA enforced for all roles, including Admin)
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    res.json({ 
        message: "2FA Required", 
        require2fa: true, 
        username: user.username,
        email: user.email 
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// ROUTE: Register New User (hashes password and rejects duplicates)
app.post('/api/auth/register', async (req, res) => {
  const { fullName, username, email, password, role, branch } = req.body;

  try {
    // 1. Check if user exists
    const userCheck = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: "Username or Email already exists" });
    }

    // 2. Hash Password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Insert into DB
    const newUser = await pool.query(
      "INSERT INTO users (full_name, username, email, password_hash, role, branch, status) VALUES ($1, $2, $3, $4, $5, $6, 'Pending') RETURNING user_id, username, role, status, branch",
      [fullName, username, email, passwordHash, role || 'Employee', branch]
    );

    // Fire-and-forget email; don't block registration response on email transport
    sendPendingRegistrationEmail(email, fullName, branch)
      .catch(err => console.error('Pending registration email failed:', err));

    res.json({ message: "Registration submitted for approval", user: newUser.rows[0] });

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// ROUTE: Request Password Reset (email a short-lived OTP)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "Email not found" });

    const user = userResult.rows[0];

    // Generate Code
    const issuedAt = Date.now();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(issuedAt + OTP_TTL_MS); // 2 mins TTL

    // Save to DB
    await pool.query('UPDATE users SET otp_code = $1, otp_expires = $2 WHERE email = $3', [otp, expiresAt, email]);

    // Send Email
    const mailOptions = {
      // The format is: "DISPLAY NAME" <email_address>
      from: `"E.M. Cayetano Trading - Security" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Password Reset Verification',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #FFFF00, #FF0000); padding: 24px; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: #111827;">E.M. Cayetano Trading</div>
            <div style="font-size: 13px; color: #111827; opacity: 0.9; margin-top: 4px;">Inventory Management System</div>
          </div>

          <div style="padding: 28px 32px 32px;">
            <h2 style="margin: 0 0 8px; color: #111827; font-size: 22px;">Reset Your Password</h2>
            <p style="margin: 0 0 12px; color: #4b5563;">Hello <strong>${user.full_name || user.username || 'there'}</strong>,</p>
            <p style="margin: 0 0 16px; color: #4b5563;">Use the verification code below to finish resetting your password.</p>

            <div style="background: #f9fafb; border: 1px dashed #e5e7eb; border-radius: 12px; padding: 16px; text-align: center;">
              <div style="font-size: 32px; letter-spacing: 8px; font-weight: 700; color: #111827;">${otp}</div>
              <div style="margin-top: 8px; font-size: 14px; color: #dc2626; font-weight: 600;">Expires in 2 minutes</div>
              <div style="margin-top: 4px; font-size: 12px; color: #6b7280;">For your security, this verification code will expire in 2 minutes.</div>
            </div>

            <p style="margin: 18px 0 0; color: #4b5563; font-size: 14px;">If you did not request this reset, please secure your account and ignore this email.</p>
          </div>

          <div style="background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
            <div style="font-weight: 600; color: #111827;">E.M. Cayetano Trading</div>
            <div>Rodriguez, Rizal • Manggahan & San Rafael Branches</div>
            <div style="margin-top: 6px;">This is an automated message. Please do not reply.</div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: "OTP sent", expiresAt: expiresAt.toISOString(), serverTime: issuedAt });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: "Failed to send code" });
  }
});

// ROUTE: Reset Password (validate OTP then store new bcrypt hash)
app.post('/api/auth/reset-password', async (req, res) => {
  const email = req.body.email;
  const otp = (req.body.otp || '').replace(/\s+/g, '');
  const newPassword = req.body.newPassword;
  try {
    // Verify OTP
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
    
    const user = userResult.rows[0];
    const expiresMs = new Date(user.otp_expires).getTime();
    const nowMs = Date.now();
    // Grace window (15s) to tolerate clock drift/network latency
    if (user.otp_code !== otp || nowMs - expiresMs > 15000) {
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    // Hash New Password
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    // Update DB & Clear OTP
    await pool.query('UPDATE users SET password_hash = $1, otp_code = NULL WHERE user_id = $2', [newHash, user.user_id]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// Helper: send activation email
async function sendActivationEmail(toEmail, fullName) {
  const mailOptions = {
    from: `"E.M. Cayetano Trading Notifications" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your E.M. Cayetano Trading account is now active',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #FFFF00, #FF0000); padding: 22px; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #111827;">E.M. Cayetano Trading</div>
          <div style="font-size: 13px; color: #111827; opacity: 0.9; margin-top: 4px;">Inventory Management System</div>
        </div>

        <div style="padding: 28px 30px 30px;">
          <h2 style="margin: 0 0 10px; color: #111827; font-size: 22px;">Welcome aboard!</h2>
          <p style="margin: 0 0 12px; color: #4b5563;">Hello <strong>${fullName || 'Team Member'}</strong>,</p>
          <p style="margin: 0 0 12px; color: #4b5563;">Your account has been approved and activated by our admin team. You can now sign in using the same credentials you registered with.</p>
          <div style="margin: 18px 0; padding: 14px 16px; border-radius: 12px; background: #f9fafb; border: 1px dashed #e5e7eb; color: #111827;">
            <div style="font-weight: 600;">Next steps</div>
            <ul style="margin: 8px 0 0 20px; color: #4b5563;">
              <li>Go to the login page and enter your username and password.</li>
              <li>If prompted for 2FA, check this email account for the one-time code.</li>
              <li>If you need help, contact your branch admin.</li>
            </ul>
          </div>
          <p style="margin: 0; color: #4b5563;">Thank you for keeping our inventory data secure.</p>
        </div>

        <div style="background: #f9fafb; padding: 14px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          <div style="font-weight: 600; color: #111827;">E.M. Cayetano Trading</div>
          <div>Rodriguez, Rizal • Manggahan & San Rafael Branches</div>
          <div style="margin-top: 6px;">This is an automated message. Please do not reply.</div>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// Helper: notify user that registration is pending admin approval
async function sendPendingRegistrationEmail(toEmail, fullName, branch) {
  const safeName = fullName || 'Team Member';
  const safeBranch = branch || 'your selected branch';

  const mailOptions = {
    from: `"E.M. Cayetano Trading Notifications" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your registration is pending approval',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #FFFF00, #FF0000); padding: 22px; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #111827;">E.M. Cayetano Trading</div>
          <div style="font-size: 13px; color: #111827; opacity: 0.9; margin-top: 4px;">Inventory Management System</div>
        </div>

        <div style="padding: 28px 30px 30px;">
          <h2 style="margin: 0 0 10px; color: #111827; font-size: 22px;">Registration received</h2>
          <p style="margin: 0 0 12px; color: #4b5563;">Hello <strong>${safeName}</strong>,</p>
          <p style="margin: 0 0 12px; color: #4b5563;">Thank you for registering. Your account is currently pending administrator approval.</p>

          <div style="margin: 16px 0; padding: 14px 16px; border-radius: 12px; background: #f9fafb; border: 1px dashed #e5e7eb; color: #111827;">
            <div style="font-weight: 600;">What to expect</div>
            <ul style="margin: 8px 0 0 18px; color: #4b5563;">
              <li><strong>Branch selected:</strong> ${safeBranch}</li>
              <li>Our admin team will review your request.</li>
              <li>You will receive another email once your account is activated.</li>
            </ul>
          </div>

          <p style="margin: 0 0 10px; color: #4b5563;">If you did not initiate this request, please ignore this email.</p>
        </div>

        <div style="background: #f9fafb; padding: 14px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          <div style="font-weight: 600; color: #111827;">E.M. Cayetano Trading</div>
          <div>Rodriguez, Rizal • Manggahan & San Rafael Branches</div>
          <div style="margin-top: 6px;">This is an automated message. Please do not reply.</div>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// Helper: notify user of role change
async function sendRoleChangeEmail(toEmail, fullName, oldRole, newRole) {
  const safeName = fullName || 'Team Member';
  const fromRole = oldRole || 'your current role';
  const toRole = newRole || 'your new role';

  const mailOptions = {
    from: `"E.M. Cayetano Trading Notifications" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your role has been updated',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #FFFF00, #FF0000); padding: 22px; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #111827;">E.M. Cayetano Trading</div>
          <div style="font-size: 13px; color: #111827; opacity: 0.9; margin-top: 4px;">Inventory Management System</div>
        </div>

        <div style="padding: 28px 30px 30px;">
          <h2 style="margin: 0 0 10px; color: #111827; font-size: 22px;">Role change notice</h2>
          <p style="margin: 0 0 12px; color: #4b5563;">Hello <strong>${safeName}</strong>,</p>
          <p style="margin: 0 0 12px; color: #4b5563;">Your account role has been updated in the system.</p>

          <div style="margin: 16px 0; padding: 14px 16px; border-radius: 12px; background: #f9fafb; border: 1px dashed #e5e7eb; color: #111827;">
            <div style="font-weight: 600;">Details</div>
            <ul style="margin: 8px 0 0 18px; color: #4b5563;">
              <li><strong>Previous role:</strong> ${fromRole}</li>
              <li><strong>New role:</strong> ${toRole}</li>
            </ul>
          </div>

          <p style="margin: 0 0 10px; color: #4b5563;">Please <strong>log out and log back in</strong> for the changes to take effect.</p>
          <p style="margin: 0; color: #4b5563;">If you did not expect this change, contact your administrator immediately.</p>
        </div>

        <div style="background: #f9fafb; padding: 14px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          <div style="font-weight: 600; color: #111827;">E.M. Cayetano Trading</div>
          <div>Rodriguez, Rizal • Manggahan & San Rafael Branches</div>
          <div style="margin-top: 6px;">This is an automated message. Please do not reply.</div>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// Helper: notify user of branch transfer
async function sendBranchTransferEmail(toEmail, fullName, fromBranch, toBranch) {
  const safeName = fullName || 'Team Member';
  const mailOptions = {
    from: `"E.M. Cayetano Trading Notifications" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your branch assignment has been updated',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #FFFF00, #FF0000); padding: 22px; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #111827;">E.M. Cayetano Trading</div>
          <div style="font-size: 13px; color: #111827; opacity: 0.9; margin-top: 4px;">Inventory Management System</div>
        </div>

        <div style="padding: 28px 30px 30px;">
          <h2 style="margin: 0 0 10px; color: #111827; font-size: 22px;">Branch assignment updated</h2>
          <p style="margin: 0 0 12px; color: #4b5563;">Hello <strong>${safeName}</strong>,</p>
          <p style="margin: 0 0 12px; color: #4b5563;">Your account has been moved to a new branch.</p>

          <div style="margin: 16px 0; padding: 14px 16px; border-radius: 12px; background: #f9fafb; border: 1px dashed #e5e7eb; color: #111827;">
            <div style="font-weight: 600;">Transfer details</div>
            <ul style="margin: 8px 0 0 18px; color: #4b5563;">
              <li><strong>Previous branch:</strong> ${fromBranch}</li>
              <li><strong>New branch:</strong> ${toBranch}</li>
            </ul>
          </div>

          <p style="margin: 0 0 10px; color: #4b5563;">Please sign in using the new branch to access inventory and reports. If you believe this was a mistake, contact your administrator.</p>
        </div>

        <div style="background: #f9fafb; padding: 14px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          <div style="font-weight: 600; color: #111827;">E.M. Cayetano Trading</div>
          <div>Rodriguez, Rizal • Manggahan & San Rafael Branches</div>
          <div style="margin-top: 6px;">This is an automated message. Please do not reply.</div>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// Helper: notify user that their registration was not approved
async function sendRejectionEmail(toEmail, fullName, branch) {
  const safeName = fullName || 'Team Member';
  const safeBranch = branch || 'your selected branch';

  const mailOptions = {
    from: `"E.M. Cayetano Trading Notifications" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Update on your registration request',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #FFFF00, #FF0000); padding: 22px; text-align: center;">
          <div style="font-size: 20px; font-weight: 700; color: #111827;">E.M. Cayetano Trading</div>
          <div style="font-size: 13px; color: #111827; opacity: 0.9; margin-top: 4px;">Inventory Management System</div>
        </div>

        <div style="padding: 28px 30px 30px;">
          <h2 style="margin: 0 0 10px; color: #111827; font-size: 22px;">Registration status update</h2>
          <p style="margin: 0 0 12px; color: #4b5563;">Hello <strong>${safeName}</strong>,</p>
          <p style="margin: 0 0 12px; color: #4b5563;">Thank you for applying to join <strong>E.M. Cayetano Trading</strong>. After review, we were not able to approve your registration at this time.</p>

          <div style="margin: 16px 0; padding: 14px 16px; border-radius: 12px; background: #f9fafb; border: 1px dashed #e5e7eb; color: #111827;">
            <div style="font-weight: 600;">Summary</div>
            <ul style="margin: 8px 0 0 18px; color: #4b5563;">
              <li><strong>Branch:</strong> ${safeBranch}</li>
              <li>Status: Registration not approved</li>
            </ul>
          </div>

          <p style="margin: 0 0 10px; color: #4b5563;">If you believe this was a mistake or have questions, please reach out to your branch administrator so we can review your request together.</p>
          <p style="margin: 0; color: #4b5563;">You may submit a new registration in the future if circumstances change.</p>
        </div>

        <div style="background: #f9fafb; padding: 14px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          <div style="font-weight: 600; color: #111827;">E.M. Cayetano Trading</div>
          <div>Rodriguez, Rizal • Manggahan & San Rafael Branches</div>
          <div style="margin-top: 6px;">This is an automated message. Please do not reply.</div>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// ADMIN ROUTES (RBAC + branch isolation)
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const branch = req.user.branch; // branch selected during login
    const result = await pool.query(
      `SELECT user_id, full_name, username, email, role, branch, status, created_at
       FROM users
       WHERE branch = $1
       ORDER BY created_at DESC NULLS LAST`,
      [branch]
    );
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('Fetch users error:', err);
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

app.post('/api/admin/users/:id/approve', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const branch = req.user.branch;
    const update = await pool.query(
      `UPDATE users
         SET status = 'Active'
       WHERE user_id = $1 AND branch = $2
       RETURNING user_id, full_name, email, username, branch, status`,
      [id, branch]
    );

    if (update.rowCount === 0) {
      return res.status(404).json({ error: 'User not found in this branch' });
    }

    const user = update.rows[0];
    await sendActivationEmail(user.email, user.full_name);

    return res.json({ message: 'User approved and activated', user });
  } catch (err) {
    console.error('Approve user error:', err);
    return res.status(500).json({ error: 'Failed to approve user' });
  }
});

app.post('/api/admin/users/:id/reject', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const branch = req.user.branch;
    const update = await pool.query(
      `UPDATE users
         SET status = 'Inactive'
       WHERE user_id = $1 AND branch = $2
       RETURNING user_id, full_name, email, username, branch, status`,
      [id, branch]
    );

    if (update.rowCount === 0) {
      return res.status(404).json({ error: 'User not found in this branch' });
    }

    const user = update.rows[0];
    try {
      await sendRejectionEmail(user.email, user.full_name, user.branch);
    } catch (mailErr) {
      console.error('Rejection email failed:', mailErr);
    }

    return res.json({ message: 'User rejected/deactivated', user });
  } catch (err) {
    console.error('Reject user error:', err);
    return res.status(500).json({ error: 'Failed to reject user' });
  }
});

// ROUTE: Update user role with safeguards and audit logging
app.post('/api/admin/users/:id/role', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const newRole = (req.body.role || '').trim();

  const allowedRoles = ['Admin', 'Employee'];
  if (!allowedRoles.includes(newRole)) {
    return res.status(400).json({ error: 'Invalid role selection' });
  }

  try {
    const branch = req.user.branch;

    // Fetch target user within the admin's branch scope
    const userResult = await pool.query(
      `SELECT user_id, full_name, email, username, branch, role, status
         FROM users
        WHERE user_id = $1 AND branch = $2`,
      [id, branch]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found in this branch' });
    }

    const targetUser = userResult.rows[0];
    const oldRole = targetUser.role;

    if (oldRole === newRole) {
      return res.status(400).json({ error: 'User already has this role' });
    }

    // Prevent removing the last active Admin (self or others)
    if (oldRole === 'Admin' && newRole !== 'Admin') {
      const adminCountResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM users WHERE role = 'Admin' AND status = 'Active'`
      );
      const activeAdmins = adminCountResult.rows[0]?.count || 0;
      if (activeAdmins <= 1) {
        return res.status(400).json({ error: 'Cannot change role: At least one Admin is required to manage the system.' });
      }
    }

    const updated = await pool.query(
      `UPDATE users
          SET role = $1, token_version = COALESCE(token_version, 0) + 1
        WHERE user_id = $2
        RETURNING user_id, full_name, email, username, branch, role, status, token_version`,
      [newRole, id]
    );

    const updatedUser = updated.rows[0];

    // Basic audit log table (create if missing) and entry
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        actor_id INT,
        actor_name TEXT,
        target_id INT,
        target_name TEXT,
        action TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`);

    const actorResult = await pool.query('SELECT full_name FROM users WHERE user_id = $1', [req.user.id]);
    const actorName = actorResult.rows[0]?.full_name || 'Admin';

    await pool.query(
      `INSERT INTO audit_logs (actor_id, actor_name, target_id, target_name, action)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, actorName, updatedUser.user_id, updatedUser.full_name, `Changed role from ${oldRole} to ${newRole}`]
    );

    // Fire-and-forget email notification
    sendRoleChangeEmail(updatedUser.email, updatedUser.full_name, oldRole, newRole)
      .catch(err => console.error('Role change email failed:', err));

    const selfDemoted = req.user.id === updatedUser.user_id && newRole !== 'Admin';
    return res.json({ message: 'User role updated', user: updatedUser, selfDemoted });
  } catch (err) {
    console.error('Update role error:', err);
    return res.status(500).json({ error: 'Failed to update user role' });
  }
});

// ROUTE: Transfer user to another branch (removes visibility from the old branch)
app.post('/api/admin/users/:id/branch', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const newBranch = (req.body.branch || '').trim();

  if (!newBranch) {
    return res.status(400).json({ error: 'New branch is required' });
  }

  // Limit to known branches to avoid typos; adjust if more branches are added.
  const allowedBranches = ['Manggahan', 'San Rafael'];
  if (!allowedBranches.includes(newBranch)) {
    return res.status(400).json({ error: 'Invalid branch selection' });
  }

  try {
    const currentBranch = req.user.branch;

    // Ensure the admin only transfers users from their current branch view
    const userResult = await pool.query(
      `SELECT user_id, full_name, email, username, branch, role, status
       FROM users
       WHERE user_id = $1 AND branch = $2`,
      [id, currentBranch]
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
         SET branch = $1
       WHERE user_id = $2
       RETURNING user_id, full_name, email, username, branch, role, status`,
      [newBranch, id]
    );

    const updatedUser = updated.rows[0];

    // Fire-and-forget email; do not block the response if mail fails
    sendBranchTransferEmail(updatedUser.email, updatedUser.full_name, user.branch, newBranch)
      .catch(err => console.error('Branch transfer email failed:', err));

    return res.json({ message: 'User branch updated', user: updatedUser });
  } catch (err) {
    console.error('Transfer user branch error:', err);
    return res.status(500).json({ error: 'Failed to transfer user branch' });
  }
});

// 4. START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ROUTE: Send OTP (after password check; sends login 2FA code)
app.post('/api/auth/send-otp', async (req, res) => {
  const { username } = req.body;

  try {
    // 1. Find User
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const user = userResult.rows[0];

    // 2. Generate 6-digit Code
    const issuedAt = Date.now();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 3. Save to DB (Valid for 5 minutes)
    const expiresAt = new Date(issuedAt + OTP_TTL_MS); // Now + 2 mins
    await pool.query('UPDATE users SET otp_code = $1, otp_expires = $2 WHERE user_id = $3', [otp, expiresAt, user.user_id]);

    // 4. Send Professional HTML Email
    const mailOptions = {
      // "Display Name" <actual-email-for-auth>
      from: `"E.M. Cayetano Trading - Security" <${process.env.EMAIL_USER}>`, 
      to: user.email,
      subject: '2FA Login Verification',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #FFFF00, #FF0000); padding: 24px; text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: #111827;">E.M. Cayetano Trading</div>
            <div style="font-size: 13px; color: #111827; opacity: 0.9; margin-top: 4px;">Inventory Management System</div>
          </div>
          
          <div style="padding: 28px 32px 32px;">
            <h2 style="color: #111827; margin: 0 0 8px;">Security Verification</h2>
            <p style="color: #4b5563; margin: 0 0 12px;">Hello <strong>${user.username}</strong>,</p>
            <p style="color: #4b5563; margin: 0 0 16px;">A login attempt was detected for your account. Use the code below to continue.</p>
            
            <div style="background: #f9fafb; border: 1px dashed #e5e7eb; border-radius: 12px; padding: 16px; text-align: center;">
              <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827;">${otp}</span>
              <div style="margin-top: 8px; font-size: 14px; color: #dc2626; font-weight: 600;">Expires in 2 minutes</div>
              <div style="margin-top: 4px; font-size: 12px; color: #6b7280;">For your security, this verification code will expire in 2 minutes.</div>
            </div>

            <p style="color: #4b5563; font-size: 14px; margin: 18px 0 0;">If this wasn't you, please secure your account immediately.</p>
          </div>

          <div style="background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
            <div style="font-weight: 600; color: #111827;">E.M. Cayetano Trading</div>
            <div>Rodriguez, Rizal • Manggahan & San Rafael Branches</div>
            <div style="margin-top: 6px;">This is an automated message. Please do not reply.</div>
            <div style="margin-top: 4px;">© 2026 E.M. Cayetano Trading System</div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "OTP sent successfully to email", expiresAt: expiresAt.toISOString(), serverTime: issuedAt });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ROUTE: Verify OTP (finalize login, clear OTP, issue JWT)
app.post('/api/auth/verify-otp', async (req, res) => {
  const username = req.body.username;
  const code = (req.body.code || '').replace(/\s+/g, '');
  const branch = req.body.branch;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const user = result.rows[0];

    // Check Logic
    const now = new Date();
    if (user.otp_code !== code) {
      return res.status(400).json({ error: "Invalid code" });
    }
    // Grace window (15s) to tolerate drift/latency
    if (new Date(user.otp_expires).getTime() + 15000 < now.getTime()) {
      return res.status(400).json({ error: "Code expired" });
    }

    // Success - Clear the code so it can't be used twice
    await pool.query('UPDATE users SET otp_code = NULL WHERE user_id = $1', [user.user_id]);

    // Issue the real Token here (Moved from Login route)
    const selectedBranch = branch && branch.trim() ? branch.trim() : null;

    // If not admin, ensure branch (if provided) matches account branch
    if (user.role !== 'Admin' && selectedBranch && selectedBranch !== user.branch) {
      return res.status(403).json({ error: "Selected branch does not match your account" });
    }

    const sessionBranch = user.role === 'Admin' && selectedBranch ? selectedBranch : user.branch;
    const userResponse = { ...user, branch: sessionBranch };

    const token = jwt.sign(
      { id: user.user_id, role: user.role, branch: sessionBranch, tokenVersion: user.token_version || 0 },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ message: "Login Verified", token, user: userResponse });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});