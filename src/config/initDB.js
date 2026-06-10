const bcrypt = require('bcryptjs');
const { pool } = require('./database');

const initDatabase = async () => {
  try {
    if (process.env.VERCEL) {
      console.log('Vercel environment — skipping DB init.');
      return;
    }

    try {
      await pool.query('SELECT 1');
    } catch (connErr) {
      console.warn('Database not reachable, skipping init:', connErr.message);
      return;
    }

    const typeResult = await pool.query("SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') AS exists");
    const typesExist = typeResult.rows[0].exists;

    if (!typesExist) {
      console.log('Types/Tables not found. Please run src/config/supabase-schema.sql in Supabase SQL Editor.');
      console.log('Skipping auto-init — schema must be applied manually via Supabase dashboard.');
      return;
    }

    const result = await pool.query(
      "SELECT id FROM users WHERE email = 'admin@socialmedia.com'"
    );

    if (result.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('Admin@123', 12);
      await pool.query(
        `INSERT INTO users (uuid, username, email, password, full_name, role)
         VALUES (gen_random_uuid(), 'admin', 'admin@socialmedia.com', $1, 'Super Admin', 'admin')`,
        [hashedPassword]
      );
      console.log('Admin account seeded: admin@socialmedia.com');
    }

    console.log('Database initialized');
  } catch (error) {
    console.warn('Database initialization skipped:', error.message);
  }
};

module.exports = initDatabase;
