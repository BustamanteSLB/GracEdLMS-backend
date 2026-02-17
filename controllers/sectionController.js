const Section = require("../models/Section");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");
const mongoose = require("mongoose");

// @desc    Create a new section
// @route   POST /api/v1/sections
// @access  Private/Admin
exports.createSection = asyncHandler(async (req, res, next) => {
  const { sectionName, gradeLevel, schoolYear, studentIds } = req.body;

  if (!sectionName || !gradeLevel || !schoolYear) {
    return next(
      new ErrorResponse(
        "Section name, grade level, and school year are required",
        400,
      ),
    );
  }

  // Check if section already exists
  const existingSection = await Section.findOne({
    sectionName,
    gradeLevel,
    schoolYear,
    isArchived: false,
  });

  if (existingSection) {
    return next(
      new ErrorResponse(
        "A section with this name already exists for the selected grade level and school year",
        400,
      ),
    );
  }

  // Validate student IDs
  let validStudents = [];
  if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
    const students = await User.find({
      _id: { $in: studentIds },
      role: "Student",
      status: "active",
    });

    if (students.length !== studentIds.length) {
      return next(
        new ErrorResponse("One or more student IDs are invalid", 400),
      );
    }

    validStudents = students.map((s) => s._id);
  }

  const section = await Section.create({
    sectionName,
    gradeLevel,
    schoolYear,
    students: validStudents,
  });

  await section.populate("students", "firstName lastName email userId");

  res.status(201).json({
    success: true,
    data: section,
  });
});

// @desc    Get all sections
// @route   GET /api/v1/sections
// @access  Private
exports.getAllSections = asyncHandler(async (req, res, next) => {
  const { gradeLevel, schoolYear, archived } = req.query;

  let query = {};

  // Filter by archived status
  const showArchived = archived === "true";
  query.isArchived = showArchived;

  if (gradeLevel) {
    query.gradeLevel = gradeLevel;
  }

  if (schoolYear) {
    query.schoolYear = schoolYear;
  }

  const sections = await Section.find(query)
    .populate("students", "firstName lastName email userId")
    .populate("archivedBy", "firstName lastName email")
    .sort("-createdAt");

  res.status(200).json({
    success: true,
    count: sections.length,
    data: sections,
  });
});

// @desc    Get single section
// @route   GET /api/v1/sections/:id
// @access  Private
exports.getSection = asyncHandler(async (req, res, next) => {
  const section = await Section.findById(req.params.id)
    .populate("students", "firstName lastName email userId")
    .populate("archivedBy", "firstName lastName email");

  if (!section) {
    return next(
      new ErrorResponse(`Section not found with ID ${req.params.id}`, 404),
    );
  }

  res.status(200).json({
    success: true,
    data: section,
  });
});

// @desc    Update section
// @route   PUT /api/v1/sections/:id
// @access  Private/Admin
exports.updateSection = asyncHandler(async (req, res, next) => {
  let section = await Section.findById(req.params.id);

  if (!section) {
    return next(
      new ErrorResponse(`Section not found with ID ${req.params.id}`, 404),
    );
  }

  const { sectionName, gradeLevel, schoolYear, studentIds } = req.body;

  // Check for duplicate if changing name/grade/year
  if (sectionName || gradeLevel || schoolYear) {
    const checkDuplicate = await Section.findOne({
      _id: { $ne: req.params.id },
      sectionName: sectionName || section.sectionName,
      gradeLevel: gradeLevel || section.gradeLevel,
      schoolYear: schoolYear || section.schoolYear,
      isArchived: false,
    });

    if (checkDuplicate) {
      return next(
        new ErrorResponse(
          "A section with this name already exists for the selected grade level and school year",
          400,
        ),
      );
    }
  }

  const fieldsToUpdate = {};
  if (sectionName !== undefined) fieldsToUpdate.sectionName = sectionName;
  if (gradeLevel !== undefined) fieldsToUpdate.gradeLevel = gradeLevel;
  if (schoolYear !== undefined) fieldsToUpdate.schoolYear = schoolYear;

  // Validate and update students
  if (studentIds !== undefined) {
    if (Array.isArray(studentIds)) {
      if (studentIds.length > 0) {
        const students = await User.find({
          _id: { $in: studentIds },
          role: "Student",
          status: "active",
        });

        if (students.length !== studentIds.length) {
          return next(
            new ErrorResponse("One or more student IDs are invalid", 400),
          );
        }

        fieldsToUpdate.students = students.map((s) => s._id);
      } else {
        fieldsToUpdate.students = [];
      }
    }
  }

  section = await Section.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
    new: true,
    runValidators: true,
  }).populate("students", "firstName lastName email userId");

  res.status(200).json({
    success: true,
    data: section,
  });
});

// @desc    Archive section
// @route   DELETE /api/v1/sections/:id
// @access  Private/Admin
exports.deleteSection = asyncHandler(async (req, res, next) => {
  const section = await Section.findById(req.params.id);

  if (!section) {
    return next(
      new ErrorResponse(`Section not found with ID ${req.params.id}`, 404),
    );
  }

  if (section.isArchived) {
    return next(new ErrorResponse("Section is already archived", 400));
  }

  section.isArchived = true;
  section.archivedAt = new Date();
  section.archivedBy = req.user.id;
  await section.save();

  res.status(200).json({
    success: true,
    message: "Section archived successfully",
    data: section,
  });
});

// @desc    Add students to section
// @route   PUT /api/v1/sections/:id/add-students
// @access  Private/Admin
exports.addStudentsToSection = asyncHandler(async (req, res, next) => {
  const section = await Section.findById(req.params.id);

  if (!section) {
    return next(
      new ErrorResponse(`Section not found with ID ${req.params.id}`, 404),
    );
  }

  const { studentIds } = req.body;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return next(new ErrorResponse("Please provide student IDs", 400));
  }

  const students = await User.find({
    _id: { $in: studentIds },
    role: "Student",
    status: "active",
  });

  if (students.length !== studentIds.length) {
    return next(new ErrorResponse("One or more student IDs are invalid", 400));
  }

  // Add only new students
  const newStudentIds = students
    .map((s) => s._id)
    .filter((id) => !section.students.includes(id));

  section.students.push(...newStudentIds);
  await section.save();

  await section.populate("students", "firstName lastName email userId");

  res.status(200).json({
    success: true,
    data: section,
  });
});

// @desc    Remove student from section
// @route   PUT /api/v1/sections/:id/remove-student/:studentId
// @access  Private/Admin
exports.removeStudentFromSection = asyncHandler(async (req, res, next) => {
  const section = await Section.findById(req.params.id);

  if (!section) {
    return next(
      new ErrorResponse(`Section not found with ID ${req.params.id}`, 404),
    );
  }

  const { studentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    return next(new ErrorResponse("Invalid student ID", 400));
  }

  section.students = section.students.filter(
    (id) => id.toString() !== studentId,
  );

  await section.save();
  await section.populate("students", "firstName lastName email userId");

  res.status(200).json({
    success: true,
    data: section,
  });
});
