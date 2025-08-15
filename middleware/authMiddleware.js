const jwt = require('jsonwebtoken');
const User = require('../models/User');
const jwtConfig = require('../config/jwt');

// Protect routes
exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized to access this route (no token provided)' });
  }

  try {
    const decoded = jwt.verify(token, jwtConfig.secret);

    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User belonging to this token no longer exists.' });
    }

    if (req.user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'User account is not active.' });
    }

    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    res.status(401).json({ success: false, message: 'Not authorized to access this route (token invalid or expired)' });
  }
};

// Role-based authorization
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};