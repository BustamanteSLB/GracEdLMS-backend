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
    return next(new ErrorResponse(`Subject not found with ID ${subjectId}`, 404));
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
    return next(new ErrorResponse(`Subject not found with ID ${subjectId}`, 404));
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

  // 4) Fetch + populate author and comments.author
  const discussions = await Discussion.find({ subject: subjectId })
    .populate({
      path: "author",
      select: "firstName middleName lastName email username role",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName email username role",
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

  // 2) Fetch + populate subject→(teacher, students), author, comments.author
  const discussion = await Discussion.findById(id)
    .populate({
      path: "subject",
      select: "subjectCode subjectName description teacher students",
      populate: {
        path: "teacher students",
        select: "firstName lastName username role",
      },
    })
    .populate({
      path: "author",
      select: "firstName middleName lastName email username role",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName email username role",
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
    discussion.subject.teacher && discussion.subject.teacher.equals(req.user.id);
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
  if (title !== undefined) {
    discussion.title = title;
  }
  if (content !== undefined) {
    discussion.content = content;
  }

  // 5) Save changes
  await discussion.save();

  // 6) Re‐fetch + populate author and comments.author
  const updatedDiscussion = await Discussion.findById(id)
    .populate({
      path: "author",
      select: "firstName middleName lastName username role",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName username role",
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
    discussion.subject.teacher && discussion.subject.teacher.equals(req.user.id);
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

  // 5) Re‐fetch populated discussion
  const updatedDiscussion = await Discussion.findById(discussionId)
    .populate({
      path: "author",
      select: "firstName middleName lastName username role",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName username role",
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

  // 4) Authorization: only comment author, subject teacher, or admin
  const isCommentAuthor = comment.author.equals(req.user.id);
  const isTeacherOfSubject =
    discussion.subject.teacher && discussion.subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";
  if (!isCommentAuthor && !isTeacherOfSubject && !isAdmin) {
    return next(
      new ErrorResponse("You are not authorized to update this comment.", 403)
    );
  }

  // 5) Apply update
  comment.content = content;
  await discussion.save();

  // 6) Re‐fetch populated discussion
  const updatedDiscussion = await Discussion.findById(discussionId)
    .populate({
      path: "author",
      select: "firstName middleName lastName username role",
    })
    .populate({
      path: "comments.author",
      select: "firstName middleName lastName username role",
    });

  // 7) Return the updated discussion
  res.status(200).json({
    success: true,
    data: updatedDiscussion,
  });
});

// @desc    Delete a comment from a discussion
// @route   DELETE /api/v1/discussions/:discussionId/comments/:commentId
// @access  Private (Comment Author, Discussion Author, Assigned Teacher, Admin)
exports.deleteCommentFromDiscussion = asyncHandler(async (req, res, next) => {
  const { discussionId, commentId } = req.params;

  console.log("=== DELETE COMMENT REQUEST ===");
  console.log("Discussion ID:", discussionId);
  console.log("Comment ID:", commentId);
  console.log("User ID:", req.user.id);
  console.log("User Role:", req.user.role);

  // 1) Validate IDs
  if (!mongoose.Types.ObjectId.isValid(discussionId)) {
    console.log("Invalid discussion ID format");
    return next(
      new ErrorResponse(`Invalid discussion ID format: ${discussionId}`, 400)
    );
  }

  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    console.log("Invalid comment ID format");
    return next(
      new ErrorResponse(`Invalid comment ID format: ${commentId}`, 400)
    );
  }

  // 2) Fetch discussion + its subject
  const discussion = await Discussion.findById(discussionId).populate(
    "subject",
    "teacher students"
  );
  if (!discussion) {
    console.log("Discussion not found");
    return next(
      new ErrorResponse(`Discussion not found with ID ${discussionId}`, 404)
    );
  }

  console.log("Discussion found:", {
    id: discussion._id,
    author: discussion.author,
    subjectTeacher: discussion.subject?.teacher,
  });

  // 3) Locate the comment
  const comment = discussion.comments.id(commentId);
  if (!comment) {
    console.log("Comment not found in discussion");
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
    content: comment.content,
  });

  // 4) Authorization check
  const isCommentAuthor = comment.author.toString() === req.user.id;
  const isDiscussionAuthor = discussion.author.toString() === req.user.id;
  const isTeacherOfSubject =
    discussion.subject?.teacher &&
    discussion.subject.teacher.toString() === req.user.id;
  const isAdmin = req.user.role === "Admin";

  console.log("Authorization check:", {
    isCommentAuthor,
    isDiscussionAuthor,
    isTeacherOfSubject,
    isAdmin,
    commentAuthorId: comment.author.toString(),
    currentUserId: req.user.id,
  });

  // Allow deletion if user is comment author, discussion author, subject teacher, or admin
  if (
    !isCommentAuthor &&
    !isDiscussionAuthor &&
    !isTeacherOfSubject &&
    !isAdmin
  ) {
    console.log(
      "Authorization failed - user not allowed to delete this comment"
    );
    return next(
      new ErrorResponse("You are not authorized to delete this comment.", 403)
    );
  }

  console.log("Authorization passed - proceeding with deletion");

  // 5) Remove the comment from the array
  try {
    // Method 1: Using pull (recommended)
    discussion.comments.pull(commentId);
    await discussion.save();

    console.log("Comment successfully removed from discussion");

    // 6) Re-fetch the updated discussion with populated fields
    const updatedDiscussion = await Discussion.findById(discussionId)
      .populate({
        path: "author",
        select: "firstName middleName lastName username role email",
      })
      .populate({
        path: "comments.author",
        select: "firstName middleName lastName username role email",
      });

    console.log("Updated discussion fetched:", {
      id: updatedDiscussion._id,
      commentCount: updatedDiscussion.comments.length,
    });

    // 7) Return success response
    res.status(200).json({
      success: true,
      data: updatedDiscussion,
      message: "Comment successfully deleted",
    });
  } catch (error) {
    console.error("Error during comment deletion:", error);
    return next(new ErrorResponse("Failed to delete comment", 500));
  }
});
