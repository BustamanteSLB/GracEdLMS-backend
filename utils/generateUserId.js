function generateUserId() {
  const year = new Date().getFullYear(); // Gets the current year
  const randomDigits = Math.floor(100000 + Math.random() * 900000); // Generates random 6 digits
  return `${year}-${randomDigits}`; // Format: YYYY-XXXXXX
}

module.exports = generateUserId;