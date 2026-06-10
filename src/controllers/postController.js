/**
 * Post Controller — Tahap 2 CRUD Core Entity
 * Entitas: Posts (salah satu dari 3 entitas utama)
 * Role Access:
 *   - admin      : semua operasi (CREATE, READ, UPDATE, DELETE siapapun)
 *   - moderator  : read semua, update status (hide/remove), delete
 *   - user       : CREATE milik sendiri, READ aktif, UPDATE milik sendiri, DELETE milik sendiri
 */
const { v4: uuidv4 } = require('uuid');
const { pool }       = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const { logActivity } = require('../utils/logger');
const { saveHashtags, removePostHashtags, updatePostHashtags } = require('./hashtagController');
const fs   = require('fs');
const path = require('path');

// ── Validasi input post ──────────────────────────────────────
const validatePost = (caption, file) => {
  const errors = [];
  if (!caption && !file)          errors.push('caption atau gambar wajib diisi.');
  if (caption && caption.length > 2200) errors.push('caption maksimal 2200 karakter.');
  return errors;
};

// ════════════════════════════════════════════════════════════
// CREATE — POST /api/posts
// Siapa: user, moderator, admin (login)
// ════════════════════════════════════════════════════════════
const createPost = async (req, res) => {
  try {
    const { caption } = req.body;
    const imagePath   = req.file ? `images/${req.file.filename}` : null;

    // Validasi input
    const errs = validatePost(caption, imagePath);
    if (errs.length) return error(res, errs.join(' '), 400);

    const uuid = uuidv4();
    const [result] = await pool.query(
      'INSERT INTO posts (uuid, user_id, caption, image) VALUES (?, ?, ?, ?)',
      [uuid, req.user.id, caption || null, imagePath]
    );

    // Simpan hashtag
    if (caption) await saveHashtags(result.insertId, caption);

    // Ambil data lengkap post yang baru dibuat
    const [rows] = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.status, p.created_at,
             u.username, u.full_name, u.avatar
      FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.id = ?`, [result.insertId]);

    await logActivity(req.user.id, 'create_post', 'post', result.insertId, req.ip);
    return success(res, rows[0], 'Post berhasil dibuat.', 201);
  } catch (err) {
    console.error('[createPost]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ════════════════════════════════════════════════════════════
// READ ALL — GET /api/posts
// Siapa: publik (tanpa login), admin melihat semua status
// ════════════════════════════════════════════════════════════
const getAllPosts = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    // Admin bisa lihat semua status; user biasa hanya 'active'
    const isAdmin   = req.user && ['admin','moderator'].includes(req.user.role);
    const statusSQL = isAdmin ? "p.status IN ('active','hidden','removed')" : "p.status = 'active'";
    const searchSQL = search ? "AND (p.caption LIKE ? OR u.username LIKE ?)" : '';
    const params    = search
      ? [`%${search}%`, `%${search}%`, limit, offset]
      : [limit, offset];

    const [rows] = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.status, p.created_at,
             u.username, u.full_name, u.avatar,
             COUNT(DISTINCT l.id)  AS like_count,
             COUNT(DISTINCT c.id)  AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN likes    l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE ${statusSQL} ${searchSQL}
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?`, params);

    const countParams = search ? [`%${search}%`, `%${search}%`] : [];
    const [[{ total }]] = await pool.query(`
      SELECT COUNT(DISTINCT p.id) AS total FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE ${statusSQL} ${searchSQL}`, countParams);

    return paginate(res, rows,
      { page, limit, total, total_pages: Math.ceil(total / limit) },
      'Daftar post berhasil diambil.');
  } catch (err) {
    console.error('[getAllPosts]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ════════════════════════════════════════════════════════════
// READ ONE — GET /api/posts/:uuid
// Siapa: publik
// ════════════════════════════════════════════════════════════
const getPost = async (req, res) => {
  try {
    const { uuid } = req.params;
    const isAdmin  = req.user && ['admin','moderator'].includes(req.user.role);
    const statusSQL = isAdmin ? "p.status != 'deleted'" : "p.status = 'active'";

    const [rows] = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.status, p.created_at, p.updated_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar,
             COUNT(DISTINCT l.id) AS like_count,
             COUNT(DISTINCT c.id) AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN likes    l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE p.uuid = ? AND ${statusSQL}
      GROUP BY p.id`, [uuid]);

    if (!rows.length) return error(res, 'Post tidak ditemukan.', 404);
    return success(res, rows[0], 'Post berhasil diambil.');
  } catch (err) {
    console.error('[getPost]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ════════════════════════════════════════════════════════════
// UPDATE — PUT /api/posts/:uuid
// Siapa: pemilik post ATAU admin/moderator
// ════════════════════════════════════════════════════════════
const updatePost = async (req, res) => {
  try {
    const { uuid }    = req.params;
    const { caption, status } = req.body;

    const [rows] = await pool.query('SELECT id, user_id, image FROM posts WHERE uuid = ?', [uuid]);
    if (!rows.length) return error(res, 'Post tidak ditemukan.', 404);

    const post    = rows[0];
    const isOwner = post.user_id === req.user.id;
    const isAdmin = ['admin','moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) return error(res, 'Tidak berhak mengubah post ini.', 403);

    // Validasi: user biasa tidak bisa ubah status langsung
    if (status && !isAdmin) return error(res, 'Hanya admin/moderator yang dapat mengubah status post.', 403);

    // Validasi status
    const validStatus = ['active','hidden','removed'];
    if (status && !validStatus.includes(status))
      return error(res, `Status tidak valid. Pilih: ${validStatus.join(', ')}.`, 400);

    // Validasi caption
    if (caption && caption.length > 2200)
      return error(res, 'Caption maksimal 2200 karakter.', 400);

    // Ganti gambar jika ada upload baru
    let imagePath = post.image;
    if (req.file) {
      if (post.image) {
        const old = path.join(process.env.UPLOAD_PATH || './uploads', post.image);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      imagePath = `images/${req.file.filename}`;
    }

    const fields = [];
    const vals   = [];
    if (caption !== undefined) { fields.push('caption = ?'); vals.push(caption); }
    if (status  !== undefined) { fields.push('status = ?');  vals.push(status);  }
    if (req.file)              { fields.push('image = ?');   vals.push(imagePath); }

    if (!fields.length) return error(res, 'Tidak ada data yang diubah.', 400);

    vals.push(post.id);
    await pool.query(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`, vals);

    // Update hashtag jika caption berubah
    if (caption !== undefined) {
      await updatePostHashtags(post.id, caption);
    }

    await logActivity(req.user.id, 'update_post', 'post', post.id, req.ip);

    return success(res, { uuid, updated_fields: fields.map(f => f.split(' ')[0]) }, 'Post berhasil diperbarui.');
  } catch (err) {
    console.error('[updatePost]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ════════════════════════════════════════════════════════════
// DELETE — DELETE /api/posts/:uuid
// Siapa: pemilik post ATAU admin/moderator
// ════════════════════════════════════════════════════════════
const deletePost = async (req, res) => {
  try {
    const { uuid } = req.params;
    const [rows]   = await pool.query('SELECT id, user_id, image FROM posts WHERE uuid = ?', [uuid]);
    if (!rows.length) return error(res, 'Post tidak ditemukan.', 404);

    const post    = rows[0];
    const isOwner = post.user_id === req.user.id;
    const isAdmin = ['admin','moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) return error(res, 'Tidak berhak menghapus post ini.', 403);

    // Hapus file gambar dari disk jika ada
    if (post.image) {
      const filePath = path.join(process.env.UPLOAD_PATH || './uploads', post.image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    // Hapus hashtag terkait
    await removePostHashtags(post.id);

    await pool.query('DELETE FROM posts WHERE id = ?', [post.id]);
    await logActivity(req.user.id, 'delete_post', 'post', post.id, req.ip);

    return success(res, null, 'Post berhasil dihapus.');
  } catch (err) {
    console.error('[deletePost]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ── Fitur tambahan ───────────────────────────────────────────
const getFeed = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar,
             COUNT(DISTINCT l.id) AS like_count,
             COUNT(DISTINCT c.id) AS comment_count,
             (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) AS is_liked,
             (SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = ?) AS is_bookmarked
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE p.status = 'active'
        AND (p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?) OR p.user_id = ?)
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, req.user.id, req.user.id, req.user.id, limit, offset]);

    const [[{ total }]] = await pool.query(
      "SELECT COUNT(DISTINCT p.id) AS total FROM posts p WHERE p.status = 'active' AND (p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?) OR p.user_id = ?)",
      [req.user.id, req.user.id]
    );

    return paginate(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit) }, 'Feed berhasil diambil.');
  } catch (err) {
    console.error('[getFeed]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const toggleLike = async (req, res) => {
  try {
    const { uuid } = req.params;
    const [posts] = await pool.query("SELECT id, user_id FROM posts WHERE uuid = ? AND status = 'active'", [uuid]);
    if (!posts.length) return error(res, 'Post tidak ditemukan.', 404);

    const postId = posts[0].id;
    const [existing] = await pool.query(
      'SELECT id FROM likes WHERE user_id = ? AND post_id = ?', [req.user.id, postId]
    );

    if (existing.length) {
      await pool.query('DELETE FROM likes WHERE id = ?', [existing[0].id]);
      return success(res, { liked: false }, 'Like dibatalkan.');
    }

    await pool.query('INSERT INTO likes (user_id, post_id) VALUES (?, ?)', [req.user.id, postId]);

    // Notifikasi
    const { createNotification } = require('./notificationController');
    await createNotification(
      posts[0].user_id, req.user.id, 'like', postId, null,
      `${req.user.username} menyukai post Anda.`
    );

    return success(res, { liked: true }, 'Post disukai.');
  } catch (err) {
    console.error('[toggleLike]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const toggleBookmark = async (req, res) => {
  try {
    const { uuid } = req.params;
    const [posts] = await pool.query("SELECT id, user_id FROM posts WHERE uuid = ? AND status = 'active'", [uuid]);
    if (!posts.length) return error(res, 'Post tidak ditemukan.', 404);

    const postId = posts[0].id;
    const [existing] = await pool.query(
      'SELECT id FROM bookmarks WHERE user_id = ? AND post_id = ?', [req.user.id, postId]
    );

    if (existing.length) {
      await pool.query('DELETE FROM bookmarks WHERE id = ?', [existing[0].id]);
      return success(res, { bookmarked: false }, 'Bookmark dihapus.');
    }

    await pool.query('INSERT INTO bookmarks (user_id, post_id) VALUES (?, ?)', [req.user.id, postId]);

    // Notifikasi
    const { createNotification } = require('./notificationController');
    await createNotification(
      posts[0].user_id, req.user.id, 'bookmark', postId, null,
      `${req.user.username} menandai post Anda.`
    );

    return success(res, { bookmarked: true }, 'Post di-bookmark.');
  } catch (err) {
    console.error('[toggleBookmark]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getMyBookmarks = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar,
             COUNT(DISTINCT l.id) AS like_count,
             COUNT(DISTINCT c.id) AS comment_count
      FROM bookmarks b
      JOIN posts p ON p.id = b.post_id AND p.status = 'active'
      JOIN users u ON u.id = p.user_id
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE b.user_id = ?
      GROUP BY p.id
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM bookmarks WHERE user_id = ?',
      [req.user.id]
    );

    return paginate(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit) }, 'Bookmark berhasil diambil.');
  } catch (err) {
    console.error('[getMyBookmarks]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getUserPosts = async (req, res) => {
  try {
    const { username } = req.params;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.created_at,
             COUNT(DISTINCT l.id) AS like_count,
             COUNT(DISTINCT c.id) AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.user_id AND u.username = ? AND u.is_active = 1
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE p.status = 'active'
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [username, limit, offset]);

    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) AS total FROM posts p JOIN users u ON u.id = p.user_id
      WHERE u.username = ? AND p.status = 'active'
    `, [username]);

    return paginate(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit) }, `Post dari @${username}.`);
  } catch (err) {
    console.error('[getUserPosts]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = {
  createPost, getAllPosts, getPost, updatePost, deletePost,
  getFeed, toggleLike, toggleBookmark, getMyBookmarks, getUserPosts,
};
