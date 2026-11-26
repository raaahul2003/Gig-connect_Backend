
const Payment = require("../models/Payment");
const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const { createNotification } = require("./notificationController");

const PLATFORM_FEE_RATE = 5;

// Calculate payment breakdown from the accepted freelancer bid
const calculatePaymentBreakdown = (bidAmount) => {
    const amount = Number(bidAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("INVALID_TASK_AMOUNT");
    }

    const platformFee =
        Math.round(amount * (PLATFORM_FEE_RATE / 100) * 100) / 100;

    const freelancerAmount = amount;
    const clientTotal =
        Math.round((amount + platformFee) * 100) / 100;

    return {
        amount,
        platformFeeRate: PLATFORM_FEE_RATE,
        platformFee,
        freelancerAmount,
        clientTotal,
    };
};

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

        const paidPayments = payments.filter(
            (payment) => payment.status === "paid"
        );

        const totalEarnings = paidPayments.reduce(
            (total, payment) =>
                total + (payment.freelancerAmount ?? payment.amount),
            0
        );

        const totalPlatformFees = paidPayments.reduce(
            (total, payment) =>
                total + (payment.platformFee ?? 0),
            0
        );

        return res.status(200).json({
            success: true,
            totalEarnings,
            totalPlatformFees,
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

        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: "Payment ID is required.",
            });
        }

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

        if (payment.status === "paid") {
            return res.status(400).json({
                success: false,
                message: "This payment has already been completed.",
            });
        }

        // Never modify the financial breakdown of a completed payment.
        if (payment.status === "refunded") {
            return res.status(400).json({
                success: false,
                message: "Refunded payments cannot be checked out again.",
            });
        }

        // Existing processing order: verify its actual amount before reuse.
        if (payment.status === "processing") {
            if (
                payment.paymentMethod !== "razorpay" ||
                !payment.razorpayOrderId
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Existing Razorpay order not found.",
                });
            }

            const expectedTotal =
                payment.clientTotal ??
                calculatePaymentBreakdown(payment.amount).clientTotal;

            const order = await razorpay.orders.fetch(
                payment.razorpayOrderId
            );

            if (
                order.amount !== Math.round(expectedTotal * 100) ||
                order.currency !== payment.currency
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        "An older payment order has a different amount. Please contact support to refresh this payment safely.",
                });
            }

            // Save missing breakdown only if the existing order matches
            if (
                payment.clientTotal == null ||
                payment.platformFee == null ||
                payment.freelancerAmount == null ||
                payment.platformFeeRate == null
            ) {
                const breakdown = calculatePaymentBreakdown(
                    payment.amount
                );

                Object.assign(payment, breakdown);
                await payment.save();
            }

            return res.status(200).json({
                success: true,
                message: "Existing Razorpay order retrieved.",
                order,
                key: process.env.RAZORPAY_KEY_ID,
            });
        }

        if (payment.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Payment is not available for checkout.",
            });
        }

        // For older pending records, calculate and store the fee now.
        // New records already have this breakdown from submission approval.
        if (
            payment.clientTotal == null ||
            payment.platformFee == null ||
            payment.freelancerAmount == null ||
            payment.platformFeeRate == null
        ) {
            const breakdown = calculatePaymentBreakdown(payment.amount);
            Object.assign(payment, breakdown);
        }

        // Validate the stored breakdown before creating an order.
        const expectedBreakdown = calculatePaymentBreakdown(
            payment.amount
        );

        if (
            payment.platformFeeRate !== PLATFORM_FEE_RATE ||
            payment.platformFee !== expectedBreakdown.platformFee ||
            payment.freelancerAmount !== expectedBreakdown.freelancerAmount ||
            payment.clientTotal !== expectedBreakdown.clientTotal
        ) {
            return res.status(400).json({
                success: false,
                message: "Payment amount breakdown is invalid.",
            });
        }

        // Create Razorpay order using the full client payable amount.
        const order = await razorpay.orders.create({
            amount: Math.round(payment.clientTotal * 100),
            currency: payment.currency,
            receipt: `payment_${payment._id}`,
        });

        payment.razorpayOrderId = order.id;
        payment.paymentMethod = "razorpay";
        payment.status = "processing";

        await payment.save();

        return res.status(200).json({
            success: true,
            message: "Razorpay order created successfully.",
            order,
            key: process.env.RAZORPAY_KEY_ID,
        });
    } catch (error) {
        console.error("Create Razorpay order error:", error);

        if (error.message === "INVALID_TASK_AMOUNT") {
            return res.status(400).json({
                success: false,
                message: "Invalid freelancer bid amount.",
            });
        }

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

        if (
            payment.status !== "processing" ||
            payment.razorpayOrderId !== razorpay_order_id
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment or order.",
            });
        }

        // Ensure the saved breakdown exists and is correct.
        const expectedBreakdown = calculatePaymentBreakdown(
            payment.amount
        );

        if (
            payment.clientTotal !== expectedBreakdown.clientTotal ||
            payment.platformFee !== expectedBreakdown.platformFee ||
            payment.freelancerAmount !== expectedBreakdown.freelancerAmount ||
            payment.platformFeeRate !== PLATFORM_FEE_RATE
        ) {
            return res.status(400).json({
                success: false,
                message: "Payment breakdown is invalid. Please contact support.",
            });
        }

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

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

        // Confirm payment details directly with Razorpay.
        const razorpayPayment = await razorpay.payments.fetch(
            razorpay_payment_id
        );

        if (
            razorpayPayment.order_id !== razorpay_order_id ||
            razorpayPayment.status !== "captured" ||
            razorpayPayment.amount !== Math.round(payment.clientTotal * 100) ||
            razorpayPayment.currency !== payment.currency
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Payment is not captured or payment details do not match.",
            });
        }

        // Atomic update prevents duplicate payment confirmation.
        const updatedPayment = await Payment.findOneAndUpdate(
            {
                _id: payment._id,
                client: req.user.userId,
                status: "processing",
                razorpayOrderId: razorpay_order_id,
            },
            {
                $set: {
                    status: "paid",
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature,
                    paidAt: new Date(),
                },
            },
            { new: true }
        );

        if (!updatedPayment) {
            const existingPayment = await Payment.findById(payment._id);

            if (
                existingPayment?.status === "paid" &&
                existingPayment.razorpayPaymentId === razorpay_payment_id &&
                existingPayment.razorpayOrderId === razorpay_order_id
            ) {
                return res.status(200).json({
                    success: true,
                    message: "Payment already verified successfully.",
                    payment: existingPayment,
                });
            }

            return res.status(409).json({
                success: false,
                message: "Payment has already been processed or changed.",
            });
        }

        // Notify freelancer only after successful payment.
        try {
            await createNotification({
                recipient: updatedPayment.freelancer,
                sender: updatedPayment.client,
                type: "payment_received",
                title: "Payment received!",
                message: `Your earnings of ₹${updatedPayment.freelancerAmount} for the completed task have been confirmed.`,
                link: "/freelancer/earnings",
            });
        } catch (notificationError) {
            console.error(
                "Payment notification error:",
                notificationError
            );
        }

        return res.status(200).json({
            success: true,
            message: "Payment verified successfully.",
            payment: updatedPayment,
        });
    } catch (error) {
        console.error("Verify Razorpay payment error:", error);

        if (error.message === "INVALID_TASK_AMOUNT") {
            return res.status(400).json({
                success: false,
                message: "Invalid freelancer bid amount.",
            });
        }

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
    verifyRazorpayPayment,
};
