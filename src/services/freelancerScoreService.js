
const User = require("../models/user");
const Submission = require("../models/Submission");

// Calculate freelancer reputation score
const calculateFreelancerScore = async (freelancerId) => {
  try {
    const freelancer = await User.findOne({
      _id: freelancerId,
      role: "freelancer",
    });

    if (!freelancer) {
      throw new Error("Freelancer not found");
    }

    // Get verified completed projects
    const submissions = await Submission.find({
      freelancer: freelancerId,
      status: "approved",
    }).populate({
      path: "task",
      match: { status: "completed" },
      select: "deadline status",
    });

    const completedProjects = submissions.filter(
      (submission) => submission.task !== null
    );

    // 1. Completed project score (maximum 40)
    const projectScore = Math.min(
      completedProjects.length * 8,
      40
    );

    // 2. On-time delivery score (maximum 30)
    let onTimeScore = 0;

    if (completedProjects.length > 0) {
      const onTimeProjects = completedProjects.filter(
        (submission) =>
          submission.createdAt <= submission.task.deadline
      ).length;

      const onTimePercentage =
        (onTimeProjects / completedProjects.length) * 100;

      onTimeScore = (onTimePercentage / 100) * 30;
    }

    // 3. Profile completeness score (maximum 30)
    const profileChecks = [
      Boolean(freelancer.profile?.bio?.trim()),
      Boolean(freelancer.profile?.location?.trim()),
      Boolean(freelancer.freelancerProfile?.headline?.trim()),
      freelancer.freelancerProfile?.skills?.length > 0,
      Boolean(freelancer.freelancerProfile?.experience?.trim()),
      freelancer.freelancerProfile?.portfolio?.length > 0,
    ];

    const completedProfileFields = profileChecks.filter(
      Boolean
    ).length;

    const profileScore =
      (completedProfileFields / profileChecks.length) * 30;

    // Calculate base score
    const baseScore = Math.round(
      projectScore + onTimeScore + profileScore
    );

    // Apply authorized admin adjustment
    const finalScore = Math.max(
      0,
      Math.min(100, baseScore + (freelancer.reputation?.adminAdjustment || 0))
    );

    // Save calculated score
    freelancer.reputation.score = finalScore;
    freelancer.reputation.lastCalculatedAt = new Date();

    await freelancer.save();

    return {
      score: finalScore,
      baseScore,
      adminAdjustment: freelancer.reputation.adminAdjustment || 0,
      completedProjects: completedProjects.length,
      projectScore,
      onTimeScore: Math.round(onTimeScore),
      profileScore: Math.round(profileScore),
    };
  } catch (error) {
    console.error("Freelancer score calculation error:", error);
    throw error;
  }
};

module.exports = { calculateFreelancerScore };
