const express = require("express");
const multer = require("multer");
const {
  createActivity,
  getActivitiesForSubject,
  getActivity,
  updateActivity,
  deleteActivity,
  turnInActivity,
  undoTurnInActivity,
  getAllSubmissionsForActivity,
  getStudentGradeForActivity,
} = require("../controllers/activityController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// Configure Multer for memory storage (Firebase doesn't need disk storage)
const storage = multer.memoryStorage();

// Configure Multer for activity attachments
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10, // Maximum 10 files for submissions
  },
  fileFilter: function (req, file, cb) {
    console.log("📁 File filter check:", {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });

    const allowedMimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    const allowedExtensions =
      /\.(pdf|doc|docx|ppt|pptx|txt|jpg|jpeg|png|gif|webp)$/i;

    const mimetypeAllowed = allowedMimeTypes.includes(file.mimetype);
    const extensionAllowed = allowedExtensions.test(file.originalname);

    if (mimetypeAllowed || extensionAllowed) {
      console.log("✅ File accepted:", file.originalname);
      return cb(null, true);
    } else {
      console.log(
        "❌ File rejected:",
        file.originalname,
        "mimetype:",
        file.mimetype
      );
      cb(
        new Error(
          `File type not allowed. Allowed types: ${allowedMimeTypes.join(", ")}`
        )
      );
    }
  },
});

// Middleware to handle multer errors
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 50MB.",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum 10 files allowed.",
      });
    }
  }

  if (err.message && err.message.includes("File type not allowed")) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  next(err);
};

// Routes
router.post(
  "/subjects/:subjectId/activities",
  protect,
  upload.single("attachment"),
  handleMulterError,
  createActivity
);
router.get("/subjects/:subjectId/activities", protect, getActivitiesForSubject);
router.get("/activities/:activityId", protect, getActivity);
router.put(
  "/activities/:activityId",
  protect,
  upload.single("attachment"),
  handleMulterError,
  updateActivity
);
router.delete("/activities/:activityId", protect, deleteActivity);

// Student submission routes
router.get(
  "/activities/:activityId/student-grade",
  protect,
  getStudentGradeForActivity
);
router.post(
  "/activities/:activityId/turn-in",
  protect,
  upload.array("submissionAttachments", 10),
  handleMulterError,
  turnInActivity
);
router.post(
  "/activities/:activityId/undo-turn-in",
  protect,
  undoTurnInActivity
);

// Admin/Teacher route to view submissions
router.get(
  "/activities/:activityId/submissions",
  protect,
  getAllSubmissionsForActivity
);

// Route to get student grades for a specific subject
router.get(
  "/subjects/:subjectId/students/:studentId/grades",
  protect,
  async (req, res) => {
    try {
      const { subjectId, studentId } = req.params;

      // Verify access permissions
      if (req.user.role === "Student" && req.user.id !== studentId) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to view these grades",
        });
      }

      const Grade = require("../models/Grade");

      // Find grades for the subject with proper population and null checking
      const grades = await Grade.find({
        subject: subjectId,
        student: studentId,
      })
        .populate({
          path: "activity",
          select: "title _id",
          match: { _id: { $ne: null } }, // Only include grades where activity exists
        })
        .populate("gradedBy", "firstName middleName lastName")
        .populate("subject", "subjectName");

      // Filter out any grades where activity is null (in case of deleted activities)
      const validGrades = grades.filter((grade) => grade.activity !== null);

      res.status(200).json({
        success: true,
        count: validGrades.length,
        data: validGrades,
      });
    } catch (error) {
      console.error("Error fetching student grades:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch grades",
        data: [],
      });
    }
  }
);

module.exports = router;
