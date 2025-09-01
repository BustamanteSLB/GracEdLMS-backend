// quizController.js

const Quiz = require("../models/Quiz");
const Subject = require("../models/Subject");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");
const mongoose = require("mongoose");
const { bucket } = require("../config/firebaseService");
const OpenAI = require("openai");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const officeParser = require("officeparser");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to extract text from Firebase Storage file
const extractTextFromBuffer = async (buffer, mimetype) => {
  try {
    if (mimetype === "application/pdf") {
      const data = await pdfParse(buffer);
      return data.text;
    } else if (
      mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimetype === "application/msword"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else if (
      mimetype ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      mimetype === "application/vnd.ms-powerpoint"
    ) {
      // Note: officeparser might need adjustment for buffer input
      const data = await officeParser.parseOffice(buffer);
      return data;
    } else if (mimetype === "text/plain") {
      return buffer.toString("utf8");
    }

    throw new Error("Unsupported file type");
  } catch (error) {
    console.error("Error extracting text from buffer:", error);
    throw new Error(`Failed to extract text from file: ${error.message}`);
  }
};

// Helper function to generate quiz using OpenAI
const generateQuizWithAI = async (content, options = {}) => {
  const {
    numberOfQuestions = 10,
    questionTypes = ["multiple_choice", "true_false"],
    difficulty = "medium",
    subject = "",
    quarter = "",
  } = options;

  const prompt = `
Based on the following content, generate a quiz with ${numberOfQuestions} questions. 

Content:
${content}

Requirements:
- Generate exactly ${numberOfQuestions} questions
- Question types: ${questionTypes.join(", ")}
- Difficulty level: ${difficulty}
- Subject: ${subject}
- Quarter: ${quarter}

For each question, provide:
1. Question text
2. Question type (multiple_choice, true_false, or multiple_answers)
3. Options (for multiple choice questions)
4. Correct answer(s)
5. Points (1-5 based on difficulty)

Format the response as a valid JSON object with this structure:
{
  "questions": [
    {
      "text": "Question text here",
      "type": "multiple_choice|true_false|multiple_answers",
      "options": [
        {"text": "Option 1", "isCorrect": false},
        {"text": "Option 2", "isCorrect": true}
      ],
      "itemPoints": 1,
      "isRequired": true,
      "answer": "correct answer text or array for multiple answers"
    }
  ]
}

Important rules:
- For true_false questions, use exactly two options: "True" and "False"
- For multiple_choice questions, provide 4 options with only one correct
- For multiple_answers questions, provide 4-5 options with multiple correct answers
- Ensure questions are relevant to the content provided
- Make questions challenging but fair
- Vary the difficulty and question types
- Return ONLY the JSON object, no other text
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert quiz generator. Generate high-quality educational quiz questions based on provided content. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const aiResponse = response.choices[0].message.content;

    // Parse the JSON response
    const quizData = JSON.parse(aiResponse);

    // Validate and clean the response
    if (!quizData.questions || !Array.isArray(quizData.questions)) {
      throw new Error("Invalid AI response format");
    }

    return quizData.questions;
  } catch (error) {
    console.error("Error generating quiz with AI:", error);
    throw new Error(`AI quiz generation failed: ${error.message}`);
  }
};

// @desc    Generate quiz from uploaded file using AI
// @route   POST /api/v1/quizzes/generate-ai
// @access  Private/Teacher,Admin
exports.generateAIQuiz = asyncHandler(async (req, res, next) => {
  const {
    subject,
    title,
    quarter,
    numberOfQuestions = 10,
    questionTypes = ["multiple_choice", "true_false"],
    difficulty = "medium",
    timeLimit,
  } = req.body;

  // Validate subject exists
  const subjectExists = await Subject.findById(subject);
  if (!subjectExists) {
    return next(new ErrorResponse("Subject not found", 404));
  }

  // Check if file was uploaded
  if (!req.file) {
    return next(new ErrorResponse("Please upload a file", 400));
  }

  try {
    console.log(
      "Processing uploaded file for AI quiz generation:",
      req.file.originalname
    );

    // Extract text from uploaded file buffer
    const extractedText = await extractTextFromBuffer(
      req.file.buffer,
      req.file.mimetype
    );

    if (!extractedText || extractedText.trim().length < 100) {
      return next(
        new ErrorResponse(
          "File content is too short or empty to generate meaningful questions",
          400
        )
      );
    }

    console.log("Text extracted, length:", extractedText.length);

    // Generate quiz using AI
    console.log("Generating quiz with AI...");
    const aiQuestions = await generateQuizWithAI(extractedText, {
      numberOfQuestions: parseInt(numberOfQuestions),
      questionTypes: Array.isArray(questionTypes)
        ? questionTypes
        : [questionTypes],
      difficulty,
      subject: subjectExists.subjectName,
      quarter,
    });

    console.log("AI generated", aiQuestions.length, "questions");

    // Calculate total quiz points
    const quizPoints = aiQuestions.reduce(
      (total, question) => total + (question.itemPoints || 1),
      0
    );

    // Create quiz
    const quiz = await Quiz.create({
      subject,
      createdBy: req.user.id,
      title: title || `AI Generated Quiz - ${subjectExists.subjectName}`,
      questions: aiQuestions,
      timeLimit: timeLimit ? parseInt(timeLimit) : null,
      quarter,
      quizPoints,
      status: "draft",
    });

    await quiz.populate("createdBy", "firstName lastName email");
    await quiz.populate(
      "subject",
      "subjectName description gradeLevel section schoolYear"
    );

    res.status(201).json({
      success: true,
      message: `Successfully generated ${aiQuestions.length} questions from uploaded file`,
      data: quiz,
    });
  } catch (error) {
    console.error("Error in AI quiz generation:", error);
    return next(
      new ErrorResponse(error.message || "Failed to generate AI quiz", 500)
    );
  }
});

// @desc    Create a new quiz
// @route   POST /api/v1/quizzes
// @access  Private/Teacher,Admin
exports.createQuiz = asyncHandler(async (req, res, next) => {
  const {
    subject,
    title,
    sectionHeader,
    sectionDescription,
    questions,
    timeLimit,
    quarter,
  } = req.body;

  // Validate subject exists
  const subjectExists = await Subject.findById(subject);
  if (!subjectExists) {
    return next(new ErrorResponse("Subject not found", 404));
  }

  // Process uploaded images
  const imageMap = {};
  if (req.files && req.files.length > 0) {
    console.log("Processing", req.files.length, "uploaded images");

    for (const file of req.files) {
      try {
        // Create Firebase Storage path
        const firebasePath = `quiz-images/${subject}/${Date.now()}-${
          file.originalname
        }`;
        const firebaseFile = bucket.file(firebasePath);

        // Upload to Firebase Storage
        const stream = firebaseFile.createWriteStream({
          metadata: {
            contentType: file.mimetype,
            metadata: {
              originalName: file.originalname,
              uploadedBy: req.user.id,
              subjectId: subject,
              quizTitle: title,
            },
          },
        });

        await new Promise((resolve, reject) => {
          stream.on("error", reject);
          stream.on("finish", resolve);
          stream.end(file.buffer);
        });

        // Make file publicly accessible
        await firebaseFile.makePublic();

        // Get the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${firebasePath}`;

        // Map original filename to Firebase URL
        imageMap[file.originalname] = publicUrl;

        console.log(`Uploaded image: ${file.originalname} -> ${publicUrl}`);
      } catch (uploadError) {
        console.error(
          `Failed to upload image ${file.originalname}:`,
          uploadError
        );
        // Continue with other files even if one fails
      }
    }
  }

  // Parse questions and map images
  let parsedQuestions = [];
  if (questions) {
    parsedQuestions = JSON.parse(questions).map((question) => {
      if (question.images && question.images.length > 0) {
        question.images = question.images.map(
          (imageName) => imageMap[imageName] || imageName
        );
      }
      return question;
    });
  }

  // Calculate total quiz points
  const quizPoints = parsedQuestions.reduce(
    (total, question) => total + (question.itemPoints || 1),
    0
  );

  const quiz = await Quiz.create({
    subject,
    createdBy: req.user.id,
    title,
    sectionHeader,
    sectionDescription,
    questions: parsedQuestions,
    timeLimit: timeLimit ? parseInt(timeLimit) : null,
    quarter,
    quizPoints,
    status: "draft",
  });

  await quiz.populate("createdBy", "firstName lastName email");
  await quiz.populate(
    "subject",
    "subjectName description gradeLevel section schoolYear"
  );

  res.status(201).json({
    success: true,
    data: quiz,
  });
});

// @desc    Update quiz
// @route   PUT /api/v1/quizzes/:id
// @access  Private/Teacher,Admin
exports.updateQuiz = asyncHandler(async (req, res, next) => {
  let quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new ErrorResponse("Quiz not found", 404));
  }

  // Check permissions
  if (
    req.user.role === "Teacher" &&
    quiz.createdBy.toString() !== req.user.id
  ) {
    return next(new ErrorResponse("Not authorized to update this quiz", 403));
  }

  const {
    title,
    sectionHeader,
    sectionDescription,
    questions,
    timeLimit,
    quarter,
    status,
  } = req.body;

  // Process uploaded images
  const imageMap = {};
  if (req.files && req.files.length > 0) {
    console.log("Processing", req.files.length, "uploaded images for update");

    for (const file of req.files) {
      try {
        // Create Firebase Storage path
        const firebasePath = `quiz-images/${quiz.subject}/${Date.now()}-${
          file.originalname
        }`;
        const firebaseFile = bucket.file(firebasePath);

        // Upload to Firebase Storage
        const stream = firebaseFile.createWriteStream({
          metadata: {
            contentType: file.mimetype,
            metadata: {
              originalName: file.originalname,
              uploadedBy: req.user.id,
              subjectId: quiz.subject.toString(),
              quizId: quiz._id.toString(),
            },
          },
        });

        await new Promise((resolve, reject) => {
          stream.on("error", reject);
          stream.on("finish", resolve);
          stream.end(file.buffer);
        });

        // Make file publicly accessible
        await firebaseFile.makePublic();

        // Get the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${firebasePath}`;

        // Map original filename to Firebase URL
        imageMap[file.originalname] = publicUrl;

        console.log(`Uploaded image: ${file.originalname} -> ${publicUrl}`);
      } catch (uploadError) {
        console.error(
          `Failed to upload image ${file.originalname}:`,
          uploadError
        );
      }
    }
  }

  // Parse questions and map images
  let parsedQuestions = quiz.questions;
  if (questions) {
    parsedQuestions = JSON.parse(questions).map((question) => {
      if (question.images && question.images.length > 0) {
        question.images = question.images.map(
          (imageName) => imageMap[imageName] || imageName
        );
      }
      return question;
    });
  }

  // Calculate total quiz points
  const quizPoints = parsedQuestions.reduce(
    (total, question) => total + (question.itemPoints || 1),
    0
  );

  // Update quiz
  quiz = await Quiz.findByIdAndUpdate(
    req.params.id,
    {
      title: title || quiz.title,
      sectionHeader:
        sectionHeader !== undefined ? sectionHeader : quiz.sectionHeader,
      sectionDescription:
        sectionDescription !== undefined
          ? sectionDescription
          : quiz.sectionDescription,
      questions: parsedQuestions,
      timeLimit: timeLimit ? parseInt(timeLimit) : quiz.timeLimit,
      quarter: quarter || quiz.quarter,
      quizPoints,
      status: status || quiz.status,
    },
    { new: true, runValidators: true }
  );

  await quiz.populate("createdBy", "firstName lastName email");
  await quiz.populate(
    "subject",
    "subjectName description gradeLevel section schoolYear"
  );

  res.status(200).json({
    success: true,
    data: quiz,
  });
});

// @desc    Delete quiz
// @route   DELETE /api/v1/quizzes/:id
// @access  Private/Teacher,Admin
exports.deleteQuiz = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new ErrorResponse("Quiz not found", 404));
  }

  // Check permissions
  if (
    req.user.role === "Teacher" &&
    quiz.createdBy.toString() !== req.user.id
  ) {
    return next(new ErrorResponse("Not authorized to delete this quiz", 403));
  }

  // Delete associated images from Firebase Storage
  if (quiz.questions && quiz.questions.length > 0) {
    for (const question of quiz.questions) {
      if (question.images && question.images.length > 0) {
        for (const imageUrl of question.images) {
          try {
            // Extract Firebase path from URL
            if (imageUrl.includes("storage.googleapis.com")) {
              const urlParts = imageUrl.split("/");
              const pathIndex = urlParts.findIndex(
                (part) => part === bucket.name
              );
              if (pathIndex !== -1 && urlParts[pathIndex + 1]) {
                const firebasePath = decodeURIComponent(
                  urlParts.slice(pathIndex + 1).join("/")
                );
                const file = bucket.file(firebasePath);
                await file.delete();
                console.log(`Deleted image from Firebase: ${firebasePath}`);
              }
            }
          } catch (deleteError) {
            console.error(`Failed to delete image ${imageUrl}:`, deleteError);
            // Continue deleting other images even if one fails
          }
        }
      }
    }
  }

  await quiz.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get all quizzes
// @route   GET /api/v1/quizzes
// @access  Private
exports.getQuizzes = asyncHandler(async (req, res, next) => {
  const { subject, status, quarter, search } = req.query;

  let query = {};

  // Filter by subject if provided
  if (subject) {
    query.subject = subject;
  }

  // Filter by status if provided
  if (status) {
    query.status = status;
  }

  // Filter by quarter if provided
  if (quarter) {
    query.quarter = quarter;
  }

  // Search in title if provided
  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  // Teachers can only see their own quizzes
  if (req.user.role === "Teacher") {
    query.createdBy = req.user.id;
  }

  const quizzes = await Quiz.find(query)
    .populate("createdBy", "firstName lastName email")
    .populate(
      "subject",
      "subjectName description gradeLevel section schoolYear"
    )
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: quizzes.length,
    data: quizzes,
  });
});

// @desc    Get single quiz
// @route   GET /api/v1/quizzes/:id
// @access  Private
exports.getQuiz = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate("createdBy", "firstName lastName email")
    .populate(
      "subject",
      "subjectName description gradeLevel section schoolYear"
    )
    .populate("quizSubmissions.student", "firstName lastName email");

  if (!quiz) {
    return next(new ErrorResponse("Quiz not found", 404));
  }

  // Check permissions
  if (
    req.user.role === "Teacher" &&
    quiz.createdBy._id.toString() !== req.user.id
  ) {
    return next(new ErrorResponse("Not authorized to access this quiz", 403));
  }

  res.status(200).json({
    success: true,
    data: quiz,
  });
});

// @desc    Publish quiz
// @route   PUT /api/v1/quizzes/:id/publish
// @access  Private/Teacher,Admin
exports.publishQuiz = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new ErrorResponse("Quiz not found", 404));
  }

  // Check permissions
  if (
    req.user.role === "Teacher" &&
    quiz.createdBy.toString() !== req.user.id
  ) {
    return next(new ErrorResponse("Not authorized to publish this quiz", 403));
  }

  if (quiz.questions.length === 0) {
    return next(
      new ErrorResponse("Cannot publish quiz without questions", 400)
    );
  }

  quiz.status = "published";
  await quiz.save();

  res.status(200).json({
    success: true,
    data: quiz,
  });
});

// @desc    Archive quiz
// @route   PUT /api/v1/quizzes/:id/archive
// @access  Private/Teacher,Admin
exports.archiveQuiz = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new ErrorResponse("Quiz not found", 404));
  }

  // Check permissions
  if (
    req.user.role === "Teacher" &&
    quiz.createdBy.toString() !== req.user.id
  ) {
    return next(new ErrorResponse("Not authorized to archive this quiz", 403));
  }

  quiz.status = "archived";
  await quiz.save();

  res.status(200).json({
    success: true,
    data: quiz,
  });
});

// @desc    Duplicate quiz
// @route   POST /api/v1/quizzes/:id/duplicate
// @access  Private/Teacher,Admin
exports.duplicateQuiz = asyncHandler(async (req, res, next) => {
  const originalQuiz = await Quiz.findById(req.params.id);

  if (!originalQuiz) {
    return next(new ErrorResponse("Quiz not found", 404));
  }

  // Check permissions
  if (
    req.user.role === "Teacher" &&
    originalQuiz.createdBy.toString() !== req.user.id
  ) {
    return next(
      new ErrorResponse("Not authorized to duplicate this quiz", 403)
    );
  }

  const duplicatedQuiz = await Quiz.create({
    subject: originalQuiz.subject,
    createdBy: req.user.id,
    title: `${originalQuiz.title} (Copy)`,
    sectionHeader: originalQuiz.sectionHeader,
    sectionDescription: originalQuiz.sectionDescription,
    questions: originalQuiz.questions,
    timeLimit: originalQuiz.timeLimit,
    quarter: originalQuiz.quarter,
    quizPoints: originalQuiz.quizPoints,
    status: "draft",
  });

  await duplicatedQuiz.populate("createdBy", "firstName lastName email");
  await duplicatedQuiz.populate(
    "subject",
    "subjectName description gradeLevel section schoolYear"
  );

  res.status(201).json({
    success: true,
    data: duplicatedQuiz,
  });
});

// @desc    Get quiz submissions
// @route   GET /api/v1/quizzes/:id/submissions
// @access  Private/Teacher,Admin
exports.getQuizSubmissions = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id).populate(
    "quizSubmissions.student",
    "firstName lastName email"
  );

  if (!quiz) {
    return next(new ErrorResponse("Quiz not found", 404));
  }

  // Check permissions
  if (
    req.user.role === "Teacher" &&
    quiz.createdBy.toString() !== req.user.id
  ) {
    return next(new ErrorResponse("Not authorized to view submissions", 403));
  }

  res.status(200).json({
    success: true,
    data: quiz.quizSubmissions,
  });
});

// @desc    Submit quiz response
// @route   POST /api/v1/quizzes/:id/submit
// @access  Private/Student
exports.submitQuizResponse = asyncHandler(async (req, res, next) => {
  const { submittedAnswers } = req.body;
  const quiz = await Quiz.findById(req.params.id);

  if (!quiz) {
    return next(new ErrorResponse("Quiz not found", 404));
  }

  if (quiz.status !== "published") {
    return next(new ErrorResponse("Quiz is not available for submission", 400));
  }

  // Check if student already submitted
  const existingSubmission = quiz.quizSubmissions.find(
    (submission) => submission.student.toString() === req.user.id
  );

  if (existingSubmission) {
    return next(new ErrorResponse("You have already submitted this quiz", 400));
  }

  // Grade the submission
  let totalScore = 0;
  const gradedAnswers = submittedAnswers.map((submittedAnswer) => {
    const question = quiz.questions.id(submittedAnswer.questionId);
    if (!question) {
      return { ...submittedAnswer, isCorrect: false, pointsEarned: 0 };
    }

    let isCorrect = false;
    let pointsEarned = 0;

    if (question.type === "multiple_choice" || question.type === "true_false") {
      isCorrect = submittedAnswer.answer === question.answer;
    } else if (question.type === "multiple_answers") {
      const correctAnswers = Array.isArray(question.answer)
        ? question.answer
        : [];
      const userAnswers = Array.isArray(submittedAnswer.answer)
        ? submittedAnswer.answer
        : [];
      isCorrect =
        correctAnswers.length === userAnswers.length &&
        correctAnswers.every((answer) => userAnswers.includes(answer));
    }

    if (isCorrect) {
      pointsEarned = question.itemPoints || 1;
      totalScore += pointsEarned;
    }

    return {
      ...submittedAnswer,
      isCorrect,
      pointsEarned,
    };
  });

  // Add submission to quiz
  quiz.quizSubmissions.push({
    student: req.user.id,
    submittedAnswers: gradedAnswers,
    status: "graded",
    quizScore: totalScore,
  });

  await quiz.save();

  res.status(200).json({
    success: true,
    message: "Quiz submitted successfully",
    data: {
      score: totalScore,
      totalPoints: quiz.quizPoints,
    },
  });
});

// @desc    Grade quiz submission manually
// @route   PUT /api/v1/quizzes/submissions/:submissionId/grade
// @access  Private/Teacher,Admin
exports.gradeQuizSubmission = asyncHandler(async (req, res, next) => {
  const { feedback, manualScore } = req.body;
  const submissionId = req.params.submissionId;

  const quiz = await Quiz.findOne({ "quizSubmissions._id": submissionId });

  if (!quiz) {
    return next(new ErrorResponse("Submission not found", 404));
  }

  // Check permissions
  if (
    req.user.role === "Teacher" &&
    quiz.createdBy.toString() !== req.user.id
  ) {
    return next(
      new ErrorResponse("Not authorized to grade this submission", 403)
    );
  }

  const submission = quiz.quizSubmissions.id(submissionId);
  if (!submission) {
    return next(new ErrorResponse("Submission not found", 404));
  }

  submission.feedback = feedback;
  if (manualScore !== undefined) {
    submission.quizScore = manualScore;
  }
  submission.status = "graded";

  await quiz.save();

  res.status(200).json({
    success: true,
    data: submission,
  });
});

// @desc    Get quiz statistics
// @route   GET /api/v1/quizzes/:id/statistics
// @access  Private/Teacher,Admin
exports.getQuizStatistics = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id).populate(
    "quizSubmissions.student",
    "firstName lastName email"
  );

  if (!quiz) {
    return next(new ErrorResponse("Quiz not found", 404));
  }

  // Check permissions
  if (
    req.user.role === "Teacher" &&
    quiz.createdBy.toString() !== req.user.id
  ) {
    return next(new ErrorResponse("Not authorized to view statistics", 403));
  }

  const submissions = quiz.quizSubmissions.filter(
    (sub) => sub.status === "graded"
  );
  const totalSubmissions = submissions.length;

  if (totalSubmissions === 0) {
    return res.status(200).json({
      success: true,
      data: {
        totalSubmissions: 0,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        passRate: 0,
      },
    });
  }

  const scores = submissions.map((sub) => sub.quizScore);
  const averageScore =
    scores.reduce((sum, score) => sum + score, 0) / totalSubmissions;
  const highestScore = Math.max(...scores);
  const lowestScore = Math.min(...scores);
  const passRate =
    (scores.filter((score) => score >= quiz.quizPoints * 0.6).length /
      totalSubmissions) *
    100;

  res.status(200).json({
    success: true,
    data: {
      totalSubmissions,
      averageScore: Math.round(averageScore * 100) / 100,
      highestScore,
      lowestScore,
      passRate: Math.round(passRate * 100) / 100,
      maxPossibleScore: quiz.quizPoints,
    },
  });
});
