const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    platformName: {
      type: String,
      default: "GigConnect",
      trim: true,
    },

    supportEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    commission: {
      type: Number,
      default: 5,
      min: 0,
      max: 100,
    },

    requireTaskReview: {
      type: Boolean,
      default: true,
    },

    maintenanceMode: {
      type: Boolean,
      default: false,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "PlatformSettings",
  platformSettingsSchema
);