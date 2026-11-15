
const express = require("express");
const router = express.Router();

const {
  createSubmission,
  getMySubmissions,
  getSubmissionsForClient,
  reviewSubmission,
  downloadSubmissionFile
} = require("../controllers/submissionController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const upload = require("../middleware/uploadMiddleware");

// Freelancer submits work with files
router.post(
  "/:taskId",
  protect,
  authorizeRoles("freelancer"),
  upload.array("files", 5),
  createSubmission
);

// Freelancer views their submissions
router.get(
  "/my",
  protect,
  authorizeRoles("freelancer"),
  getMySubmissions
);

// Client views submissions
router.get(
  "/client",
  protect,
  authorizeRoles("client"),
  getSubmissionsForClient
);

// Client approves work or requests revisions
router.patch(
  "/:submissionId/review",
  protect,
  authorizeRoles("client"),
  reviewSubmission
);

// View or download a submission file
router.get(
  "/:submissionId/files/:fileId",
  protect,
  downloadSubmissionFile
);

module.exports = router;
