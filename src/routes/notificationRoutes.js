const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  getNotifications, getUnreadCount, markAsRead, deleteNotification,
} = require('../controllers/notificationController');

router.get('/unread-count', verifyToken, getUnreadCount);
router.get('/',              verifyToken, getNotifications);
router.put('/read',          verifyToken, markAsRead);
router.delete('/:uuid',      verifyToken, deleteNotification);

module.exports = router;
