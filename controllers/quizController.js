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
const https = require("https");
const http = require("http");
const PDFDocument = require("pdfkit");

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const parseBooleanField = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return value === "true" || value === true;
};

const hashSeed = (seed) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
};

const shuffleQuestionsForStudent = (questions, studentId, quizId) => {
  const items = [...questions];
  let state = hashSeed(`${studentId}-${quizId}`);
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  return items;
};

const applyStudentQuizTransforms = (quiz, studentId) => {
  const quizObj = quiz.toObject ? quiz.toObject() : { ...quiz };

  if (quizObj.shuffleQuestions && quizObj.questions?.length > 1) {
    quizObj.questions = shuffleQuestionsForStudent(
      quizObj.questions,
      studentId,
      quizObj._id.toString(),
    );
  }

  return quizObj;
};

const PDF_COLORS = {
  title: "#111827",
  sectionHeader: "#374151",
  sectionDesc: "#6B7280",
  meta: "#6B7280",
  border: "#E5E7EB",
  inputBg: "#F9FAFB",
  correctBg: "#ECFDF5",
  correctTitle: "#059669",
  correctAnswer: "#047857",
  body: "#374151",
  placeholder: "#6B7280",
  radioInactive: "#D1D5DB",
  radioActive: "#10B981",
};

const PDF_MARGIN = 50;
const PDF_PAGE_WIDTH = 595.28;
const PDF_CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
const PDF_CARD_PADDING = 14;
const PDF_INNER_WIDTH = PDF_CONTENT_WIDTH - PDF_CARD_PADDING * 2;

const PDF_FONT = {
  title: 16,
  sectionHeader: 12,
  sectionDesc: 10,
  meta: 9,
  question: 11,
  option: 9.5,
  footer: 8.5,
  lineGap: 2,
};

const PDF_SPACING = {
  afterTitle: 6,
  afterSection: 5,
  afterMeta: 10,
  afterQuestion: 5,
  afterOption: 5,
  afterFooter: 12,
  betweenCards: 10,
};

const fetchImageBuffer = (url) =>
  new Promise((resolve, reject) => {
    const requestUrl = url.startsWith("https://")
      ? url
      : url.replace(/^http:\/\//i, "https://");
    const client = requestUrl.startsWith("https") ? https : http;

    client
      .get(requestUrl, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          fetchImageBuffer(response.headers.location).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Image request failed: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      })
      .on("error", reject);
  });

const preloadQuizImages = async (questions) => {
  const imageBuffers = {};

  for (const question of questions) {
    if (!question.images?.length) continue;

    for (const url of question.images) {
      if (!url || imageBuffers[url] || !url.startsWith("http")) continue;

      try {
        imageBuffers[url] = await fetchImageBuffer(url);
      } catch (error) {
        console.error(
          `Failed to load quiz image for PDF: ${url}`,
          error.message,
        );
      }
    }
  }

  return imageBuffers;
};

const getPdfBottom = (doc) => doc.page.height - PDF_MARGIN;

const ensurePdfSpace = (doc, height) => {
  if (doc.y + height > getPdfBottom(doc)) {
    doc.addPage();
    doc.x = PDF_MARGIN + PDF_CARD_PADDING;
  }
};

const setPdfContentX = (doc) => {
  doc.x = PDF_MARGIN + PDF_CARD_PADDING;
};

const drawPdfCardBorder = (doc, startY, endY) => {
  const height = endY - startY;
  if (height <= 4) return;

  doc
    .roundedRect(PDF_MARGIN, startY, PDF_CONTENT_WIDTH, height, 6)
    .lineWidth(1)
    .strokeColor(PDF_COLORS.border)
    .stroke();
};

const drawPdfQuestionDivider = (doc) => {
  const y = doc.y;
  doc
    .moveTo(PDF_MARGIN, y)
    .lineTo(PDF_MARGIN + PDF_CONTENT_WIDTH, y)
    .lineWidth(1)
    .strokeColor(PDF_COLORS.border)
    .stroke();
  doc.y = y + PDF_SPACING.betweenCards;
  setPdfContentX(doc);
};

const drawPdfOptionHighlight = (doc, x, y, width, height) => {
  doc
    .roundedRect(x, y, width, height, 8)
    .fillColor(PDF_COLORS.correctBg)
    .fill();
};

const drawPdfRadio = (doc, x, y, selected) => {
  doc.circle(x, y, 5).lineWidth(1).strokeColor(PDF_COLORS.radioInactive).stroke();
  if (selected) {
    doc.circle(x, y, 3).fillColor(PDF_COLORS.radioActive).fill();
  }
};

const drawPdfCheckbox = (doc, x, y, checked) => {
  doc
    .roundedRect(x, y, 12, 12, 2)
    .lineWidth(1)
    .strokeColor(PDF_COLORS.radioInactive)
    .stroke();

  if (checked) {
    doc
      .moveTo(x + 2, y + 6)
      .lineTo(x + 5, y + 9)
      .lineTo(x + 10, y + 3)
      .lineWidth(1.5)
      .strokeColor(PDF_COLORS.radioActive)
      .stroke();
  }
};

const measurePdfTextHeight = (
  doc,
  text,
  fontSize,
  width,
  font = "Helvetica",
  lineGap = PDF_FONT.lineGap,
) => {
  doc.font(font).fontSize(fontSize);
  return doc.heightOfString(text || "", { width, lineGap });
};

const drawPdfFlowText = (doc, text, options = {}) => {
  const {
    font = "Helvetica",
    fontSize = PDF_FONT.option,
    color = PDF_COLORS.body,
    width = PDF_INNER_WIDTH,
    lineGap = PDF_FONT.lineGap,
    indent = 0,
  } = options;

  ensurePdfSpace(
    doc,
    measurePdfTextHeight(doc, text, fontSize, width - indent, font, lineGap) + 4,
  );
  setPdfContentX(doc);
  doc.x += indent;
  doc
    .font(font)
    .fontSize(fontSize)
    .fillColor(color)
    .text(text || "", { width: width - indent, lineGap });
  setPdfContentX(doc);
};

const drawPdfOptionRow = (doc, question, option, contentX) => {
  const optionText = option.text || "";
  const optionFont = option.isCorrect ? "Helvetica-Bold" : "Helvetica";
  const textWidth = PDF_INNER_WIDTH - 32;
  const textHeight = measurePdfTextHeight(
    doc,
    optionText,
    PDF_FONT.option,
    textWidth,
    optionFont,
    PDF_FONT.lineGap,
  );
  const rowHeight = Math.max(18, textHeight + 10);

  ensurePdfSpace(doc, rowHeight + PDF_SPACING.afterOption);
  const rowY = doc.y;

  if (option.isCorrect) {
    drawPdfOptionHighlight(doc, contentX, rowY, PDF_INNER_WIDTH, rowHeight);
  }

  if (question.type === "multiple_answers") {
    drawPdfCheckbox(doc, contentX + 4, rowY + 4, option.isCorrect);
  } else {
    drawPdfRadio(doc, contentX + 12, rowY + rowHeight / 2, option.isCorrect);
  }

  doc.x = contentX + 26;
  doc.y = rowY + 5;
  doc
    .font(optionFont)
    .fontSize(PDF_FONT.option)
    .fillColor(PDF_COLORS.body)
    .text(optionText, { width: textWidth, lineGap: PDF_FONT.lineGap });

  doc.y += PDF_SPACING.afterOption;
  setPdfContentX(doc);
};

const embedPdfQuestionImage = (doc, buffer, contentX) => {
  const maxHeight = 140;
  const image = doc.openImage(buffer);
  const scale = Math.min(
    PDF_INNER_WIDTH / image.width,
    maxHeight / image.height,
    1,
  );
  const width = image.width * scale;
  const height = image.height * scale;

  ensurePdfSpace(doc, height + 10);
  const imageTop = doc.y;
  doc.image(buffer, contentX, imageTop, { width, height });
  doc.y = imageTop + height + 8;
  setPdfContentX(doc);
};

const buildQuizPdf = (doc, quiz, imageBuffers) => {
  const contentX = PDF_MARGIN + PDF_CARD_PADDING;
  doc.y = PDF_MARGIN;
  setPdfContentX(doc);

  ensurePdfSpace(doc, 80);
  const headerStartY = doc.y;
  doc.y = headerStartY + PDF_CARD_PADDING;
  setPdfContentX(doc);

  drawPdfFlowText(doc, quiz.title, {
    font: "Helvetica-Bold",
    fontSize: PDF_FONT.title,
    color: PDF_COLORS.title,
  });
  doc.y += PDF_SPACING.afterTitle;

  if (quiz.sectionHeader) {
    drawPdfFlowText(doc, quiz.sectionHeader, {
      font: "Helvetica-Bold",
      fontSize: PDF_FONT.sectionHeader,
      color: PDF_COLORS.sectionHeader,
    });
    doc.y += PDF_SPACING.afterSection;
  }

  if (quiz.sectionDescription) {
    drawPdfFlowText(doc, quiz.sectionDescription, {
      fontSize: PDF_FONT.sectionDesc,
      color: PDF_COLORS.sectionDesc,
    });
    doc.y += PDF_SPACING.afterSection;
  }

  const metaParts = [
    `Subject: ${quiz.subject?.subjectName || "No Subject"}`,
    `Quarter: ${quiz.quarter || "N/A"}`,
    `Points: ${quiz.quizPoints || 0}`,
  ];
  if (quiz.timeLimit) {
    metaParts.push(`Time: ${quiz.timeLimit} minutes`);
  }

  drawPdfFlowText(doc, metaParts.join("   "), {
    fontSize: PDF_FONT.meta,
    color: PDF_COLORS.meta,
  });

  const headerEndY = doc.y + PDF_CARD_PADDING;
  drawPdfCardBorder(doc, headerStartY, headerEndY);
  doc.y = headerEndY + PDF_SPACING.betweenCards;
  setPdfContentX(doc);

  quiz.questions.forEach((question, index) => {
    if (index > 0) {
      drawPdfQuestionDivider(doc);
    }

    const questionLabel = `${index + 1}. ${question.text}`;
    const questionHeight = measurePdfTextHeight(
      doc,
      questionLabel,
      PDF_FONT.question,
      PDF_INNER_WIDTH,
      "Helvetica-Bold",
      PDF_FONT.lineGap,
    );
    ensurePdfSpace(doc, questionHeight + 40);
    setPdfContentX(doc);

    drawPdfFlowText(doc, questionLabel, {
      font: "Helvetica-Bold",
      fontSize: PDF_FONT.question,
      color: PDF_COLORS.title,
    });
    doc.y += PDF_SPACING.afterQuestion;

    if (question.images?.length) {
      for (const imageUrl of question.images) {
        const buffer = imageBuffers[imageUrl];
        if (!buffer) continue;

        try {
          embedPdfQuestionImage(doc, buffer, contentX);
        } catch (error) {
          console.error("Failed to embed quiz image in PDF:", error.message);
        }
      }
    }

    if (question.type === "short_answer") {
      const inputHeight = 28;
      ensurePdfSpace(doc, inputHeight + 8);
      const inputY = doc.y;
      doc
        .roundedRect(contentX, inputY, PDF_INNER_WIDTH, inputHeight, 6)
        .fillColor(PDF_COLORS.inputBg)
        .fill();
      doc
        .font("Helvetica")
        .fontSize(PDF_FONT.option)
        .fillColor(PDF_COLORS.placeholder)
        .text("Your answer", contentX + 10, inputY + 8, {
          width: PDF_INNER_WIDTH - 20,
          lineGap: PDF_FONT.lineGap,
        });
      doc.y = inputY + inputHeight + 8;
      setPdfContentX(doc);

      if (question.correctAnswers?.length) {
        const correctLines = question.correctAnswers
          .map((answer) => `• ${answer}`)
          .join("\n");
        const answersHeight = measurePdfTextHeight(
          doc,
          correctLines,
          PDF_FONT.option,
          PDF_INNER_WIDTH - 20,
          "Helvetica",
          PDF_FONT.lineGap,
        );
        let boxHeight = answersHeight + 28;
        if (question.caseSensitive) {
          boxHeight += 14;
        }

        ensurePdfSpace(doc, boxHeight + 8);
        const boxY = doc.y;
        doc
          .roundedRect(contentX, boxY, PDF_INNER_WIDTH, boxHeight, 6)
          .fillColor(PDF_COLORS.correctBg)
          .fill();

        doc
          .font("Helvetica-Bold")
          .fontSize(PDF_FONT.option)
          .fillColor(PDF_COLORS.correctTitle)
          .text("Correct answer(s):", contentX + 10, boxY + 8, {
            width: PDF_INNER_WIDTH - 20,
            lineGap: PDF_FONT.lineGap,
          });

        doc
          .font("Helvetica")
          .fontSize(PDF_FONT.option)
          .fillColor(PDF_COLORS.correctAnswer)
          .text(correctLines, contentX + 10, boxY + 22, {
            width: PDF_INNER_WIDTH - 20,
            lineGap: PDF_FONT.lineGap,
          });

        if (question.caseSensitive) {
          doc
            .font("Helvetica-Oblique")
            .fontSize(PDF_FONT.footer)
            .fillColor(PDF_COLORS.correctTitle)
            .text("(Case sensitive)", contentX + 10, doc.y + 2, {
              width: PDF_INNER_WIDTH - 20,
            });
        }

        doc.y = boxY + boxHeight + 8;
        setPdfContentX(doc);
      }
    } else if (question.type === "essay") {
      const lineHeight = 20;
      const lineCount = 3;
      const blockHeight = lineCount * (lineHeight + 4);
      ensurePdfSpace(doc, blockHeight + 8);
      const essayY = doc.y;
      for (let line = 0; line < lineCount; line += 1) {
        doc
          .roundedRect(
            contentX,
            essayY + line * (lineHeight + 4),
            PDF_INNER_WIDTH,
            lineHeight,
            4,
          )
          .fillColor(PDF_COLORS.inputBg)
          .fill();
      }
      doc.y = essayY + blockHeight + 8;
      setPdfContentX(doc);
    } else if (
      question.type === "multiple_choice" ||
      question.type === "true_false" ||
      question.type === "multiple_answers"
    ) {
      question.options.forEach((option) => {
        drawPdfOptionRow(doc, question, option, contentX);
      });
    }

    const typeLabel = (question.type || "").replace(/_/g, " ");
    const footerText = `Type: ${typeLabel}     Points: ${question.itemPoints || 1}`;
    drawPdfFlowText(doc, footerText, {
      fontSize: PDF_FONT.footer,
      color: PDF_COLORS.meta,
    });
    doc.y += PDF_SPACING.afterFooter;
    setPdfContentX(doc);
  });
};

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
      model: "gpt-5.4-mini", // Updated to latest GPT-5.4-mini model
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
    shuffleQuestions,
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
    shuffleQuestions: parseBooleanField(shuffleQuestions) ?? false,
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
    shuffleQuestions,
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
      shuffleQuestions:
        parseBooleanField(shuffleQuestions) ?? quiz.shuffleQuestions,
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

  const data =
    req.user.role === "Student"
      ? quizzes.map((quiz) => applyStudentQuizTransforms(quiz, req.user.id))
      : quizzes;

  res.status(200).json({
    success: true,
    count: data.length,
    data,
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

  const data =
    req.user.role === "Student"
      ? applyStudentQuizTransforms(quiz, req.user.id)
      : quiz;

  res.status(200).json({
    success: true,
    data,
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
    shuffleQuestions: originalQuiz.shuffleQuestions,
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

// @desc    Download quiz as PDF
// @route   GET /api/v1/quizzes/:id/download
// @access  Private/Teacher,Admin
exports.downloadQuizPdf = asyncHandler(async (req, res, next) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate("createdBy", "firstName lastName email")
    .populate("subject", "subjectName gradeLevel section schoolYear");

  if (!quiz) {
    return next(new ErrorResponse("Quiz not found", 404));
  }

  if (
    req.user.role === "Teacher" &&
    quiz.createdBy._id.toString() !== req.user.id
  ) {
    return next(new ErrorResponse("Not authorized to download this quiz", 403));
  }

  const safeFileName = `${quiz.title || "quiz"}`
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  const imageBuffers = await preloadQuizImages(quiz.questions);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFileName}.pdf"`,
  );

  const doc = new PDFDocument({
    size: "A4",
    margin: PDF_MARGIN,
    bufferPages: true,
  });

  doc.pipe(res);
  buildQuizPdf(doc, quiz, imageBuffers);
  doc.end();
});
