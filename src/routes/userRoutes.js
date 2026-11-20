
const express = require("express");
const router = express.Router();

const {
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  uploadProfilePhoto,
  getFreelancerWorkHistory
} = require("../controllers/userController");

const { protect } = require("../middleware/authMiddleware");
const profileUpload = require("../middleware/profileUploadMiddleware");

// Protected routes — logged-in users only
router.get("/profile", protect, getMyProfile);
router.put("/profile", protect, updateMyProfile);

// Public route — anyone can view another user's profile
router.get("/:userId/profile", getPublicProfile);

// Public route — freelancer's completed work history
router.get("/:userId/work-history", getFreelancerWorkHistory);

// upload profile
router.post("/profile/photo",protect,profileUpload.single("photo"),uploadProfilePhoto);

module.exports = router;
