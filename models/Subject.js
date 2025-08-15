// Subject.js
const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  subjectName: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  gradeLevel: { type: String, trim: true }, // Added gradeLevel
  schoolYear: { type: String, trim: true }, // Added schoolYear e.g., "2023 - 2024"
  section: { type: String, trim: true },    // Added section
  teacher: { // The assigned teacher
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference the base User model, but ensure it's a Teacher role via logic
    // Consider adding validation to ensure the referenced user has the 'Teacher' role
    default: null
  },
  students: [{ // Students enrolled
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Reference base User, ensure 'Student' role via logic
  }],
  activities: [{ // Activities within the subject
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity'
  }],
  discussions: [{ // Discussions related to the subject
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Discussion'
  }],
  announcements: [{ // Announcements for the subject
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Announcement'
  }],
  courseMaterials: [{ // Course materials uploaded
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseMaterial'
  }],
  // Archive fields
  isArchived: { 
    type: Boolean, 
    default: false 
  },
  archivedAt: { 
    type: Date, 
    default: null 
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

// Add compound index for uniqueness based on subjectName, gradeLevel, section, and schoolYear
// Only apply uniqueness to non-archived subjects
subjectSchema.index({ 
  subjectName: 1, 
  gradeLevel: 1, 
  section: 1, 
  schoolYear: 1,
  isArchived: 1 
}, { 
  unique: true,
  partialFilterExpression: { isArchived: false }
});

const Subject = mongoose.model('Subject', subjectSchema);
module.exports = Subject;