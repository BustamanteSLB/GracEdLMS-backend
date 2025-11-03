const mongoose = require("mongoose");

const schoolSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: true,
      default: "Grace Community Christian School",
    },
    tagline: {
      type: String,
      default: "Excellence in Christian Education Since 1994",
    },
    logoUrl: {
      type: String,
      default: null,
    },

    // Hero Section
    heroTitle: {
      type: String,
      default: "Welcome to Our Campus",
    },
    heroSubtitle: {
      type: String,
      default: "Where faith meets learning in a nurturing environment",
    },
    heroImageUrl: {
      type: String,
      default: null,
    },

    // Statistics
    stats: {
      studentsEnrolled: {
        type: String,
        default: "200+",
      },
      yearsOfExcellence: {
        type: String,
        default: "30+",
      },
      dedicatedTeachers: {
        type: String,
        default: "10+",
      },
      graduates: {
        type: String,
        default: "2000+",
      },
    },

    // Quick Links
    links: [
      {
        label: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
        icon: {
          type: String,
          enum: [
            "web",
            "facebook",
            "education",
            "email",
            "phone",
            "location",
            "other",
          ],
          default: "other",
        },
      },
    ],

    // Mission & Vision
    mission: {
      type: String,
      default:
        "To provide a quality education rooted in Christian values, fostering spiritual growth and intellectual excellence in every student we serve.",
    },
    vision: {
      type: String,
      default:
        "Grace Christian Schools endeavors to help children develop and mature in a positive, Christ-centered environment that integrates faith and learning by emphasizing Biblical training and academic excellence.",
    },

    // Contact Information
    contact: {
      email: {
        type: String,
        default: "gccspasay@yahoo.com",
      },
      phone: {
        type: String,
        default: "+639288516764",
      },
      address: {
        type: String,
        default: "Pasay City, Metro Manila, Philippines",
      },
    },

    // Gallery Images (for teachers and students to see)
    galleryImages: [
      {
        url: {
          type: String,
          required: true,
        },
        caption: {
          type: String,
          default: "",
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Meta
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one school document exists
schoolSchema.pre("save", async function (next) {
  const School = this.constructor;
  if (this.isNew) {
    const count = await School.countDocuments();
    if (count > 0) {
      throw new Error("Only one school document is allowed");
    }
  }
  next();
});

module.exports = mongoose.model("School", schoolSchema);
