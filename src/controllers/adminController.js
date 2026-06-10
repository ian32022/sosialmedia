const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');

// ─── DASHBOARD STATISTIK ──────────────────────────────────────
const getDashboard = async (req, res) => {
  try {
    const [[stats]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_banned = 0) AS total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'moderator') AS total_moderators,
        (SELECT COUNT(*) FROM posts WHERE status = 'active') AS total_posts,
        (SELECT COUNT(*) FROM comments WHERE status = 'active') AS total_comments,
        (SELECT COUNT(*) FROM likes) AS total_likes,
        (SELECT COUNT(*) FROM reports WHERE status = 'pending') AS pending_reports,
        (SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURDATE()) AS new_users_today,
        (SELECT COUNT(*) FROM posts WHERE DATE(created_at) = CURDATE()) AS new_posts_today
    `);

    // Aktivitas 7 hari terakhir
    const [activity] = await pool.query(`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM activity_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Top 5 user paling aktif
    const [topUsers] = await pool.query(`
      SELECT u.username, u.full_name,
        COUNT(DISTINCT p.id) AS posts,
        COUNT(DISTINCT l.id) AS likes_received,
        COUNT(DISTINCT f.id) AS followers
      FROM users u
      LEFT JOIN posts p ON p.user_id = u.id AND p.status = 'active'
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN follows f ON f.following_id = u.id
      GROUP BY u.id
      ORDER BY posts DESC, likes_received DESC
      LIMIT 5
    `);

    return success(res, { stats, activity_chart: activity, top_users: topUsers }, 'Dashboard berhasil diambil.');
  } catch (err) {
    console.error('getDashboard error:', err);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ─── GET SEMUA USER ───────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    const searchParam = `%${search}%`;
    const [rows] = await pool.query(`
      SELECT u.uuid, u.username, u.email, u.full_name, u.role, u.is_active, u.is_banned, u.created_at,
        COUNT(DISTINCT p.id) AS post_count
      FROM users u
      LEFT JOIN posts p ON p.user_id = u.id
      WHERE u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [searchParam, searchParam, searchParam, limit, offset]);

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM users WHERE username LIKE ? OR email LIKE ?',
      [searchParam, searchParam]
    );

    return paginate(res, rows, { page, limit, total, total_pages: Math.ceil(total / limit) });
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ─── UPDATE ROLE USER ─────────────────────────────────────────
const updateUserRole = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { role } = req.body;

    if (!['user', 'moderator', 'admin'].includes(role)) {
      return error(res, 'Role tidak valid.', 400);
    }

    const [rows] = await pool.query('SELECT id FROM users WHERE uuid = ?', [uuid]);
    if (rows.length === 0) return error(res, 'User tidak ditemukan.', 404);

    await pool.query('UPDATE users SET role = ? WHERE uuid = ?', [role, uuid]);
    return success(res, null, `Role user berhasil diubah menjadi ${role}.`);
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ─── BAN / UNBAN USER ─────────────────────────────────────────
const toggleBanUser = async (req, res) => {
  try {
    const { uuid } = req.params;
    const [rows] = await pool.query('SELECT id, is_banned, username FROM users WHERE uuid = ?', [uuid]);
    if (rows.length === 0) return error(res, 'User tidak ditemukan.', 404);

    const user = rows[0];
    const newStatus = user.is_banned ? 0 : 1;
    await pool.query('UPDATE users SET is_banned = ? WHERE uuid = ?', [newStatus, uuid]);

    return success(res, { is_banned: !!newStatus },
      newStatus ? `User @${user.username} berhasil dibanned.` : `User @${user.username} berhasil di-unban.`
    );
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

// ─── LOG AKTIVITAS USER ───────────────────────────────────────
const getUserActivity = async (req, res) => {
  try {
    const { uuid } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(`
      SELECT al.action, al.entity_type, al.entity_id, al.ip_address, al.created_at
      FROM activity_logs al
      JOIN users u ON u.id = al.user_id AND u.uuid = ?
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `, [uuid, limit, offset]);

    return success(res, rows, 'Log aktivitas berhasil diambil.');
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = { getDashboard, getAllUsers, updateUserRole, toggleBanUser, getUserActivity };
