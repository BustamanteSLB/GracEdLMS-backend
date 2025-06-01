// models/Activity.js
const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    course: { // Course this activity belongs to
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    dueDate: { type: Date },
    maxPoints: { type: Number, default: 100 },
    // Add fields for type (quiz, assignment), attachments etc.
}, { timestamps: true });

const Activity = mongoose.model('Activity', activitySchema);
module.exports = Activity;