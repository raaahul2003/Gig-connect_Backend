
const express = require("express");
const router = express.Router();

const {
  getClientPayments,
  getFreelancerEarnings,
  createRazorpayOrder,
  verifyRazorpayPayment
} = require("../controllers/paymentController");

const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

// Client payment history
router.get(
  "/client",
  protect,
  authorizeRoles("client"),
  getClientPayments
);

// Freelancer earnings
router.get(
  "/earnings",
  protect,
  authorizeRoles("freelancer"),
  getFreelancerEarnings
);

// Create Razorpay order
router.post(
  "/create-order",
  protect,
  authorizeRoles("client"),
  createRazorpayOrder
);

// Verify Razorpay payment
router.post(
  "/verify",
  protect,
  authorizeRoles("client"),
  verifyRazorpayPayment
);

module.exports = router;
