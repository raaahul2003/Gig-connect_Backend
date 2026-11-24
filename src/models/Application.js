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
    deliveryDate: {
      type: String,
      required: true,
      match: [
        /^\d{4}-\d{2}-\d{2}$/,
        "Please provide a valid delivery date (YYYY-MM-DD).",
      ],
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