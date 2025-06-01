// server.js
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const errorHandler = require('./middleware/errorHandler');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

// Route files
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const courseRoutes = require("./routes/courseRoutes");
const teacherRoutes = require("./routes/teacherRoutes"); // Add teacher routes
const studentRoutes = require("./routes/studentRoutes"); // Add student routes

const app = express();

// Body parser middleware
app.use(express.json());

// Enable CORS (configure origins in production)
app.use(cors());

// Mount routers
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/courses", courseRoutes);
app.use("/api/v1/teachers", teacherRoutes); // Mount teacher routes
app.use("/api/v1/students", studentRoutes); // Mount student routes

// Mount error handler - THIS MUST BE AFTER ALL ROUTES
app.use(errorHandler);

// Basic error handling (implement more robust handling)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ success: false, message: "Something broke!" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
