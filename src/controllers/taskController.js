const Task = require("../models/Task");
const Application = require("../models/Application");

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

    const submissionKey = req.get("Idempotency-Key")?.trim();

    if (!submissionKey || submissionKey.length > 100) {
      return res.status(400).json({
        success: false,
        message: "A valid task submission key is required.",
      });
    }

    // Return the existing task if this request was already processed.
    const existingTask = await Task.findOne({
      client: req.user.userId,
      submissionKey,
    });

    if (existingTask) {
      return res.status(200).json({
        success: true,
        message: "Task was already created.",
        task: existingTask,
      });
    }

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
      submissionKey,
    });

    return res.status(201).json({
      success: true,
      message: "Task created successfully.",
      task,
    });
  } catch (error) {
    // Handle simultaneous requests using the same submission key.
    if (error.code === 11000) {
      const existingTask = await Task.findOne({
        client: req.user.userId,
        submissionKey: req.get("Idempotency-Key")?.trim(),
      });

      if (existingTask) {
        return res.status(200).json({
          success: true,
          message: "Task was already created.",
          task: existingTask,
        });
      }
    }

    console.error("Create task error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create task.",
    });
  }
};

const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ status: "open" })
      .populate("client", "name role clientType clientProfile.companyName")
      .sort({ createdAt: -1 });

    const tasksWithApplicationCount = await Promise.all(
      tasks.map(async (task) => {
        const applicationCount = await Application.countDocuments({
          task: task._id,
        });

        return {
          ...task.toObject(),
          applicationCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      tasks: tasksWithApplicationCount,
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

    const tasksWithApplicationCount = await Promise.all(
      tasks.map(async (task) => {
        const applicationCount = await Application.countDocuments({
          task: task._id,
        });

        return {
          ...task.toObject(),
          applicationCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      tasks: tasksWithApplicationCount,
    });
  } catch (error) {
    console.error("Get My Tasks Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch your tasks",
    });
  }
};

const deleteTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.taskId,
      client: req.user.userId,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    if (task.status !== "open") {
      return res.status(403).json({
        success: false,
        message: "Only open tasks can be deleted.",
      });
    }

    await Task.findByIdAndDelete(task._id);

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully.",
    });
  } catch (error) {
    console.error("Delete task error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete task.",
    });
  }
};

module.exports = { createTask, getTasks, getTaskById, getMyTasks, deleteTask };
