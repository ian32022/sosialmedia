const express = require('express');
const router  = express.Router();
const { verifyToken, authorize, optionalAuth } = require('../middleware/auth');
const { uploadStoryMedia } = require('../middleware/upload');
const {
  createStory, getFollowingStories, getUserStories, getStory,
  deleteStory, viewStory, getStoryViews,
} = require('../controllers/storyController');

router.post('/',          verifyToken, uploadStoryMedia, createStory);
router.get('/',           verifyToken, getFollowingStories);
router.get('/user/:username', optionalAuth, getUserStories);
router.get('/:uuid',       optionalAuth, getStory);
router.delete('/:uuid',    verifyToken, deleteStory);
router.post('/:uuid/view', verifyToken, viewStory);
router.get('/:uuid/views', verifyToken, getStoryViews);

module.exports = router;
