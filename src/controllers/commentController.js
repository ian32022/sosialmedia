const { pool }    = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const { createNotification } = require('./notificationController');

const validateComment = (content) => {
  const errs = [];
  if (!content || content.trim() === '') errs.push('Isi komentar wajib diisi.');
  if (content && content.trim().length < 1)  errs.push('Komentar terlalu pendek.');
  if (content && content.length > 500)       errs.push('Komentar maksimal 500 karakter.');
  return errs;
};

const addComment = async (req, res) => {
  try {
    const { uuid }              = req.params;
    const { content, parent_id } = req.body;

    const errs = validateComment(content);
    if (errs.length) return error(res, errs.join(' '), 400);

    const posts = await pool.query(
      "SELECT id FROM posts WHERE uuid = $1 AND status = 'active'", [uuid]);
    if (!posts.rows.length) return error(res, 'Post tidak ditemukan atau tidak aktif.', 404);

    if (parent_id) {
      const parent = await pool.query(
        'SELECT id FROM comments WHERE id = $1 AND post_id = $2', [parent_id, posts.rows[0].id]);
      if (!parent.rows.length) return error(res, 'Komentar induk tidak ditemukan.', 404);
    }

    const result = await pool.query(
      'INSERT INTO comments (post_id, user_id, parent_id, content) VALUES ($1, $2, $3, $4) RETURNING id',
      [posts.rows[0].id, req.user.id, parent_id || null, content.trim()]);

    const comment = await pool.query(`
      SELECT c.id, c.content, c.parent_id, c.status, c.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.id = $1`, [result.rows[0].id]);

    const postOwner = await pool.query('SELECT user_id FROM posts WHERE id = $1', [posts.rows[0].id]);
    if (postOwner.rows.length) {
      const notifType = parent_id ? 'reply' : 'comment';
      await createNotification(
        postOwner.rows[0].user_id, req.user.id, notifType, posts.rows[0].id, result.rows[0].id,
        `${req.user.username} ${parent_id ? 'membalas komentar' : 'berkomentar'} di post Anda.`
      );
    }

    return success(res, comment.rows[0], 'Komentar berhasil ditambahkan.', 201);
  } catch (err) {
    console.error('[addComment]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getComments = async (req, res) => {
  try {
    const { uuid } = req.params;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const isAdmin = req.user && ['admin','moderator'].includes(req.user.role);

    const rows = await pool.query(`
      SELECT c.id, c.content, c.parent_id, c.status, c.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar
      FROM comments c
      JOIN posts p  ON p.uuid = $1 AND p.id = c.post_id
      JOIN users u  ON u.id = c.user_id
      WHERE ${isAdmin ? "c.status IN ('active','hidden')" : "c.status = 'active'"}
      ORDER BY c.created_at ASC
      LIMIT $2 OFFSET $3`, [uuid, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*)::int AS total FROM comments c
      JOIN posts p ON p.uuid = $1 AND p.id = c.post_id
      WHERE ${isAdmin ? "c.status IN ('active','hidden')" : "c.status = 'active'"}`, [uuid]);

    return paginate(res, rows.rows, { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) },
      'Komentar berhasil diambil.');
  } catch (err) {
    console.error('[getComments]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const updateComment = async (req, res) => {
  try {
    const { id }             = req.params;
    const { content, status } = req.body;

    const rows = await pool.query('SELECT id, user_id FROM comments WHERE id = $1', [id]);
    if (!rows.rows.length) return error(res, 'Komentar tidak ditemukan.', 404);

    const isOwner = rows.rows[0].user_id === req.user.id;
    const isAdmin = ['admin','moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) return error(res, 'Tidak berhak mengubah komentar ini.', 403);
    if (status && !isAdmin)   return error(res, 'Hanya admin/moderator yang bisa ubah status.', 403);

    const validStatus = ['active','hidden','removed'];
    if (status && !validStatus.includes(status))
      return error(res, `Status tidak valid. Pilih: ${validStatus.join(', ')}.`, 400);

    if (content !== undefined) {
      const errs = validateComment(content);
      if (errs.length) return error(res, errs.join(' '), 400);
    }

    const fields = []; const vals = [];
    let idx = 1;
    if (content !== undefined) { fields.push(`content = $${idx++}`); vals.push(content.trim()); }
    if (status)  { fields.push(`status = $${idx++}`);  vals.push(status); }
    if (!fields.length) return error(res, 'Tidak ada data yang diubah.', 400);

    vals.push(parseInt(id));
    await pool.query(`UPDATE comments SET ${fields.join(', ')} WHERE id = $${idx}`, vals);
    return success(res, null, 'Komentar berhasil diperbarui.');
  } catch (err) {
    console.error('[updateComment]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const deleteComment = async (req, res) => {
  try {
    const { id }  = req.params;
    const rows  = await pool.query('SELECT id, user_id FROM comments WHERE id = $1', [id]);
    if (!rows.rows.length) return error(res, 'Komentar tidak ditemukan.', 404);

    const isOwner = rows.rows[0].user_id === req.user.id;
    const isAdmin = ['admin','moderator'].includes(req.user.role);
    if (!isOwner && !isAdmin) return error(res, 'Tidak berhak menghapus komentar ini.', 403);

    await pool.query('DELETE FROM comments WHERE id = $1', [id]);
    return success(res, null, 'Komentar berhasil dihapus.');
  } catch (err) {
    console.error('[deleteComment]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = { addComment, getComments, updateComment, deleteComment };
