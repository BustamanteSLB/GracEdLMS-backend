// models/CourseMaterial.js
const mongoose = require("mongoose");

const courseMaterialSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true, trim: true }, // Original filename
    fileUrl: { type: String, required: true }, // Firebase Storage public URL
    firebasePath: { type: String, required: true }, // Firebase Storage path for deletion
    fileType: { type: String }, // e.g., 'pdf', 'docx', 'pptx', 'jpg', 'png'
    fileSize: { type: Number }, // File size in bytes
    subject: {
      // The subject this material belongs to
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    uploadedBy: {
      // User (Admin or Teacher) who uploaded the material
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Create a compound index to ensure unique filenames per subject
courseMaterialSchema.index({ subject: 1, fileName: 1 }, { unique: true });

const CourseMaterial = mongoose.model("CourseMaterial", courseMaterialSchema);
module.exports = CourseMaterial;
