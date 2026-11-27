
const express = require("express");
const router = express.Router();

const {
  createDispute,
  getMyDisputes,
} = require("../controllers/disputeController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

router.use(protect);
router.use(authorizeRoles("client", "freelancer"));

router.post("/", createDispute);
router.get("/my", getMyDisputes);

module.exports = router;
