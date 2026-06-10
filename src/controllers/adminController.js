const { pool } = require('../config/database');
const { success, error, paginate } = require('../utils/response');

const getDashboard = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE is_banned = FALSE) AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE role = 'moderator') AS total_moderators,
        (SELECT COUNT(*)::int FROM posts WHERE status = 'active') AS total_posts,
        (SELECT COUNT(*)::int FROM comments WHERE status = 'active') AS total_comments,
        (SELECT COUNT(*)::int FROM likes) AS total_likes,
        (SELECT COUNT(*)::int FROM reports WHERE status = 'pending') AS pending_reports,
        (SELECT COUNT(*)::int FROM users WHERE DATE(created_at) = CURRENT_DATE) AS new_users_today,
        (SELECT COUNT(*)::int FROM posts WHERE DATE(created_at) = CURRENT_DATE) AS new_posts_today
    `);

    const activity = await pool.query(`
      SELECT DATE(created_at) AS date, COUNT(*)::int AS count
      FROM activity_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const topUsers = await pool.query(`
      SELECT u.username, u.full_name,
        COUNT(DISTINCT p.id)::int AS posts,
        COUNT(DISTINCT l.id)::int AS likes_received,
        COUNT(DISTINCT f.id)::int AS followers
      FROM users u
      LEFT JOIN posts p ON p.user_id = u.id AND p.status = 'active'
      LEFT JOIN likes l ON l.post_id = p.id
      LEFT JOIN follows f ON f.following_id = u.id
      GROUP BY u.id, u.username, u.full_name
      ORDER BY posts DESC, likes_received DESC
      LIMIT 5
    `);

    return success(res, { stats: stats.rows[0], activity_chart: activity.rows, top_users: topUsers.rows }, 'Dashboard berhasil diambil.');
  } catch (err) {
    console.error('getDashboard error:', err);
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    const searchParam = `%${search}%`;
    const rows = await pool.query(`
      SELECT u.uuid, u.username, u.email, u.full_name, u.role, u.is_active, u.is_banned, u.created_at,
        COUNT(DISTINCT p.id)::int AS post_count
      FROM users u
      LEFT JOIN posts p ON p.user_id = u.id
      WHERE u.username ILIKE $1 OR u.email ILIKE $2 OR u.full_name ILIKE $3
      GROUP BY u.id, u.uuid, u.username, u.email, u.full_name, u.role, u.is_active, u.is_banned, u.created_at
      ORDER BY u.created_at DESC
      LIMIT $4 OFFSET $5
    `, [searchParam, searchParam, searchParam, limit, offset]);

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM users WHERE username ILIKE $1 OR email ILIKE $2',
      [searchParam, searchParam]
    );

    return paginate(res, rows.rows, { page, limit, total: countResult.rows[0].total, total_pages: Math.ceil(countResult.rows[0].total / limit) });
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { role } = req.body;

    if (!['user', 'moderator', 'admin'].includes(role)) {
      return error(res, 'Role tidak valid.', 400);
    }

    const rows = await pool.query('SELECT id FROM users WHERE uuid = $1', [uuid]);
    if (rows.rows.length === 0) return error(res, 'User tidak ditemukan.', 404);

    await pool.query('UPDATE users SET role = $1 WHERE uuid = $2', [role, uuid]);
    return success(res, null, `Role user berhasil diubah menjadi ${role}.`);
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const toggleBanUser = async (req, res) => {
  try {
    const { uuid } = req.params;
    const rows = await pool.query('SELECT id, is_banned, username FROM users WHERE uuid = $1', [uuid]);
    if (rows.rows.length === 0) return error(res, 'User tidak ditemukan.', 404);

    const user = rows.rows[0];
    const newStatus = !user.is_banned;
    await pool.query('UPDATE users SET is_banned = $1 WHERE uuid = $2', [newStatus, uuid]);

    return success(res, { is_banned: !!newStatus },
      newStatus ? `User @${user.username} berhasil dibanned.` : `User @${user.username} berhasil di-unban.`
    );
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

const getUserActivity = async (req, res) => {
  try {
    const { uuid } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const offset = (page - 1) * limit;

    const rows = await pool.query(`
      SELECT al.action, al.entity_type, al.entity_id, al.ip_address, al.created_at
      FROM activity_logs al
      JOIN users u ON u.id = al.user_id AND u.uuid = $1
      ORDER BY al.created_at DESC
      LIMIT $2 OFFSET $3
    `, [uuid, limit, offset]);

    return success(res, rows.rows, 'Log aktivitas berhasil diambil.');
  } catch (err) {
    return error(res, 'Terjadi kesalahan server.', 500);
  }
};

module.exports = { getDashboard, getAllUsers, updateUserRole, toggleBanUser, getUserActivity };
