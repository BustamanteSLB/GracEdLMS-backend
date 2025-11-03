const mongoose = require("mongoose");
const Subject = require("../models/Subject");
const Activity = require("../models/Activity");
const Quiz = require("../models/Quiz");
const Grade = require("../models/Grade");
const User = require("../models/User");
const Announcement = require("../models/Announcement");
const Event = require("../models/Event");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");

// @desc    Get teacher analytics dashboard data
// @route   GET /api/v1/analytics/teacher-dashboard
// @access  Private/Teacher
exports.getTeacherAnalytics = asyncHandler(async (req, res, next) => {
  try {
    // Get all subjects taught by the teacher
    const subjects = await Subject.find({
      teacher: req.user.id,
      isArchived: false,
    }).populate("students", "firstName lastName email userId");

    // Get all activities for teacher's subjects
    const subjectIds = subjects.map((subject) => subject._id);
    const activities = await Activity.find({
      subject: { $in: subjectIds },
    })
      .populate("subject", "subjectName")
      .populate("submissions.student", "firstName lastName email");

    // Get all quizzes for teacher's subjects
    const quizzes = await Quiz.find({
      subject: { $in: subjectIds },
      createdBy: req.user.id,
    }).populate("subject", "subjectName");

    // Get all grades for teacher's subjects
    const grades = await Grade.find({
      subject: { $in: subjectIds },
    })
      .populate("student", "firstName lastName email")
      .populate("activity", "title points deadline")
      .populate("subject", "subjectName");

    // Calculate analytics
    let totalStudents = 0;
    let totalActivities = activities.length;
    let pendingSubmissions = 0;
    let recentGrades = 0;
    let upcomingDeadlines = 0;
    const subjectBreakdown = [];
    const recentActivity = [];
    const gradeDistribution = {
      excellent: 0,
      good: 0,
      satisfactory: 0,
      needsImprovement: 0,
    };

    // Get unique students across all subjects
    const uniqueStudentIds = new Set();
    subjects.forEach((subject) => {
      subject.students.forEach((student) => {
        uniqueStudentIds.add(student._id.toString());
      });
    });

    // Calculate grade distribution per student (same as admin logic)
    for (const studentId of uniqueStudentIds) {
      // Get all subjects for this student
      const studentSubjects = subjects.filter((subject) =>
        subject.students.some((s) => s._id.toString() === studentId)
      );

      if (studentSubjects.length === 0) continue;

      let totalSubjectPercentages = 0;
      let validSubjectsCount = 0;

      // Calculate percentage for each subject
      for (const subject of studentSubjects) {
        // Get all activities for this subject
        const subjectActivities = activities.filter(
          (activity) =>
            activity.subject._id.toString() === subject._id.toString()
        );

        // Get all quizzes for this subject
        const subjectQuizzes = quizzes.filter(
          (quiz) =>
            quiz.subject &&
            quiz.subject._id.toString() === subject._id.toString()
        );

        // Get all grades for this student in this subject
        const subjectGrades = grades.filter(
          (grade) =>
            grade.student._id.toString() === studentId &&
            grade.subject._id.toString() === subject._id.toString()
        );

        let subjectTotalPossiblePoints = 0;
        let subjectTotalEarnedPoints = 0;
        let hasGradedItems = false;

        // Add activity scores
        subjectActivities.forEach((activity) => {
          if (activity.points && activity.points > 0) {
            const grade = subjectGrades.find(
              (g) =>
                g.activity &&
                g.activity._id.toString() === activity._id.toString()
            );

            if (grade) {
              subjectTotalPossiblePoints += activity.points;
              subjectTotalEarnedPoints +=
                grade.score + (grade.bonusPoints || 0);
              hasGradedItems = true;
            }
          }
        });

        // Add quiz scores
        subjectQuizzes.forEach((quiz) => {
          if (quiz.quizPoints && quiz.quizPoints > 0) {
            const submission = quiz.quizSubmissions?.find((sub) => {
              const studentMatch =
                typeof sub.student === "object"
                  ? sub.student._id.toString() === studentId
                  : sub.student.toString() === studentId;
              const statusMatch =
                sub.status === "graded" || sub.status === "submitted";
              return studentMatch && statusMatch;
            });

            if (
              submission &&
              submission.quizScore !== undefined &&
              submission.quizScore !== null
            ) {
              subjectTotalPossiblePoints += quiz.quizPoints;
              subjectTotalEarnedPoints += submission.quizScore;
              hasGradedItems = true;
            }
          }
        });

        // Calculate subject percentage if there are graded items
        if (hasGradedItems && subjectTotalPossiblePoints > 0) {
          const subjectPercentage =
            (subjectTotalEarnedPoints / subjectTotalPossiblePoints) * 100;
          totalSubjectPercentages += subjectPercentage;
          validSubjectsCount++;
        }
      }

      // Calculate overall average if student has grades in at least one subject
      if (validSubjectsCount > 0) {
        const overallAverage = totalSubjectPercentages / validSubjectsCount;

        // Categorize into grade distribution
        if (overallAverage >= 90) {
          gradeDistribution.excellent++;
        } else if (overallAverage >= 80) {
          gradeDistribution.good++;
        } else if (overallAverage >= 70) {
          gradeDistribution.satisfactory++;
        } else {
          gradeDistribution.needsImprovement++;
        }
      }
    }

    // Process each subject
    subjects.forEach((subject) => {
      const subjectActivities = activities.filter(
        (activity) => activity.subject._id.toString() === subject._id.toString()
      );

      totalStudents += subject.students?.length || 0;

      // Count pending submissions for this subject
      let subjectPending = 0;
      subjectActivities.forEach((activity) => {
        const submissions = activity.submissions || [];
        const submittedStudents = submissions.length;
        const enrolledStudents = subject.students?.length || 0;
        subjectPending += Math.max(0, enrolledStudents - submittedStudents);

        // Check for upcoming deadlines (within 7 days)
        const deadline = new Date(activity.deadline);
        const now = new Date();
        const daysUntilDeadline = Math.ceil(
          (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntilDeadline <= 7 && daysUntilDeadline > 0) {
          upcomingDeadlines++;
        }

        // Add submissions to recent activity
        submissions.forEach((submission) => {
          recentActivity.push({
            type: "submission",
            title: activity.title,
            student: `${submission.student?.firstName || ""} ${
              submission.student?.lastName || ""
            }`,
            subject: subject.subjectName,
            date: submission.submissionDate,
          });
        });
      });

      pendingSubmissions += subjectPending;

      subjectBreakdown.push({
        subjectName: subject.subjectName,
        studentCount: subject.students?.length || 0,
        activityCount: subjectActivities.length,
        pendingCount: subjectPending,
      });
    });

    // Process grades for recent activity
    grades.forEach((grade) => {
      recentGrades++;

      // Add to recent activity
      recentActivity.push({
        type: "grade",
        title: grade.activity?.title || "Unknown Activity",
        student: `${grade.student?.firstName || ""} ${
          grade.student?.lastName || ""
        }`,
        subject: grade.subject?.subjectName || "Unknown Subject",
        date: grade.updatedAt || grade.createdAt,
      });
    });

    // Add quiz activities to recent activity
    quizzes.forEach((quiz) => {
      recentActivity.push({
        type: "quiz",
        title: quiz.title,
        subject: quiz.subject?.subjectName || "Unknown Subject",
        date: quiz.createdAt,
      });
    });

    // Sort recent activity by date (most recent first)
    recentActivity.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const analyticsData = {
      totalSubjects: subjects.length,
      totalStudents: uniqueStudentIds.size,
      totalActivities,
      totalQuizzes: quizzes.length,
      pendingSubmissions,
      recentGrades,
      upcomingDeadlines,
      subjectBreakdown,
      recentActivity: recentActivity.slice(0, 10), // Latest 10 activities
      gradeDistribution,
    };

    res.status(200).json({
      success: true,
      data: analyticsData,
    });
  } catch (error) {
    console.error("Error fetching teacher analytics:", error);
    return next(new ErrorResponse("Failed to fetch analytics data", 500));
  }
});

// @desc    Get student analytics dashboard data
// @route   GET /api/v1/analytics/student-dashboard
// @access  Private/Student
exports.getStudentAnalytics = asyncHandler(async (req, res, next) => {
  try {
    const studentId = req.user.id;

    console.log("Fetching student analytics for:", studentId);

    // 1. Get enrolled subjects
    const enrolledSubjects = await Subject.find({
      students: studentId,
      isArchived: false,
    }).populate("teacher", "firstName lastName email");

    const subjectIds = enrolledSubjects.map((subject) => subject._id);
    console.log("Enrolled subjects:", enrolledSubjects.length);

    // 2. Get today's date range - Fix timezone issues
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    console.log("Date range:", { startOfDay, endOfDay });

    // 3. Get activities due today or overdue (not completed/graded)
    const activitiesDueToday = await Activity.find({
      subject: { $in: subjectIds },
      deadline: {
        $lte: endOfDay, // Due today or overdue
      },
    }).populate("subject", "subjectName");

    console.log(
      "Activities found (before filtering):",
      activitiesDueToday.length
    );

    // 4. Get published quizzes (no specific deadline filtering for quizzes)
    const availableQuizzes = await Quiz.find({
      subject: { $in: subjectIds },
      status: "published",
    }).populate("subject", "subjectName");

    console.log("Available quizzes:", availableQuizzes.length);

    // 5. Get all activities and quizzes for completion stats
    const allActivities = await Activity.find({
      subject: { $in: subjectIds },
    });

    const allQuizzes = await Quiz.find({
      subject: { $in: subjectIds },
    });

    // 6. Get student's grades for quick lookup
    const studentGrades = await Grade.find({
      student: studentId,
    }).populate("activity", "title");

    const activityGradeMap = new Map();
    studentGrades.forEach((grade) => {
      if (grade.activity) {
        activityGradeMap.set(grade.activity._id.toString(), grade);
      }
    });

    // 7. Filter and process activities that are actually due/overdue and not completed
    const processedActivities = [];

    for (const activity of activitiesDueToday) {
      // Check if student has submitted
      const submission = activity.submissions.find(
        (sub) => sub.student.toString() === studentId
      );

      // Check if activity is graded
      const grade = activityGradeMap.get(activity._id.toString());

      // Skip if already completed/graded unless it's overdue and needs attention
      const activityDeadline = new Date(activity.deadline);
      const isOverdue = activityDeadline < startOfDay;

      // Only show if:
      // 1. Not submitted and deadline is today or overdue
      // 2. Submitted but not graded and deadline was recent (within 7 days)
      let shouldShow = false;
      let status = "pending";

      if (grade) {
        status = "graded";
        // Don't show graded activities in "due today"
        shouldShow = false;
      } else if (submission) {
        status = "completed";
        // Only show completed items if they were submitted today or are awaiting grading
        const submissionDate = new Date(submission.submissionDate);
        const daysSinceSubmission = Math.floor(
          (today.getTime() - submissionDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        shouldShow = daysSinceSubmission <= 1; // Show if submitted today or yesterday
      } else {
        // Not submitted - show if due today or overdue
        shouldShow = activityDeadline >= startOfDay || isOverdue;
      }

      if (shouldShow) {
        processedActivities.push({
          _id: activity._id,
          title: activity.title,
          deadline: activity.deadline,
          subject: activity.subject.subjectName,
          points: activity.points,
          status,
          submissionDate: submission ? submission.submissionDate : null,
          grade: grade
            ? {
                score: grade.score,
                bonusPoints: grade.bonusPoints,
                totalScore: grade.totalScore,
                feedback: grade.feedback,
              }
            : null,
          isOverdue: isOverdue,
        });
      }
    }

    // 8. Filter and process quizzes that are available and not completed
    const processedQuizzes = [];

    for (const quiz of availableQuizzes) {
      // Check if student has submitted
      const submission = quiz.quizSubmissions.find(
        (sub) => sub.student.toString() === studentId
      );

      let status = "pending";
      let shouldShow = true;

      if (submission) {
        if (submission.status === "graded") {
          status = "graded";
          shouldShow = false; // Don't show graded quizzes
        } else {
          status = "completed";
          // Only show if completed today
          const submissionDate = new Date(submission.submissionDate);
          const daysSinceSubmission = Math.floor(
            (today.getTime() - submissionDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          shouldShow = daysSinceSubmission <= 1;
        }
      }

      if (shouldShow) {
        processedQuizzes.push({
          _id: quiz._id,
          title: quiz.title,
          subject: quiz.subject.subjectName,
          timeLimit: quiz.timeLimit,
          questionCount: quiz.questions.length,
          status,
          submissionDate: submission ? submission.submissionDate : null,
          score: submission
            ? {
                quizScore: submission.quizScore,
                maxScore: quiz.quizPoints,
                feedback: submission.feedback,
              }
            : null,
        });
      }
    }

    console.log(
      "Filtered activities for due today:",
      processedActivities.length
    );
    console.log("Filtered quizzes for due today:", processedQuizzes.length);

    // 9. Calculate completion statistics for all activities/quizzes
    const completedActivities = allActivities.filter((activity) =>
      activity.submissions.some(
        (submission) => submission.student.toString() === studentId
      )
    );

    const completedQuizzes = allQuizzes.filter((quiz) =>
      quiz.quizSubmissions.some(
        (submission) => submission.student.toString() === studentId
      )
    );

    // 10. Filter today's items by status
    const pendingTodayActivities = processedActivities.filter(
      (activity) => activity.status === "pending"
    );
    const completedTodayActivities = processedActivities.filter(
      (activity) => activity.status === "completed"
    );
    const gradedTodayActivities = processedActivities.filter(
      (activity) => activity.status === "graded"
    );

    const pendingTodayQuizzes = processedQuizzes.filter(
      (quiz) => quiz.status === "pending"
    );
    const completedTodayQuizzes = processedQuizzes.filter(
      (quiz) => quiz.status === "completed"
    );
    const gradedTodayQuizzes = processedQuizzes.filter(
      (quiz) => quiz.status === "graded"
    );

    // 11. Get latest 2 announcements from all enrolled subjects
    const latestAnnouncements = await Announcement.find({
      subject: { $in: subjectIds },
    })
      .populate("subject", "subjectName")
      .populate("createdBy", "firstName lastName email profilePicture") // Added profilePicture
      .sort({ createdAt: -1 })
      .limit(2);

    // 12. Get events due today
    const eventsDueToday = await Event.find({
      $and: [
        {
          $or: [{ targetAudience: "all" }, { targetAudience: "students" }],
        },
        {
          $or: [
            // Events starting today
            {
              startDate: {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            },
            // Events ongoing today
            {
              startDate: { $lte: endOfDay },
              endDate: { $gte: startOfDay },
            },
          ],
        },
      ],
    })
      .populate("createdBy", "firstName lastName")
      .sort({ startDate: 1 });

    // 13. Get recent grades for motivation
    const recentGrades = await Grade.find({
      student: studentId,
      subject: { $in: subjectIds },
    })
      .populate("activity", "title")
      .populate("subject", "subjectName")
      .sort({ updatedAt: -1 })
      .limit(5);

    const analyticsData = {
      enrolledSubjects: {
        count: enrolledSubjects.length,
        subjects: enrolledSubjects.map((subject) => ({
          _id: subject._id,
          subjectName: subject.subjectName,
          teacher: subject.teacher
            ? {
                firstName: subject.teacher.firstName,
                lastName: subject.teacher.lastName,
                email: subject.teacher.email,
              }
            : null,
          gradeLevel: subject.gradeLevel,
          section: subject.section,
        })),
      },
      duesToday: {
        totalCount: processedActivities.length + processedQuizzes.length,
        pendingCount:
          pendingTodayActivities.length + pendingTodayQuizzes.length,
        completedCount:
          completedTodayActivities.length + completedTodayQuizzes.length,
        gradedCount: gradedTodayActivities.length + gradedTodayQuizzes.length,
        activities: {
          all: processedActivities,
          pending: pendingTodayActivities,
          completed: completedTodayActivities,
          graded: gradedTodayActivities,
        },
        quizzes: {
          all: processedQuizzes,
          pending: pendingTodayQuizzes,
          completed: completedTodayQuizzes,
          graded: gradedTodayQuizzes,
        },
      },
      completed: {
        activitiesCount: completedActivities.length,
        quizzesCount: completedQuizzes.length,
        totalActivities: allActivities.length,
        totalQuizzes: allQuizzes.length,
        activitiesCompletionRate:
          allActivities.length > 0
            ? Math.round(
                (completedActivities.length / allActivities.length) * 100
              )
            : 0,
        quizzesCompletionRate:
          allQuizzes.length > 0
            ? Math.round((completedQuizzes.length / allQuizzes.length) * 100)
            : 0,
      },
      announcements: latestAnnouncements.map((announcement) => ({
        _id: announcement._id,
        title: announcement.title,
        content: announcement.content,
        createdAt: announcement.createdAt,
        subject: announcement.subject.subjectName,
        author: {
          firstName: announcement.createdBy.firstName,
          lastName: announcement.createdBy.lastName,
          profilePicture: announcement.createdBy.profilePicture, // Added profilePicture
        },
      })),
      events: eventsDueToday.map((event) => ({
        _id: event._id,
        title: event.title,
        header: event.header,
        body: event.body,
        startDate: event.startDate,
        endDate: event.endDate,
        priority: event.priority,
        eventType: event.eventType,
        status: event.status,
      })),
      recentGrades: recentGrades.map((grade) => ({
        _id: grade._id,
        score: grade.score,
        bonusPoints: grade.bonusPoints,
        totalScore: grade.totalScore,
        activity: grade.activity ? grade.activity.title : "Unknown Activity",
        subject: grade.subject.subjectName,
        gradedAt: grade.updatedAt,
      })),
      summary: {
        totalSubjects: enrolledSubjects.length,
        totalDuesToday: processedActivities.length + processedQuizzes.length,
        totalCompleted: completedActivities.length + completedQuizzes.length,
        totalPending:
          allActivities.length -
          completedActivities.length +
          (allQuizzes.length - completedQuizzes.length),
        eventsToday: eventsDueToday.length,
        newAnnouncements: latestAnnouncements.length,
      },
    };

    console.log("Final analytics summary:", analyticsData.summary);

    res.status(200).json({
      success: true,
      data: analyticsData,
    });
  } catch (error) {
    console.error("Error fetching student analytics:", error);
    return next(
      new ErrorResponse("Failed to fetch student analytics data", 500)
    );
  }
});

// @desc    Get admin analytics dashboard data
// @route   GET /api/v1/analytics/admin-dashboard
// @access  Private/Admin
exports.getAdminAnalytics = asyncHandler(async (req, res, next) => {
  const { schoolYear, gradeLevel } = req.query;

  try {
    // Get current school year if not provided
    const currentYear = new Date().getFullYear();
    const defaultSchoolYear =
      schoolYear || `${currentYear} - ${currentYear + 1}`;
    const selectedGrade = gradeLevel || "Grade 1";

    console.log("Admin Analytics Query:", {
      schoolYear: defaultSchoolYear,
      gradeLevel: selectedGrade,
    });

    // 1. Get enrollment data by grade level for the selected school year
    const enrollmentByGrade = [];
    for (let grade = 1; grade <= 6; grade++) {
      const gradeString = `Grade ${grade}`;

      // Get subjects for this grade and school year
      const gradeSubjects = await Subject.find({
        gradeLevel: gradeString,
        schoolYear: defaultSchoolYear,
        isArchived: false,
      }).populate("students", "firstName lastName email sex userId");

      // Count unique students across all subjects for this grade
      const uniqueStudentIds = new Set();
      gradeSubjects.forEach((subject) => {
        subject.students.forEach((student) => {
          uniqueStudentIds.add(student._id.toString());
        });
      });

      enrollmentByGrade.push({
        grade: gradeString,
        enrolledStudents: uniqueStudentIds.size,
        totalSubjects: gradeSubjects.length,
      });
    }

    // 2. Get teachers by grade level (1-6)
    const teachersByGrade = [];
    for (let grade = 1; grade <= 6; grade++) {
      const gradeString = `Grade ${grade}`;

      // Get unique teachers for this grade level
      const gradeSubjects = await Subject.find({
        gradeLevel: gradeString,
        schoolYear: defaultSchoolYear,
        isArchived: false,
        teacher: { $ne: null },
      }).populate("teacher", "firstName lastName email userId");

      const uniqueTeachers = [];
      const teacherIds = new Set();

      gradeSubjects.forEach((subject) => {
        if (
          subject.teacher &&
          !teacherIds.has(subject.teacher._id.toString())
        ) {
          teacherIds.add(subject.teacher._id.toString());
          uniqueTeachers.push({
            _id: subject.teacher._id,
            firstName: subject.teacher.firstName,
            lastName: subject.teacher.lastName,
            email: subject.teacher.email,
            userId: subject.teacher.userId,
            subjectsCount: gradeSubjects.filter(
              (s) =>
                s.teacher &&
                s.teacher._id.toString() === subject.teacher._id.toString()
            ).length,
          });
        }
      });

      teachersByGrade.push({
        grade: gradeString,
        teachers: uniqueTeachers,
        totalTeachers: uniqueTeachers.length,
      });
    }

    // 3. Get students by gender for selected grade
    const selectedGradeSubjects = await Subject.find({
      gradeLevel: selectedGrade,
      schoolYear: defaultSchoolYear,
      isArchived: false,
    }).populate(
      "students",
      "firstName lastName email sex userId profilePicture"
    );

    // Get unique students for the selected grade
    const uniqueStudents = new Map();
    selectedGradeSubjects.forEach((subject) => {
      subject.students.forEach((student) => {
        if (!uniqueStudents.has(student._id.toString())) {
          uniqueStudents.set(student._id.toString(), student);
        }
      });
    });

    const studentsArray = Array.from(uniqueStudents.values());
    const femaleStudents = studentsArray.filter(
      (student) => student.sex && student.sex.toLowerCase() === "female"
    );
    const maleStudents = studentsArray.filter(
      (student) => student.sex && student.sex.toLowerCase() === "male"
    );

    // 4. Calculate honor students (90% average or above) for selected grade
    const honorStudents = [];

    for (const student of studentsArray) {
      // Get all subjects for this student in the selected grade level
      const studentSubjects = await Subject.find({
        gradeLevel: selectedGrade,
        schoolYear: defaultSchoolYear,
        isArchived: false,
        students: student._id,
      });

      if (studentSubjects.length === 0) continue;

      let totalSubjectPercentages = 0;
      let validSubjectsCount = 0;

      // Calculate percentage for each subject
      for (const subject of studentSubjects) {
        // Get all activities for this subject
        const subjectActivities = await Activity.find({
          subject: subject._id,
        });

        // Get all quizzes for this subject
        const subjectQuizzes = await Quiz.find({
          subject: subject._id,
          status: { $in: ["published", "graded", "closed"] },
        });

        // Get all grades for this student in this subject
        const subjectGrades = await Grade.find({
          student: student._id,
          subject: subject._id,
        }).populate("activity", "points quarter");

        let subjectTotalPossiblePoints = 0;
        let subjectTotalEarnedPoints = 0;
        let hasGradedItems = false;

        // Add activity scores
        subjectActivities.forEach((activity) => {
          if (activity.points && activity.points > 0) {
            const grade = subjectGrades.find(
              (g) =>
                g.activity &&
                g.activity._id.toString() === activity._id.toString()
            );

            if (grade) {
              subjectTotalPossiblePoints += activity.points;
              subjectTotalEarnedPoints +=
                grade.score + (grade.bonusPoints || 0);
              hasGradedItems = true;
            }
          }
        });

        // Add quiz scores
        subjectQuizzes.forEach((quiz) => {
          if (quiz.quizPoints && quiz.quizPoints > 0) {
            const submission = quiz.quizSubmissions?.find((sub) => {
              const studentMatch =
                typeof sub.student === "object"
                  ? sub.student._id.toString() === student._id.toString()
                  : sub.student.toString() === student._id.toString();
              const statusMatch =
                sub.status === "graded" || sub.status === "submitted";
              return studentMatch && statusMatch;
            });

            if (
              submission &&
              submission.quizScore !== undefined &&
              submission.quizScore !== null
            ) {
              subjectTotalPossiblePoints += quiz.quizPoints;
              subjectTotalEarnedPoints += submission.quizScore;
              hasGradedItems = true;
            }
          }
        });

        // Calculate subject percentage if there are graded items
        if (hasGradedItems && subjectTotalPossiblePoints > 0) {
          const subjectPercentage =
            (subjectTotalEarnedPoints / subjectTotalPossiblePoints) * 100;
          totalSubjectPercentages += subjectPercentage;
          validSubjectsCount++;

          console.log(
            `Subject ${subject.subjectName} for ${student.firstName} ${student.lastName}:`,
            {
              totalPossible: subjectTotalPossiblePoints,
              totalEarned: subjectTotalEarnedPoints,
              percentage: subjectPercentage.toFixed(2) + "%",
            }
          );
        }
      }

      // Calculate overall average if student has grades in at least one subject
      if (validSubjectsCount > 0) {
        const overallAverage = totalSubjectPercentages / validSubjectsCount;

        console.log(
          `Student ${student.firstName} ${student.lastName} overall calculation:`,
          {
            totalSubjectPercentages: totalSubjectPercentages.toFixed(2),
            validSubjectsCount,
            overallAverage: overallAverage.toFixed(2) + "%",
          }
        );

        if (overallAverage >= 90) {
          honorStudents.push({
            ...student.toObject(),
            averageGrade: Math.round(overallAverage * 100) / 100,
            subjectsWithGrades: validSubjectsCount,
            totalSubjectsEnrolled: studentSubjects.length,
            subjectBreakdown: await Promise.all(
              studentSubjects.map(async (subject) => {
                // Get detailed breakdown for each subject
                const subjectActivities = await Activity.find({
                  subject: subject._id,
                });
                const subjectQuizzes = await Quiz.find({
                  subject: subject._id,
                  status: { $in: ["published", "graded", "closed"] },
                });
                const subjectGrades = await Grade.find({
                  student: student._id,
                  subject: subject._id,
                }).populate("activity", "points quarter");

                let subjectTotalPossiblePoints = 0;
                let subjectTotalEarnedPoints = 0;
                let hasGradedItems = false;

                // Calculate for this subject
                subjectActivities.forEach((activity) => {
                  if (activity.points && activity.points > 0) {
                    const grade = subjectGrades.find(
                      (g) =>
                        g.activity &&
                        g.activity._id.toString() === activity._id.toString()
                    );
                    if (grade) {
                      subjectTotalPossiblePoints += activity.points;
                      subjectTotalEarnedPoints +=
                        grade.score + (grade.bonusPoints || 0);
                      hasGradedItems = true;
                    }
                  }
                });

                subjectQuizzes.forEach((quiz) => {
                  if (quiz.quizPoints && quiz.quizPoints > 0) {
                    const submission = quiz.quizSubmissions?.find((sub) => {
                      const studentMatch =
                        typeof sub.student === "object"
                          ? sub.student._id.toString() ===
                            student._id.toString()
                          : sub.student.toString() === student._id.toString();
                      const statusMatch =
                        sub.status === "graded" || sub.status === "submitted";
                      return studentMatch && statusMatch;
                    });
                    if (
                      submission &&
                      submission.quizScore !== undefined &&
                      submission.quizScore !== null
                    ) {
                      subjectTotalPossiblePoints += quiz.quizPoints;
                      subjectTotalEarnedPoints += submission.quizScore;
                      hasGradedItems = true;
                    }
                  }
                });

                const subjectPercentage =
                  hasGradedItems && subjectTotalPossiblePoints > 0
                    ? (subjectTotalEarnedPoints / subjectTotalPossiblePoints) *
                      100
                    : 0;

                return {
                  subjectName: subject.subjectName,
                  percentage: hasGradedItems
                    ? Math.round(subjectPercentage * 100) / 100
                    : null,
                  totalPossiblePoints: subjectTotalPossiblePoints,
                  totalEarnedPoints: subjectTotalEarnedPoints,
                  hasGrades: hasGradedItems,
                };
              })
            ),
          });
        }
      }
    }

    // Sort honor students by average grade (highest first)
    honorStudents.sort((a, b) => b.averageGrade - a.averageGrade);

    console.log(
      `Honor students calculation complete. Found ${honorStudents.length} honor students:`,
      honorStudents.map((s) => ({
        name: `${s.firstName} ${s.lastName}`,
        average: s.averageGrade + "%",
        subjectsWithGrades: s.subjectsWithGrades,
        totalSubjects: s.totalSubjectsEnrolled,
      }))
    );

    // 5. Get available school years for dropdown
    const availableSchoolYears = await Subject.distinct("schoolYear", {
      isArchived: false,
    });

    // 6. Get summary statistics
    const totalStudents = studentsArray.length;
    const totalTeachers = await User.countDocuments({
      role: "Teacher",
      status: "active",
    });
    const totalSubjects = await Subject.countDocuments({
      schoolYear: defaultSchoolYear,
      isArchived: false,
    });

    const analyticsData = {
      schoolYear: defaultSchoolYear,
      selectedGrade,
      enrollmentByGrade,
      teachersByGrade,
      selectedGradeStudents: {
        total: totalStudents,
        female: femaleStudents,
        male: maleStudents,
        femaleCount: femaleStudents.length,
        maleCount: maleStudents.length,
      },
      honorStudents: {
        students: honorStudents,
        count: honorStudents.length,
      },
      summary: {
        totalStudents: await User.countDocuments({
          role: "Student",
          status: "active",
        }),
        totalTeachers,
        totalSubjects,
        availableSchoolYears: availableSchoolYears.sort().reverse(),
      },
    };

    console.log("Analytics Data Summary:", {
      enrollmentCount: enrollmentByGrade.length,
      teachersCount: teachersByGrade.length,
      selectedGradeStudents: totalStudents,
      honorStudentsCount: honorStudents.length,
    });

    res.status(200).json({
      success: true,
      data: analyticsData,
    });
  } catch (error) {
    console.error("Error fetching admin analytics:", error);
    return next(new ErrorResponse("Failed to fetch admin analytics data", 500));
  }
});

// @desc    Get subject grades for analytics
// @route   GET /api/v1/analytics/subjects/:subjectId/grades
// @access  Private/Teacher,Admin
exports.getSubjectGrades = asyncHandler(async (req, res, next) => {
  const { subjectId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return next(new ErrorResponse("Invalid subject ID format", 400));
  }

  const subject = await Subject.findById(subjectId);
  if (!subject) {
    return next(new ErrorResponse("Subject not found", 404));
  }

  // Authorization check
  if (
    req.user.role === "Teacher" &&
    (!subject.teacher || subject.teacher.toString() !== req.user.id)
  ) {
    return next(
      new ErrorResponse("Not authorized to view grades for this subject", 403)
    );
  }

  const grades = await Grade.find({ subject: subjectId })
    .populate("student", "firstName lastName email userId")
    .populate("activity", "title points deadline quarter")
    .populate("gradedBy", "firstName lastName")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: grades.length,
    data: grades,
  });
});

// @desc    Get detailed student information for a specific grade
// @route   GET /api/v1/analytics/grade-students/:gradeLevel
// @access  Private/Admin
exports.getGradeStudentDetails = asyncHandler(async (req, res, next) => {
  const { gradeLevel } = req.params;
  const { schoolYear, gender } = req.query;

  try {
    const currentYear = new Date().getFullYear();
    const selectedSchoolYear =
      schoolYear || `${currentYear} - ${currentYear + 1}`;

    // Get subjects for the specified grade and school year
    const gradeSubjects = await Subject.find({
      gradeLevel,
      schoolYear: selectedSchoolYear,
      isArchived: false,
    }).populate(
      "students",
      "firstName lastName email sex userId profilePicture"
    );

    // Get unique students for the grade
    const uniqueStudents = new Map();
    gradeSubjects.forEach((subject) => {
      subject.students.forEach((student) => {
        if (!uniqueStudents.has(student._id.toString())) {
          uniqueStudents.set(student._id.toString(), {
            ...student.toObject(),
            subjectsEnrolled: [],
          });
        }
        // Add subject to student's enrolled subjects
        uniqueStudents.get(student._id.toString()).subjectsEnrolled.push({
          _id: subject._id,
          subjectName: subject.subjectName,
          section: subject.section,
        });
      });
    });

    let studentsArray = Array.from(uniqueStudents.values());

    // Filter by gender if specified
    if (gender && gender !== "all") {
      studentsArray = studentsArray.filter(
        (student) =>
          student.sex && student.sex.toLowerCase() === gender.toLowerCase()
      );
    }

    // Sort students alphabetically by last name
    studentsArray.sort((a, b) => a.lastName.localeCompare(b.lastName));

    res.status(200).json({
      success: true,
      count: studentsArray.length,
      data: {
        gradeLevel,
        schoolYear: selectedSchoolYear,
        gender: gender || "all",
        students: studentsArray,
      },
    });
  } catch (error) {
    console.error("Error fetching grade student details:", error);
    return next(new ErrorResponse("Failed to fetch student details", 500));
  }
});
