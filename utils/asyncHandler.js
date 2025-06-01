// utils/asyncHandler.js
const asyncHandler = fn => (req, res, next) =>
  Promise
    .resolve(fn(req, res, next))
    .catch(next); // Pass errors to the next error-handling middleware

module.exports = asyncHandler;
