import type { Subtitle, SubtitleStyle, Clip } from "../types/timeline";
import type { MediaItem } from "../types/project";

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
    if (this.config.translationMethod === "ai") {
      if (!this.config.aiConfig?.apiKey) {
        throw new Error("Không thể dịch bằng AI: Thiếu API Key trong phần cài đặt (Settings > API Keys).");
      }
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

    // Filter subtitles that have text
    const textSubtitles = subtitles.filter(s => s.text && s.text.trim().length > 0);
    if (textSubtitles.length === 0) return subtitles;

    // ─── Proxy URL & headers ─────────────────────────────────────────────
    const url = `/api/proxy/${provider}${provider === 'openai' ? '/chat/completions' : '/messages'}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-proxy-api-key': aiConfig.apiKey
    };
    if (aiConfig.customBaseUrl) {
      headers['x-proxy-base-url'] = aiConfig.customBaseUrl.trim().replace(/\/$/, "");
    }

    // ─── Model resolution ─────────────────────────────────────────────────
    const isMimo = !!(aiConfig.customBaseUrl && aiConfig.customBaseUrl.includes('xiaomimimo.com'));
    const VALID_MIMO_MODELS = ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-pro', 'mimo-v2-omni', 'mimo-v2-flash'];
    let resolvedModel: string;
    if (provider === 'openai') {
      if (isMimo) {
        const cm = (aiConfig.customModel?.trim() ?? '').toLowerCase();
        resolvedModel = VALID_MIMO_MODELS.includes(cm) ? cm : 'mimo-v2.5-pro';
      } else {
        resolvedModel = aiConfig.customModel ? aiConfig.customModel.trim() : 'gpt-4o-mini';
      }
    } else {
      resolvedModel = aiConfig.customModel ? aiConfig.customModel.trim() : 'claude-3-5-haiku-20241022';
    }

    const contextPrompt = aiConfig.videoContext
      ? `Additional Context/Topic of the video: ${aiConfig.videoContext}\n`
      : "";

    const systemPrompt = `You are a professional video translator. Translate the following subtitles into ${targetLanguage}.
${contextPrompt}Maintain the contextual flow, conversational tone, and exact meaning across the entire sequence.
The requested tone is: ${tone}.
Do not summarize. Translate every text segment exactly.
CRITICAL LENGTH RULE: Each subtitle has a "wc" field showing the original word count. Your translation MUST have approximately the same number of words as that "wc" value (±2 words max). Subtitle timing is fixed — if your translation is too long, shorten it naturally. Never expand a short line into a long sentence.
IMPORTANT: You MUST respond ONLY with a JSON object in this format:
{
  "translations": [
    { "id": "the-original-id", "text": "translated text here" }
  ]
}
Do not include any markdowns (like \`\`\`json) or other conversational filler. Return ONLY the raw JSON object.`;

    // ─── Helper: build request body ───────────────────────────────────────
    const buildRequestBody = (batchPayload: object[]) => {
      if (provider === 'openai') {
        const body: any = {
          model: resolvedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(batchPayload) }
          ],
          temperature: 0.3
        };
        if (!isMimo) body.response_format = { type: "json_object" };
        return body;
      }
      return {
        model: resolvedModel,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(batchPayload) }],
        temperature: 0.3
      };
    };

    // ─── Helper: parse AI response robustly ──────────────────────────────
    const parseResponse = (raw: string): Map<string, string> => {
      let text = raw.trim();
      // Strip markdown code fences if present
      if (text.startsWith('```')) {
        const first = text.indexOf('\n');
        const last = text.lastIndexOf('```');
        if (first !== -1 && last > first) text = text.substring(first + 1, last).trim();
      }
      const parsed = JSON.parse(text);
      const arr: Array<{ id: string; text: string }> = parsed.translations || [];
      const map = new Map<string, string>();
      for (const t of arr) {
        if (t.id && t.text) map.set(t.id, t.text);
      }
      return map;
    };

    // ─── Custom error for non-retryable failures ──────────────────────────
    class ContentFilterError extends Error {
      constructor(msg: string) { super(msg); this.name = 'ContentFilterError'; }
    }

    // ─── Helper: call AI with retry (exponential back-off) ───────────────
    const callWithRetry = async (
      batchPayload: object[],
      maxRetries = 3
    ): Promise<Map<string, string>> => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(buildRequestBody(batchPayload))
          });
          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText}`);
          }
          const json = await response.json();

          // ── Detect content_filter (HTTP 200 but content rejected) ──────
          const finishReason = json.choices?.[0]?.finish_reason;
          if (finishReason === 'content_filter') {
            const filterMsg = json.choices?.[0]?.message?.content ?? 'Content filtered';
            console.warn(`[AI Translation] Batch blocked by content filter: "${filterMsg}". Skipping retries, will use original text.`);
            throw new ContentFilterError(filterMsg);
          }

          const rawContent = provider === 'openai'
            ? (json.choices?.[0]?.message?.content ?? '')
            : (json.content?.[0]?.text ?? '');
          return parseResponse(rawContent);
        } catch (err) {
          lastError = err;
          // Content filter — no point retrying, bail out immediately
          if (err instanceof ContentFilterError) throw err;
          console.warn(`[AI Translation] Attempt ${attempt}/${maxRetries} failed:`, err);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, attempt * 1000));
          }
        }
      }
      throw lastError;
    };


    // ─── Batch processing with context window ─────────────────────────────
    const BATCH_SIZE = 30;
    const CONTEXT_WINDOW = 15;
    const globalTranslationMap = new Map<string, string>();

    for (let i = 0; i < textSubtitles.length; i += BATCH_SIZE) {
      const batchLines = textSubtitles.slice(i, i + BATCH_SIZE);

      const prevLines = textSubtitles
        .slice(Math.max(0, i - CONTEXT_WINDOW), i)
        .map(s => s.text);

      const nextLines = textSubtitles
        .slice(i + BATCH_SIZE, Math.min(textSubtitles.length, i + BATCH_SIZE + CONTEXT_WINDOW))
        .map(s => s.text);

      const batchPayload: object[] = [
        ...(prevLines.length > 0
          ? [{ _context: 'previous', _note: 'For reference only — do NOT translate', lines: prevLines }]
          : []),
        ...batchLines.map(s => ({
          id: s.id,
          text: s.text,
          wc: s.text.trim().split(/\s+/).filter(Boolean).length
        })),
        ...(nextLines.length > 0
          ? [{ _context: 'next', _note: 'For reference only — do NOT translate', lines: nextLines }]
          : [])
      ];

      try {
        const batchMap = await callWithRetry(batchPayload, 3);
        for (const [id, text] of batchMap) globalTranslationMap.set(id, text);
        console.log(`[AI Translation] Batch ${Math.floor(i / BATCH_SIZE) + 1}: OK (${batchMap.size}/${batchLines.length})`);
      } catch (err) {
        // Content filter → dừng hẳn, báo lỗi rõ ràng
        if (err instanceof ContentFilterError) {
          throw new Error(
            `Dịch phụ đề bị chặn bởi bộ lọc nội dung của AI (content_filter).\n` +
            `Lý do: "${err.message}".\n` +
            `Nội dung video có thể chứa chủ đề nhạy cảm mà provider AI từ chối xử lý. ` +
            `Hãy thử đổi sang provider khác (OpenAI / Anthropic) hoặc dịch thủ công đoạn bị lọc.`
          );
        }
        // Lỗi khác (network, timeout, parse) → fallback giữ text gốc cho batch này
        console.error(`[AI Translation] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed after 3 retries — using original text:`, err);
        for (const s of batchLines) globalTranslationMap.set(s.id, s.text);
      }
    }

    // ─── Assemble final result ────────────────────────────────────────────
    const resultList: Subtitle[] = [];
    for (const subtitle of subtitles) {
      resultList.push(subtitle);
      if (!subtitle.text) continue;

      const translatedText = globalTranslationMap.get(subtitle.id);
      if (translatedText && translatedText !== subtitle.text) {
        const duration = subtitle.endTime - subtitle.startTime;
        const translatedWords = translatedText.split(/\s+/);
        const numWords = translatedWords.length;
        const wordDuration = numWords > 0 ? duration / numWords : 0;
        const words = numWords > 0
          ? translatedWords.map((w, idx) => ({
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
