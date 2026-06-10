const express = require('express');
const router  = express.Router();
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { uploadAvatar }  = require('../middleware/upload');
const {
  getProfile, updateProfile, deleteUser,
  changePassword, toggleFollow, getFollowers, getFollowing,
} = require('../controllers/userController');

router.get('/profile',          verifyToken,  getProfile);                 // R self
router.put('/profile',          verifyToken,  uploadAvatar, updateProfile); // U self
router.put('/password',         verifyToken,  changePassword);
router.delete('/account',       verifyToken,  deleteUser);                 // D self

router.get('/:username',        optionalAuth, getProfile);                 // R other
router.post('/:username/follow',verifyToken,  toggleFollow);
router.get('/:username/followers', optionalAuth, getFollowers);
router.get('/:username/following', optionalAuth, getFollowing);

module.exports = router;
