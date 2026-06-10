const express = require('express');
const router  = express.Router();
const { verifyToken, authorize, optionalAuth } = require('../middleware/auth');
const { uploadPostImage } = require('../middleware/upload');
const {
  createPost, getAllPosts, getPost, updatePost, deletePost,
  getFeed, toggleLike, toggleBookmark, getMyBookmarks,
} = require('../controllers/postController');
const { addComment, getComments, updateComment, deleteComment } = require('../controllers/commentController');

// ── Posts CRUD ───────────────────────────────────────────────
router.post('/',           verifyToken, uploadPostImage, createPost);              // C
router.get('/',            optionalAuth, getAllPosts);                              // R all
router.get('/feed',        verifyToken, getFeed);                                  // R feed
router.get('/bookmarks',   verifyToken, getMyBookmarks);                           // R bookmarks
router.get('/:uuid',       optionalAuth, getPost);                                 // R one
router.put('/:uuid',       verifyToken, uploadPostImage, updatePost);              // U (owner|admin)
router.delete('/:uuid',    verifyToken, deletePost);                               // D (owner|admin)

// ── Interaksi ────────────────────────────────────────────────
router.post('/:uuid/like',     verifyToken, toggleLike);
router.post('/:uuid/bookmark', verifyToken, toggleBookmark);

// ── Comments CRUD ────────────────────────────────────────────
router.get('/:uuid/comments',        optionalAuth, getComments);                   // R
router.post('/:uuid/comments',       verifyToken,  addComment);                    // C
router.put('/comments/:id',          verifyToken,  updateComment);                 // U (owner|mod)
router.delete('/comments/:id',       verifyToken,  deleteComment);                 // D (owner|mod)

module.exports = router;
