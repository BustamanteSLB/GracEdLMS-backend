// models/Admin.js
const mongoose = require('mongoose');
const User = require('./User'); // Import the base User model

const adminSchema = new mongoose.Schema({
  // Admin-specific fields can be added here if needed in the future
  // Example: department, accessLevel, etc.
  canManageUsers: { type: Boolean, default: true },
  canManageCourses: { type: Boolean, default: true },
});

// Use Mongoose discriminators for inheritance
const Admin = User.discriminator('AdminUser', adminSchema); // 'AdminUser' is the value stored in 'kind' field

module.exports = Admin;