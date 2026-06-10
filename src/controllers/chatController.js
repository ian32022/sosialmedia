const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const fs = require('fs');
const path = require('path');

const validateMessage = (content, file) => {
  const errs = [];
  if (!content && !file) errs.push('Pesan atau media wajib diisi.');
  if (content && content.length > 2000) errs.push('Pesan maksimal 2000 karakter.');
  return errs;
};

const getOrCreateConversation = async (userId1, userId2) => {
  const existing = await pool.query(`
    SELECT c.id, c.uuid
    FROM conversations c
    JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
    JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
  `, [userId1, userId2]);

  if (existing.rows.length) return existing.rows[0];

  const uuid = uuidv4();
  const result = await pool.query(
    'INSERT INTO conversations (uuid) VALUES ($1) RETURNING id', [uuid]
  );
  const convId = result.rows[0].id;

  await pool.query(
    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($3, $4)',
    [convId, userId1, convId, userId2]
  );

  return { id: convId, uuid };
};

const startConversation = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return error(res, 'Username tujuan wajib diisi.', 400);
    if (username === req.user.username) return error(res, 'Tidak bisa chat diri sendiri.', 400);

    const target = await pool.query(
      'SELECT id, uuid, username, full_name, avatar FROM users WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    if (!target.rows.length) return error(res, 'User tidak ditemukan.', 404);

    const conv = await getOrCreateConversation(req.user.id, target.rows[0].id);

    return success(res, {
      conversation_uuid: conv.uuid,
      target_user: target.rows[0],
    }, 'Percakapan berhasil dimulai.', 201);
  } catch (err) {
    console.error('[startConversation]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getConversations = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const rows = await pool.query(`
      SELECT c.uuid, c.last_message, c.last_activity, c.created_at,
             u.uuid AS other_user_uuid, u.username AS other_username, u.full_name AS other_full_name, u.avatar AS other_avatar,
             (SELECT COUNT(*)::int FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND is_read = FALSE) AS unread_count
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $2
      JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id != cp.user_id
      JOIN users u ON u.id = cp2.user_id
      ORDER BY c.last_activity DESC
      LIMIT $3 OFFSET $4
    `, [req.user.id, req.user.id, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*)::int AS total FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
    `, [req.user.id]);

    return paginate(res, rows.rows, { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) }, 'Daftar percakapan.');
  } catch (err) {
    console.error('[getConversations]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const sendMessage = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { content } = req.body;

    const errs = validateMessage(content, req.file);
    if (errs.length) return error(res, errs.join(' '), 400);

    const conv = await pool.query(`
      SELECT c.id FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
      WHERE c.uuid = $2
    `, [req.user.id, uuid]);
    if (!conv.rows.length) return error(res, 'Percakapan tidak ditemukan atau Anda bukan peserta.', 404);

    const msgUuid = uuidv4();
    const mediaPath = req.file ? `chat/${req.file.filename}` : null;

    const result = await pool.query(
      'INSERT INTO messages (uuid, conversation_id, sender_id, content, media) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [msgUuid, conv.rows[0].id, req.user.id, content || null, mediaPath]
    );

    await pool.query(
      'UPDATE conversations SET last_message = $1, last_sender_id = $2, last_activity = NOW() WHERE id = $3',
      [content || '[Media]', req.user.id, conv.rows[0].id]
    );

    const msg = await pool.query(`
      SELECT m.uuid, m.content, m.media, m.is_read, m.created_at,
             u.uuid AS sender_uuid, u.username AS sender_username
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.id = $1
    `, [result.rows[0].id]);

    return success(res, msg.rows[0], 'Pesan berhasil dikirim.', 201);
  } catch (err) {
    console.error('[sendMessage]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getMessages = async (req, res) => {
  try {
    const { uuid } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const conv = await pool.query(`
      SELECT c.id FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
      WHERE c.uuid = $2
    `, [req.user.id, uuid]);
    if (!conv.rows.length) return error(res, 'Percakapan tidak ditemukan.', 404);

    const rows = await pool.query(`
      SELECT m.uuid, m.content, m.media, m.is_read, m.read_at, m.created_at,
             u.uuid AS sender_uuid, u.username AS sender_username
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [conv.rows[0].id, limit, offset]);

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM messages WHERE conversation_id = $1',
      [conv.rows[0].id]
    );

    await pool.query(
      'UPDATE messages SET is_read = TRUE, read_at = NOW() WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE',
      [conv.rows[0].id, req.user.id]
    );

    return paginate(res, rows.rows.reverse(), { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) }, 'Pesan berhasil diambil.');
  } catch (err) {
    console.error('[getMessages]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = {
  startConversation, getConversations, sendMessage, getMessages,
};
