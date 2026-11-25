const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ["Design", "Development", "Writing", "Data Entry", "Marketing", "Research"],
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    skills: {
      type: [String],
      default: [],
    },
    deliverables: {
      type: String,
      required: true,
      trim: true,
    },
    budget: {
      type: Number,
      required: true,
      min: 1,
    },
    deadline: {
      type: Date,
      required: true,
    },
    isUrgent: {
      type: Boolean,
      default: false,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "completed", "cancelled"],
      default: "open",
    },
    submissionKey: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

taskSchema.index(
  { client: 1, submissionKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      submissionKey: { $type: "string" },
    },
  }
);

module.exports = mongoose.model("Task", taskSchema);