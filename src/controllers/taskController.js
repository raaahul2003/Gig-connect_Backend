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
      estimatedMinutes,
      isUrgent,
    } = req.body;

    if (
      !title ||
      !category ||
      !description ||
      !deliverables ||
      budget === undefined ||
      !deadline ||
      estimatedMinutes === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required task fields.",
      });
    }

    const parsedBudget = Number(budget);
    const parsedDeadline = new Date(deadline);
    const parsedMinutes = Number(estimatedMinutes);

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

    if (![30, 60, 120, 240, 480].includes(parsedMinutes)) {
      return res.status(400).json({
        success: false,
        message: "Invalid estimated duration.",
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
      estimatedMinutes: parsedMinutes,
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
    const tasks = await Task.find({ status: "open" }).sort({ createdAt: -1 });

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
    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
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