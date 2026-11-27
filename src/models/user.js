
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Freelancer portfolio schema
const portfolioSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    projectUrl: {
      type: String,
      trim: true,
    },
    technologies: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    // Existing authentication fields
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Email verification
    isEmailVerified: {
      type: Boolean,
      default: true,
    },

    emailVerificationToken: {
      type: String,
      default: undefined,
    },

    emailVerificationExpires: {
      type: Date,
      default: undefined,
    },
    // Password reset
    passwordResetToken: {
      type: String,
      default: undefined,
    },

    passwordResetExpires: {
      type: Date,
      default: undefined,
    },

    password: {
      type: String,
      required: false,
      minlength: 8,
    },

    role: {
      type: String,
      enum: ["client", "freelancer", "admin"],
      default: "freelancer",
    },

    // Admin account management
    isSuspended: {
      type: Boolean,
      default: false,
    },

    suspendedAt: {
      type: Date,
      default: null,
    },

    suspensionReason: {
      type: String,
      default: "",
      trim: true,
    },

    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Dispute-related restrictions
    canPostTasks: {
      type: Boolean,
      default: true,
    },

    taskPostingRestrictedReason: {
      type: String,
      default: "",
      trim: true,
    },

    taskPostingRestrictedAt: {
      type: Date,
      default: null,
    },

    // Client account type
    clientType: {
      type: String,
      enum: ["individual", "company"],
      default: "individual",
    },

    // Common public profile fields
    profile: {
      photoUrl: {
        type: String,
        default: "",
      },

      bio: {
        type: String,
        default: "",
        maxlength: 1000,
      },

      location: {
        type: String,
        default: "",
      },
    },

    // Freelancer profile
    freelancerProfile: {
      headline: {
        type: String,
        default: "",
        maxlength: 120,
      },

      skills: {
        type: [String],
        default: [],
      },

      experience: {
        type: String,
        default: "",
        maxlength: 2000,
      },

      portfolio: {
        type: [portfolioSchema],
        default: [],
      },
    },

    // Client profile
    clientProfile: {
      companyName: {
        type: String,
        default: "",
      },

      companyWebsite: {
        type: String,
        default: "",
      },

      companyDescription: {
        type: String,
        default: "",
        maxlength: 2000,
      },
    },
    reputation: {
      score: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      lastCalculatedAt: {
        type: Date,
        default: null,
      },
      adminAdjustment: {
        type: Number,
        default: 0,
      },
      adminAdjustmentReason: {
        type: String,
        default: "",
      },
      lastAdjustedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    // Settings - notification preferences
    notificationPreferences: {
      taskUpdates: {
        type: Boolean,
        default: true,
      },
      applicationUpdates: {
        type: Boolean,
        default: true,
      },
      paymentUpdates: {
        type: Boolean,
        default: true,
      },
    },

  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
});

// Compare entered password with stored hash
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
