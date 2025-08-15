const mongoose = require('mongoose');
const Teacher = require('../models/Teacher');

// Create a new teacher
exports.createTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.create(req.body);
    res.status(201).json({
      success: true,
      data: teacher,
    });
  } catch (error) {
    console.error('Error creating teacher:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to create teacher',
      error: error.message,
    });
  }
};

// Get all teachers
exports.getAllTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find({ status: { $ne: 'archived' } })
      .populate('assignedSubjects', 'subjectCode subjectName'); // Populate assigned subjects
    res.status(200).json({
      success: true,
      data: teachers,
    });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch teachers',
      error: error.message,
    });
  }
};

// Get a single teacher by ID
exports.getTeacher = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid teacher ID',
      });
    }

    const teacher = await Teacher.findById(req.params.id)
      .populate('assignedSubjects', 'subjectCode subjectName');
    if (!teacher || teacher.status === 'archived') {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }
    res.status(200).json({
      success: true,
      data: teacher,
    });
  } catch (error) {
    console.error('Error fetching teacher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch teacher',
      error: error.message,
    });
  }
};

// Update a teacher by ID
exports.updateTeacher = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid teacher ID',
      });
    }

    const teacher = await Teacher.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!teacher || teacher.status === 'archived') {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }
    res.status(200).json({
      success: true,
      data: teacher,
    });
  } catch (error) {
    console.error('Error updating teacher:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update teacher',
      error: error.message,
    });
  }
};

// Soft delete a teacher by setting status to 'archived'
exports.deleteTeacher = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid teacher ID',
      });
    }

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      { status: 'archived' },
      { new: true, runValidators: true }
    );
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }
    res.status(200).json({
      success: true,
      message: 'Teacher archived successfully',
      data: teacher,
    });
  } catch (error) {
    console.error('Error archiving teacher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive teacher',
      error: error.message,
    });
  }
};

// Restore a soft-deleted teacher
exports.restoreTeacher = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid teacher ID',
      });
    }

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      { status: 'active' },
      { new: true, runValidators: true }
    );
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }
    res.status(200).json({
      success: true,
      message: 'Teacher restored successfully',
      data: teacher,
    });
  } catch (error) {
    console.error('Error restoring teacher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore teacher',
      error: error.message,
    });
  }
};