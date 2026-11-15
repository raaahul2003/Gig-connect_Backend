
const Payment = require("../models/Payment");
const razorpay = require("../config/razorpay");
const crypto = require("crypto");

// 1. Get payments made by the logged-in client
const getClientPayments = async (req, res) => {
    try {
        const payments = await Payment.find({
            client: req.user.userId,
        })
            .populate("task", "title")
            .populate("freelancer", "name email")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: payments.length,
            payments,
        });
    } catch (error) {
        console.error("Get client payments error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch client payments.",
        });
    }
};

// 2. Get earnings of the logged-in freelancer
const getFreelancerEarnings = async (req, res) => {
    try {
        const payments = await Payment.find({
            freelancer: req.user.userId,
        })
            .populate("task", "title")
            .populate("client", "name email")
            .sort({ createdAt: -1 });

        const totalEarnings = payments
            .filter((payment) => payment.status === "paid")
            .reduce((total, payment) => total + payment.amount, 0);

        return res.status(200).json({
            success: true,
            totalEarnings,
            currency: "INR",
            count: payments.length,
            payments,
        });
    } catch (error) {
        console.error("Get freelancer earnings error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch freelancer earnings.",
        });
    }
};


// 3. Create Razorpay order
const createRazorpayOrder = async (req, res) => {
    try {
        const { paymentId } = req.body;

        // Find the payment belonging to this client
        const payment = await Payment.findOne({
            _id: paymentId,
            client: req.user.userId,
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found.",
            });
        }

        // Check payment status

        // Handle existing or new Razorpay order
        let order;

        if (payment.status === "processing") {
            // Reuse the existing Razorpay order
            if (
                payment.paymentMethod !== "razorpay" ||
                !payment.razorpayOrderId
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Existing Razorpay order not found.",
                });
            }

            order = await razorpay.orders.fetch(payment.razorpayOrderId);

        } else if (payment.status === "pending") {
            // Create a new Razorpay order
            order = await razorpay.orders.create({
                amount: Math.round(payment.amount * 100),
                currency: payment.currency,
                receipt: `payment_${payment._id}`,
            });

            // Save order details
            payment.razorpayOrderId = order.id;
            payment.paymentMethod = "razorpay";
            payment.status = "processing";

            await payment.save();

        } else {
            return res.status(400).json({
                success: false,
                message: "Payment is not available for checkout.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Razorpay order created successfully.",
            order,
            key: process.env.RAZORPAY_KEY_ID,
        });
    } catch (error) {
        console.error("Create Razorpay order error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create Razorpay order.",
        });
    }
};


// 4. Verify Razorpay payment
const verifyRazorpayPayment = async (req, res) => {
    try {
        const {
            paymentId,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body;

        if (
            !paymentId ||
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                success: false,
                message: "All payment verification fields are required.",
            });
        }

        // Find payment belonging to the logged-in client
        const payment = await Payment.findOne({
            _id: paymentId,
            client: req.user.userId,
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found.",
            });
        }

        // Check order and payment status
        if (
            payment.status !== "processing" ||
            payment.razorpayOrderId !== razorpay_order_id
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment or order.",
            });
        }

        // Generate expected signature
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        // Compare signatures safely
        const expectedBuffer = Buffer.from(expectedSignature, "hex");
        const receivedBuffer = Buffer.from(razorpay_signature, "hex");

        if (
            expectedBuffer.length !== receivedBuffer.length ||
            !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
        ) {
            return res.status(400).json({
                success: false,
                message: "Payment signature verification failed.",
            });
        }

        // Verify payment status directly with Razorpay
        const razorpayPayment = await razorpay.payments.fetch(
            razorpay_payment_id
        );

        if (
            razorpayPayment.order_id !== razorpay_order_id ||
            razorpayPayment.status !== "captured" ||
            razorpayPayment.amount !== Math.round(payment.amount * 100) ||
            razorpayPayment.currency !== payment.currency
        ) {
            return res.status(400).json({
                success: false,
                message: "Payment is not captured or payment details do not match.",
            });
        }

        // Update payment record
        payment.status = "paid";
        payment.razorpayPaymentId = razorpay_payment_id;
        payment.razorpaySignature = razorpay_signature;
        payment.paidAt = new Date();

        await payment.save();

        return res.status(200).json({
            success: true,
            message: "Payment verified successfully.",
            payment,
        });
    } catch (error) {
        console.error("Verify Razorpay payment error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to verify payment.",
        });
    }
};


module.exports = {
    getClientPayments,
    getFreelancerEarnings,
    createRazorpayOrder,
    verifyRazorpayPayment
};
