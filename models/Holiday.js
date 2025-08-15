const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Holiday name is required."],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters."],
    },
    month: {
      type: Number,
      required: [true, "Month is required."],
      min: 1,
      max: 12,
    },
    day: {
      type: Number,
      required: [true, "Day is required."],
      min: 1,
      max: 31,
    },
    type: {
      type: String,
      enum: {
        values: ["regular", "special"],
        message: "Holiday type must be regular or special.",
      },
      required: [true, "Holiday type is required."],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters."],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
holidaySchema.index({ month: 1, day: 1 });

module.exports = mongoose.model("Holiday", holidaySchema);
