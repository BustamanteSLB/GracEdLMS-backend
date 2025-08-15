// models/Student.js
const mongoose = require('mongoose');
const User = require('./User');

const studentSchema = new mongoose.Schema({
  // Subjects the student is enrolled in
  enrolledSubjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],
  // Student-specific fields like gradeLevel, guardianInfo etc.
  gradeLevel: String,
  guardianName: String,
  guardianPhone: String,
});

const Student = User.discriminator('StudentUser', studentSchema);

module.exports = Student;