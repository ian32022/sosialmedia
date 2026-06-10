const express = require('express');
const router  = express.Router();
const { optionalAuth } = require('../middleware/auth');
const {
  getTrending, searchHashtags, getPostsByHashtag,
} = require('../controllers/hashtagController');

router.get('/trending', optionalAuth, getTrending);
router.get('/search',   optionalAuth, searchHashtags);
router.get('/:name/posts', optionalAuth, getPostsByHashtag);

module.exports = router;
