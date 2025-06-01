const mongoose = require('mongoose');
const Grade = require('../models/Grade');
const Activity = require('../models/Activity');
const Course = require('../models/Course');
const Student = require('../models/Student');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { ErrorResponse } = require('../utils/errorResponse');

// @desc    Grade an activity for a student
// @route   POST /api/v1/activities/:activityId/grades
// @access  Private/Teacher (assigned to the course of the activity) or Private/Admin
exports.gradeActivity = asyncHandler(async (req, res, next) => {
    const { activityId } = req.params;
    const { studentId, score, comments } = req.body;

    if (!mongoose.Types.ObjectId.isValid(activityId)) {
        return next(new ErrorResponse(`Invalid activity ID format: ${activityId}`, 400));
    }
    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
        return next(new ErrorResponse('Student ID is required and must be valid', 400));
    }
    if (score === undefined || typeof score !== 'number') { // Score can be 0
        return next(new ErrorResponse('Score is required and must be a number', 400));
    }

    const activity = await Activity.findById(activityId).populate('course');
    if (!activity) {
        return next(new ErrorResponse(`Activity not found with ID ${activityId}`, 404));
    }
    const course = activity.course;

    // Authorization: Only assigned teacher or admin can grade
    if (req.user.role === 'Teacher' && (!course.teacher || !course.teacher.equals(req.user.id))) {
        return next(new ErrorResponse('You are not authorized to grade activities for this course.', 403));
    }

    const student = await User.findOne({ _id: studentId, role: 'Student' });
    if (!student) {
        return next(new ErrorResponse(`Student not found with ID ${studentId}`, 404));
    }

    // Check if student is enrolled in the course
    if (!course.students.some(s => s.equals(studentId))) {
        return next(new ErrorResponse(`Student ${student.firstName} ${student.lastName} is not enrolled in course ${course.courseName}.`, 400));
    }

    if (score < 0 || (activity.maxPoints && score > activity.maxPoints)) {
        return next(new ErrorResponse(`Score must be between 0 and ${activity.maxPoints || 'the maximum allowed'}.`, 400));
    }

    // Upsert: Create or update grade
    const gradeData = {
        student: studentId,
        activity: activityId,
        course: course._id,
        score,
        comments,
        gradedBy: req.user.id,
    };

    const grade = await Grade.findOneAndUpdate(
        { student: studentId, activity: activityId },
        gradeData,
        { new: true, upsert: true, runValidators: true }
    );

    res.status(201).json({
        success: true,
        data: grade,
    });
});

// @desc    Get grades for a specific student in a specific course
// @route   GET /api/v1/courses/:courseId/students/:studentId/grades
// @access  Private (Student themselves, Assigned Teacher, Admin)
exports.getStudentGradesForCourse = asyncHandler(async (req, res, next) => {
    const { courseId, studentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId) || !mongoose.Types.ObjectId.isValid(studentId)) {
        return next(new ErrorResponse('Invalid course or student ID format', 400));
    }

    const course = await Course.findById(courseId);
    if (!course) return next(new ErrorResponse('Course not found', 404));

    const student = await User.findById(studentId);
    if (!student || student.role !== 'Student') return next(new ErrorResponse('Student not found', 404));

    // Authorization
    const isStudentOwner = req.user.id.equals(studentId);
    const isAssignedTeacher = req.user.role === 'Teacher' && course.teacher && course.teacher.equals(req.user.id);
    const isAdmin = req.user.role === 'Admin';

    if (!isStudentOwner && !isAssignedTeacher && !isAdmin) {
        return next(new ErrorResponse('Not authorized to view these grades.', 403));
    }

    const grades = await Grade.find({ student: studentId, course: courseId })
        .populate({ path: 'activity', select: 'title maxPoints dueDate' })
        .populate({ path: 'gradedBy', select: 'firstName lastName' })
        .sort({ 'activity.dueDate': 1 });

    res.status(200).json({
        success: true,
        count: grades.length,
        data: grades,
    });
});

// @desc    Get all grades for a specific activity (for teacher/admin view)
// @route   GET /api/v1/activities/:activityId/grades
// @access  Private (Assigned Teacher, Admin)
exports.getActivityGrades = asyncHandler(async (req, res, next) => {
    const { activityId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(activityId)) {
        return next(new ErrorResponse('Invalid activity ID format', 400));
    }

    const activity = await Activity.findById(activityId).populate('course');
    if (!activity) return next(new ErrorResponse('Activity not found', 404));

    // Authorization
    const isAssignedTeacher = req.user.role === 'Teacher' && activity.course.teacher && activity.course.teacher.equals(req.user.id);
    const isAdmin = req.user.role === 'Admin';

    if (!isAssignedTeacher && !isAdmin) {
        return next(new ErrorResponse('Not authorized to view grades for this activity.', 403));
    }

    const grades = await Grade.find({ activity: activityId })
        .populate({ path: 'student', select: 'firstName lastName email username userId' })
        .populate({ path: 'gradedBy', select: 'firstName lastName' })
        .sort({ 'student.lastName': 1 });

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
    const { score, comments } = req.body;

    if (!mongoose.Types.ObjectId.isValid(gradeId)) {
        return next(new ErrorResponse('Invalid grade ID format', 400));
    }

    let grade = await Grade.findById(gradeId).populate('activity');
    if (!grade) return next(new ErrorResponse('Grade not found', 404));

    // Authorization: Original grader or Admin
    const isOriginalGrader = grade.gradedBy && grade.gradedBy.equals(req.user.id);
    const isAdmin = req.user.role === 'Admin';

    if (!isOriginalGrader && !isAdmin) {
        return next(new ErrorResponse('Not authorized to update this grade.', 403));
    }

    if (score !== undefined) {
        if (typeof score !== 'number' || score < 0 || (grade.activity.maxPoints && score > grade.activity.maxPoints)) {
            return next(new ErrorResponse(`Score must be a number between 0 and ${grade.activity.maxPoints || 'max'}.`, 400));
        }
        grade.score = score;
    }
    if (comments !== undefined) {
        grade.comments = comments;
    }
    grade.gradedBy = req.user.id; // Update who last graded/modified

    await grade.save();

    res.status(200).json({
        success: true,
        data: grade,
    });
});