const express = require("express");
const multer = require("multer");
const {
  createAnnouncement,
  getAnnouncementsForSubject,
  getAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} = require("../controllers/announcementController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

console.log("announcementRoutes.js loaded"); // Debug log

// All routes require authentication
router.use(protect);

// Announcements for a subject
router
  .route("/subjects/:subjectId/announcements")
  .post(
    authorize("Admin", "Teacher"),
    upload.array("images", 5),
    createAnnouncement
  )
  .get(getAnnouncementsForSubject);

// Single announcement by ID
router
  .route("/announcements/:id")
  .get(getAnnouncement)
  .put(
    authorize("Admin", "Teacher"),
    upload.array("images", 5),
    updateAnnouncement
  )
  .delete(authorize("Admin", "Teacher"), deleteAnnouncement);

module.exports = router;
