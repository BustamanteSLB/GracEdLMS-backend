// Subject.js
const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    subjectName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    gradeLevel: { type: String, trim: true },
    schoolYear: { type: String, trim: true },
    section: { type: String, trim: true },
    subjectImage: { type: String, default: null },

    // Updated teacher assignment with quarters
    teachers: [
      {
        teacher: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        quarters: {
          firstQuarter: { type: Boolean, default: false },
          secondQuarter: { type: Boolean, default: false },
          thirdQuarter: { type: Boolean, default: false },
          fourthQuarter: { type: Boolean, default: false },
        },
        isAssignedToAllQuarters: { type: Boolean, default: false },
        assignedAt: { type: Date, default: Date.now },
      },
    ],

    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    activities: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Activity",
      },
    ],
    discussions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Discussion",
      },
    ],
    announcements: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Announcement",
      },
    ],
    courseMaterials: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CourseMaterial",
      },
    ],

    // Archive fields
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

// Add compound index for uniqueness based on subjectName, gradeLevel, section, and schoolYear
subjectSchema.index(
  {
    subjectName: 1,
    gradeLevel: 1,
    section: 1,
    schoolYear: 1,
    isArchived: 1,
  },
  {
    unique: true,
    partialFilterExpression: { isArchived: false },
  },
);

const Subject = mongoose.model("Subject", subjectSchema);
module.exports = Subject;
