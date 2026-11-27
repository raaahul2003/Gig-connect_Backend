
const jwt = require("jsonwebtoken");
const User = require("../models/user");

// Authenticate users and check account status
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check the user's latest account status in MongoDB
    const user = await User.findById(
      decoded.userId || decoded.id
    ).select("_id role isSuspended");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
      });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        suspended: true,
        message:
          "Your account has been suspended. Please contact GigConnect support.",
      });
    }

    // Use the latest database role instead of relying on an old JWT role
    req.user = {
      ...decoded,
      userId: user._id.toString(),
      role: user.role,
    };

    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

// Admin-only access
const adminOnly = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication information missing.",
      });
    }

    const user = await User.findById(userId).select(
      "role isSuspended"
    );

    if (!user || user.isSuspended || user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
      });
    }

    next();
  } catch (error) {
    console.error("Admin authorization error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify admin access.",
    });
  }
};

module.exports = { protect, adminOnly };
