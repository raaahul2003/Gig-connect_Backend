const express = require("express");
const router = express.Router();

const { createTask } = require("../controllers/taskController");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

router.post("/", protect, authorizeRoles("client"), createTask);

module.exports = router;