const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');
const fs = require('fs');
const path = require('path');

// ── Helper: validasi content ─────────────────────────────────
const validateMessage = (content, file) => {
  const errs = [];
  if (!content && !file) errs.push('Pesan atau media wajib diisi.');
  if (content && content.length > 2000) errs.push('Pesan maksimal 2000 karakter.');
  return errs;
};

// ── Helper: get or create conversation ────────────────────────
const getOrCreateConversation = async (userId1, userId2) => {
  const [existing] = await pool.query(`
    SELECT c.id, c.uuid
    FROM conversations c
    JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = ?
    JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
  `, [userId1, userId2]);

  if (existing.length) return existing[0];

  const uuid = uuidv4();
  const [result] = await pool.query(
    'INSERT INTO conversations (uuid) VALUES (?)', [uuid]
  );
  const convId = result.insertId;

  await pool.query(
    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)',
    [convId, userId1, convId, userId2]
  );

  return { id: convId, uuid };
};

// CREATE conversation — POST /api/chat/start
const startConversation = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return error(res, 'Username tujuan wajib diisi.', 400);
    if (username === req.user.username) return error(res, 'Tidak bisa chat diri sendiri.', 400);

    const [target] = await pool.query(
      'SELECT id, uuid, username, full_name, avatar FROM users WHERE username = ? AND is_active = 1',
      [username]
    );
    if (!target.length) return error(res, 'User tidak ditemukan.', 404);

    const conv = await getOrCreateConversation(req.user.id, target[0].id);

    return success(res, {
      conversation_uuid: conv.uuid,
      target_user: target[0],
    }, 'Percakapan berhasil dimulai.', 201);
  } catch (err) {
    console.error('[startConversation]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// LIST conversations — GET /api/chat/conversations
const getConversations = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(`
      SELECT c.uuid, c.last_message, c.last_activity, c.created_at,
             u.uuid AS other_user_uuid, u.username AS other_username, u.full_name AS other_full_name, u.avatar AS other_avatar,
             (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND is_read = 0) AS unread_count
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
      JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id != cp.user_id
      JOIN users u ON u.id = cp2.user_id
      ORDER BY c.last_activity DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, req.user.id, limit, offset]);

    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) AS total FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
    `, [req.user.id]);

    return paginate(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit) }, 'Daftar percakapan.');
  } catch (err) {
    console.error('[getConversations]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// SEND message — POST /api/chat/conversations/:uuid/messages
const sendMessage = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { content } = req.body;

    const errs = validateMessage(content, req.file);
    if (errs.length) return error(res, errs.join(' '), 400);

    const [conv] = await pool.query(`
      SELECT c.id FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
      WHERE c.uuid = ?
    `, [req.user.id, uuid]);
    if (!conv.length) return error(res, 'Percakapan tidak ditemukan atau Anda bukan peserta.', 404);

    const msgUuid = uuidv4();
    const mediaPath = req.file ? `chat/${req.file.filename}` : null;

    const [result] = await pool.query(
      'INSERT INTO messages (uuid, conversation_id, sender_id, content, media) VALUES (?, ?, ?, ?, ?)',
      [msgUuid, conv[0].id, req.user.id, content || null, mediaPath]
    );

    await pool.query(
      'UPDATE conversations SET last_message = ?, last_sender_id = ?, last_activity = NOW() WHERE id = ?',
      [content || '[Media]', req.user.id, conv[0].id]
    );

    const [msg] = await pool.query(`
      SELECT m.uuid, m.content, m.media, m.is_read, m.created_at,
             u.uuid AS sender_uuid, u.username AS sender_username
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `, [result.insertId]);

    return success(res, msg[0], 'Pesan berhasil dikirim.', 201);
  } catch (err) {
    console.error('[sendMessage]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// GET messages — GET /api/chat/conversations/:uuid/messages
const getMessages = async (req, res) => {
  try {
    const { uuid } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const [conv] = await pool.query(`
      SELECT c.id FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
      WHERE c.uuid = ?
    `, [req.user.id, uuid]);
    if (!conv.length) return error(res, 'Percakapan tidak ditemukan.', 404);

    const [rows] = await pool.query(`
      SELECT m.uuid, m.content, m.media, m.is_read, m.read_at, m.created_at,
             u.uuid AS sender_uuid, u.username AS sender_username
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [conv[0].id, limit, offset]);

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?',
      [conv[0].id]
    );

    await pool.query(
      'UPDATE messages SET is_read = 1, read_at = NOW() WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
      [conv[0].id, req.user.id]
    );

    return paginate(res, rows.reverse(), { page, limit, total, total_pages: Math.ceil(total / limit) }, 'Pesan berhasil diambil.');
  } catch (err) {
    console.error('[getMessages]', err.message);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = {
  startConversation, getConversations, sendMessage, getMessages,
};
