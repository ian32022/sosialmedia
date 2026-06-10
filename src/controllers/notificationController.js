const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');

const createNotification = async (userId, actorId, type, postId, commentId, message) => {
  try {
    if (userId === actorId) return;
    const uuid = uuidv4();
    await pool.query(
      `INSERT INTO notifications (uuid, user_id, actor_id, type, post_id, comment_id, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuid, userId, actorId, type, postId || null, commentId || null, message]
    );
  } catch (_) {}
};

exports.createNotification = createNotification;

const getNotifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const rows = await pool.query(`
      SELECT n.uuid, n.type, n.message, n.is_read, n.created_at,
             a.uuid AS actor_uuid, a.username AS actor_username, a.full_name AS actor_full_name, a.avatar AS actor_avatar,
             p.uuid AS post_uuid
      FROM notifications n
      JOIN users a ON a.id = n.actor_id
      LEFT JOIN posts p ON p.id = n.post_id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1',
      [req.user.id]
    );

    const unreadResult = await pool.query(
      'SELECT COUNT(*)::int AS unread_count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    );

    return paginate(res, rows.rows, { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit), unread_count: unreadResult.rows[0].unread_count }, 'Notifikasi berhasil diambil.');
  } catch (err) {
    console.error('[getNotifications]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    );
    return success(res, { unread_count: result.rows[0].count }, 'Jumlah notifikasi belum dibaca.');
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const markAsRead = async (req, res) => {
  try {
    const { uuid } = req.body;

    if (uuid) {
      const rows = await pool.query('SELECT id, user_id FROM notifications WHERE uuid = $1', [uuid]);
      if (!rows.rows.length) return error(res, 'Notifikasi tidak ditemukan.', 404);
      if (rows.rows[0].user_id !== req.user.id) return error(res, 'Tidak berhak.', 403);
      await pool.query('UPDATE notifications SET is_read = TRUE WHERE uuid = $1', [uuid]);
    } else {
      await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
    }

    return success(res, null, 'Notifikasi ditandai sudah dibaca.');
  } catch (err) {
    console.error('[markAsRead]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const deleteNotification = async (req, res) => {
  try {
    const { uuid } = req.params;
    const rows = await pool.query('SELECT id, user_id FROM notifications WHERE uuid = $1', [uuid]);
    if (!rows.rows.length) return error(res, 'Notifikasi tidak ditemukan.', 404);
    if (rows.rows[0].user_id !== req.user.id) return error(res, 'Tidak berhak.', 403);
    await pool.query('DELETE FROM notifications WHERE id = $1', [rows.rows[0].id]);
    return success(res, null, 'Notifikasi berhasil dihapus.');
  } catch (err) {
    console.error('[deleteNotification]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = {
  createNotification,
  getNotifications, getUnreadCount, markAsRead, deleteNotification,
};
