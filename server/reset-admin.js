// server/reset-admin.js
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const updateAdminPassword = async () => {
  try {
    const password = 'admin123'; // The password we want to use
    console.log(`🔐 Hashing password: ${password}...`);

    // 1. Generate a secure hash
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // 2. Update the database
    const res = await pool.query(
      "UPDATE users SET password_hash = $1 WHERE username = 'admin' RETURNING *",
      [hash]
    );

    if (res.rows.length > 0) {
      console.log("✅ SUCCESS: Admin password updated.");
      console.log(`   New Hash: ${hash.substring(0, 20)}...`);
    } else {
      console.log("❌ ERROR: User 'admin' not found in database.");
    }

  } catch (err) {
    console.error("❌ Database Error:", err.message);
  } finally {
    pool.end();
  }
};

updateAdminPassword();