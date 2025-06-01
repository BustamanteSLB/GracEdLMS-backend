const express = require('express');
const {
  createCourse,
  getAllCourses,
  getCourse,
  updateCourse,
  deleteCourse,
  assignTeacher,
  enrollStudent,
} = require('../controllers/courseController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // All course routes require login

// Admin-only course management
router
  .route('/')
  .post(authorize('Admin', 'Teacher'), createCourse)
  .get(getAllCourses); // Allow all logged-in users to see courses

router
  .route('/:id')
  .get(getCourse) // Allow all logged-in users
  .put(authorize('Admin'), updateCourse)
  .delete(authorize('Admin'), deleteCourse);

router.put('/:id/assign-teacher', authorize('Admin'), assignTeacher);
router.put('/:id/enroll-student', authorize('Admin', 'Teacher'), enrollStudent);

module.exports = router;