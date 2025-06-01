// middleware/roleMiddleware.js
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ // 403 Forbidden
        success: false,
        message: `User role '${req.user ? req.user.role : 'None'}' is not authorized to access this route`
      });
    }
    next();
  };
};