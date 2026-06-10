const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/database');

const ADMIN_EMAIL = 'admin@socialmedia.com';
const CORRECT_PASSWORD = 'Admin@123';

const fix = async () => {
  try {
    console.log('⏳ Memeriksa password admin...\n');

    const [rows] = await pool.query(
      'SELECT id, username, email, password, role FROM users WHERE email = ?',
      [ADMIN_EMAIL]
    );

    if (rows.length === 0) {
      console.log('❌ Admin tidak ditemukan di database. Jalankan seeder dulu: npm run seed');
      process.exit(1);
    }

    const user = rows[0];
    console.log(`   Ditemukan: ${user.email} (role: ${user.role})`);
    console.log(`   Stored hash: ${user.password.substring(0, 30)}...`);

    // Coba verifikasi dengan password yang benar
    let isValid = false;
    try {
      isValid = await bcrypt.compare(CORRECT_PASSWORD, user.password);
    } catch (_) {
      // kemungkinan hash tidak valid
    }

    if (isValid) {
      console.log('✅ Password admin sudah valid (bcrypt hash cocok).');
      console.log('   Tidak perlu perbaikan.');
      process.exit(0);
    }

    // Cek apakah password tersimpan sebagai plain text
    const isPlainText = !user.password.startsWith('$2');
    if (isPlainText) {
      console.log('⚠️  Password tersimpan sebagai PLAIN TEXT.');
    } else {
      console.log('⚠️  Hash bcrypt tidak cocok dengan password yang diharapkan.');
      console.log('   (Mungkin di-hash dengan password yang berbeda)');
    }

    // Rehash dengan password yang benar
    const hashed = await bcrypt.hash(CORRECT_PASSWORD, 12);
    await pool.query('UPDATE users SET password = ? WHERE email = ?', [hashed, ADMIN_EMAIL]);
    console.log('✅ Password admin telah diperbaiki dan di-rehash.');
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Password: ${CORRECT_PASSWORD}`);

    // Verifikasi hasil
    const [updated] = await pool.query(
      'SELECT password FROM users WHERE email = ?', [ADMIN_EMAIL]
    );
    const verified = await bcrypt.compare(CORRECT_PASSWORD, updated[0].password);
    console.log(`   Verifikasi: ${verified ? 'BERHASIL ✅' : 'GAGAL ❌'}`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Gagal memperbaiki password:', err.message);
    process.exit(1);
  }
};

fix();
