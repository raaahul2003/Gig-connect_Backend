const express = require("express");
const { registerUser , loginUser ,googleLogin ,completeGoogleRegistration } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

// Register route
router.post("/register", registerUser);

// Login route
router.post("/login", loginUser);

// google login
router.post("/google", googleLogin);

// google registration login
router.post("/google/complete-registration", completeGoogleRegistration);

// Protected test route
router.get("/verify", protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: "You are authenticated!",
    user: req.user,
  });
});

router.get(
  "/client-only",
  protect,
  authorizeRoles("client"),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Welcome, Client!",
      user: req.user,
    });
  }
);

module.exports = router;