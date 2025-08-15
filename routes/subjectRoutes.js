const express = require('express');
const {
  createSubject,
  getAllSubjects,
  getSubject,
  updateSubject,
  deleteSubject,
  restoreSubject,
  permanentDeleteSubject,
  assignTeacher,
  unassignTeacher,
  enrollStudent,
  unenrollStudent,
  bulkEnrollStudents,
} = require('../controllers/subjectController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .post(authorize('Admin', 'Teacher'), createSubject)
  .get(getAllSubjects);

router
  .route('/:id')
  .get(getSubject)
  .put(authorize('Admin', 'Teacher'), updateSubject)
  .delete(authorize('Admin', 'Teacher'), deleteSubject);

// Archive management routes
router.put('/:id/restore', authorize('Admin'), restoreSubject);
router.delete('/:id/permanent', authorize('Admin'), permanentDeleteSubject);

router.put('/:subjectId/assign-teacher', authorize('Admin'), assignTeacher);
router.put('/:subjectId/unassign-teacher', authorize('Admin'), unassignTeacher);
router.put('/:subjectId/enroll-student', authorize('Admin', 'Teacher'), enrollStudent);
router.put('/:subjectId/unenroll-student/:studentIdentifier', authorize('Admin', 'Teacher', 'Student'), unenrollStudent);
router.put('/:subjectId/bulk-enroll-students', authorize('Admin', 'Teacher'), bulkEnrollStudents);

module.exports = router;