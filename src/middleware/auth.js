/**
 * Auth Middleware - Sesuai materi Pertemuan 7
 * 
 * Fungsi:
 * - verifyToken   : Client mengirim token pada header Authorization → server memverifikasi
 * - authorize     : Membatasi akses berdasarkan role (exact match)
 * - requireRole   : Membatasi akses berdasarkan hierarki role (admin ≥ moderator ≥ user)
 * - optionalAuth  : Token boleh ada atau tidak (untuk endpoint publik)
 * 
 * Hierarki role:
 *   admin > moderator > user
 *   requireRole('moderator') → admin & moderator diizinkan
 *   requireRole('user')      → semua role diizinkan
 * 
 * Cara client mengirim token (sesuai slide):
 *   Header: Authorization: Bearer <token>
 */
const { verifyJwt } = require('../utils/jwt');
const { pool } = require('../config/database');
const { error } = require('../utils/response');

// Urutan hierarki role (semakin ke kanan semakin tinggi)
const ROLE_HIERARCHY = ['user', 'moderator', 'admin'];

// ──────────────────────────────────────────────────────────────
// Middleware: verifyToken
// Memverifikasi token JWT dari header Authorization
// ──────────────────────────────────────────────────────────────
const verifyToken = async (req, res, next) => {
  try {
    // Ambil token dari header Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res,
        'Akses ditolak. Token tidak ditemukan. Sertakan header: Authorization: Bearer <token>',
        401
      );
    }

    const token = authHeader.slice(7); // Hapus prefix "Bearer "

    // Server memverifikasi token (sesuai slide)
    let decoded;
    try {
      decoded = verifyJwt(token);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return error(res, 'Token telah kadaluarsa. Silakan login ulang.', 401);
      }
      return error(res, 'Token tidak valid.', 401);
    }

    // Cek user masih ada dan aktif di database
    const [rows] = await pool.query(
      `SELECT id, uuid, username, email, full_name, role, is_active, is_banned
       FROM users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );

    if (rows.length === 0) {
      return error(res, 'User tidak ditemukan.', 401);
    }

    const user = rows[0];

    if (!user.is_active || user.is_banned) {
      return error(res, 'Akun Anda dinonaktifkan atau dibanned.', 403);
    }

    // Inject data user ke request (bisa diakses di controller)
    req.user = user;
    next();

  } catch (err) {
    console.error('[verifyToken Error]:', err.message);
    return error(res, 'Terjadi kesalahan autentikasi.', 500);
  }
};

// ──────────────────────────────────────────────────────────────
// Middleware: authorize (EXACT match)
// Membatasi akses berdasarkan role user (harus tepat salah satu)
// Contoh: authorize('admin') atau authorize('moderator', 'admin')
// ──────────────────────────────────────────────────────────────
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Autentikasi diperlukan.', 401);
    }
    if (!roles.includes(req.user.role)) {
      return error(res,
        `Akses ditolak. Endpoint ini hanya untuk role: ${roles.join(', ')}. Role Anda: ${req.user.role}`,
        403
      );
    }
    next();
  };
};

// ──────────────────────────────────────────────────────────────
// Middleware: requireRole (HIERARCHY-aware)
// User dengan role di atas minimum yang ditentukan juga diizinkan.
// Contoh: requireRole('moderator') → admin & moderator diizinkan
//          requireRole('admin')    → hanya admin
// ──────────────────────────────────────────────────────────────
const requireRole = (minimumRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Autentikasi diperlukan.', 401);
    }

    const userLevel = ROLE_HIERARCHY.indexOf(req.user.role);
    const requiredLevel = ROLE_HIERARCHY.indexOf(minimumRole);

    if (userLevel === -1) {
      return error(res, `Role tidak dikenal: ${req.user.role}`, 403);
    }
    if (requiredLevel === -1) {
      return error(res, `Role minimum tidak valid: ${minimumRole}`, 500);
    }
    if (userLevel < requiredLevel) {
      return error(res,
        `Akses ditolak. Minimal role "${minimumRole}" diperlukan. Role Anda: ${req.user.role}`,
        403
      );
    }

    next();
  };
};

// ──────────────────────────────────────────────────────────────
// Middleware: optionalAuth
// Token tidak wajib, tapi jika ada akan di-decode
// Untuk endpoint publik yang bisa diakses dengan atau tanpa login
// ──────────────────────────────────────────────────────────────
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = verifyJwt(token);
      const [rows] = await pool.query(
        'SELECT id, uuid, username, email, role FROM users WHERE id = ? AND is_active = 1 AND is_banned = 0',
        [decoded.id]
      );
      if (rows.length > 0) req.user = rows[0];
    }
  } catch (_) {
    // Token invalid diabaikan untuk optional auth
  }
  next();
};

module.exports = { verifyToken, authorize, requireRole, optionalAuth };
