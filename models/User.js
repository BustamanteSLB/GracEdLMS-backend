// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const generateUserId = require('../utils/generateUserId'); // For userId generation

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
    required: [true, 'User ID is required.'],
    default: generateUserId, // Generate ID automatically
    trim: true,
  },
  username: {
    type: String,
    required: [true, 'Username is required.'],
    unique: true,
    trim: true,
  },
  firstName: {
    type: String,
    required: [true, 'First name is required.'],
    trim: true,
  },
  middleName: {
    type: String,
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required.'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required.'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email address.'],
  },
  sex: {
    type: String,
    enum: ['Male', 'Female', 'Other'], // Optional: Restrict to specific values
    required: [true, 'Sex is required.'],
    default: null,
  },
  password: {
    type: String,
    required: [true, 'Password is required.'],
    minlength: 8, // Enforce minimum password length
    select: false, // Hide password by default when querying users
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required.'],
    trim: true,
    // Add specific validation if needed (e.g., using a library like 'google-libphonenumber')
  },
  address: {
    type: String,
    required: [true, 'Address is required.'],
    trim: true,
  },
  role: {
    type: String,
    required: true,
    enum: ['Admin', 'Student', 'Teacher'],
  },
  profilePicture: {
    type: String, // URL to the picture
    default: null,
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'suspended', 'pending', 'archived'],
    default: 'pending', // Default status, might need activation
  },
  temporaryPassword: {
    type: String,
    select: false, // Hide temporary password by default
  },
  lastLogin: {
    type: Date,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  discriminatorKey: 'kind' // Important for inheritance
});

// Pre-save hook to hash password
userSchema.pre('save', async function (next) {
  // Only run this function if password was actually modified
  if (!this.isModified('password')) return next();

  // Store the plain text password temporarily (SECURITY RISK)
  this.temporaryPassword = this.password;

  // Hash the password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method to compare passwords
userSchema.methods.comparePassword = async function (
  candidatePassword,
  userPassword // The hashed password from the DB
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};


const User = mongoose.model('User', userSchema);
module.exports = User;