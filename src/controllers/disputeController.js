
const mongoose = require("mongoose");

const Dispute = require("../models/Dispute");
const Task = require("../models/Task");
const Application = require("../models/Application");
const Submission = require("../models/Submission");
const Payment = require("../models/Payment");

// 1. Raise a dispute
const createDispute = async (req, res) => {
  try {
    const {
      taskId,
      submissionId,
      category,
      description,
      evidence,
    } = req.body;

    const userId = req.user.userId;

    const allowedCategories = [
      "client_non_payment",
      "client_not_responding",
      "scope_change",
      "freelancer_not_delivering",
      "poor_quality_work",
      "other",
    ];

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        message: "Invalid task ID.",
      });
    }

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        message: "Invalid dispute category.",
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        message: "Please provide a dispute description.",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    const application = await Application.findOne({
      task: taskId,
      status: "accepted",
    });

    if (!application) {
      return res.status(400).json({
        message: "No accepted application found for this task.",
      });
    }

    const clientId = task.client.toString();
    const freelancerId = application.freelancer.toString();

    if (
      userId !== clientId &&
      userId !== freelancerId
    ) {
      return res.status(403).json({
        message: "You are not a participant in this task.",
      });
    }

    if (
      category === "client_non_payment" &&
      userId !== freelancerId
    ) {
      return res.status(403).json({
        message: "Only the freelancer can raise a non-payment dispute.",
      });
    }

    if (
      category === "freelancer_not_delivering" &&
      userId !== clientId
    ) {
      return res.status(403).json({
        message: "Only the client can report non-delivery.",
      });
    }

    let submission = null;
    let payment = null;

    if (submissionId) {
      if (!mongoose.Types.ObjectId.isValid(submissionId)) {
        return res.status(400).json({
          message: "Invalid submission ID.",
        });
      }

      submission = await Submission.findOne({
        _id: submissionId,
        task: taskId,
        client: clientId,
        freelancer: freelancerId,
      });

      if (!submission) {
        return res.status(404).json({
          message: "Related submission not found.",
        });
      }
    }

    // A non-payment dispute must relate to approved work
    // and an unpaid payment record.
    if (category === "client_non_payment") {
      if (!submission || submission.status !== "approved") {
        return res.status(400).json({
          message: "A non-payment dispute requires approved work.",
        });
      }

      payment = await Payment.findOne({
        task: taskId,
        submission: submission._id,
        client: clientId,
        freelancer: freelancerId,
        status: { $in: ["pending", "processing", "failed"] },
      });

      if (!payment) {
        return res.status(400).json({
          message: "No unpaid payment was found for this submission.",
        });
      }
    }

    // Prevent duplicate unresolved disputes by the same participant
    const existingDispute = await Dispute.findOne({
      task: taskId,
      raisedBy: userId,
      status: { $in: ["open", "under_review"] },
    });

    if (existingDispute) {
      return res.status(409).json({
        message: "You already have an unresolved dispute for this task.",
        dispute: existingDispute,
      });
    }

    const dispute = await Dispute.create({
      task: taskId,
      submission: submission?._id || null,
      payment: payment?._id || null,
      client: clientId,
      freelancer: freelancerId,
      raisedBy: userId,
      raisedAgainst: userId === clientId
        ? freelancerId
        : clientId,
      category,
      description: description.trim(),
      evidence: evidence?.trim() || "",
    });

    return res.status(201).json({
      message: "Dispute submitted successfully.",
      dispute,
    });
  } catch (error) {
    console.error("Create dispute error:", error);

    return res.status(500).json({
      message: "Failed to submit dispute.",
    });
  }
};

// 2. View disputes raised by or involving the logged-in user
const getMyDisputes = async (req, res) => {
  try {
    const userId = req.user.userId;

    const disputes = await Dispute.find({
      $or: [
        { raisedBy: userId },
        { raisedAgainst: userId },
      ],
    })
      .populate("task", "title budget status")
      .populate("raisedBy", "name email")
      .populate("raisedAgainst", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      count: disputes.length,
      disputes,
    });
  } catch (error) {
    console.error("Get my disputes error:", error);

    return res.status(500).json({
      message: "Failed to fetch disputes.",
    });
  }
};

module.exports = {
  createDispute,
  getMyDisputes,
};
