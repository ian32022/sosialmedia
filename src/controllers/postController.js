const { v4: uuidv4 } = require('uuid');
const { pool }       = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const { logActivity } = require('../utils/logger');
const { saveHashtags, removePostHashtags, updatePostHashtags } = require('./hashtagController');
const fs   = require('fs');
const path = require('path');

const validatePost = (caption, file) => {
  const errors = [];
  if (!caption && !file)          errors.push('caption atau gambar wajib diisi.');
  if (caption && caption.length > 2200) errors.push('caption maksimal 2200 karakter.');
  return errors;
};

const createPost = async (req, res) => {
  try {
    const { caption } = req.body;
    const imagePath   = req.file ? `images/${req.file.filename}` : null;

    const errs = validatePost(caption, imagePath);
    if (errs.length) return error(res, errs.join(' '), 400);

    const uuid = uuidv4();
    const result = await pool.query(
      'INSERT INTO posts (uuid, user_id, caption, image) VALUES ($1, $2, $3, $4) RETURNING id',
      [uuid, req.user.id, caption || null, imagePath]
    );

    if (caption) await saveHashtags(result.rows[0].id, caption);

    const rows = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.status, p.created_at,
             u.username, u.full_name, u.avatar
      FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.id = $1`, [result.rows[0].id]);

    await logActivity(req.user.id, 'create_post', 'post', result.rows[0].id, req.ip);
    return success(res, rows.rows[0], 'Post berhasil dibuat.', 201);
  } catch (err) {
    console.error('[createPost]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getAllPosts = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    const isAdmin   = req.user && ['admin','moderator'].includes(req.user.role);
    const statusSQL = isAdmin ? "p.status IN ('active','hidden','removed')" : "p.status = 'active'";
    const searchSQL = search ? "AND (p.caption ILIKE $1 OR u.username ILIKE $2)" : '';
    const params    = search
      ? [`%${search}%`, `%${search}%`, limit, offset]
      : [limit, offset];

    const rows = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.status, p.created_at,
             u.username, u.full_name, u.avatar,
             COUNT(DISTINCT l.id)  AS like_count,
             COUNT(DISTINCT c.id)  AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN likes    l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE ${statusSQL} ${searchSQL}
      GROUP BY p.id, p.uuid, p.caption, p.image, p.status, p.created_at, u.username, u.full_name, u.avatar
      ORDER BY p.created_at DESC
      LIMIT ${search ? '$3' : '$1'} OFFSET ${search ? '$4' : '$2'}`, params);

    const countParams = search ? [`%${search}%`, `%${search}%`] : [];
    const countResult = await pool.query(`
      SELECT COUNT(DISTINCT p.id)::int AS total FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE ${statusSQL} ${searchSQL}`, countParams);

    return paginate(res, rows.rows,
      { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) },
      'Daftar post berhasil diambil.');
  } catch (err) {
    console.error('[getAllPosts]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getPost = async (req, res) => {
  try {
    const { uuid } = req.params;
    const isAdmin  = req.user && ['admin','moderator'].includes(req.user.role);
    const statusSQL = isAdmin ? "p.status != 'deleted'" : "p.status = 'active'";

    const rows = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.status, p.created_at, p.updated_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar,
             COUNT(DISTINCT l.id) AS like_count,
             COUNT(DISTINCT c.id) AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN likes    l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE p.uuid = $1 AND ${statusSQL}
      GROUP BY p.id, p.uuid, p.caption, p.image, p.status, p.created_at, p.updated_at, u.uuid, u.username, u.full_name, u.avatar`, [uuid]);

    if (!rows.rows.length) return error(res, 'Post tidak ditemukan.', 404);
    return success(res, rows.rows[0], 'Post berhasil diambil.');
  } catch (err) {
    console.error('[getPost]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const updatePost = async (req, res) => {
  try {
    const { uuid }    = req.params;
    const { caption, status } = req.body;

    const rows = await pool.query('SELECT id, user_id, image FROM posts WHERE uuid = $1', [uuid]);
    if (!rows.rows.length) return error(res, 'Post tidak ditemukan.', 404);

    const post    = rows.rows[0];
    const isOwner = post.user_id === req.user.id;
    const isAdmin = ['admin','moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) return error(res, 'Tidak berhak mengubah post ini.', 403);

    if (status && !isAdmin) return error(res, 'Hanya admin/moderator yang dapat mengubah status post.', 403);

    const validStatus = ['active','hidden','removed'];
    if (status && !validStatus.includes(status))
      return error(res, `Status tidak valid. Pilih: ${validStatus.join(', ')}.`, 400);

    if (caption && caption.length > 2200)
      return error(res, 'Caption maksimal 2200 karakter.', 400);

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
    let idx = 1;
    if (caption !== undefined) { fields.push(`caption = $${idx++}`); vals.push(caption); }
    if (status  !== undefined) { fields.push(`status = $${idx++}`);  vals.push(status);  }
    if (req.file)              { fields.push(`image = $${idx++}`);   vals.push(imagePath); }

    if (!fields.length) return error(res, 'Tidak ada data yang diubah.', 400);

    vals.push(post.id);
    await pool.query(`UPDATE posts SET ${fields.join(', ')} WHERE id = $${idx}`, vals);

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

const deletePost = async (req, res) => {
  try {
    const { uuid } = req.params;
    const rows   = await pool.query('SELECT id, user_id, image FROM posts WHERE uuid = $1', [uuid]);
    if (!rows.rows.length) return error(res, 'Post tidak ditemukan.', 404);

    const post    = rows.rows[0];
    const isOwner = post.user_id === req.user.id;
    const isAdmin = ['admin','moderator'].includes(req.user.role);

    if (!isOwner && !isAdmin) return error(res, 'Tidak berhak menghapus post ini.', 403);

    if (post.image) {
      const filePath = path.join(process.env.UPLOAD_PATH || './uploads', post.image);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await removePostHashtags(post.id);

    await pool.query('DELETE FROM posts WHERE id = $1', [post.id]);
    await logActivity(req.user.id, 'delete_post', 'post', post.id, req.ip);

    return success(res, null, 'Post berhasil dihapus.');
  } catch (err) {
    console.error('[deletePost]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getFeed = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const rows = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar,
             COUNT(DISTINCT l.id) AS like_count,
             COUNT(DISTINCT c.id) AS comment_count,
             (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = $1)::int AS is_liked,
             (SELECT COUNT(*) FROM bookmarks WHERE post_id = p.id AND user_id = $2)::int AS is_bookmarked
      FROM posts p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE p.status = 'active'
        AND (p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $3) OR p.user_id = $4)
      GROUP BY p.id, p.uuid, p.caption, p.image, p.created_at, u.uuid, u.username, u.full_name, u.avatar
      ORDER BY p.created_at DESC
      LIMIT $5 OFFSET $6
    `, [req.user.id, req.user.id, req.user.id, req.user.id, limit, offset]);

    const countResult = await pool.query(
      "SELECT COUNT(DISTINCT p.id)::int AS total FROM posts p WHERE p.status = 'active' AND (p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1) OR p.user_id = $2)",
      [req.user.id, req.user.id]
    );

    return paginate(res, rows.rows, { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) }, 'Feed berhasil diambil.');
  } catch (err) {
    console.error('[getFeed]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const toggleLike = async (req, res) => {
  try {
    const { uuid } = req.params;
    const posts = await pool.query("SELECT id, user_id FROM posts WHERE uuid = $1 AND status = 'active'", [uuid]);
    if (!posts.rows.length) return error(res, 'Post tidak ditemukan.', 404);

    const postId = posts.rows[0].id;
    const existing = await pool.query(
      'SELECT id FROM likes WHERE user_id = $1 AND post_id = $2', [req.user.id, postId]
    );

    if (existing.rows.length) {
      await pool.query('DELETE FROM likes WHERE id = $1', [existing.rows[0].id]);
      return success(res, { liked: false }, 'Like dibatalkan.');
    }

    await pool.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2)', [req.user.id, postId]);

    const { createNotification } = require('./notificationController');
    await createNotification(
      posts.rows[0].user_id, req.user.id, 'like', postId, null,
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
    const posts = await pool.query("SELECT id, user_id FROM posts WHERE uuid = $1 AND status = 'active'", [uuid]);
    if (!posts.rows.length) return error(res, 'Post tidak ditemukan.', 404);

    const postId = posts.rows[0].id;
    const existing = await pool.query(
      'SELECT id FROM bookmarks WHERE user_id = $1 AND post_id = $2', [req.user.id, postId]
    );

    if (existing.rows.length) {
      await pool.query('DELETE FROM bookmarks WHERE id = $1', [existing.rows[0].id]);
      return success(res, { bookmarked: false }, 'Bookmark dihapus.');
    }

    await pool.query('INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2)', [req.user.id, postId]);

    const { createNotification } = require('./notificationController');
    await createNotification(
      posts.rows[0].user_id, req.user.id, 'bookmark', postId, null,
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

    const rows = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar,
             COUNT(DISTINCT l.id) AS like_count,
             COUNT(DISTINCT c.id) AS comment_count
      FROM bookmarks b
      JOIN posts p ON p.id = b.post_id AND p.status = 'active'
      JOIN users u ON u.id = p.user_id
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE b.user_id = $1
      GROUP BY p.id, p.uuid, p.caption, p.image, p.created_at, u.uuid, u.username, u.full_name, u.avatar
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM bookmarks WHERE user_id = $1',
      [req.user.id]
    );

    return paginate(res, rows.rows, { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) }, 'Bookmark berhasil diambil.');
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

    const rows = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.created_at,
             COUNT(DISTINCT l.id) AS like_count,
             COUNT(DISTINCT c.id) AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.user_id AND u.username = $1 AND u.is_active = TRUE
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE p.status = 'active'
      GROUP BY p.id, p.uuid, p.caption, p.image, p.created_at
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [username, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*)::int AS total FROM posts p JOIN users u ON u.id = p.user_id
      WHERE u.username = $1 AND p.status = 'active'
    `, [username]);

    return paginate(res, rows.rows, { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) }, `Post dari @${username}.`);
  } catch (err) {
    console.error('[getUserPosts]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = {
  createPost, getAllPosts, getPost, updatePost, deletePost,
  getFeed, toggleLike, toggleBookmark, getMyBookmarks, getUserPosts,
};
