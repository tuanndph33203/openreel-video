import type { Subtitle, SubtitleStyle, Clip } from "../types/timeline";
import type { MediaItem } from "../types/project";

export interface TranslationSettings {
  sourceLanguage: string;
  targetLanguage: string;
  tone?: string;
  topic?: string;
  glossary?: Record<string, string>;
  previousContext?: string[];
  nextContext?: string[];
}

export interface BatchPayload {
  sourceLanguage: string;
  targetLanguage: string;
  tone: string;
  topic: string;
  glossary?: Record<string, string>;
  previousContext?: string[];
  lines: Array<{ id: string; text: string }>;
  nextContext?: string[];
}

export function buildSystemPrompt(settings: TranslationSettings, isUltraShort = false): string {
  const isVietnamese = settings.targetLanguage.toLowerCase().includes("viet");
  
  if (isUltraShort) {
    const viRules = isVietnamese ? "\n- Dich tu nhien (dung Ad, bọn mình, tụi mình). TUYET DOI KHONG gop dong. Giu nguyen ID." : "";
    return `Translate JSON lines from ${settings.sourceLanguage} to ${settings.targetLanguage}.${viRules}
Rules:
- Format: {"translations":[{"id":"exact_input_id","text":"translation"}]}
- Output EXACTLY same line count and identical IDs.
- NO explanations, NO markdown, NO merged lines.`;
  }

  const viRules = isVietnamese ? `
- CROSS-LINE CONTEXT RULE (CRITICAL): The input text is heavily fragmented across lines. You MUST read and analyze the context of previous and next lines before translating. If a word, phrase, or name is split between two consecutive lines (e.g., "传" and "送 卷 轴", or "李 无" and "敌"), understand the combined full meaning first, then distribute the translation naturally across those lines. When read consecutively, it MUST form a perfectly fluent, natural, and grammatically correct Vietnamese sentence. Do NOT translate fragmented lines in isolation.
- BAN TARGET LANGUAGE CORRUPTION (CRITICAL): Under any circumstances, the translated "text" MUST be written 100% in pure, grammatically correct Vietnamese. Strictly FORBIDDEN to output Chinese characters (like 老大, 啊), pinyin, or English words (like Nonsense) inside the Vietnamese translation. If an exclamation or modal particle is found (like 啊), translate it into natural Vietnamese equivalents (e.g., "nhé", "nha", "đấy") or omit it if redundant.
- Vietnamese style & rules: Use natural, colloquial pronouns (Ad, tụi mình, bọn mình, ngươi, ta) instead of "chúng tôi/người upload". Connect fragmented phrases naturally without merging lines.
- Examples:
  "老子们 due to recent tight budget" -> "Dạo này tụi mình hơi thiếu kinh phí"
  "老子们由于最近经费紧张" -> "Dạo này tụi mình hơi thiếu kinh phí"
  "放在左下角愿意支持的点" -> "Link ở góc trái dưới" OR "Ai muốn ủng hộ thì bấm góc trái dưới"` : "";

  let glossaryRule = "";
  if (settings.glossary && Object.keys(settings.glossary).length > 0) {
    const glossaryItems = Object.entries(settings.glossary)
      .map(([key, val]) => `  - "${key}" -> "${val}"`)
      .join("\n");
    glossaryRule = `\n- GLOSSARY (Translate these terms exactly as specified):\n${glossaryItems}`;
  }

  return `You are an expert subtitle translator from ${settings.sourceLanguage} to ${settings.targetLanguage}.
Tone: ${settings.tone || "natural and fluent"}. Topic: ${settings.topic || "N/A"}.

Task: Translate ONLY the objects in the "lines" array.
Rules:
- Output MUST be valid JSON: {"translations":[{"id":"id","text":"translated_text"}]}
- CRITICAL: You MUST output exactly one translation for each input line. Do NOT combine, merge, or omit any lines. Keep the exact same number of items as the input.
- VERY IMPORTANT: Do NOT alter, omit, or modify the "id" value under any circumstances. Keep the "id" character-for-character identical to the input.
- Never translate word-by-word.
- No conversational filler, no markdown, no explanation.${viRules}${glossaryRule}`.trim();
}

export function buildBatchPayload(
  settings: TranslationSettings,
  lines: Array<{ id: string; text: string }>,
  previousContext?: string[],
  nextContext?: string[]
): BatchPayload {
  return {
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    tone: settings.tone || "natural and fluent",
    topic: settings.topic || "N/A",
    glossary: settings.glossary,
    previousContext: previousContext && previousContext.length > 0 ? previousContext : undefined,
    lines,
    nextContext: nextContext && nextContext.length > 0 ? nextContext : undefined
  };
}

export function hasSourceChars(text: string, sourceLanguage: string): boolean {
  const lang = sourceLanguage.toLowerCase();
  if (lang.includes("chinese") || lang === "zh" || lang === "cn") {
    return /[\u3400-\u9FFF]/.test(text);
  }
  if (lang.includes("japanese") || lang === "ja" || lang === "jp") {
    return /[\u3040-\u30ff\u3400-\u9FFF]/.test(text);
  }
  if (lang.includes("korean") || lang === "ko" || lang === "kr") {
    return /[\uac00-\ud7af]/.test(text);
  }
  return false;
}

export interface BatchValidationResult {
  isValid: boolean;
  errorReason?: string;
}

export function validateBatchResult(
  originalLines: Array<{ id: string; text: string }>,
  translatedMap: Map<string, string>,
  sourceLanguage: string
): BatchValidationResult {
  if (translatedMap.size !== originalLines.length) {
    return {
      isValid: false,
      errorReason: `Count mismatch: expected ${originalLines.length}, got ${translatedMap.size}`
    };
  }

  for (const line of originalLines) {
    const translatedText = translatedMap.get(line.id);
    if (translatedText === undefined) {
      return {
        isValid: false,
        errorReason: `Missing translation for line ID: ${line.id}`
      };
    }

    if (translatedText.trim().length === 0) {
      return {
        isValid: false,
        errorReason: `Empty translation for line ID: ${line.id}`
      };
    }

    if (hasSourceChars(translatedText, sourceLanguage)) {
      return {
        isValid: false,
        errorReason: `Translation for line ID ${line.id} contains source characters: "${translatedText}"`
      };
    }

    // Only fail identical checks if the original line has source characters (like Chinese) that should have been translated
    if (translatedText.trim() === line.text.trim() && line.text.trim().length > 0 && hasSourceChars(line.text, sourceLanguage)) {
      return {
        isValid: false,
        errorReason: `Translation for line ID ${line.id} is identical to the source: "${translatedText}"`
      };
    }
  }

  return { isValid: true };
}

export function repairWithGlossary(text: string, glossary?: Record<string, string>): string {
  if (!glossary || Object.keys(glossary).length === 0) {
    return text;
  }
  
  const keys = Object.keys(glossary).sort((a, b) => b.length - a.length);
  let repaired = text;
  
  for (const key of keys) {
    const value = glossary[key];
    if (!value) continue;
    
    const escapedKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\import type { MediaItem } from "../types/project";');
    let regex;
    
    if (/^\w+$/.test(key)) {
      regex = new RegExp(`\\b${escapedKey}\\b`, 'gi');
    } else {
      regex = new RegExp(escapedKey, 'gi');
    }
    
    repaired = repaired.replace(regex, value);
  }
  
  return repaired;
}

export function chooseBestSourceBlock(subtitles: Subtitle[], sourceLanguage: string): Subtitle[] {
  const isChineseOrAuto = !sourceLanguage || 
    sourceLanguage.toLowerCase() === "none" || 
    sourceLanguage.toLowerCase() === "auto-detect" ||
    sourceLanguage.toLowerCase().includes("chinese") || 
    sourceLanguage.toLowerCase() === "zh" || 
    sourceLanguage.toLowerCase() === "cn";

  if (!isChineseOrAuto || subtitles.length === 0) {
    return subtitles;
  }

  const getChineseRatio = (text: string) => {
    if (!text) return 0;
    const matches = text.match(/[\u3400-\u9FFF]/g);
    return matches ? matches.length / text.length : 0;
  };

  const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
  const groups: Subtitle[][] = [];
  
  for (const sub of sorted) {
    let added = false;
    for (const group of groups) {
      const representative = group[0];
      if (Math.abs(sub.startTime - representative.startTime) <= 0.05) {
        group.push(sub);
        added = true;
        break;
      }
    }
    if (!added) {
      groups.push([sub]);
    }
  }

  const result: Subtitle[] = [];
  for (const group of groups) {
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      let bestSub = group[0];
      let bestRatio = getChineseRatio(bestSub.text);
      
      for (let j = 1; j < group.length; j++) {
        const sub = group[j];
        const ratio = getChineseRatio(sub.text);
        if (ratio > bestRatio) {
          bestSub = sub;
          bestRatio = ratio;
        } else if (ratio === bestRatio) {
          if (sub.text.length > bestSub.text.length) {
            bestSub = sub;
          }
        }
      }
      result.push(bestSub);
    }
  }

  return result.sort((a, b) => a.startTime - b.startTime);
}

export function buildRequestBody(
  payload: any,
  systemPrompt: string,
  resolvedModel: string,
  provider: "openai" | "anthropic",
  isMimo: boolean,
  lineCount: number,
  temperature = 0.1
): any {
  // User-requested testing token limit to monitor exact consumption without artificial caps
  const maxCompletionTokens = 100000;
  if (lineCount) {}

  if (provider === 'openai') {
    const body: any = {
      model: resolvedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(payload) }
      ],
      temperature,
      top_p: 0.9,
      max_completion_tokens: maxCompletionTokens
    };

    const isReasoningModel = resolvedModel.startsWith('o1') || resolvedModel.startsWith('o3');
    if (isReasoningModel) {
      body.reasoning_effort = "low";
    }

    if (!isMimo && !isReasoningModel) {
      body.response_format = { type: "json_object" };
    }
    return body;
  }

  return {
    model: resolvedModel,
    max_tokens: maxCompletionTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    temperature
  };
}

export async function translateBatchWithRetry(
  batchLines: Array<{ id: string; text: string }>,
  settings: TranslationSettings,
  url: string,
  headers: Record<string, string>,
  provider: "openai" | "anthropic",
  resolvedModel: string,
  isMimo: boolean,
  previousContext?: string[],
  nextContext?: string[]
): Promise<Map<string, string>> {
  const parseResponse = (raw: string) => {
    let text = raw.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }
    const parsed = JSON.parse(text);
    const arr = parsed.translations || [];
    const map = new Map<string, string>();
    for (const t of arr) {
      if (t.id && t.text) {
        map.set(t.id, t.text.trim());
      }
    }
    return map;
  };

  const callAIOnce = async (payload: any, systemPrompt: string, temperature: number) => {
    const requestBody = buildRequestBody(
      payload,
      systemPrompt,
      resolvedModel,
      provider,
      isMimo,
      batchLines.length,
      temperature
    );

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

    const finishReason = json.choices?.[0]?.finish_reason;
    if (finishReason === 'content_filter') {
      const filterMsg = json.choices?.[0]?.message?.content ?? 'Content filtered';
      throw new Error(`CONTENT_FILTER: ${filterMsg}`);
    }

    const rawContent = provider === 'openai'
      ? (json.choices?.[0]?.message?.content ?? '')
      : (json.content?.[0]?.text ?? '');

    return parseResponse(rawContent);
  };

  const batchPayload = buildBatchPayload(settings, batchLines, previousContext, nextContext);

  // Attempt 1: Normal Prompt, temp = 0.1
  try {
    console.log(`[AI Translation] Attempt 1 (Normal prompt, temp 0.1) for ${batchLines.length} lines...`);
    const systemPrompt = buildSystemPrompt(settings, false);
    const batchMap = await callAIOnce(batchPayload, systemPrompt, 0.1);
    const validation = validateBatchResult(batchLines, batchMap, settings.sourceLanguage);
    if (validation.isValid) {
      return batchMap;
    }
    console.warn(`[AI Translation] Attempt 1 validation failed: ${validation.errorReason}`);
  } catch (err) {
    console.warn(`[AI Translation] Attempt 1 failed with error:`, err);
  }

  // Attempt 2: Ultra-short prompt, temp = 0.0
  try {
    console.log(`[AI Translation] Attempt 2 (Ultra-short prompt, temp 0.0) for ${batchLines.length} lines...`);
    const systemPrompt = buildSystemPrompt(settings, true);
    const batchMap = await callAIOnce(batchPayload, systemPrompt, 0.0);
    const validation = validateBatchResult(batchLines, batchMap, settings.sourceLanguage);
    if (validation.isValid) {
      return batchMap;
    }
    throw new Error(`Attempt 2 validation failed: ${validation.errorReason}`);
  } catch (err) {
    console.warn(`[AI Translation] Attempt 2 failed with error:`, err);
    throw err; // Trigger recursive splitting in parent call
  }
}

export async function recursiveBatchTranslate(
  batchLines: Array<{ id: string; text: string }>,
  settings: TranslationSettings,
  url: string,
  headers: Record<string, string>,
  provider: "openai" | "anthropic",
  resolvedModel: string,
  isMimo: boolean,
  previousContext?: string[],
  nextContext?: string[]
): Promise<Map<string, string>> {
  try {
    // Try to translate the entire batch
    const result = await translateBatchWithRetry(
      batchLines,
      settings,
      url,
      headers,
      provider,
      resolvedModel,
      isMimo,
      previousContext,
      nextContext
    );
    return result;
  } catch (err) {
    // Batch translation failed on both attempts. Trigger recursive binary splitting.
    if (batchLines.length <= 1) {
      console.warn(`[AI Translation] Single line ${batchLines[0]?.id} failed completely. Falling back to original.`);
      const fallbackMap = new Map<string, string>();
      if (batchLines[0]) {
        fallbackMap.set(batchLines[0].id, repairWithGlossary(batchLines[0].text, settings.glossary));
      }
      return fallbackMap;
    }

    const mid = Math.floor(batchLines.length / 2);
    const leftBatch = batchLines.slice(0, mid);
    const rightBatch = batchLines.slice(mid);

    console.warn(`[AI Translation] Batch of size ${batchLines.length} failed. Recursively splitting into sizes ${leftBatch.length} and ${rightBatch.length}...`);

    // Recursively translate left split
    const leftMap = await recursiveBatchTranslate(
      leftBatch,
      settings,
      url,
      headers,
      provider,
      resolvedModel,
      isMimo,
      previousContext,
      nextContext
    );

    // Context-Aware Window: Feed successful left-split translations into the previous context of the right-split
    const updatedPreviousContext = [
      ...(previousContext || []),
      ...leftBatch.map(line => leftMap.get(line.id) || line.text)
    ].slice(-5);

    // Recursively translate right split
    const rightMap = await recursiveBatchTranslate(
      rightBatch,
      settings,
      url,
      headers,
      provider,
      resolvedModel,
      isMimo,
      updatedPreviousContext,
      nextContext
    );

    // Merge and return maps
    return new Map<string, string>([...leftMap, ...rightMap]);
  }
}

export interface CloudflareWhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface CloudflareWhisperResponse {
  text: string;
  word_count?: number;
  words?: CloudflareWhisperWord[];
  vtt?: string;
}

export interface WhisperTranscriptionProgress {
  phase:
    | "extracting"
    | "uploading"
    | "transcribing"
    | "processing"
    | "complete"
    | "error";
  progress: number;
  message: string;
}

export interface TranscriptionConfig {
  apiEndpoint: string;
  apiKey?: string;
  language?: string;
  targetLanguage?: string;
  maxSegmentDuration?: number;
  maxWordsPerSegment?: number;
  translationMethod?: "google" | "ai";
  aiConfig?: {
    provider: "openai" | "anthropic";
    apiKey: string;
    tone?: string;
    videoContext?: string;
    customBaseUrl?: string;
    customModel?: string;
    glossary?: Record<string, string>;
  };
}

const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: "Arial",
  fontSize: 45,
  color: "#ffffff",
  backgroundColor: "transparent",
  position: "bottom",
};

export class TranscriptionService {
  private config: TranscriptionConfig;
  private audioContext: AudioContext | null = null;

  constructor(config: TranscriptionConfig) {
    this.config = {
      maxSegmentDuration: 5,
      maxWordsPerSegment: 10,
      ...config,
    };
  }

  async transcribeClip(
    clip: Clip,
    mediaItem: MediaItem,
    onProgress?: (progress: WhisperTranscriptionProgress) => void,
  ): Promise<Subtitle[]> {
    try {
      onProgress?.({
        phase: "extracting",
        progress: 0,
        message: "Extracting audio from video...",
      });

      const audioBlob = await this.extractAudioFromClip(clip, mediaItem);

      onProgress?.({
        phase: "uploading",
        progress: 25,
        message: "Uploading audio for transcription...",
      });

      const whisperResponse = await this.sendToWhisper(audioBlob, onProgress);

      onProgress?.({
        phase: "processing",
        progress: 90,
        message: "Processing transcription...",
      });

      let subtitles = this.convertToSubtitles(whisperResponse, clip);

      if (this.config.targetLanguage) {
        onProgress?.({
          phase: "processing",
          progress: 92,
          message: `Translating subtitles to ${this.config.targetLanguage}...`,
        });
        subtitles = await this.translateSubtitles(subtitles, this.config.targetLanguage);
      }

      onProgress?.({
        phase: "complete",
        progress: 100,
        message: `Generated ${subtitles.length} subtitles`,
      });

      return subtitles;
    } catch (error) {
      onProgress?.({
        phase: "error",
        progress: 0,
        message:
          error instanceof Error ? error.message : "Transcription failed",
      });
      throw error;
    }
  }

  private async translateSubtitles(
    subtitles: Subtitle[],
    targetLanguage: string,
  ): Promise<Subtitle[]> {
    if (this.config.translationMethod === "ai" && this.config.aiConfig?.apiKey) {
      try {
        console.log("Using AI Translation...");
        return await this.translateSubtitlesWithAI(subtitles, targetLanguage);
      } catch (err) {
        console.error("AI translation failed:", err);
        
        let customMessage = "Dịch phụ đề bằng AI thất bại.";
        const errMsg = err instanceof Error ? err.message : String(err);
        
        if (errMsg.includes("401") || errMsg.toLowerCase().includes("invalid api key") || errMsg.toLowerCase().includes("invalid_key")) {
          customMessage = "Lỗi xác thực API Key (401 - Invalid API Key): Khóa API OpenAI / Mino AI bạn cung cấp không hợp lệ, bị nhập sai hoặc đã hết hạn. Vui lòng kiểm tra lại trong Settings > API Keys.";
        } else {
          customMessage = `Dịch phụ đề bằng AI thất bại: ${errMsg}`;
        }
        
        throw new Error(customMessage);
      }
    } else if (this.config.translationMethod === "ai") {
      console.warn("[TranscriptionService] AI translation requested but API Key is missing. Falling back to Google Translate.");
    }

    const resultList: Subtitle[] = [];

    for (const subtitle of subtitles) {
      // 1. Keep original subtitle
      resultList.push(subtitle);

      if (!subtitle.text) {
        continue;
      }

      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(subtitle.text)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Translation API request failed");

        const json = await res.json();
        let translatedText = "";
        if (json && json[0]) {
          for (const part of json[0]) {
            if (part && part[0]) {
              translatedText += part[0];
            }
          }
        }

        translatedText = translatedText.trim();

        if (translatedText) {
          const duration = subtitle.endTime - subtitle.startTime;
          const translatedWordsText = translatedText.split(/\s+/);
          const numWords = translatedWordsText.length;

          let words = undefined;
          if (numWords > 0) {
            const wordDuration = duration / numWords;
            words = translatedWordsText.map((w, idx) => ({
              text: w,
              startTime: subtitle.startTime + idx * wordDuration,
              endTime: subtitle.startTime + (idx + 1) * wordDuration,
            }));
          }

          // 2. Add translated subtitle as a separate distinct element
          resultList.push({
            ...subtitle,
            id: `${subtitle.id}-translated`,
            text: translatedText,
            words,
          });
        }
      } catch (err) {
        console.error("Failed to translate subtitle segment:", err);
      }
    }

    return resultList;
  }

  private async translateSubtitlesWithAI(
    subtitles: Subtitle[],
    targetLanguage: string,
  ): Promise<Subtitle[]> {
    const aiConfig = this.config.aiConfig;
    if (!aiConfig || !aiConfig.apiKey) {
      throw new Error("Missing AI configuration or API Key");
    }

    const tone = aiConfig.tone || "natural and fluent";
    const provider = aiConfig.provider;

    const getLanguageName = (code?: string): string => {
      if (!code || code === 'none') return 'Auto-detect';
      const langMap: Record<string, string> = {
        en: 'English',
        vi: 'Vietnamese',
        es: 'Spanish',
        fr: 'French',
        de: 'German',
        it: 'Italian',
        pt: 'Portuguese',
        ja: 'Japanese',
        ko: 'Korean',
        zh: 'Chinese',
        ru: 'Russian',
        ar: 'Arabic',
        hi: 'Hindi',
        th: 'Thai',
      };
      return langMap[code.toLowerCase()] || code;
    };

    const srcLang = getLanguageName(this.config.language);
    const tgtLang = getLanguageName(targetLanguage);
    const topic = aiConfig.videoContext?.trim() || "N/A";

    const bestSubtitles = chooseBestSourceBlock(subtitles, srcLang);
    const textSubtitles = bestSubtitles.filter(s => s.text && s.text.trim().length > 0);
    if (textSubtitles.length === 0) return bestSubtitles;

    const url = `/api/proxy/${provider}${provider === 'openai' ? '/chat/completions' : '/messages'}`;
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
    if (provider === 'openai') {
      if (isMimo) {
        resolvedModel = aiConfig.customModel?.trim() ? aiConfig.customModel.trim() : 'mimo-v2.5';
      } else {
        resolvedModel = aiConfig.customModel ? aiConfig.customModel.trim() : 'gpt-4o-mini';
      }
    } else {
      resolvedModel = aiConfig.customModel ? aiConfig.customModel.trim() : 'claude-3-5-haiku-20241022';
    }

    const settings: TranslationSettings = {
      sourceLanguage: srcLang,
      targetLanguage: tgtLang,
      tone,
      topic,
      glossary: aiConfig.glossary,
    };

    const BATCH_SIZE = 20;
    const CONTEXT_WINDOW = 5;
    const globalTranslationMap = new Map<string, string>();

    for (let i = 0; i < textSubtitles.length; i += BATCH_SIZE) {
      const batchLines = textSubtitles.slice(i, i + BATCH_SIZE);

      const prevLines = textSubtitles
        .slice(Math.max(0, i - CONTEXT_WINDOW), i)
        .map(s => s.text);

      const nextLines = textSubtitles
        .slice(i + BATCH_SIZE, Math.min(textSubtitles.length, i + BATCH_SIZE + CONTEXT_WINDOW))
        .map(s => s.text);

      try {
        const batchMap = await recursiveBatchTranslate(
          batchLines.map(s => ({ id: s.id, text: s.text })),
          settings,
          url,
          headers,
          provider,
          resolvedModel,
          isMimo,
          prevLines,
          nextLines
        );
        for (const [id, text] of batchMap) {
          globalTranslationMap.set(id, text);
        }
        console.log(`[AI Translation] Batch ${Math.floor(i / BATCH_SIZE) + 1}: OK (${batchMap.size}/${batchLines.length})`);
      } catch (err) {
        console.error(`[AI Translation] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed completely:`, err);
        for (const s of batchLines) {
          globalTranslationMap.set(s.id, repairWithGlossary(s.text, settings.glossary));
        }
      }
    }

    const resultList: Subtitle[] = [];
    for (const subtitle of bestSubtitles) {
      resultList.push(subtitle);
      if (!subtitle.text) continue;

      const translatedText = globalTranslationMap.get(subtitle.id);
      if (translatedText) {
        const duration = subtitle.endTime - subtitle.startTime;
        const translatedWords = translatedText.split(/\s+/);
        const numWords = translatedWords.length;
        const wordDuration = numWords > 0 ? duration / numWords : 0;
        const words = numWords > 0
          ? translatedWords.map((w: string, idx: number) => ({
              text: w,
              startTime: subtitle.startTime + idx * wordDuration,
              endTime: subtitle.startTime + (idx + 1) * wordDuration,
            }))
          : undefined;

        resultList.push({
          ...subtitle,
          id: `${subtitle.id}-translated`,
          text: translatedText,
          words,
        });
      }
    }

    return resultList;
  }

  private async extractAudioFromClip(
    clip: Clip,
    mediaItem: MediaItem,
  ): Promise<Blob> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    let arrayBuffer: ArrayBuffer;

    if (mediaItem.blob) {
      arrayBuffer = await mediaItem.blob.arrayBuffer();
    } else if (mediaItem.fileHandle) {
      const file = await mediaItem.fileHandle.getFile();
      arrayBuffer = await file.arrayBuffer();
    } else {
      throw new Error("No media source available for audio extraction");
    }

    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    const speed = clip.speed || 1.0;
    
    const inPoint = clip.inPoint || 0;
    const originalDurationConsumed = clip.duration * speed;
    const endPoint = Math.min(inPoint + originalDurationConsumed, audioBuffer.duration);
    
    const actualOriginalDuration = endPoint - inPoint;
    const renderedDuration = actualOriginalDuration / speed;

    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(inPoint * sampleRate);
    const numOriginalSamples = Math.floor(actualOriginalDuration * sampleRate);
    const numRenderedSamples = Math.floor(renderedDuration * sampleRate);

    // If for some reason numRenderedSamples is <= 0, we can't create an OfflineAudioContext
    if (numRenderedSamples <= 0 || numOriginalSamples <= 0) {
      throw new Error("Invalid clip duration for audio extraction");
    }

    const offlineContext = new OfflineAudioContext(1, numRenderedSamples, sampleRate);
    const source = offlineContext.createBufferSource();

    const trimmedBuffer = offlineContext.createBuffer(
      1,
      numOriginalSamples,
      sampleRate,
    );
    const channelData = trimmedBuffer.getChannelData(0);
    const sourceData = audioBuffer.getChannelData(0);

    for (let i = 0; i < numOriginalSamples; i++) {
      channelData[i] = sourceData[startSample + i] || 0;
    }

    source.buffer = trimmedBuffer;
    source.playbackRate.value = speed;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    return this.audioBufferToWav(renderedBuffer);
  }

  private audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = buffer.length * blockAlign;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, totalSize - 8, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: "audio/wav" });
  }

  private async sendToWhisper(
    audioBlob: Blob,
    onProgress?: (progress: WhisperTranscriptionProgress) => void,
  ): Promise<CloudflareWhisperResponse> {
    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.wav");

    if (this.config.language) {
      formData.append("language", this.config.language);
    }
    if (this.config.targetLanguage) {
      formData.append("target_language", this.config.targetLanguage);
    }

    onProgress?.({
      phase: "transcribing",
      progress: 30,
      message: "Uploading audio...",
    });

    const response = await fetch(this.config.apiEndpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          "Rate limit reached. Please wait a minute before transcribing more audio. This free service is limited to 10 requests per minute.",
        );
      }
      const errorText = await response.text();
      throw new Error(
        `Transcription failed: ${response.status} - ${errorText}`,
      );
    }

    const submitResult = await response.json();

    if (!submitResult.jobId) {
      return submitResult as CloudflareWhisperResponse;
    }

    const baseUrl = this.config.apiEndpoint.replace(/\/transcribe$/, "").replace(/\/$/, "");
    const pollUrl = `${baseUrl}/jobs/${submitResult.jobId}`;

    return this.pollForResult(pollUrl, onProgress);
  }

  private async pollForResult(
    pollUrl: string,
    onProgress?: (progress: WhisperTranscriptionProgress) => void,
  ): Promise<CloudflareWhisperResponse> {
    const maxAttempts = 120;
    const pollInterval = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const response = await fetch(pollUrl);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Transcription job not found");
        }
        continue;
      }

      const job = await response.json();

      if (job.status === "processing") {
        const progress = 30 + Math.round((job.progress || 0) * 0.6);
        onProgress?.({
          phase: "transcribing",
          progress,
          message: this.config.targetLanguage
            ? `Transcribing and translating to ${this.config.targetLanguage}...`
            : "Transcribing audio...",
        });
        continue;
      }

      if (job.status === "completed" && job.result) {
        return job.result as CloudflareWhisperResponse;
      }

      if (job.status === "failed") {
        throw new Error(job.error || "Transcription failed on server");
      }
    }

    throw new Error("Transcription timed out after 6 minutes");
  }

  private convertToSubtitles(
    response: CloudflareWhisperResponse,
    clip: Clip,
  ): Subtitle[] {
    if (!response.words || response.words.length === 0) {
      if (!response.text) return [];

      return [
        {
          id: this.generateId(),
          text: response.text.trim(),
          startTime: clip.startTime,
          endTime: clip.startTime + clip.duration,
          style: DEFAULT_SUBTITLE_STYLE,
          words: undefined,
          animationStyle: "none",
        },
      ];
    }

    return this.groupWordsIntoSubtitles(response.words, clip.startTime);
  }

  private groupWordsIntoSubtitles(
    words: CloudflareWhisperWord[],
    clipStartTime: number,
  ): Subtitle[] {
    const subtitles: Subtitle[] = [];
    const maxWords = this.config.maxWordsPerSegment || 10;
    const maxDuration = this.config.maxSegmentDuration || 5;

    let currentWords: CloudflareWhisperWord[] = [];
    let groupStart = 0;

    for (const word of words) {
      if (currentWords.length === 0) {
        groupStart = word.start;
      }

      const wouldExceedWords = currentWords.length >= maxWords;
      const wouldExceedDuration = word.end - groupStart > maxDuration;
      const isPunctuation = /[.!?]$/.test(word.word);

      if (
        (wouldExceedWords || wouldExceedDuration) &&
        currentWords.length > 0
      ) {
        subtitles.push(
          this.createSubtitleFromWords(currentWords, clipStartTime),
        );
        currentWords = [word];
        groupStart = word.start;
      } else {
        currentWords.push(word);

        if (isPunctuation && currentWords.length >= 3) {
          subtitles.push(
            this.createSubtitleFromWords(currentWords, clipStartTime),
          );
          currentWords = [];
        }
      }
    }

    if (currentWords.length > 0) {
      subtitles.push(this.createSubtitleFromWords(currentWords, clipStartTime));
    }

    return subtitles;
  }

  private createSubtitleFromWords(
    words: CloudflareWhisperWord[],
    clipStartTime: number,
  ): Subtitle {
    const text = words
      .map((w) => w.word)
      .join(" ")
      .trim();
    const startTime = clipStartTime + words[0].start;
    const endTime = clipStartTime + words[words.length - 1].end;

    return {
      id: this.generateId(),
      text,
      startTime,
      endTime,
      style: DEFAULT_SUBTITLE_STYLE,
      words: words.map((w) => ({
        text: w.word,
        startTime: clipStartTime + w.start,
        endTime: clipStartTime + w.end,
      })),
      animationStyle: "none",
    };
  }

  private generateId(): string {
    return `sub-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

let transcriptionServiceInstance: TranscriptionService | null = null;

export function getTranscriptionService(): TranscriptionService | null {
  return transcriptionServiceInstance;
}

export function initializeTranscriptionService(
  config: TranscriptionConfig,
): TranscriptionService {
  if (transcriptionServiceInstance) {
    transcriptionServiceInstance.dispose();
  }
  transcriptionServiceInstance = new TranscriptionService(config);
  return transcriptionServiceInstance;
}

export function disposeTranscriptionService(): void {
  if (transcriptionServiceInstance) {
    transcriptionServiceInstance.dispose();
    transcriptionServiceInstance = null;
  }
}
