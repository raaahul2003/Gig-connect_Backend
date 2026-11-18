
const express = require("express");
const router = express.Router();

const {
  getMyConversations,
  getMessages,
  sendMessage,
} = require("../controllers/messageController");

const { protect } = require("../middleware/authMiddleware");

router.get("/", protect, getMyConversations);

router.get("/:applicationId", protect, getMessages);

router.post("/:applicationId", protect, sendMessage);

module.exports = router;
