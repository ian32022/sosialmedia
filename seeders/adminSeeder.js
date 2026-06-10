const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../src/config/database');

const seed = async () => {
  try {
    console.log('⏳ Menjalankan seeder...\n');

    // ─── Admin ───────────────────────────────────────────────
    const [adminRows] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      ['admin@socialmedia.com']
    );

    if (adminRows.length === 0) {
      const hashed = await bcrypt.hash('Admin@123', 12);
      await pool.query(
        `INSERT INTO users (uuid, username, email, password, full_name, role, is_active, is_banned)
         VALUES (?, ?, ?, ?, ?, 'admin', 1, 0)`,
        [uuidv4(), 'admin', 'admin@socialmedia.com', hashed, 'Super Admin']
      );
      console.log('✅ Admin berhasil dibuat: admin@socialmedia.com / Admin@123');
    } else {
      console.log('ℹ️  Admin sudah ada, dilewati.');
    }

    // ─── Moderator ───────────────────────────────────────────
    const [modRows] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      ['moderator@socialmedia.com']
    );

    if (modRows.length === 0) {
      const hashed = await bcrypt.hash('Moderator@123', 12);
      await pool.query(
        `INSERT INTO users (uuid, username, email, password, full_name, role, is_active, is_banned)
         VALUES (?, ?, ?, ?, ?, 'moderator', 1, 0)`,
        [uuidv4(), 'moderator', 'moderator@socialmedia.com', hashed, 'Moderator Satu']
      );
      console.log('✅ Moderator berhasil dibuat: moderator@socialmedia.com / Moderator@123');
    } else {
      console.log('ℹ️  Moderator sudah ada, dilewati.');
    }

    console.log('\n✅ Seeder selesai.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeder gagal:', err.message);
    process.exit(1);
  }
};

seed();
