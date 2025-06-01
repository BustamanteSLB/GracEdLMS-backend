// Course.js
const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  courseCode: { type: String, required: true, unique: true, trim: true },
  courseName: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  gradeLevel: { type: String, trim: true }, // Added gradeLevel
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
  activities: [{ // Activities within the course
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity'
  }],
  // Add other fields like credits, prerequisites, etc. if needed
}, { timestamps: true });

const Course = mongoose.model('Course', courseSchema);
module.exports = Course;