// models/Teacher.js
const mongoose = require('mongoose');
const User = require('./User');

const teacherSchema = new mongoose.Schema({
  // Courses the teacher is assigned to
  assignedCourses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  // Teacher-specific fields like qualifications, department etc.
  qualifications: [String],
  department: String,
});

const Teacher = User.discriminator('TeacherUser', teacherSchema);

module.exports = Teacher;