const mongoose = require("mongoose");
const Discussion = require("../models/Discussion");
const Subject = require("../models/Subject");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");

// Helper function to check if user is assigned teacher
const isAssignedTeacher = (subject, userId) => {
  if (!subject.teachers || !Array.isArray(subject.teachers)) {
    return false;
  }
  return subject.teachers.some((ta) => {
    const teacherId = ta.teacher?._id || ta.teacher;
    return teacherId && teacherId.toString() === userId.toString();
  });
};

// @desc    Create a new discussion for a subject
// @route   POST /api/v1/subjects/:subjectId/discussions
// @access  Private (Assigned Teacher of subject, Admin)
exports.createDiscussion = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;
  const { title, content } = req.body;

  // 1) Validate subjectId
  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(
      new ErrorResponse(`Invalid subject ID format: ${subjectId}`, 400),
    );
  }
  if (!title || !content) {
    return next(
      new ErrorResponse("Title and content are required for a discussion", 400),
    );
  }

  // 2) Ensure the subject exists - populate teachers
  const subject = await Subject.findById(subjectId).populate({
    path: "teachers.teacher",
    select: "_id email username",
  });

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404),
    );
  }

  // 3) Authorization: Only the assigned teacher or Admin may create discussions
  const isTeacherAssigned = isAssignedTeacher(subject, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to create discussions for this subject.",
        403,
      ),
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
      new ErrorResponse(`Invalid subject ID format: ${subjectId}`, 400),
    );
  }

  // 2) Ensure the subject exists - populate teachers
  const subject = await Subject.findById(subjectId).populate({
    path: "teachers.teacher",
    select: "_id email username",
  });

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404),
    );
  }

  // 3) Authorization: only enrolled students, subject teacher, or admin
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));

  const isTeacherAssigned = isAssignedTeacher(subject, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isEnrolledStudent && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to view discussions for this subject.",
        403,
      ),
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

  // 2) Fetch + populate with nested replyTo fields and teachers array
  const discussion = await Discussion.findById(id)
    .populate({
      path: "subject",
      select: "subjectCode subjectName description teachers students",
      populate: {
        path: "teachers.teacher students",
        select: "firstName lastName username role profilePicture _id email",
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

  const isTeacherAssigned = isAssignedTeacher(subject, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isEnrolledStudent && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse("You are not authorized to view this discussion.", 403),
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

  // 2) Fetch discussion + its subject with teachers
  let discussion = await Discussion.findById(id).populate({
    path: "subject",
    select: "teachers",
    populate: {
      path: "teachers.teacher",
      select: "_id email username",
    },
  });

  if (!discussion) {
    return next(new ErrorResponse(`Discussion not found with ID ${id}`, 404));
  }

  // 3) Authorization: only discussion author, subject teacher, or admin
  const isAuthor = discussion.author.equals(req.user.id);
  const isTeacherAssigned = isAssignedTeacher(discussion.subject, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isAuthor && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to update this discussion.",
        403,
      ),
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

  // 2) Fetch discussion + its subject with teachers
  const discussion = await Discussion.findById(id).populate({
    path: "subject",
    select: "teachers",
    populate: {
      path: "teachers.teacher",
      select: "_id email username",
    },
  });

  if (!discussion) {
    return next(new ErrorResponse(`Discussion not found with ID ${id}`, 404));
  }

  // 3) Authorization: only discussion author, subject teacher, or admin
  const isAuthor = discussion.author.equals(req.user.id);
  const isTeacherAssigned = isAssignedTeacher(discussion.subject, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isAuthor && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to delete this discussion.",
        403,
      ),
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
      new ErrorResponse(`Invalid discussion ID format: ${discussionId}`, 400),
    );
  }
  if (!content) {
    return next(new ErrorResponse("Comment content is required", 400));
  }

  // 2) Fetch discussion + its subject with teachers
  const discussion = await Discussion.findById(discussionId).populate({
    path: "subject",
    select: "teachers students",
    populate: {
      path: "teachers.teacher",
      select: "_id email username",
    },
  });

  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404),
    );
  }

  // 3) Authorization: only enrolled students, subject teacher, or admin
  const subject = discussion.subject;
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));

  const isTeacherAssigned = isAssignedTeacher(subject, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isEnrolledStudent && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to comment on this discussion.",
        403,
      ),
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
      new ErrorResponse("Invalid discussion or comment ID format", 400),
    );
  }
  if (!content || content.trim() === "") {
    return next(new ErrorResponse("Reply content cannot be empty", 400));
  }

  // 2) Fetch discussion + its subject with teachers
  const discussion = await Discussion.findById(discussionId).populate({
    path: "subject",
    select: "teachers students",
    populate: {
      path: "teachers.teacher",
      select: "_id email username",
    },
  });

  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404),
    );
  }

  // 3) Authorization: only enrolled students, subject teacher, or admin
  const subject = discussion.subject;
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));

  const isTeacherAssigned = isAssignedTeacher(subject, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isEnrolledStudent && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to reply to comments in this discussion.",
        403,
      ),
    );
  }

  // 4) Locate the comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(
        `Comment not found with ID ${commentId} in this discussion`,
        404,
      ),
    );
  }

  // 5) Create the reply object
  const newReply = {
    author: req.user.id,
    content: content.trim(),
    replyTo: replyToUserId || null,
  };

  // 6) Push the reply to the comment's replies array
  comment.replies.push(newReply);
  await discussion.save();

  // 7) Re-fetch populated discussion
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
  res.status(201).json({
    success: true,
    data: updatedDiscussion,
    message: "Reply added successfully",
  });
});

// @desc    Update a comment in a discussion
// @route   PUT /api/v1/discussions/:discussionId/comments/:commentId
// @access  Private (Comment Author ONLY)
exports.updateCommentInDiscussion = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId } = req.params;
  const { content } = req.body;

  // 1) Validate IDs & payload
  if (
    !mongoose.Types.ObjectId.isValid(discussionId) ||
    !mongoose.Types.ObjectId.isValid(commentId)
  ) {
    return next(
      new ErrorResponse("Invalid discussion or comment ID format", 400),
    );
  }
  if (!content || content.trim() === "") {
    return next(new ErrorResponse("Comment content cannot be empty", 400));
  }

  // 2) Fetch discussion
  const discussion = await Discussion.findById(discussionId);
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404),
    );
  }

  // 3) Locate the comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(
        `Comment not found with ID ${commentId} in this discussion`,
        404,
      ),
    );
  }

  // 4) Authorization: ONLY comment author can edit
  const isCommentAuthor = comment.author.toString() === req.user.id;

  if (!isCommentAuthor) {
    return next(new ErrorResponse("You can only edit your own comments.", 403));
  }

  // 5) Apply update
  if (content.trim() !== comment.content) {
    comment.content = content.trim();
    comment.isEdited = true;
  }
  await discussion.save();

  // 6) Re‐fetch populated discussion
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
    });

  // 7) Return the updated discussion
  res.status(200).json({
    success: true,
    data: updatedDiscussion,
    message: "Comment updated successfully",
  });
});

// @desc    Delete a comment from a discussion (Author only)
// @route   DELETE /api/v1/discussions/:discussionId/comments/:commentId
// @access  Private (Comment Author ONLY)
exports.deleteCommentFromDiscussion = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId } = req.params;

  // 1) Validate IDs
  if (
    !mongoose.Types.ObjectId.isValid(discussionId) ||
    !mongoose.Types.ObjectId.isValid(commentId)
  ) {
    return next(
      new ErrorResponse("Invalid discussion or comment ID format", 400),
    );
  }

  // 2) Fetch discussion
  const discussion = await Discussion.findById(discussionId);
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404),
    );
  }

  // 3) Locate the comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(
        `Comment not found with ID ${commentId} in this discussion`,
        404,
      ),
    );
  }

  // 4) Authorization: ONLY comment author can delete
  const isCommentAuthor = comment.author.toString() === req.user.id;

  if (!isCommentAuthor) {
    return next(
      new ErrorResponse("You can only delete your own comments.", 403),
    );
  }

  // 5) Remove the comment
  discussion.comments.pull(commentId);
  await discussion.save();

  // 6) Re-fetch
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
    });

  // 7) Return success
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
      new ErrorResponse("Invalid discussion or comment ID format", 400),
    );
  }
  if (!content || content.trim() === "") {
    return next(new ErrorResponse("Reply content cannot be empty", 400));
  }

  // 2) Fetch discussion + its subject with teachers
  const discussion = await Discussion.findById(discussionId).populate({
    path: "subject",
    select: "teachers students",
    populate: {
      path: "teachers.teacher",
      select: "_id email username",
    },
  });

  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404),
    );
  }

  // 3) Authorization: only enrolled students, subject teacher, or admin
  const subject = discussion.subject;
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));

  const isTeacherAssigned = isAssignedTeacher(subject, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isEnrolledStudent && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to reply to comments in this discussion.",
        403,
      ),
    );
  }

  // 4) Locate the comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(
        `Comment not found with ID ${commentId} in this discussion`,
        404,
      ),
    );
  }

  // 5) Create the reply object
  const newReply = {
    author: req.user.id,
    content: content.trim(),
    replyTo: replyToUserId || null,
  };

  // 6) Push the reply to the comment's replies array
  comment.replies.push(newReply);
  await discussion.save();

  // 7) Re-fetch populated discussion
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
  res.status(201).json({
    success: true,
    data: updatedDiscussion,
    message: "Reply added successfully",
  });
});

// @desc    Hide/Unhide a comment (Admin only)
// @route   PATCH /api/v1/discussions/:discussionId/comments/:commentId/hide
// @access  Private (Admin only)
exports.toggleHideComment = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId } = req.params;

  // 1) Validate IDs
  if (
    !mongoose.Types.ObjectId.isValid(discussionId) ||
    !mongoose.Types.ObjectId.isValid(commentId)
  ) {
    return next(
      new ErrorResponse("Invalid discussion or comment ID format", 400),
    );
  }

  // 2) Admin only
  if (req.user.role !== "Admin") {
    return next(
      new ErrorResponse("Only admins can hide/unhide comments.", 403),
    );
  }

  // 3) Fetch discussion
  const discussion = await Discussion.findById(discussionId);
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404),
    );
  }

  // 4) Locate comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(`Comment not found with ID ${commentId}`, 404),
    );
  }

  // 5) Toggle hidden status - fix the logic
  const newHiddenState = !comment.isHidden;
  comment.isHidden = newHiddenState;
  comment.hiddenBy = newHiddenState ? req.user.id : undefined;

  // Mark the path as modified to ensure Mongoose saves it
  discussion.markModified("comments");
  await discussion.save();

  console.log(`Comment ${commentId} hidden state: ${comment.isHidden}`); // Debug log

  // 6) Re-fetch with full population
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
      path: "comments.hiddenBy",
      select: "firstName middleName lastName username role",
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
      path: "comments.replies.hiddenBy",
      select: "firstName middleName lastName username role",
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
      path: "comments.replies.replies.hiddenBy",
      select: "firstName middleName lastName username role",
    });

  res.status(200).json({
    success: true,
    data: updatedDiscussion,
    message: `Comment ${newHiddenState ? "hidden" : "unhidden"} successfully`,
  });
});

// @desc    Update a reply in a comment
// @route   PUT /api/v1/discussions/:discussionId/comments/:commentId/replies/:replyId
// @access  Private (Reply Author ONLY)
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
      new ErrorResponse("Invalid discussion, comment, or reply ID format", 400),
    );
  }
  if (!content || content.trim() === "") {
    return next(new ErrorResponse("Reply content cannot be empty", 400));
  }

  // 2) Fetch discussion
  const discussion = await Discussion.findById(discussionId);
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404),
    );
  }

  // 3) Locate comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(`Comment not found with ID ${commentId}`, 404),
    );
  }

  // 4) Locate reply
  const reply = comment.replies.id(replyId);
  if (!reply) {
    return next(new ErrorResponse(`Reply not found with ID ${replyId}`, 404));
  }

  // 5) Authorization: ONLY reply author can edit
  const isReplyAuthor = reply.author.toString() === req.user.id;

  if (!isReplyAuthor) {
    return next(new ErrorResponse("You can only edit your own replies.", 403));
  }

  // 6) Apply update
  if (content.trim() !== reply.content) {
    reply.content = content.trim();
    reply.isEdited = true;
  }
  await discussion.save();

  // 7) Re‐fetch
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
    });

  res.status(200).json({
    success: true,
    data: updatedDiscussion,
    message: "Reply updated successfully",
  });
});

// @desc    Delete a reply from a comment (Author only) - UPDATED to handle nested replies
// @route   DELETE /api/v1/discussions/:discussionId/comments/:commentId/replies/:replyId
// @access  Private (Reply Author ONLY)
exports.deleteReplyFromComment = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId, replyId } = req.params;

  // 1) Validate IDs
  if (
    !mongoose.Types.ObjectId.isValid(discussionId) ||
    !mongoose.Types.ObjectId.isValid(commentId) ||
    !mongoose.Types.ObjectId.isValid(replyId)
  ) {
    return next(
      new ErrorResponse("Invalid discussion, comment, or reply ID format", 400),
    );
  }

  // 2) Fetch discussion
  const discussion = await Discussion.findById(discussionId);
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404),
    );
  }

  // 3) Locate comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(`Comment not found with ID ${commentId}`, 404),
    );
  }

  // 4) Helper function to find and delete reply recursively
  const findAndDeleteReply = (replies, targetId, userId) => {
    for (let i = 0; i < replies.length; i++) {
      if (replies[i]._id.toString() === targetId) {
        // Check authorization
        if (replies[i].author.toString() !== userId) {
          throw new ErrorResponse("You can only delete your own replies.", 403);
        }
        // Delete the reply
        replies.splice(i, 1);
        return true;
      }
      // Search in nested replies
      if (replies[i].replies && replies[i].replies.length > 0) {
        if (findAndDeleteReply(replies[i].replies, targetId, userId)) {
          return true;
        }
      }
    }
    return false;
  };

  // 5) Find and delete the reply
  const found = findAndDeleteReply(comment.replies, replyId, req.user.id);

  if (!found) {
    return next(new ErrorResponse(`Reply not found with ID ${replyId}`, 404));
  }

  // 6) Save the discussion
  await discussion.save();

  // 7) Re-fetch with full population
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

  res.status(200).json({
    success: true,
    data: updatedDiscussion,
    message: "Reply successfully deleted",
  });
});

// @desc    Hide/Unhide a reply (Admin only) - UPDATED to handle nested replies
// @route   PATCH /api/v1/discussions/:discussionId/comments/:commentId/replies/:replyId/hide
// @access  Private (Admin only)
exports.toggleHideReply = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId, replyId } = req.params;

  // 1) Validate IDs
  if (
    !mongoose.Types.ObjectId.isValid(discussionId) ||
    !mongoose.Types.ObjectId.isValid(commentId) ||
    !mongoose.Types.ObjectId.isValid(replyId)
  ) {
    return next(
      new ErrorResponse("Invalid discussion, comment, or reply ID format", 400),
    );
  }

  // 2) Admin only
  if (req.user.role !== "Admin") {
    return next(new ErrorResponse("Only admins can hide/unhide replies.", 403));
  }

  // 3) Fetch discussion
  const discussion = await Discussion.findById(discussionId);
  if (!discussion) {
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404),
    );
  }

  // 4) Locate comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    return next(
      new ErrorResponse(`Comment not found with ID ${commentId}`, 404),
    );
  }

  // 5) Helper function to find and toggle hide status recursively
  const findAndToggleReply = (replies, targetId, adminId) => {
    for (let i = 0; i < replies.length; i++) {
      if (replies[i]._id.toString() === targetId) {
        // Toggle hidden status
        replies[i].isHidden = !replies[i].isHidden;
        replies[i].hiddenBy = replies[i].isHidden ? adminId : null;
        return replies[i];
      }
      // Search in nested replies
      if (replies[i].replies && replies[i].replies.length > 0) {
        const found = findAndToggleReply(replies[i].replies, targetId, adminId);
        if (found) return found;
      }
    }
    return null;
  };

  // 6) Find and toggle the reply
  const toggledReply = findAndToggleReply(
    comment.replies,
    replyId,
    req.user.id,
  );

  if (!toggledReply) {
    return next(new ErrorResponse(`Reply not found with ID ${replyId}`, 404));
  }

  // 7) Save the discussion
  await discussion.save();

  // 8) Re-fetch with full population
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
      path: "comments.replies.hiddenBy",
      select: "firstName middleName lastName username role",
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
      path: "comments.replies.replies.hiddenBy",
      select: "firstName middleName lastName username role",
    })
    .populate({
      path: "comments.replies.replies.replies.author",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.replyTo",
      select: "firstName middleName lastName username role profilePicture",
    })
    .populate({
      path: "comments.replies.replies.replies.hiddenBy",
      select: "firstName middleName lastName username role",
    });

  res.status(200).json({
    success: true,
    data: updatedDiscussion,
    message: `Reply ${
      toggledReply.isHidden ? "hidden" : "unhidden"
    } successfully`,
  });
});

// ✅ IMPORTANT: Remove any module.exports statement that was in the middle of the file
// ✅ The exports should ONLY use the exports.functionName = ... pattern shown above
// ✅ Do NOT add module.exports = { ... } at the end
