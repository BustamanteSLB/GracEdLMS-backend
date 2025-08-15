const express = require('express');
const {
  createDiscussion,
  getDiscussionsForSubject,
  getDiscussion,
  updateDiscussion,
  deleteDiscussion,
  addCommentToDiscussion,
  updateCommentInDiscussion,
  deleteCommentFromDiscussion
} = require('../controllers/discussionController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// Discussions for a subject
router
  .route('/subjects/:subjectId/discussions')
  .post(authorize('Admin', 'Teacher'), createDiscussion)
  .get(getDiscussionsForSubject);

// Single discussion by ID
router
  .route('/discussions/:id')
  .get(getDiscussion)
  .put(authorize('Admin', 'Teacher'), updateDiscussion)
  .delete(authorize('Admin', 'Teacher'), deleteDiscussion);

// Comments on a discussion
router
  .route('/discussions/:discussionId/comments')
  .post(authorize('Admin', 'Teacher', 'Student'), addCommentToDiscussion);

router
  .route('/discussions/:discussionId/comments/:commentId')
  .put(authorize('Admin', 'Teacher', 'Student'),updateCommentInDiscussion)
  .delete(authorize('Admin', 'Teacher', 'Student'),deleteCommentFromDiscussion);

module.exports = router; 