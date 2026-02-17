const express = require("express");
const {
  createDiscussion,
  getDiscussionsForSubject,
  getDiscussion,
  updateDiscussion,
  deleteDiscussion,
  addCommentToDiscussion,
  updateCommentInDiscussion,
  deleteCommentFromDiscussion,
  toggleHideComment,
  addReplyToComment,
  updateReplyInComment,
  deleteReplyFromComment,
  toggleHideReply,
} = require("../controllers/discussionController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

// Discussions for a subject
router
  .route("/subjects/:subjectId/discussions")
  .post(authorize("Admin", "Teacher"), createDiscussion)
  .get(getDiscussionsForSubject);

// Single discussion by ID
router
  .route("/discussions/:id")
  .get(getDiscussion)
  .put(authorize("Admin", "Teacher"), updateDiscussion)
  .delete(authorize("Admin", "Teacher"), deleteDiscussion);

// Comments on a discussion
router
  .route("/discussions/:discussionId/comments")
  .post(authorize("Admin", "Teacher", "Student"), addCommentToDiscussion);

router
  .route("/discussions/:discussionId/comments/:commentId")
  .put(authorize("Admin", "Teacher", "Student"), updateCommentInDiscussion)
  .delete(
    authorize("Admin", "Teacher", "Student"),
    deleteCommentFromDiscussion
  );

// Hide/Unhide comment (Admin only)
router
  .route("/discussions/:discussionId/comments/:commentId/hide")
  .patch(authorize("Admin"), toggleHideComment);

// Replies to comments
router
  .route("/discussions/:discussionId/comments/:commentId/replies")
  .post(authorize("Admin", "Teacher", "Student"), addReplyToComment);

router
  .route("/discussions/:discussionId/comments/:commentId/replies/:replyId")
  .put(authorize("Admin", "Teacher", "Student"), updateReplyInComment)
  .delete(authorize("Admin", "Teacher", "Student"), deleteReplyFromComment);

// Hide/Unhide reply (Admin only)
router
  .route("/discussions/:discussionId/comments/:commentId/replies/:replyId/hide")
  .patch(authorize("Admin"), toggleHideReply);

module.exports = router;
