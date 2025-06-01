const mongoose = require('mongoose');
const Activity = require('../models/Activity');
const Course = require('../models/Course');
const Grade = require('../models/Grade'); // For when deleting activities
const asyncHandler = require('../utils/asyncHandler');
const { ErrorResponse } = require('../utils/errorResponse');

// @desc    Create an activity for a course
// @route   POST /api/v1/courses/:courseId/activities
// @access  Private/Teacher (assigned to the course) or Private/Admin
exports.createActivity = asyncHandler(async (req, res, next) => {
    const { courseId } = req.params;
    const { title, description, dueDate, maxPoints } = req.body;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
        return next(new ErrorResponse(`Invalid course ID format: ${courseId}`, 400));
    }
    if (!title) {
        return next(new ErrorResponse('Activity title is required', 400));
    }

    const course = await Course.findById(courseId);
    if (!course) {
        return next(new ErrorResponse(`Course not found with ID ${courseId}`, 404));
    }

    // Authorization: Only assigned teacher or admin can create activities
    if (req.user.role === 'Teacher' && (!course.teacher || course.teacher.toString() !== req.user.id.toString())) {
        return next(new ErrorResponse('You are not authorized to create activities for this course.', 403));
    }
    // Admin can create for any course

    const activityData = { title, description, dueDate, maxPoints, course: courseId };
    const activity = await Activity.create(activityData);

    // Add activity to course's activities array
    await Course.findByIdAndUpdate(courseId, { $addToSet: { activities: activity._id } });

    res.status(201).json({
        success: true,
        data: activity,
    });
});

// @desc    Get all activities for a course
// @route   GET /api/v1/courses/:courseId/activities
// @access  Private (Enrolled Students, Assigned Teacher, Admin)
exports.getActivitiesForCourse = asyncHandler(async (req, res, next) => {
    const { courseId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
        return next(new ErrorResponse(`Invalid course ID format: ${courseId}`, 400));
    }

    const course = await Course.findById(courseId);
    if (!course) {
        return next(new ErrorResponse(`Course not found with ID ${courseId}`, 404));
    }

    // Authorization: Student must be enrolled, Teacher assigned, or Admin
    const isEnrolledStudent = req.user.role === 'Student' && course.students.some(s => s.equals(req.user.id));
    const isAssignedTeacher = req.user.role === 'Teacher' && course.teacher && course.teacher.equals(req.user.id);
    const isAdmin = req.user.role === 'Admin';

    if (!isEnrolledStudent && !isAssignedTeacher && !isAdmin) {
        return next(new ErrorResponse('You are not authorized to view activities for this course.', 403));
    }

    const activities = await Activity.find({ course: courseId }).sort({ dueDate: 1, createdAt: 1 });

    res.status(200).json({
        success: true,
        count: activities.length,
        data: activities,
    });
});

// @desc    Get a single activity by ID
// @route   GET /api/v1/activities/:activityId
// @access  Private (Enrolled Students, Assigned Teacher, Admin of the course activity belongs to)
exports.getActivity = asyncHandler(async (req, res, next) => {
    const { activityId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(activityId)) {
        return next(new ErrorResponse(`Invalid activity ID format: ${activityId}`, 400));
    }

    const activity = await Activity.findById(activityId).populate({ path: 'course', select: 'students teacher' });
    if (!activity) {
        return next(new ErrorResponse(`Activity not found with ID ${activityId}`, 404));
    }

    // Authorization (similar to getActivitiesForCourse using populated course data)
    const course = activity.course;
    const isEnrolledStudent = req.user.role === 'Student' && course.students.some(s => s.equals(req.user.id));
    const isAssignedTeacher = req.user.role === 'Teacher' && course.teacher && course.teacher.equals(req.user.id);
    const isAdmin = req.user.role === 'Admin';

    if (!isEnrolledStudent && !isAssignedTeacher && !isAdmin) {
        return next(new ErrorResponse('You are not authorized to view this activity.', 403));
    }

    res.status(200).json({
        success: true,
        data: activity,
    });
});

// @desc    Update an activity
// @route   PUT /api/v1/activities/:activityId
// @access  Private/Teacher (assigned to course) or Private/Admin
exports.updateActivity = asyncHandler(async (req, res, next) => {
    const { activityId } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(activityId)) {
        return next(new ErrorResponse(`Invalid activity ID format: ${activityId}`, 400));
    }

    const activity = await Activity.findById(activityId).populate('course', 'teacher');
    if (!activity) {
        return next(new ErrorResponse(`Activity not found with ID ${activityId}`, 404));
    }

    // Authorization
    if (req.user.role === 'Teacher' && (!activity.course.teacher || !activity.course.teacher.equals(req.user.id))) {
        return next(new ErrorResponse('You are not authorized to update this activity.', 403));
    }

    // Prevent changing the course of an activity
    if (updateData.course && updateData.course.toString() !== activity.course._id.toString()) {
        return next(new ErrorResponse('Cannot change the course an activity belongs to.', 400));
    }
    delete updateData.course; // Remove it from updateData to be safe

    const updatedActivity = await Activity.findByIdAndUpdate(activityId, updateData, {
        new: true,
        runValidators: true,
    });

    res.status(200).json({
        success: true,
        data: updatedActivity,
    });
});

// @desc    Delete an activity
// @route   DELETE /api/v1/activities/:activityId
// @access  Private/Teacher (assigned to course) or Private/Admin
exports.deleteActivity = asyncHandler(async (req, res, next) => {
    const { activityId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(activityId)) {
        return next(new ErrorResponse(`Invalid activity ID format: ${activityId}`, 400));
    }

    const activity = await Activity.findById(activityId).populate('course', 'teacher');
    if (!activity) {
        return next(new ErrorResponse(`Activity not found with ID ${activityId}`, 404));
    }

    // Authorization
    if (req.user.role === 'Teacher' && (!activity.course.teacher || !activity.course.teacher.equals(req.user.id))) {
        return next(new ErrorResponse('You are not authorized to delete this activity.', 403));
    }

    // Remove activity from course's activities array
    await Course.findByIdAndUpdate(activity.course._id, { $pull: { activities: activity._id } });

    // Delete related grades for this activity
    await Grade.deleteMany({ activity: activity._id });

    await activity.deleteOne();

    res.status(200).json({
        success: true,
        message: 'Activity and related grades deleted successfully',
        data: {},
    });
});