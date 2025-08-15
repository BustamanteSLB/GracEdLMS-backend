// models/Grade.js
const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    activity: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Activity',
        required: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    quarter: {
        type: String,
        ref: 'Activity',
        required: true
    },
    score: {
        type: Number,
        required: true,
        min: 0
        // Remove any custom setters that might be multiplying
    },
    bonusPoints: {
        type: Number,
        min: 0,
        default: undefined // Change from 0 to undefined
    },
    comments: {
        type: String,
        trim: true
    },
    gradedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Add virtual for total score
gradeSchema.virtual('totalScore').get(function() {
    return this.score + (this.bonusPoints || 0);
});

// Add compound index to prevent duplicate grades for same student-activity pair
gradeSchema.index({ student: 1, activity: 1 }, { unique: true });

const Grade = mongoose.model('Grade', gradeSchema);
module.exports = Grade;