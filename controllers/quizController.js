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
const fs = require("fs");
const path = require("path");
const os = require("os");

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
      // officeparser requires a file path, so we need to write the buffer to a temp file
      const tempFilePath = path.join(
        os.tmpdir(),
        `temp-${Date.now()}-${Math.random().toString(36).substring(7)}.pptx`,
      );

      try {
        // Write buffer to temporary file
        await fs.promises.writeFile(tempFilePath, buffer);

        // Parse the file using officeparser
        const data = await new Promise((resolve, reject) => {
          officeParser.parseOffice(tempFilePath, (data, err) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
        });

        // Clean up temp file
        await fs.promises.unlink(tempFilePath);

        return data;
      } catch (error) {
        // Ensure temp file is cleaned up even if there's an error
        try {
          await fs.promises.unlink(tempFilePath);
        } catch (unlinkError) {
          console.error("Error deleting temp file:", unlinkError);
        }
        throw error;
      }
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
2. Question type (multiple_choice, true_false, multiple_answers, short_answer, or essay)
3. Options (for multiple choice questions, not for short_answer or essay)
4. Correct answer(s)
5. For short_answer: provide correctAnswers array, caseSensitive boolean, and markOthersIncorrect boolean
6. For essay: no options or correct answers needed (will be manually graded)
7. Points (1-5 based on difficulty, essay questions typically worth more points)

Format the response as a valid JSON object with this structure:
{
  "questions": [
    {
      "text": "Question text here",
      "type": "multiple_choice|true_false|multiple_answers|short_answer|essay",
      "options": [
        {"text": "Option 1", "isCorrect": false},
        {"text": "Option 2", "isCorrect": true}
      ],
      "correctAnswers": ["answer1", "answer2"], // For short_answer only
      "caseSensitive": false, // For short_answer only
      "markOthersIncorrect": true, // For short_answer only
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
- For short_answer questions, provide correctAnswers array with acceptable answers (2-3 variations)
- For essay questions, DO NOT provide options or correctAnswers (these are manually graded)
- Essay questions should be open-ended and thought-provoking
- Essay questions should typically be worth 3-5 points
- Ensure questions are relevant to the content provided
- Make questions challenging but fair
- Vary the difficulty and question types
- Return ONLY the JSON object, no other text or markdown formatting
- Do not wrap the JSON in code blocks or backticks
`;

  try {
    console.log("Calling OpenAI API with GPT-5-mini...");

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini", // Updated to latest GPT-5-mini model
      messages: [
        {
          role: "system",
          content:
            "You are an expert quiz generator. Generate high-quality educational quiz questions based on provided content. You must respond with ONLY a valid JSON object, without any markdown formatting, code blocks, or additional text. Do not use backticks or any other formatting.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 1,
      max_completion_tokens: 4000,
      response_format: { type: "json_object" }, // Force JSON response
    });

    let aiResponse = response.choices[0].message.content;
    console.log("Raw AI Response:", aiResponse.substring(0, 200) + "...");

    // Clean up the response - remove markdown code blocks if present
    aiResponse = aiResponse.trim();

    // Remove markdown code blocks (```json and ```
    if (aiResponse.startsWith("```")) {
      aiResponse = aiResponse
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "");
    }

    // Try to extract JSON if there's additional text
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      aiResponse = jsonMatch[0];
    }

    console.log("Cleaned AI Response:", aiResponse.substring(0, 200) + "...");

    // Parse the JSON response
    let quizData;
    try {
      quizData = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.error("Failed to parse:", aiResponse);
      throw new Error(
        `Failed to parse AI response as JSON: ${parseError.message}`,
      );
    }

    // Validate and clean the response
    if (!quizData.questions || !Array.isArray(quizData.questions)) {
      throw new Error(
        "Invalid AI response format: missing or invalid 'questions' array",
      );
    }

    if (quizData.questions.length === 0) {
      throw new Error("AI did not generate any questions");
    }

    console.log(
      `Successfully parsed ${quizData.questions.length} questions from AI response`,
    );

    // Validate each question
    const validatedQuestions = quizData.questions.map((q, index) => {
      if (!q.text || typeof q.text !== "string") {
        throw new Error(`Question ${index + 1} is missing or has invalid text`);
      }

      if (
        !q.type ||
        ![
          "multiple_choice",
          "true_false",
          "multiple_answers",
          "short_answer",
          "essay",
        ].includes(q.type)
      ) {
        throw new Error(`Question ${index + 1} has invalid type: ${q.type}`);
      }

      // Essay questions don't need options or correct answers
      if (q.type === "essay") {
        return {
          text: q.text,
          type: q.type,
          options: [], // No options for essay
          correctAnswers: [], // No correct answers for essay
          itemPoints: q.itemPoints || 3, // Essay questions worth more points by default
          isRequired: q.isRequired !== undefined ? q.isRequired : true,
          answer: "", // Empty answer for essay
        };
      }

      // Short answer questions need correct answers
      if (q.type === "short_answer") {
        if (
          !q.correctAnswers ||
          !Array.isArray(q.correctAnswers) ||
          q.correctAnswers.length === 0
        ) {
          throw new Error(
            `Question ${index + 1} (short_answer) is missing correctAnswers array`,
          );
        }

        return {
          text: q.text,
          type: q.type,
          options: [], // No options for short answer
          correctAnswers: q.correctAnswers,
          caseSensitive:
            q.caseSensitive !== undefined ? q.caseSensitive : false,
          markOthersIncorrect:
            q.markOthersIncorrect !== undefined ? q.markOthersIncorrect : true,
          itemPoints: q.itemPoints || 1,
          isRequired: q.isRequired !== undefined ? q.isRequired : true,
          answer: "", // Empty answer for short answer
        };
      }

      // Other question types need options
      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new Error(
          `Question ${index + 1} has invalid or insufficient options`,
        );
      }

      // Ensure all options have required fields
      q.options = q.options.map((opt) => ({
        text: opt.text || "",
        isCorrect: !!opt.isCorrect,
      }));

      // Set default values for optional fields
      return {
        text: q.text,
        type: q.type,
        options: q.options,
        correctAnswers: [], // Not used for multiple choice
        itemPoints: q.itemPoints || 1,
        isRequired: q.isRequired !== undefined ? q.isRequired : true,
        answer: q.answer || "",
      };
    });

    return validatedQuestions;
  } catch (error) {
    console.error("Error generating quiz with AI:", error);

    // Provide more specific error messages
    if (error.message.includes("API key")) {
      throw new Error(
        "OpenAI API key is invalid or missing. Please check your configuration.",
      );
    } else if (error.message.includes("quota")) {
      throw new Error(
        "OpenAI API quota exceeded. Please check your usage limits.",
      );
    } else if (error.message.includes("model")) {
      throw new Error(
        `OpenAI model error: ${error.message}. The model may not be available.`,
      );
    }

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
      req.file.originalname,
    );

    // Extract text from uploaded file buffer
    const extractedText = await extractTextFromBuffer(
      req.file.buffer,
      req.file.mimetype,
    );

    if (!extractedText || extractedText.trim().length < 100) {
      return next(
        new ErrorResponse(
          "File content is too short or empty to generate meaningful questions",
          400,
        ),
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
      0,
    );

    // CHANGED: Only return the questions, don't create the quiz yet
    // The frontend modal will handle creating the quiz when user clicks Save
    res.status(200).json({
      success: true,
      message: `Successfully generated ${aiQuestions.length} questions from uploaded file`,
      data: {
        questions: aiQuestions,
        title: title || `AI Generated Quiz - ${subjectExists.subjectName}`,
        quizPoints,
        // Include the form data for the modal to populate
        subject,
        quarter,
        timeLimit: timeLimit ? parseInt(timeLimit) : null,
      },
    });
  } catch (error) {
    console.error("Error in AI quiz generation:", error);
    return next(
      new ErrorResponse(error.message || "Failed to generate AI quiz", 500),
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
          uploadError,
        );
        // Continue with other files even if one fails
      }
    }
  }

  // Parse questions and check for essay type
  let parsedQuestions = [];
  let hasEssay = false;
  if (questions) {
    parsedQuestions = JSON.parse(questions).map((question) => {
      if (question.images && question.images.length > 0) {
        question.images = question.images.map(
          (imageName) => imageMap[imageName] || imageName,
        );
      }
      if (question.type === "essay") {
        hasEssay = true;
      }
      return question;
    });
  }

  // Calculate total quiz points
  const quizPoints = parsedQuestions.reduce(
    (total, question) => total + (question.itemPoints || 1),
    0,
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
    hasEssay,
    status: "draft",
  });

  await quiz.populate("createdBy", "firstName lastName email");
  await quiz.populate(
    "subject",
    "subjectName description gradeLevel section schoolYear",
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
          uploadError,
        );
      }
    }
  }

  // Parse questions and check for essay type
  let parsedQuestions = quiz.questions;
  let hasEssay = false;
  if (questions) {
    parsedQuestions = JSON.parse(questions).map((question) => {
      if (question.images && question.images.length > 0) {
        question.images = question.images.map(
          (imageName) => imageMap[imageName] || imageName,
        );
      }
      if (question.type === "essay") {
        hasEssay = true;
      }
      return question;
    });
  }

  // Calculate total quiz points
  const quizPoints = parsedQuestions.reduce(
    (total, question) => total + (question.itemPoints || 1),
    0,
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
      hasEssay,
      status: status || quiz.status,
    },
    { new: true, runValidators: true },
  );

  await quiz.populate("createdBy", "firstName lastName email");
  await quiz.populate(
    "subject",
    "subjectName description gradeLevel section schoolYear",
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
                (part) => part === bucket.name,
              );
              if (pathIndex !== -1 && urlParts[pathIndex + 1]) {
                const firebasePath = decodeURIComponent(
                  urlParts.slice(pathIndex + 1).join("/"),
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

    // Teachers can also filter by subject
    if (subject) {
      query.subject = subject;
    }
  }

  // Students can only see quizzes for subjects they are enrolled in
  if (req.user.role === "Student") {
    // FIX: Use correct field name 'students' instead of 'enrolledStudents.student'
    const enrolledSubjects = await Subject.find({
      students: req.user.id,
      isArchived: false,
    }).select("_id");

    const enrolledSubjectIds = enrolledSubjects.map((s) => s._id);

    if (enrolledSubjectIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    // If a specific subject filter is provided, validate enrollment
    if (subject) {
      const isEnrolled = enrolledSubjectIds.some(
        (id) => id.toString() === subject.toString(),
      );
      if (!isEnrolled) {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
        });
      }
      query.subject = subject;
    } else {
      // Limit to only enrolled subjects
      query.subject = { $in: enrolledSubjectIds };
    }
  }

  // Admins can filter by subject if provided
  if (req.user.role === "Admin" && subject) {
    query.subject = subject;
  }

  const quizzes = await Quiz.find(query)
    .populate("createdBy", "firstName lastName email")
    .populate(
      "subject",
      "subjectName description gradeLevel section schoolYear subjectImage",
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
      "subjectName description gradeLevel section schoolYear",
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
      new ErrorResponse("Cannot publish quiz without questions", 400),
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
      new ErrorResponse("Not authorized to duplicate this quiz", 403),
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
    "subjectName description gradeLevel section schoolYear",
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
  const quiz = await Quiz.findById(req.params.id)
    .populate("quizSubmissions.student", "firstName lastName email userId")
    .populate("questions");

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

  // Only return submissions that have been submitted (not unsubmitted)
  const submissions = quiz.quizSubmissions.filter(
    (sub) => sub.status !== "unsubmitted",
  );

  res.status(200).json({
    success: true,
    data: {
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        quizPoints: quiz.quizPoints,
        hasEssay: quiz.hasEssay,
        questions: quiz.questions,
      },
      submissions,
    },
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
    (submission) => submission.student.toString() === req.user.id,
  );

  if (existingSubmission) {
    return next(new ErrorResponse("You have already submitted this quiz", 400));
  }

  // Grade the submission
  let totalScore = 0;
  let hasEssay = false;
  const gradedAnswers = submittedAnswers.map((submittedAnswer) => {
    const question = quiz.questions.id(submittedAnswer.questionId);
    if (!question) {
      return { ...submittedAnswer, isCorrect: false, pointsEarned: 0 };
    }

    let isCorrect = false;
    let pointsEarned = 0;
    let manuallyGraded = false;

    if (question.type === "essay") {
      // Essay questions need manual grading
      hasEssay = true;
      manuallyGraded = false;
      isCorrect = false;
      pointsEarned = 0;
    } else if (
      question.type === "multiple_choice" ||
      question.type === "true_false"
    ) {
      // For multiple choice and true/false, compare the selected option text with correct option
      const correctOption = question.options.find((opt) => opt.isCorrect);
      if (correctOption) {
        // Student's answer is the option text they selected
        isCorrect = submittedAnswer.answer === correctOption.text;
      }

      if (isCorrect) {
        pointsEarned = question.itemPoints || 1;
        totalScore += pointsEarned;
      }
    } else if (question.type === "multiple_answers") {
      // Get all correct options
      const correctOptions = question.options
        .filter((opt) => opt.isCorrect)
        .map((opt) => opt.text)
        .sort();

      // Get student's answers and sort them for comparison
      const userAnswers = Array.isArray(submittedAnswer.answer)
        ? [...submittedAnswer.answer].sort()
        : [];

      // Check if arrays match
      isCorrect =
        correctOptions.length === userAnswers.length &&
        correctOptions.every((answer, index) => answer === userAnswers[index]);

      if (isCorrect) {
        pointsEarned = question.itemPoints || 1;
        totalScore += pointsEarned;
      }
    } else if (question.type === "short_answer") {
      // Handle short answer grading
      const studentAnswer = submittedAnswer.answer?.toString().trim() || "";
      const correctAnswers = question.correctAnswers || [];

      if (correctAnswers.length === 0) {
        isCorrect = false;
      } else {
        if (question.caseSensitive) {
          isCorrect = correctAnswers.includes(studentAnswer);
        } else {
          const lowerStudentAnswer = studentAnswer.toLowerCase();
          isCorrect = correctAnswers.some(
            (ans) => ans.toLowerCase() === lowerStudentAnswer,
          );
        }

        if (!question.markOthersIncorrect && studentAnswer.length > 0) {
          isCorrect = true;
        }
      }

      if (isCorrect) {
        pointsEarned = question.itemPoints || 1;
        totalScore += pointsEarned;
      }
    }

    return {
      ...submittedAnswer,
      isCorrect,
      pointsEarned,
      manuallyGraded,
    };
  });

  // Add submission to quiz
  quiz.quizSubmissions.push({
    student: req.user.id,
    submittedAnswers: gradedAnswers,
    status: hasEssay ? "partial" : "graded", // Mark as partial if has essay
    quizScore: totalScore,
  });

  await quiz.save();

  res.status(200).json({
    success: true,
    message: hasEssay
      ? "Quiz submitted successfully. Essay questions will be graded manually by your teacher."
      : "Quiz submitted successfully",
    data: {
      score: totalScore,
      totalPoints: quiz.quizPoints,
      hasEssay,
    },
  });
});

// @desc    Grade essay question manually
// @route   PUT /api/v1/quizzes/submissions/:submissionId/grade-essay
// @access  Private/Teacher,Admin
exports.gradeEssayQuestion = asyncHandler(async (req, res, next) => {
  const { questionId, pointsEarned } = req.body;
  const submissionId = req.params.submissionId;

  const quiz = await Quiz.findOne({
    "quizSubmissions._id": submissionId,
  }).populate("quizSubmissions.student", "firstName lastName email userId");

  if (!quiz) {
    return next(new ErrorResponse("Submission not found", 404));
  }

  // Check permissions
  if (
    req.user.role === "Teacher" &&
    quiz.createdBy.toString() !== req.user.id
  ) {
    return next(
      new ErrorResponse("Not authorized to grade this submission", 403),
    );
  }

  const submission = quiz.quizSubmissions.id(submissionId);
  if (!submission) {
    return next(new ErrorResponse("Submission not found", 404));
  }

  // Find the answer for this question
  const answer = submission.submittedAnswers.find(
    (ans) => ans.questionId.toString() === questionId,
  );

  if (!answer) {
    return next(new ErrorResponse("Answer not found", 404));
  }

  // Find the question to get max points
  const question = quiz.questions.id(questionId);
  if (!question || question.type !== "essay") {
    return next(new ErrorResponse("Invalid essay question", 400));
  }

  // Validate points
  const points = Number(pointsEarned);
  if (isNaN(points) || points < 0 || points > question.itemPoints) {
    return next(
      new ErrorResponse(
        `Points must be between 0 and ${question.itemPoints}`,
        400,
      ),
    );
  }

  // Update the answer
  answer.pointsEarned = points;
  answer.isCorrect = points > 0;
  answer.manuallyGraded = true;

  // Recalculate total score
  submission.quizScore = submission.submittedAnswers.reduce(
    (total, ans) => total + (ans.pointsEarned || 0),
    0,
  );

  // Check if all essay questions are graded
  const allEssaysGraded = submission.submittedAnswers.every((ans) => {
    const q = quiz.questions.id(ans.questionId);
    return q.type !== "essay" || ans.manuallyGraded;
  });

  // Update submission status
  if (allEssaysGraded && submission.status === "partial") {
    submission.status = "graded";
  }

  await quiz.save();

  res.status(200).json({
    success: true,
    data: submission,
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
      new ErrorResponse("Not authorized to grade this submission", 403),
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
    "firstName lastName email",
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
    (sub) => sub.status === "graded",
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

// Validate form
const validateForm = () => {
  if (!formData.title.trim()) {
    window.alert("Please enter a quiz title");
    return false;
  }

  if (!formData.subject) {
    window.alert("Please select a subject");
    return false;
  }

  if (questions.length === 0) {
    window.alert("Please add at least one question");
    return false;
  }

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];

    if (!question.text.trim()) {
      window.alert(`Question ${i + 1} is missing text`);
      return false;
    }

    // Skip option validation for short answer questions
    if (question.type === "short_answer") {
      // Validate short answer has at least one correct answer
      if (
        !question.correctAnswers ||
        question.correctAnswers.length === 0 ||
        !question.correctAnswers.some((ans) => ans.trim())
      ) {
        window.alert(`Question ${i + 1} needs at least one correct answer`);
        return false;
      }
      continue; // Skip to next question
    }

    // Validate options for other question types
    const validOptions = question.options.filter((opt) => opt.text.trim());
    if (validOptions.length < 2) {
      window.alert(`Question ${i + 1} needs at least 2 options with text`);
      return false;
    }

    const correctOptions = question.options.filter((opt) => opt.isCorrect);
    if (correctOptions.length === 0) {
      window.alert(`Question ${i + 1} needs at least one correct answer`);
      return false;
    }
  }

  return true;
};
