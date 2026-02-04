// server/index.js
require('dotenv').config();
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

// Test DB Connection on Startup
pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL Database'))
  .catch(err => console.error('❌ Database Connection Error:', err.message));

// 3. API ROUTES

// Health Check Route
app.get('/', (req, res) => {
  res.send('E.M. Cayetano Trading API is Running (v1.0)');
});

// AUTHENTICATION: Login Route (updated)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  console.log(`Login Attempt: ${username}`); // Log to terminal

  try {
    // 1. Check if user exists in DB
    const userQuery = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (userQuery.rows.length === 0) {
      console.log("User not found");
      return res.status(401).json({ error: "User not found" });
    }

    const user = userQuery.rows[0];

    // 2. HARDCODED BACKDOOR for Setup (Prevents crashes on invalid hashes)
    // We check this FIRST before using bcrypt
    const isDevAdmin = (username === 'admin' && password === 'admin123');

    if (isDevAdmin) {
       console.log("✅ Admin Login Bypass Success");
       // Generate Token
       const token = jwt.sign(
        { id: user.user_id, role: user.role, branch: user.branch },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );
      return res.json({ 
        message: "Login successful", 
        token, 
        user: { id: user.user_id, username: user.username, role: user.role } 
      });
    }

    // 3. Real Password Check (For all other users)
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      console.log("❌ Password Mismatch");
      return res.status(401).json({ error: "Invalid password" });
    }

    // 4. Success (Standard User)
    const token = jwt.sign(
      { id: user.user_id, role: user.role, branch: user.branch },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ 
      token, 
      user: { id: user.user_id, username: user.username, role: user.role } 
    });

  } catch (err) {
    console.error("SERVER ERROR:", err.message); // Look at your terminal for this!
    res.status(500).send("Server Error");
  }
});

// 4. START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});