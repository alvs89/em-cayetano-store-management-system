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
const OTP_GRACE_MS = 10 * 1000; // +10s network/drift buffer (total acceptance ~130s)

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


// Test DB Connection on Startup and ensure OTP columns exist for fresh databases
async function ensureSchema() {
  // Add any missing columns when deploying to a fresh Neon database
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS otp_expires TIMESTAMP
  `);

  // Normalize otp_expires to TIMESTAMPTZ to avoid timezone drift between server/client
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
          AND column_name = 'otp_expires' 
          AND data_type = 'timestamp without time zone'
      ) THEN
        ALTER TABLE users
          ALTER COLUMN otp_expires TYPE TIMESTAMPTZ
          USING (CASE WHEN otp_expires IS NULL THEN NULL ELSE otp_expires AT TIME ZONE 'UTC' END);
      END IF;
    END $$;
  `);
}

pool.connect()
  .then(async () => {
    console.log('✅ Connected to PostgreSQL Database');
    await ensureSchema();
    console.log('🛠️  Verified users table has otp columns');
  })
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

    // Enforce branch match for non-admin users (admins can pick any branch)
    if (user.role !== 'Admin' && user.branch !== branch) {
      return res.status(403).json({ 
        error: `Access Denied: You are registered at the ${user.branch} branch.` 
      });
    }

    // Validate password (and allow seeded dev backdoor for admin/admin123)
    const isDevAdmin = (username === 'admin' && password === 'admin123');
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword && !isDevAdmin) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // 2FA: only skip sending email when using the dev backdoor
    if (isDevAdmin) {
      const token = jwt.sign({ id: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
      return res.json({ 
        token, 
        user: { id: user.user_id, username: user.username, role: user.role } 
      });
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
      "INSERT INTO users (full_name, username, email, password_hash, role, branch, status) VALUES ($1, $2, $3, $4, $5, $6, 'Active') RETURNING user_id, username, role",
      [fullName, username, email, passwordHash, role || 'Employee', branch]
    );

    res.json({ message: "Registration successful", user: newUser.rows[0] });

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
  const { email, otp, newPassword } = req.body;
  try {
    // Verify OTP
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
    
    const user = userResult.rows[0];
    const expiresMs = new Date(user.otp_expires).getTime();
    const nowMs = Date.now();
    const expired = nowMs > expiresMs + OTP_GRACE_MS;
    // Grace window to tolerate clock drift/network latency
    if (user.otp_code !== otp || expired) {
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
    
    // 3. Save to DB (Valid for 2 minutes)
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
  const { username, code, branch } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const user = result.rows[0];

    // Check Logic
    const nowMs = Date.now();
    const expiresMs = new Date(user.otp_expires).getTime();
    if (user.otp_code !== code) {
      return res.status(400).json({ error: "Invalid code" });
    }
    // Grace window to tolerate drift/latency between UI timer and DB timestamp
    if (nowMs > expiresMs + OTP_GRACE_MS) {
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
        { id: user.user_id, role: user.role, branch: sessionBranch },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    );

    res.json({ message: "Login Verified", token, user: userResponse });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});