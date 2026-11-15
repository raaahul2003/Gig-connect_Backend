const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    freelancer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    proposal: {
      type: String,
      required: true,
      trim: true,
      minlength: 30,
    },
    bidAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    deliveryHours: {
      type: Number,
      required: true,
      enum: [2, 6, 12, 24, 48, 72],
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// Prevent the same freelancer from applying to a task more than once.
applicationSchema.index({ task: 1, freelancer: 1 }, { unique: true });

module.exports = mongoose.model("Application", applicationSchema);