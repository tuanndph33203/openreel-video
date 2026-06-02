import type { Subtitle, SubtitleStyle, Clip } from "../types/timeline";
import type { MediaItem } from "../types/project";

export interface TranslationSettings {
  sourceLanguage: string;
  targetLanguage: string;
  tone?: string;
  topic?: string;
  glossary?: Record<string, string>;
  temperature?: number;
  previousContext?: string[];
  nextContext?: string[];
}

export interface BatchPayload {
  sourceLanguage: string;
  targetLanguage: string;
  tone: string;
  topic: string;
  glossary?: Record<string, string>;
  temperature?: number;
  previousContext?: string[];
  lines: Array<{ id: string; text: string }>;
  nextContext?: string[];
}

export function buildSystemPrompt(settings: TranslationSettings, isUltraShort = false): string {
  const isVietnamese = settings.targetLanguage.toLowerCase().includes("viet");
  
  if (isUltraShort) {
    const viRules = isVietnamese ? "\n- Dich tu nhien (dung Ad, bọn mình, tụi mình). TUYET DOI KHONG gop dong. Giu nguyen so dong." : "";
    return `Translate given lines from ${settings.sourceLanguage} to ${settings.targetLanguage}.${viRules}
Rules:
- Output MUST be a valid JSON object containing an array of strings under the key "translations": {"translations": ["translation_1", "translation_2", ...]}
- Length of the array MUST be exactly identical to the input line count.
- NO explanations, NO markdown, NO merged lines.`;
  }

  const viRules = isVietnamese ? `
- CROSS-LINE CONTEXT & MULTI-SPEAKER RULE (CRITICAL): The input text is heavily fragmented and is often a game world chat log or a fast-paced conversation among multiple distinct players. Translate them as separate, natural conversational turns.
- ASR TYPO TOLERANCE & CONTEXT REPAIR (CRITICAL): Correct common ASR homophone typos mentally before translating:
  * "女" near names or ends of phrases -> "呢" (nhé/nhỉ/cơ mà).
  * "一活" or "一 活" -> "复活" (hồi sinh).
  * "调" in "调装备" -> "掉装备" (rớt đồ khi chết).
  * "爆" in "爆装备" or "全爆了" -> "掉/rớt/bay màu" (đồ bị rớt khi tử trận), NOT explode (nổ tung).
- GAMING TONE & SLANG: Use natural Vietnamese gamer lingo:
  * "棒子服" or "棒子" (slang for Korean server) -> "server Hàn", "bọn Hàn" (NEVER "Bàng Tử" or "Bổng Tử").
  * "老子" -> "Tao", "ông đây", "bố đây" (angry gamer tone).
  * "公会" -> "bang hội".
  * "打劫了一个服" -> "cướp cả một server".
  * "复活点" -> "điểm hồi sinh".
  * "国战" -> "quốc chiến".
  * "大佬" / "老大" -> "đại ca", "đại lão".
  * "爆了" (gear context) -> "bay màu", "rớt hết", "nổ đồ".
- SINO-VIETNAMESE NAMES: For character names and location names written in Chinese that are NOT in the user's glossary, transliterate naturally into Sino-Vietnamese (e.g., "夜无梦" -> "Dạ Vô Mộng", "梦幻城" -> "Thành Mộng Ảo"). Use the VIDEO CONTEXT provided by the user for any additional name hints.
- GLOSSARY PRIORITY (CRITICAL): If a user-defined Glossary is provided, it takes ABSOLUTE PRIORITY over any default translation. Always apply glossary mappings first.
- BALANCED LINE SPLITTING (CRITICAL): When a word or phrase is split across two lines, restructure the translations on both lines so that each line is readable and natural as an individual subtitle, maintaining 1-to-1 line correspondence.
- BAN TARGET LANGUAGE CORRUPTION (CRITICAL): Written 100% in pure, grammatically correct Vietnamese. NEVER output raw Chinese characters, pinyin, or English loanwords.` : "";

  let glossaryRule = "";
  if (settings.glossary && Object.keys(settings.glossary).length > 0) {
    const glossaryItems = Object.entries(settings.glossary)
      .map(([key, val]) => `  - "${key}" -> "${val}"`)
      .join("\n");
    glossaryRule = `\n- GLOSSARY (Translate these terms exactly as specified):\n${glossaryItems}`;
  }

  return `You are an expert subtitle translator from ${settings.sourceLanguage} to ${settings.targetLanguage}.
Tone: ${settings.tone || "natural and fluent"}. Topic: ${settings.topic || "N/A"}.

Task: Translate the given subtitle lines.
Rules:
- Output MUST be a valid JSON object containing an array of strings under the key "translations": {"translations": ["translation_1", "translation_2", ...]}
- CRITICAL: The length of the returned array MUST be exactly the same as the input lines. Do NOT combine, merge, or omit any lines. Keep one-to-one correspondence in the exact same order.
- Never translate word-by-word.
- No conversational filler, no markdown, no explanation.${viRules}${glossaryRule}`.trim();
}

export function buildSanitizationPrompt(_settings: TranslationSettings): string {
  return `You are an expert ASR (Speech-to-Text) data cleaning and spelling correction AI.
Context: Short fantasy game online videos, MMORPG gameplay review, PvP server war (quốc chiến).
Source language: Chinese.

Task: Correct spelling errors, homophone typos, and formatting mistakes in the given subtitle lines.
ASR Typo Correction Guide:
- Correct gaming terminology and homophones. Examples:
  * "一活" or "一 活" -> "复活" (resurrection)
  * "调装备" or "挑装备" -> "掉装备" (drop gear upon death)
  * "爆" in "爆装备" -> "掉/落" (dropped gear)
  * "女" near names or ends of phrases -> "呢" or appropriate sentence particle
  * "怪兴" -> "怪也被" or "怪 đều bị" or similar contextually correct phrase
  * "扶着" in targeting contexts -> "盯着" or "被盯着"
  * "熬熬" -> "嗷嗷" (crying out)
  * "刺魂风" -> "刺魂蜂" (ASR sting bee name correction)
  * "叶无梦" / "夜无梦" -> "夜无梦" or "叶无梦" (ASR homophone name normalization)
- Do NOT translate. Keep the output 100% in Simplified Chinese (zh-CN).
- Maintain EXACTLY the same number of lines. Output MUST be a valid JSON object containing an array of strings under the key "translations": {"translations": ["corrected_1", "corrected_2", ...]}
- Ensure each line corresponds exactly to the input line at the same index.
- Do NOT merge, omit, or combine lines.
- No conversational filler, no markdown, no explanation.`;
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

export function formatUserMessage(
  lines: Array<{ id: string; text: string }>,
  previousContext?: string[],
  nextContext?: string[]
): string {
  const prevStr = previousContext && previousContext.length > 0
    ? `--- PREVIOUS CONTEXT ---\n${previousContext.join('\n')}\n\n`
    : '';
  const nextStr = nextContext && nextContext.length > 0
    ? `\n\n--- NEXT CONTEXT ---\n${nextContext.join('\n')}`
    : '';
  
  const linesStr = `--- LINES TO TRANSLATE ---\n${lines.map((s, i) => `Line ${i + 1}: ${s.text}`).join('\n')}`;
  
  return `${prevStr}${linesStr}${nextStr}`;
}

export function buildRequestBody(
  payload: any,
  systemPrompt: string,
  resolvedModel: string,
  provider: "openai" | "anthropic" | "gemini",
  isMimo: boolean,
  lineCount: number,
  temperature = 0.5
): any {
  // Enforce strictly at least 0.3 and satisfy compiler
  const finalTemperature = Math.max(0.3, temperature);
  // User-requested testing token limit to monitor exact consumption without artificial caps
  const maxCompletionTokens = 100000;
  if (lineCount) {}

  const userContent = typeof payload === 'string' ? payload : JSON.stringify(payload);

  if (provider === 'openai' || provider === 'gemini') {
    const body: any = {
      model: resolvedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: finalTemperature,
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
    messages: [{ role: 'user', content: userContent }],
    temperature: finalTemperature
  };
}


export async function translateBatchWithRetry(
  batchLines: Array<{ id: string; text: string }>,
  settings: TranslationSettings,
  url: string,
  headers: Record<string, string>,
  provider: "openai" | "anthropic" | "gemini",
  resolvedModel: string,
  isMimo: boolean,
  previousContext?: string[],
  nextContext?: string[]
): Promise<Map<string, string>> {
  const parseResponse = (raw: string) => {
    let text = raw.trim();
    let arr: any[] = [];

    // Fast-path: Thử parse trực tiếp JSON để tránh Regex overhead
    try {
      const direct = JSON.parse(text);
      if (Array.isArray(direct)) {
        arr = direct;
      } else if (direct && typeof direct === 'object') {
        if (direct.translations && Array.isArray(direct.translations)) {
          arr = direct.translations.map((t: any) => {
            if (typeof t === 'string') return t;
            if (t && typeof t === 'object' && t.text !== undefined) return t.text;
            return '';
          });
        } else {
          for (const key of Object.keys(direct)) {
            if (Array.isArray(direct[key])) {
              arr = direct[key].map((t: any) => typeof t === 'string' ? t : (t && t.text ? t.text : ''));
              break;
            }
          }
        }
      }
    } catch (e) {
      // Direct JSON parse failed, proceed to robust Regex fallbacks below
    }
    
    // Attempt 1: Match a JSON array [ ... ]
    if (!Array.isArray(arr) || arr.length === 0) {
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          arr = JSON.parse(arrayMatch[0]);
        } catch (e) {}
      }
    }
    
    // Attempt 2: Match a JSON object { ... } and check if it has translations or array properties
    if (!Array.isArray(arr) || arr.length === 0) {
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          const parsed = JSON.parse(objMatch[0]);
          if (Array.isArray(parsed)) {
            arr = parsed;
          } else if (parsed.translations && Array.isArray(parsed.translations)) {
            arr = parsed.translations.map((t: any) => {
              if (typeof t === 'string') return t;
              if (t && typeof t === 'object' && t.text !== undefined) return t.text;
              return '';
            });
          } else {
            for (const key of Object.keys(parsed)) {
              if (Array.isArray(parsed[key])) {
                arr = parsed[key].map((t: any) => typeof t === 'string' ? t : (t && t.text ? t.text : ''));
                break;
              }
            }
          }
        } catch (e) {}
      }
    }

    // Attempt 3: Direct JSON parse
    if (!Array.isArray(arr) || arr.length === 0) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          arr = parsed;
        }
      } catch (e) {}
    }

    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error("Failed to extract a valid translation array from AI response: " + text.slice(0, 150));
    }

    // Normalize array size to match exactly the batchLines length
    const resultArr: string[] = [];
    for (let i = 0; i < batchLines.length; i++) {
      if (arr[i] !== undefined && arr[i] !== null) {
        resultArr.push(String(arr[i]).trim());
      } else {
        resultArr.push(batchLines[i].text); // Fallback to original text if missing
      }
    }

    const map = new Map<string, string>();
    for (let i = 0; i < batchLines.length; i++) {
      map.set(batchLines[i].id, resultArr[i]);
    }
    return map;
  };


  const callAIOnce = async (userPrompt: string, systemPrompt: string, temperature: number) => {
    const requestBody = buildRequestBody(
      userPrompt,
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

    const rawContent = (provider === 'openai' || provider === 'gemini')
      ? (json.choices?.[0]?.message?.content ?? '')
      : (json.content?.[0]?.text ?? '');

    return parseResponse(rawContent);
  };

  const userMessage = formatUserMessage(batchLines, previousContext, nextContext);

  const targetTemp = settings.temperature !== undefined ? Math.max(0.3, settings.temperature) : 0.5;

  // Attempt 1: Normal Prompt, temp = 0.5
  try {
    console.log(`[AI Translation] Attempt 1 (Index-based, temp ${targetTemp}) for ${batchLines.length} lines...`);
    const systemPrompt = buildSystemPrompt(settings, false);
    const batchMap = await callAIOnce(userMessage, systemPrompt, targetTemp);
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
    console.log(`[AI Translation] Attempt 2 (Index-based, Ultra-short, temp ${targetTemp}) for ${batchLines.length} lines...`);
    const systemPrompt = buildSystemPrompt(settings, true);
    const batchMap = await callAIOnce(userMessage, systemPrompt, targetTemp);
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
  provider: "openai" | "anthropic" | "gemini",
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

export async function sanitizeBatchWithRetry(
  batchLines: Array<{ id: string; text: string }>,
  settings: TranslationSettings,
  url: string,
  headers: Record<string, string>,
  provider: "openai" | "anthropic" | "gemini",
  resolvedModel: string,
  isMimo: boolean,
  previousContext?: string[],
  nextContext?: string[]
): Promise<Map<string, string>> {
  const parseResponse = (raw: string) => {
    let text = raw.trim();
    let arr: any[] = [];

    // Fast-path: Thử parse trực tiếp JSON để tránh Regex overhead
    try {
      const direct = JSON.parse(text);
      if (Array.isArray(direct)) {
        arr = direct;
      } else if (direct && typeof direct === 'object') {
        if (direct.translations && Array.isArray(direct.translations)) {
          arr = direct.translations.map((t: any) => {
            if (typeof t === 'string') return t;
            if (t && typeof t === 'object' && t.text !== undefined) return t.text;
            return '';
          });
        } else {
          for (const key of Object.keys(direct)) {
            if (Array.isArray(direct[key])) {
              arr = direct[key].map((t: any) => typeof t === 'string' ? t : (t && t.text ? t.text : ''));
              break;
            }
          }
        }
      }
    } catch (e) {
      // Direct JSON parse failed, proceed to robust Regex fallbacks below
    }

    // Attempt 1: Match a JSON array [ ... ]
    if (!Array.isArray(arr) || arr.length === 0) {
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          arr = JSON.parse(arrayMatch[0]);
        } catch (e) {}
      }
    }
    
    // Attempt 2: Direct JSON parse
    if (!Array.isArray(arr) || arr.length === 0) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          arr = parsed;
        }
      } catch (e) {}
    }

    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error("Failed to extract a valid sanitization array from AI response: " + text.slice(0, 150));
    }

    // Normalize array size to match exactly the batchLines length
    const resultArr: string[] = [];
    for (let i = 0; i < batchLines.length; i++) {
      if (arr[i] !== undefined && arr[i] !== null) {
        resultArr.push(String(arr[i]).trim());
      } else {
        resultArr.push(batchLines[i].text); // Fallback to original text if missing
      }
    }

    const map = new Map<string, string>();
    for (let i = 0; i < batchLines.length; i++) {
      map.set(batchLines[i].id, resultArr[i]);
    }
    return map;
  };

  const callAIOnce = async (userPrompt: string, systemPrompt: string, temperature: number) => {
    const requestBody = buildRequestBody(
      userPrompt,
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

    const rawContent = (provider === 'openai' || provider === 'gemini')
      ? (json.choices?.[0]?.message?.content ?? '')
      : (json.content?.[0]?.text ?? '');

    return parseResponse(rawContent);
  };

  const userMessage = formatUserMessage(batchLines, previousContext, nextContext);
  const targetTemp = settings.temperature !== undefined ? Math.max(0.3, settings.temperature) : 0.5;

  try {
    console.log(`[AI Sanitization] (temp ${targetTemp}) for ${batchLines.length} lines...`);
    const systemPrompt = buildSanitizationPrompt(settings);
    const batchMap = await callAIOnce(userMessage, systemPrompt, targetTemp);
    if (batchMap.size === batchLines.length) {
      return batchMap;
    }
    throw new Error(`Count mismatch: expected ${batchLines.length}, got ${batchMap.size}`);
  } catch (err) {
    console.warn(`[AI Sanitization] failed with error:`, err);
    throw err; // Trigger recursive splitting in parent call
  }
}

export async function recursiveBatchSanitize(
  batchLines: Array<{ id: string; text: string }>,
  settings: TranslationSettings,
  url: string,
  headers: Record<string, string>,
  provider: "openai" | "anthropic" | "gemini",
  resolvedModel: string,
  isMimo: boolean,
  previousContext?: string[],
  nextContext?: string[]
): Promise<Map<string, string>> {
  try {
    const result = await sanitizeBatchWithRetry(
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
    if (batchLines.length <= 1) {
      console.warn(`[AI Sanitization] Single line ${batchLines[0]?.id} failed completely. Falling back to original.`);
      const fallbackMap = new Map<string, string>();
      if (batchLines[0]) {
        fallbackMap.set(batchLines[0].id, batchLines[0].text);
      }
      return fallbackMap;
    }

    const mid = Math.floor(batchLines.length / 2);
    const leftBatch = batchLines.slice(0, mid);
    const rightBatch = batchLines.slice(mid);

    console.warn(`[AI Sanitization] Batch of size ${batchLines.length} failed. Recursively splitting into sizes ${leftBatch.length} and ${rightBatch.length}...`);

    const leftMap = await recursiveBatchSanitize(
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

    const updatedPreviousContext = [
      ...(previousContext || []),
      ...leftBatch.map(line => leftMap.get(line.id) || line.text)
    ].slice(-5);

    const rightMap = await recursiveBatchSanitize(
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
    provider: "openai" | "anthropic" | "gemini";
    apiKey: string;
    tone?: string;
    videoContext?: string;
    customBaseUrl?: string;
    customModel?: string;
    glossary?: Record<string, string>;
    temperature?: number;
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

      // Cache raw whisper response in localStorage for debugging/analysis
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("openreel_last_whisper_raw", JSON.stringify(whisperResponse));
          console.log("[TranscriptionService] Cached raw Whisper response in localStorage.");
        }
      } catch (err) {
        console.warn("[TranscriptionService] Failed to cache Whisper response in localStorage:", err);
      }

      onProgress?.({
        phase: "processing",
        progress: 90,
        message: "Processing transcription...",
      });

      let subtitles = this.convertToSubtitles(whisperResponse, clip);

      // Run raw Chinese Data Sanitization before translation
      const isChinese = this.config.language === 'zh' || 
                        (whisperResponse.words && whisperResponse.words.length > 0 && /[\u3400-\u9FFF]/.test(whisperResponse.words[0].word));
      
      if (isChinese && this.config.aiConfig?.apiKey) {
        onProgress?.({
          phase: "processing",
          progress: 91,
          message: "Sanitizing raw transcription text using AI...",
        });
        try {
          subtitles = await this.sanitizeSubtitlesWithAI(subtitles);
        } catch (err) {
          console.warn("[TranscriptionService] Data sanitization failed, proceeding with raw subtitles:", err);
        }
      }

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
      if (!subtitle.text) {
        resultList.push(subtitle);
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

          const translatedSub: Subtitle = {
            ...subtitle,
            text: translatedText,
            originalText: subtitle.text, // Store the original text here!
            words,
          };
          if (words && words.length > 0) {
            const segmentedSubs = this.segmentTranslatedSubtitle(translatedSub);
            resultList.push(...segmentedSubs.map(s => ({ ...s, originalText: subtitle.text })));
          } else {
            resultList.push(translatedSub);
          }
        } else {
          resultList.push(subtitle);
        }
      } catch (err) {
        console.error("Failed to translate subtitle segment:", err);
        resultList.push(subtitle);
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

    const url = `/api/proxy/${provider}${(provider === 'openai' || provider === 'gemini') ? '/chat/completions' : '/messages'}`;
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
      temperature: aiConfig.temperature,
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
      if (!subtitle.text) {
        resultList.push(subtitle);
        continue;
      }

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

        const translatedSub: Subtitle = {
          ...subtitle,
          text: translatedText,
          originalText: subtitle.text, // Store the original text here!
          words,
        };
        if (words && words.length > 0) {
          const segmentedSubs = this.segmentTranslatedSubtitle(translatedSub);
          resultList.push(...segmentedSubs.map(s => ({ ...s, originalText: subtitle.text })));
        } else {
          resultList.push(translatedSub);
        }
      } else {
        resultList.push(subtitle);
      }
    }

    return resultList;
  }

  private async sanitizeSubtitlesWithAI(
    subtitles: Subtitle[]
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
    const topic = aiConfig.videoContext?.trim() || "N/A";

    const textSubtitles = subtitles.filter(s => s.text && s.text.trim().length > 0);
    if (textSubtitles.length === 0) return subtitles;

    const url = `/api/proxy/${provider}${(provider === 'openai' || provider === 'gemini') ? '/chat/completions' : '/messages'}`;
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
        resolvedModel = aiConfig.customModel ? aiConfig.customModel.trim() : 'gpt-4o-mini';
      }
    } else {
      resolvedModel = aiConfig.customModel ? aiConfig.customModel.trim() : 'claude-3-5-haiku-20241022';
    }

    const settings: TranslationSettings = {
      sourceLanguage: srcLang,
      targetLanguage: srcLang,
      tone,
      topic,
      glossary: aiConfig.glossary,
      temperature: aiConfig.temperature,
    };

    const BATCH_SIZE = 20;
    const CONTEXT_WINDOW = 5;
    const globalSanitizeMap = new Map<string, string>();

    for (let i = 0; i < textSubtitles.length; i += BATCH_SIZE) {
      const batchLines = textSubtitles.slice(i, i + BATCH_SIZE);

      const prevLines = textSubtitles
        .slice(Math.max(0, i - CONTEXT_WINDOW), i)
        .map(s => s.text);

      const nextLines = textSubtitles
        .slice(i + BATCH_SIZE, Math.min(textSubtitles.length, i + BATCH_SIZE + CONTEXT_WINDOW))
        .map(s => s.text);

      try {
        const batchMap = await recursiveBatchSanitize(
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
          globalSanitizeMap.set(id, text);
        }
        console.log(`[AI Sanitization] Batch ${Math.floor(i / BATCH_SIZE) + 1}: OK (${batchMap.size}/${batchLines.length})`);
      } catch (err) {
        console.error(`[AI Sanitization] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err);
        for (const s of batchLines) {
          globalSanitizeMap.set(s.id, s.text);
        }
      }
    }

    const resultList: Subtitle[] = [];
    for (const subtitle of subtitles) {
      if (!subtitle.text) {
        resultList.push(subtitle);
        continue;
      }

      const sanitizedText = globalSanitizeMap.get(subtitle.id);
      if (sanitizedText && sanitizedText !== subtitle.text) {
        const duration = subtitle.endTime - subtitle.startTime;
        const isChineseOrJapanese = this.config.language === 'zh' || this.config.language === 'ja' || 
                                    (sanitizedText.length > 0 && /[\u3400-\u9FFF]/.test(sanitizedText[0]));
        
        const wordsArr = isChineseOrJapanese ? Array.from(sanitizedText) : sanitizedText.split(/\s+/);
        const numWords = wordsArr.length;
        const wordDuration = numWords > 0 ? duration / numWords : 0;
        
        const words = numWords > 0
          ? wordsArr.map((w, idx) => ({
              word: w,
              start: idx * wordDuration,
              end: (idx + 1) * wordDuration,
            }))
          : undefined;

        resultList.push({
          ...subtitle,
          text: sanitizedText,
          words: words ? words.map(w => ({ text: w.word, startTime: subtitle.startTime + w.start, endTime: subtitle.startTime + w.end })) : undefined
        });
      } else {
        resultList.push(subtitle);
      }
    }

    return resultList;
  }

  private segmentTranslatedSubtitle(
    translatedSub: Subtitle
  ): Subtitle[] {
    if (!translatedSub.words || translatedSub.words.length === 0) {
      return [translatedSub];
    }

    const maxWords = 10;
    const maxDuration = 4;

    const totalWords = translatedSub.words.length;
    const totalDuration = translatedSub.endTime - translatedSub.startTime;

    if (totalWords <= maxWords && totalDuration <= maxDuration) {
      return [translatedSub];
    }

    // Calculate optimal number of segments based on words and duration constraints
    const numSegmentsByWords = Math.ceil(totalWords / maxWords);
    const numSegmentsByDuration = Math.ceil(totalDuration / maxDuration);
    const numSegments = Math.max(numSegmentsByWords, numSegmentsByDuration);

    if (numSegments <= 1) {
      return [translatedSub];
    }

    // Distribute words evenly across the calculated number of segments
    const segments: Subtitle[] = [];
    const baseWordsPerSegment = Math.floor(totalWords / numSegments);
    let extraWords = totalWords % numSegments; // distribute remainder to the first few segments

    let wordIndex = 0;
    for (let i = 0; i < numSegments; i++) {
      const wordsCount = baseWordsPerSegment + (extraWords > 0 ? 1 : 0);
      extraWords--;

      const segmentWords = translatedSub.words.slice(wordIndex, wordIndex + wordsCount);
      wordIndex += wordsCount;

      if (segmentWords.length > 0) {
        segments.push({
          ...translatedSub,
          id: `${translatedSub.id}-part-${segments.length}`,
          text: segmentWords.map(cw => cw.text).join(" "),
          startTime: segmentWords[0].startTime,
          endTime: segmentWords[segmentWords.length - 1].endTime,
          words: segmentWords,
        });
      }
    }

    return segments;
  }

  private async extractAudioFromClip(
    clip: Clip,
    mediaItem: MediaItem,
  ): Promise<Blob> {
    const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
    if (isTauri && mediaItem.filePath) {
      try {
        console.log("[TranscriptionService] Tauri detected, extracting audio natively using FFmpeg:", mediaItem.filePath);
        const { invoke } = await import("@tauri-apps/api/core");
        const speed = clip.speed || 1.0;
        const inPoint = clip.inPoint || 0;
        const duration = clip.duration || 0;
        const originalDurationConsumed = duration * speed;
        
        const args = [
          "-ss", inPoint.toString(),
          "-i", mediaItem.filePath,
          "-t", originalDurationConsumed.toString(),
          "-vn",
          "-acodec", "pcm_s16le",
          "-ac", "1",
          "-ar", "16000",
        ];
        
        if (speed !== 1.0) {
          const filters: string[] = [];
          let temp = speed;
          while (temp > 2.0) {
            filters.push("atempo=2.0");
            temp /= 2.0;
          }
          while (temp < 0.5) {
            filters.push("atempo=0.5");
            temp /= 0.5;
          }
          if (temp !== 1.0) {
            filters.push(`atempo=${temp}`);
          }
          args.push("-filter:a", filters.join(","));
        }
        
        args.push("-f", "wav", "-");
        
        const bytes = await invoke<number[]>("run_ffmpeg_binary", { args });
        return new Blob([new Uint8Array(bytes)], { type: "audio/wav" });
      } catch (err) {
        console.error("[TranscriptionService] Native audio extraction failed, attempting fallback to browser-based extraction...", err);
      }
    }

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

    if (response.text && response.text.trim().length > 0) {
      const isChineseOrJapanese = this.config.language === 'zh' || this.config.language === 'ja' || 
                                  (response.words.length > 0 && /[\u3400-\u9FFF]/.test(response.words[0].word));
      if (isChineseOrJapanese) {
        try {
          console.log("[TranscriptionService] Using natural clause grouping for Chinese/Japanese text...");
          return this.groupWordsIntoSubtitlesByNaturalClauses(response.text, response.words, clip.startTime);
        } catch (err) {
          console.warn("[TranscriptionService] Natural clause grouping failed, falling back to standard grouping:", err);
        }
      }
    }

    return this.groupWordsIntoSubtitles(response.words, clip.startTime);
  }

  private groupWordsIntoSubtitlesByNaturalClauses(
    text: string,
    words: CloudflareWhisperWord[],
    clipStartTime: number
  ): Subtitle[] {
    const subtitles: Subtitle[] = [];
    const maxDuration = this.config.maxSegmentDuration || 5;
    
    // Split natural segments by whitespace
    const clauses = text.split(/\s+/).filter(c => c.trim().length > 0);
    let wordIndex = 0;

    for (const clause of clauses) {
      const clauseWords: CloudflareWhisperWord[] = [];
      let accumulatedLength = 0;
      const targetLength = clause.length;
      
      // Match words by character length accumulation
      while (accumulatedLength < targetLength && wordIndex < words.length) {
        const w = words[wordIndex];
        clauseWords.push(w);
        accumulatedLength += w.word.length;
        wordIndex++;
      }

      if (clauseWords.length === 0) continue;

      const duration = clauseWords[clauseWords.length - 1].end - clauseWords[0].start;

      // Split mechanically if the natural clause is too long
      if (duration > maxDuration) {
        const mid = Math.floor(clauseWords.length / 2);
        if (mid > 0) {
          subtitles.push(this.createSubtitleFromWords(clauseWords.slice(0, mid), clipStartTime));
          subtitles.push(this.createSubtitleFromWords(clauseWords.slice(mid), clipStartTime));
        } else {
          subtitles.push(this.createSubtitleFromWords(clauseWords, clipStartTime));
        }
      } else {
        subtitles.push(this.createSubtitleFromWords(clauseWords, clipStartTime));
      }
    }

    // Safely capture any leftover words
    if (wordIndex < words.length) {
      const remainingWords = words.slice(wordIndex);
      subtitles.push(this.createSubtitleFromWords(remainingWords, clipStartTime));
    }

    return subtitles;
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
    const isChineseOrJapanese = this.config.language === 'zh' || this.config.language === 'ja' || 
                                (words.length > 0 && /[\u3400-\u9FFF]/.test(words[0].word));
    const text = words
      .map((w) => w.word)
      .join(isChineseOrJapanese ? "" : " ")
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
