const mongoose = require("mongoose");
const CourseMaterial = require("../models/CourseMaterial");
const Subject = require("../models/Subject");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");
const { bucket } = require("../config/firebaseService");

// @desc    Upload course materials for a subject (multiple files)
// @route   POST /api/v1/subjects/:subjectId/courseMaterials
// @access  Private/Teacher (assigned to the subject) or Private/Admin
exports.createCourseMaterial = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;
  const uploadedFiles = req.files;

  console.log("Request files:", uploadedFiles);

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(
      new ErrorResponse(`Invalid subject ID format: ${subjectId}`, 400)
    );
  }

  if (!uploadedFiles || uploadedFiles.length === 0) {
    return next(new ErrorResponse("At least one file is required", 400));
  }

  const subject = await Subject.findById(subjectId);
  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404)
    );
  }

  // Authorization: Only assigned teacher of the subject or admin can upload materials
  if (
    req.user.role === "Teacher" &&
    (!subject.teacher || subject.teacher.toString() !== req.user.id)
  ) {
    return next(
      new ErrorResponse(
        "Not authorized to upload materials to this subject",
        403
      )
    );
  }

  const createdMaterials = [];
  const replacedMaterials = [];
  const errors = [];

  // Process each uploaded file
  for (const uploadedFile of uploadedFiles) {
    try {
      const originalFileName = uploadedFile.originalname;
      const fileExtension =
        originalFileName.split(".").pop()?.toLowerCase() || "";

      // Map file extensions to types
      const extensionMap = {
        pdf: "pdf",
        doc: "doc",
        docx: "docx",
        ppt: "ppt",
        pptx: "pptx",
        xls: "xls",
        xlsx: "xlsx",
        jpg: "jpg",
        jpeg: "jpeg",
        png: "png",
        gif: "gif",
        txt: "txt",
        csv: "csv",
        json: "json",
        html: "html",
        css: "css",
        js: "js",
        md: "md",
        xml: "xml",
      };

      const materialFileType = extensionMap[fileExtension] || "document";

      // Check if a file with the same name already exists for this subject
      const existingMaterial = await CourseMaterial.findOne({
        subject: subjectId,
        fileName: originalFileName,
      });

      // Create Firebase Storage path
      const firebasePath = `course-materials/${subjectId}/${originalFileName}`;
      const file = bucket.file(firebasePath);

      // Upload to Firebase Storage
      const stream = file.createWriteStream({
        metadata: {
          contentType: uploadedFile.mimetype,
          metadata: {
            originalName: originalFileName,
            uploadedBy: req.user.id,
            subjectId: subjectId,
          },
        },
      });

      await new Promise((resolve, reject) => {
        stream.on("error", reject);
        stream.on("finish", resolve);
        stream.end(uploadedFile.buffer);
      });

      // Make file publicly accessible
      await file.makePublic();

      // Get the public URL
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${firebasePath}`;

      if (existingMaterial) {
        // Delete old file from Firebase Storage
        try {
          const oldFile = bucket.file(
            `course-materials/${subjectId}/${existingMaterial.fileName}`
          );
          await oldFile.delete();
        } catch (err) {
          console.error("Error deleting old file from Firebase:", err);
        }

        // Update existing material
        existingMaterial.fileUrl = publicUrl;
        existingMaterial.firebasePath = firebasePath;
        existingMaterial.fileType = materialFileType;
        existingMaterial.fileSize = uploadedFile.size;
        existingMaterial.uploadedBy = req.user.id;
        existingMaterial.updatedAt = new Date();

        await existingMaterial.save();
        await existingMaterial.populate(
          "uploadedBy",
          "firstName lastName email"
        );

        replacedMaterials.push(existingMaterial);
      } else {
        // Create new material
        const courseMaterial = await CourseMaterial.create({
          fileName: originalFileName,
          fileUrl: publicUrl,
          firebasePath: firebasePath,
          fileType: materialFileType,
          fileSize: uploadedFile.size,
          subject: subjectId,
          uploadedBy: req.user.id,
        });

        // Add material to subject's courseMaterials array
        if (!subject.courseMaterials.includes(courseMaterial._id)) {
          subject.courseMaterials.push(courseMaterial._id);
        }

        await courseMaterial.populate("uploadedBy", "firstName lastName email");
        createdMaterials.push(courseMaterial);
      }
    } catch (error) {
      console.error(
        `Error processing file ${uploadedFile.originalname}:`,
        error
      );
      errors.push({
        fileName: uploadedFile.originalname,
        error: error.message,
      });
    }
  }

  // Save subject changes
  await subject.save();

  const totalProcessed = createdMaterials.length + replacedMaterials.length;
  const hasErrors = errors.length > 0;

  res.status(hasErrors && totalProcessed === 0 ? 400 : 201).json({
    success: totalProcessed > 0,
    message: `Processed ${totalProcessed} files. ${
      createdMaterials.length
    } created, ${replacedMaterials.length} replaced${
      hasErrors ? `, ${errors.length} failed` : ""
    }.`,
    data: {
      created: createdMaterials,
      replaced: replacedMaterials,
      errors: hasErrors ? errors : undefined,
    },
  });
});

// @desc    Get all course materials for a specific subject
// @route   GET /api/v1/subjects/:subjectId/courseMaterials
// @access  Private/Enrolled Student, Assigned Teacher, Admin
exports.getCourseMaterialsForSubject = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(
      new ErrorResponse(`Invalid subject ID format: ${subjectId}`, 400)
    );
  }

  const subject = await Subject.findById(subjectId);
  if (!subject) {
    return next(
      new ErrorResponse(`Subject not found with ID ${subjectId}`, 404)
    );
  }

  // Authorization check: Only enrolled students, assigned teacher, or admin can view materials
  if (req.user.role === "Student" && !subject.students.includes(req.user.id)) {
    return next(
      new ErrorResponse(
        "Not authorized to view materials for this subject",
        403
      )
    );
  }

  if (
    req.user.role === "Teacher" &&
    (!subject.teacher || subject.teacher.toString() !== req.user.id)
  ) {
    return next(
      new ErrorResponse(
        "Not authorized to view materials for this subject",
        403
      )
    );
  }

  const courseMaterials = await CourseMaterial.find({ subject: subjectId })
    .populate("uploadedBy", "firstName lastName email")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: courseMaterials.length,
    data: courseMaterials,
  });
});

// @desc    Get single course material by ID
// @route   GET /api/v1/courseMaterials/:id
// @access  Private/Enrolled Student, Assigned Teacher, Admin
exports.getCourseMaterial = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(
      new ErrorResponse(`Invalid course material ID format: ${id}`, 400)
    );
  }

  const courseMaterial = await CourseMaterial.findById(id)
    .populate("uploadedBy", "firstName lastName email")
    .populate("subject", "subjectName subjectCode teacher students");

  if (!courseMaterial) {
    return next(
      new ErrorResponse(`Course material not found with ID ${id}`, 404)
    );
  }

  // Authorization check
  const subject = courseMaterial.subject;
  if (req.user.role === "Student" && !subject.students.includes(req.user.id)) {
    return next(
      new ErrorResponse("Not authorized to view this course material", 403)
    );
  }

  if (
    req.user.role === "Teacher" &&
    (!subject.teacher || subject.teacher.toString() !== req.user.id)
  ) {
    return next(
      new ErrorResponse("Not authorized to view this course material", 403)
    );
  }

  res.status(200).json({
    success: true,
    data: courseMaterial,
  });
});

// @desc    Delete a course material
// @route   DELETE /api/v1/courseMaterials/:id
// @access  Private/Teacher (who uploaded it or assigned to subject) or Private/Admin
exports.deleteCourseMaterial = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(
      new ErrorResponse(`Invalid course material ID format: ${id}`, 400)
    );
  }

  const courseMaterial = await CourseMaterial.findById(id).populate("subject");

  if (!courseMaterial) {
    return next(
      new ErrorResponse(`Course material not found with ID ${id}`, 404)
    );
  }

  // Authorization: Only the uploader, assigned teacher, or admin can delete
  const subject = courseMaterial.subject;
  if (
    req.user.role === "Teacher" &&
    courseMaterial.uploadedBy.toString() !== req.user.id &&
    (!subject.teacher || subject.teacher.toString() !== req.user.id)
  ) {
    return next(
      new ErrorResponse("Not authorized to delete this course material", 403)
    );
  }

  // Delete the file from Firebase Storage
  try {
    if (courseMaterial.firebasePath) {
      const file = bucket.file(courseMaterial.firebasePath);
      await file.delete();
    }
  } catch (err) {
    console.error("Error deleting file from Firebase Storage:", err);
    // Continue with database deletion even if Firebase deletion fails
  }

  // Remove from subject's courseMaterials array
  await Subject.findByIdAndUpdate(courseMaterial.subject._id, {
    $pull: { courseMaterials: courseMaterial._id },
  });

  await CourseMaterial.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    data: {},
  });
});
