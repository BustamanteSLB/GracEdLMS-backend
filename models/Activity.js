// models/Activity.js
const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  submissionDate: {
    type: Date,
    default: Date.now,
  },
  attachmentPaths: [
    {
      type: String,
      trim: true,
    },
  ],
  status: {
    type: String,
    enum: ['submitted', 'graded', 'pending', 'unsubmitted'], // Added 'unsubmitted'
    default: 'unsubmitted', // Default status for a new submission
  },
  grade: {
    type: Number,
    default: null,
  },
  feedback: {
    type: String,
    trim: true,
  },
});

const activitySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    // ─── “visibleDate” is required (when students can first see this activity)
    visibleDate: {
      type: Date,
      required: true,
    },

    // ─── “deadline” is required (when activity is due)
    deadline: {
      type: Date,
      required: true,
    },
    
    // ─── “quarter” is required (which quarter this activity belongs to)
    quarter: {
      type: String,
      required: true,
      enum: ['First Quarter', 'Second Quarter', '3rd Quarter', '4th Quarter'],
      default: 'First Quarter'
    },

    // ─── “points” (how many points this activity is worth) – optional
    points: {
      type: Number,
      default: null,
    },

    // ─── Which subject this activity belongs to
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },

    // ─── Who created this activity
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ─── Optional attachment path (e.g. "uploads/164738291237-2.txt")
    attachmentPath: {
      type: String,
      trim: true,
      default: null,
    },
    // ─── New field for student submissions
    submissions: [submissionSchema], // Array of student submissions
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

module.exports = mongoose.model('Activity', activitySchema);