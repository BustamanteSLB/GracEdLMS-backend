// routes/authRoutes.js
const express = require('express');
const { login, logout, register, getCurrentUser, updateMe } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware'); // Assuming authorize is your role middleware
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Input validation middleware
const validateLogin = [
  body('identifier').notEmpty().withMessage('Username or User ID is required').trim(),
  body('password').notEmpty().withMessage('Password is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Format errors for ErrorResponse or handle directly
      const messages = errors.array().map(err => err.msg);
      return res.status(400).json({ success: false, message: messages.join('. ') });
      // Or: return next(new ErrorResponse(messages.join('. '), 400));
    }
    next();
  }
];

const validateRegistration = [
    body('username').notEmpty().withMessage('Username is required').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').notEmpty().withMessage('First name is required').trim(),
    body('lastName').notEmpty().withMessage('Last name is required').trim(),
    body('phoneNumber').notEmpty().withMessage('Phone number is required').trim(), // Add more specific phone validation if needed
    body('address').notEmpty().withMessage('Address is required').trim(),
    body('role').isIn(['Admin', 'Teacher', 'Student']).withMessage('Invalid role specified'),
    body('status').optional().isIn(['active', 'inactive', 'suspended', 'pending', 'archived']),
    // Add validation for other fields like middleName, bio if they have constraints
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const messages = errors.array().map(err => err.msg);
            return res.status(400).json({ success: false, message: messages.join('. ') });
        }
        next();
    }
];

// Validation for updateMe
const validateUpdateMe = [
  body('username').optional().notEmpty().withMessage('Username cannot be empty').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty').trim(),
  body('middleName').optional().trim(),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty').trim(),
  body('phoneNumber').optional().notEmpty().withMessage('Phone number cannot be empty').trim(),
  body('address').optional().notEmpty().withMessage('Address cannot be empty').trim(),
  body('sex').optional().isIn(['Male', 'Female', 'Other']).withMessage('Invalid value for sex. Allowed values are: Male, Female, Other.'),
  // Removed validation for 'bio' and 'gender'
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const messages = errors.array().map(err => err.msg);
      return res.status(400).json({ success: false, message: messages.join('. ') });
    }
    next();
  }
];

router.post('/login', validateLogin, login);
router.post('/logout', protect, logout); // No body to validate generally
router.post('/register', validateRegistration, register);
router.get('/me', protect, getCurrentUser); // No body to validate
router.put('/updateme', protect, validateUpdateMe, updateMe);

module.exports = router;