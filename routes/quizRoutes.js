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
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../uploads/quiz-images");
const docsDir = path.join(__dirname, "../uploads/documents");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Configure Multer for quiz question images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename as specified
    cb(null, file.originalname);
  },
});

// Configure Multer for document uploads (AI quiz generation)
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, docsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
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

const uploadDoc = multer({
  storage: docStorage,
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

router.use(protect);

// AI Quiz Generation route
router.post(
  "/generate-ai",
  authorize("Teacher", "Admin"),
  uploadDoc.single("document"),
  generateAIQuiz
);

// Quiz CRUD routes
router
  .route("/")
  .get(getQuizzes)
  .post(
    authorize("Teacher", "Admin"),
    upload.array("questionImages", 20),
    createQuiz
  );

router
  .route("/:id")
  .get(getQuiz)
  .put(
    authorize("Teacher", "Admin"),
    upload.array("questionImages", 20),
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
