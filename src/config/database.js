const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'social_media_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: process.env.DB_TIMEZONE || '+00:00',
});

const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database MySQL berhasil terhubung');
    connection.release();
  } catch (error) {
    console.error('❌ Koneksi database gagal:', error.message);
    console.error('Error code:', error.code);        // tambah ini
    console.error('Error errno:', error.errno);      // tambah ini
    process.exit(1);
  }
};

module.exports = { pool, testConnection };
