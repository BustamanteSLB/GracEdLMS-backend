const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  getSchoolInfo,
  getSchoolStats,
  updateSchoolInfo,
  uploadSchoolImage,
  uploadMultipleGalleryImages,
  uploadGalleryVideo,
  deleteGalleryImage,
  deleteGalleryVideo,
} = require("../controllers/schoolController");

const { protect, authorize } = require("../middleware/authMiddleware");

// Configure multer for memory storage
const storage = multer.memoryStorage();

// Image upload configuration
const imageUpload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit per file
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images are allowed"), false);
    }
  },
});

// Video upload configuration
const videoUpload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit per file
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "video/mp4",
      "video/mpeg",
      "video/quicktime",
      "video/x-msvideo",
      "video/webm",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only videos are allowed"), false);
    }
  },
});

// Public route
router.get("/", getSchoolInfo);

// Admin-only routes
router.get(
  "/stats",
  protect,
  authorize("Admin", "Teacher", "Student"),
  getSchoolStats,
);
router.put("/", protect, authorize("Admin"), updateSchoolInfo);
router.post(
  "/upload",
  protect,
  authorize("Admin"),
  imageUpload.single("image"),
  uploadSchoolImage,
);
router.post(
  "/upload-multiple",
  protect,
  authorize("Admin"),
  imageUpload.array("images", 10), // Allow up to 10 images at once
  uploadMultipleGalleryImages,
);
router.post(
  "/upload-video",
  protect,
  authorize("Admin"),
  videoUpload.single("video"),
  uploadGalleryVideo,
);
router.delete(
  "/gallery/:imageId",
  protect,
  authorize("Admin"),
  deleteGalleryImage,
);
router.delete(
  "/gallery/video/:videoId",
  protect,
  authorize("Admin"),
  deleteGalleryVideo,
);

module.exports = router;
