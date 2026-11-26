const User = require("../models/user");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const sendVerificationEmail = require("../utils/sendVerificationEmail");
const sendPasswordResetEmail = require("../utils/sendPasswordResetEmail");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Register a new user
const registerUser = async (req, res) => {
  let user;

  try {
    const { name, email, password, role, clientType } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email and password",
      });
    }

    if (role && !["client", "freelancer"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account role",
      });
    }

    if (
      role === "client" &&
      clientType &&
      !["individual", "company"].includes(clientType)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid client type",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    // Generate a secure verification token.
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Store only the hashed token in MongoDB.
    const hashedToken = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: role || "freelancer",
      clientType:
        role === "client" ? clientType || "individual" : undefined,

      isEmailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
    });

    // Send verification email.
    await sendVerificationEmail(user.email, verificationToken);

    return res.status(201).json({
      success: true,
      message: "Registration successful. Please check your email to verify your account.",
      emailVerificationRequired: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        clientType: user.clientType,
      },
    });
  } catch (error) {
    console.error("Registration Error:", error);

    // Remove the newly created account if the email could not be sent.
    if (user) {
      await User.findByIdAndDelete(user._id).catch((deleteError) => {
        console.error("Registration rollback error:", deleteError);
      });
    }

    return res.status(500).json({
      success: false,
      message: "Could not complete registration or send verification email. Please try again.",
    });
  }
};

// Login an existing user
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // 2. Find user by email
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // 3. Compare entered password with hashed password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check email verification
    if (user.isEmailVerified === false) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before logging in.",
        emailVerificationRequired: true,
      });
    }

    // 4. Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      }
    );

    // 5. Send successful response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

//google Login an  user
const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: "Google credential is required." });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({ message: "Google email could not be verified." });
    }

    const email = payload.email.toLowerCase();
    let user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        needsRole: true,
        email,
        name: payload.name || "",
        message: "Choose a role to finish creating your account.",
      });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    return res.status(200).json({
      needsRole: false,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Google login error:", error.message);
    return res.status(401).json({ message: "Google sign-in could not be verified." });
  }
};

const completeGoogleRegistration = async (req, res) => {
  try {
    const { credential, role, clientType } = req.body;

    if (!credential || !["client", "freelancer"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Google credential and a valid role are required.",
      });
    }

    if (
      role === "client" &&
      clientType &&
      !["individual", "company"].includes(clientType)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid client type",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.email || !payload.email_verified) {
      return res.status(401).json({
        success: false,
        message: "Google email could not be verified.",
      });
    }

    const email = payload.email.toLowerCase().trim();
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists. Please sign in.",
      });
    }

    const user = await User.create({
      name: payload.name || email,
      email,
      role,
      clientType: role === "client" ? clientType || "individual" : undefined,
      isEmailVerified: true,
    });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        clientType: user.clientType,
      },
    });
  } catch (error) {
    console.error("Google registration error:", error.message);
    return res.status(401).json({
      success: false,
      message: "Google registration could not be verified.",
    });
  }
};

// Verify email address
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send("Verification token is missing.");
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .send("Verification link is invalid or has expired.");
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;

    await user.save();

    return res.redirect(
      `${process.env.CLIENT_URL}/login?verified=true`
    );
  } catch (error) {
    console.error("Email verification error:", error);

    return res.status(500).send("Unable to verify email. Please try again.");
  }
};

// Request password reset
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    // Always return the same response to avoid revealing registered emails.
    const genericMessage =
      "If an account exists with this email, a password reset link will be sent.";

    if (!user || !user.password) {
      return res.status(200).json({
        success: true,
        message: genericMessage,
      });
    }

    // Generate a secure random token.
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Store only its SHA-256 hash.
    user.passwordResetToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Token expires in 15 minutes.
    user.passwordResetExpires = Date.now() + 15 * 60 * 1000;

    await user.save();

    try {
      await sendPasswordResetEmail(user.email, resetToken);
    } catch (emailError) {
      // Invalidate the token if email delivery fails.
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      console.error("Password reset email delivery failed:", emailError);

      // Do not reveal whether the email belongs to an account.
    }

    return res.status(200).json({
      success: true,
      message: genericMessage,
    });
  } catch (error) {
    console.error("Forgot password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process your request. Please try again.",
    });
  }
};

// Reset password using token
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Password reset link is invalid or has expired.",
      });
    }

    // Update password. Your existing pre-save hook hashes it.
    user.password = password;

    // Invalidate the reset token after successful use.
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful. You can now log in.",
    });
  } catch (error) {
    console.error("Reset password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset password. Please try again.",
    });
  }
};


module.exports = { registerUser, loginUser, googleLogin, completeGoogleRegistration, verifyEmail, forgotPassword, resetPassword };
