const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');

const extractHashtags = (text) => {
  if (!text) return [];
  const matches = text.match(/#(\w{1,100})/g);
  if (!matches) return [];
  return [...new Set(matches.map(t => t.slice(1).toLowerCase()))];
};

const saveHashtags = async (postId, caption) => {
  const tags = extractHashtags(caption);
  for (const tag of tags) {
    const existing = await pool.query('SELECT id FROM hashtags WHERE name = $1', [tag]);
    if (existing.rows.length) {
      await pool.query('UPDATE hashtags SET usage_count = usage_count + 1 WHERE id = $1', [existing.rows[0].id]);
      await pool.query('INSERT INTO post_hashtags (post_id, hashtag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, existing.rows[0].id]);
    } else {
      const result = await pool.query('INSERT INTO hashtags (name) VALUES ($1) RETURNING id', [tag]);
      await pool.query('INSERT INTO post_hashtags (post_id, hashtag_id) VALUES ($1, $2)', [postId, result.rows[0].id]);
    }
  }
};

exports.saveHashtags = saveHashtags;

const removePostHashtags = async (postId) => {
  const tags = await pool.query(
    'SELECT h.id, h.name FROM hashtags h JOIN post_hashtags ph ON ph.hashtag_id = h.id WHERE ph.post_id = $1',
    [postId]
  );
  for (const tag of tags.rows) {
    await pool.query('UPDATE hashtags SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = $1', [tag.id]);
  }
  await pool.query('DELETE FROM post_hashtags WHERE post_id = $1', [postId]);
};

exports.removePostHashtags = removePostHashtags;

const updatePostHashtags = async (postId, newCaption) => {
  await removePostHashtags(postId);
  await saveHashtags(postId, newCaption);
};

exports.updatePostHashtags = updatePostHashtags;

const getTrending = async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 20);

    const rows = await pool.query(`
      SELECT h.name, h.usage_count,
        (SELECT COUNT(*)::int FROM post_hashtags ph
         JOIN posts p ON p.id = ph.post_id
         WHERE ph.hashtag_id = h.id AND p.created_at >= NOW() - INTERVAL '24 hours') AS recent_usage
      FROM hashtags h
      WHERE h.usage_count > 0
      ORDER BY recent_usage DESC, h.usage_count DESC
      LIMIT $1
    `, [limit]);

    return success(res, rows.rows, 'Trending hashtags berhasil diambil.');
  } catch (err) {
    console.error('[getTrending]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const searchHashtags = async (req, res) => {
  try {
    const q = req.query.q || '';
    if (!q) return error(res, 'Parameter q (query) wajib diisi.', 400);

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const rows = await pool.query(`
      SELECT name, usage_count FROM hashtags
      WHERE name ILIKE $1
      ORDER BY usage_count DESC
      LIMIT $2 OFFSET $3
    `, [`${q}%`, limit, offset]);

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM hashtags WHERE name ILIKE $1',
      [`${q}%`]
    );

    return paginate(res, rows.rows, { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) }, 'Hashtag berhasil dicari.');
  } catch (err) {
    console.error('[searchHashtags]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getPostsByHashtag = async (req, res) => {
  try {
    const { name } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const rows = await pool.query(`
      SELECT p.uuid, p.caption, p.image, p.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar,
             COUNT(DISTINCT l.id)::int AS like_count,
             COUNT(DISTINCT c.id)::int AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.user_id
      JOIN post_hashtags ph ON ph.post_id = p.id
      JOIN hashtags h ON h.id = ph.hashtag_id AND h.name = $1
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN comments c ON c.post_id = p.id AND c.status = 'active'
      WHERE p.status = 'active'
      GROUP BY p.id, p.uuid, p.caption, p.image, p.created_at, u.uuid, u.username, u.full_name, u.avatar
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [name, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(DISTINCT p.id)::int AS total
      FROM posts p JOIN post_hashtags ph ON ph.post_id = p.id
      JOIN hashtags h ON h.id = ph.hashtag_id AND h.name = $1
      WHERE p.status = 'active'
    `, [name]);

    return paginate(res, rows.rows, { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) }, `Post dengan hashtag #${name}.`);
  } catch (err) {
    console.error('[getPostsByHashtag]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = {
  saveHashtags, removePostHashtags, updatePostHashtags,
  getTrending, searchHashtags, getPostsByHashtag,
};
