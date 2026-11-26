
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
    {
        task: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task",
            required: true,
            unique: true,
        },

        application: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Application",
            required: true,
        },

        submission: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Submission",
            required: true,
        },

        client: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        freelancer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Original agreed price: freelancer's accepted bid
        amount: {
            type: Number,
            required: true,
            min: 1,
        },

        // GigConnect platform commission percentage
        platformFeeRate: {
            type: Number,
            min: 0,
            max: 100,
            default: undefined,
        },

        // Platform commission amount
        platformFee: {
            type: Number,
            min: 0,
            default: undefined,
        },

        // Full amount payable to freelancer
        freelancerAmount: {
            type: Number,
            min: 0,
            default: undefined,
        },

        // Total amount payable by client
        clientTotal: {
            type: Number,
            min: 1,
            default: undefined,
        },

        currency: {
            type: String,
            default: "INR",
        },

        status: {
            type: String,
            enum: [
                "pending",
                "processing",
                "paid",
                "failed",
                "refunded",
            ],
            default: "pending",
        },

        paymentMethod: {
            type: String,
            enum: ["razorpay", "manual", null],
            default: null,
        },

        razorpayOrderId: {
            type: String,
            default: null,
        },

        razorpayPaymentId: {
            type: String,
            default: null,
        },

        razorpaySignature: {
            type: String,
            default: null,
        },

        paidAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
