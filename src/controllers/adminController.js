
const User = require("../models/user");
const Task = require("../models/Task");
const Payment = require("../models/Payment");
const Application = require("../models/Application");
const Dispute = require("../models/Dispute");
const PlatformSettings = require("../models/PlatformSettings");
const mongoose = require("mongoose");


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

// GET ADMIN PAYMENT SUMMARY
const getAdminPaymentSummary = async (req, res) => {
  try {
    const summary = await Payment.aggregate([
      {
        $group: {
          _id: null,

          totalTransactions: { $sum: 1 },

          totalCollected: {
            $sum: {
              $cond: [
                { $eq: ["$status", "paid"] },
                {
                  $ifNull: [
                    "$clientTotal",
                    {
                      $add: [
                        "$amount",
                        {
                          $ifNull: [
                            "$platformFee",
                            { $multiply: ["$amount", 0.05] },
                          ],
                        },
                      ],
                    },
                  ],
                },
                0,
              ],
            },
          },

          platformRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "paid"] },
                {
                  $ifNull: [
                    "$platformFee",
                    { $multiply: ["$amount", 0.05] },
                  ],
                },
                0,
              ],
            },
          },

          freelancerPayable: {
            $sum: {
              $cond: [
                { $eq: ["$status", "paid"] },
                { $ifNull: ["$freelancerAmount", "$amount"] },
                0,
              ],
            },
          },

          pendingPayments: {
            $sum: {
              $cond: [
                { $in: ["$status", ["pending", "processing"]] },
                1,
                0,
              ],
            },
          },

          failedPayments: {
            $sum: {
              $cond: [{ $eq: ["$status", "failed"] }, 1, 0],
            },
          },

          refundedPayments: {
            $sum: {
              $cond: [{ $eq: ["$status", "refunded"] }, 1, 0],
            },
          },
        },
      },
    ]);

    const stats = summary[0] || {
      totalTransactions: 0,
      totalCollected: 0,
      platformRevenue: 0,
      freelancerPayable: 0,
      pendingPayments: 0,
      failedPayments: 0,
      refundedPayments: 0,
    };

    delete stats._id;

    return res.status(200).json({
      success: true,
      message: "Admin payment summary fetched successfully.",
      stats,
    });
  } catch (error) {
    console.error("Admin payment summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin payment summary.",
    });
  }
};

// GET ALL ADMIN TRANSACTIONS
const getAdminPayments = async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate("task", "title")
      .populate("client", "name email")
      .populate("freelancer", "name email")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      success: true,
      message: "Admin transactions fetched successfully.",
      payments,
    });
  } catch (error) {
    console.error("Admin payments error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin transactions.",
    });
  }
};

// GET ALL USERS WITH SEARCH AND FILTERS
const getAdminUsers = async (req, res) => {
  try {
    const { search = "", role = "all", status = "all" } = req.query;

    const filter = {};

    if (role !== "all") {
      if (!["client", "freelancer", "admin"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role filter.",
        });
      }

      filter.role = role;
    }

    if (status === "active") {
      filter.isSuspended = { $ne: true };
    } else if (status === "suspended") {
      filter.isSuspended = true;
    } else if (status !== "all") {
      return res.status(400).json({
        success: false,
        message: "Invalid account status filter.",
      });
    }

    if (search.trim()) {
      const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select(
        "name email role isEmailVerified isSuspended suspendedAt suspensionReason createdAt"
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const [totalUsers, clients, freelancers, admins, suspendedUsers] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "client" }),
        User.countDocuments({ role: "freelancer" }),
        User.countDocuments({ role: "admin" }),
        User.countDocuments({ isSuspended: true }),
      ]);

    return res.status(200).json({
      success: true,
      users,
      stats: {
        totalUsers,
        clients,
        freelancers,
        admins,
        suspendedUsers,
      },
    });
  } catch (error) {
    console.error("Admin users error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users.",
    });
  }
};

// GET SINGLE USER DETAILS
const getAdminUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const user = await User.findById(userId)
      .select(
        "name email role isEmailVerified isSuspended suspendedAt suspensionReason createdAt profile clientProfile freelancerProfile reputation"
      )
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Admin user details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch user details.",
    });
  }
};

// SUSPEND USER ACCOUNT
const suspendAdminUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a suspension reason.",
      });
    }

    if (reason.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: "Suspension reason cannot exceed 500 characters.",
      });
    }

    if (userId === String(req.user.userId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot suspend your own admin account.",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin accounts cannot be suspended through this action.",
      });
    }

    if (user.isSuspended) {
      return res.status(400).json({
        success: false,
        message: "This account is already suspended.",
      });
    }

    user.isSuspended = true;
    user.suspendedAt = new Date();
    user.suspensionReason = reason.trim();
    user.suspendedBy = req.user.userId;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "User account suspended successfully.",
    });
  } catch (error) {
    console.error("Suspend user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to suspend user account.",
    });
  }
};

// REACTIVATE USER ACCOUNT
const reactivateAdminUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!user.isSuspended) {
      return res.status(400).json({
        success: false,
        message: "This account is already active.",
      });
    }

    user.isSuspended = false;
    user.suspendedAt = null;
    user.suspensionReason = "";
    user.suspendedBy = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "User account reactivated successfully.",
    });
  } catch (error) {
    console.error("Reactivate user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reactivate user account.",
    });
  }
};


// GET ALL TASKS FOR ADMIN MODERATION
const getAdminTasks = async (req, res) => {
  try {
    const {
      search = "",
      status = "all",
      visibility = "all",
    } = req.query;

    const filter = {};

    const allowedStatuses = [
      "open",
      "in_progress",
      "completed",
      "cancelled",
    ];

    if (status !== "all") {
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid task status filter.",
        });
      }

      filter.status = status;
    }

    if (visibility === "visible") {
      filter.isHidden = { $ne: true };
    } else if (visibility === "hidden") {
      filter.isHidden = true;
    } else if (visibility !== "all") {
      return res.status(400).json({
        success: false,
        message: "Invalid visibility filter.",
      });
    }

    if (search.trim()) {
      const safeSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { title: { $regex: safeSearch, $options: "i" } },
        { category: { $regex: safeSearch, $options: "i" } },
        { description: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const tasks = await Task.find(filter)
      .populate("client", "name email")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const tasksWithCounts = await Promise.all(
      tasks.map(async (task) => {
        const applicationCount = await Application.countDocuments({
          task: task._id,
        });

        return {
          ...task,
          applicationCount,
        };
      })
    );

    const [totalTasks, openTasks, activeTasks, completedTasks, hiddenTasks] =
      await Promise.all([
        Task.countDocuments(),
        Task.countDocuments({ status: "open" }),
        Task.countDocuments({ status: "in_progress" }),
        Task.countDocuments({ status: "completed" }),
        Task.countDocuments({ isHidden: true }),
      ]);

    return res.status(200).json({
      success: true,
      tasks: tasksWithCounts,
      stats: {
        totalTasks,
        openTasks,
        activeTasks,
        completedTasks,
        hiddenTasks,
      },
    });
  } catch (error) {
    console.error("Admin tasks error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch marketplace tasks.",
    });
  }
};


// GET SINGLE TASK DETAILS FOR ADMIN
const getAdminTaskDetails = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID.",
      });
    }

    const task = await Task.findById(taskId)
      .populate("client", "name email")
      .lean();

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    const applications = await Application.find({ task: taskId })
      .populate("freelancer", "name email")
      .select("proposal bidAmount deliveryHours status createdAt freelancer")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      task: {
        ...task,
        applications,
      },
    });
  } catch (error) {
    console.error("Admin task details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch task details.",
    });
  }
};


// HIDE AN OPEN TASK
const hideAdminTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID.",
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a reason for hiding this task.",
      });
    }

    if (reason.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: "Reason cannot exceed 500 characters.",
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
      return res.status(403).json({
        success: false,
        message: "Only open tasks can be hidden.",
      });
    }

    if (task.isHidden) {
      return res.status(400).json({
        success: false,
        message: "This task is already hidden.",
      });
    }

    task.isHidden = true;
    task.moderationReason = reason.trim();
    task.moderatedAt = new Date();
    task.moderatedBy = req.user.userId;

    await task.save();

    return res.status(200).json({
      success: true,
      message: "Task hidden successfully.",
    });
  } catch (error) {
    console.error("Hide admin task error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to hide task.",
    });
  }
};


// RESTORE A HIDDEN TASK
const restoreAdminTask = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID.",
      });
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    if (!task.isHidden) {
      return res.status(400).json({
        success: false,
        message: "This task is not hidden.",
      });
    }

    task.isHidden = false;
    task.moderationReason = "";
    task.moderatedAt = null;
    task.moderatedBy = null;

    await task.save();

    return res.status(200).json({
      success: true,
      message: "Task restored successfully.",
    });
  } catch (error) {
    console.error("Restore admin task error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to restore task.",
    });
  }
};


// GET ALL DISPUTES FOR ADMIN
const getAdminDisputes = async (req, res) => {
  try {
    const { status = "all", search = "" } = req.query;

    const filter = {};

    if (status !== "all") {
      if (!["open", "under_review", "resolved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid dispute status.",
        });
      }

      filter.status = status;
    }

    const disputes = await Dispute.find(filter)
      .populate("task", "title budget status")
      .populate("client", "name email")
      .populate("freelancer", "name email")
      .populate("raisedBy", "name email")
      .populate("raisedAgainst", "name email")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const query = search.trim().toLowerCase();

    const filteredDisputes = query
      ? disputes.filter((dispute) =>
          [
            dispute.task?.title,
            dispute.client?.name,
            dispute.client?.email,
            dispute.freelancer?.name,
            dispute.freelancer?.email,
            dispute.category,
            dispute.description,
          ].some((value) =>
            String(value || "").toLowerCase().includes(query)
          )
        )
      : disputes;

    const [total, open, underReview, resolved, rejected] =
      await Promise.all([
        Dispute.countDocuments(),
        Dispute.countDocuments({ status: "open" }),
        Dispute.countDocuments({ status: "under_review" }),
        Dispute.countDocuments({ status: "resolved" }),
        Dispute.countDocuments({ status: "rejected" }),
      ]);

    return res.status(200).json({
      success: true,
      disputes: filteredDisputes,
      stats: {
        total,
        open,
        underReview,
        resolved,
        rejected,
      },
    });
  } catch (error) {
    console.error("Admin disputes error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch disputes.",
    });
  }
};


// GET SINGLE DISPUTE DETAILS
const getAdminDisputeDetails = async (req, res) => {
  try {
    const { disputeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(disputeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid dispute ID.",
      });
    }

    const dispute = await Dispute.findById(disputeId)
      .populate("task", "title description budget deadline status")
      .populate("client", "name email")
      .populate("freelancer", "name email")
      .populate("raisedBy", "name email")
      .populate("raisedAgainst", "name email")
      .populate({
        path: "submission",
        select: "description status feedback files createdAt",
      })
      .populate({
        path: "payment",
        select: "amount platformFee clientTotal freelancerAmount status currency paymentMethod paidAt",
      })
      .populate("resolvedBy", "name email")
      .lean();

    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: "Dispute not found.",
      });
    }

    return res.status(200).json({
      success: true,
      dispute,
    });
  } catch (error) {
    console.error("Admin dispute details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch dispute details.",
    });
  }
};


// UPDATE DISPUTE STATUS AND APPLY CLIENT RESTRICTION
const updateAdminDispute = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { status, adminNotes = "", resolution = "" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(disputeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid dispute ID.",
      });
    }

    if (!["under_review", "resolved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid dispute status.",
      });
    }

    if (adminNotes.length > 3000 || resolution.length > 3000) {
      return res.status(400).json({
        success: false,
        message: "Notes cannot exceed 3000 characters.",
      });
    }

    if (
      ["resolved", "rejected"].includes(status) &&
      !resolution.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "A resolution note is required to close a dispute.",
      });
    }

    const dispute = await Dispute.findById(disputeId);

    if (!dispute) {
      return res.status(404).json({
        success: false,
        message: "Dispute not found.",
      });
    }

    if (["resolved", "rejected"].includes(dispute.status)) {
      return res.status(400).json({
        success: false,
        message: "This dispute is already closed.",
      });
    }

    dispute.status = status;
    dispute.adminNotes = adminNotes.trim();
    dispute.resolution = resolution.trim();

    if (["resolved", "rejected"].includes(status)) {
      dispute.resolvedBy = req.user.userId;
      dispute.resolvedAt = new Date();
    } else {
      dispute.resolvedBy = null;
      dispute.resolvedAt = null;
    }

    await dispute.save();

    // Restrict task posting during an active non-payment investigation.
    if (dispute.category === "client_non_payment") {
      const client = await User.findById(dispute.client);

      if (client) {
        const restrictionPrefix = "Under review for non-payment dispute";

        if (status === "under_review") {
          const alreadyRestricted = client.canPostTasks === false;

          // Do not overwrite an unrelated existing restriction.
          if (
            !alreadyRestricted ||
            client.taskPostingRestrictedReason?.startsWith(restrictionPrefix)
          ) {
            client.canPostTasks = false;
            client.taskPostingRestrictedReason =
              `${restrictionPrefix} ${dispute._id}`;
            client.taskPostingRestrictedAt = new Date();
            await client.save();
          }
        } else {
          const otherDispute = await Dispute.findOne({
            _id: { $ne: dispute._id },
            client: dispute.client,
            category: "client_non_payment",
            status: { $in: ["open", "under_review"] },
          });

          if (otherDispute) {
            // Keep the restriction if another case is unresolved.
            if (
              client.taskPostingRestrictedReason?.startsWith(restrictionPrefix)
            ) {
              client.canPostTasks = false;
              client.taskPostingRestrictedReason =
                `${restrictionPrefix} ${otherDispute._id}`;
              client.taskPostingRestrictedAt = new Date();
              await client.save();
            }
          } else if (
            client.taskPostingRestrictedReason?.startsWith(restrictionPrefix)
          ) {
            client.canPostTasks = true;
            client.taskPostingRestrictedReason = "";
            client.taskPostingRestrictedAt = null;
            await client.save();
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Dispute marked as ${status.replace("_", " ")}.`,
      dispute,
    });
  } catch (error) {
    console.error("Update admin dispute error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update dispute.",
    });
  }
};

// GET PLATFORM SETTINGS
const getAdminSettings = async (req, res) => {
  try {
    let settings = await PlatformSettings.findOne();

    if (!settings) {
      settings = await PlatformSettings.create({});
    }

    return res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Get admin settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch platform settings.",
    });
  }
};


// UPDATE PLATFORM SETTINGS
const updateAdminSettings = async (req, res) => {
  try {
    const {
      platformName,
      supportEmail,
      commission,
      requireTaskReview,
      maintenanceMode,
    } = req.body;

    if (!platformName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Platform name is required.",
      });
    }

    if (
      !supportEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid support email.",
      });
    }

    const commissionValue = Number(commission);

    if (
      commission === "" ||
      commission === null ||
      commission === undefined ||
      !Number.isFinite(commissionValue) ||
      commissionValue < 0 ||
      commissionValue > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Commission must be between 0 and 100.",
      });
    }

    if (
      typeof requireTaskReview !== "boolean" ||
      typeof maintenanceMode !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid platform settings.",
      });
    }

    const settings = await PlatformSettings.findOneAndUpdate(
      {},
      {
        platformName: platformName.trim(),
        supportEmail: supportEmail.trim().toLowerCase(),
        commission: commissionValue,
        requireTaskReview,
        maintenanceMode,
        updatedBy: req.user.userId,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Platform settings updated successfully.",
      settings,
    });
  } catch (error) {
    console.error("Update admin settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update platform settings.",
    });
  }
};



module.exports = {
  getAdminDashboard,
  getAdminPaymentSummary,
  getAdminPayments,
  suspendAdminUser,
  reactivateAdminUser,
  getAdminUserDetails,
  getAdminUsers,
  getAdminTasks,
  getAdminTaskDetails,
  hideAdminTask,
  restoreAdminTask,
  getAdminDisputes,
  getAdminDisputeDetails,
  updateAdminDispute,
  getAdminSettings,
  updateAdminSettings


};
