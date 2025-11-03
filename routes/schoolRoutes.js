const express = require("express");
const router = express.Router();
const multer = require("multer");

const {
  getSchoolInfo,
  updateSchoolInfo,
  uploadSchoolImage,
  uploadMultipleGalleryImages,
  deleteGalleryImage,
} = require("../controllers/schoolController");

const { protect, authorize } = require("../middleware/authMiddleware");

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
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

// Public route
router.get("/", getSchoolInfo);

// Admin-only routes
router.put("/", protect, authorize("Admin"), updateSchoolInfo);
router.post(
  "/upload",
  protect,
  authorize("Admin"),
  upload.single("image"),
  uploadSchoolImage
);
router.post(
  "/upload-multiple",
  protect,
  authorize("Admin"),
  upload.array("images", 10), // Allow up to 10 images at once
  uploadMultipleGalleryImages
);
router.delete(
  "/gallery/:imageId",
  protect,
  authorize("Admin"),
  deleteGalleryImage
);

module.exports = router;
