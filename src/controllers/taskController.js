const Task = require("../models/Task");

const createTask = async (req, res) => {
  try {
    const {
      title,
      category,
      description,
      skills,
      deliverables,
      budget,
      deadline,
      isUrgent,
    } = req.body;

    if (
      !title ||
      !category ||
      !description ||
      !deliverables ||
      budget === undefined ||
      !deadline
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required task fields.",
      });
    }

    const parsedBudget = Number(budget);
    const parsedDeadline = new Date(deadline);

    if (!Number.isFinite(parsedBudget) || parsedBudget < 1) {
      return res.status(400).json({
        success: false,
        message: "Budget must be a number greater than zero.",
      });
    }

    if (
      Number.isNaN(parsedDeadline.getTime()) ||
      parsedDeadline <= new Date()
    ) {
      return res.status(400).json({
        success: false,
        message: "Deadline must be a valid future date.",
      });
    }

    const task = await Task.create({
      title,
      category,
      description,
      skills: Array.isArray(skills)
        ? skills
        : typeof skills === "string"
          ? skills.split(",").map((skill) => skill.trim()).filter(Boolean)
          : [],
      deliverables,
      budget: parsedBudget,
      deadline: parsedDeadline,
      isUrgent: Boolean(isUrgent),
      client: req.user.userId,
    });

    return res.status(201).json({
      success: true,
      message: "Task created successfully.",
      task,
    });
  } catch (error) {
    console.error("Create task error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ status: "open" })
      .populate("client", "name role clientType clientProfile.companyName")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      tasks,
    });
  } catch (error) {
    console.error("Get tasks error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tasks.",
    });
  }
};

const getTaskById = async (req, res) => {
  try {
    // Public task details are available only while freelancers can still apply.
    // Accepted, completed, and cancelled tasks must not remain discoverable by URL.
    const task = await Task.findOne({
      _id: req.params.taskId,
      status: "open",
    }).populate(
      "client",
      "name role clientType clientProfile.companyName"
    );

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task is no longer available.",
      });
    }

    res.status(200).json({
      success: true,
      task,
    });
  } catch (error) {
    console.error("Get task error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch task.",
    });
  }
};

// Get tasks posted by the logged-in client
const getMyTasks = async (req, res) => {
  try {
    const clientId = req.user.userId;

    const tasks = await Task.find({ client: clientId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      tasks,
    });
  } catch (error) {
    console.error("Get My Tasks Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch your tasks",
    });
  }
};

module.exports = { createTask, getTasks, getTaskById, getMyTasks };
