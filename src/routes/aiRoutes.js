const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const { aiRateLimit, generateProposal, generateTaskDescription } = require("../controllers/aiController");

router.post("/generate-proposal", protect, authorizeRoles("freelancer"), aiRateLimit, generateProposal);
router.post("/generate-task-description", protect, authorizeRoles("client"), aiRateLimit, generateTaskDescription);

module.exports = router;
