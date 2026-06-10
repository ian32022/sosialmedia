const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const fs = require('fs');
const path = require('path');

const STORY_DURATION_HOURS = 24;

const validateStory = (file) => {
  const errs = [];
  if (!file) errs.push('Media (foto/video) wajib diupload.');
  return errs;
};

const isOwnerOrAdmin = (userId, storyUserId, reqUser) => {
  return storyUserId === userId || ['admin', 'moderator'].includes(reqUser.role);
};

const createStory = async (req, res) => {
  try {
    const { caption } = req.body;
    const errs = validateStory(req.file);
    if (errs.length) return error(res, errs.join(' '), 400);
    if (caption && caption.length > 255) return error(res, 'Caption maksimal 255 karakter.', 400);

    const uuid = uuidv4();
    const mediaPath = `stories/${req.file.filename}`;
    const expiresAt = new Date(Date.now() + STORY_DURATION_HOURS * 60 * 60 * 1000);

    const result = await pool.query(
      'INSERT INTO stories (uuid, user_id, media, caption, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [uuid, req.user.id, mediaPath, caption || null, expiresAt]
    );

    const rows = await pool.query(`
      SELECT s.uuid, s.media, s.caption, s.expires_at, s.status, s.created_at,
             u.username, u.full_name, u.avatar
      FROM stories s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`, [result.rows[0].id]);

    return success(res, rows.rows[0], 'Story berhasil dibuat.', 201);
  } catch (err) {
    console.error('[createStory]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getFollowingStories = async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT s.uuid, s.media, s.caption, s.expires_at, s.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar
      FROM stories s
      JOIN users u ON u.id = s.user_id
      WHERE s.status = 'active'
        AND s.expires_at > NOW()
        AND (s.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1) OR s.user_id = $2)
      ORDER BY u.username, s.created_at DESC
    `, [req.user.id, req.user.id]);

    return success(res, rows.rows, 'Daftar stories berhasil diambil.');
  } catch (err) {
    console.error('[getFollowingStories]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getUserStories = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await pool.query(
      'SELECT id FROM users WHERE username = $1 AND is_active = TRUE', [username]
    );
    if (!user.rows.length) return error(res, 'User tidak ditemukan.', 404);

    const rows = await pool.query(`
      SELECT s.uuid, s.media, s.caption, s.expires_at, s.created_at,
             (SELECT COUNT(*)::int FROM story_views WHERE story_id = s.id) AS view_count
      FROM stories s
      WHERE s.user_id = $1 AND s.status = 'active' AND s.expires_at > NOW()
      ORDER BY s.created_at DESC
    `, [user.rows[0].id]);

    return success(res, rows.rows, `Stories dari @${username} berhasil diambil.`);
  } catch (err) {
    console.error('[getUserStories]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getStory = async (req, res) => {
  try {
    const { uuid } = req.params;
    const rows = await pool.query(`
      SELECT s.uuid, s.media, s.caption, s.expires_at, s.status, s.created_at,
             u.uuid AS user_uuid, u.username, u.full_name, u.avatar
      FROM stories s JOIN users u ON u.id = s.user_id
      WHERE s.uuid = $1 AND s.status = 'active' AND s.expires_at > NOW()
    `, [uuid]);

    if (!rows.rows.length) return error(res, 'Story tidak ditemukan atau sudah expired.', 404);
    return success(res, rows.rows[0], 'Story berhasil diambil.');
  } catch (err) {
    console.error('[getStory]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const deleteStory = async (req, res) => {
  try {
    const { uuid } = req.params;
    const rows = await pool.query('SELECT id, user_id, media FROM stories WHERE uuid = $1', [uuid]);
    if (!rows.rows.length) return error(res, 'Story tidak ditemukan.', 404);

    if (!isOwnerOrAdmin(req.user.id, rows.rows[0].user_id, req.user)) {
      return error(res, 'Tidak berhak menghapus story ini.', 403);
    }

    if (rows.rows[0].media) {
      const filePath = path.join(process.env.UPLOAD_PATH || './uploads', rows.rows[0].media);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await pool.query('DELETE FROM stories WHERE id = $1', [rows.rows[0].id]);
    return success(res, null, 'Story berhasil dihapus.');
  } catch (err) {
    console.error('[deleteStory]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const viewStory = async (req, res) => {
  try {
    const { uuid } = req.params;
    const stories = await pool.query('SELECT id, user_id FROM stories WHERE uuid = $1 AND status = \'active\' AND expires_at > NOW()', [uuid]);
    if (!stories.rows.length) return error(res, 'Story tidak ditemukan atau sudah expired.', 404);
    if (stories.rows[0].user_id === req.user.id) return error(res, 'Tidak bisa melihat story sendiri.', 400);

    await pool.query(
      'INSERT INTO story_views (story_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [stories.rows[0].id, req.user.id]
    );

    return success(res, null, 'Story ditandai sudah dilihat.');
  } catch (err) {
    console.error('[viewStory]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getStoryViews = async (req, res) => {
  try {
    const { uuid } = req.params;
    const stories = await pool.query('SELECT id, user_id FROM stories WHERE uuid = $1', [uuid]);
    if (!stories.rows.length) return error(res, 'Story tidak ditemukan.', 404);
    if (!isOwnerOrAdmin(req.user.id, stories.rows[0].user_id, req.user)) {
      return error(res, 'Tidak berhak melihat views story ini.', 403);
    }

    const rows = await pool.query(`
      SELECT u.uuid, u.username, u.full_name, u.avatar, sv.viewed_at
      FROM story_views sv JOIN users u ON u.id = sv.viewer_id
      WHERE sv.story_id = $1
      ORDER BY sv.viewed_at DESC
    `, [stories.rows[0].id]);

    return success(res, rows.rows, 'Daftar viewers berhasil diambil.');
  } catch (err) {
    console.error('[getStoryViews]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = {
  createStory, getFollowingStories, getUserStories, getStory,
  deleteStory, viewStory, getStoryViews,
};
