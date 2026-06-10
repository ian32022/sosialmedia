const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');

// ── Helper: buat notifikasi ──────────────────────────────────
const createNotification = async (userId, actorId, type, postId, commentId, message) => {
  try {
    if (userId === actorId) return;
    const uuid = uuidv4();
    await pool.query(
      `INSERT INTO notifications (uuid, user_id, actor_id, type, post_id, comment_id, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid, userId, actorId, type, postId || null, commentId || null, message]
    );
  } catch (_) {}
};

exports.createNotification = createNotification;

// READ ALL — GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(`
      SELECT n.uuid, n.type, n.message, n.is_read, n.created_at,
             a.uuid AS actor_uuid, a.username AS actor_username, a.full_name AS actor_full_name, a.avatar AS actor_avatar,
             p.uuid AS post_uuid
      FROM notifications n
      JOIN users a ON a.id = n.actor_id
      LEFT JOIN posts p ON p.id = n.post_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?',
      [req.user.id]
    );

    const [[{ unread_count }]] = await pool.query(
      'SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );

    return paginate(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit), unread_count }, 'Notifikasi berhasil diambil.');
  } catch (err) {
    console.error('[getNotifications]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// READ unread count — GET /api/notifications/unread-count
const getUnreadCount = async (req, res) => {
  try {
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    return success(res, { unread_count: count }, 'Jumlah notifikasi belum dibaca.');
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// MARK READ — PUT /api/notifications/read
const markAsRead = async (req, res) => {
  try {
    const { uuid } = req.body;

    if (uuid) {
      const [rows] = await pool.query('SELECT id, user_id FROM notifications WHERE uuid = ?', [uuid]);
      if (!rows.length) return error(res, 'Notifikasi tidak ditemukan.', 404);
      if (rows[0].user_id !== req.user.id) return error(res, 'Tidak berhak.', 403);
      await pool.query('UPDATE notifications SET is_read = 1 WHERE uuid = ?', [uuid]);
    } else {
      await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    }

    return success(res, null, 'Notifikasi ditandai sudah dibaca.');
  } catch (err) {
    console.error('[markAsRead]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// DELETE — DELETE /api/notifications/:uuid
const deleteNotification = async (req, res) => {
  try {
    const { uuid } = req.params;
    const [rows] = await pool.query('SELECT id, user_id FROM notifications WHERE uuid = ?', [uuid]);
    if (!rows.length) return error(res, 'Notifikasi tidak ditemukan.', 404);
    if (rows[0].user_id !== req.user.id) return error(res, 'Tidak berhak.', 403);
    await pool.query('DELETE FROM notifications WHERE id = ?', [rows[0].id]);
    return success(res, null, 'Notifikasi berhasil dihapus.');
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = {
  createNotification,
  getNotifications, getUnreadCount, markAsRead, deleteNotification,
};
