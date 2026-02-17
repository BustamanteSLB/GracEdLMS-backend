const mongoose = require("mongoose");
const Grade = require("../models/Grade");
const Activity = require("../models/Activity");
const Subject = require("../models/Subject");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");

// @desc    Grade an activity for a student
// @route   POST /api/v1/activities/:activityId/grades
// @access  Private/Teacher (assigned to the subject of the activity) or Private/Admin
exports.gradeActivity = asyncHandler(async (req, res, next) => {
  const { activityId } = req.params;
  const { studentId, score, comments, bonusPoints } = req.body;

  if (!mongoose.Types.ObjectId.isValid(activityId)) {
    return next(
      new ErrorResponse(`Invalid activity ID format: ${activityId}`, 400),
    );
  }
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    return next(
      new ErrorResponse("Student ID is required and must be valid", 400),
    );
  }

  if (score === undefined || score === null || score === "") {
    return next(new ErrorResponse("Score is required", 400));
  }

  const numericScore = Number(score);
  if (isNaN(numericScore) || numericScore < 0) {
    return next(
      new ErrorResponse(
        "Score must be a valid number greater than or equal to 0",
        400,
      ),
    );
  }

  let numericBonusPoints = undefined;
  if (bonusPoints !== undefined && bonusPoints !== null && bonusPoints !== "") {
    numericBonusPoints = Number(bonusPoints);
    if (isNaN(numericBonusPoints) || numericBonusPoints < 0) {
      return next(
        new ErrorResponse(
          "Bonus points must be a valid number greater than or equal to 0",
          400,
        ),
      );
    }
  }

  const activity = await Activity.findById(activityId).populate({
    path: "subject",
    populate: {
      path: "teachers.teacher",
    },
  });
  if (!activity) {
    return next(
      new ErrorResponse(`Activity not found with ID ${activityId}`, 404),
    );
  }
  const subject = activity.subject;

  // Authorization: Only assigned teacher or admin can grade
  // Updated to check teachers array
  const isAssignedTeacher =
    req.user.role === "Teacher" &&
    subject.teachers &&
    subject.teachers.some(
      (ta) =>
        ta.teacher &&
        (ta.teacher._id.equals(req.user._id) ||
          ta.teacher.email === req.user.email ||
          ta.teacher.username === req.user.username),
    );

  const isAdmin = req.user.role === "Admin";

  if (!isAssignedTeacher && !isAdmin) {
    return next(
      new ErrorResponse(
        "You are not authorized to grade activities for this subject.",
        403,
      ),
    );
  }

  const student = await User.findOne({ _id: studentId, role: "Student" });
  if (!student) {
    return next(
      new ErrorResponse(`Student not found with ID ${studentId}`, 404),
    );
  }

  if (!subject.students.some((s) => s.toString() === studentId.toString())) {
    return next(
      new ErrorResponse(
        `Student ${student.firstName} ${student.lastName} is not enrolled in subject ${subject.subjectName}.`,
        400,
      ),
    );
  }

  if (activity.points && numericScore > activity.points) {
    return next(
      new ErrorResponse(`Score must be between 0 and ${activity.points}.`, 400),
    );
  }

  const gradeData = {
    student: studentId,
    activity: activityId,
    subject: subject._id,
    quarter: activity.quarter,
    score: numericScore,
    bonusPoints: numericBonusPoints,
    comments: comments || undefined,
    gradedBy: req.user.id,
  };

  const grade = await Grade.findOneAndUpdate(
    { student: studentId, activity: activityId },
    gradeData,
    { new: true, upsert: true, runValidators: true },
  ).populate([
    {
      path: "student",
      select: "firstName lastName email username userId profilePicture",
    },
    { path: "activity", select: "title points deadline" },
    { path: "subject", select: "subjectName section" },
    { path: "gradedBy", select: "firstName lastName" },
  ]);

  res.status(201).json({
    success: true,
    data: grade,
  });
});

// @desc    Get all grades for a specific activity (for teacher/admin view)
// @route   GET /api/v1/activities/:activityId/grades
// @access  Private (Assigned Teacher, Admin)
exports.getActivityGrades = asyncHandler(async (req, res, next) => {
  const { activityId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(activityId)) {
    return next(new ErrorResponse("Invalid activity ID format", 400));
  }

  const activity = await Activity.findById(activityId).populate({
    path: "subject",
    populate: {
      path: "teachers.teacher",
    },
  });
  if (!activity) return next(new ErrorResponse("Activity not found", 404));

  // Authorization - Updated to check teachers array
  const subject = activity.subject;
  const isAssignedTeacher =
    req.user.role === "Teacher" &&
    subject.teachers &&
    subject.teachers.some(
      (ta) =>
        ta.teacher &&
        (ta.teacher._id.equals(req.user._id) ||
          ta.teacher.email === req.user.email ||
          ta.teacher.username === req.user.username),
    );

  const isAdmin = req.user.role === "Admin";

  if (!isAssignedTeacher && !isAdmin) {
    return next(
      new ErrorResponse(
        "Not authorized to view grades for this activity.",
        403,
      ),
    );
  }

  const grades = await Grade.find({ activity: activityId })
    .populate({
      path: "student",
      select: "firstName lastName email username userId profilePicture",
    })
    .populate({ path: "activity", select: "title points deadline" })
    .populate({ path: "subject", select: "subjectName section" })
    .populate({ path: "gradedBy", select: "firstName lastName" })
    .sort({ "student.lastName": 1 });

  res.status(200).json({
    success: true,
    count: grades.length,
    data: grades,
  });
});

// @desc    Get grades for a specific student in a specific subject
// @route   GET /api/v1/subjects/:subjectId/students/:studentId/grades
// @access  Private (Student themselves, Assigned Teacher, Admin)
exports.getStudentGradesForSubject = asyncHandler(async (req, res, next) => {
  const { subjectId, studentId } = req.params;

  if (
    !mongoose.Types.ObjectId.isValid(subjectId) ||
    !mongoose.Types.ObjectId.isValid(studentId)
  ) {
    return next(new ErrorResponse("Invalid subject or student ID format", 400));
  }

  const subject = await Subject.findById(subjectId).populate({
    path: "teachers.teacher",
  });
  if (!subject) return next(new ErrorResponse("Subject not found", 404));

  const student = await User.findById(studentId);
  if (!student || student.role !== "Student")
    return next(new ErrorResponse("Student not found", 404));

  // Authorization - Updated to check teachers array
  const isStudentOwner = req.user._id.toString() === studentId.toString();
  const isAssignedTeacher =
    req.user.role === "Teacher" &&
    subject.teachers &&
    subject.teachers.some(
      (ta) =>
        ta.teacher &&
        (ta.teacher._id.equals(req.user._id) ||
          ta.teacher.email === req.user.email ||
          ta.teacher.username === req.user.username),
    );

  const isAdmin = req.user.role === "Admin";

  if (!isStudentOwner && !isAssignedTeacher && !isAdmin) {
    return next(new ErrorResponse("Not authorized to view these grades.", 403));
  }

  const grades = await Grade.find({ student: studentId, subject: subjectId })
    .populate({ path: "activity", select: "title points deadline" })
    .populate({ path: "gradedBy", select: "firstName lastName" })
    .sort({ "activity.deadline": 1 });

  res.status(200).json({
    success: true,
    count: grades.length,
    data: grades,
  });
});

// @desc    Update a specific grade (e.g., change score or comments)
// @route   PUT /api/v1/grades/:gradeId
// @access  Private (Teacher who graded, or Admin)
exports.updateGrade = asyncHandler(async (req, res, next) => {
  const { gradeId } = req.params;
  const { score, comments, bonusPoints } = req.body;

  if (!mongoose.Types.ObjectId.isValid(gradeId)) {
    return next(new ErrorResponse("Invalid grade ID format", 400));
  }

  let grade = await Grade.findById(gradeId).populate("activity");
  if (!grade) return next(new ErrorResponse("Grade not found", 404));

  // Authorization: Original grader or Admin
  const isOriginalGrader =
    grade.gradedBy && grade.gradedBy.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "Admin";

  if (!isOriginalGrader && !isAdmin) {
    return next(new ErrorResponse("Not authorized to update this grade.", 403));
  }

  // Update score if provided
  if (score !== undefined && score !== null) {
    const numericScore = Number(score);
    if (isNaN(numericScore) || numericScore < 0) {
      return next(
        new ErrorResponse(
          "Score must be a valid number greater than or equal to 0",
          400,
        ),
      );
    }
    if (grade.activity.points && numericScore > grade.activity.points) {
      return next(
        new ErrorResponse(
          `Score must be between 0 and ${grade.activity.points}.`,
          400,
        ),
      );
    }
    grade.score = numericScore;
  }

  // Update bonus points if provided
  if (bonusPoints !== undefined) {
    if (bonusPoints === null || bonusPoints === "") {
      grade.bonusPoints = undefined;
    } else {
      const numericBonusPoints = Number(bonusPoints);
      if (isNaN(numericBonusPoints) || numericBonusPoints < 0) {
        return next(
          new ErrorResponse(
            "Bonus points must be a valid number greater than or equal to 0",
            400,
          ),
        );
      }
      grade.bonusPoints = numericBonusPoints;
    }
  }

  // Update comments if provided
  if (comments !== undefined) {
    grade.comments = comments;
  }

  grade.gradedBy = req.user.id;

  await grade.save();

  // Populate the updated grade for response
  await grade.populate([
    {
      path: "student",
      select: "firstName lastName email username userId profilePicture",
    },
    { path: "activity", select: "title points deadline" },
    { path: "subject", select: "subjectName section" },
    { path: "gradedBy", select: "firstName lastName" },
  ]);

  res.status(200).json({
    success: true,
    data: grade,
  });
});

// @desc    Delete a grade
// @route   DELETE /api/v1/grades/:gradeId
// @access  Private (Teacher who graded, or Admin)
exports.deleteGrade = asyncHandler(async (req, res, next) => {
  const { gradeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(gradeId)) {
    return next(new ErrorResponse("Invalid grade ID format", 400));
  }

  const grade = await Grade.findById(gradeId);
  if (!grade) return next(new ErrorResponse("Grade not found", 404));

  // Authorization: Original grader or Admin
  const isOriginalGrader =
    grade.gradedBy && grade.gradedBy.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "Admin";

  if (!isOriginalGrader && !isAdmin) {
    return next(new ErrorResponse("Not authorized to delete this grade.", 403));
  }

  await Grade.findByIdAndDelete(gradeId);

  res.status(200).json({
    success: true,
    data: {},
    message: "Grade deleted successfully",
  });
});

// @desc    Get all activities for a student with their submission and grade status
// @route   GET /api/v1/students/:studentId/grades-overview
// @access  Private (Student themselves, Admin)
exports.getStudentActivityGradesOverview = asyncHandler(
  async (req, res, next) => {
    const { studentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return next(new ErrorResponse("Invalid student ID format", 400));
    }

    // Authorization: Only the student themselves or an Admin can view this
    if (
      req.user._id.toString() !== studentId.toString() &&
      req.user.role !== "Admin"
    ) {
      return next(
        new ErrorResponse("Not authorized to view these grades.", 403),
      );
    }

    const studentUser = await User.findById(studentId);
    if (!studentUser || studentUser.role !== "Student") {
      return next(
        new ErrorResponse("Student not found or not a student role", 404),
      );
    }

    // Find all subjects the student is enrolled in
    const enrolledSubjects = await Subject.find({ students: studentId });

    const gradesOverview = [];

    for (const subject of enrolledSubjects) {
      // Find all activities for this subject
      const activities = await Activity.find({ subject: subject._id })
        .populate({ path: "createdBy", select: "firstName lastName" })
        .populate({ path: "subject", select: "subjectName section" })
        .lean(); // Use .lean() for performance when populating later

      for (const activity of activities) {
        let submissionStatus = "UNSUBMITTED";
        let studentSubmission = null;
        let existingGrade = null;

        // Check if the student has a submission for this activity
        if (activity.submissions && activity.submissions.length > 0) {
          studentSubmission = activity.submissions.find((sub) =>
            sub.student.equals(studentId),
          );
        }

        if (studentSubmission) {
          // If a submission exists, try to find a corresponding Grade record
          existingGrade = await Grade.findOne({
            student: studentId,
            activity: activity._id,
          })
            .populate({ path: "gradedBy", select: "firstName lastName" })
            .lean(); // Use .lean() for performance

          if (existingGrade) {
            submissionStatus = "GRADED";
          } else {
            submissionStatus = "PENDING"; // Submitted but not yet graded
          }
        }
        // If no studentSubmission, it remains 'UNSUBMITTED'

        gradesOverview.push({
          activity: activity,
          submission: studentSubmission || null, // Will be null if no submission
          grade: existingGrade || null, // Will be null if no grade
          status: submissionStatus,
          subject: subject, // Add subject info directly for easier display
        });
      }
    }

    // Sort by deadline, then by activity title, then by status (pending, unsubmitted, graded)
    gradesOverview.sort((a, b) => {
      // Sort by deadline (earliest first)
      const deadlineA = new Date(a.activity.deadline).getTime();
      const deadlineB = new Date(b.activity.deadline).getTime();
      if (deadlineA !== deadlineB) {
        return deadlineA - deadlineB;
      }

      // Then by status: PENDING, then UNSUBMITTED, then GRADED
      const statusOrder = { PENDING: 1, UNSUBMITTED: 2, GRADED: 3 };
      const statusCompare = statusOrder[a.status] - statusOrder[b.status];
      if (statusCompare !== 0) {
        return statusCompare;
      }

      // Finally by activity title
      return a.activity.title.localeCompare(b.activity.title);
    });

    res.status(200).json({
      success: true,
      count: gradesOverview.length,
      data: gradesOverview,
    });
  },
);
