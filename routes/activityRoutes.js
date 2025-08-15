const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
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

// Helper function to generate unique filename
const generateUniqueFilename = (originalName, uploadDir) => {
  const extension = path.extname(originalName);
  const nameWithoutExt = path.basename(originalName, extension);

  let finalName = originalName;
  let counter = 1;

  // Check if file exists and increment counter until we find a unique name
  while (fs.existsSync(path.join(uploadDir, finalName))) {
    finalName = `${nameWithoutExt} (${counter})${extension}`;
    counter++;
  }

  return finalName;
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    // Keep original filename, add suffix if file exists
    const uploadDir = "uploads/";
    const uniqueFilename = generateUniqueFilename(file.originalname, uploadDir);
    cb(null, uniqueFilename);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
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
    ];

    const allowedExtensions =
      /\.(pdf|doc|docx|ppt|pptx|txt|jpg|jpeg|png|gif)$/i;

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

// Routes
router.post(
  "/subjects/:subjectId/activities",
  protect,
  upload.single("attachment"),
  createActivity
);
router.get("/subjects/:subjectId/activities", protect, getActivitiesForSubject);
router.get("/activities/:activityId", protect, getActivity);
router.put(
  "/activities/:activityId",
  protect,
  upload.single("attachment"),
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
  upload.array("submissionAttachments"),
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
