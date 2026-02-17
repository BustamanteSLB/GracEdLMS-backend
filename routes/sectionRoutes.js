const express = require("express");
const {
  createSection,
  getAllSections,
  getSection,
  updateSection,
  deleteSection,
  addStudentsToSection,
  removeStudentFromSection,
} = require("../controllers/sectionController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.route("/").post(authorize("Admin"), createSection).get(getAllSections);

router
  .route("/:id")
  .get(getSection)
  .put(authorize("Admin"), updateSection)
  .delete(authorize("Admin"), deleteSection);

router.put("/:id/add-students", authorize("Admin"), addStudentsToSection);
router.put(
  "/:id/remove-student/:studentId",
  authorize("Admin"),
  removeStudentFromSection,
);

module.exports = router;
