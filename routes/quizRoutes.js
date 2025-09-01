const express = require("express");
const {
  createQuiz,
  getQuizzes,
  getQuiz,
  updateQuiz,
  deleteQuiz,
  publishQuiz,
  archiveQuiz,
  duplicateQuiz,
  getQuizSubmissions,
  submitQuizResponse,
  gradeQuizSubmission,
  getQuizStatistics,
  generateAIQuiz,
} = require("../controllers/quizController");
const { protect, authorize } = require("../middleware/authMiddleware");
const multer = require("multer");

const router = express.Router();

// Configure Multer for memory storage (Firebase doesn't need disk storage)
const storage = multer.memoryStorage();

// Configure Multer for quiz question images
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 20, // Maximum 20 images
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// Configure Multer for document uploads (AI quiz generation)
const uploadDoc = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for documents
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Only PDF, Word, PowerPoint, and text files are allowed"),
        false
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
        message:
          "File too large. Maximum size is 5MB for images, 10MB for documents.",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum 20 images allowed.",
      });
    }
  }

  if (
    err.message &&
    (err.message.includes("Only image files") ||
      err.message.includes("Only PDF, Word"))
  ) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  next(err);
};

router.use(protect);

// AI Quiz Generation route
router.post(
  "/generate-ai",
  authorize("Teacher", "Admin"),
  uploadDoc.single("document"),
  handleMulterError,
  generateAIQuiz
);

// Quiz CRUD routes
router
  .route("/")
  .get(getQuizzes)
  .post(
    authorize("Teacher", "Admin"),
    upload.array("questionImages", 20),
    handleMulterError,
    createQuiz
  );

router
  .route("/:id")
  .get(getQuiz)
  .put(
    authorize("Teacher", "Admin"),
    upload.array("questionImages", 20),
    handleMulterError,
    updateQuiz
  )
  .delete(authorize("Teacher", "Admin"), deleteQuiz);

// Quiz actions
router.put("/:id/publish", authorize("Teacher", "Admin"), publishQuiz);
router.put("/:id/archive", authorize("Teacher", "Admin"), archiveQuiz);
router.post("/:id/duplicate", authorize("Teacher", "Admin"), duplicateQuiz);

// Quiz submissions
router.get(
  "/:id/submissions",
  authorize("Teacher", "Admin"),
  getQuizSubmissions
);
router.post("/:id/submit", authorize("Student"), submitQuizResponse);
router.put(
  "/submissions/:submissionId/grade",
  authorize("Teacher", "Admin"),
  gradeQuizSubmission
);

// Quiz statistics
router.get("/:id/statistics", authorize("Teacher", "Admin"), getQuizStatistics);

module.exports = router;
