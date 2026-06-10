/**
 * Auth Controller - Sesuai materi Pertemuan 7
 * 
 * Alur sesuai slide:
 * REGISTER: Client kirim data → validasi → cek duplikat → hash password → simpan ke DB
 * LOGIN   : Client kirim email+password → cek DB → verifyPassword (hash) → signJwt → return token
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { signJwt } = require('../utils/jwt');  // sesuai nama di slide
const { success, error } = require('../utils/response');
const { logActivity } = require('../utils/logger');

// ──────────────────────────────────────────────────────────────
// POST /api/auth/register
// Client mengirim: username, email, password, full_name
// ──────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;

    // 1. Validasi input
    if (!username || !email || !password) {
      return error(res, 'Username, email, dan password wajib diisi.', 400);
    }
    if (password.length < 8) {
      return error(res, 'Password minimal 8 karakter.', 400);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return error(res, 'Format email tidak valid.', 400);
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return error(res, 'Username hanya boleh huruf, angka, dan underscore (3-20 karakter).', 400);
    }

    // 2. Cek duplikat ke database
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email.toLowerCase(), username.toLowerCase()]
    );
    if (existing.length > 0) {
      return error(res, 'Email atau username sudah digunakan.', 409);
    }

    // 3. Hash password dengan bcrypt (salt rounds = 12)
    const hashedPassword = await bcrypt.hash(password, 12);
    const uuid = uuidv4();

    // 4. Simpan user ke database
    const [result] = await pool.query(
      `INSERT INTO users (uuid, username, email, password, full_name, role)
       VALUES (?, ?, ?, ?, ?, 'user')`,
      [uuid, username.toLowerCase(), email.toLowerCase(), hashedPassword, full_name || username]
    );

    await logActivity(result.insertId, 'register', 'user', result.insertId, req.ip);

    // 5. Return response sukses (TANPA token - user harus login dulu)
    return success(res, {
      uuid,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      role: 'user',
    }, 'Registrasi berhasil. Silakan login untuk mendapatkan token.', 201);

  } catch (err) {
    console.error('[Register Error]:', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ──────────────────────────────────────────────────────────────
// POST /api/auth/login
// Alur sesuai slide: cek DB → verifyPassword → signJwt → return token
// ──────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validasi input
    if (!email || !password) {
      return error(res, 'Email dan password wajib diisi.', 400);
    }

    // 2. Server mengecek data user ke database
    const [rows] = await pool.query(
      `SELECT id, uuid, username, email, password, full_name, role, is_active, is_banned
       FROM users WHERE email = ? LIMIT 1`,
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return error(res, 'Email atau password salah.', 401);
    }

    const user = rows[0];

    // 3. Cek status akun
    if (user.is_banned) {
      return error(res, 'Akun Anda telah dibanned oleh admin.', 403);
    }
    if (!user.is_active) {
      return error(res, 'Akun Anda tidak aktif.', 403);
    }

    // 4. Server memverifikasi password (hash) - sesuai slide
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return error(res, 'Email atau password salah.', 401);
    }

    // 5. Jika valid, server membuat token JWT menggunakan signJwt
    //    Token berisi data user: id, username, email, role
    const token = signJwt({
      sub: user.id,          // subject (id user) - sesuai struktur JWT di slide
      id: user.id,
      uuid: user.uuid,
      username: user.username,
      email: user.email,
      role: user.role,
    });

    await logActivity(user.id, 'login', 'user', user.id, req.ip);

    // 6. Server mengirim token ke client
    //    Client menyimpan token dan mengirimnya di header Authorization
    return success(res, {
      token,
      token_type: 'Bearer',               // cara pengiriman: Authorization: Bearer <token>
      expires_in: process.env.JWT_EXPIRES_IN || '7d',
      user: {
        id: user.id,
        uuid: user.uuid,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    }, 'Login berhasil. Gunakan token untuk mengakses endpoint yang dilindungi.');

  } catch (err) {
    console.error('[Login Error]:', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = { register, login };
