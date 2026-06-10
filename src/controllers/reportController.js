const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');

const createReport = async (req, res) => {
  try {
    const { target_type, target_uuid, post_uuid, comment_id, reason, description } = req.body;

    if (!reason) return error(res, 'Alasan laporan wajib diisi.', 400);

    const finalPostUuid = post_uuid || (target_type === 'post' ? target_uuid : null);
    const finalCommentId = comment_id || (target_type === 'comment' ? target_uuid : null);

    if (!finalPostUuid && !finalCommentId) return error(res, 'Pilih post atau komentar yang dilaporkan.', 400);

    let postId = null;
    if (finalPostUuid) {
      const posts = await pool.query('SELECT id FROM posts WHERE uuid = $1', [finalPostUuid]);
      if (posts.rows.length === 0) return error(res, 'Post tidak ditemukan.', 404);
      postId = posts.rows[0].id;
    }

    await pool.query(
      'INSERT INTO reports (reporter_id, post_id, comment_id, reason, description) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, postId, comment_id || null, reason, description || null]
    );

    return success(res, null, 'Laporan berhasil dikirim. Tim moderasi akan meninjau segera.', 201);
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getReports = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || 'pending';
    const offset = (page - 1) * limit;

    const rows = await pool.query(`
      SELECT r.id, r.reason, r.description, r.status, r.created_at,
        u.username AS reporter, u.email AS reporter_email,
        p.uuid AS post_uuid, p.caption AS post_caption,
        rv.username AS reviewed_by, r.reviewed_at
      FROM reports r
      JOIN users u ON u.id = r.reporter_id
      LEFT JOIN posts p ON p.id = r.post_id
      LEFT JOIN users rv ON rv.id = r.reviewed_by
      WHERE r.status = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `, [status, limit, offset]);

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM reports WHERE status = $1', [status]
    );

    return paginate(res, rows.rows, { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) }, 'Daftar laporan berhasil diambil.');
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const reviewReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, status } = req.body;

    const reports = await pool.query(
      'SELECT r.*, p.user_id AS post_owner FROM reports r LEFT JOIN posts p ON p.id = r.post_id WHERE r.id = $1',
      [id]
    );
    if (reports.rows.length === 0) return error(res, 'Laporan tidak ditemukan.', 404);

    const report = reports.rows[0];

    if (action === 'hide_post' && report.post_id) {
      await pool.query("UPDATE posts SET status = 'hidden' WHERE id = $1", [report.post_id]);
    } else if (action === 'remove_post' && report.post_id) {
      await pool.query("UPDATE posts SET status = 'removed' WHERE id = $1", [report.post_id]);
    } else if (action === 'ban_user' && report.post_owner) {
      await pool.query('UPDATE users SET is_banned = TRUE WHERE id = $1', [report.post_owner]);
    }

    await pool.query(
      'UPDATE reports SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3',
      [status || 'reviewed', req.user.id, id]
    );

    return success(res, null, 'Laporan berhasil ditangani.');
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = { createReport, getReports, reviewReport };
