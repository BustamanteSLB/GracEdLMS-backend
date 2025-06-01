const express = require('express');
const {
  createStudent,
  getAllStudents,
  getStudent,
  updateStudent,
  deleteStudent,
  restoreStudent,
} = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// All student routes require login
router.use(protect);

// Admin-only routes
router
  .route('/')
  .post(authorize('Admin'), createStudent) // Create a student
  .get(authorize('Admin'), getAllStudents); // Get all students

router
  .route('/:id')
  .get(authorize('Admin'), getStudent) // Get a single student
  .put(authorize('Admin'), updateStudent) // Update a student
  .delete(authorize('Admin'), deleteStudent); // Soft delete a student

router
  .route('/:id/restore')
  .put(authorize('Admin'), restoreStudent); // Restore a soft-deleted student

module.exports = router;