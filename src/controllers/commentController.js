/**
 * Comment Controller — Tahap 2 CRUD Core Entity
 * Entitas: Comments (entitas ke-2)
 * Role Access:
 *   - admin/moderator : READ semua, DELETE siapapun, UPDATE status
 *   - user            : CREATE, READ aktif, UPDATE milik sendiri, DELETE milik sendiri
 */
const { pool }    = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const { createNotification } = require('./notificationController');

// ── Validasi input komentar ──────────────────────────────────
const validateComment = (content) => {
  const errs = [];
  if (!content || content.trim() === '') errs.push('Isi komentar wajib diisi.');
  if (content && content.trim().length < 1)  errs.push('Komentar terlalu pendek.');
  if (content && content.length > 500)       errs.push('Komentar maksimal 500 karakter.');
  return errs;
};

// ════════════════════════════════════════════════════════════
// CREATE — POST /api/posts/:uuid/comments
// Siapa: semua user yang login
// ════════════════════════════════════════════════════════════
const addComment = async (req, res) => {
  try {
    const { uuid }              = req.params;
    const { content, parent_id } = req.body;

    // Validasi input
    const errs = validateComment(content);
    if (errs.length) return error(res, errs.join(' '), 400);

    // Cari post
    const [posts] = await pool.query(
      "SELECT id FROM posts WHERE uuid = ? AND status = 'active'", [uuid]);
    if (!posts.length) return error(res, 'Post tidak ditemukan atau tidak aktif.', 404);

    // Validasi parent_id jika reply
    if (parent_id) {
      const [parent] = await pool.query(
        'SELECT id FROM comments WHERE id = ? AND post_id = ?', [parent_id, posts[0].id]);
      if (!parent.length) return error(res, 'Komentar induk tidak ditemukan.', 404);
    }

    const [result] = await pool.query(
      'INSERT INTO comments (post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)',
      [posts[0].id, req.user.id, parent_id || null, content.trim()]);

    const [comment] = await pool.query(`
      SELECT c.id, c.content, c.parent_id, c.status, c.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.id = ?`, [result.insertId]);

    // Notifikasi ke pemilik post
    const [postOwner] = await pool.query('SELECT user_id FROM posts WHERE id = ?', [posts[0].id]);
    if (postOwner.length) {
      const notifType = parent_id ? 'reply' : 'comment';
      await createNotification(
        postOwner[0].user_id, req.user.id, notifType, posts[0].id, result.insertId,
        `${req.user.username} ${parent_id ? 'membalas komentar' : 'berkomentar'} di post Anda.`
      );
    }

    return success(res, comment[0], 'Komentar berhasil ditambahkan.', 201);
  } catch (err) {
    console.error('[addComment]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ════════════════════════════════════════════════════════════
// READ ALL — GET /api/posts/:uuid/comments
// Siapa: publik (hanya status active); admin melihat semua
// ════════════════════════════════════════════════════════════
const getComments = async (req, res) => {
  try {
    const { uuid } = req.params;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const isAdmin = req.user && ['admin','moderator'].includes(req.user.role);

    const [rows] = await pool.query(`
      SELECT c.id, c.content, c.parent_id, c.status, c.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar
      FROM comments c
      JOIN posts p  ON p.uuid = ? AND p.id = c.post_id
      JOIN users u  ON u.id = c.user_id
      WHERE ${isAdmin ? "c.status IN ('active','hidden')" : "c.status = 'active'"}
      ORDER BY c.created_at ASC
      LIMIT ? OFFSET ?`, [uuid, limit, offset]);

    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) AS total FROM comments c
      JOIN posts p ON p.uuid = ? AND p.id = c.post_id
      WHERE ${isAdmin ? "c.status IN ('active','hidden')" : "c.status = 'active'"}`, [uuid]);

    return paginate(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit) },
      'Komentar berhasil diambil.');
  } catch (err) {
    console.error('[getComments]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ════════════════════════════════════════════════════════════
// UPDATE — PUT /api/comments/:id
// Siapa: pemilik komentar (hanya content), admin/moderator (content + status)
// ════════════════════════════════════════════════════════════
const updateComment = async (req, res) => {
  try {
    const { id }             = req.params;
    const { content, status } = req.body;

    const [rows] = await pool.query('SELECT id, user_id FROM comments WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Komentar tidak ditemukan.', 404);

    const isOwner = rows[0].user_id === req.user.id;
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
    if (content !== undefined) { fields.push('content = ?'); vals.push(content.trim()); }
    if (status)  { fields.push('status = ?');  vals.push(status); }
    if (!fields.length) return error(res, 'Tidak ada data yang diubah.', 400);

    vals.push(id);
    await pool.query(`UPDATE comments SET ${fields.join(', ')} WHERE id = ?`, vals);
    return success(res, null, 'Komentar berhasil diperbarui.');
  } catch (err) {
    console.error('[updateComment]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ════════════════════════════════════════════════════════════
// DELETE — DELETE /api/comments/:id
// Siapa: pemilik komentar ATAU admin/moderator
// ════════════════════════════════════════════════════════════
const deleteComment = async (req, res) => {
  try {
    const { id }  = req.params;
    const [rows]  = await pool.query('SELECT id, user_id FROM comments WHERE id = ?', [id]);
    if (!rows.length) return error(res, 'Komentar tidak ditemukan.', 404);

    const isOwner = rows[0].user_id === req.user.id;
    const isAdmin = ['admin','moderator'].includes(req.user.role);
    if (!isOwner && !isAdmin) return error(res, 'Tidak berhak menghapus komentar ini.', 403);

    await pool.query('DELETE FROM comments WHERE id = ?', [id]);
    return success(res, null, 'Komentar berhasil dihapus.');
  } catch (err) {
    console.error('[deleteComment]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = { addComment, getComments, updateComment, deleteComment };
