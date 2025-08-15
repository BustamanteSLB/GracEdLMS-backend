const mongoose = require("mongoose");
const Subject = require("../models/Subject");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const User = require("../models/User");
const Activity = require("../models/Activity");
const Grade = require("../models/Grade");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");

// Helper function to find a user by ID, username, or email
async function findUserByIdentifier(identifier, role, requireActive = true) {
  const queryConditions = { role };
  if (requireActive) {
    queryConditions.status = "active";
  }

  let userDoc;

  if (mongoose.Types.ObjectId.isValid(identifier)) {
    userDoc = await User.findOne({ _id: identifier, ...queryConditions });
    if (userDoc) return userDoc;
  }

  userDoc = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }],
    ...queryConditions,
  });

  return userDoc;
}

// @desc    Create a new subject
// @route   POST /api/v1/subjects
// @access  Private/Admin, Teacher
exports.createSubject = asyncHandler(async (req, res, next) => {
  const {
    subjectName,
    description,
    teacherIdentifier,
    gradeLevel,
    section,
    schoolYear,
  } = req.body;

  if (!subjectName || !schoolYear) {
    return next(
      new ErrorResponse("Subject name and school year are required", 400)
    );
  }

  let subjectData = {
    subjectName,
    description,
    gradeLevel,
    section,
    schoolYear,
    students: [],
    courseMaterials: [],
    isArchived: false, // Ensure new subjects are not archived
  };

  let teacherToAssign = null;

  if (req.user.role === "Teacher" && !teacherIdentifier) {
    teacherToAssign = req.user.id;
  } else if (teacherIdentifier) {
    const teacher = await findUserByIdentifier(teacherIdentifier, "Teacher");
    if (!teacher) {
      return next(
        new ErrorResponse(
          `Active teacher not found with identifier: ${teacherIdentifier}`,
          404
        )
      );
    }
    teacherToAssign = teacher._id;
  }

  // Check if teacher already has 10 subjects (only for non-archived subjects)
  if (teacherToAssign) {
    const teacherSubjectCount = await Subject.countDocuments({
      teacher: teacherToAssign,
      isArchived: false,
    });

    if (teacherSubjectCount >= 10) {
      const teacher = await User.findById(teacherToAssign);
      const teacherName = teacher
        ? `${teacher.firstName} ${teacher.lastName}`
        : "Teacher";
      return next(
        new ErrorResponse(
          `${teacherName} has already reached the maximum limit of 10 subjects. Please delete an existing subject before adding a new one.`,
          400
        )
      );
    }

    subjectData.teacher = teacherToAssign;
  }

  const subject = await Subject.create(subjectData);

  if (subjectData.teacher) {
    await User.findByIdAndUpdate(subjectData.teacher, {
      $addToSet: { assignedSubjects: subject._id },
    });
  }

  res.status(201).json({
    success: true,
    data: subject,
  });
});

// @desc    Get all subjects (non-archived by default)
// @route   GET /api/v1/subjects
// @access  Private (all logged-in users)
exports.getAllSubjects = asyncHandler(async (req, res, next) => {
  let query;
  const reqQuery = { ...req.query };
  const removeFields = [
    "select",
    "sort",
    "page",
    "limit",
    "teacher",
    "archived",
  ];
  removeFields.forEach((param) => delete reqQuery[param]);

  let findQuery = {};

  // Filter by archived status
  const showArchived = req.query.archived === "true";
  findQuery.isArchived = showArchived;

  if (req.user && req.user.role === "Teacher") {
    findQuery.teacher = req.user.id;
  } else {
    if (req.query.teacher) {
      findQuery.teacher = req.query.teacher;
    }
  }

  let queryStr = JSON.stringify(reqQuery);
  queryStr = queryStr.replace(
    /\b(gt|gte|lt|lte|in)\b/g,
    (match) => `$${match}`
  );
  findQuery = { ...findQuery, ...JSON.parse(queryStr) };

  query = Subject.find(findQuery)
    .populate({
      path: "teacher",
      select: "firstName lastName email",
    })
    .populate({
      path: "students",
      select: "sex",
    })
    .populate({
      path: "archivedBy",
      select: "firstName lastName email",
    });

  if (req.query.select) {
    const fields = req.query.select.split(",").join(" ");
    query = query.select(fields);
  }

  if (req.query.sort) {
    const sortBy = req.query.sort.split(",").join(" ");
    query = query.sort(sortBy);
  } else {
    query = query.sort("-createdAt");
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Subject.countDocuments(findQuery);

  query = query.skip(startIndex).limit(limit);

  const subjects = await query;

  const pagination = {};

  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit,
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit,
    };
  }

  res.status(200).json({
    success: true,
    count: subjects.length,
    total: total,
    pagination,
    data: subjects,
  });
});

// @desc    Get single subject
// @route   GET /api/v1/subjects/:id
// @access  Private (all logged-in users)
exports.getSubject = asyncHandler(async (req, res, next) => {
  const subject = await Subject.findById(req.params.id)
    .populate({
      path: "teacher",
      select: "firstName lastName email",
    })
    .populate({
      path: "archivedBy",
      select: "firstName lastName email",
    });

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: subject,
  });
});

// @desc    Update subject
// @route   PUT /api/v1/subjects/:id
// @access  Private/Admin
exports.updateSubject = asyncHandler(async (req, res, next) => {
  let subject = await Subject.findById(req.params.id);

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${req.params.id}`, 404)
    );
  }

  const {
    subjectName,
    description,
    teacherIdentifier,
    gradeLevel,
    section,
    schoolYear,
  } = req.body;

  const fieldsToUpdate = {};
  if (subjectName !== undefined) fieldsToUpdate.subjectName = subjectName;
  if (description !== undefined) fieldsToUpdate.description = description;
  if (gradeLevel !== undefined) fieldsToUpdate.gradeLevel = gradeLevel;
  if (section !== undefined) fieldsToUpdate.section = section;
  if (schoolYear !== undefined) fieldsToUpdate.schoolYear = schoolYear;

  const oldTeacherId = subject.teacher ? subject.teacher.toString() : null;
  let newTeacherId = oldTeacherId;

  if (typeof teacherIdentifier !== "undefined") {
    const trimmedIdentifier = teacherIdentifier.toString().trim();
    if (
      trimmedIdentifier === "" ||
      trimmedIdentifier.toLowerCase() === "null"
    ) {
      fieldsToUpdate.teacher = null;
      newTeacherId = null;
    } else {
      const teacher = await findUserByIdentifier(trimmedIdentifier, "Teacher");
      if (!teacher) {
        return next(
          new ErrorResponse(
            `Active teacher not found with identifier: ${trimmedIdentifier}`,
            404
          )
        );
      }

      // Check if the new teacher already has 10 subjects (only if assigning to a different teacher)
      if (oldTeacherId !== teacher._id.toString()) {
        const teacherSubjectCount = await Subject.countDocuments({
          teacher: teacher._id,
          isArchived: false,
        });

        if (teacherSubjectCount >= 10) {
          return next(
            new ErrorResponse(
              `${teacher.firstName} ${teacher.lastName} has already reached the maximum limit of 10 subjects. Please choose a different teacher or ask them to delete an existing subject.`,
              400
            )
          );
        }
      }

      fieldsToUpdate.teacher = teacher._id;
      newTeacherId = teacher._id.toString();
    }
  }

  subject = await Subject.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
    new: true,
    runValidators: true,
  })
    .populate({
      path: "teacher",
      select: "firstName lastName email username",
    })
    .populate({
      path: "students",
      select: "firstName lastName email username userId",
    });

  if (oldTeacherId !== newTeacherId) {
    if (oldTeacherId) {
      await User.findByIdAndUpdate(oldTeacherId, {
        $pull: { assignedSubjects: subject._id },
      });
    }
    if (newTeacherId) {
      await User.findByIdAndUpdate(newTeacherId, {
        $addToSet: { assignedSubjects: subject._id },
      });
    }
  }

  res.status(200).json({
    success: true,
    data: subject,
  });
});

// @desc    Archive subject (soft delete)
// @route   DELETE /api/v1/subjects/:id
// @access  Private/Admin
exports.deleteSubject = asyncHandler(async (req, res, next) => {
  const subject = await Subject.findById(req.params.id);

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${req.params.id}`, 404)
    );
  }

  if (subject.isArchived) {
    return next(new ErrorResponse("Subject is already archived", 400));
  }

  // Archive the subject instead of deleting
  subject.isArchived = true;
  subject.archivedAt = new Date();
  subject.archivedBy = req.user.id;
  await subject.save();

  // Unassign from teacher's assignedSubjects
  if (subject.teacher) {
    await User.findByIdAndUpdate(subject.teacher, {
      $pull: { assignedSubjects: subject._id },
    });
  }

  // Unenroll all students from this subject
  await User.updateMany(
    { _id: { $in: subject.students }, role: "Student" },
    { $pull: { enrolledSubjects: subject._id } }
  );

  res.status(200).json({
    success: true,
    message: "Subject archived successfully",
    data: subject,
  });
});

// @desc    Restore archived subject
// @route   PUT /api/v1/subjects/:id/restore
// @access  Private/Admin
exports.restoreSubject = asyncHandler(async (req, res, next) => {
  const subject = await Subject.findById(req.params.id);

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${req.params.id}`, 404)
    );
  }

  if (!subject.isArchived) {
    return next(new ErrorResponse("Subject is not archived", 400));
  }

  // Restore the subject
  subject.isArchived = false;
  subject.archivedAt = null;
  subject.archivedBy = null;
  await subject.save();

  // Re-assign to teacher's assignedSubjects
  if (subject.teacher) {
    await User.findByIdAndUpdate(subject.teacher, {
      $addToSet: { assignedSubjects: subject._id },
    });
  }

  // Re-enroll all students to this subject
  await User.updateMany(
    { _id: { $in: subject.students }, role: "Student" },
    { $addToSet: { enrolledSubjects: subject._id } }
  );

  res.status(200).json({
    success: true,
    message: "Subject restored successfully",
    data: subject,
  });
});

// @desc    Permanently delete subject
// @route   DELETE /api/v1/subjects/:id/permanent
// @access  Private/Admin
exports.permanentDeleteSubject = asyncHandler(async (req, res, next) => {
  const subject = await Subject.findById(req.params.id);

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${req.params.id}`, 404)
    );
  }

  if (!subject.isArchived) {
    return next(
      new ErrorResponse(
        "Subject must be archived before permanent deletion",
        400
      )
    );
  }

  // Unassign from teacher's assignedSubjects
  if (subject.teacher) {
    await User.findByIdAndUpdate(subject.teacher, {
      $pull: { assignedSubjects: subject._id },
    });
  }

  // Unenroll all students from this subject
  await User.updateMany(
    { _id: { $in: subject.students }, role: "Student" },
    { $pull: { enrolledSubjects: subject._id } }
  );

  // Delete all activities associated with this subject
  await Activity.deleteMany({ subject: subject._id });

  // Delete all grades associated with this subject's activities
  await Grade.deleteMany({ subject: subject._id });

  await subject.deleteOne();

  res.status(200).json({
    success: true,
    message: "Subject permanently deleted",
    data: {},
  });
});

// @desc    Assign teacher to subject
// @route   PUT /api/v1/subjects/:subjectId/assign-teacher
// @access  Private/Admin
exports.assignTeacher = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;
  const { teacherIdentifier } = req.body;

  if (!teacherIdentifier) {
    return next(new ErrorResponse("Teacher identifier is required", 400));
  }

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(new ErrorResponse("Invalid subject ID format", 400));
  }

  const subject = await Subject.findById(subjectId);

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404)
    );
  }

  const teacher = await findUserByIdentifier(teacherIdentifier, "Teacher");
  if (!teacher) {
    return next(
      new ErrorResponse(
        `Active teacher not found with identifier: ${teacherIdentifier}`,
        404
      )
    );
  }

  const oldTeacherId = subject.teacher ? subject.teacher.toString() : null;

  // Check if the teacher already has 10 subjects (only if assigning to a different teacher)
  if (oldTeacherId !== teacher._id.toString()) {
    const teacherSubjectCount = await Subject.countDocuments({
      teacher: teacher._id,
      isArchived: false,
    });

    if (teacherSubjectCount >= 10) {
      return next(
        new ErrorResponse(
          `${teacher.firstName} ${teacher.lastName} has already reached the maximum limit of 10 subjects. Please choose a different teacher or ask them to delete an existing subject.`,
          400
        )
      );
    }
  }

  subject.teacher = teacher._id;
  await subject.save();

  if (oldTeacherId && oldTeacherId !== teacher._id.toString()) {
    await User.findByIdAndUpdate(oldTeacherId, {
      $pull: { assignedSubjects: subject._id },
    });
  }
  await User.findByIdAndUpdate(teacher._id, {
    $addToSet: { assignedSubjects: subject._id },
  });

  const updatedSubject = await Subject.findById(subjectId).populate(
    "teacher students"
  );

  res.status(200).json({
    success: true,
    message: `Teacher ${teacher.firstName} ${teacher.lastName} assigned to subject ${subject.subjectName}`,
    data: updatedSubject,
  });
});

exports.unassignTeacher = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(new ErrorResponse("Invalid subject ID format", 400));
  }

  const subject = await Subject.findById(subjectId);

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404)
    );
  }

  if (!subject.teacher) {
    return res.status(400).json({
      success: false,
      message: `Subject ${subject.subjectName} does not have an assigned teacher to unassign.`,
    });
  }

  const teacherIdToUnassign = subject.teacher;
  subject.teacher = null;
  await subject.save();

  await User.findByIdAndUpdate(teacherIdToUnassign, {
    $pull: { assignedSubjects: subject._id },
  });

  const updatedSubject = await Subject.findById(subjectId).populate(
    "teacher students"
  );

  res.status(200).json({
    success: true,
    message: `Teacher unassigned from subject ${subject.subjectName}`,
    data: updatedSubject,
  });
});

exports.enrollStudent = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;
  const { studentIdentifier } = req.body;

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(new ErrorResponse("Invalid subject ID format", 400));
  }

  const subject = await Subject.findById(subjectId);

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404)
    );
  }

  if (
    req.user.role === "Teacher" &&
    (!subject.teacher || !subject.teacher.equals(req.user.id))
  ) {
    return next(
      new ErrorResponse(
        "You are not authorized to enroll students in this subject.",
        403
      )
    );
  }

  // Check if subject has reached maximum capacity of 30 students
  if (subject.students.length >= 30) {
    return next(
      new ErrorResponse(
        "Subject has reached maximum capacity of 30 students. Please remove a student before enrolling a new one.",
        400
      )
    );
  }

  const student = await findUserByIdentifier(studentIdentifier, "Student");
  if (!student) {
    return next(
      new ErrorResponse(
        `Active student not found with identifier: ${studentIdentifier}`,
        404
      )
    );
  }

  if (subject.students.includes(student._id)) {
    return next(
      new ErrorResponse("Student is already enrolled in this subject", 400)
    );
  }

  subject.students.push(student._id);
  await User.updateOne(
    { _id: student._id, role: "Student" },
    { $addToSet: { enrolledSubjects: subjectId } }
  );
  await subject.save();

  const updatedSubject = await Subject.findById(subjectId).populate(
    "teacher students"
  );

  res.status(200).json({
    success: true,
    message: `Student ${student.firstName} ${student.lastName} enrolled in subject ${subject.subjectName}`,
    data: updatedSubject,
  });
});

exports.unenrollStudent = asyncHandler(async (req, res, next) => {
  const { subjectId, studentIdentifier } = req.params;

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(new ErrorResponse("Invalid subject ID format", 400));
  }

  const subject = await Subject.findById(subjectId);

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404)
    );
  }

  if (
    req.user.role === "Teacher" &&
    (!subject.teacher || !subject.teacher.equals(req.user.id))
  ) {
    return next(
      new ErrorResponse(
        "You are not authorized to unenroll students from this subject.",
        403
      )
    );
  }

  const student = await findUserByIdentifier(studentIdentifier, "Student");
  if (!student) {
    return next(
      new ErrorResponse(
        `Active student not found with identifier: ${studentIdentifier}`,
        404
      )
    );
  }

  if (!subject.students.includes(student._id)) {
    return next(
      new ErrorResponse("Student is not enrolled in this subject", 400)
    );
  }

  subject.students = subject.students.filter(
    (sId) => sId.toString() !== student._id.toString()
  );
  await User.updateOne(
    { _id: student._id, role: "Student" },
    { $pull: { enrolledSubjects: subjectId } }
  );
  await subject.save();

  const updatedSubject = await Subject.findById(subjectId).populate(
    "teacher students"
  );

  res.status(200).json({
    success: true,
    message: `Student ${student.firstName} ${student.lastName} unenrolled from subject ${subject.subjectName}`,
    data: updatedSubject,
  });
});

exports.bulkEnrollStudents = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;
  const { studentIdentifiers } = req.body;

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(new ErrorResponse("Invalid subject ID format", 400));
  }

  if (!Array.isArray(studentIdentifiers) || studentIdentifiers.length === 0) {
    return next(
      new ErrorResponse("Please provide an array of student identifiers", 400)
    );
  }

  const subject = await Subject.findById(subjectId);

  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404)
    );
  }

  if (
    req.user.role === "Teacher" &&
    (!subject.teacher || !subject.teacher.equals(req.user.id))
  ) {
    return next(
      new ErrorResponse(
        "You are not authorized to enroll students in this subject.",
        403
      )
    );
  }

  const successfullyEnrolled = [];
  const failedEnrollments = [];
  const currentStudentCount = subject.students.length;
  const maxStudents = 30;
  const availableSlots = maxStudents - currentStudentCount;

  // If subject is already at maximum capacity
  if (currentStudentCount >= maxStudents) {
    return next(
      new ErrorResponse(
        "Subject has reached maximum capacity of 30 students. Please remove enrolled students before adding new ones.",
        400
      )
    );
  }

  let enrolledCount = 0;

  for (const identifier of studentIdentifiers) {
    // Stop enrolling if we've reached the maximum capacity
    if (currentStudentCount + enrolledCount >= maxStudents) {
      failedEnrollments.push({
        identifier,
        reason: "Subject has reached maximum capacity of 30 students",
      });
      continue;
    }

    try {
      const student = await findUserByIdentifier(identifier, "Student");
      if (!student) {
        failedEnrollments.push({
          identifier,
          reason: "Student not found or not active",
        });
        continue;
      }

      if (subject.students.includes(student._id)) {
        failedEnrollments.push({
          identifier,
          reason: "Student already enrolled",
        });
        continue;
      }

      subject.students.push(student._id);
      await User.updateOne(
        { _id: student._id, role: "Student" },
        { $addToSet: { enrolledSubjects: subjectId } }
      );
      successfullyEnrolled.push({
        studentId: student._id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.email,
      });
      enrolledCount++;
    } catch (error) {
      failedEnrollments.push({ identifier, reason: error.message });
    }
  }

  await subject.save();

  const updatedSubject = await Subject.findById(subjectId).populate(
    "teacher students"
  );

  // Create response message
  let message = `Bulk enrollment completed. Successfully enrolled: ${successfullyEnrolled.length}`;
  if (failedEnrollments.length > 0) {
    message += `, Failed: ${failedEnrollments.length}`;
  }
  if (enrolledCount > 0 && currentStudentCount + enrolledCount >= maxStudents) {
    message += `. Subject has reached maximum capacity of 30 students.`;
  }

  res.status(200).json({
    success: true,
    message,
    data: updatedSubject,
    enrollmentSummary: {
      totalAttempted: studentIdentifiers.length,
      successfullyEnrolled: successfullyEnrolled.length,
      failed: failedEnrollments.length,
      currentCapacity: `${updatedSubject.students.length}/30`,
      availableSlots: maxStudents - updatedSubject.students.length,
    },
    successfullyEnrolled,
    failedEnrollments,
  });
});
