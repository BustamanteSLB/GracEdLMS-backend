// models/Grade.js
const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
    student: { // Student who received the grade
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    activity: { // The graded activity
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Activity',
        required: true
    },
    course: { // The course context
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    score: { type: Number, required: true },
    gradedBy: { // Teacher who graded
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    comments: { type: String, trim: true },
}, { timestamps: true });

// Ensure a student has only one grade per activity
gradeSchema.index({ student: 1, activity: 1 }, { unique: true });

const Grade = mongoose.model('Grade', gradeSchema);
module.exports = Grade;