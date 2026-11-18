
const { GoogleGenAI } = require("@google/genai");

// OpenRouter models
const PRIMARY_MODEL = "inclusionai/ling-3.2-flash:free";
const SECONDARY_MODEL = "baidu/ernie-5.5-flash-preview:free";

// Gemini final fallback
const GEMINI_MODEL = "gemini-3.8-flash";

let geminiClient;

// Initialize Gemini only when needed
const getGeminiClient = () => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  return geminiClient;
};

// Generate text using an OpenRouter model
const generateWithOpenRouter = async (prompt, model) => {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OpenRouter API key is not configured.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 60000);

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a professional freelance marketplace writing assistant. Generate clear, detailed, accurate and useful content. Follow the user's instructions carefully.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.6,
          max_tokens: 1200,
        }),
        signal: controller.signal,
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error(`OpenRouter Error (${model}):`, JSON.stringify(data));
      throw new Error(
        data.error?.message ||
          `Request failed with status ${response.status}`
      );
    }

    const generatedText =
      data.choices?.[0]?.message?.content?.trim();

    if (!generatedText) {
      throw new Error(`${model} returned an empty response.`);
    }

    return generatedText;
  } finally {
    clearTimeout(timeout);
  }
};

// Final fallback: Gemini
const generateWithGemini = async (prompt) => {
  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.6,
      maxOutputTokens: 1200,
    },
  });

  const generatedText = response.text?.trim();

  if (!generatedText) {
    throw new Error("Gemini returned an empty response.");
  }

  return generatedText;
};

// Main function used by existing AI controllers
const generateText = async (prompt) => {
  // 1. Try primary OpenRouter model
  try {
    console.log(`AI Provider: Trying ${PRIMARY_MODEL}...`);

    const result = await generateWithOpenRouter(
      prompt,
      PRIMARY_MODEL
    );

    console.log("AI Provider: Primary model succeeded.");
    return result;
  } catch (primaryError) {
    console.error("Primary model failed:", primaryError.message);
  }

  // 2. Try secondary OpenRouter model
  try {
    console.log(`AI Provider: Trying ${SECONDARY_MODEL}...`);

    const result = await generateWithOpenRouter(
      prompt,
      SECONDARY_MODEL
    );

    console.log("AI Provider: Secondary model succeeded.");
    return result;
  } catch (secondaryError) {
    console.error("Secondary model failed:", secondaryError.message);
  }

  // 3. Try Gemini fallback
  try {
    console.log("AI Provider: Switching to Gemini fallback...");

    const result = await generateWithGemini(prompt);

    console.log("AI Provider: Gemini fallback succeeded.");
    return result;
  } catch (geminiError) {
    console.error("Gemini fallback failed:", geminiError.message);

    const error = new Error(
      "All AI providers are currently unavailable. Please try again later."
    );

    error.code = "AI_PROVIDERS_UNAVAILABLE";
    throw error;
  }
};

module.exports = { generateText };
