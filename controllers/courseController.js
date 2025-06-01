// courseController.js
const mongoose = require('mongoose');
const Course = require('../models/Course');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const User = require('../models/User'); // For checking roles
const Activity = require('../models/Activity');
const Grade = require('../models/Grade');
const asyncHandler = require('../utils/asyncHandler');
const { ErrorResponse } = require('../utils/errorResponse');

// @desc    Create a new course
// @route   POST /api/v1/courses
// @access  Private/Admin
exports.createCourse = asyncHandler(async (req, res, next) => {
  const { courseCode, courseName, description, teacherId, gradeLevel, section } = req.body; // Added gradeLevel, section

  if (!courseCode || !courseName) {
    return next(new ErrorResponse('Course code and name are required', 400));
  }

  let courseData = { courseCode, courseName, description, gradeLevel, section }; // Added gradeLevel, section

  if (teacherId) {
    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
      return next(new ErrorResponse(`Invalid teacher ID format: ${teacherId}`, 400));
    }
    const teacher = await User.findOne({ _id: teacherId, role: 'Teacher', status: 'active' });
    if (!teacher) {
      return next(new ErrorResponse(`Active teacher not found with ID ${teacherId}`, 404));
    }
    courseData.teacher = teacherId;
  }

  const course = await Course.create(courseData);

  res.status(201).json({
    success: true,
    data: course,
  });
});

// @desc    Get all courses
// @route   GET /api/v1/courses
// @access  Private (all logged-in users)
exports.getAllCourses = asyncHandler(async (req, res, next) => {
  let query;

  // Copy req.query
  const reqQuery = { ...req.query };

  // Fields to exclude
  const removeFields = ['select', 'sort', 'page', 'limit'];

  // Loop over removeFields and delete them from reqQuery
  removeFields.forEach((param) => delete reqQuery[param]);

  // Create query string
  let queryStr = JSON.stringify(reqQuery);

  // Create operators ($gt, $gte, etc)
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, (match) => `$${match}`);

  // Finding resource
  query = Course.find(JSON.parse(queryStr)).populate({
    path: 'teacher',
    select: 'firstName lastName email', // Populate relevant teacher fields
  });

  // Select Fields
  if (req.query.select) {
    const fields = req.query.select.split(',').join(' ');
    query = query.select(fields);
  }

  // Sort
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Course.countDocuments(JSON.parse(queryStr)); // Count total documents matching the filter

  query = query.skip(startIndex).limit(limit);

  const courses = await query;

  // Pagination result
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
    count: courses.length,
    total: total,
    pagination,
    data: courses,
  });
});

// @desc    Get single course
// @route   GET /api/v1/courses/:id
// @access  Private (all logged-in users)
exports.getCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.id).populate({
    path: 'teacher',
    select: 'firstName lastName email',
  });

  if (!course) {
    return next(new ErrorResponse(`Course not found with ID ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: course,
  });
});

// @desc    Update course
// @route   PUT /api/v1/courses/:id
// @access  Private/Admin
exports.updateCourse = asyncHandler(async (req, res, next) => {
  let course = await Course.findById(req.params.id);

  if (!course) {
    return next(new ErrorResponse(`Course not found with ID ${req.params.id}`, 404));
  }

  // Ensure user is course owner (teacher) or admin - courseRoutes.js already handles authorize('Admin')
  // This check is mainly for teacher's ability to update their assigned course.
  // For this context, assuming only Admin can update via this route as per courseRoutes.js

  // Only update fields that are provided in the request body
  const { courseCode, courseName, description, teacherId, gradeLevel, section } = req.body; // Added gradeLevel, section

  const fieldsToUpdate = {};
  if (courseCode) fieldsToUpdate.courseCode = courseCode;
  if (courseName) fieldsToUpdate.courseName = courseName;
  if (description) fieldsToUpdate.description = description;
  if (gradeLevel) fieldsToUpdate.gradeLevel = gradeLevel; // Added gradeLevel
  if (section) fieldsToUpdate.section = section;       // Added section

  if (teacherId) {
    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
      return next(new ErrorResponse(`Invalid teacher ID format: ${teacherId}`, 400));
    }
    const teacher = await User.findOne({ _id: teacherId, role: 'Teacher', status: 'active' });
    if (!teacher) {
      return next(new ErrorResponse(`Active teacher not found with ID ${teacherId}`, 404));
    }
    fieldsToUpdate.teacher = teacherId;
  } else if (teacherId === null || teacherId === '') { // Allow unassigning teacher
    fieldsToUpdate.teacher = null;
  }


  course = await Course.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
    new: true,
    runValidators: true,
  }).populate({
    path: 'teacher',
    select: 'firstName lastName email',
  }); // Populate after update

  res.status(200).json({
    success: true,
    data: course,
  });
});

// @desc    Delete course
// @route   DELETE /api/v1/courses/:id
// @access  Private/Admin
exports.deleteCourse = asyncHandler(async (req, res, next) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    return next(new ErrorResponse(`Course not found with ID ${req.params.id}`, 404));
  }

  // Ensure user is course owner (teacher) or admin - courseRoutes.js already handles authorize('Admin')
  // This check is mainly for teacher's ability to delete their assigned course.
  // For this context, assuming only Admin can delete via this route as per courseRoutes.js

  // Remove associated activities and grades before deleting the course
  await Activity.deleteMany({ course: req.params.id });
  await Grade.deleteMany({ course: req.params.id });

  await course.deleteOne(); // Use deleteOne() instead of remove()

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Assign a teacher to a course
// @route   PUT /api/v1/courses/:courseId/assign-teacher
// @access  Private/Admin
exports.assignTeacher = asyncHandler(async (req, res, next) => {
  const { courseId } = req.params;
  const { teacherId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(courseId) || !mongoose.Types.ObjectId.isValid(teacherId)) {
    return next(new ErrorResponse('Invalid course or teacher ID format', 400));
  }

  const course = await Course.findById(courseId);
  if (!course) {
    return next(new ErrorResponse(`Course not found with ID ${courseId}`, 404));
  }

  const teacher = await User.findOne({ _id: teacherId, role: 'Teacher', status: 'active' });
  if (!teacher) {
    return next(new ErrorResponse(`Active teacher not found with ID ${teacherId}`, 404));
  }

  course.teacher = teacherId;
  await course.save();

  res.status(200).json({
    success: true,
    message: `Teacher ${teacher.firstName} ${teacher.lastName} assigned to course ${course.courseName}`,
    data: course,
  });
});

// @desc    Enroll a student in a course
// @route   PUT /api/v1/courses/:courseId/enroll-student
// @access  Private/Admin, Teacher (assigned teacher only)
exports.enrollStudent = asyncHandler(async (req, res, next) => {
    const { courseId } = req.params;
    const { studentId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(courseId) || !mongoose.Types.ObjectId.isValid(studentId)) {
        return next(new ErrorResponse('Invalid course or student ID format', 400));
    }

    const course = await Course.findById(courseId);
    if (!course) {
        return next(new ErrorResponse(`Course not found with ID ${courseId}`, 404));
    }

    // Authorization: Only assigned teacher or admin can enroll students
    if (req.user.role === 'Teacher' && (!course.teacher || !course.teacher.equals(req.user.id))) {
        return next(new ErrorResponse('You are not authorized to enroll students in this course.', 403));
    }

    const student = await User.findOne({ _id: studentId, role: 'Student', status: 'active' });
    if (!student) {
        return next(new ErrorResponse(`Active student not found with ID ${studentId}`, 404));
    }

    // Check if student is already enrolled
    if (course.students.includes(studentId)) {
        return next(new ErrorResponse('Student is already enrolled in this course', 400));
    }

    course.students.push(studentId);
    await course.save();

    // Optionally, update the student's enrolledCourses array
    // This could also be handled by a virtual or separate logic to avoid circular dependencies
    // await Student.findByIdAndUpdate(studentId, { $push: { enrolledCourses: courseId } });

    res.status(200).json({
        success: true,
        message: `Student ${student.firstName} ${student.lastName} enrolled in course ${course.courseName}`,
        data: course,
    });
});

// @desc    Remove a student from a course
// @route   PUT /api/v1/courses/:courseId/unenroll-student
// @access  Private/Admin, Teacher (assigned teacher only)
exports.unenrollStudent = asyncHandler(async (req, res, next) => {
    const { courseId } = req.params;
    const { studentId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(courseId) || !mongoose.Types.ObjectId.isValid(studentId)) {
        return next(new ErrorResponse('Invalid course or student ID format', 400));
    }

    const course = await Course.findById(courseId);
    if (!course) {
        return next(new ErrorResponse(`Course not found with ID ${courseId}`, 404));
    }

    // Authorization: Only assigned teacher or admin can unenroll students
    if (req.user.role === 'Teacher' && (!course.teacher || !course.teacher.equals(req.user.id))) {
        return next(new ErrorResponse('You are not authorized to unenroll students from this course.', 403));
    }

    // Check if student is enrolled
    const initialLength = course.students.length;
    course.students = course.students.filter(
        (id) => id.toString() !== studentId
    );

    if (course.students.length === initialLength) {
        return next(new ErrorResponse('Student not found in this course', 404));
    }

    await course.save();

    // Optionally, update the student's enrolledCourses array
    // await Student.findByIdAndUpdate(studentId, { $pull: { enrolledCourses: courseId } });

    res.status(200).json({
        success: true,
        message: 'Student unenrolled successfully',
        data: course,
    });
});

// @desc    Upload course material
// @route   POST /api/v1/courses/:courseId/materials
// @access  Private/Admin, Teacher (assigned teacher only)
exports.uploadCourseMaterial = asyncHandler(async (req, res, next) => {
    const { courseId } = req.params;
    // Assuming file upload middleware (e.g., multer) has processed the file
    // and `req.file` contains file details (path, filename, etc.)
    if (!req.file) {
        return next(new ErrorResponse('No file uploaded', 400));
    }

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
        return next(new ErrorResponse('Invalid course ID format', 400));
    }

    const course = await Course.findById(courseId);
    if (!course) {
        return next(new ErrorResponse(`Course not found with ID ${courseId}`, 404));
    }

    // Authorization: Only assigned teacher or admin can upload materials
    if (req.user.role === 'Teacher' && (!course.teacher || !course.teacher.equals(req.user.id))) {
        return next(new ErrorResponse('You are not authorized to upload materials to this course.', 403));
    }

    const material = {
        fileName: req.file.originalname,
        filePath: req.file.path, // Store the path where the file is saved
        uploadedBy: req.user.id,
        uploadedAt: new Date(),
        // Add other relevant file metadata like mimetype, size
    };

    course.courseMaterials.push(material);
    await course.save();

    res.status(200).json({
        success: true,
        message: 'Course material uploaded successfully',
        data: course,
    });
});

// @desc    Remove course material
// @route   DELETE /api/v1/courses/:courseId/materials/:materialId
// @access  Private/Admin, Teacher (assigned teacher only)
exports.removeCourseMaterial = asyncHandler(async (req, res, next) => {
    const { courseId, materialId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId) || !mongoose.Types.ObjectId.isValid(materialId)) {
        return next(new ErrorResponse('Invalid course or material ID format', 400));
    }

    const course = await Course.findById(courseId);
    if (!course) {
        return next(new ErrorResponse(`Course not found with ID ${courseId}`, 404));
    }

    // Authorization: Only assigned teacher or admin can remove materials
    if (req.user.role === 'Teacher' && (!course.teacher || !course.teacher.equals(req.user.id))) {
        return next(new ErrorResponse('You are not authorized to remove materials from this course.', 403));
    }
    if (req.user.role === 'Admin' || (req.user.role === 'Teacher' && course.teacher.equals(req.user.id))) {
        const initialLength = course.courseMaterials.length;
        course.courseMaterials = course.courseMaterials.filter(
            (material) => material._id.toString() !== materialId
        );

        if (course.courseMaterials.length === initialLength) {
            return next(new ErrorResponse('Course material not found', 404));
        }

        await course.save();

        res.status(200).json({
            success: true,
            message: 'Course material removed successfully',
            data: course,
        });
    }
});