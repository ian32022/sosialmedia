const express = require('express');
const router  = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { getDashboard, updateUserRole, toggleBanUser, getUserActivity } = require('../controllers/adminController');
const { getAllUsers, deleteUser } = require('../controllers/userController');

// Semua route admin: harus login + minimal role admin
router.use(verifyToken, requireRole('admin'));

router.get('/dashboard',                getDashboard);
router.get('/users',                    getAllUsers);           // R all users
router.put('/users/:uuid/role',         updateUserRole);        // U role
router.put('/users/:uuid/ban',          toggleBanUser);         // U ban
router.delete('/users/:uuid',           deleteUser);            // D user
router.get('/users/:uuid/activity',     getUserActivity);

module.exports = router;
