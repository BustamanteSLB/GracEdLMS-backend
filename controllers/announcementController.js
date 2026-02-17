// announcementController.js
const mongoose = require("mongoose");
const Announcement = require("../models/Announcement");
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

// ────────────────────────────────────────────────────────────────────────────────
// @desc    Create a new announcement for a subject
// @route   POST /api/v1/subjects/:subjectId/announcements
// @access  Private/Teacher or Admin
// ────────────────────────────────────────────────────────────────────────────────
exports.createAnnouncement = asyncHandler(async (req, res, next) => {
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
      new ErrorResponse(
        "Title and content are required for an announcement",
        400,
      ),
    );
  }

  // 2) Make sure the subject actually exists - populate teachers
  const subject = await Subject.findById(subjectId).populate({
    path: "teachers.teacher",
    select: "_id email username",
  });

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404),
    );
  }

  // 3) Authorization check (assigned Teacher or Admin only)
  const isTeacherAssigned = isAssignedTeacher(subject, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to create announcements for this subject.",
        403,
      ),
    );
  }

  // 4) Create the announcement document
  let announcement = await Announcement.create({
    title,
    content,
    subject: subjectId,
    createdBy: req.user.id,
  });

  // 5) Add to subject's announcements array
  await Subject.findByIdAndUpdate(subjectId, {
    $addToSet: { announcements: announcement._id },
  });

  // 6) Re‐populate the newly created announcement's createdBy→author field
  announcement = await Announcement.findById(announcement._id).populate({
    path: "createdBy",
    select:
      "firstName middleName lastName email username userId role profilePicture",
  });

  // 7) Rename createdBy to author in the JSON response
  const announcementObj = announcement.toObject();
  announcementObj.author = announcementObj.createdBy;
  delete announcementObj.createdBy;

  // 8) Return the created announcement (with author)
  res.status(201).json({
    success: true,
    data: announcementObj,
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// @desc    Get all announcements for a subject
// @route   GET /api/v1/subjects/:subjectId/announcements
// @access  Private (Student, Teacher, or Admin)
// ────────────────────────────────────────────────────────────────────────────────
exports.getAnnouncementsForSubject = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(
      new ErrorResponse(`Invalid subject ID format: ${subjectId}`, 400),
    );
  }

  const subject = await Subject.findById(subjectId).populate({
    path: "teachers.teacher",
    select: "_id email username",
  });

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404),
    );
  }

  // Authorization: Student must be enrolled, Teacher assigned, or Admin
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));

  const isTeacherAssigned = isAssignedTeacher(subject, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isEnrolledStudent && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to view announcements for this subject.",
        403,
      ),
    );
  }

  // Find + populate → then rename createdBy→author
  let announcements = await Announcement.find({ subject: subjectId })
    .populate({
      path: "createdBy",
      select:
        "firstName middleName lastName email username userId role profilePicture",
    })
    .sort("-createdAt");

  const transformed = announcements.map((a) => {
    const obj = a.toObject();
    obj.author = obj.createdBy;
    delete obj.createdBy;
    return obj;
  });

  res.status(200).json({
    success: true,
    count: transformed.length,
    data: transformed,
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// @desc    Get a single announcement by ID
// @route   GET /api/v1/announcements/:id
// @access  Private (Student, Teacher, or Admin)
// ────────────────────────────────────────────────────────────────────────────────
exports.getAnnouncement = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(
      new ErrorResponse(`Invalid announcement ID format: ${id}`, 400),
    );
  }

  // Populate subject with teachers array
  let announcement = await Announcement.findById(id)
    .populate({
      path: "subject",
      select: "subjectCode subjectName description teachers students",
      populate: {
        path: "teachers.teacher students",
        select: "firstName lastName username userId role email",
      },
    })
    .populate({
      path: "createdBy",
      select:
        "firstName middleName lastName email username userId role profilePicture",
    });

  if (!announcement) {
    return next(new ErrorResponse(`Announcement not found with ID ${id}`, 404));
  }

  // Authorization: only enrolled students, assigned teacher, or Admin
  const subjectDoc = announcement.subject;
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subjectDoc.students.some((s) => s.equals(req.user.id));

  const isTeacherAssigned = isAssignedTeacher(subjectDoc, req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isEnrolledStudent && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to view this announcement.",
        403,
      ),
    );
  }

  // Rename createdBy→author for the response
  const obj = announcement.toObject();
  obj.author = obj.createdBy;
  delete obj.createdBy;

  res.status(200).json({
    success: true,
    data: obj,
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// @desc    Update an announcement
// @route   PUT /api/v1/announcements/:id
// @access  Private/Teacher (creator or subject teacher) or Admin
// ────────────────────────────────────────────────────────────────────────────────
exports.updateAnnouncement = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { title, content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(
      new ErrorResponse(`Invalid announcement ID format: ${id}`, 400),
    );
  }

  // Fetch the existing announcement + its subject with teachers
  let announcement = await Announcement.findById(id).populate({
    path: "subject",
    select: "teachers",
    populate: {
      path: "teachers.teacher",
      select: "_id email username",
    },
  });

  if (!announcement) {
    return next(new ErrorResponse(`Announcement not found with ID ${id}`, 404));
  }

  // Authorization: Only the creator, assigned teacher, or Admin may update
  const isCreator = announcement.createdBy.equals(req.user.id);
  const isTeacherAssigned = isAssignedTeacher(
    announcement.subject,
    req.user.id,
  );
  const isAdmin = req.user.role === "Admin";

  if (!isCreator && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to update this announcement.",
        403,
      ),
    );
  }

  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = content;

  let updatedAnnouncement = await Announcement.findByIdAndUpdate(
    id,
    updateData,
    {
      new: true,
      runValidators: true,
    },
  ).populate({
    path: "createdBy",
    select:
      "firstName middleName lastName email username userId role profilePicture",
  });

  // Rename createdBy→author for the response
  const obj = updatedAnnouncement.toObject();
  obj.author = obj.createdBy;
  delete obj.createdBy;

  res.status(200).json({
    success: true,
    data: obj,
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// @desc    Delete an announcement
// @route   DELETE /api/v1/announcements/:id
// @access  Private/Teacher (creator or subject teacher) or Admin
// ────────────────────────────────────────────────────────────────────────────────
exports.deleteAnnouncement = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(
      new ErrorResponse(`Invalid announcement ID format: ${id}`, 400),
    );
  }

  // Fetch the announcement + its subject with teachers
  const announcement = await Announcement.findById(id).populate({
    path: "subject",
    select: "teachers",
    populate: {
      path: "teachers.teacher",
      select: "_id email username",
    },
  });

  if (!announcement) {
    return next(new ErrorResponse(`Announcement not found with ID ${id}`, 404));
  }

  // Authorization: Only the creator, assigned teacher, or Admin may delete
  const isCreator = announcement.createdBy.equals(req.user.id);
  const isTeacherAssigned = isAssignedTeacher(
    announcement.subject,
    req.user.id,
  );
  const isAdmin = req.user.role === "Admin";

  if (!isCreator && !isTeacherAssigned && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to delete this announcement.",
        403,
      ),
    );
  }

  // 1) Remove this announcement ID from the parent subject's announcements array
  await Subject.findByIdAndUpdate(announcement.subject._id, {
    $pull: { announcements: announcement._id },
  });

  // 2) Delete the announcement document itself
  await announcement.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
    message: "Announcement successfully deleted",
  });
});
