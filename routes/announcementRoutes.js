const express = require('express');
const {
  createAnnouncement,
  getAnnouncementsForSubject,
  getAnnouncement,
  updateAnnouncement,
  deleteAnnouncement
} = require('../controllers/announcementController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

console.log('announcementRoutes.js loaded'); // Debug log

// All routes require authentication
router.use(protect);

// Announcements for a subject
router
  .route('/subjects/:subjectId/announcements')
  .post(authorize('Admin', 'Teacher'), (req, res, next) => {
    console.log('POST /subjects/:subjectId/announcements hit'); // Debug log
    createAnnouncement(req, res, next);
  })
  .get(getAnnouncementsForSubject);

// Single announcement by ID
router
  .route('/announcements/:id')
  .get(getAnnouncement)
  .put(authorize('Admin', 'Teacher'), updateAnnouncement)
  .delete(authorize('Admin', 'Teacher'), deleteAnnouncement);

module.exports = router; 