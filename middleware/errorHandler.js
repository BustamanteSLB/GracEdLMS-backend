// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log to console for dev
  console.error('-------------------- ERROR --------------------');
  console.error('Error Name:', err.name);
  console.error('Error Message:', err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error('Error Stack:', err.stack);
  }
  console.error('-----------------------------------------------');


  // Mongoose bad ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    const message = `Resource not found with id of ${err.value}`;
    error = { statusCode: 404, message, success: false };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate field value entered for '${field}'. Please use another value.`;
    error = { statusCode: 400, message, success: false };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    const message = messages.join('. ');
    error = { statusCode: 400, message, success: false };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please log in again.';
    error = { statusCode: 401, message, success: false };
  }
  if (err.name === 'TokenExpiredError') {
    const message = 'Your session has expired. Please log in again.';
    error = { statusCode: 401, message, success: false };
  }

  res.status(error.statusCode || 500).json({
    success: error.success !== undefined ? error.success : false,
    message: error.message || 'Server Error'
    // In development, you might want to include more details, but not in production
    // error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

module.exports = errorHandler;