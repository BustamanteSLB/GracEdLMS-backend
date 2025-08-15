const express = require('express');
const {
    gradeActivity,
    getStudentGradesForSubject,
    getActivityGrades,
    updateGrade,
    deleteGrade,
    getStudentActivityGradesOverview // New import
} = require('../controllers/gradeController');

const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Activity-based grade routes
router.route('/activities/:activityId/grades')
    .post(protect, authorize('Teacher', 'Admin'), gradeActivity)
    .get(protect, authorize('Teacher', 'Admin'), getActivityGrades);

// Subject-based grade routes
router.route('/subjects/:subjectId/students/:studentId/grades')
    .get(protect, authorize('Student', 'Teacher', 'Admin'), getStudentGradesForSubject);

// New route for student's overall grade overview
router.route('/students/:studentId/grades-overview')
    .get(protect, authorize('Student', 'Admin'), getStudentActivityGradesOverview); // Only student or Admin can view their overview

// Individual grade routes
router.route('/grades/:gradeId')
    .put(protect, authorize('Teacher', 'Admin'), updateGrade)
    .delete(protect, authorize('Teacher', 'Admin'), deleteGrade);

module.exports = router;
