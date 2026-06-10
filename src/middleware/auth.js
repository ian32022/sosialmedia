const { verifyJwt } = require('../utils/jwt');
const { pool } = require('../config/database');
const { error } = require('../utils/response');

const ROLE_HIERARCHY = ['user', 'moderator', 'admin'];

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res,
        'Akses ditolak. Token tidak ditemukan. Sertakan header: Authorization: Bearer <token>',
        401
      );
    }

    const token = authHeader.slice(7);

    let decoded;
    try {
      decoded = verifyJwt(token);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return error(res, 'Token telah kadaluarsa. Silakan login ulang.', 401);
      }
      return error(res, 'Token tidak valid.', 401);
    }

    const result = await pool.query(
      `SELECT id, uuid, username, email, full_name, role, is_active, is_banned
       FROM users WHERE id = $1 LIMIT 1`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return error(res, 'User tidak ditemukan.', 401);
    }

    const user = result.rows[0];

    if (!user.is_active || user.is_banned) {
      return error(res, 'Akun Anda dinonaktifkan atau dibanned.', 403);
    }

    req.user = user;
    next();

  } catch (err) {
    console.error('[verifyToken Error]:', err.message);
    return error(res, 'Terjadi kesalahan autentikasi.', 500);
  }
};

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

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = verifyJwt(token);
      const result = await pool.query(
        'SELECT id, uuid, username, email, role FROM users WHERE id = $1 AND is_active = TRUE AND is_banned = FALSE',
        [decoded.id]
      );
      if (result.rows.length > 0) req.user = result.rows[0];
    }
  } catch (_) {
  }
  next();
};

module.exports = { verifyToken, authorize, requireRole, optionalAuth };
