const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { createReport, getReports, reviewReport } = require('../controllers/reportController');

router.post('/', verifyToken, createReport);

router.get('/', verifyToken, requireRole('moderator'), getReports);

router.put('/:id', verifyToken, requireRole('moderator'), reviewReport);

module.exports = router;
