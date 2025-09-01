const User = require("../models/User");
const Admin = require("../models/Admin");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { bucket } = require("../config/firebaseService"); // Add Firebase import

// Configure multer for file uploads (updated to handle both Excel and images)
const storage = multer.memoryStorage(); // Use memory storage for Firebase

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "excelFile") {
      // Excel file validation
      const allowedTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel", // .xls
      ];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only Excel files (.xlsx, .xls) are allowed!"), false);
      }
    } else if (file.fieldname === "profileImage") {
      // Image file validation
      const allowedImageTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      if (allowedImageTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new Error(
            "Only image files (JPEG, JPG, PNG, GIF, WebP) are allowed for profile pictures!"
          ),
          false
        );
      }
    } else {
      cb(new Error("Unexpected field name!"), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Helper function to upload image to Firebase Storage
const uploadImageToFirebase = async (file, folder = "profile-pictures") => {
  try {
    const fileName = `${folder}/${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${path.extname(file.originalname)}`;
    const fileUpload = bucket.file(fileName);

    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
      public: true, // Make the file publicly accessible
    });

    return new Promise((resolve, reject) => {
      stream.on("error", (error) => {
        console.error("Firebase upload error:", error);
        reject(error);
      });

      stream.on("finish", async () => {
        try {
          // Make the file public
          await fileUpload.makePublic();

          // Get the public URL
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
          resolve(publicUrl);
        } catch (error) {
          console.error("Error making file public:", error);
          reject(error);
        }
      });

      stream.end(file.buffer);
    });
  } catch (error) {
    console.error("Error uploading to Firebase:", error);
    throw error;
  }
};

// @desc    Upload profile picture to Firebase Storage
// @route   POST /api/v1/users/upload-profile-picture
// @access  Private/Admin
const uploadProfilePicture = asyncHandler(async (req, res, next) => {
  upload.single("profileImage")(req, res, async (err) => {
    if (err) {
      return next(new ErrorResponse(`File upload error: ${err.message}`, 400));
    }

    if (!req.file) {
      return next(new ErrorResponse("Please upload an image file", 400));
    }

    try {
      console.log("Uploading profile picture to Firebase Storage...");

      // Upload to Firebase Storage
      const firebaseUrl = await uploadImageToFirebase(
        req.file,
        "profile-pictures"
      );

      console.log("Profile picture uploaded successfully:", firebaseUrl);

      res.status(200).json({
        success: true,
        message: "Profile picture uploaded successfully",
        data: {
          url: firebaseUrl,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
      });
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      return next(
        new ErrorResponse(
          `Error uploading profile picture: ${error.message}`,
          500
        )
      );
    }
  });
});

// @desc    Create a new user by Admin
// @route   POST /api/v1/users
// @access  Private/Admin
const createUser = asyncHandler(async (req, res, next) => {
  const {
    username,
    firstName,
    middleName,
    lastName,
    email,
    password,
    phoneNumber,
    address,
    role,
    sex,
    profilePicture,
  } = req.body;

  // Add 'sex' to required field check
  if (
    !username ||
    !firstName ||
    !lastName ||
    !email ||
    !password ||
    !phoneNumber ||
    !address ||
    !role ||
    !sex
  ) {
    return next(
      new ErrorResponse(
        "Missing required fields for user creation by admin, including sex",
        400
      )
    );
  }

  // Validate enum for sex
  const validSexValues = ["Male", "Female", "Other"];
  if (sex && !validSexValues.includes(sex)) {
    return next(
      new ErrorResponse(
        `Invalid value for sex. Allowed values are: ${validSexValues.join(
          ", "
        )}.`,
        400
      )
    );
  }

  let newUser;
  const userData = {
    username,
    firstName,
    middleName,
    lastName,
    email,
    password,
    phoneNumber,
    address,
    role,
    sex,
    status: "active", // Always set to 'active' for admin-created users
    profilePicture,
  };

  switch (role) {
    case "Admin":
      newUser = await Admin.create(userData);
      break;
    case "Teacher":
      newUser = await Teacher.create(userData);
      break;
    case "Student":
      newUser = await Student.create(userData);
      break;
    default:
      return next(
        new ErrorResponse(
          `Invalid user role '${role}' specified for creation`,
          400
        )
      );
  }

  const responseUser = newUser.toObject();
  delete responseUser.password;

  res.status(201).json({
    success: true,
    data: responseUser,
    message: "User account created successfully with active status",
  });
});

// @desc    Get all users (with filtering and pagination options)
// @route   GET /api/v1/users
// @access  Private/Admin
const getAllUsers = asyncHandler(async (req, res, next) => {
  // Basic filtering (extend as needed)
  const queryObj = { ...req.query };
  const excludedFields = ["page", "sort", "limit", "fields"];
  excludedFields.forEach((el) => delete queryObj[el]);

  // Log the query object being used
  console.log("Backend: Query object for getAllUsers:", queryObj);

  // Filter for non-archived users by default, unless 'status' is specified in query
  if (!queryObj.status) {
    queryObj.status = { $ne: "archived" };
  } else if (queryObj.status === "all") {
    // Allow fetching all including archived
    delete queryObj.status;
  }

  let query = User.find(queryObj);

  // Conditionally populate enrolledSubjects for Student role
  if (queryObj.role === "Student") {
    query = query.populate({
      path: "enrolledSubjects",
      select: "_id", // Only need the ID to check enrollment status
    });
  }

  // Sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(",").join(" ");
    query = query.sort(sortBy);
  } else {
    query = query.sort("-createdAt"); // Default sort
  }

  // Field limiting
  if (req.query.fields) {
    const fields = req.query.fields.split(",").join(" ");
    query = query.select(fields);
  } else {
    query = query.select("-password +temporaryPassword"); // Default select
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await User.countDocuments(queryObj); // Count matching documents before pagination

  query = query.skip(startIndex).limit(limit);

  const users = await query;

  // Log the fetched users
  console.log("Backend: Fetched users:", users);

  // Pagination result
  const pagination = {};
  if (endIndex < total) {
    pagination.next = { page: page + 1, limit };
  }
  if (startIndex > 0) {
    pagination.prev = { page: page - 1, limit };
  }

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    pagination,
    data: users,
  });
});

// @desc    Get a single user by ID
// @route   GET /api/v1/users/:id
// @access  Private/Admin
const getUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid ID format: ${req.params.id}`, 400));
  }
  // Admin can view any user, including archived ones if they need to
  const user = await User.findById(req.params.id).select("-password");

  if (!user) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Update a user by ID (by Admin)
// @route   PUT /api/v1/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid ID format: ${req.params.id}`, 400));
  }

  // Admin can update most fields. Password changes should be handled carefully.
  // Explicitly exclude password from this general update route
  const { password, ...updateData } = req.body;

  if (password) {
    // If password is sent, reject it or redirect to dedicated password update route
    return next(
      new ErrorResponse(
        "Password updates for other users should be handled via a dedicated password update route.",
        400
      )
    );
  }

  // Check if userId is being updated and validate uniqueness
  if (updateData.userId) {
    const existingUserWithUserId = await User.findOne({
      userId: updateData.userId,
      _id: { $ne: req.params.id }, // Exclude the current user being updated
    });

    if (existingUserWithUserId) {
      return next(
        new ErrorResponse(
          `User ID '${updateData.userId}' is already taken by another user.`,
          400
        )
      );
    }
  }

  // Allow email and username to be updated
  const fieldsToUpdate = {
    userId: updateData.userId, // <<< ALLOW USER ID CHANGE BY ADMIN
    username: updateData.username,
    firstName: updateData.firstName,
    middleName: updateData.middleName,
    lastName: updateData.lastName,
    email: updateData.email, // <<< ALLOW EMAIL CHANGE HERE
    phoneNumber: updateData.phoneNumber,
    address: updateData.address,
    profilePicture: updateData.profilePicture,
    sex: updateData.sex,
    role: updateData.role, // <<< ALLOW ROLE CHANGE BY ADMIN
    status: updateData.status, // <<< ALLOW STATUS CHANGE BY ADMIN
  };

  // Validate enum for sex if provided
  const validSexValues = ["Male", "Female", "Other"];
  if (fieldsToUpdate.sex && !validSexValues.includes(fieldsToUpdate.sex)) {
    return next(
      new ErrorResponse(
        `Invalid value for sex. Allowed values are: ${validSexValues.join(
          ", "
        )}.`,
        400
      )
    );
  }

  // Validate enum for role if provided
  const validRoleValues = ["Admin", "Teacher", "Student"];
  if (fieldsToUpdate.role && !validRoleValues.includes(fieldsToUpdate.role)) {
    return next(
      new ErrorResponse(
        `Invalid value for role. Allowed values are: ${validRoleValues.join(
          ", "
        )}.`,
        400
      )
    );
  }

  // Validate enum for status if provided
  const validStatusValues = [
    "active",
    "inactive",
    "suspended",
    "pending",
    "archived",
  ];
  if (
    fieldsToUpdate.status &&
    !validStatusValues.includes(fieldsToUpdate.status)
  ) {
    return next(
      new ErrorResponse(
        `Invalid value for status. Allowed values are: ${validStatusValues.join(
          ", "
        )}.`,
        400
      )
    );
  }

  // Remove undefined fields so they don't overwrite existing data with null
  Object.keys(fieldsToUpdate).forEach(
    (key) => fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );

  if (Object.keys(fieldsToUpdate).length === 0) {
    return next(new ErrorResponse("No details provided for update", 400));
  }

  // Find and update the user.
  // Mongoose will run schema validators on the fields being updated.
  const user = await User.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
    new: true, // Return the modified document rather than the original
    runValidators: true, // Run schema validators on this update
  }).select("-password"); // Exclude password from response

  if (!user) {
    return next(new ErrorResponse("User not found for update", 404));
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Update user password (Admin only)
// @route   PUT /api/v1/users/:id/password
// @access  Private/Admin
const updateUserPassword = asyncHandler(async (req, res, next) => {
  const { newPassword } = req.body;

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse("Invalid user ID", 400));
  }

  if (!newPassword) {
    return next(new ErrorResponse("Please provide a new password", 400));
  }

  // You might want to add password complexity/length validation here as well
  // if it's not already handled by the User model's pre-save hook.
  if (newPassword.length < 8) {
    // Example validation
    return next(
      new ErrorResponse("New password must be at least 8 characters long.", 400)
    );
  }

  // Find the user by ID and select the password field so it can be modified and hashed
  const user = await User.findById(req.params.id).select("+password");

  if (!user) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }

  // Update password field. The pre-save hook in the User model will hash this.
  user.password = newPassword;
  await user.save(); // Save the user to trigger the pre-save hook for hashing

  res.status(200).json({
    success: true,
    message: "User password updated successfully",
  });
});

// @desc    Delete a user by ID (soft delete by Admin)
// @route   DELETE /api/v1/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid ID format: ${req.params.id}`, 400));
  }
  // Prevent admin from archiving themselves or the last active admin
  const userToArchive = await User.findById(req.params.id);
  if (!userToArchive) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }
  if (userToArchive._id.equals(req.user.id)) {
    return next(new ErrorResponse("You cannot archive your own account.", 400));
  }

  userToArchive.status = "archived";
  await userToArchive.save({ validateBeforeSave: false }); // Bypass some validations if needed for archival

  res.status(200).json({
    success: true,
    message: `User ${userToArchive.username} archived successfully`,
    data: { id: userToArchive._id, status: userToArchive.status },
  });
});

// @desc    Restore a soft-deleted user by ID (set status to 'active' or 'pending')
// @route   PUT /api/v1/users/:id/restore
// @access  Private/Admin
const restoreUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid ID format: ${req.params.id}`, 400));
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status || "pending" }, // Admin can choose status or default to pending
    { new: true, runValidators: true }
  ).select("-password");

  if (!user) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }
  if (user.status === "archived") {
    // Ensure we are restoring from archived
    user.status = req.body.status || "pending"; // Or 'active'
    await user.save();
  } else if (user.status !== "pending" && user.status !== "active") {
    return next(
      new ErrorResponse(
        `User is not archived. Current status: ${user.status}`,
        400
      )
    );
  }

  res.status(200).json({
    success: true,
    message: `User ${user.username} status updated to '${user.status}' successfully`,
    data: user,
  });
});

// @desc    Permanently delete a user by ID (by Admin)
// @route   DELETE /api/v1/users/:id/permanent
// @access  Private/Admin
const permanentDeleteUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid ID format: ${req.params.id}`, 400));
  }

  const userToDelete = await User.findById(req.params.id);

  if (!userToDelete) {
    return next(
      new ErrorResponse(`User not found with id of ${req.params.id}`, 404)
    );
  }

  // Optional: Add checks to prevent deleting critical users, e.g., the last admin.
  // This check is critical if an admin can delete other admins.
  if (userToDelete.role === "Admin") {
    // Example: Prevent deleting the current logged-in admin (self-deletion) via this route
    if (userToDelete._id.equals(req.user.id)) {
      return next(
        new ErrorResponse(
          "You cannot permanently delete your own account via this route.",
          400
        )
      );
    }
  }

  await User.findByIdAndDelete(req.params.id);

  res.status(200).json({
    // 200 OK or 204 No Content are common for successful deletions
    success: true,
    message: `User ${userToDelete.username} (ID: ${req.params.id}) permanently deleted successfully.`,
    // No data is typically sent back, or just a confirmation.
  });
});

// @desc    Create multiple users by Admin via JSON/CSV upload
// @route   POST /api/v1/users/bulk
// @access  Private/Admin
const createMultipleUsers = asyncHandler(async (req, res, next) => {
  const usersData = req.body;

  if (!Array.isArray(usersData) || usersData.length === 0) {
    return next(
      new ErrorResponse(
        "Request body must be a non-empty array of user objects.",
        400
      )
    );
  }

  const createdUsers = [];
  const errors = [];
  const validSexValues = ["Male", "Female", "Other"];
  const validRoleValues = ["Admin", "Teacher", "Student"];

  for (let i = 0; i < usersData.length; i++) {
    const userData = usersData[i];
    const {
      username,
      firstName,
      middleName,
      lastName,
      email,
      password,
      phoneNumber,
      address,
      role,
      sex,
      profilePicture,
    } = userData;

    // --- Start Basic Validation for each user object ---
    const currentItemErrors = [];
    if (!username) currentItemErrors.push("username is required.");
    if (!firstName) currentItemErrors.push("firstName is required.");
    if (!lastName) currentItemErrors.push("lastName is required.");
    if (!email) currentItemErrors.push("email is required.");
    if (!password) currentItemErrors.push("password is required.");
    if (!phoneNumber) currentItemErrors.push("phoneNumber is required.");
    if (!address) currentItemErrors.push("address is required.");
    if (!role) currentItemErrors.push("role is required.");
    if (!sex) currentItemErrors.push("sex is required.");

    if (role && !validRoleValues.includes(role)) {
      currentItemErrors.push(
        `Invalid role '${role}'. Allowed: ${validRoleValues.join(", ")}.`
      );
    }
    if (sex && !validSexValues.includes(sex)) {
      currentItemErrors.push(
        `Invalid sex '${sex}'. Allowed: ${validSexValues.join(", ")}.`
      );
    }
    // --- End Basic Validation ---

    if (currentItemErrors.length > 0) {
      errors.push({
        index: i,
        userIdentifier: username || email || `Row ${i + 1}`,
        messages: currentItemErrors,
        data: userData,
      });
      continue;
    }

    // Check for existing username or email to prevent duplicates
    // This adds DB queries per user; for very large batches, consider other strategies.
    try {
      const existingUserByUsername = await User.findOne({ username });
      if (existingUserByUsername) {
        errors.push({
          index: i,
          userIdentifier: username,
          messages: [`Username '${username}' already exists.`],
          data: userData,
        });
        continue;
      }
      const existingUserByEmail = await User.findOne({ email });
      if (existingUserByEmail) {
        errors.push({
          index: i,
          userIdentifier: email,
          messages: [`Email '${email}' already exists.`],
          data: userData,
        });
        continue;
      }
    } catch (dbCheckError) {
      errors.push({
        index: i,
        userIdentifier: username || email,
        messages: [`Error checking for existing user: ${dbCheckError.message}`],
        data: userData,
      });
      continue;
    }

    try {
      let newUser;
      const fullUserData = {
        username,
        firstName,
        middleName,
        lastName,
        email,
        password,
        phoneNumber,
        address,
        role,
        sex,
        status: "active", // Always set to 'active' for admin-created users
        profilePicture,
      };

      // Mongoose schema validation will run here
      switch (role) {
        case "Admin":
          newUser = new Admin(fullUserData);
          break;
        case "Teacher":
          newUser = new Teacher(fullUserData);
          break;
        case "Student":
          newUser = new Student(fullUserData);
          break;
        default:
          // This case should ideally be caught by prior validation
          errors.push({
            index: i,
            userIdentifier: username || email,
            messages: [`Invalid user role '${role}' specified.`],
            data: userData,
          });
          continue;
      }

      await newUser.save(); // This triggers pre-save hooks (like password hashing) and validation

      const responseUser = newUser.toObject();
      delete responseUser.password; // Ensure password is not sent back
      createdUsers.push(responseUser);
    } catch (error) {
      // Catch Mongoose validation errors or other creation errors
      const errorMessages = [];
      if (error.errors) {
        // Mongoose validation error object
        for (const field in error.errors) {
          errorMessages.push(error.errors[field].message);
        }
      } else {
        errorMessages.push(error.message);
      }
      errors.push({
        index: i,
        userIdentifier: username || email,
        messages: errorMessages,
        data: userData,
      });
    }
  }

  const success = createdUsers.length > 0;
  const statusCode = success ? (errors.length > 0 ? 207 : 201) : 400; // 207 Multi-Status if partial success

  res.status(statusCode).json({
    success: success || errors.length === 0, // Overall success if at least one created or no errors if none to create
    message: `Bulk operation finished. Created: ${createdUsers.length}. Failed: ${errors.length}.`,
    data: {
      createdCount: createdUsers.length,
      failedCount: errors.length,
      createdUsers: createdUsers.length > 0 ? createdUsers : undefined,
      errors: errors.length > 0 ? errors : undefined,
    },
  });
});

// @desc    Create multiple users from Excel file (updated to handle new multer config)
// @route   POST /api/v1/users/bulk-excel
// @access  Private/Admin
const createUsersFromExcel = asyncHandler(async (req, res, next) => {
  upload.single("excelFile")(req, res, async (err) => {
    if (err) {
      return next(new ErrorResponse(`File upload error: ${err.message}`, 400));
    }

    if (!req.file) {
      return next(new ErrorResponse("Please upload an Excel file", 400));
    }

    try {
      console.log("Processing Excel file from memory buffer");

      // Create a temporary file from the buffer for ExcelJS
      const tempFilePath = path.join(__dirname, `../temp-${Date.now()}.xlsx`);
      fs.writeFileSync(tempFilePath, req.file.buffer);

      // Read the Excel file using exceljs
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(tempFilePath);

      // Get the first worksheet
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        fs.unlinkSync(tempFilePath);
        return next(new ErrorResponse("Excel file has no worksheets", 400));
      }

      console.log("Worksheet name:", worksheet.name);
      console.log("Row count:", worksheet.rowCount);

      // Convert worksheet to JSON
      const jsonData = [];
      const headers = [];

      // Get headers from the first row
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const headerValue = cell.value;
        if (headerValue) {
          // Handle different cell value types
          let header = "";
          if (typeof headerValue === "string") {
            header = headerValue.trim();
          } else if (typeof headerValue === "object" && headerValue.text) {
            header = headerValue.text.trim();
          } else {
            header = headerValue.toString().trim();
          }
          headers[colNumber] = header;
        }
      });

      console.log(
        "Found headers:",
        headers.filter((h) => h)
      ); // Filter out empty headers

      // Extract data rows (skip header row)
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const rowData = {};
        let hasData = false;

        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber];
          if (header) {
            let cellValue = cell.value;

            // Handle different cell value types
            if (cellValue !== null && cellValue !== undefined) {
              if (typeof cellValue === "string") {
                cellValue = cellValue.trim();
              } else if (typeof cellValue === "object" && cellValue.text) {
                cellValue = cellValue.text.trim();
              } else if (typeof cellValue === "number") {
                cellValue = cellValue.toString();
              } else {
                cellValue = cellValue.toString().trim();
              }

              if (cellValue !== "") {
                rowData[header] = cellValue;
                hasData = true;
              }
            }
          }
        });

        // Only add row if it has data
        if (hasData && Object.keys(rowData).length > 0) {
          jsonData.push(rowData);
        }
      }

      console.log("Parsed data rows:", jsonData.length);
      console.log("Sample data:", jsonData[0]);

      if (!jsonData || jsonData.length === 0) {
        fs.unlinkSync(tempFilePath);
        return next(
          new ErrorResponse("Excel file is empty or contains no data", 400)
        );
      }

      // Validate required headers
      const requiredHeaders = [
        "username",
        "firstName",
        "lastName",
        "email",
        "password",
        "phoneNumber",
        "address",
        "role",
        "sex",
      ];

      const availableHeaders = Object.keys(jsonData[0]);
      const missingHeaders = requiredHeaders.filter(
        (header) => !availableHeaders.includes(header)
      );

      if (missingHeaders.length > 0) {
        fs.unlinkSync(tempFilePath);
        return next(
          new ErrorResponse(
            `Excel file is missing required columns: ${missingHeaders.join(
              ", "
            )}. Found columns: ${availableHeaders.join(", ")}`,
            400
          )
        );
      }

      // Process each row
      const createdUsers = [];
      const errors = [];
      const validSexValues = ["Male", "Female", "Other"];
      const validRoleValues = ["Admin", "Teacher", "Student"];
      const validStatusValues = ["active", "inactive", "suspended", "pending"];

      for (let i = 0; i < jsonData.length; i++) {
        const rowData = jsonData[i];
        const rowNumber = i + 2; // Excel row number (1-indexed + header row)

        console.log(`Processing row ${rowNumber}:`, rowData);

        const {
          username,
          firstName,
          middleName,
          lastName,
          email,
          password,
          phoneNumber,
          address,
          role,
          sex,
          status,
          profilePicture,
        } = rowData;

        // Validate required fields
        const currentItemErrors = [];
        if (!username || username.trim() === "")
          currentItemErrors.push("username is required.");
        if (!firstName || firstName.trim() === "")
          currentItemErrors.push("firstName is required.");
        if (!lastName || lastName.trim() === "")
          currentItemErrors.push("lastName is required.");
        if (!email || email.trim() === "")
          currentItemErrors.push("email is required.");
        if (!password || password.trim() === "")
          currentItemErrors.push("password is required.");
        if (!phoneNumber || phoneNumber.trim() === "")
          currentItemErrors.push("phoneNumber is required.");
        if (!address || address.trim() === "")
          currentItemErrors.push("address is required.");
        if (!role || role.trim() === "")
          currentItemErrors.push("role is required.");
        if (!sex || sex.trim() === "")
          currentItemErrors.push("sex is required.");

        // Validate enum values
        if (role && !validRoleValues.includes(role.trim())) {
          currentItemErrors.push(
            `Invalid role '${role}'. Allowed: ${validRoleValues.join(", ")}.`
          );
        }
        if (sex && !validSexValues.includes(sex.trim())) {
          currentItemErrors.push(
            `Invalid sex '${sex}'. Allowed: ${validSexValues.join(", ")}.`
          );
        }
        if (status && !validStatusValues.includes(status.trim())) {
          currentItemErrors.push(
            `Invalid status '${status}'. Allowed: ${validStatusValues.join(
              ", "
            )}.`
          );
        }

        if (currentItemErrors.length > 0) {
          errors.push({
            row: rowNumber,
            userIdentifier: username || email || `Row ${rowNumber}`,
            messages: currentItemErrors,
            data: rowData,
          });
          continue;
        }

        // Clean and prepare data
        const cleanData = {
          username: username.trim(),
          firstName: firstName.trim(),
          middleName: middleName ? middleName.trim() : undefined,
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          password: password.trim(),
          phoneNumber: phoneNumber.trim(),
          address: address.trim(),
          role: role.trim(),
          sex: sex.trim(),
          status: "active", // Always set to 'active' for admin-created users
          profilePicture: profilePicture ? profilePicture.trim() : undefined,
        };

        // Check for existing users
        try {
          const existingUserByUsername = await User.findOne({
            username: cleanData.username,
          });
          if (existingUserByUsername) {
            errors.push({
              row: rowNumber,
              userIdentifier: cleanData.username,
              messages: [`Username '${cleanData.username}' already exists.`],
              data: rowData,
            });
            continue;
          }

          const existingUserByEmail = await User.findOne({
            email: cleanData.email,
          });
          if (existingUserByEmail) {
            errors.push({
              row: rowNumber,
              userIdentifier: cleanData.email,
              messages: [`Email '${cleanData.email}' already exists.`],
              data: rowData,
            });
            continue;
          }
        } catch (dbCheckError) {
          errors.push({
            row: rowNumber,
            userIdentifier: cleanData.username || cleanData.email,
            messages: [
              `Error checking for existing user: ${dbCheckError.message}`,
            ],
            data: rowData,
          });
          continue;
        }

        // Create user
        try {
          let newUser;

          switch (cleanData.role) {
            case "Admin":
              newUser = new Admin(cleanData);
              break;
            case "Teacher":
              newUser = new Teacher(cleanData);
              break;
            case "Student":
              newUser = new Student(cleanData);
              break;
            default:
              errors.push({
                row: rowNumber,
                userIdentifier: cleanData.username || cleanData.email,
                messages: [`Invalid user role '${cleanData.role}' specified.`],
                data: rowData,
              });
              continue;
          }

          await newUser.save();
          console.log(`✅ User created successfully: ${cleanData.username}`);

          const responseUser = newUser.toObject();
          delete responseUser.password;
          createdUsers.push(responseUser);
        } catch (error) {
          console.error(`❌ Error creating user ${cleanData.username}:`, error);
          const errorMessages = [];
          if (error.errors) {
            for (const field in error.errors) {
              errorMessages.push(error.errors[field].message);
            }
          } else {
            errorMessages.push(error.message);
          }
          errors.push({
            row: rowNumber,
            userIdentifier: cleanData.username || cleanData.email,
            messages: errorMessages,
            data: rowData,
          });
        }
      }

      // Clean up temporary file
      fs.unlinkSync(tempFilePath);
      console.log("Temporary file cleaned up");

      const success = createdUsers.length > 0;
      const statusCode = success ? (errors.length > 0 ? 207 : 201) : 400;

      console.log(
        `📊 Final results: ${createdUsers.length} created, ${errors.length} failed`
      );

      res.status(statusCode).json({
        success: success || errors.length === 0,
        message: `Excel import completed. Created: ${createdUsers.length}. Failed: ${errors.length}.`,
        data: {
          createdCount: createdUsers.length,
          failedCount: errors.length,
          createdUsers: createdUsers.length > 0 ? createdUsers : undefined,
          errors: errors.length > 0 ? errors : undefined,
        },
      });
    } catch (error) {
      // Clean up temporary file in case of error
      const tempFiles = fs
        .readdirSync(__dirname)
        .filter((file) => file.startsWith("temp-") && file.endsWith(".xlsx"));
      tempFiles.forEach((file) => {
        try {
          fs.unlinkSync(path.join(__dirname, file));
        } catch (e) {
          console.log("Error cleaning temp file:", e.message);
        }
      });

      console.error("Error processing Excel file:", error);
      return next(
        new ErrorResponse(`Error processing Excel file: ${error.message}`, 500)
      );
    }
  });
});

// Export all functions (add the new function)
module.exports = {
  createUser,
  getAllUsers,
  getUser,
  updateUser,
  updateUserPassword,
  deleteUser,
  restoreUser,
  permanentDeleteUser,
  createMultipleUsers,
  createUsersFromExcel,
  uploadProfilePicture, // Add new export
};
