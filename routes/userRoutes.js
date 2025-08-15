const express = require("express");
const {
  createUser,
  getAllUsers,
  getUser,
  updateUser,
  updateUserPassword,
  deleteUser,
  restoreUser,
  permanentDeleteUser,
  createMultipleUsers,
  createUsersFromExcel,
} = require("../controllers/userController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Protect all routes
router.use(protect);

router
  .route("/")
  .post(authorize('Admin'), createUser) // Create a user
  .get(authorize('Admin', 'Teacher'), getAllUsers); // Get all users

// Bulk user creation routes
router.route("/bulk").post(authorize('Admin'), createMultipleUsers); // Keep for backward compatibility

// New Excel bulk import route
router.route("/bulk-excel").post(authorize('Admin'), createUsersFromExcel);

router
  .route("/:id")
  .get(getUser) // Get a single user
  .put(updateUser) // Update a user
  .delete(deleteUser); // Soft delete a user

router
  .route("/:id/password") // NEW: Route for updating a user's password by ID
  .put(updateUserPassword);

router.route("/:id/restore").put(authorize('Admin'), restoreUser); // Restore a soft-deleted user

// New route for permanent deletion
router.route("/:id/permanent").delete(authorize('Admin'), permanentDeleteUser);

module.exports = router;