const User = require('../models/User');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const asyncHandler = require('../utils/asyncHandler');
const { ErrorResponse } = require('../utils/errorResponse');
const mongoose = require('mongoose');

// @desc    Create a new user by Admin
// @route   POST /api/v1/users
// @access  Private/Admin
exports.createUser = asyncHandler(async (req, res, next) => {
  const {
    username, firstName, middleName, lastName, email, password, phoneNumber, address, role,
    sex,
    status, 
    profilePicture
  } = req.body;

  // Add 'sex' to required field check
  if (!username || !firstName || !lastName || !email || !password || !phoneNumber || !address || !role || !sex) {
    return next(new ErrorResponse('Missing required fields for user creation by admin, including sex', 400));
  }
  // Validate enum for sex
  const validSexValues = ['Male', 'Female', 'Other'];
  if (sex && !validSexValues.includes(sex)) {
      return next(new ErrorResponse(`Invalid value for sex. Allowed values are: ${validSexValues.join(', ')}.`, 400));
  }

  let newUser;
  const userData = {
      username, firstName, middleName, lastName, email, password, phoneNumber, address, role,
      sex,
      status, // Admin can set status, default to pending
      profilePicture
  };

  switch (role) {
    case 'Admin':
      newUser = await Admin.create(userData);
      break;
    case 'Teacher':
      newUser = await Teacher.create(userData);
      break;
    case 'Student':
      newUser = await Student.create(userData);
      break;
    default:
      return next(new ErrorResponse(`Invalid user role '${role}' specified for creation`, 400));
  }

  const responseUser = newUser.toObject();
  delete responseUser.password;

  res.status(201).json({
    success: true,
    data: responseUser,
  });
});

// @desc    Get all users (with filtering and pagination options)
// @route   GET /api/v1/users
// @access  Private/Admin
exports.getAllUsers = asyncHandler(async (req, res, next) => {
  // Basic filtering (extend as needed)
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach(el => delete queryObj[el]);

  // Filter for non-archived users by default, unless 'status' is specified in query
  if (!queryObj.status) {
      queryObj.status = { $ne: 'archived' };
  } else if (queryObj.status === 'all') { // Allow fetching all including archived
      delete queryObj.status;
  }


  let query = User.find(queryObj);

  // Sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt'); // Default sort
  }

  // Field limiting
  if (req.query.fields) {
    const fields = req.query.fields.split(',').join(' ');
    query = query.select(fields);
  } else {
    query = query.select('-password'); // Default select
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await User.countDocuments(queryObj); // Count matching documents before pagination

  query = query.skip(startIndex).limit(limit);

  const users = await query;

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
exports.getUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid ID format: ${req.params.id}`, 400));
  }
  // Admin can view any user, including archived ones if they need to
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Update a user by ID (by Admin)
// @route   PUT /api/v1/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid ID format: ${req.params.id}`, 400));
  }

  // Admin can update most fields. Password changes should be handled carefully.
  // Explicitly exclude password from this general update route
  const { password, ...updateData } = req.body;

  if (password) {
    // If password is sent, reject it or redirect to dedicated password update route
    return next(new ErrorResponse('Password updates for other users should be handled via a dedicated password update route.', 400));
  }

  // Allow email and username to be updated
  const fieldsToUpdate = {
      username: updateData.username,
      firstName: updateData.firstName,
      middleName: updateData.middleName,
      lastName: updateData.lastName,
      email: updateData.email, // <<< ALLOW EMAIL CHANGE HERE
      phoneNumber: updateData.phoneNumber,
      address: updateData.address,
      profilePicture: updateData.profilePicture,
      sex: updateData.sex,
      role: updateData.role,   // <<< ALLOW ROLE CHANGE BY ADMIN
      status: updateData.status // <<< ALLOW STATUS CHANGE BY ADMIN
  };

  // Validate enum for sex if provided
  const validSexValues = ['Male', 'Female', 'Other'];
  if (fieldsToUpdate.sex && !validSexValues.includes(fieldsToUpdate.sex)) {
      return next(new ErrorResponse(`Invalid value for sex. Allowed values are: ${validSexValues.join(', ')}.`, 400));
  }

  // Validate enum for role if provided
  const validRoleValues = ['Admin', 'Teacher', 'Student'];
  if (fieldsToUpdate.role && !validRoleValues.includes(fieldsToUpdate.role)) {
      return next(new ErrorResponse(`Invalid value for role. Allowed values are: ${validRoleValues.join(', ')}.`, 400));
  }

  // Validate enum for status if provided
  const validStatusValues = ['active', 'inactive', 'suspended', 'pending', 'archived'];
  if (fieldsToUpdate.status && !validStatusValues.includes(fieldsToUpdate.status)) {
      return next(new ErrorResponse(`Invalid value for status. Allowed values are: ${validStatusValues.join(', ')}.`, 400));
  }

  // Remove undefined fields so they don't overwrite existing data with null
  Object.keys(fieldsToUpdate).forEach(key => fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]);

  if (Object.keys(fieldsToUpdate).length === 0) {
      return next(new ErrorResponse('No details provided for update', 400));
  }

  // Find and update the user.
  // Mongoose will run schema validators on the fields being updated.
  const user = await User.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
      new: true, // Return the modified document rather than the original
      runValidators: true, // Run schema validators on this update
  }).select('-password'); // Exclude password from response

  if (!user) {
      return next(new ErrorResponse('User not found for update', 404));
  }

  res.status(200).json({
      success: true,
      data: user,
  });
});

// @desc    Update user password (Admin only)
// @route   PUT /api/v1/users/:id/password
// @access  Private/Admin
exports.updateUserPassword = asyncHandler(async (req, res, next) => {
    const { newPassword } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return next(new ErrorResponse('Invalid user ID', 400));
    }

    if (!newPassword) {
        return next(new ErrorResponse('Please provide a new password', 400));
    }

    // You might want to add password complexity/length validation here as well
    // if it's not already handled by the User model's pre-save hook.
    if (newPassword.length < 8) { // Example validation
        return next(new ErrorResponse('New password must be at least 8 characters long.', 400));
    }

    // Find the user by ID and select the password field so it can be modified and hashed
    const user = await User.findById(req.params.id).select('+password');

    if (!user) {
        return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
    }

    // Update password field. The pre-save hook in the User model will hash this.
    user.password = newPassword;
    await user.save(); // Save the user to trigger the pre-save hook for hashing

    res.status(200).json({
        success: true,
        message: 'User password updated successfully',
    });
});

// @desc    Delete a user by ID (soft delete by Admin)
// @route   DELETE /api/v1/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid ID format: ${req.params.id}`, 400));
  }
  // Prevent admin from archiving themselves or the last active admin
  const userToArchive = await User.findById(req.params.id);
  if (!userToArchive) {
      return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }
  if (userToArchive._id.equals(req.user.id)) {
      return next(new ErrorResponse('You cannot archive your own account.', 400));
  }
  /* if (userToArchive.role === 'Admin') {
      const activeAdminCount = await Admin.countDocuments({ status: 'active' });
      if (activeAdminCount <= 1 && userToArchive.status === 'active') {
          return next(new ErrorResponse('Cannot archive the last active admin account.', 400));
      }
  } */

  userToArchive.status = 'archived';
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
exports.restoreUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid ID format: ${req.params.id}`, 400));
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status || 'pending' }, // Admin can choose status or default to pending
    { new: true, runValidators: true }
  ).select('-password');

  if (!user) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }
  if (user.status === 'archived') { // Ensure we are restoring from archived
      user.status = req.body.status || 'pending'; // Or 'active'
      await user.save();
  } else if (user.status !== 'pending' && user.status !== 'active') {
      return next(new ErrorResponse(`User is not archived. Current status: ${user.status}`, 400));
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
exports.permanentDeleteUser = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid ID format: ${req.params.id}`, 400));
  }

  const userToDelete = await User.findById(req.params.id);

  if (!userToDelete) {
    return next(new ErrorResponse(`User not found with id of ${req.params.id}`, 404));
  }

  // Optional: Add checks to prevent deleting critical users, e.g., the last admin.
  // This check is critical if an admin can delete other admins.
  if (userToDelete.role === 'Admin') {
    // Example: Prevent deleting the current logged-in admin (self-deletion) via this route
    if (userToDelete._id.equals(req.user.id)) {
         return next(new ErrorResponse('You cannot permanently delete your own account via this route.', 400));
    }
    // Example: Prevent deleting the last active admin (if that's a business rule)
    // const activeAdminCount = await Admin.countDocuments({ status: 'active' });
    // if (activeAdminCount <= 1 && userToDelete.status === 'active') { // Or check if it's the only Admin regardless of status
    //     return next(new ErrorResponse('Cannot permanently delete the last admin account.', 400));
    // }
  }

  await User.findByIdAndDelete(req.params.id);

  res.status(200).json({ // 200 OK or 204 No Content are common for successful deletions
    success: true,
    message: `User ${userToDelete.username} (ID: ${req.params.id}) permanently deleted successfully.`,
    // No data is typically sent back, or just a confirmation.
  });
});