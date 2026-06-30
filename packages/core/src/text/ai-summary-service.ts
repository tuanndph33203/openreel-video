import type { Subtitle } from "../types/timeline";
import { buildRequestBody } from "./transcription-service";

export interface VideoInsights {
  summary: string;
  chapters: Array<{ time: number; label: string }>;
  seo: Record<string, {
    titleSuggestions: string[];
    tags: string[];
    description: string;
  }>;
}

function getProxyService(provider: "openai" | "anthropic" | "gemini", customBaseUrl?: string): string {
  if (provider === "openai" && customBaseUrl?.includes("integrate.api.nvidia.com")) {
    return "nvidia";
  }
  return provider;
}

export function buildInsightsSystemPrompt(targetLanguages: string[] = ["vi"]): string {
  const languagesList = targetLanguages.join(", ");
  const seoStructure = targetLanguages.map(lang => `
    "${lang}": {
      "titleSuggestions": ["3-5 catchy YouTube title ideas in language '${lang}'"],
      "tags": ["10-15 relevant SEO tags/keywords in language '${lang}'"],
      "description": "An optimized YouTube description paragraph in language '${lang}'"
    }`).join(",");

  return `You are an expert video content analyst and SEO manager.
Your task is to analyze the provided subtitle transcript and generate a video summary, chapter markers, and SEO metadata.

You must output a valid JSON object matching this structure EXACTLY:
{
  "summary": "Detailed narrative summary of the video content (in the primary language of the transcript)",
  "chapters": [
    { "time": 90, "label": "Short descriptive chapter title (in the primary language of the transcript)" }
  ],
  "seo": {${seoStructure}
  }
}

Rules:
- Output MUST be a valid JSON object only. Do NOT wrap in markdown code blocks or add markdown formatting.
- Chapters must be chronologically ordered. Time must be in seconds as a number (e.g. 90, not "01:30" or "90s").
- The summary and description must be engaging and natural.
- SEO content must be generated specifically for each of these languages: ${languagesList}.
- Do not output any conversational filler or explanation outside the JSON.`;
}

export function formatTranscriptForInsights(subtitles: Subtitle[]): string {
  return subtitles
    .filter(s => s.text && s.text.trim().length > 0)
    .map(s => {
      const minutes = Math.floor(s.startTime / 60);
      const seconds = Math.floor(s.startTime % 60);
      const timeStr = `[${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}]`;
      return `${timeStr} ${s.text}`;
    })
    .join("\n");
}

export async function generateVideoInsights(
  subtitles: Subtitle[],
  aiConfig: {
    provider: "openai" | "anthropic" | "gemini";
    apiKey: string;
    tone?: string;
    videoContext?: string;
    customBaseUrl?: string;
    customModel?: string;
    temperature?: number;
    seoLanguages?: string[];
  }
): Promise<VideoInsights> {
  if (!aiConfig || !aiConfig.apiKey) {
    throw new Error("Missing AI configuration or API Key");
  }

  const provider = aiConfig.provider;
  const proxyService = getProxyService(provider, aiConfig.customBaseUrl);
  const url = `/api/proxy/${proxyService}${(provider === 'openai' || provider === 'gemini') ? '/chat/completions' : '/messages'}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-proxy-api-key': aiConfig.apiKey
  };
  if (aiConfig.customBaseUrl) {
    headers['x-proxy-base-url'] = aiConfig.customBaseUrl.trim().replace(/\/$/, "");
  }

  const isMimo = !!(
    (aiConfig.customBaseUrl && aiConfig.customBaseUrl.includes('xiaomimimo.com')) ||
    (aiConfig.customModel && aiConfig.customModel.toLowerCase().includes('mimo'))
  );

  let resolvedModel;
  if (provider === 'gemini') {
    resolvedModel = aiConfig.customModel ? aiConfig.customModel.trim() : 'gemini-1.5-flash';
  } else if (provider === 'openai') {
    if (isMimo) {
      resolvedModel = aiConfig.customModel?.trim() ? aiConfig.customModel.trim() : 'mimo-v2.5';
    } else {
      resolvedModel = aiConfig.customModel ? aiConfig.customModel.trim() : 'gpt-4o';
    }
  } else {
    resolvedModel = aiConfig.customModel ? aiConfig.customModel.trim() : 'claude-3-5-sonnet-20241022';
  }

  const transcriptText = formatTranscriptForInsights(subtitles);
  if (!transcriptText) {
    throw new Error("Cannot generate insights for empty subtitles");
  }

  const userPrompt = `--- VIDEO TRANSCRIPT ---\n${transcriptText}`;
  const systemPrompt = buildInsightsSystemPrompt(aiConfig.seoLanguages || ["vi"]);
  
  // Set higher temperature (e.g. 0.7) for creative SEO copy generation, or default to 0.7
  const targetTemp = aiConfig.temperature !== undefined ? aiConfig.temperature : 0.7;

  // Utilize the buildRequestBody helper. Notice that since this is a long-form task, we set isMimo/reasoning checks.
  // We want to give Mimo a higher max token limit for insights since it needs to write summary + chapters + tags.
  // So we pass isMimo as false to buildRequestBody to avoid the 4k limit, OR we handle limits directly here.
  // Actually, let's bypass buildRequestBody's strict 4k limit if we want Mimo to generate a longer insight block.
  // Wait, let's just make it a direct call or customize buildRequestBody parameters.
  // Actually, Mimo is a reasoning model, so we want it to think. But if we limit it to 4k, that is enough for the final JSON block.
  // Yes, 4k is 4000 output tokens, which is plenty for 1 page of JSON text.
  const requestBody = buildRequestBody(
    userPrompt,
    systemPrompt,
    resolvedModel,
    provider,
    isMimo,
    subtitles.length,
    targetTemp
  );

  // If this is Mimo or a reasoning model, we want to allow it to think with a bit higher max tokens if needed, e.g. 8000 tokens.
  // But 4000 is still set by buildRequestBody. Let's make sure requestBody is correct:
  if (isMimo || resolvedModel.startsWith('o1') || resolvedModel.startsWith('o3')) {
    // For large analysis, we can optionally expand it slightly:
    if (provider === 'openai' || provider === 'gemini') {
      requestBody.max_completion_tokens = 8000;
    } else {
      requestBody.max_tokens = 8000;
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  const json = await response.json();
  const rawContent = (provider === 'openai' || provider === 'gemini')
    ? (json.choices?.[0]?.message?.content ?? '')
    : (json.content?.[0]?.text ?? '');

  let cleanText = rawContent.trim();
  
  // Strip potential markdown JSON code block formatting
  if (cleanText.startsWith("```json")) {
    cleanText = cleanText.substring(7);
  }
  if (cleanText.startsWith("```")) {
    cleanText = cleanText.substring(3);
  }
  if (cleanText.endsWith("```")) {
    cleanText = cleanText.substring(0, cleanText.length - 3);
  }
  cleanText = cleanText.trim();

  try {
    const parsed = JSON.parse(cleanText);
    if (!parsed.summary || !parsed.chapters || !parsed.seo) {
      throw new Error("JSON structure is missing required insight properties");
    }
    return parsed as VideoInsights;
  } catch (err) {
    console.error("[generateVideoInsights] Failed to parse JSON response:", cleanText);
    throw new Error("Failed to parse valid JSON insights from AI response: " + err);
  }
}
