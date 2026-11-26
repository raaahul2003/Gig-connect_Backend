
const User = require("../models/user");
const Task = require("../models/Task");

// GET ADMIN DASHBOARD STATISTICS
const getAdminDashboard = async (req, res) => {
  try {
    const [
      registeredUsers,
      publishedTasks,
      activeProjects,
      completedProjects,
    ] = await Promise.all([
      User.countDocuments(),
      Task.countDocuments({ status: "open" }),
      Task.countDocuments({ status: "in_progress" }),
      Task.countDocuments({ status: "completed" }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Admin dashboard data fetched successfully.",
      stats: {
        registeredUsers,
        publishedTasks,
        activeProjects,
        completedProjects,
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin dashboard data.",
    });
  }
};

module.exports = { getAdminDashboard };
