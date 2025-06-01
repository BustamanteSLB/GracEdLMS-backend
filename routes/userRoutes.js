const express = require('express');
const {
  createUser,
  getAllUsers,
  getUser,
  updateUser,
  updateUserPassword,
  deleteUser,
  restoreUser,
  permanentDeleteUser
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// All user routes require login
router.use(protect);

// Admin-only routes
router
  .route('/')
  .post(authorize('Admin'), createUser) // Create a user
  .get(authorize('Admin'), getAllUsers); // Get all users

router
  .route('/:id')
  .get(authorize('Admin'), getUser) // Get a single user
  .put(authorize('Admin'), updateUser) // Update a user
  .delete(authorize('Admin'), deleteUser); // Soft delete a user

router
  .route('/:id/password') // NEW: Route for updating a user's password by ID
  .put(authorize('Admin'), updateUserPassword);

router
  .route('/:id/restore')
  .put(authorize('Admin'), restoreUser); // Restore a soft-deleted user

// New route for permanent deletion
router
  .route('/:id/permanent')
  .delete(authorize('Admin'), permanentDeleteUser);

module.exports = router;