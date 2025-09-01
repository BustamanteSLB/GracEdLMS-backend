const express = require("express");
const {
  getTeacherAnalytics,
  getStudentAnalytics,
  getAdminAnalytics,
  getSubjectGrades,
  getGradeStudentDetails,
} = require("../controllers/analyticsController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

// Teacher analytics dashboard
router.get(
  "/teacher-dashboard",
  authorize("Teacher", "Admin"),
  getTeacherAnalytics
);

// Student analytics dashboard
router.get(
  "/student-dashboard",
  authorize("Student", "Admin"),
  getStudentAnalytics
);

// Admin analytics dashboard
router.get("/admin-dashboard", authorize("Admin"), getAdminAnalytics);

// Grade student details
router.get(
  "/grade-students/:gradeLevel",
  authorize("Admin"),
  getGradeStudentDetails
);

// Subject grades for analytics
router.get(
  "/subjects/:subjectId/grades",
  authorize("Teacher", "Admin"),
  getSubjectGrades
);

module.exports = router;
