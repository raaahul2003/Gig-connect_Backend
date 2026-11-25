
const Application = require("../models/Application");
const Message = require("../models/Message");
const Task = require("../models/Task");
const { createNotification } = require("./notificationController");

// Find the application and verify that the logged-in user is a participant.
const getApplicationForUser = async (applicationId, userId) => {
  const application = await Application.findById(applicationId).populate(
    "task",
    "title client status"
  );

  if (!application || !application.task) {
    return { application: null, isFreelancer: false };
  }

  const isFreelancer =
    String(application.freelancer) === String(userId);

  const isClient =
    String(application.task.client) === String(userId);

  if (!isFreelancer && !isClient) {
    return { application: null, isFreelancer: false };
  }

  return { application, isFreelancer };
};

// A conversation is active only after acceptance and while work is in progress.
const isConversationActive = (application) => {
  return (
    application.status === "accepted" &&
    application.task?.status === "in_progress"
  );
};

// Get active project conversations for the logged-in user.
const getMyConversations = async (req, res) => {
  try {
    const userId = req.user.userId;

    const clientTaskIds = await Task.find({
      client: userId,
    }).distinct("_id");

    const applications = await Application.find({
      status: "accepted",
      $or: [
        { freelancer: userId },
        { task: { $in: clientTaskIds } },
      ],
    })
      .populate("freelancer", "name")
      .populate({
        path: "task",
        select: "title client status",
        populate: {
          path: "client",
          select: "name",
        },
      })
      .sort({ updatedAt: -1 });

    const conversations = applications
      .filter((application) => {
        return (
          application.task &&
          application.freelancer &&
          application.task.client &&
          isConversationActive(application)
        );
      })
      .map((application) => {
        const isFreelancer =
          String(application.freelancer._id) === String(userId);

        const otherUser = isFreelancer
          ? application.task.client
          : application.freelancer;

        return {
          applicationId: application._id,
          user: otherUser,
          taskTitle: application.task.title,
          taskStatus: application.task.status,
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

// Get messages for an active project conversation.
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

    if (!isConversationActive(application)) {
      return res.status(403).json({
        success: false,
        message: "This project chat is no longer active.",
      });
    }

    const messages = await Message.find({
      application: application._id,
    })
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

// Send a message in an active project conversation.
const sendMessage = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const text =
      typeof req.body.text === "string"
        ? req.body.text.trim()
        : "";

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Message text is required.",
      });
    }

    const userId = req.user.userId;

    const { application, isFreelancer } =
      await getApplicationForUser(applicationId, userId);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    if (!isConversationActive(application)) {
      return res.status(403).json({
        success: false,
        message: "You cannot send messages in this inactive project.",
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

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name");

    const recipient = isFreelancer
      ? application.task.client
      : application.freelancer;

    const recipientPath = isFreelancer
      ? "/client/messages"
      : "/freelancer/messages";

    await createNotification({
      recipient,
      sender: userId,
      type: "message_received",
      title: "New project message",
      message: `${populatedMessage.sender?.name || "Someone"} sent you a message about "${application.task.title}".`,
      link: `${recipientPath}?conversationId=${application._id}`,
    });

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: populatedMessage,
    });
  } catch (error) {
    console.error("Send message error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send message.",
    });
  }

};

module.exports = {
  getMyConversations,
  getMessages,
  sendMessage,
};
