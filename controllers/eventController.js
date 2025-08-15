const Event = require('../models/Event');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { ErrorResponse } = require('../utils/errorResponse');
const mongoose = require('mongoose');

// @desc    Get all events (filtered by user role and target audience)
// @route   GET /api/v1/events
// @access  Private
exports.getAllEvents = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, priority, targetAudience, eventType, status, search } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Build query object
  let queryObj = {};

  // Filter by target audience based on user role
  if (req.user.role === 'Student') {
    queryObj.targetAudience = { $in: ['all', 'students'] };
  } else if (req.user.role === 'Teacher') {
    queryObj.targetAudience = { $in: ['all', 'teachers'] };
  } else if (req.user.role === 'Admin') {
    // Admins can see all events
    if (targetAudience) {
      queryObj.targetAudience = targetAudience;
    }
  }

  // Additional filters
  if (priority) queryObj.priority = priority;
  if (eventType) queryObj.eventType = eventType;

  // Search functionality
  if (search) {
    queryObj.$or = [
      { title: { $regex: search, $options: 'i' } },
      { header: { $regex: search, $options: 'i' } },
      { body: { $regex: search, $options: 'i' } }
    ];
  }

  // Status filter (upcoming, ongoing, past)
  const now = new Date();
  if (status === 'upcoming') {
    queryObj.startDate = { $gt: now };
  } else if (status === 'ongoing') {
    queryObj.startDate = { $lte: now };
    queryObj.endDate = { $gte: now };
  } else if (status === 'past') {
    queryObj.endDate = { $lt: now };
  }

  // Execute query with pagination
  const events = await Event.find(queryObj)
    .populate('createdBy', 'firstName lastName username role')
    .sort({ priority: 1, startDate: 1 }) // Sort by priority then start date
    .skip(skip)
    .limit(limitNum);

  const totalEvents = await Event.countDocuments(queryObj);
  const totalPages = Math.ceil(totalEvents / limitNum);

  res.status(200).json({
    success: true,
    count: events.length,
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalEvents,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    },
    data: events
  });
});

// @desc    Get single event
// @route   GET /api/v1/events/:id
// @access  Private
exports.getEvent = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid event ID format: ${req.params.id}`, 400));
  }

  const event = await Event.findById(req.params.id)
    .populate('createdBy', 'firstName lastName username role email');

  if (!event) {
    return next(new ErrorResponse(`Event not found with ID: ${req.params.id}`, 404));
  }

  // Check if user can view this event based on target audience
  const userRole = req.user.role.toLowerCase();
  if (event.targetAudience !== 'all' && event.targetAudience !== `${userRole}s` && req.user.role !== 'Admin') {
    return next(new ErrorResponse('You are not authorized to view this event', 403));
  }

  res.status(200).json({
    success: true,
    data: event
  });
});

// @desc    Create new event
// @route   POST /api/v1/events
// @access  Private/Admin
exports.createEvent = asyncHandler(async (req, res, next) => {
  // Add the creator to the request body
  req.body.createdBy = req.user.id;

  // Validate required fields
  const { title, header, body, startDate, endDate } = req.body;

  if (!title || !header || !body || !startDate || !endDate) {
    return next(new ErrorResponse('Please provide all required fields: title, header, body, startDate, endDate', 400));
  }

  // Validate dates
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Debug logging
  console.log('Create Event - Date Validation:');
  console.log('Request startDate:', startDate);
  console.log('Request endDate:', endDate);
  console.log('Parsed startDate:', start);
  console.log('Parsed endDate:', end);
  console.log('Start < End?:', start <= end);

  // Check if dates are valid
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return next(new ErrorResponse('Invalid date format provided', 400));
  }

  // Compare dates using getTime() to avoid timezone issues
  if (start.getTime() > end.getTime()) {
    return next(new ErrorResponse(`Start date (${start.toISOString()}) must be before or equal to end date (${end.toISOString()})`, 400));
  }

  // Create event
  const event = await Event.create(req.body);

  // Populate creator info
  await event.populate('createdBy', 'firstName lastName username role');

  res.status(201).json({
    success: true,
    data: event
  });
});

// @desc    Update event
// @route   PUT /api/v1/events/:id
// @access  Private/Admin
exports.updateEvent = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid event ID format: ${req.params.id}`, 400));
  }

  let event = await Event.findById(req.params.id);

  if (!event) {
    return next(new ErrorResponse(`Event not found with ID: ${req.params.id}`, 404));
  }

  // Validate dates if they are being updated
  if (req.body.startDate || req.body.endDate) {
    // Get the dates - use new values if provided, otherwise keep existing
    const startDate = req.body.startDate ? new Date(req.body.startDate) : event.startDate;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : event.endDate;

    // Debug logging
    console.log('Update Event - Date Validation:');
    console.log('Request startDate:', req.body.startDate);
    console.log('Request endDate:', req.body.endDate);
    console.log('Parsed startDate:', startDate);
    console.log('Parsed endDate:', endDate);
    console.log('Start <= End?:', startDate <= endDate);

    // Check if dates are valid
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return next(new ErrorResponse('Invalid date format provided', 400));
    }

    // Compare dates using getTime() to avoid timezone issues
    if (startDate.getTime() > endDate.getTime()) {
      return next(new ErrorResponse(`Start date (${startDate.toISOString()}) must be before or equal to end date (${endDate.toISOString()})`, 400));
    }
  }

  // Update event with validation disabled to prevent schema validator conflicts
  event = await Event.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: false // Disable Mongoose validators since we're handling validation in controller
  }).populate('createdBy', 'firstName lastName username role');

  res.status(200).json({
    success: true,
    data: event
  });
});

// @desc    Delete event
// @route   DELETE /api/v1/events/:id
// @access  Private/Admin
exports.deleteEvent = asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse(`Invalid event ID format: ${req.params.id}`, 400));
  }

  const event = await Event.findById(req.params.id);

  if (!event) {
    return next(new ErrorResponse(`Event not found with ID: ${req.params.id}`, 404));
  }

  await Event.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Event deleted successfully',
    data: {}
  });
});

// @desc    Get events by date range
// @route   GET /api/v1/events/date-range
// @access  Private
exports.getEventsByDateRange = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide both startDate and endDate', 400));
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start > end) {
    return next(new ErrorResponse('Start date must be before end date', 400));
  }

  // Build query based on user role
  let queryObj = {
    $or: [
      { startDate: { $gte: start, $lte: end } },
      { endDate: { $gte: start, $lte: end } },
      { startDate: { $lte: start }, endDate: { $gte: end } }
    ]
  };

  // Filter by target audience based on user role
  if (req.user.role === 'Student') {
    queryObj.targetAudience = { $in: ['all', 'students'] };
  } else if (req.user.role === 'Teacher') {
    queryObj.targetAudience = { $in: ['all', 'teachers'] };
  }

  const events = await Event.find(queryObj)
    .populate('createdBy', 'firstName lastName username role')
    .sort({ startDate: 1 });

  res.status(200).json({
    success: true,
    count: events.length,
    data: events
  });
});

// @desc    Get upcoming events
// @route   GET /api/v1/events/upcoming
// @access  Private
exports.getUpcomingEvents = asyncHandler(async (req, res, next) => {
  const { limit = 5 } = req.query;
  const limitNum = parseInt(limit, 10);

  const now = new Date();
  
  // Build query based on user role
  let queryObj = {
    startDate: { $gte: now }
  };

  // Filter by target audience based on user role
  if (req.user.role === 'Student') {
    queryObj.targetAudience = { $in: ['all', 'students'] };
  } else if (req.user.role === 'Teacher') {
    queryObj.targetAudience = { $in: ['all', 'teachers'] };
  }

  const events = await Event.find(queryObj)
    .populate('createdBy', 'firstName lastName username role')
    .sort({ priority: 1, startDate: 1 })
    .limit(limitNum);

  res.status(200).json({
    success: true,
    count: events.length,
    data: events
  });
});

// @desc    Get events statistics (Admin only)
// @route   GET /api/v1/events/stats
// @access  Private/Admin
exports.getEventStats = asyncHandler(async (req, res, next) => {
  const now = new Date();

  const stats = await Event.aggregate([
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        upcomingEvents: {
          $sum: { $cond: [{ $gte: ['$startDate', now] }, 1, 0] }
        },
        ongoingEvents: {
          $sum: { 
            $cond: [
              { 
                $and: [
                  { $lte: ['$startDate', now] },
                  { $gte: ['$endDate', now] }
                ]
              }, 
              1, 
              0
            ]
          }
        },
        pastEvents: {
          $sum: { $cond: [{ $lt: ['$endDate', now] }, 1, 0] }
        },
        highPriorityEvents: {
          $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] }
        }
      }
    }
  ]);

  const eventsByType = await Event.aggregate([
    { $group: { _id: '$eventType', count: { $sum: 1 } } }
  ]);

  const eventsByAudience = await Event.aggregate([
    { $group: { _id: '$targetAudience', count: { $sum: 1 } } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      overview: stats[0] || {
        totalEvents: 0,
        upcomingEvents: 0,
        ongoingEvents: 0,
        pastEvents: 0,
        highPriorityEvents: 0
      },
      eventsByType,
      eventsByAudience
    }
  });
});