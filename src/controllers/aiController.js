const { generateText } = require("../services/geminiService");

const MAX_REQUESTS = 10;
const WINDOW_MS = 10 * 60 * 1000;
const requestLog = new Map();

const hasText = (value) => typeof value === "string" && value.trim().length > 0;
const isValidText = (value, maximum) =>
  value === undefined || (typeof value === "string" && value.trim().length <= maximum);

const formatValue = (value) => (hasText(value) ? value.trim() : "Not provided");

const aiRateLimit = (req, res, next) => {
  const key = req.user.userId;
  const now = Date.now();
  const recentRequests = (requestLog.get(key) || []).filter(
    (timestamp) => now - timestamp < WINDOW_MS
  );

  if (recentRequests.length >= MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      message: "Too many AI generation requests. Please try again in a few minutes.",
    });
  }

  recentRequests.push(now);
  requestLog.set(key, recentRequests);
  return next();
};


const handleGenerationError = (error, res) => {
  console.error("AI generation error:", error.message);

  if (error.code === "AI_NOT_CONFIGURED") {
    return res.status(503).json({
      success: false,
      message: "AI service is not configured. Please contact support.",
    });
  }

  const status = Number(error.status || error.statusCode || error.code);

  if (status === 503 || status === 429) {
    return res.status(503).json({
      success: false,
      message:
        "The AI service is currently busy. Please try again in a few seconds.",
    });
  }

  return res.status(502).json({
    success: false,
    message: "Could not generate content right now. Please try again.",
  });
};


const generateProposal = async (req, res) => {
  const {
    taskTitle,
    taskDescription,
    requiredSkills,
    deliverables,
    budget,
    deadline,
    freelancerSkills,
    freelancerExperience,
  } = req.body;

  if (!hasText(taskTitle) || !hasText(taskDescription)) {
    return res.status(400).json({
      success: false,
      message: "Task title and description are required.",
    });
  }

  if (
    ![
      taskTitle,
      taskDescription,
      requiredSkills,
      deliverables,
      freelancerSkills,
      freelancerExperience,
    ].every((value) => isValidText(value, 5000))
  ) {
    return res.status(400).json({
      success: false,
      message: "One or more text fields are too long or invalid.",
    });
  }

  const prompt = `
You are a professional freelance proposal writer
helping freelancers apply for projects on GigConnect.

Your task is to write a personalized, professional
proposal from the freelancer's perspective.

TASK DETAILS:

Task Title: ${formatValue(taskTitle)}
Task Description: ${formatValue(taskDescription)}
Required Skills: ${formatValue(requiredSkills)}
Expected Deliverables: ${formatValue(deliverables)}
Client Budget: ${formatValue(String(budget || ""))}
Deadline: ${formatValue(String(deadline || ""))}

FREELANCER INFORMATION:

Relevant Skills: ${formatValue(freelancerSkills)}
Relevant Experience: ${formatValue(freelancerExperience)}

WRITING REQUIREMENTS:

1. Write approximately 120-180 words.
2. Use natural, professional and friendly English.
3. Start with a suitable greeting.
4. Show that you understand the client's requirements.
5. Explain a practical approach to completing the task.
6. Connect the freelancer's supplied skills and experience
   to the project.
7. Do not invent skills, qualifications, experience,
   previous projects or achievements.
8. If freelancer information is missing, avoid making
   unsupported personal claims.
9. Do not guarantee results that cannot be confirmed.
10. Avoid generic statements and unnecessary repetition.
11. Do not include a proposed price or delivery time.
    These are entered separately in the application form.

PROPOSAL STRUCTURE:

- Greeting
- Understanding of the project
- Proposed approach
- Relevant skills and experience
- Professional closing

Return only the final proposal.
`;

  try {
    const generatedText = await generateText(prompt);

    if (!generatedText) {
      throw new Error("AI returned an empty response.");
    }

    return res.status(200).json({
      success: true,
      generatedText,
    });
  } catch (error) {
    return handleGenerationError(error, res);
  }
};


const generateTaskDescription = async (req, res) => {
  const { title, category, roughIdea, requiredSkills, deliverables, budget, deadline } = req.body;

  if (!hasText(roughIdea)) {
    return res.status(400).json({ success: false, message: "Please enter a rough task idea before generating a description." });
  }

  if (![title, category, roughIdea, requiredSkills, deliverables].every((value) => isValidText(value, 5000))) {
    return res.status(400).json({ success: false, message: "One or more text fields are too long or invalid." });
  }



  const prompt = `
You are an expert freelance marketplace task description writer
for GigConnect.

Your job is to transform the client's rough project idea into
a natural, clear and professional task description.

IMPORTANT WRITING STYLE:

Write the description as if the CLIENT personally wrote it
and is explaining their project directly to freelancers.

Use first-person language naturally:
- "I'm looking for..."
- "I need someone who can..."
- "I want to create..."
- "The project involves..."
- "My goal is..."

NEVER describe the client in the third person.

Do NOT write phrases such as:
- "The client is looking for..."
- "The client wants..."
- "The freelancer will..."
- "The client is organizing..."
- "The goal is to help the client..."

TASK INFORMATION:

Task Title: ${formatValue(title)}
Category: ${formatValue(category)}
Client's Rough Idea: ${formatValue(roughIdea)}

WRITING REQUIREMENTS:

1. Write approximately 120-180 words.
2. Use natural, simple and professional English.
3. Make it sound like a real client explaining their project.
4. Clearly explain what the client wants to achieve.
5. Describe the actual work the client needs help with.
6. Explain the expected outcome in a natural way.
7. Use first-person language where appropriate.
8. Do not invent features, technologies, requirements,
   experience or project details.
9. Avoid robotic, promotional or overly formal language.
10. Avoid repeating the same information.
11. Do not mention AI or that the description was generated.
12. Do not include budget, deadline, required skills or
    deliverables. These are displayed separately on the task page.

STRUCTURE:

Project Overview:
Explain the project naturally from the client's perspective.

Scope of Work:
Explain what the client needs help with.

Expected Outcome:
Describe what the client expects after the work is completed.

Return only the final task description.
`;



  try {
    const generatedText = await generateText(prompt);
    if (!generatedText) throw new Error("Gemini returned an empty response.");
    return res.status(200).json({ success: true, generatedText });
  } catch (error) {
    return handleGenerationError(error, res);
  }
};

module.exports = { aiRateLimit, generateProposal, generateTaskDescription };
