// Subject.js
const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    subjectName: { type: String, required: true, trim: true },
    classCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 12,
    },
    description: { type: String, trim: true },
    gradeLevel: { type: String, trim: true },
    schoolYear: { type: String, trim: true },
    section: { type: String, trim: true },
    subjectImage: { type: String, default: null },

    // Updated teacher assignment with terms
    teachers: [
      {
        teacher: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        terms: {
          1: { type: Boolean, default: false },
          2: { type: Boolean, default: false },
          3: { type: Boolean, default: false },
        },
        isAssignedToAllTerms: { type: Boolean, default: false },
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

subjectSchema.index(
  { classCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isArchived: false,
      classCode: { $exists: true, $type: "string", $ne: "" },
    },
  },
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

const subjectSettingsSchema = new mongoose.Schema(
  {
    activeSchoolYear: { type: String, trim: true, default: null },
    setBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    setAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const Subject = mongoose.model("Subject", subjectSchema);
const SubjectSettings = mongoose.model("SubjectSettings", subjectSettingsSchema);

module.exports = Subject;
module.exports.SubjectSettings = SubjectSettings;
