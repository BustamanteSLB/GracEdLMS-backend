const express = require('express');
const {
  createTeacher,
  getAllTeachers,
  getTeacher,
  updateTeacher,
  deleteTeacher,
  restoreTeacher,
} = require('../controllers/teacherController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// All teacher routes require login
router.use(protect);

// Admin-only routes
router
  .route('/')
  .post(authorize('Admin'), createTeacher) // Create a teacher
  .get(authorize('Admin'), getAllTeachers); // Get all teachers

router
  .route('/:id')
  .get(authorize('Admin'), getTeacher) // Get a single teacher
  .put(authorize('Admin'), updateTeacher) // Update a teacher
  .delete(authorize('Admin'), deleteTeacher); // Soft delete a teacher

router
  .route('/:id/restore')
  .put(authorize('Admin'), restoreTeacher); // Restore a soft-deleted teacher

module.exports = router;