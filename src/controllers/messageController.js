const Application = require("../models/Application");
const Message = require("../models/Message");
const Task = require("../models/Task");

const getApplicationForUser = async (applicationId, userId) => {
  const application = await Application.findById(applicationId)
    .populate("task", "title client");

  if (!application || !application.task) {
    return { application: null, isFreelancer: false };
  }

  const isFreelancer =
    String(application.freelancer) === String(userId);
  const isClient = String(application.task.client) === String(userId);

  if (!isFreelancer && !isClient) {
    return { application: null, isFreelancer: false };
  }

  return { application, isFreelancer };
};

const getMyConversations = async (req, res) => {
  try {
    const userId = req.user.userId;
    const clientTaskIds = await Task.find({ client: userId }).distinct("_id");

    const applications = await Application.find({
      $or: [
        { freelancer: userId },
        { task: { $in: clientTaskIds } },
      ],
    })
      .populate("freelancer", "name")
      .populate({
        path: "task",
        select: "title client",
        populate: { path: "client", select: "name" },
      })
      .sort({ updatedAt: -1 });

    const conversations = applications.map((application) => {
      const isFreelancer =
        String(application.freelancer._id) === String(userId);

      return {
        applicationId: application._id,
        user: isFreelancer
          ? application.task.client
          : application.freelancer,
        taskTitle: application.task.title,
      };
    });

    return res.status(200).json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error("Get conversations error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch conversations.",
    });
  }
};

const getMessages = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { application } = await getApplicationForUser(
      applicationId,
      req.user.userId
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    const messages = await Message.find({ application: application._id })
      .populate("sender", "name")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("Get messages error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch messages.",
    });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const text =
      typeof req.body.text === "string" ? req.body.text.trim() : "";

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Message text is required.",
      });
    }

    const userId = req.user.userId;
    const { application, isFreelancer } = await getApplicationForUser(
      applicationId,
      userId
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    const message = await Message.create({
      application: application._id,
      task: application.task._id,
      sender: userId,
      receiver: isFreelancer
        ? application.task.client
        : application.freelancer,
      text,
    });

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: message,
    });
  } catch (error) {
    console.error("Send message error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send message.",
    });
  }
};

module.exports = { getMyConversations, getMessages, sendMessage };
