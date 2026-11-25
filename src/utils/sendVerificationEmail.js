
const sendVerificationEmail = async (email, token) => {
  try {
    const verificationUrl =
      `${process.env.SERVER_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

    const response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": process.env.BREVO_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: "GigConnect",
            email: process.env.EMAIL_FROM,
          },
          to: [{ email }],
          subject: "Verify your GigConnect email",
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
              <h2>Welcome to GigConnect!</h2>
              <p>Thanks for creating your account.</p>
              <p>Please verify your email address by clicking below.</p>

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
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Brevo email error:", result);
      throw new Error(
        result.message || "Failed to send verification email"
      );
    }

    console.log("Verification email accepted by Brevo:", result.messageId);

    return result;
  } catch (error) {
    console.error("Verification email error:", error.message);
    throw error;
  }
};

module.exports = sendVerificationEmail;
