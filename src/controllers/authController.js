const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { signJwt } = require('../utils/jwt');
const { success, error } = require('../utils/response');
const { logActivity } = require('../utils/logger');

const register = async (req, res) => {
  try {
    const { username, email, password, full_name } = req.body;

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

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return error(res, 'Email atau username sudah digunakan.', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const uuid = uuidv4();

    const result = await pool.query(
      `INSERT INTO users (uuid, username, email, password, full_name, role)
       VALUES ($1, $2, $3, $4, $5, 'user') RETURNING id`,
      [uuid, username.toLowerCase(), email.toLowerCase(), hashedPassword, full_name || username]
    );

    await logActivity(result.rows[0].id, 'register', 'user', result.rows[0].id, req.ip);

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

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return error(res, 'Email dan password wajib diisi.', 400);
    }

    const result = await pool.query(
      `SELECT id, uuid, username, email, password, full_name, role, is_active, is_banned
       FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return error(res, 'Email atau password salah.', 401);
    }

    const user = result.rows[0];

    if (user.is_banned) {
      return error(res, 'Akun Anda telah dibanned oleh admin.', 403);
    }
    if (!user.is_active) {
      return error(res, 'Akun Anda tidak aktif.', 403);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return error(res, 'Email atau password salah.', 401);
    }

    const token = signJwt({
      sub: user.id,
      id: user.id,
      uuid: user.uuid,
      username: user.username,
      email: user.email,
      role: user.role,
    });

    await logActivity(user.id, 'login', 'user', user.id, req.ip);

    return success(res, {
      token,
      token_type: 'Bearer',
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
