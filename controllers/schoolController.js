const School = require("../models/School");
const path = require("path");
const { bucket } = require("../config/firebaseService");
const sharp = require("sharp"); // Add this at the top
const User = require("../models/User");

// @desc    Get school information
// @route   GET /api/v1/school
// @access  Public
exports.getSchoolInfo = async (req, res, next) => {
  try {
    let school = await School.findOne().populate(
      "lastUpdatedBy",
      "firstName lastName email",
    );

    // If no school exists, create default one
    if (!school) {
      school = await School.create({
        links: [
          {
            label: "GCCS Website",
            url: "https://vimeo.com/gccsphilippines",
            description: "Visit our official website",
            icon: "web",
          },
          {
            label: "GCCS Facebook Page",
            url: "https://www.facebook.com/GCCSPhilippines/",
            description: "Follow us on Facebook",
            icon: "facebook",
          },
          {
            label: "GCCS Learn",
            url: "https://schoollearn.com",
            description: "Access learning resources",
            icon: "education",
          },
          {
            label: "GCCS Mail",
            url: "mailto:gccspasay@yahoo.com",
            description: "Contact us via email",
            icon: "email",
          },
        ],
      });
    }

    res.status(200).json({
      success: true,
      data: school,
    });
  } catch (error) {
    console.error("Error fetching school info:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch school information",
    });
  }
};

// @desc    Update school information
// @route   PUT /api/v1/school
// @access  Private (Admin only)
exports.updateSchoolInfo = async (req, res, next) => {
  try {
    const updateData = { ...req.body };
    updateData.lastUpdatedBy = req.user._id;
    updateData.updatedAt = Date.now();

    let school = await School.findOne();

    if (!school) {
      school = await School.create(updateData);
    } else {
      school = await School.findOneAndUpdate({}, updateData, {
        new: true,
        runValidators: true,
      });
    }

    await school.populate("lastUpdatedBy", "firstName lastName email");

    res.status(200).json({
      success: true,
      data: school,
      message: "School information updated successfully",
    });
  } catch (error) {
    console.error("Error updating school info:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update school information",
    });
  }
};

// Helper function to delete file from Firebase
const deleteFromFirebase = async (fileUrl) => {
  try {
    if (!fileUrl) return;

    // Extract file path from URL
    // Firebase URLs are in format: https://firebasestorage.googleapis.com/.../school%2Ffilename.jpg?...
    const filePathMatch = fileUrl.match(/school%2F([^?]+)/);
    if (!filePathMatch) {
      console.log("Could not extract file path from URL");
      return;
    }

    const fileName = decodeURIComponent(filePathMatch[1]);
    const filePath = `school/${fileName}`;

    const file = bucket.file(filePath);
    await file.delete();
    console.log(`Successfully deleted file from Firebase: ${filePath}`);
  } catch (error) {
    console.error("Error deleting file from Firebase:", error);
    // Don't throw error - continue with database update even if file deletion fails
  }
};

// @desc    Upload school image (logo, hero, gallery)
// @route   POST /api/v1/school/upload
// @access  Private (Admin only)
exports.uploadSchoolImage = async (req, res, next) => {
  try {
    // Check if file was uploaded via multer
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file was uploaded",
      });
    }

    const { imageType, caption } = req.body; // 'logo', 'hero', or 'gallery'
    const file = req.file; // multer stores file in req.file

    // Validate imageType
    if (!["logo", "hero", "gallery"].includes(imageType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image type. Must be 'logo', 'hero', or 'gallery'",
      });
    }

    // Convert image to WebP
    const webpBuffer = await sharp(file.buffer)
      .webp({ quality: 80 })
      .toBuffer();

    // Create unique filename with .webp extension
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const filename = `school_${imageType}_${timestamp}_${randomString}.webp`;
    const filePath = `school/${filename}`;

    // Upload to Firebase Storage
    const firebaseFile = bucket.file(filePath);

    await firebaseFile.save(webpBuffer, {
      metadata: {
        contentType: "image/webp",
      },
      public: true,
    });

    // Get public URL
    const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${
      bucket.name
    }/o/${encodeURIComponent(filePath)}?alt=media`;

    // Update school document
    let school = await School.findOne();
    if (!school) {
      school = await School.create({});
    }

    if (imageType === "logo") {
      // Delete old logo from Firebase if exists
      if (school.logoUrl) {
        await deleteFromFirebase(school.logoUrl);
      }
      school.logoUrl = fileUrl;
    } else if (imageType === "hero") {
      // Delete old hero image from Firebase if exists
      if (school.heroImageUrl) {
        await deleteFromFirebase(school.heroImageUrl);
      }
      school.heroImageUrl = fileUrl;
    } else if (imageType === "gallery") {
      school.galleryImages.push({
        url: fileUrl,
        caption: caption || "",
        uploadedAt: Date.now(),
      });
    }

    school.lastUpdatedBy = req.user._id;
    school.updatedAt = Date.now();
    await school.save();

    res.status(200).json({
      success: true,
      data: {
        url: fileUrl,
        type: imageType,
      },
      message: "Image uploaded successfully",
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload image",
    });
  }
};

// @desc    Upload multiple gallery images and convert to WebP
// @route   POST /api/v1/school/upload-multiple
// @access  Private (Admin only)
exports.uploadMultipleGalleryImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files were uploaded",
      });
    }

    const files = req.files;
    const uploadedImages = [];
    const failedUploads = [];

    let school = await School.findOne();
    if (!school) {
      school = await School.create({});
    }

    // Check gallery limit
    const currentGalleryCount = school.galleryImages.length;
    const availableSlots = 10 - currentGalleryCount;

    if (availableSlots <= 0) {
      return res.status(400).json({
        success: false,
        message: "Gallery limit reached. Maximum 10 images allowed.",
      });
    }

    if (files.length > availableSlots) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableSlots} more image(s) can be uploaded. Maximum 10 images allowed.`,
      });
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        // Convert image to WebP
        const webpBuffer = await sharp(file.buffer)
          .webp({ quality: 80 })
          .toBuffer();

        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        const filename = `school_gallery_${timestamp}_${i}_${randomString}.webp`;
        const filePath = `school/${filename}`;

        const firebaseFile = bucket.file(filePath);

        await firebaseFile.save(webpBuffer, {
          metadata: {
            contentType: "image/webp",
          },
          public: true,
        });

        const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${
          bucket.name
        }/o/${encodeURIComponent(filePath)}?alt=media`;

        school.galleryImages.push({
          url: fileUrl,
          caption: "",
          uploadedAt: Date.now(),
        });

        uploadedImages.push({
          originalName: file.originalname,
          url: fileUrl,
        });
      } catch (error) {
        console.error(`Error uploading file ${file.originalname}:`, error);
        failedUploads.push({
          originalName: file.originalname,
          error: error.message,
        });
      }
    }

    school.lastUpdatedBy = req.user._id;
    school.updatedAt = Date.now();
    await school.save();

    const response = {
      success: uploadedImages.length > 0,
      data: {
        uploadedCount: uploadedImages.length,
        failedCount: failedUploads.length,
        uploadedImages,
        remainingSlots: 10 - school.galleryImages.length,
      },
      message:
        uploadedImages.length === files.length
          ? `Successfully uploaded ${uploadedImages.length} image(s)`
          : `Uploaded ${uploadedImages.length} of ${files.length} image(s). ${failedUploads.length} failed.`,
    };

    if (failedUploads.length > 0) {
      response.data.failedUploads = failedUploads;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("Error uploading multiple images:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload images",
    });
  }
};

// @desc    Upload gallery video
// @route   POST /api/v1/school/upload-video
// @access  Private (Admin only)
exports.uploadGalleryVideo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file was uploaded",
      });
    }

    const { caption } = req.body;
    const file = req.file;

    let school = await School.findOne();
    if (!school) {
      school = await School.create({});
    }

    // Check video limit (max 5)
    const currentVideoCount = school.galleryVideos
      ? school.galleryVideos.length
      : 0;
    if (currentVideoCount >= 5) {
      return res.status(400).json({
        success: false,
        message: "Video limit reached. Maximum 5 videos allowed.",
      });
    }

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const extension = path.extname(file.originalname);
    const filename = `school_video_${timestamp}_${randomString}${extension}`;
    const filePath = `school/${filename}`;

    const firebaseFile = bucket.file(filePath);

    await firebaseFile.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
      public: true,
    });

    const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${
      bucket.name
    }/o/${encodeURIComponent(filePath)}?alt=media`;

    // Initialize galleryVideos array if it doesn't exist
    if (!school.galleryVideos) {
      school.galleryVideos = [];
    }

    school.galleryVideos.push({
      url: fileUrl,
      caption: caption || "",
      uploadedAt: Date.now(),
    });

    school.lastUpdatedBy = req.user._id;
    school.updatedAt = Date.now();
    await school.save();

    res.status(200).json({
      success: true,
      data: {
        url: fileUrl,
        caption: caption || "",
        remainingSlots: 5 - school.galleryVideos.length,
      },
      message: "Video uploaded successfully",
    });
  } catch (error) {
    console.error("Error uploading video:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload video",
    });
  }
};

// @desc    Delete gallery image
// @route   DELETE /api/v1/school/gallery/:imageId
// @access  Private (Admin only)
exports.deleteGalleryImage = async (req, res, next) => {
  try {
    const { imageId } = req.params;

    const school = await School.findOne();
    if (!school) {
      return res.status(404).json({
        success: false,
        message: "School information not found",
      });
    }

    const image = school.galleryImages.id(imageId);
    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // Delete file from Firebase Storage
    await deleteFromFirebase(image.url);

    // Remove from database
    school.galleryImages.pull(imageId);
    school.lastUpdatedBy = req.user._id;
    school.updatedAt = Date.now();
    await school.save();

    res.status(200).json({
      success: true,
      message: "Gallery image deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting gallery image:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete gallery image",
    });
  }
};

// @desc    Delete gallery video
// @route   DELETE /api/v1/school/gallery/video/:videoId
// @access  Private (Admin only)
exports.deleteGalleryVideo = async (req, res, next) => {
  try {
    const { videoId } = req.params;

    const school = await School.findOne();
    if (!school) {
      return res.status(404).json({
        success: false,
        message: "School information not found",
      });
    }

    if (!school.galleryVideos) {
      return res.status(404).json({
        success: false,
        message: "Video not found",
      });
    }

    const video = school.galleryVideos.id(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video not found",
      });
    }

    await deleteFromFirebase(video.url);

    school.galleryVideos.pull(videoId);
    school.lastUpdatedBy = req.user._id;
    school.updatedAt = Date.now();
    await school.save();

    res.status(200).json({
      success: true,
      message: "Gallery video deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting gallery video:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete gallery video",
    });
  }
};

// @desc    Get school statistics
// @route   GET /api/v1/school/stats
// @access  Public
exports.getSchoolStats = async (req, res, next) => {
  try {
    const [studentCount, teacherCount] = await Promise.all([
      User.countDocuments({ role: "Student", status: "active" }),
      User.countDocuments({ role: "Teacher", status: "active" }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        studentCount,
        teacherCount,
      },
    });
  } catch (error) {
    console.error("Error fetching school stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch school statistics",
    });
  }
};
