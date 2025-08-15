const express = require("express");
const {
  createCourseMaterial,
  getCourseMaterialsForSubject,
  getCourseMaterial,
  deleteCourseMaterial,
} = require("../controllers/courseMaterialController");
const { protect, authorize } = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure Multer storage for course materials
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Use a temporary filename during upload, will be renamed to original later
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "temp-" + uniqueSuffix + "-" + file.originalname);
  },
});

// Create the multer upload middleware for multiple files
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit per file
    files: 10, // Maximum 10 files at once
  },
  fileFilter: (req, file, cb) => {
    console.log("File received:", file);

    // Only allow specific file types (added Excel files)
    const allowedMimes = [
      "application/pdf", // PDF
      "application/msword", // DOC
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
      "application/vnd.ms-powerpoint", // PPT
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
      "application/vnd.ms-excel", // XLS
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
      "image/jpeg", // JPEG
      "image/png", // PNG
      "image/gif", // GIF
      "image/jpg", // JPG
      "text/plain", // TXT
      "text/csv", // CSV
      "application/json", // JSON
      "text/html", // HTML
      "text/css", // CSS
      "text/javascript", // JS
      "application/javascript", // JS
    ];

    // Also check file extension as backup
    const allowedExtensions = [
      ".pdf",
      ".doc",
      ".docx",
      ".ppt",
      ".pptx",
      ".xls",
      ".xlsx",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".txt",
      ".csv",
      ".json",
      ".html",
      ".css",
      ".js",
      ".md",
      ".xml",
    ];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    if (
      allowedMimes.includes(file.mimetype) ||
      allowedExtensions.includes(fileExtension)
    ) {
      cb(null, true);
    } else {
      console.log("Rejected file:", file.originalname, "Type:", file.mimetype);
      cb(
        new Error(
          `Invalid file type: ${file.originalname}. Only PDF, Word, PowerPoint, Excel, image, and text files are allowed.`
        ),
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
        message: "File too large. Maximum size is 100MB per file.",
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum 10 files allowed at once.",
      });
    }
  }

  if (err.message && err.message.includes("Invalid file type")) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  next(err);
};

router.use(protect); // All routes require authentication

// Course Material Routes
router
  .route("/subjects/:subjectId/courseMaterials")
  .post(
    authorize("Teacher", "Admin"),
    upload.array("materialFiles", 10), // Allow up to 10 files
    handleMulterError,
    createCourseMaterial
  )
  .get(getCourseMaterialsForSubject);

// Single course material by ID
router
  .route("/courseMaterials/:id")
  .get(getCourseMaterial)
  .delete(authorize("Teacher", "Admin"), deleteCourseMaterial);

module.exports = router;
