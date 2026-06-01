// Administrative recovery script for resetting or recreating the seeded admin
// account password from a controlled environment variable.
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// One-time helper: reset or recreate the seeded admin user's password.
// Set ADMIN_RESET_PASSWORD in server/.env before running this script.
async function resetAdmin() {
  const username = 'admin';
  const newPassword = process.env.ADMIN_RESET_PASSWORD;

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required before running reset-admin.js.');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  if (!newPassword || newPassword.length < 8) {
    console.error('ADMIN_RESET_PASSWORD must be set in server/.env and must be at least 8 characters long.');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  try {
    await pool.query('CREATE SCHEMA IF NOT EXISTS public;');
    await pool.query('SET search_path TO public;');

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
        otp_code VARCHAR(10),
        otp_expires TIMESTAMP,
        login_otp_code VARCHAR(10),
        login_otp_expires TIMESTAMP,
        reset_otp_code VARCHAR(10),
        reset_otp_expires TIMESTAMP,
        token_version INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')
      );
    `);

    console.log(`Hashing password for user: ${username}...`);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const result = await pool.query(
      `INSERT INTO users (full_name, username, email, password_hash, role, branch, status, token_version)
       VALUES ($1, $2, $3, $4, 'Admin', 'Manggahan', 'Active', 0)
       ON CONFLICT (username)
       DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         status = 'Active',
         role = 'Admin',
         branch = COALESCE(users.branch, EXCLUDED.branch),
         token_version = COALESCE(users.token_version, 0) + 1
       RETURNING username`,
      ['System Administrator', username, 'admin@emcayetano.local', hashedPassword]
    );

    if (result.rows.length > 0) {
      console.log(`SUCCESS: Password for '${username}' has been updated.`);
    } else {
      console.error(`ERROR: User '${username}' was not updated.`);
    }
  } catch (err) {
    console.error('Database Error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

resetAdmin();
