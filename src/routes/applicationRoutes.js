const express = require("express");
const router = express.Router();

const { createApplication, getMyApplications, getApplicationsForClient, updateApplicationStatus, getMyActiveWork, getClientActiveWork } = require("../controllers/applicationController");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

router.post(
  "/:taskId",
  protect,
  authorizeRoles("freelancer"),
  createApplication
);


router.get(
  "/my",
  protect,
  authorizeRoles("freelancer"),
  getMyApplications
);

// Client: View applications received for their tasks
router.get(
  "/client",
  protect,
  authorizeRoles("client"),
  getApplicationsForClient
);

// Client: Accept or reject an application
router.patch(
  "/:applicationId/status",
  protect,
  authorizeRoles("client"),
  updateApplicationStatus
);

// Freelancer: View accepted tasks
router.get(
  "/active/my",
  protect,
  authorizeRoles("freelancer"),
  getMyActiveWork
);

// Client: View assigned tasks
router.get(
  "/active/client",
  protect,
  authorizeRoles("client"),
  getClientActiveWork
);

module.exports = router;