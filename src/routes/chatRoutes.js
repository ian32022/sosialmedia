const express = require('express');
const router  = express.Router();
const { verifyToken } = require('../middleware/auth');
const { uploadChatMedia } = require('../middleware/upload');
const {
  startConversation, getConversations, sendMessage, getMessages,
} = require('../controllers/chatController');

router.post('/start',                    verifyToken, startConversation);
router.get('/conversations',             verifyToken, getConversations);
router.get('/conversations/:uuid/messages', verifyToken, getMessages);
router.post('/conversations/:uuid/messages', verifyToken, uploadChatMedia, sendMessage);

module.exports = router;
