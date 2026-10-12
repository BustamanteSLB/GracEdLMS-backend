// config/jwt.js
module.exports = {
  secret: process.env.JWT_SECRET, // Use environment variable!
  expiresIn: process.env.JWT_EXPIRES_IN, // Token expiry time
};