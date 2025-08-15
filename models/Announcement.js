// models/Announcement.js
const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    subject: { // The subject this announcement belongs to
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    createdBy: { // User (Admin or Teacher) who created the announcement
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
}, { timestamps: true });

const Announcement = mongoose.model('Announcement', announcementSchema);
module.exports = Announcement;