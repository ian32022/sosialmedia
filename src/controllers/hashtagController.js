const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');

// ── Helper: extract hashtags from text ───────────────────────
const extractHashtags = (text) => {
  if (!text) return [];
  const matches = text.match(/#(\w{1,100})/g);
  if (!matches) return [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
};

// ── Helper: save hashtags for post ────────────────────────────
const saveHashtags = async (postId, caption) => {
  const tags = extractHashtags(caption);
  for (const tag of tags) {
    const [existing] = await pool.query('SELECT id FROM hashtags WHERE name = ?', [tag]);
    if (existing.length) {
      await pool.query('UPDATE hashtags SET usage_count = usage_count + 1 WHERE id = ?', [existing[0].id]);
      await pool.query('INSERT IGNORE INTO post_hashtags (post_id, hashtag_id) VALUES (?, ?)', [postId, existing[0].id]);
    } else {
      const [result] = await pool.query('INSERT INTO hashtags (name) VALUES (?)', [tag]);
      await pool.query('INSERT INTO post_hashtags (post_id, hashtag_id) VALUES (?, ?)', [postId, result.insertId]);
    }
  }
};

exports.saveHashtags = saveHashtags;

// ── Helper: remove hashtags for post ──────────────────────────
const removePostHashtags = async (postId) => {
  const [tags] = await pool.query(
    'SELECT h.id, h.name FROM hashtags h JOIN post_hashtags ph ON ph.hashtag_id = h.id WHERE ph.post_id = ?',
    [postId]
  );
  for (const tag of tags) {
    await pool.query('UPDATE hashtags SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = ?', [tag.id]);
  }
  await pool.query('DELETE FROM post_hashtags WHERE post_id = ?', [postId]);
};

exports.removePostHashtags = removePostHashtags;

// ── Helper: update hashtags for post ──────────────────────────
const updatePostHashtags = async (postId, newCaption) => {
  await removePostHashtags(postId);
  await saveHashtags(postId, newCaption);
};

exports.updatePostHashtags = updatePostHashtags;

// TRENDING — GET /api/hashtags/trending
const getTrending = async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    const [rows] = await pool.query(`
      SELECT h.name, h.usage_count,
             (SELECT COUNT(*) FROM post_hashtags ph
              JOIN posts p ON p.id = ph.post_id
              WHERE ph.hashtag_id = h.id AND p.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS recent_usage
      FROM hashtags h
      WHERE h.usage_count > 0
      ORDER BY recent_usage DESC, h.usage_count DESC
      LIMIT ?
    `, [limit]);

    return success(res, rows, 'Trending hashtags berhasil diambil.');
  } catch (err) {
    console.error('[getTrending]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// SEARCH — GET /api/hashtags/search?q=
const searchHashtags = async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) return error(res, 'Parameter q (query) wajib diisi.', 400);

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(`
      SELECT name, usage_count FROM hashtags
      WHERE name LIKE ?
      ORDER BY usage_count DESC
      LIMIT ? OFFSET ?
    `, [`${q}%`, limit, offset]);

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM hashtags WHERE name LIKE ?',
      [`${q}%`]
    );

    return paginate(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit) }, 'Hashtag berhasil dicari.');
  } catch (err) {
    console.error('[searchHashtags]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// GET posts by hashtag — GET /api/hashtags/:name/posts
const getPostsByHashtag = async (req, res) => {
  try {
    const { name } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar,
             COUNT(DISTINCT l.id) AS like_count,
             COUNT(DISTINCT c.id) AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.user_id
      JOIN post_hashtags ph ON ph.post_id = p.id
      JOIN hashtags h ON h.id = ph.hashtag_id AND h.name = ?
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE p.status = 'active'
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `, [name, limit, offset]);

    const [[{ total }]] = await pool.query(`
      SELECT COUNT(DISTINCT p.id) AS total
      FROM posts p JOIN post_hashtags ph ON ph.post_id = p.id
      JOIN hashtags h ON h.id = ph.hashtag_id AND h.name = ?
      WHERE p.status = 'active'
    `, [name]);

    return paginate(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit) }, `Post dengan hashtag #${name}.`);
  } catch (err) {
    console.error('[getPostsByHashtag]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = {
  saveHashtags, removePostHashtags, updatePostHashtags,
  getTrending, searchHashtags, getPostsByHashtag,
};
