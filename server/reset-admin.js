require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Use the Cloud URL from your .env (Neon/Postgres)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// One-time helper: reset the seeded admin user's password to admin123
async function resetAdmin() {
  const username = 'admin';
  const newPassword = 'admin123';

  try {
    console.log(`🔐 Hashing password for user: ${username}...`);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const result = await pool.query(
      "UPDATE users SET password_hash = $1, status = 'Active', role = 'Admin' WHERE username = $2 RETURNING username",
      [hashedPassword, username]
    );

    if (result.rows.length > 0) {
      console.log(`✅ SUCCESS: Password for '${username}' has been updated to 'admin123'.`);
    } else {
      console.error(`❌ ERROR: User '${username}' not found in the database. Please run the INSERT SQL in Neon first.`);
    }
  } catch (err) {
    console.error('❌ Database Error:', err.message);
  } finally {
    await pool.end();
  }
}

resetAdmin();