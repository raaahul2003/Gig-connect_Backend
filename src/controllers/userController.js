const User = require("../models/user");
const Submission = require("../models/Submission");
const mongoose = require("mongoose");

// GET LOGGED-IN USER'S PROFILE
const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile fetched successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch profile",
      error: error.message,
    });
  }
};

// UPDATE LOGGED-IN USER'S PROFILE
const updateMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { profile, freelancerProfile, clientProfile } = req.body;

    // Update common profile fields
    if (profile && typeof profile === "object") {
      if (profile.photoUrl !== undefined)
        user.profile.photoUrl = profile.photoUrl;

      if (profile.bio !== undefined)
        user.profile.bio = profile.bio;

      if (profile.location !== undefined)
        user.profile.location = profile.location;
    }

    // Update freelancer-specific fields
    if (user.role === "freelancer" && freelancerProfile) {
      if (freelancerProfile.headline !== undefined)
        user.freelancerProfile.headline = freelancerProfile.headline;

      if (freelancerProfile.skills !== undefined)
        user.freelancerProfile.skills = freelancerProfile.skills;

      if (freelancerProfile.experience !== undefined)
        user.freelancerProfile.experience = freelancerProfile.experience;

      if (freelancerProfile.portfolio !== undefined)
        user.freelancerProfile.portfolio = freelancerProfile.portfolio;
    }

    // Update client-specific fields
    if (user.role === "client" && clientProfile) {
      if (clientProfile.companyName !== undefined)
        user.clientProfile.companyName = clientProfile.companyName;

      if (clientProfile.companyWebsite !== undefined)
        user.clientProfile.companyWebsite = clientProfile.companyWebsite;

      if (clientProfile.companyDescription !== undefined)
        user.clientProfile.companyDescription =
          clientProfile.companyDescription;
    }

    await user.save();

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        profile: user.profile,
        freelancerProfile: user.freelancerProfile,
        clientProfile: user.clientProfile,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

// GET ANOTHER USER'S PUBLIC PROFILE
const getPublicProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select("name role profile freelancerProfile clientProfile createdAt");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Public profile fetched successfully",
      user,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    res.status(500).json({
      message: "Failed to fetch public profile",
      error: error.message,
    });
  }
};

// GET FREELANCER'S VERIFIED COMPLETED WORK
const getFreelancerWorkHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: "Invalid user ID.",
      });
    }

    const freelancer = await User.findOne({
      _id: userId,
      role: "freelancer",
    }).select("_id");

    if (!freelancer) {
      return res.status(404).json({
        message: "Freelancer not found.",
      });
    }

    const completedWork = await Submission.find({
      freelancer: userId,
      status: "approved",
    })
      .populate({
        path: "task",
        match: { status: "completed" },
        select: "title category description updatedAt",
      })
      .select("task freelancer client status updatedAt")
      .sort({ updatedAt: -1 });

    const verifiedWork = completedWork.filter(
      (submission) => submission.task !== null
    );

    return res.status(200).json({
      count: verifiedWork.length,
      completedWork: verifiedWork,
    });
  } catch (error) {
    console.error("Get freelancer work history error:", error);

    return res.status(500).json({
      message: "Failed to fetch freelancer work history.",
    });
  }
};



// UPLOAD PROFILE PHOTO
const uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Please select a profile photo.",
      });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    // Save Cloudinary image URL in MongoDB
    user.profile.photoUrl = req.file.path;

    await user.save();

    res.status(200).json({
      message: "Profile photo uploaded successfully.",
      photoUrl: user.profile.photoUrl,
    });
  } catch (error) {
    console.error("Profile photo upload error:", error);

    res.status(500).json({
      message: "Failed to upload profile photo.",
    });
  }
};


module.exports = {
  getMyProfile,
  updateMyProfile,
  getPublicProfile,
  uploadProfilePhoto,
  getFreelancerWorkHistory
};
