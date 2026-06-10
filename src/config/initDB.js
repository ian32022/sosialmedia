const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

const DB_NAME = process.env.DB_NAME || 'social_media_db';

const SCHEMA_FILES = [
  'schema.sql',
  'schema_hashtags.sql',
  'schema_chat.sql',
  'schema_notifications.sql',
  'schema_stories.sql',
];

const initDatabase = async () => {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${DB_NAME}\``);

    for (const file of SCHEMA_FILES) {
      const filePath = path.join(__dirname, file);
      if (!fs.existsSync(filePath)) continue;

      const sql = fs.readFileSync(filePath, 'utf8');
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const stmt of statements) {
        try {
          await connection.query(stmt);
        } catch (err) {
          if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_ENTRY') continue;
          console.warn(`[InitDB] ${err.message}`);
        }
      }
    }

    const [rows] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      ['admin@socialmedia.com']
    );

    if (rows.length === 0) {
      const hashedPassword = await bcrypt.hash('Admin@123', 12);
      await connection.query(
        `INSERT INTO users (uuid, username, email, password, full_name, role)
         VALUES (UUID(), ?, ?, ?, ?, ?)`,
        ['admin', 'admin@socialmedia.com', hashedPassword, 'Super Admin', 'admin']
      );
    }

    console.log('✅ Database initialized');
    console.log('✅ Admin account ready: admin@socialmedia.com');
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
};

module.exports = initDatabase;
