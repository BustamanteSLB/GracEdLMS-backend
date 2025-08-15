// controllers/activityController.js

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Activity = require("../models/Activity");
const Subject = require("../models/Subject");
const Grade = require("../models/Grade");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");

// Create a new activity for a subject
exports.createActivity = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;
  const { title, description, visibleDate, deadline, quarter, points } = req.body;

  console.log("➡️ Create Activity Request:", {
    subjectId,
    title,
    description,
    visibleDate,
    deadline,
    quarter,
    points,
    hasFile: !!req.file,
    file: req.file
      ? {
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path,
        }
      : null,
  });

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(new ErrorResponse(`Invalid subject ID: ${subjectId}`, 400));
  }
  if (!title || !visibleDate || !deadline || !quarter) {
    return next(
      new ErrorResponse("Title, visibleDate, deadline, and quarter are required", 400)
    );
  }

  const subject = await Subject.findById(subjectId);
  if (!subject) {
    return next(new ErrorResponse(`Subject not found: ${subjectId}`, 404));
  }

  if (!(req.user.role === "Teacher" || req.user.role === "Admin")) {
    return next(
      new ErrorResponse(
        "Not authorized to create activities for this subject",
        403
      )
    );
  }

  const activityData = {
    title: title.trim(),
    description: description ? description.trim() : "",
    visibleDate: new Date(visibleDate),
    deadline: new Date(deadline),
    quarter: quarter,
    points: points !== undefined && points !== "" ? Number(points) : null,
    subject: subjectId,
    createdBy: req.user.id,
  };

  if (req.file) {
    // Store the attachment path with the original filename
    activityData.attachmentPath = `uploads/${req.file.filename}`;
    console.log("📎 File attached:", {
      storedPath: activityData.attachmentPath,
      originalName: req.file.originalname,
      finalName: req.file.filename
    });
  }

  const activity = await Activity.create(activityData);

  await activity.populate(
    "createdBy",
    "firstName middleName lastName email profilePicture"
  );

  await Subject.findByIdAndUpdate(subjectId, {
    $addToSet: { activities: activity._id },
  });

  console.log("✅ Activity created successfully:", {
    id: activity._id,
    title: activity.title,
    quarter: activity.quarter,
    attachmentPath: activity.attachmentPath,
  });

  res.status(201).json({
    success: true,
    data: activity,
  });
});

// Get all activities for a subject
exports.getActivitiesForSubject = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(new ErrorResponse(`Invalid subject ID: ${subjectId}`, 400));
  }

  const subject = await Subject.findById(subjectId);
  if (!subject) {
    return next(new ErrorResponse(`Subject not found: ${subjectId}`, 404));
  }

  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));
  const isAssignedTeacher =
    req.user.role === "Teacher" &&
    subject.teacher &&
    subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isEnrolledStudent && !isAssignedTeacher && !isAdmin) {
    return next(
      new ErrorResponse(
        "Not authorized to view activities for this subject",
        403
      )
    );
  }

  const activities = await Activity.find({ subject: subjectId })
    .populate("createdBy", "firstName middleName lastName email profilePicture")
    .populate({
      path: "submissions.student",
      select: "firstName middleName lastName email profilePicture",
    })
    .sort({
      visibleDate: 1,
      createdAt: 1,
    });

  res.status(200).json({
    success: true,
    count: activities.length,
    data: activities,
  });
});

// Get single activity
exports.getActivity = asyncHandler(async (req, res, next) => {
  const { activityId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(activityId)) {
    return next(new ErrorResponse(`Invalid activity ID: ${activityId}`, 400));
  }

  const activity = await Activity.findById(activityId)
    .populate({
      path: "subject",
      select: "students teacher",
    })
    .populate("createdBy", "firstName middleName lastName email profilePicture")
    .populate({
      path: "submissions.student",
      select: "firstName middleName lastName email profilePicture",
    });

  if (!activity) {
    return next(new ErrorResponse(`Activity not found: ${activityId}`, 404));
  }

  const subject = activity.subject;
  const isEnrolledStudent =
    req.user.role === "Student" &&
    subject.students.some((s) => s.equals(req.user.id));
  const isAssignedTeacher =
    req.user.role === "Teacher" &&
    subject.teacher &&
    subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isEnrolledStudent && !isAssignedTeacher && !isAdmin) {
    return next(new ErrorResponse("Not authorized to view this activity", 403));
  }

  if (activity.attachmentPath) {
    activity.attachmentPath = activity.attachmentPath.replace(/\\/g, "/");
  }

  res.status(200).json({
    success: true,
    data: activity,
  });
});

// Update an activity
exports.updateActivity = asyncHandler(async (req, res, next) => {
  const { activityId } = req.params;
  const {
    title,
    description,
    visibleDate,
    deadline,
    quarter,
    points,
    removeAttachment,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(activityId)) {
    return next(new ErrorResponse(`Invalid activity ID: ${activityId}`, 400));
  }

  let activity = await Activity.findById(activityId).populate(
    "subject",
    "teacher"
  );
  if (!activity) {
    return next(new ErrorResponse(`Activity not found: ${activityId}`, 404));
  }

  if (
    !(
      req.user.role === "Admin" ||
      (req.user.role === "Teacher" && activity.createdBy.equals(req.user.id))
    )
  ) {
    return next(
      new ErrorResponse(`Not authorized to update this activity`, 403)
    );
  }

  const updateFields = {
    title,
    description: description || "",
    visibleDate,
    deadline,
    quarter,
    points: points !== undefined && points !== "" ? Number(points) : null,
  };

  if (req.file) {
    if (activity.attachmentPath) {
      const filePath = path.join(process.cwd(), activity.attachmentPath);
      fs.unlink(filePath, (err) => {
        if (err) console.error("Error deleting old attachment:", err);
      });
    }
    updateFields.attachmentPath = `uploads/${req.file.filename}`;
  } else if (removeAttachment === "true" && activity.attachmentPath) {
    const filePath = path.join(process.cwd(), activity.attachmentPath);
    fs.unlink(filePath, (err) => {
      if (err) console.error("Error deleting attachment on remove:", err);
    });
    updateFields.attachmentPath = null;
  }

  const updatedActivity = await Activity.findByIdAndUpdate(
    activityId,
    updateFields,
    { new: true, runValidators: true }
  ).populate("createdBy", "firstName middleName lastName email profilePicture");

  res.status(200).json({
    success: true,
    data: updatedActivity,
  });
});

// Delete an activity
exports.deleteActivity = asyncHandler(async (req, res, next) => {
  const { activityId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(activityId)) {
    return next(new ErrorResponse(`Invalid activity ID: ${activityId}`, 400));
  }

  const activity = await Activity.findById(activityId).populate(
    "subject",
    "teacher"
  );
  if (!activity) {
    return next(new ErrorResponse(`Activity not found: ${activityId}`, 404));
  }

  if (
    req.user.role === "Teacher" &&
    (!activity.subject.teacher || !activity.subject.teacher.equals(req.user.id))
  ) {
    return next(
      new ErrorResponse("Not authorized to delete this activity", 403)
    );
  }

  if (activity.attachmentPath) {
    const filePath = path.join(process.cwd(), activity.attachmentPath);
    fs.unlink(filePath, (err) => {
      /* ignore missing-file errors */
    });
  }

  if (activity.submissions && activity.submissions.length > 0) {
    activity.submissions.forEach((submission) => {
      if (submission.attachmentPaths && submission.attachmentPaths.length > 0) {
        submission.attachmentPaths.forEach((attachPath) => {
          const filePath = path.join(process.cwd(), attachPath);
          fs.unlink(filePath, (err) => {
            if (err)
              console.error(
                `Error deleting submission attachment ${attachPath}:`,
                err
              );
          });
        });
      }
    });
  }

  await Subject.findByIdAndUpdate(activity.subject, {
    $pull: { activities: activity._id },
  });
  await activity.deleteOne();

  res.status(200).json({
    success: true,
    message: "Activity deleted successfully",
  });
});

// Student Turn-in Activity
exports.turnInActivity = asyncHandler(async (req, res, next) => {
  const { activityId } = req.params;
  const studentId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(activityId)) {
    return next(new ErrorResponse(`Invalid activity ID: ${activityId}`, 400));
  }

  const activity = await Activity.findById(activityId);

  if (!activity) {
    return next(new ErrorResponse(`Activity not found: ${activityId}`, 404));
  }

  if (req.user.role !== "Student") {
    return next(new ErrorResponse("Only students can turn in activities", 403));
  }

  const subject = await Subject.findById(activity.subject);
  if (!subject || !subject.students.some((s) => s.equals(studentId))) {
    return next(new ErrorResponse("Student not enrolled in this subject", 403));
  }

  if (new Date() > activity.deadline) {
    return next(
      new ErrorResponse("Cannot turn in activity past the deadline", 400)
    );
  }

  // Use original filenames for submissions
  const attachmentPaths = req.files
    ? req.files.map((file) => `uploads/${file.filename}`)
    : [];

  let submission = activity.submissions.find((sub) =>
    sub.student.equals(studentId)
  );

  if (submission) {
    if (attachmentPaths.length > 0 && submission.attachmentPaths.length > 0) {
      submission.attachmentPaths.forEach((attachPath) => {
        const filePath = path.join(process.cwd(), attachPath);
        fs.unlink(filePath, (err) => {
          if (err)
            console.error(
              `Error deleting old submission attachment ${attachPath}:`,
              err
            );
        });
      });
    }
    submission.submissionDate = new Date();
    submission.attachmentPaths = attachmentPaths.length > 0 ? attachmentPaths : submission.attachmentPaths;
    submission.status = "submitted";
  } else {
    activity.submissions.push({
      student: studentId,
      submissionDate: new Date(),
      attachmentPaths: attachmentPaths,
      status: "submitted",
    });
  }

  await activity.save();

  res.status(200).json({
    success: true,
    message: "Activity turned in successfully",
    submission: activity.submissions.find((sub) =>
      sub.student.equals(studentId)
    ),
  });
});

// Student Undo Turn-in Activity
exports.undoTurnInActivity = asyncHandler(async (req, res, next) => {
  const { activityId } = req.params;
  const studentId = req.user.id;

  if (!mongoose.Types.ObjectId.isValid(activityId)) {
    return next(new ErrorResponse(`Invalid activity ID: ${activityId}`, 400));
  }

  const activity = await Activity.findById(activityId);

  if (!activity) {
    return next(new ErrorResponse(`Activity not found: ${activityId}`, 404));
  }

  if (req.user.role !== "Student") {
    return next(
      new ErrorResponse("Only students can undo activity turn-in", 403)
    );
  }

  if (new Date() > activity.deadline) {
    return next(
      new ErrorResponse("Cannot undo turn-in past the deadline", 400)
    );
  }

  const submissionIndex = activity.submissions.findIndex((sub) =>
    sub.student.equals(studentId)
  );

  if (submissionIndex === -1) {
    return next(new ErrorResponse("No submission found for this student", 404));
  }

  const submissionToRemove = activity.submissions[submissionIndex];

  if (
    submissionToRemove.attachmentPaths &&
    submissionToRemove.attachmentPaths.length > 0
  ) {
    submissionToRemove.attachmentPaths.forEach((attachPath) => {
      const filePath = path.join(process.cwd(), attachPath);
      fs.unlink(filePath, (err) => {
        if (err)
          console.error(
            `Error deleting submission attachment ${attachPath}:`,
            err
          );
      });
    });
  }

  activity.submissions.splice(submissionIndex, 1);
  await activity.save();

  res.status(200).json({
    success: true,
    message: "Activity turn-in undone successfully",
  });
});

// Get All Submissions for an Activity
exports.getAllSubmissionsForActivity = asyncHandler(async (req, res, next) => {
  const { activityId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(activityId)) {
    return next(new ErrorResponse(`Invalid activity ID: ${activityId}`, 400));
  }

  const activity = await Activity.findById(activityId)
    .populate({
      path: "submissions.student",
      select: "firstName middleName lastName email profilePicture",
    })
    .populate("subject", "teacher");

  if (!activity) {
    return next(new ErrorResponse(`Activity not found: ${activityId}`, 404));
  }

  const isAssignedTeacher =
    req.user.role === "Teacher" &&
    activity.subject.teacher &&
    activity.subject.teacher.equals(req.user.id);
  const isAdmin = req.user.role === "Admin";

  if (!isAssignedTeacher && !isAdmin) {
    return next(
      new ErrorResponse(
        "Not authorized to view submissions for this activity",
        403
      )
    );
  }

  res.status(200).json({
    success: true,
    count: activity.submissions.length,
    data: activity.submissions,
  });
});

exports.getStudentGradeForActivity = asyncHandler(async (req, res, next) => {
  const { activityId } = req.params;
  const studentId = req.user.id;

  const grade = await Grade.findOne({
    activity: activityId,
    student: studentId
  }).populate('gradedBy', 'firstName middleName lastName');

  res.status(200).json({
    success: true,
    data: grade
  });
});