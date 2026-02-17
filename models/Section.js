const mongoose = require("mongoose");

const sectionSchema = new mongoose.Schema(
  {
    sectionName: { type: String, required: true, trim: true },
    gradeLevel: { type: String, required: true, trim: true },
    schoolYear: { type: String, required: true, trim: true },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Compound index for uniqueness
sectionSchema.index(
  {
    sectionName: 1,
    gradeLevel: 1,
    schoolYear: 1,
    isArchived: 1,
  },
  {
    unique: true,
    partialFilterExpression: { isArchived: false },
  },
);

const Section = mongoose.model("Section", sectionSchema);
module.exports = Section;
