const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Event creator is required.']
  },
  title: {
    type: String,
    required: [true, 'Event title is required.'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters.']
  },
  header: {
    type: String,
    required: [true, 'Event header is required.'],
    trim: true,
    maxlength: [300, 'Header cannot exceed 300 characters.']
  },
  body: {
    type: String,
    required: [true, 'Event body is required.'],
    trim: true,
    maxlength: [5000, 'Body cannot exceed 5000 characters.']
  },
  images: [{
    type: String,
    trim: true
  }],
  startDate: {
    type: Date,
    required: [true, 'Start date is required.']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required.']
    // Remove the complex validator - let controller handle date validation
  },
  priority: {
    type: String,
    enum: {
      values: ['high', 'medium', 'low'],
      message: 'Priority must be high, medium, or low.'
    },
    default: 'medium'
  },
  targetAudience: {
    type: String,
    enum: {
      values: ['all', 'students', 'teachers', 'admins'],
      message: 'Target audience must be all, students, teachers, or admins.'
    },
    default: 'all'
  },
  eventType: {
    type: String,
    enum: {
      values: ['academic', 'administrative', 'holiday', 'meeting', 'deadline', 'other'],
      message: 'Event type must be academic, administrative, holiday, meeting, deadline, or other.'
    },
    default: 'other'
  }
}, {
  timestamps: true
});

// Index for better query performance
eventSchema.index({ startDate: 1, endDate: 1 });
eventSchema.index({ priority: 1 });
eventSchema.index({ targetAudience: 1 });
eventSchema.index({ eventType: 1 });
eventSchema.index({ createdBy: 1 });

// Virtual for event status
eventSchema.virtual('status').get(function() {
  const now = new Date();
  if (now < this.startDate) {
    return 'upcoming';
  } else if (now >= this.startDate && now <= this.endDate) {
    return 'ongoing';
  } else {
    return 'past';
  }
});

// Ensure virtual fields are serialized
eventSchema.set('toJSON', { virtuals: true });
eventSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Event', eventSchema);