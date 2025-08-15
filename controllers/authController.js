const User = require("../models/User");
const Admin = require("../models/Admin");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const jwt = require("jsonwebtoken");
const jwtConfig = require("../config/jwt");
const asyncHandler = require("../utils/asyncHandler");
const { ErrorResponse } = require("../utils/errorResponse");

// Utility function to sign JWT token
const signToken = (id) => {
  return jwt.sign({ id }, jwtConfig.secret, {
    expiresIn: jwtConfig.expiresIn,
  });
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res, next) => {
  const { identifier, password } = req.body; // Changed from email to identifier

  if (!identifier || !password) {
    return next(
      new ErrorResponse("Please provide username/userId and password", 400)
    );
  }

  // Find user by username or userId
  const user = await User.findOne({
    $or: [{ username: identifier }, { userId: identifier }],
  }).select("+password");

  if (!user || !(await user.comparePassword(password, user.password))) {
    return next(
      new ErrorResponse("Incorrect username/userId or password", 401)
    );
  }

  if (user.status !== "active") {
    return next(
      new ErrorResponse(
        `Account status is '${user.status}'. Access denied.`,
        403
      )
    );
  }

  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });

  const token = signToken(user._id);

  // Prepare user data for the response, excluding sensitive information
  const userData = {
    _id: user._id,
    userId: user.userId,
    username: user.username,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    status: user.status,
    sex: user.sex,
    phoneNumber: user.phoneNumber,
    address: user.address,
    profilePicture: user.profilePicture,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLogin: user.lastLogin,
  };

  res.status(200).json({
    success: true,
    token,
    data: userData,
  });
});

// @desc    Register a new user (typically by an Admin, can be adapted for self-registration)
// @route   POST /api/v1/auth/register OR /api/v1/users (depending on your route setup)
// @access  Private/Admin (or Public if self-registration is enabled with specific logic)
exports.register = asyncHandler(async (req, res, next) => {
  const {
    username,
    firstName,
    middleName,
    lastName,
    email,
    password,
    phoneNumber,
    address,
    sex,
    role,
    profilePicture, // Optional
    status, // Allow status to be passed but will be overridden for admin-created users
  } = req.body;

  // When admin creates a user, status is automatically set to 'active'
  // This ensures admin-created accounts are immediately usable
  const userStatus = "active";

  // Basic check for core required fields (Mongoose schema will do more detailed validation)
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
        "Missing required fields: username, firstName, lastName, email, password, phoneNumber, address, role, sex",
        400
      )
    );
  }

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
    status: userStatus, // Always set to 'active' for admin-created users
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

  // Mongoose's toObject() or toJSON() with a transform can also remove password at schema level
  const responseUser = newUser.toObject();
  delete responseUser.password; // Ensure password is not sent back

  const token = signToken(newUser._id); // Optionally sign in user immediately after registration

  res.status(201).json({
    success: true,
    token, // Or remove if admin creates user and doesn't auto-login them
    data: responseUser,
    message: "User account created successfully with active status",
  });
});

// @desc    Get current logged-in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getCurrentUser = asyncHandler(async (req, res, next) => {
  // req.user is populated by the 'protect' middleware
  // Select fields to return, exclude password explicitly although schema does it.
  // Populate related data based on role if necessary
  let query = User.findById(req.user.id).select("-password");

  if (req.user.role === "Student") {
    query = query.populate({
      path: "enrolledSubjects",
      select: "subjectCode subjectName description",
    });
  } else if (req.user.role === "Teacher") {
    query = query.populate({
      path: "assignedSubjects",
      select: "subjectCode subjectName description",
    });
  }

  const user = await query;

  if (!user) {
    return next(new ErrorResponse("User not found", 404)); // Should be caught by protect middleware usually
  }

  res.status(200).json({ success: true, data: user });
});

// @desc    Update user details (for current user)
// @route   PUT /api/v1/auth/updateme
// @access  Private (Logged in user only)
exports.updateMe = asyncHandler(async (req, res, next) => {
  let fieldsToUpdate = {};

  if (req.user.role === "Admin") {
    // Admin can update all fields
    fieldsToUpdate = {
      firstName: req.body.firstName,
      middleName: req.body.middleName,
      lastName: req.body.lastName,
      username: req.body.username,
      phoneNumber: req.body.phoneNumber,
      address: req.body.address,
      profilePicture: req.body.profilePicture,
      sex: req.body.sex,
      // Removed bio and gender from updateable fields for auth/me
      // Email and password are handled via separate routes for security reasons
    };
  } else if (["Teacher", "Student"].includes(req.user.role)) {
    // Teacher and Student can only update these fields
    fieldsToUpdate = {
      profilePicture: req.body.profilePicture,
      phoneNumber: req.body.phoneNumber,
      address: req.body.address,
      sex: req.body.sex,
      email: req.body.email,
    };
  }

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

  // Remove undefined fields so they don't overwrite existing data with null
  Object.keys(fieldsToUpdate).forEach(
    (key) => fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );

  if (Object.keys(fieldsToUpdate).length === 0) {
    return next(new ErrorResponse("No details provided for update", 400));
  }

  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Logout user (Client-side responsibility for clearing token)
// @route   POST /api/v1/auth/logout
// @access  Private
exports.logout = asyncHandler(async (req, res, next) => {
  // For stateless JWT, logout is primarily client-side action.
  // Server can't invalidate a JWT token unless it's blacklisted.
  res.status(200).json({
    success: true,
    message:
      "Logged out successfully. Please clear your token on the client-side.",
  });
});

// @desc    Update current user's password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private
exports.updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(
      new ErrorResponse("Please provide current and new password", 400)
    );
  }

  const user = await User.findById(req.user.id).select("+password");

  if (!user) {
    return next(new ErrorResponse("User not found", 404)); // Should not happen if protected
  }

  // Check if current password matches
  if (!(await user.comparePassword(currentPassword, user.password))) {
    return next(new ErrorResponse("Incorrect current password", 401));
  }

  // Update password
  user.password = newPassword;
  await user.save(); // Pre-save hook in User model will hash it

  // Send new token as password change might invalidate old sessions if tokens include password related claims (not typical for simple JWT)
  // const token = signToken(user._id); // Re-signing token is optional here

  res.status(200).json({
    success: true,
    // token,
    message: "Password updated successfully",
  });
});

// @desc    Update current user's details (profile update)
// @route   PUT /api/v1/auth/updatedetails
// @access  Private
exports.updateDetails = asyncHandler(async (req, res, next) => {
  const fieldsToUpdate = {
    firstName: req.body.firstName,
    middleName: req.body.middleName,
    lastName: req.body.lastName,
    username: req.body.username, // Ensure username uniqueness is handled (Mongoose error or pre-check)
    phoneNumber: req.body.phoneNumber,
    address: req.body.address,
    bio: req.body.bio,
    profilePicture: req.body.profilePicture,
    sex: req.body.sex,
    gender: req.body.gender,
    // Email, password, role, status are typically not updated via this route
    // Email change should be a separate process with verification
    // For admin-initiated updates of other users, use userController.updateUser
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

  // Remove undefined fields so they don't overwrite existing data with null
  Object.keys(fieldsToUpdate).forEach(
    (key) => fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );

  if (Object.keys(fieldsToUpdate).length === 0) {
    return next(new ErrorResponse("No details provided for update", 400));
  }

  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!user) {
    return next(new ErrorResponse("User not found for update", 404));
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});
