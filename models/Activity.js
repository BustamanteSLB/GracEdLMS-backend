// models/Activity.js
const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
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
    enum: ["submitted", "graded", "pending", "unsubmitted"],
    default: "unsubmitted",
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

    visibleDate: {
      type: Date,
      required: true,
    },

    deadline: {
      type: Date,
      required: true,
    },

    quarter: {
      type: String,
      required: true,
      enum: ["First Quarter", "Second Quarter", "3rd Quarter", "4th Quarter"],
      default: "First Quarter",
    },

    points: {
      type: Number,
      default: null,
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    attachmentPath: {
      type: String,
      trim: true,
      default: null,
    },

    allowLateSubmissions: {
      type: Boolean,
      default: true,
    },

    submissions: [submissionSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Activity", activitySchema);
