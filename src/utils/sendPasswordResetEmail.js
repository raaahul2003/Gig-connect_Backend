
const sendPasswordResetEmail = async (email, token) => {
  try {
    const resetUrl =
      `${process.env.CLIENT_URL}/reset-password/${encodeURIComponent(token)}`;

    const response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": process.env.BREVO_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "GigConnect",
            email: process.env.EMAIL_FROM,
          },
          to: [{ email }],
          subject: "Reset your GigConnect password",
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
              <h2>Password Reset Request</h2>
              <p>We received a request to reset your GigConnect password.</p>
              <p>Click the button below to create a new password.</p>

              <a
                href="${resetUrl}"
                style="
                  display: inline-block;
                  padding: 12px 24px;
                  background: #2563eb;
                  color: white;
                  text-decoration: none;
                  border-radius: 6px;
                "
              >
                Reset Password
              </a>

              <p>This link expires in 15 minutes.</p>
              <p>If you did not request a password reset, ignore this email.</p>
            </div>
          `,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Brevo password reset email error:", result);
      throw new Error(
        result.message || "Failed to send password reset email"
      );
    }

    console.log("Password reset email accepted by Brevo:", result.messageId);

    return result;
  } catch (error) {
    console.error("Password reset email error:", error.message);
    throw error;
  }
};

module.exports = sendPasswordResetEmail;
