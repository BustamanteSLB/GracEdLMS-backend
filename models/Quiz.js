const mongoose = require('mongoose');

const quizSubmissionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    submissionDate: {
      type: Date,
      default: Date.now,
    },
    // ─── “submittedAnswers” is an array of objects, each containing a question ID and the student's answer
    submittedAnswers: [
      {
        questionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Question',
          required: true,
        },
        answer: mongoose.Schema.Types.Mixed, // String, array, or 'True'/'False'
        isCorrect: {
          type: Boolean,
          default: false, // Indicates if the answer is correct
        },
        pointsEarned: {
          type: Number,
          default: 0, // Points earned for this question
          min: 0, // Points cannot be negative
        },

      },
    ],
    status: {
      type: String,
      enum: ['submitted', 'graded', 'pending', 'unsubmitted'], // Added 'unsubmitted'
      default: 'unsubmitted', // Default status for a new submission
    },
    quizScore: { // Total score for the quiz submission
      type: Number,
      default: null,
    },
    feedback: { // Feedback provided by the teacher for the submission
      type: String,
      trim: true,
    },
  }
)

const questionSchema = new mongoose.Schema(
  {
    text: { 
      type: String, 
      required: true 
    },
    type: { 
      type: String, 
      enum: ['multiple_choice', 'multiple_answers', 'true_false'], 
      required: true 
    },
    options: [{
      text: { type: String, required: true },
      isCorrect: { type: Boolean, default: false }
    }],
    // “images” are the images attached by the teacher to the question. The image name should not be renamed after uploading.
    images: [{
      type: String, // Path to the image file, optional
      trim: true
    }],
    itemPoints: {
      type: Number,
      default: 1, // Default points for each question
      min: 0 // Points cannot be negative
    },
    isRequired: {
      type: Boolean,
      default: true // Indicates if the question is required to be answered
    },
    answer: mongoose.Schema.Types.Mixed // String, array, or 'True'/'False'
  }
);

const quizSchema = new mongoose.Schema(
  {
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true // Link to the associated subject
    },
    createdBy:{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true // Link to the user who created the quiz
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    sectionHeader:{
      type: String,
      trim: true,
    },
    sectionDescription: {
      type: String,
      trim: true,
    },
    questions: [questionSchema],
    timeLimit: { 
      type: Number, 
      min: 1 // in minutes, optional
    },
    quizSubmissions: [quizSubmissionSchema],
    quarter: {
      type: String,
      required: true,
      enum: ['First Quarter', 'Second Quarter', '3rd Quarter', '4th Quarter'],
      default: 'First Quarter'
    },
    quizPoints: {
      type: Number,
      default: null, // Optional points for the quiz
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived', 'graded', 'closed'], // Set status to closed when the quiz is finished or if the time limit is reached
      default: 'draft' // Default status for a new quiz. Students can only see published, closed and graded quizzes.
    },
  },
  {
    timestamps: true // Automatically manage createdAt and updatedAt fields
  }
);

module.exports = mongoose.model('Quiz', quizSchema);