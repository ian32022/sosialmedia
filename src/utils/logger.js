const { pool } = require('../config/database');

const logActivity = async (userId, action, entityType = null, entityId = null, ipAddress = null) => {
  try {
    await pool.query(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, ip_address) VALUES (?, ?, ?, ?, ?)',
      [userId, action, entityType, entityId, ipAddress]
    );
  } catch (_) {}
};

module.exports = { logActivity };
