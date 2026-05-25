import { useCallback } from "react";
import { useSettingsStore } from "../../../stores/settings-store";
import { useElevenLabsApi } from "../inspector/hooks/useElevenLabsApi";
import { getSecret, isSessionUnlocked } from "../../../services/secure-storage";
import { initializeTranscriptionService, type Project, type MediaItem, type Subtitle } from "@openreel/core";
import { getMediaBridge, initializeMediaBridge } from "../../../bridges/media-bridge";
import { saveMediaBlob } from "../../../services/media-storage";
import { OPENREEL_TRANSCRIBE_URL } from "../../../config/api-endpoints";
import { toast } from "../../../stores/notification-store";

/** Delay helper */
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Gọi hàm TTS với tự động retry khi gặp rate limit (429).
 * - maxRetries: số lần thử lại tối đa
 * - baseDelay: thời gian chờ ban đầu (ms), sẽ tăng theo cấp số nhân
 */
async function callTtsWithRetry(
  fn: () => Promise<Blob>,
  maxRetries = 5,
  baseDelayMs = 65_000,
): Promise<Blob> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("Rate limit") || err.message.includes("429") || err.message.includes("rate limit"));

      if (!isRateLimit || attempt === maxRetries) {
        throw err;
      }

      // Tính thời gian chờ: 65s, 70s, 80s, ... (exponential backoff nhẹ)
      const waitMs = baseDelayMs + attempt * 5_000;
      console.warn(
        `[TTS] Rate limit hit. Chờ ${(waitMs / 1000).toFixed(0)}s trước khi thử lại (lần ${attempt + 1}/${maxRetries})...`,
      );
      toast.error(
        "TTS Rate Limit",
        `Đạt giới hạn tốc độ. Tự động thử lại sau ${(waitMs / 1000).toFixed(0)} giây...`,
      );
      await delay(waitMs);
    }
  }
  // Không thể đến đây nhưng cần để TypeScript hài lòng
  throw new Error("TTS: Hết số lần thử lại");
}

export function useAutomationCallbacks() {
  const {
    defaultTtsProvider,
    defaultLlmProvider,
    configuredServices,
    elevenLabsModel,
    favoriteVoices,
    settingsOpen,
    customOpenAiBaseUrl,
    customAnthropicBaseUrl,
    customOpenAiModel,
    customAnthropicModel,
  } = useSettingsStore.getState();

  const hasElevenLabsKey = configuredServices.includes("elevenlabs");

  const { generateWithElevenLabs, generateWithPiper } = useElevenLabsApi({
    provider: defaultTtsProvider === "elevenlabs" && hasElevenLabsKey ? "elevenlabs" : "piper",
    hasElevenLabsKey,
    settingsOpen,
    elevenLabsModel,
    defaultLlmProvider,
  });

  // VieNeu: server Python cục bộ tại localhost:8000 — không có rate limit
  const generateWithVieNeu = useCallback(async (text: string, voice: string, speed: number): Promise<Blob> => {
    const response = await fetch("http://localhost:8000/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, speed }),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      throw new Error(errData?.detail || `VieNeu API error: ${response.status}`);
    }
    return response.blob();
  }, []);

  const onProgress = useCallback((projectId: string, phase: string, progress: number) => {
    console.log(`[AutoProcessor ${projectId}] ${phase}: ${progress.toFixed(1)}%`);
    if (phase.toLowerCase().includes("error")) {
      toast.error("Lỗi Tiến Trình Tự Động", phase);
    }
  }, []);

  const generateCaptions = useCallback(async (mediaItem: MediaItem, project: Project): Promise<Subtitle[]> => {
    try {
      console.log(`[AutomationCallbacks] Bắt đầu tạo phụ đề cho video: ${mediaItem.name} (${mediaItem.id})`);
      const config = project.settings.automationConfig;
      
      // We need a dummy clip for transcribeClip API
      const dummyClip = { id: `dummy-${Date.now()}`, mediaId: mediaItem.id, trackId: "video-1", startTime: 0, duration: mediaItem.metadata.duration, type: "video" as const };
      
      let aiConfig = undefined;
      if (config?.targetLanguage && config.targetLanguage !== "none" && config.translationMethod === "ai") {
        try {
          const apiKey = await getSecret(config.aiProvider || "openai");
          if (apiKey) {
            let glossary: Record<string, string> | undefined = undefined;
            if (config?.glossaryText && typeof config.glossaryText === "string" && config.glossaryText.trim()) {
              const glossaryRecord: Record<string, string> = {};
              config.glossaryText.split(",").forEach((item: string) => {
                const parts = item.split(":");
                if (parts.length >= 2) {
                  const key = parts[0].trim();
                  const val = parts.slice(1).join(":").trim();
                  if (key && val) {
                    glossaryRecord[key] = val;
                  }
                }
              });
              if (Object.keys(glossaryRecord).length > 0) {
                glossary = glossaryRecord;
              }
            }

            aiConfig = {
              provider: (config.aiProvider || "openai") as "openai" | "anthropic",
              apiKey,
              tone: config.aiTone || "natural and fluent",
              videoContext: config.videoContext || undefined,
              glossary,
              temperature: config.aiTemperature !== undefined ? config.aiTemperature : undefined,
              customBaseUrl: config.aiProvider === "openai" ? customOpenAiBaseUrl : customAnthropicBaseUrl,
              customModel: config.aiProvider === "openai" ? customOpenAiModel : customAnthropicModel,
            };
          }
        } catch (err) {
          console.warn("[useAutomationCallbacks] Secure storage is locked, cannot read API Key for AI translation:", err);
        }
      }

      console.log("[AutomationCallbacks] Khởi tạo TranscriptionService với máy chủ:", `${OPENREEL_TRANSCRIBE_URL}/transcribe`);
      const transcriptionService = initializeTranscriptionService({
        apiEndpoint: `${OPENREEL_TRANSCRIBE_URL}/transcribe`,
        language: config?.sourceLanguage && config.sourceLanguage !== "none" ? config.sourceLanguage : undefined,
        targetLanguage: config?.targetLanguage && config.targetLanguage !== "none" ? config.targetLanguage : undefined,
        translationMethod: config?.targetLanguage && config.targetLanguage !== "none" ? config.translationMethod : undefined,
        aiConfig,
      });

      const setProgress = (p: any) => {
        console.log(`[AutomationCallbacks] Tiến trình phụ đề: ${p.phase} - ${p.progress}% - ${p.message}`);
      };

      console.log("[AutomationCallbacks] Đang gọi API transcribeClip...");
      const subtitlesResult = await transcriptionService.transcribeClip(
        dummyClip as any,
        mediaItem,
        setProgress,
      );

      // Find the corresponding video clip in project to check its speed and startTime
      let targetClip: any = null;
      if (project.timeline?.tracks) {
        for (const track of project.timeline.tracks) {
          if (track.type !== 'video') continue;
          const clip = track.clips.find(c => c.mediaId === mediaItem.id);
          if (clip) {
            targetClip = clip;
            break;
          }
        }
      }

      const speed = targetClip?.speed || 1.0;
      const clipStartTime = targetClip?.startTime || 0;
      console.log(`[AutomationCallbacks] Tốc độ clip mục tiêu: ${speed}x, Clip StartTime: ${clipStartTime}s`);

      console.log(`[AutomationCallbacks] Đã tạo phụ đề thành công! Số lượng: ${subtitlesResult.length}`);
      return subtitlesResult.map(sub => {
        const scaledSub = {
          ...sub,
          startTime: clipStartTime + (sub.startTime / speed),
          endTime: clipStartTime + (sub.endTime / speed),
          animationStyle: (config?.animationStyle || "word-highlight") as any
        };
        if (sub.words) {
          scaledSub.words = sub.words.map(w => ({
            ...w,
            startTime: clipStartTime + (w.startTime / speed),
            endTime: clipStartTime + (w.endTime / speed),
          }));
        }
        return scaledSub;
      });
    } catch (err) {
      console.error("[AutomationCallbacks] LỖI CRITICAL khi tạo phụ đề:", err);
      toast.error("Tạo Phụ Đề Thất Bại", err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [customOpenAiBaseUrl, customAnthropicBaseUrl, customOpenAiModel, customAnthropicModel]);

  const generateTTS = useCallback(async (subtitles: Subtitle[], project: Project): Promise<any[]> => {
    const config = project.settings.automationConfig;
    // Ưu tiên provider được cấu hình trong automation, sau đó dùng defaultTtsProvider
    let provider = config?.ttsProvider || defaultTtsProvider || "piper";
    
    if (provider === "elevenlabs" && (!hasElevenLabsKey || !isSessionUnlocked())) {
      console.warn(`[TTS] ElevenLabs session is locked or key is missing. Falling back.`);
      provider = defaultTtsProvider === "vieneu" ? "vieneu" : "piper";
    }

    const voiceId = config?.ttsVoiceId || (provider === "vieneu" ? "default" : favoriteVoices.length > 0 ? favoriteVoices[0].voiceId : "amy");
    const speed = config?.ttsSpeed || 1.0;

    console.log(`[TTS] Provider: ${provider}, Voice: ${voiceId}, Speed: ${speed}x`);

    // Prepare subtitles and their corresponding speak texts
    const speakItems: Array<{ subtitle: Subtitle; text: string }> = [];

    // Check if there are any old-format paired translations in the subtitle list
    const hasOldFormatTranslations = subtitles.some(s => s.id.endsWith("-translated"));

    if (hasOldFormatTranslations) {
      // Handle backward-compatibility for old paired format
      let targetSubs = subtitles;
      if (config?.ttsTargetType === "translated") {
        targetSubs = subtitles.filter((s) => s.id.endsWith("-translated"));
      } else if (config?.ttsTargetType === "original") {
        targetSubs = subtitles.filter((s) => !s.id.endsWith("-translated"));
      } else {
        const translatedSubs = subtitles.filter((s) => s.id.endsWith("-translated"));
        targetSubs = translatedSubs.length > 0 ? translatedSubs : subtitles.filter((s) => !s.id.endsWith("-translated"));
      }
      for (const s of targetSubs) {
        speakItems.push({ subtitle: s, text: s.text });
      }
    } else {
      // Handle new single-layer bilingual format
      for (const s of subtitles) {
        if (config?.ttsTargetType === "translated") {
          speakItems.push({ subtitle: s, text: s.text });
        } else if (config?.ttsTargetType === "original") {
          speakItems.push({ subtitle: s, text: s.originalText || s.text });
        } else {
          speakItems.push({ subtitle: s, text: s.text });
        }
      }
    }

    // Ensure project.timeline and tracks exist
    if (!project.timeline) {
      (project as any).timeline = { tracks: [], subtitles: [], duration: 0, markers: [] };
    }
    if (!project.timeline.tracks) {
      (project.timeline as any).tracks = [];
    }

    const ttsTrackId = project.timeline.tracks.find(t => t.name === "TTS")?.id || `track-tts-${Date.now()}`;
    if (!project.timeline.tracks.find(t => t.id === ttsTrackId)) {
      project.timeline.tracks.push({
        id: ttsTrackId,
        name: "TTS",
        type: "audio",
        clips: [],
        visible: true,
        locked: false,
        volume: 1,
        muted: false,
      } as any);
    }

    const ttsTrack = project.timeline.tracks.find(t => t.id === ttsTrackId)!;
    const newClips: any[] = [];

    for (let subIdx = 0; subIdx < speakItems.length; subIdx++) {
      const item = speakItems[subIdx];
      const subtitle = item.subtitle;
      const textToSpeak = item.text;
      if (!textToSpeak.trim()) continue;

      // Delay giữa các request:
      // - VieNeu (localhost): không cần delay — server cục bộ, không giới hạn
      // - Piper / ElevenLabs (cloud free): chờ 6.5s để tránh vượt 10 req/min
      if (subIdx > 0 && provider !== "vieneu") {
        await delay(6_500);
      }

      const totalNonEmpty = speakItems.filter(item => item.text.trim()).length;
      console.log(`[TTS] Tổng hợp giọng nói ${subIdx + 1}/${totalNonEmpty} [${provider}]: "${textToSpeak.trim().substring(0, 60)}"`);

      // Gọi đúng API theo provider
      let blob: Blob;
      if (provider === "vieneu") {
        // VieNeu: server local, không rate limit, không cần retry
        blob = await generateWithVieNeu(textToSpeak.trim(), voiceId, speed);
      } else if (provider === "elevenlabs") {
        blob = await callTtsWithRetry(() => generateWithElevenLabs(textToSpeak.trim(), voiceId), 5, 65_000);
      } else {
        // piper (cloud)
        blob = await callTtsWithRetry(() => generateWithPiper(textToSpeak.trim(), voiceId, speed), 5, 65_000);
      }

      const fileName = `TTS_${Date.now()}.wav`;
      const file = new File([blob], fileName, { type: "audio/wav" });

      try {
        const mediaBridge = getMediaBridge();
        if (!mediaBridge.isInitialized()) {
          await initializeMediaBridge();
        }

        const importResult = await mediaBridge.importFile(file, true, false);
        if (!importResult.success || !importResult.media) {
          console.warn("[AutomationCallbacks] Failed to import TTS WAV:", importResult.error);
          continue;
        }

        const processedMedia = importResult.media;

        let thumbnailUrl: string | null = null;
        const filmstripThumbnails: { timestamp: number; url: string }[] = [];
        if (processedMedia.thumbnails && processedMedia.thumbnails.length > 0) {
          for (const thumb of processedMedia.thumbnails) {
            let thumbUrl = thumb.dataUrl || null;
            if (!thumbUrl && thumb.canvas) {
              try {
                if (thumb.canvas instanceof OffscreenCanvas) {
                  const b = await thumb.canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
                  thumbUrl = URL.createObjectURL(b);
                } else if (thumb.canvas instanceof HTMLCanvasElement) {
                  thumbUrl = thumb.canvas.toDataURL("image/jpeg", 0.7);
                }
              } catch (e) {
                console.warn("Failed to convert thumbnail canvas:", e);
              }
            }
            if (thumbUrl) {
              filmstripThumbnails.push({ timestamp: thumb.timestamp, url: thumbUrl });
            }
          }
          if (filmstripThumbnails.length > 0) {
            thumbnailUrl = filmstripThumbnails[0].url;
          }
        }

        const mediaId = crypto.randomUUID();
        const newMediaItem = {
          id: mediaId,
          name: file.name,
          type: "audio" as const,
          fileHandle: null,
          blob: file,
          metadata: {
            duration: processedMedia.metadata.duration || subtitle.endTime - subtitle.startTime || 0,
            width: processedMedia.metadata.width || 0,
            height: processedMedia.metadata.height || 0,
            frameRate: processedMedia.metadata.frameRate || 0,
            codec: processedMedia.metadata.codec || "",
            sampleRate: processedMedia.metadata.sampleRate || 0,
            channels: processedMedia.metadata.channels || 0,
            fileSize: file.size,
          },
          thumbnailUrl,
          waveformData: processedMedia.waveformData?.peaks || null,
          filmstripThumbnails: filmstripThumbnails.length > 0 ? filmstripThumbnails : undefined,
          sourceFile: { name: file.name, size: file.size, lastModified: file.lastModified },
        };

        if (!project.mediaLibrary) (project as any).mediaLibrary = { items: [] };
        if (!project.mediaLibrary.items) (project.mediaLibrary as any).items = [];
        project.mediaLibrary.items.push(newMediaItem as any);

        try {
          await saveMediaBlob(project.id, mediaId, file, newMediaItem.metadata);
        } catch (err) {
          console.error("[AutomationCallbacks] Failed to persist TTS media blob:", err);
        }

        ttsTrack.clips.push({
          id: `tts-clip-${Date.now()}-${Math.random()}`,
          trackId: ttsTrackId,
          mediaId: mediaId,
          startTime: subtitle.startTime,
          duration: subtitle.endTime - subtitle.startTime,
          type: 'audio',
          startOffset: 0,
          volume: 1,
        } as any);
      } catch (err) {
        console.error("[AutomationCallbacks] Error during direct TTS import:", err);
      }
    }

    return newClips;
  }, [defaultTtsProvider, hasElevenLabsKey, favoriteVoices, generateWithElevenLabs, generateWithPiper, generateWithVieNeu]);

  return {
    generateCaptions,
    generateTTS,
    onProgress,
  };
}
