const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path"); // Add this import
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const { initializeHolidaySystem } = require("./utils/holidaySeeder");

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const analyticsRoutes    = require('./routes/analyticsRoutes');
const authRoutes         = require("./routes/authRoutes");
const userRoutes         = require("./routes/userRoutes");
const discussionRoutes   = require("./routes/discussionRoutes");
const activityRoutes     = require("./routes/activityRoutes");
const gradeRoutes        = require('./routes/gradeRoutes');
const announcementRoutes = require("./routes/announcementRoutes");
const subjectRoutes       = require("./routes/subjectRoutes");
const courseMaterialRoutes = require("./routes/courseMaterialRoutes"); // Add this line
const eventRoutes        = require("./routes/eventRoutes");
const quizRoutes         = require("./routes/quizRoutes");
const sectionRoutes = require("./routes/sectionRoutes");
const teacherRoutes      = require("./routes/teacherRoutes");
const studentRoutes      = require("./routes/studentRoutes");
const schoolRoutes       = require("./routes/schoolRoutes");

const app = express();

// ─── Request logger (catch‐all) ────────────────────────────────────────────────
// This will print every incoming request’s method and full URL to the console:

app.get("/", (req, res) => {
  res.send("GracEdLMS Backend API is running!");
});

app.use((req, res, next) => {
  console.log(`⚡ Incoming request: ${req.method} ${req.originalUrl}`);
  next();
});

// Body parser middleware (still needed for non‐multipart JSON requests)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS (configure origins in production)
app.use(cors({
  origin: ['https://gracedlms.online', 'https://api.gracedlms.online', 'http://localhost:8081'],
  credentials: true,
}));

// ─── SERVE STATIC FILES FROM UPLOADS DIRECTORY ─────────────────────────────────
// This is what you're missing! Add this line:
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Optional: Add logging for file requests
// app.use('/uploads', (req, res, next) => {
  // console.log(`📁 File request: ${req.originalUrl}`);
  // next();
//});

// ─── Mount routers ─────────────────────────────────────────────────────────────
app.use('/api/v1/analytics', analyticsRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1", discussionRoutes);
app.use("/api/v1", activityRoutes);
app.use("/api/v1", gradeRoutes); // Add this line
app.use("/api/v1", announcementRoutes);
app.use("/api/v1/subjects", subjectRoutes);
app.use("/api/v1", courseMaterialRoutes); // Add this line
app.use("/api/v1/events", eventRoutes);
app.use("/api/v1/quizzes", quizRoutes);
app.use("/api/v1/sections", sectionRoutes);
app.use("/api/v1/teachers", teacherRoutes);
app.use("/api/v1/students", studentRoutes);
app.use("/api/v1/school", schoolRoutes);

// ─── Mount error handler (must come after all routes) ─────────────────────────
app.use(errorHandler);

// Basic fallback error handler (in case something slips past errorHandler)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Something broke!" });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  
  // Initialize holiday system automatically
  setTimeout(async () => {
    try {
      await initializeHolidaySystem();
      console.log('🎉 Holiday system ready!');
    } catch (error) {
      console.error('❌ Failed to initialize holiday system:', error);
    }
  }, 3000); // Wait 3 seconds after server start to ensure DB connection is ready
});
