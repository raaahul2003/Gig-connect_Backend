
const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },

    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },

    freelancer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    files: [
      {
        originalName: {
          type: String,
          required: true,
        },

        // Retained for compatibility with old local files
        filename: {
          type: String,
          default: "",
        },

        path: {
          type: String,
          default: "",
        },

        // Cloudinary storage details
        publicId: {
          type: String,
        },

        assetId: {
          type: String,
        },

        resourceType: {
          type: String,
          default: "raw",
        },

        deliveryType: {
          type: String,
          default: "authenticated",
        },

        format: {
          type: String,
        },

        mimetype: {
          type: String,
          required: true,
        },

        size: {
          type: Number,
          required: true,
        },
      },
    ],

    status: {
      type: String,
      enum: ["submitted", "revision_requested", "approved"],
      default: "submitted",
    },

    feedback: {
      type: String,
      default: "",
      trim: true,
    },

    revisionOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Submission", submissionSchema);
