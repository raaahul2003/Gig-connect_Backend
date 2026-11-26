
const express = require("express");
const router = express.Router();

const {
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  uploadProfilePhoto,
  getFreelancerWorkHistory,
  updateNotificationPreferences,
  changePassword,
} = require("../controllers/userController");

const { protect } = require("../middleware/authMiddleware");
const profileUpload = require("../middleware/profileUploadMiddleware");

// Protected routes — logged-in users only
router.get("/profile", protect, getMyProfile);
router.put("/profile", protect, updateMyProfile);

// Settings routes
router.put(
  "/settings/notifications",
  protect,
  updateNotificationPreferences
);
router.put("/change-password", protect, changePassword);

// Public routes
router.get("/:userId/profile", getPublicProfile);
router.get("/:userId/work-history", getFreelancerWorkHistory);

// Profile photo upload
router.post(
  "/profile/photo",
  protect,
  profileUpload.single("photo"),
  uploadProfilePhoto
);

module.exports = router;
