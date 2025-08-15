const express = require('express');
const {
  getAllEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsByDateRange,
  getUpcomingEvents,
  getEventStats
} = require('../controllers/eventController');

const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all routes - require authentication
router.use(protect);

// Public routes (all authenticated users can access)
router.get('/', authorize('Admin', 'Teacher', 'Student'), getAllEvents);
router.get('/upcoming', authorize('Admin', 'Teacher', 'Student'), getUpcomingEvents);
router.get('/date-range', authorize('Admin', 'Teacher', 'Student'), getEventsByDateRange);
router.get('/:id', authorize('Admin', 'Teacher', 'Student'), getEvent);

// Admin only routes
router.use(authorize('Admin')); // All routes below this require Admin role

router.post('/', authorize('Admin'), createEvent);
router.put('/:id', authorize('Admin'), updateEvent);
router.delete('/:id', authorize('Admin'), deleteEvent);
router.get('/admin/stats', authorize('Admin'), getEventStats);

module.exports = router;