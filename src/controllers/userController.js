/**
 * User Controller — Tahap 2 CRUD Core Entity
 * Entitas: Users (entitas ke-3)
 * Role Access:
 *   - admin      : READ semua user, UPDATE role/status siapapun, DELETE user
 *   - moderator  : READ semua user
 *   - user       : READ profil diri & orang lain, UPDATE profil sendiri, DELETE akun sendiri
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const { logActivity } = require('../utils/logger');
const { createNotification } = require('./notificationController');
const fs   = require('fs');
const path = require('path');

// ── Validasi input user ──────────────────────────────────────
const validateUserUpdate = ({ full_name, bio }) => {
  const errs = [];
  if (full_name !== undefined && full_name.length > 100)
    errs.push('full_name maksimal 100 karakter.');
  if (bio !== undefined && bio.length > 300)
    errs.push('bio maksimal 300 karakter.');
  return errs;
};

// ════════════════════════════════════════════════════════════
// READ ONE — GET /api/users/profile  (diri sendiri)
//          — GET /api/users/:username (orang lain)
// ════════════════════════════════════════════════════════════
const getProfile = async (req, res) => {
  try {
    const targetUsername = req.params.username || req.user.username;

    const [rows] = await pool.query(`
      SELECT u.uuid, u.username, u.email, u.full_name, u.bio, u.avatar, u.role,
             u.is_active, u.is_banned, u.created_at,
             (SELECT COUNT(*) FROM posts   WHERE user_id = u.id AND status='active') AS post_count,
             (SELECT COUNT(*) FROM follows WHERE following_id = u.id)                AS followers_count,
             (SELECT COUNT(*) FROM follows WHERE follower_id  = u.id)                AS following_count
      FROM users u
      WHERE u.username = ? AND u.is_active = 1`, [targetUsername]);

    if (!rows.length) return error(res, 'User tidak ditemukan.', 404);

    const profile = rows[0];
    // Sembunyikan email jika bukan diri sendiri dan bukan admin
    const isSelf  = req.user && req.user.username === targetUsername;
    const isAdmin = req.user && ['admin','moderator'].includes(req.user.role);
    if (!isSelf && !isAdmin) delete profile.email;

    // Cek apakah sudah di-follow
    if (req.user && !isSelf) {
      const [fw] = await pool.query(
        'SELECT id FROM follows WHERE follower_id = ? AND following_id = (SELECT id FROM users WHERE username = ?)',
        [req.user.id, targetUsername]);
      profile.is_following = fw.length > 0;
    }

    return success(res, profile, 'Profil berhasil diambil.');
  } catch (err) {
    console.error('[getProfile]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ════════════════════════════════════════════════════════════
// READ ALL — GET /api/admin/users
// Siapa: admin, moderator
// ════════════════════════════════════════════════════════════
const getAllUsers = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const role   = req.query.role   || '';
    const s      = `%${search}%`;

    const whereParts = ['1=1'];
    const params     = [];
    if (search) { whereParts.push('(u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?)'); params.push(s,s,s); }
    if (role)   { whereParts.push('u.role = ?'); params.push(role); }

    const [rows] = await pool.query(`
      SELECT u.uuid, u.username, u.email, u.full_name, u.role,
             u.is_active, u.is_banned, u.created_at,
             COUNT(DISTINCT p.id) AS post_count
      FROM users u LEFT JOIN posts p ON p.user_id = u.id
      WHERE ${whereParts.join(' AND ')}
      GROUP BY u.id ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`, [...params, limit, offset]);

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u WHERE ${whereParts.join(' AND ')}`, params);

    return paginate(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit) },
      'Daftar user berhasil diambil.');
  } catch (err) {
    console.error('[getAllUsers]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ════════════════════════════════════════════════════════════
// UPDATE — PUT /api/users/profile  (diri sendiri)
// Siapa: user untuk diri sendiri, admin untuk siapapun
// ════════════════════════════════════════════════════════════
const updateProfile = async (req, res) => {
  try {
    const { full_name, bio } = req.body;

    // Validasi input
    const errs = validateUserUpdate({ full_name, bio });
    if (errs.length) return error(res, errs.join(' '), 400);

    let avatarPath = null;
    if (req.file) {
      const [existing] = await pool.query('SELECT avatar FROM users WHERE id = ?', [req.user.id]);
      if (existing[0].avatar) {
        const old = path.join(process.env.UPLOAD_PATH || './uploads', existing[0].avatar);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      avatarPath = `avatars/${req.file.filename}`;
    }

    const fields = []; const vals = [];
    if (full_name  !== undefined) { fields.push('full_name = ?'); vals.push(full_name); }
    if (bio        !== undefined) { fields.push('bio = ?');       vals.push(bio); }
    if (avatarPath)               { fields.push('avatar = ?');    vals.push(avatarPath); }

    if (!fields.length) return error(res, 'Tidak ada data yang diubah.', 400);

    vals.push(req.user.id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);

    const [updated] = await pool.query(
      'SELECT uuid, username, email, full_name, bio, avatar, role FROM users WHERE id = ?',
      [req.user.id]);

    await logActivity(req.user.id, 'update_profile', 'user', req.user.id, req.ip);
    return success(res, updated[0], 'Profil berhasil diperbarui.');
  } catch (err) {
    console.error('[updateProfile]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ════════════════════════════════════════════════════════════
// DELETE — DELETE /api/users/account  (hapus akun sendiri)
//        — DELETE /api/admin/users/:uuid (admin hapus user lain)
// ════════════════════════════════════════════════════════════
const deleteUser = async (req, res) => {
  try {
    const targetUuid = req.params.uuid || req.user.uuid;
    const isAdmin    = ['admin'].includes(req.user.role);

    // Hanya admin yang bisa hapus user lain
    if (req.params.uuid && !isAdmin)
      return error(res, 'Hanya admin yang dapat menghapus akun user lain.', 403);

    // Cegah admin menghapus dirinya sendiri
    if (targetUuid === req.user.uuid && isAdmin && req.params.uuid)
      return error(res, 'Admin tidak bisa menghapus akun diri sendiri dari sini.', 400);

    const [rows] = await pool.query('SELECT id, username FROM users WHERE uuid = ?', [targetUuid]);
    if (!rows.length) return error(res, 'User tidak ditemukan.', 404);

    await pool.query('DELETE FROM users WHERE uuid = ?', [targetUuid]);
    return success(res, null, `Akun @${rows[0].username} berhasil dihapus.`);
  } catch (err) {
    console.error('[deleteUser]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ── Fitur lain ───────────────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) return error(res, 'Password lama dan baru wajib diisi.', 400);
    if (new_password.length < 8) return error(res, 'Password baru minimal 8 karakter.', 400);

    const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const ok     = await bcrypt.compare(old_password, rows[0].password);
    if (!ok) return error(res, 'Password lama tidak sesuai.', 400);

    await pool.query('UPDATE users SET password = ? WHERE id = ?',
      [await bcrypt.hash(new_password, 12), req.user.id]);
    return success(res, null, 'Password berhasil diubah.');
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const toggleFollow = async (req, res) => {
  try {
    const { username } = req.params;
    const [target] = await pool.query("SELECT id FROM users WHERE username = ? AND is_active = 1", [username]);
    if (!target.length) return error(res, 'User tidak ditemukan.', 404);
    if (target[0].id === req.user.id) return error(res, 'Tidak bisa follow diri sendiri.', 400);
    const [ex] = await pool.query('SELECT id FROM follows WHERE follower_id=? AND following_id=?', [req.user.id, target[0].id]);
    if (ex.length) {
      await pool.query('DELETE FROM follows WHERE follower_id=? AND following_id=?', [req.user.id, target[0].id]);
      return success(res, { following: false }, `Unfollow @${username} berhasil.`);
    }
    await pool.query('INSERT INTO follows (follower_id, following_id) VALUES (?,?)', [req.user.id, target[0].id]);

    // Notifikasi
    await createNotification(
      target[0].id, req.user.id, 'follow', null, null,
      `${req.user.username} mulai mengikuti Anda.`
    );

    return success(res, { following: true }, `Follow @${username} berhasil.`);
  } catch (err) { return error(res, 'Terjadi kesalahan server.', 500); }
};

const getFollowers = async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT u.uuid,u.username,u.full_name,u.avatar FROM follows f JOIN users u ON u.id=f.follower_id WHERE f.following_id=(SELECT id FROM users WHERE username=?) ORDER BY f.created_at DESC`, [req.params.username]);
    return success(res, rows, 'Daftar followers.');
  } catch (err) { return error(res, 'Terjadi kesalahan server.', 500); }
};

const getFollowing = async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT u.uuid,u.username,u.full_name,u.avatar FROM follows f JOIN users u ON u.id=f.following_id WHERE f.follower_id=(SELECT id FROM users WHERE username=?) ORDER BY f.created_at DESC`, [req.params.username]);
    return success(res, rows, 'Daftar following.');
  } catch (err) { return error(res, 'Terjadi kesalahan server.', 500); }
};

module.exports = {
  getProfile, getAllUsers, updateProfile, deleteUser,
  changePassword, toggleFollow, getFollowers, getFollowing,
};
