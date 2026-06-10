const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASSWORD || '')}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'postgres'}`,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const testConnection = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('Database Supabase (PostgreSQL) berhasil terhubung');
  } catch (error) {
    console.warn('Koneksi database gagal:', error.message);
    console.warn('Server tetap jalan, query akan error sampai DB tersedia.');
  }
};

module.exports = { pool, testConnection };
