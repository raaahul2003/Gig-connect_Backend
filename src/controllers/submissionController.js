
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const Submission = require("../models/Submission");
const Application = require("../models/Application");
const Task = require("../models/Task");

// Helper: Delete uploaded files if submission creation fails
const deleteUploadedFiles = (files = []) => {
    files.forEach((file) => {
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    });
};

// 1. Freelancer submits work
const createSubmission = async (req, res) => {
    try {
        const { description, revisionOf } = req.body;
        const { taskId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            deleteUploadedFiles(req.files || []);
            return res.status(400).json({
                message: "Invalid task ID.",
            });
        }

        const freelancerId = req.user.userId;
        const uploadedFiles = req.files || [];

        if (!description || description.trim().length === 0) {
            deleteUploadedFiles(uploadedFiles);
            return res.status(400).json({
                message: "Submission description is required.",
            });
        }

        const task = await Task.findById(taskId);

        if (!task) {
            deleteUploadedFiles(uploadedFiles);
            return res.status(404).json({
                message: "Task not found.",
            });
        }

        if (task.status !== "in_progress") {
            deleteUploadedFiles(uploadedFiles);
            return res.status(400).json({
                message: "This task is not accepting submissions.",
            });
        }

        // Check whether this freelancer has an accepted application
        const application = await Application.findOne({
            task: taskId,
            freelancer: freelancerId,
            status: "accepted",
        });

        if (!application) {
            deleteUploadedFiles(uploadedFiles);
            return res.status(403).json({
                message: "You are not authorized to submit work for this task.",
            });
        }

        // Find the latest submission for this task and freelancer
        const latestSubmission = await Submission.findOne({
            task: taskId,
            freelancer: freelancerId,
        }).sort({ createdAt: -1 });

        // First submission
        if (!latestSubmission && revisionOf) {
            deleteUploadedFiles(uploadedFiles);
            return res.status(400).json({
                message: "Invalid revision reference.",
            });
        }

        // Resubmission after revision request
        if (latestSubmission) {
            if (
                latestSubmission.status !== "revision_requested" ||
                !revisionOf ||
                revisionOf.toString() !== latestSubmission._id.toString()
            ) {
                deleteUploadedFiles(uploadedFiles);
                return res.status(400).json({
                    message: "A revision has not been requested for your latest submission.",
                });
            }
        }

        const files = uploadedFiles.map((file) => ({
            originalName: file.originalname,
            filename: file.filename,
            path: `uploads/submissions/${file.filename}`,
            mimetype: file.mimetype,
            size: file.size,
        }));

        const submission = await Submission.create({
            task: taskId,
            application: application._id,
            freelancer: freelancerId,
            client: task.client,
            description: description.trim(),
            files,
            revisionOf: revisionOf || null,
        });

        return res.status(201).json({
            message: "Work submitted successfully.",
            submission,
        });
    } catch (error) {
        deleteUploadedFiles(req.files || []);
        console.error("Create submission error:", error);

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

        // Only the submitting freelancer or task-owning client
        // can access the files.
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

        const filePath = path.resolve(
            __dirname,
            "..",
            "uploads",
            "submissions",
            path.basename(file.filename)
        );

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                message: "The requested file is no longer available.",
            });
        }

        return res.download(filePath, file.originalName);

    } catch (error) {
        console.error("Download submission file error:", error);

        return res.status(500).json({
            message: "Failed to access submission file.",
        });
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
            }

            submission.status = status;
            submission.feedback = feedback ? feedback.trim() : "";

            await submission.save({ session });

            reviewedSubmission = submission;
        });

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
