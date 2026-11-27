const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const { cloudinary } = require("../config/cloudinary");
const { createNotification } = require("./notificationController");

const Submission = require("../models/Submission");
const Application = require("../models/Application");
const Task = require("../models/Task");
const Payment = require("../models/Payment");
const PLATFORM_FEE_RATE = 5;


const uploadBufferToCloudinary = (file) => {
  return new Promise((resolve, reject) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const publicId =
      `gigconnect/submissions/${crypto.randomUUID()}${extension}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        type: "authenticated",
        public_id: publicId,
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      }
    );

    uploadStream.end(file.buffer);
  });
};

// Delete uploaded Cloudinary files if database creation fails
const deleteCloudinaryFiles = async (files = []) => {
  await Promise.allSettled(
    files.map((file) =>
      cloudinary.uploader.destroy(file.public_id, {
        resource_type: "raw",
        type: "authenticated",
      })
    )
  );
};


const createSubmission = async (req, res) => {
  let cloudinaryUploads = [];
  let submissionSaved = false;

  try {
    const { description, revisionOf } = req.body;
    const { taskId } = req.params;

    const freelancerId = req.user.userId;
    const uploadedFiles = req.files || [];

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        message: "Invalid task ID.",
      });
    }

    if (!description || description.trim().length === 0) {
      return res.status(400).json({
        message: "Submission description is required.",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    if (task.status !== "in_progress") {
      return res.status(400).json({
        message: "This task is not accepting submissions.",
      });
    }

    // Check accepted application
    const application = await Application.findOne({
      task: taskId,
      freelancer: freelancerId,
      status: "accepted",
    });

    if (!application) {
      return res.status(403).json({
        message: "You are not authorized to submit work for this task.",
      });
    }

    // Find latest submission
    const latestSubmission = await Submission.findOne({
      task: taskId,
      freelancer: freelancerId,
    }).sort({ createdAt: -1 });

    if (!latestSubmission && revisionOf) {
      return res.status(400).json({
        message: "Invalid revision reference.",
      });
    }

    if (latestSubmission) {
      if (
        latestSubmission.status !== "revision_requested" ||
        !revisionOf ||
        revisionOf.toString() !== latestSubmission._id.toString()
      ) {
        return res.status(400).json({
          message:
            "A revision has not been requested for your latest submission.",
        });
      }
    }

    // Upload files to Cloudinary
    const files = [];

    for (const file of uploadedFiles) {
      const result = await uploadBufferToCloudinary(file);

      cloudinaryUploads.push(result);

      files.push({
        originalName: file.originalname,

        // Retained for compatibility
        filename: result.public_id,
        path: "",

        // Cloudinary details
        publicId: result.public_id,
        assetId: result.asset_id,
        resourceType: "raw",
        deliveryType: "authenticated",
        format:
          result.format ||
          path.extname(file.originalname).slice(1).toLowerCase(),

        mimetype: file.mimetype,
        size: file.size,
      });
    }

    // Save submission in MongoDB
    const submission = await Submission.create({
      task: taskId,
      application: application._id,
      freelancer: freelancerId,
      client: task.client,
      description: description.trim(),
      files,
      revisionOf: revisionOf || null,
    });

    submissionSaved = true;

    // Notification should not undo a successful submission
    try {
      await createNotification({
        recipient: task.client,
        sender: freelancerId,
        type: "submission_received",
        title: "New work submission received",
        message: `A freelancer has submitted work for your task "${task.title}".`,
        link: "/client/submissions",
      });
    } catch (notificationError) {
      console.error(
        "Submission notification error:",
        notificationError
      );
    }

    return res.status(201).json({
      message: "Work submitted successfully.",
      submission,
    });

  } catch (error) {
    console.error("Create submission error:", error);

    // Clean up Cloudinary uploads only if the DB save failed
    if (!submissionSaved) {
      await deleteCloudinaryFiles(cloudinaryUploads);
    }

    return res.status(500).json({
      message: "Failed to submit work.",
    });
  }
};


// 2. Freelancer views their submissions
const getMySubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find({
      freelancer: req.user.userId,
    })
      .populate("task", "title category deadline status")
      .populate("client", "name clientType clientProfile.companyName")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      count: submissions.length,
      submissions,
    });
  } catch (error) {
    console.error("Get my submissions error:", error);

    return res.status(500).json({
      message: "Failed to fetch your submissions.",
    });
  }
};

// 3. Client views submissions for their tasks
const getSubmissionsForClient = async (req, res) => {
  try {
    const submissions = await Submission.find({
      client: req.user.userId,
    })
      .populate("task", "title category deadline status")
      .populate("freelancer", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      count: submissions.length,
      submissions,
    });
  } catch (error) {
    console.error("Get client submissions error:", error);

    return res.status(500).json({
      message: "Failed to fetch submissions.",
    });
  }
};

// View or download a submission file

const downloadSubmissionFile = async (req, res) => {
  try {
    const { submissionId, fileId } = req.params;
    const userId = req.user.userId;

    if (
      !mongoose.Types.ObjectId.isValid(submissionId) ||
      !mongoose.Types.ObjectId.isValid(fileId)
    ) {
      return res.status(400).json({
        message: "Invalid submission or file ID.",
      });
    }

    const submission = await Submission.findById(submissionId);

    if (!submission) {
      return res.status(404).json({
        message: "Submission not found.",
      });
    }

    // Only freelancer or task-owning client can download
    const isFreelancer =
      submission.freelancer.toString() === userId;

    const isClient =
      submission.client.toString() === userId;

    if (!isFreelancer && !isClient) {
      return res.status(403).json({
        message: "You are not authorized to access this file.",
      });
    }

    const file = submission.files.id(fileId);

    if (!file) {
      return res.status(404).json({
        message: "File not found.",
      });
    }

    // New Cloudinary storage
    if (file.publicId) {
      const format =
        file.format ||
        path.extname(file.originalName).slice(1).toLowerCase();

      const downloadUrl =
        cloudinary.utils.private_download_url(
          file.publicId,
          format,
          {
            resource_type: file.resourceType || "raw",
            type: file.deliveryType || "authenticated",
            expires_at: Math.floor(Date.now() / 1000) + 300,
            attachment: true,
          }
        );

      const cloudinaryResponse = await fetch(downloadUrl);

      if (!cloudinaryResponse.ok || !cloudinaryResponse.body) {
        return res.status(502).json({
          message: "Unable to retrieve the stored file.",
        });
      }

      // Stream the file through our backend.
      // This preserves the existing frontend Blob download flow.
      res.setHeader(
        "Content-Type",
        file.mimetype || "application/octet-stream"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
      );

      const contentLength =
        cloudinaryResponse.headers.get("content-length");

      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      await pipeline(
        Readable.fromWeb(cloudinaryResponse.body),
        res
      );

      return;
    }

    // Backward compatibility for older local submissions
    if (file.filename) {
      const filePath = path.resolve(
        __dirname,
        "..",
        "uploads",
        "submissions",
        path.basename(file.filename)
      );

      if (fs.existsSync(filePath)) {
        return res.download(filePath, file.originalName);
      }
    }

    return res.status(404).json({
      message: "The requested file is no longer available.",
    });

  } catch (error) {
    console.error("Download submission file error:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Failed to access submission file.",
      });
    }

    res.destroy(error);
  }
};


// 4. Client approves work or requests revisions
const reviewSubmission = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { status, feedback } = req.body;
    const { submissionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({
        message: "Invalid submission ID.",
      });
    }

    const clientId = req.user.userId;

    if (!["approved", "revision_requested"].includes(status)) {
      return res.status(400).json({
        message: "Invalid review status.",
      });
    }

    if (
      status === "revision_requested" &&
      (!feedback || feedback.trim().length === 0)
    ) {
      return res.status(400).json({
        message: "Feedback is required when requesting revisions.",
      });
    }

    let reviewedSubmission;

    await session.withTransaction(async () => {
      const submission = await Submission.findOne({
        _id: submissionId,
        client: clientId,
        status: "submitted",
      }).session(session);

      if (!submission) {
        throw new Error("SUBMISSION_NOT_FOUND_OR_ALREADY_REVIEWED");
      }

      if (status === "approved") {
        const updatedTask = await Task.findOneAndUpdate(
          {
            _id: submission.task,
            client: clientId,
            status: "in_progress",
          },
          {
            $set: { status: "completed" },
          },
          {
            new: true,
            session,
          }
        );

        if (!updatedTask) {
          throw new Error("TASK_NOT_AVAILABLE_FOR_APPROVAL");
        }

        // Find the accepted application
        const application = await Application.findOne({
          _id: submission.application,
          task: submission.task,
          freelancer: submission.freelancer,
          status: "accepted",
        }).session(session);

        if (!application) {
          throw new Error("ACCEPTED_APPLICATION_NOT_FOUND");
        }

        // Calculate GigConnect platform commission
        const taskAmount = Number(application.bidAmount);

        if (!Number.isFinite(taskAmount) || taskAmount <= 0) {
          throw new Error("INVALID_TASK_AMOUNT");
        }

        const platformFee = Math.round(
          taskAmount * (PLATFORM_FEE_RATE / 100) * 100
        ) / 100;

        const freelancerAmount = taskAmount;

        const clientTotal = Math.round(
          (taskAmount + platformFee) * 100
        ) / 100;

        // Create pending payment
        await Payment.create(
          [
            {
              task: submission.task,
              application: application._id,
              submission: submission._id,
              client: clientId,
              freelancer: submission.freelancer,

              // Original agreed task price
              amount: taskAmount,

              // GigConnect commission
              platformFeeRate: PLATFORM_FEE_RATE,
              platformFee,

              // Freelancer receives the full agreed price
              freelancerAmount,

              // Client pays task price + platform fee
              clientTotal,

              status: "pending",
              paymentMethod: null,
            },
          ],
          { session }
        );
      }

      submission.status = status;
      submission.feedback = feedback ? feedback.trim() : "";

      await submission.save({ session });

      reviewedSubmission = submission;
    });

    if (status === "revision_requested") {
      await createNotification({
        recipient: reviewedSubmission.freelancer,
        sender: clientId,
        type: "revision_requested",
        title: "Revision requested",
        message: `The client requested changes to your submission. Feedback: ${reviewedSubmission.feedback}`,
        link: "/freelancer/submissions",
      });
    }

    if (status === "approved") {
      await createNotification({
        recipient: reviewedSubmission.freelancer,
        sender: clientId,
        type: "submission_approved",
        title: "Work approved!",
        message: "Your submitted work has been approved by the client.",
        link: "/freelancer/submissions",
      });
    }

    return res.status(200).json({
      message:
        status === "approved"
          ? "Work approved successfully."
          : "Revision requested successfully.",
      submission: reviewedSubmission,
    });
  } catch (error) {
    console.error("Review submission error:", error);

    if (error.message === "SUBMISSION_NOT_FOUND_OR_ALREADY_REVIEWED") {
      return res.status(404).json({
        message: "Submission not found or already reviewed.",
      });
    }

    if (error.message === "TASK_NOT_AVAILABLE_FOR_APPROVAL") {
      return res.status(400).json({
        message: "Task is not available for approval.",
      });
    }

    if (error.message === "ACCEPTED_APPLICATION_NOT_FOUND") {
      return res.status(400).json({
        message: "Accepted application not found for this submission.",
      });
    }

    if (error.message === "INVALID_TASK_AMOUNT") {
      return res.status(400).json({
        message: "Invalid task payment amount.",
      });
    }

    return res.status(500).json({
      message: "Failed to review submission.",
    });
  } finally {
    await session.endSession();
  }
};

module.exports = {
  createSubmission,
  getMySubmissions,
  getSubmissionsForClient,
  downloadSubmissionFile,
  reviewSubmission,
};
