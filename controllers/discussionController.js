const mongoose = require("mongoose");
const Discussion = require("../models/Discussion");
const Subject = require("../models/Subject");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");

// @desc    Create a new discussion for a subject
// @route   POST /api/v1/subjects/:subjectId/discussions
// @access  Private (Assigned Teacher of subject, Admin)
exports.createDiscussion = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;
  const { title, content } = req.body;

  // 1) Validate subjectId
  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(
      new ErrorResponse(`Invalid subject ID format: ${subjectId}`, 400)
    );
  }
  if (!title || !content) {
    return next(
      new ErrorResponse("Title and content are required for a discussion", 400)
    );
  }

  // 2) Ensure the subject exists
  const subject = await Subject.findById(subjectId);
  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404)
    );
  }

  // 3) Authorization: Only the assigned teacher or Admin may create discussions
  const isTeacherOfSubject =
    req.user.role === "Teacher" &&
    subject.teacher &&
    subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";
  if (!isTeacherOfSubject && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to create discussions for this subject.",
        403
      )
    );
  }

  // 4) Create discussion
  let discussion = await Discussion.create({
    title,
    content,
    subject: subjectId,
    author: req.user.id,
    comments: [],
  });

  // 5) Add discussion ID to the subject's discussions array
  await Subject.findByIdAndUpdate(subjectId, {
    $addToSet: { discussions: discussion._id },
  });

  // 6) Populate author and comments.author
  discussion = await Discussion.findById(discussion._id)
    .populate({
      path: "author",
      select: "firstName middleName lastName email username role",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName email username role",
    });

  // 7) Return the created discussion
  res.status(201).json({
    success: true,
    data: discussion,
  });
});

// @desc    Get all discussions for a subject
// @route   GET /api/v1/subjects/:subjectId/discussions
// @access  Private (Enrolled Students, Assigned Teacher, Admin)
exports.getDiscussionsForSubject = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;

  // 1) Validate subjectId
  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(
      new ErrorResponse(`Invalid subject ID format: ${subjectId}`, 400)
    );
  }

  // 2) Ensure the subject exists
  const subject = await Subject.findById(subjectId);
  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404)
    );
  }

  // 3) Authorization: only enrolled students, subject teacher, or admin
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));
  const isTeacherOfSubject =
    req.user.role === "Teacher" &&
    subject.teacher &&
    subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";
  if (!isEnrolledStudent && !isTeacherOfSubject && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to view discussions for this subject.",
        403
      )
    );
  }

  // 4) Fetch + populate with nested replyTo fields
  const discussions = await Discussion.find({ subject: subjectId })
    .populate({
      path: "author",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.author",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.author",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.replyTo",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.author",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replyTo",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.author",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.replyTo",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .sort("-createdAt");

  // 5) Return all discussions
  res.status(200).json({
    success: true,
    count: discussions.length,
    data: discussions,
  });
});

// @desc    Get a single discussion
// @route   GET /api/v1/discussions/:id
// @access  Private (Enrolled Students, Assigned Teacher, Admin)
exports.getDiscussion = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // 1) Validate discussion ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse(`Invalid discussion ID format: ${id}`, 400));
  }

  // 2) Fetch + populate with nested replyTo fields
  const discussion = await Discussion.findById(id)
    .populate({
      path: "subject",
      select: "subjectCode subjectName description teacher students",
      populate: {
        path: "teacher students",
        select: "firstName lastName username role profilePicture",
      },
    })
    .populate({
      path: "author",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.author",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.author",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.replyTo",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.author",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replyTo",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.author",
      select:
        "firstName middleName lastName email username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.replyTo",
      select:
        "firstName middleName lastName email username role profilePicture",
    });

  if (!discussion) {
    return next(new ErrorResponse(`Discussion not found with ID ${id}`, 404));
  }

  // 3) Authorization: only enrolled students, subject teacher, or admin
  const subject = discussion.subject;
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));
  const isTeacherOfSubject =
    req.user.role === "Teacher" &&
    subject.teacher &&
    subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";
  if (!isEnrolledStudent && !isTeacherOfSubject && !isAdmin) {
    return next(
      new ErrorResponse("You are not authorized to view this discussion.", 403)
    );
  }

  // 4) Return the discussion
  res.status(200).json({
    success: true,
    data: discussion,
  });
});

// @desc    Update a discussion's title or content
// @route   PUT /api/v1/discussions/:id
// @access  Private (Discussion Author, Assigned Teacher, Admin)
exports.updateDiscussion = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { title, content } = req.body;

  // 1) Validate discussion ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse(`Invalid discussion ID format: ${id}`, 400));
  }

  // 2) Fetch discussion + its subject
  let discussion = await Discussion.findById(id).populate("subject", "teacher");
  if (!discussion) {
    return next(new ErrorResponse(`Discussion not found with ID ${id}`, 404));
  }

  // 3) Authorization: only discussion author, subject teacher, or admin
  const isAuthor = discussion.author.equals(req.user.id);
  const isTeacherOfSubject =
    discussion.subject.teacher &&
    discussion.subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";
  if (!isAuthor && !isTeacherOfSubject && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to update this discussion.",
        403
      )
    );
  }

  // 4) Apply updates
  let contentChanged = false;
  if (title !== undefined && title !== discussion.title) {
    discussion.title = title;
    contentChanged = true;
  }
  if (content !== undefined && content !== discussion.content) {
    discussion.content = content;
    contentChanged = true;
  }

  // Mark as edited if content changed
  if (contentChanged) {
    discussion.isEdited = true;
  }

  // 5) Save changes
  await discussion.save();

  // 6) Re‐fetch + populate author and comments.author with profilePicture
  const updatedDiscussion = await Discussion.findById(id)
    .populate({
      path: "author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    });

  // 7) Return the updated discussion
  res.status(200).json({
    success: true,
    data: updatedDiscussion,
  });
});

// @desc    Delete a discussion
// @route   DELETE /api/v1/discussions/:id
// @access  Private (Discussion Author, Assigned Teacher, Admin)
exports.deleteDiscussion = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // 1) Validate discussion ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse(`Invalid discussion ID format: ${id}`, 400));
  }

  // 2) Fetch discussion + its subject
  const discussion = await Discussion.findById(id).populate(
    "subject",
    "teacher"
  );
  if (!discussion) {
    return next(new ErrorResponse(`Discussion not found with ID ${id}`, 404));
  }

  // 3) Authorization: only discussion author, subject teacher, or admin
  const isAuthor = discussion.author.equals(req.user.id);
  const isTeacherOfSubject =
    discussion.subject.teacher &&
    discussion.subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";
  if (!isAuthor && !isTeacherOfSubject && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to delete this discussion.",
        403
      )
    );
  }

  // 4) Remove discussion from subject's discussions array
  await Subject.findByIdAndUpdate(discussion.subject._id, {
    $pull: { discussions: id },
  });

  // 5) Delete the discussion
  await Discussion.findByIdAndDelete(id);

  // 6) Return success
  res.status(200).json({
    success: true,
    data: {},
    message: "Discussion successfully deleted",
  });
});

// @desc    Add a comment to a discussion
// @route   POST /api/v1/discussions/:discussionId/comments
// @access  Private (Enrolled Students, Assigned Teacher, Admin)
exports.addCommentToDiscussion = asyncHandler(async (req, res, next) => {
  const { discussionId } = req.params;
  const { content } = req.body;

  // 1) Validate IDs & payload
  if (!mongoose.Types.ObjectId.isValid(discussionId)) {
    return next(
      new ErrorResponse(`Invalid discussion ID format: ${discussionId}`, 400)
    );
  }
  if (!content) {
    return next(new ErrorResponse("Comment content is required", 400));
  }

  // 2) Fetch discussion + its subject
  const discussion = await Discussion.findById(discussionId).populate(
    "subject",
    "teacher students"
  );
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404)
    );
  }

  // 3) Authorization: only enrolled students, subject teacher, or admin
  const subject = discussion.subject;
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));
  const isTeacherOfSubject =
    req.user.role === "Teacher" &&
    subject.teacher &&
    subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";
  if (!isEnrolledStudent && !isTeacherOfSubject && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to comment on this discussion.",
        403
      )
    );
  }

  // 4) Push new comment
  discussion.comments.push({
    author: req.user.id,
    content: content,
  });
  await discussion.save();

  // 5) Re‐fetch populated discussion with profilePicture
  const updatedDiscussion = await Discussion.findById(discussionId)
    .populate({
      path: "author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName username role profilePicture",
    });

  // 6) Return the updated discussion
  res.status(201).json({
    success: true,
    data: updatedDiscussion,
  });
});

// @desc    Update a comment in a discussion
// @route   PUT /api/v1/discussions/:discussionId/comments/:commentId
// @access  Private (Comment Author, Assigned Teacher, Admin)
exports.updateCommentInDiscussion = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId } = req.params;
  const { content } = req.body;

  console.log("=== UPDATE COMMENT REQUEST ===");
  console.log("Discussion ID:", discussionId);
  console.log("Comment ID:", commentId);
  console.log("User ID:", req.user.id);
  console.log("User Role:", req.user.role);
  console.log("New content:", content);

  // 1) Validate IDs & payload
  if (
    !mongoose.Types.ObjectId.isValid(discussionId) ||
    !mongoose.Types.ObjectId.isValid(commentId)
  ) {
    return next(
      new ErrorResponse("Invalid discussion or comment ID format", 400)
    );
  }
  if (!content || content.trim() === "") {
    return next(new ErrorResponse("Comment content cannot be empty", 400));
  }

  // 2) Fetch discussion + its subject
  const discussion = await Discussion.findById(discussionId).populate(
    "subject",
    "teacher"
  );
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404)
    );
  }

  // 3) Locate the comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(
        `Comment not found with ID ${commentId} in this discussion`,
        404
      )
    );
  }

  console.log("Comment found:", {
    id: comment._id,
    author: comment.author,
    currentContent: comment.content,
  });

  // 4) Authorization: only comment author, subject teacher, or admin
  const isCommentAuthor = comment.author.toString() === req.user.id;
  const isTeacherOfSubject =
    discussion.subject.teacher &&
    discussion.subject.teacher.toString() === req.user.id;
  const isAdmin = req.user.role === "Admin";

  console.log("Authorization check:", {
    isCommentAuthor,
    isTeacherOfSubject,
    isAdmin,
  });

  if (!isCommentAuthor && !isTeacherOfSubject && !isAdmin) {
    return next(
      new ErrorResponse("You are not authorized to update this comment.", 403)
    );
  }

  // 5) Apply update
  if (content.trim() !== comment.content) {
    comment.content = content.trim();
    comment.isEdited = true;
  }
  await discussion.save();

  console.log("Comment updated successfully");

  // 6) Re‐fetch populated discussion with profilePicture
  const updatedDiscussion = await Discussion.findById(discussionId)
    .populate({
      path: "author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    });

  // 7) Return the updated discussion
  res.status(200).json({
    success: true,
    data: updatedDiscussion,
    message: "Comment updated successfully",
  });
});

// @desc    Delete a comment from a discussion
// @route   DELETE /api/v1/discussions/:discussionId/comments/:commentId
// @access  Private (Comment Author, Discussion Author, Assigned Teacher, Admin)
exports.deleteCommentFromDiscussion = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId } = req.params;

  // 1) Validate IDs
  if (
    !mongoose.Types.ObjectId.isValid(discussionId) ||
    !mongoose.Types.ObjectId.isValid(commentId)
  ) {
    return next(
      new ErrorResponse("Invalid discussion or comment ID format", 400)
    );
  }

  // 2) Fetch discussion + its subject
  const discussion = await Discussion.findById(discussionId).populate(
    "subject",
    "teacher students"
  );
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404)
    );
  }

  // 3) Locate the comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(
        `Comment not found with ID ${commentId} in this discussion`,
        404
      )
    );
  }

  // 4) Authorization check
  const isCommentAuthor = comment.author.toString() === req.user.id;
  const isDiscussionAuthor = discussion.author.toString() === req.user.id;
  const isTeacherOfSubject =
    discussion.subject?.teacher &&
    discussion.subject.teacher.toString() === req.user.id;
  const isAdmin = req.user.role === "Admin";

  if (
    !isCommentAuthor &&
    !isDiscussionAuthor &&
    !isTeacherOfSubject &&
    !isAdmin
  ) {
    return next(
      new ErrorResponse("You are not authorized to delete this comment.", 403)
    );
  }

  // 5) Remove the comment from the array
  discussion.comments.pull(commentId);
  await discussion.save();

  // 6) Re-fetch the updated discussion
  const updatedDiscussion = await Discussion.findById(discussionId)
    .populate({
      path: "author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName username role profilePicture",
    });

  // 7) Return success response
  res.status(200).json({
    success: true,
    data: updatedDiscussion,
    message: "Comment successfully deleted",
  });
});

// @desc    Add a reply to a comment
// @route   POST /api/v1/discussions/:discussionId/comments/:commentId/replies
// @access  Private (Enrolled Students, Assigned Teacher, Admin)
exports.addReplyToComment = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId } = req.params;
  const { content, replyToUserId } = req.body;

  // 1) Validate IDs & payload
  if (
    !mongoose.Types.ObjectId.isValid(discussionId) ||
    !mongoose.Types.ObjectId.isValid(commentId)
  ) {
    return next(
      new ErrorResponse("Invalid discussion or comment ID format", 400)
    );
  }
  if (!content) {
    return next(new ErrorResponse("Reply content is required", 400));
  }

  // 2) Fetch discussion + its subject
  const discussion = await Discussion.findById(discussionId).populate(
    "subject",
    "teacher students"
  );
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404)
    );
  }

  // 3) Locate the comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(
        `Comment not found with ID ${commentId} in this discussion`,
        404
      )
    );
  }

  // 4) Authorization: only enrolled students, subject teacher, or admin
  const subject = discussion.subject;
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));
  const isTeacherOfSubject =
    req.user.role === "Teacher" &&
    subject.teacher &&
    subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";
  if (!isEnrolledStudent && !isTeacherOfSubject && !isAdmin) {
    return next(
      new ErrorResponse("You are not authorized to reply to this comment.", 403)
    );
  }

  // 5) Push new reply
  const newReply = {
    author: req.user.id,
    content: content,
    replies: [],
  };

  if (replyToUserId && mongoose.Types.ObjectId.isValid(replyToUserId)) {
    newReply.replyTo = replyToUserId;
  }

  comment.replies.push(newReply);
  await discussion.save();

  // 6) Re‐fetch populated discussion with nested population
  const updatedDiscussion = await Discussion.findById(discussionId)
    .populate({
      path: "author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replyTo",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replyTo",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.replyTo",
      select: "firstName middleName lastName username role profilePicture",
    });

  // 7) Return the updated discussion
  res.status(201).json({
    success: true,
    data: updatedDiscussion,
  });
});

// @desc    Update a reply to a comment
// @route   PUT /api/v1/discussions/:discussionId/comments/:commentId/replies/:replyId
// @access  Private (Reply Author, Assigned Teacher, Admin)
exports.updateReplyInComment = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId, replyId } = req.params;
  const { content } = req.body;

  // 1) Validate IDs & payload
  if (
    !mongoose.Types.ObjectId.isValid(discussionId) ||
    !mongoose.Types.ObjectId.isValid(commentId) ||
    !mongoose.Types.ObjectId.isValid(replyId)
  ) {
    return next(
      new ErrorResponse("Invalid discussion, comment, or reply ID format", 400)
    );
  }
  if (!content || content.trim() === "") {
    return next(new ErrorResponse("Reply content cannot be empty", 400));
  }

  // 2) Fetch discussion + its subject
  const discussion = await Discussion.findById(discussionId).populate(
    "subject",
    "teacher"
  );
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404)
    );
  }

  // 3) Locate the comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(
        `Comment not found with ID ${commentId} in this discussion`,
        404
      )
    );
  }

  // 4) Locate the reply
  const reply = comment.replies.id(replyId);
  if (!reply) {
    return next(
      new ErrorResponse(
        `Reply not found with ID ${replyId} in this comment`,
        404
      )
    );
  }

  // 5) Authorization: only reply author, subject teacher, or admin
  const isReplyAuthor = reply.author.toString() === req.user.id;
  const isTeacherOfSubject =
    discussion.subject.teacher &&
    discussion.subject.teacher.toString() === req.user.id;
  const isAdmin = req.user.role === "Admin";

  if (!isReplyAuthor && !isTeacherOfSubject && !isAdmin) {
    return next(
      new ErrorResponse("You are not authorized to update this reply.", 403)
    );
  }

  // 6) Apply update
  if (content.trim() !== reply.content) {
    reply.content = content.trim();
    reply.isEdited = true;
  }
  await discussion.save();

  // 7) Re‐fetch populated discussion with replyTo
  const updatedDiscussion = await Discussion.findById(discussionId)
    .populate({
      path: "author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replyTo",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replyTo",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.replyTo",
      select: "firstName middleName lastName username role profilePicture",
    });

  // 8) Return the updated discussion
  res.status(200).json({
    success: true,
    data: updatedDiscussion,
    message: "Reply updated successfully",
  });
});

// @desc    Delete a reply from a comment
// @route   DELETE /api/v1/discussions/:discussionId/comments/:commentId/replies/:replyId
// @access  Private (Reply Author, Comment Author, Discussion Author, Assigned Teacher, Admin)
exports.deleteReplyFromComment = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId, replyId } = req.params;

  // 1) Validate IDs
  if (
    !mongoose.Types.ObjectId.isValid(discussionId) ||
    !mongoose.Types.ObjectId.isValid(commentId) ||
    !mongoose.Types.ObjectId.isValid(replyId)
  ) {
    return next(
      new ErrorResponse("Invalid discussion, comment, or reply ID format", 400)
    );
  }

  // 2) Fetch discussion + its subject
  const discussion = await Discussion.findById(discussionId).populate(
    "subject",
    "teacher students"
  );
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404)
    );
  }

  // 3) Locate the comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(
        `Comment not found with ID ${commentId} in this discussion`,
        404
      )
    );
  }

  // 4) Locate the reply
  const reply = comment.replies.id(replyId);
  if (!reply) {
    return next(
      new ErrorResponse(
        `Reply not found with ID ${replyId} in this comment`,
        404
      )
    );
  }

  // 5) Authorization check - Updated to match frontend permissions
  const isReplyAuthor = reply.author.toString() === req.user.id;
  const isCommentAuthor = comment.author.toString() === req.user.id;
  const isDiscussionAuthor = discussion.author.toString() === req.user.id;
  const isAdmin = req.user.role === "Admin";

  // Note: Removed isTeacherOfSubject check - teachers can't delete replies that aren't theirs
  if (!isReplyAuthor && !isCommentAuthor && !isDiscussionAuthor && !isAdmin) {
    return next(
      new ErrorResponse("You are not authorized to delete this reply.", 403)
    );
  }

  // 6) Remove the reply from the array
  comment.replies.pull(replyId);
  await discussion.save();

  // 7) Re-fetch the updated discussion with replyTo
  const updatedDiscussion = await Discussion.findById(discussionId)
    .populate({
      path: "author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replyTo",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replyTo",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.replyTo",
      select: "firstName middleName lastName username role profilePicture",
    });

  // 8) Return success response
  res.status(200).json({
    success: true,
    data: updatedDiscussion,
    message: "Reply successfully deleted",
  });
});

// ✅ IMPORTANT: Remove any module.exports statement that was in the middle of the file
// ✅ The exports should ONLY use the exports.functionName = ... pattern shown above
// ✅ Do NOT add module.exports = { ... } at the end
