const Application = require("../models/Application");
const Task = require("../models/Task");
const mongoose = require("mongoose");
const { createNotification } = require("./notificationController");

const createApplication = async (req, res) => {
  try {
    const { proposal, bidAmount, deliveryHours } = req.body;
    const { taskId } = req.params;
    const freelancerId = req.user.userId;

    if (!proposal || proposal.trim().length < 30) {
      return res.status(400).json({
        success: false,
        message: "Proposal must be at least 30 characters.",
      });
    }

    const parsedBid = Number(bidAmount);
    const parsedHours = Number(deliveryHours);

    if (!Number.isFinite(parsedBid) || parsedBid < 1) {
      return res.status(400).json({
        success: false,
        message: "Bid amount must be greater than zero.",
      });
    }

    if (![2, 6, 12, 24, 48, 72].includes(parsedHours)) {
      return res.status(400).json({
        success: false,
        message: "Choose a valid delivery time.",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    if (task.status !== "open") {
      return res.status(400).json({
        success: false,
        message: "This task is no longer accepting applications.",
      });
    }

    if (String(task.client) === String(freelancerId)) {
      return res.status(403).json({
        success: false,
        message: "You cannot apply to your own task.",
      });
    }

    const application = await Application.create({
      task: taskId,
      freelancer: freelancerId,
      proposal: proposal.trim(),
      bidAmount: parsedBid,
      deliveryHours: parsedHours,
    });

    await createNotification({
      recipient: task.client,
      sender: freelancerId,
      type: "application_received",
      title: "New application received",
      message: `A freelancer has applied for your task "${task.title}".`,
      link: "/client/applications",
    });

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully.",
      application,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already applied to this task.",
      });
    }

    console.error("Create application error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit application.",
    });
  }
};

const getMyApplications = async (req, res) => {
  try {
    const freelancerId = req.user.userId;

    const applications = await Application.find({ freelancer: freelancerId })
      .populate("task", "title")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      applications,
    });
  } catch (error) {
    console.error("Get my applications error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch applications.",
    });
  }
};


const getApplicationsForClient = async (req, res) => {
  try {
    const clientId = req.user.userId;

    // Find tasks posted by this client
    const clientTasks = await Task.find({ client: clientId })
      .select("_id");

    const taskIds = clientTasks.map((task) => task._id);

    // Find applications submitted to those tasks
    const applications = await Application.find({
      task: { $in: taskIds },
    })
      .populate("task", "title")
      .populate("freelancer", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      applications,
    });
  } catch (error) {
    console.error("Get client applications error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch client applications.",
    });
  }
};


// Freelancer: Get accepted tasks assigned to the logged-in freelancer
const getMyActiveWork = async (req, res) => {
  try {
    const freelancerId = req.user.userId;

    // Find tasks that are currently in progress
    const activeTasks = await Task.find({
      status: "in_progress",
    }).select("_id");

    const taskIds = activeTasks.map((task) => task._id);

    // Find accepted applications belonging to those tasks
    const applications = await Application.find({
      freelancer: freelancerId,
      task: { $in: taskIds },
      status: "accepted",
    })
      .populate("task")
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      applications,
    });
  } catch (error) {
    console.error("Get freelancer active work error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch active work.",
    });
  }
};


// Client: Get tasks currently assigned to freelancers
const getClientActiveWork = async (req, res) => {
  try {
    const clientId = req.user.userId;

    // Find tasks currently in progress
    const activeTasks = await Task.find({
      client: clientId,
      status: "in_progress",
    }).select("_id");

    const taskIds = activeTasks.map((task) => task._id);

    // Find accepted applications for those tasks
    const applications = await Application.find({
      task: { $in: taskIds },
      status: "accepted",
    })
      .populate("task")
      .populate("freelancer", "name email")
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      applications,
    });
  } catch (error) {
    console.error("Get client active work error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch client active work.",
    });
  }
};



const updateApplicationStatus = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { applicationId } = req.params;
    const { status } = req.body;
    const clientId = req.user.userId;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid application status.",
      });
    }

    let updatedApplication;

    await session.withTransaction(async () => {
      // Find application
      const application = await Application.findById(applicationId)
        .session(session);

      if (!application) {
        const error = new Error("Application not found.");
        error.statusCode = 404;
        throw error;
      }

      // Find associated task
      const task = await Task.findById(application.task)
        .session(session);

      if (!task || String(task.client) !== String(clientId)) {
        const error = new Error(
          "You are not authorized to update this application."
        );
        error.statusCode = 403;
        throw error;
      }

      // Only pending applications can be updated
      if (application.status !== "pending") {
        const error = new Error(
          "This application has already been processed."
        );
        error.statusCode = 400;
        throw error;
      }

      if (status === "accepted") {
        // Only one acceptance can claim an open task
        const claimedTask = await Task.findOneAndUpdate(
          {
            _id: task._id,
            client: clientId,
            status: "open",
          },
          {
            $set: { status: "in_progress" },
          },
          {
            new: true,
            session,
          }
        );

        if (!claimedTask) {
          const error = new Error(
            "This task has already been assigned to another freelancer."
          );
          error.statusCode = 409;
          throw error;
        }

        // Accept selected application
        updatedApplication = await Application.findOneAndUpdate(
          {
            _id: application._id,
            status: "pending",
          },
          {
            $set: { status: "accepted" },
          },
          {
            new: true,
            session,
          }
        );

        if (!updatedApplication) {
          const error = new Error(
            "This application has already been processed."
          );
          error.statusCode = 409;
          throw error;
        }

        // Reject all other pending applications for this task
        await Application.updateMany(
          {
            task: task._id,
            _id: { $ne: application._id },
            status: "pending",
          },
          {
            $set: { status: "rejected" },
          },
          { session }
        );

      } else {
        // Reject only the selected application
        updatedApplication = await Application.findOneAndUpdate(
          {
            _id: application._id,
            status: "pending",
          },
          {
            $set: { status: "rejected" },
          },
          {
            new: true,
            session,
          }
        );

        if (!updatedApplication) {
          const error = new Error(
            "This application has already been processed."
          );
          error.statusCode = 409;
          throw error;
        }
      }
    });

    await createNotification({
      recipient: updatedApplication.freelancer,
      sender: clientId,
      type:
        status === "accepted"
          ? "application_accepted"
          : "application_rejected",
      title:
        status === "accepted"
          ? "Application accepted!"
          : "Application rejected",
      message:
        status === "accepted"
          ? "Congratulations! Your application has been accepted."
          : "Your application was not selected this time.",
      link: "/freelancer/applications",
    });

    return res.status(200).json({
      success: true,
      message: `Application ${status} successfully.`,
      application: updatedApplication,
    });


  } catch (error) {
    console.error("Update application status error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update application status.",
    });

  } finally {
    await session.endSession();
  }
};






module.exports = { createApplication, getMyApplications, getApplicationsForClient, updateApplicationStatus, getClientActiveWork, getMyActiveWork };