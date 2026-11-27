
const express = require("express");
const router = express.Router();

const {
  getAdminDashboard,
  getAdminPaymentSummary,
  getAdminPayments,
  getAdminUsers,
  getAdminUserDetails,
  suspendAdminUser,
  reactivateAdminUser,
  getAdminTasks,
  getAdminTaskDetails,
  hideAdminTask,
  restoreAdminTask,
  getAdminDisputes,
  getAdminDisputeDetails,
  updateAdminDispute,
  getAdminSettings,
  updateAdminSettings,
} = require("../controllers/adminController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

// All routes below require admin authentication
router.use(protect, adminOnly);

// Dashboard
router.get("/dashboard", getAdminDashboard);

// Payment monitoring
router.get("/payments/summary", getAdminPaymentSummary);
router.get("/payments", getAdminPayments);

// User management
router.get("/users", getAdminUsers);
router.get("/users/:userId", getAdminUserDetails);
router.patch("/users/:userId/suspend", suspendAdminUser);
router.patch("/users/:userId/reactivate", reactivateAdminUser);

// Task moderation
router.get("/tasks", getAdminTasks);
router.get("/tasks/:taskId", getAdminTaskDetails);
router.patch("/tasks/:taskId/hide", hideAdminTask);
router.patch("/tasks/:taskId/restore", restoreAdminTask);

// Dispute management
router.get("/disputes", getAdminDisputes);
router.get("/disputes/:disputeId", getAdminDisputeDetails);
router.patch("/disputes/:disputeId", updateAdminDispute);

// Platform settings
router.get("/settings", getAdminSettings);
router.put("/settings", updateAdminSettings);

module.exports = router;
