const express = require("express");
const router = express.Router();

const {
  createTask,
  getTasks,
  getTaskById,
  getMyTasks,
} = require("../controllers/taskController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

router.post("/", protect, authorizeRoles("client"), createTask);

router.get("/", getTasks);

// Get tasks posted by the logged-in client
router.get("/my",protect,authorizeRoles("client"),getMyTasks);

// Keep this route after /my
router.get("/:taskId", getTaskById);

module.exports = router;