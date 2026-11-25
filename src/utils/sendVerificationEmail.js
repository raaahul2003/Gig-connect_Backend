const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendVerificationEmail = async (email, token) => {
  const verificationUrl =
    `${process.env.SERVER_URL}/api/auth/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"GigConnect" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Verify your GigConnect email",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>Welcome to GigConnect!</h2>
        <p>Thanks for creating your account.</p>
        <p>Please click the button below to verify your email address.</p>

        <a
          href="${verificationUrl}"
          style="
            display: inline-block;
            padding: 12px 24px;
            background: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 6px;
          "
        >
          Verify Email
        </a>

        <p>This link expires in 24 hours.</p>
        <p>If you did not create this account, you can ignore this email.</p>
      </div>
    `,
  });
};

module.exports = sendVerificationEmail;