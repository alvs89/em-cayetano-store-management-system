// server/index.js
require('dotenv').config();
const nodemailer = require('nodemailer');
const crypto = require('crypto'); // Built-in Node module for random numbers
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// 1. MIDDLEWARE (Security & Data Parsing)
app.use(cors()); // Allows your React client to talk to this server
app.use(express.json()); // Allows server to read JSON body from requests

// 2. DATABASE CONNECTION
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// EMAIL TRANSPORTER
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

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

    // 2. UPDATED BRANCH VALIDATION (Admin Exception)
    // If the user is NOT an Admin, enforce the branch check.
    if (user.role !== 'Admin' && user.branch !== branch) {
      return res.status(403).json({ 
        error: `Access Denied: You are registered at the ${user.branch} branch.` 
      });
    }

    // 3. Validate Password
    const isDevAdmin = (username === 'admin' && password === 'admin123');
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword && !isDevAdmin) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // 4. Handle 2FA Flow
    // Even if it's a real Admin, we still send a 2FA code for security unless it's the dev backdoor
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

// ROUTE: Register New User
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

// ROUTE: Request Password Reset (Send OTP)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) return res.status(404).json({ error: "Email not found" });

    // Generate Code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000); // 10 mins

    // Save to DB
    await pool.query('UPDATE users SET otp_code = $1, otp_expires = $2 WHERE email = $3', [otp, expiresAt, email]);

    // Send Email
    const mailOptions = {
      // The format is: "DISPLAY NAME" <email_address>
      from: `"E.M. Cayetano Security" <${process.env.EMAIL_USER}>`, 
      to: user.email,
      subject: '🔐 2FA Login Verification',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Reset Your Password</h2>
          <p>Your password reset code is:</p>
          <h1 style="color: #2563eb; letter-spacing: 5px;">${otp}</h1>
          <p>If you did not request this, please ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: "OTP sent" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// ROUTE: Reset Password (Verify OTP & Update)
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    // Verify OTP
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
    
    const user = userResult.rows[0];
    if (user.otp_code !== otp || new Date() > new Date(user.otp_expires)) {
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

// ROUTE: Send OTP
app.post('/api/auth/send-otp', async (req, res) => {
  const { username } = req.body;

  try {
    // 1. Find User
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const user = userResult.rows[0];

    // 2. Generate 6-digit Code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 3. Save to DB (Valid for 5 minutes)
    const expiresAt = new Date(Date.now() + 5 * 60000); // Now + 5 mins
    await pool.query('UPDATE users SET otp_code = $1, otp_expires = $2 WHERE user_id = $3', [otp, expiresAt, user.user_id]);

    // 4. Send Professional HTML Email
    const mailOptions = {
      // "Display Name" <actual-email-for-auth>
      from: `"E.M. Cayetano Trading - Security" <${process.env.EMAIL_USER}>`, 
      to: user.email,
      subject: '🔐 2FA Login Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #2563eb; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 20px;">E.M. Cayetano Trading</h1>
          </div>
          
          <div style="padding: 30px; background-color: #ffffff;">
            <h2 style="color: #1f2937; margin-top: 0;">Security Verification</h2>
            <p style="color: #4b5563;">Hello <strong>${user.username}</strong>,</p>
            <p style="color: #4b5563;">A login attempt was detected for your account. Please use the verification code below to complete your sign-in:</p>
            
            <div style="background-color: #f3f4f6; padding: 15px; margin: 20px 0; text-align: center; border-radius: 6px;">
              <span style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #111827;">${otp}</span>
            </div>

            <p style="color: #4b5563; font-size: 14px;">This code expires in <strong>5 minutes</strong>.</p>
          </div>

          <div style="background-color: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0;">This is an automated message. Please do not reply to this email.</p>
            <p style="margin: 5px 0 0;">&copy; 2026 E.M. Cayetano Trading System</p>
          </div>
        </div>
      `
    };

    // ... rest of the code (await transporter.sendMail) ...
    await transporter.sendMail(mailOptions);
    res.json({ message: "OTP sent successfully to email" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// ROUTE: Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  const { username, code } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const user = result.rows[0];

    // Check Logic
    const now = new Date();
    if (user.otp_code !== code) {
      return res.status(400).json({ error: "Invalid code" });
    }
    if (new Date(user.otp_expires) < now) {
      return res.status(400).json({ error: "Code expired" });
    }

    // Success - Clear the code so it can't be used twice
    await pool.query('UPDATE users SET otp_code = NULL WHERE user_id = $1', [user.user_id]);

    // Issue the real Token here (Moved from Login route)
    const token = jwt.sign(
        { id: user.user_id, role: user.role, branch: user.branch },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    );

    res.json({ message: "Login Verified", token, user });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});