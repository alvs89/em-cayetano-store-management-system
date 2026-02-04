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

// UPDATED LOGIN ROUTE (With 2FA Enforcement)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Check User
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
    
    const user = userResult.rows[0];

    // 2. Validate Password
    // Special Dev Backdoor for 'admin' (Keep this for now!)
    const isDevAdmin = false; // (username === 'admin' && password === 'admin123');
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword && !isDevAdmin) return res.status(401).json({ error: "Invalid credentials" });

    // 3. DECISION TIME:
    // If it's the Dev Admin, give token immediately (Bypass 2FA for testing)
    if (isDevAdmin) {
        const token = jwt.sign({ id: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
        return res.json({ 
            token, 
            user: { id: user.user_id, username: user.username, role: user.role } 
        });
    }

    // For ALL other users: DO NOT send Token. Require 2FA.
    res.json({ 
        message: "2FA Required", 
        require2fa: true, 
        username: user.username,
        email: user.email // Send this so frontend can show "Sent to a***@gmail.com"
    });

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

    // 4. Send Email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Your 2FA Login Code - E.M. Cayetano',
      text: `Your login verification code is: ${otp}. It expires in 5 minutes.`
    };

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