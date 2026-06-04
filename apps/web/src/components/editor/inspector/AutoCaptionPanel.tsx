import React, { useCallback, useMemo, useState } from "react";
import {
  Captions,
  Languages,
  AlertCircle,
  Loader2,
  Download,
  Upload,
  CheckCircle2,
  Sparkles,
  Volume2,
  Trash2,
  Copy,
  FileText,
} from "lucide-react";
import {
  initializeTranscriptionService,
  type CaptionAnimationStyle,
  type WhisperTranscriptionProgress,
  CAPTION_ANIMATION_STYLES,
  getAnimationStyleDisplayName,
  type Subtitle,
} from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";
import { parseSRT } from "../../../stores/project/subtitle-helpers";
import { useUIStore } from "../../../stores/ui-store";
import { OPENREEL_TRANSCRIBE_URL } from "../../../config/api-endpoints";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  Slider,
} from "@openreel/ui";
import { toast } from "../../../stores/notification-store";
import { useElevenLabsApi } from "./hooks/useElevenLabsApi";
import { isSessionUnlocked, getSecret } from "../../../services/secure-storage";
import { useSettingsStore, type TtsProvider } from "../../../stores/settings-store";

const LANGUAGE_OPTIONS = [
  { code: "none", name: "Auto detect" },
  { code: "en", name: "English" },
  { code: "vi", name: "Vietnamese" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "th", name: "Thai" },
];

const TARGET_LANGUAGE_OPTIONS = [
  { code: "none", name: "Original" },
  ...LANGUAGE_OPTIONS.filter((language) => language.code !== "none"),
];

const TONE_OPTIONS = [
  { value: "natural and fluent", label: "Natural (Tự nhiên)" },
  { value: "storytelling and engaging", label: "Storytelling (Kể chuyện)" },
  { value: "formal and professional", label: "Formal (Trang trọng)" },
  { value: "casual and friendly", label: "Casual (Thân mật)" },
  { value: "funny, humorous, witty and entertaining", label: "Hài hước & Vui vẻ" },
  { value: "aggressive, hot-tempered, rude gamer slang but funny and hilarious", label: "Cục súc & Hài hước (Gamer)" },
];

export const AutoCaptionPanel: React.FC = () => {
  const addSubtitle = useProjectStore((state) => state.addSubtitle);
  const clearCaptions = useProjectStore((state) => state.clearCaptions);
  const getClip = useProjectStore((state) => state.getClip);
  const getMediaItem = useProjectStore((state) => state.getMediaItem);
  const exportSRT = useProjectStore((state) => state.exportSRT);
  const addTrack = useProjectStore((state) => state.addTrack);
  const addClip = useProjectStore((state) => state.addClip);
  const importMedia = useProjectStore((state) => state.importMedia);

  const subtitles = useProjectStore((state) => state.project?.timeline?.subtitles || []);
  const hasSubtitles = subtitles.length > 0;
  
  const project = useProjectStore((state) => state.project);
  const updateSettings = useProjectStore((state) => state.updateSettings);
  
  const selectedClipIds = useUIStore((state) => state.getSelectedClipIds());

  const handleExportSRT = useCallback(async () => {
    try {
      const srtContent = await exportSRT();
      const blob = new Blob([srtContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "captions.srt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to export SRT");
    }
  }, [exportSRT]);

  const handleExportTXT = useCallback(async () => {
    try {
      const translationMap = new Map<string, string>();
      for (const sub of subtitles) {
        if (sub.id.endsWith("-translated")) {
          const originalId = sub.id.substring(0, sub.id.length - 11);
          translationMap.set(originalId, sub.text);
        }
      }

      const originalSubtitles = subtitles.filter(sub => !sub.id.endsWith("-translated"));
      const sorted = [...originalSubtitles].sort((a, b) => a.startTime - b.startTime);
      
      const paragraphs = sorted.map((subtitle) => {
        const oldFormatTranslation = translationMap.get(subtitle.id);
        if (oldFormatTranslation) {
          return `${oldFormatTranslation}\n${subtitle.text}`;
        } else if (subtitle.originalText && subtitle.originalText.trim() !== subtitle.text.trim()) {
          return `${subtitle.text}\n${subtitle.originalText}`;
        }
        return subtitle.text.trim();
      });

      const txtContent = paragraphs.join("\n\n"); // separate segments by double newlines for bilingual readability
      const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transcription.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Exported plain text transcript successfully!");
    } catch (err) {
      setError("Failed to export TXT");
    }
  }, [subtitles]);

  const handleCopyTranscript = useCallback(async () => {
    try {
      const translationMap = new Map<string, string>();
      for (const sub of subtitles) {
        if (sub.id.endsWith("-translated")) {
          const originalId = sub.id.substring(0, sub.id.length - 11);
          translationMap.set(originalId, sub.text);
        }
      }

      const originalSubtitles = subtitles.filter(sub => !sub.id.endsWith("-translated"));
      const sorted = [...originalSubtitles].sort((a, b) => a.startTime - b.startTime);
      
      const paragraphs = sorted.map((subtitle) => {
        const oldFormatTranslation = translationMap.get(subtitle.id);
        if (oldFormatTranslation) {
          return `${oldFormatTranslation}\n${subtitle.text}`;
        } else if (subtitle.originalText && subtitle.originalText.trim() !== subtitle.text.trim()) {
          return `${subtitle.text}\n${subtitle.originalText}`;
        }
        return subtitle.text.trim();
      });

      const txtContent = paragraphs.join("\n\n");
      await navigator.clipboard.writeText(txtContent);
      toast.success("Copied plain text transcript to clipboard!");
    } catch (err) {
      toast.error("Failed to copy transcript");
    }
  }, [subtitles]);

  const handleDownloadWhisperCache = useCallback(() => {
    try {
      const raw = window.localStorage.getItem("openreel_last_whisper_raw");
      if (!raw) {
        toast.error("Không tìm thấy dữ liệu Whisper cached trong localStorage.");
        return;
      }
      
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "whisper_raw_response.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Tải xuống file JSON Whisper gốc thành công!");
    } catch (err) {
      toast.error("Lỗi khi tải dữ liệu cache.");
    }
  }, []);

  const {
    defaultTtsProvider,
    defaultLlmProvider,
    configuredServices,
    elevenLabsModel,
    favoriteVoices,
    settingsOpen,
    customOpenAiBaseUrl,
    customAnthropicBaseUrl,
    customGeminiBaseUrl,
    customOpenAiModel,
    customAnthropicModel,
    customGeminiModel,
  } = useSettingsStore();

  const hasElevenLabsKey = configuredServices.includes("elevenlabs");
  const hasAiKey = configuredServices.includes("openai") || configuredServices.includes("anthropic") || configuredServices.includes("gemini");

  const defaultProvider: TtsProvider =
    defaultTtsProvider === "elevenlabs" && hasElevenLabsKey
      ? "elevenlabs"
      : defaultTtsProvider === "vieneu"
        ? "vieneu"
        : "piper";

  // States
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isImportingSRT, setIsImportingSRT] = useState(false);
  const [importSRTResult, setImportSRTResult] = useState<{ count: number } | null>(null);
  const [progress, setProgress] =
    useState<WhisperTranscriptionProgress | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState("none");
  const [targetLanguage, setTargetLanguage] = useState("none");
  const [animationStyle, setAnimationStyle] =
    useState<CaptionAnimationStyle>("word-highlight");
  const [error, setError] = useState<string | null>(null);
  const [lastCaptionCount, setLastCaptionCount] = useState<number | null>(null);
  const [hasWhisperCache, setHasWhisperCache] = useState(() => {
    try {
      return typeof window !== "undefined" && !!window.localStorage.getItem("openreel_last_whisper_raw");
    } catch {
      return false;
    }
  });

  // AI Translation configurations
  const [translationMethod, setTranslationMethod] = useState<"google" | "ai">("google");
  const [aiProvider, setAiProvider] = useState<"openai" | "anthropic" | "gemini">(
    defaultLlmProvider === "anthropic"
      ? "anthropic"
      : defaultLlmProvider === "gemini"
        ? "gemini"
        : "openai"
  );
  const [aiTone, setAiTone] = useState<string>("natural and fluent");
  const [videoContext, setVideoContext] = useState<string>("");
  const [glossaryText, setGlossaryText] = useState<string>("");
  const [aiTemperature, setAiTemperature] = useState<number>(0.0);
  const [translationBranch, setTranslationBranch] = useState<"A" | "B">("A");

  // TTS configurations
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>(defaultProvider);
  const [selectedVoice, setSelectedVoice] = useState<string>(
    defaultProvider === "elevenlabs" && favoriteVoices.length > 0
      ? favoriteVoices[0].voiceId
      : defaultProvider === "vieneu"
        ? "default"
        : "amy",
  );
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.0);
  const [isGeneratingTts, setIsGeneratingTts] = useState<boolean>(false);
  const [ttsProgress, setTtsProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [ttsTargetType, setTtsTargetType] = useState<"original" | "translated" | "auto">("auto");

  // Save automation config to project settings helper
  const saveAutomationConfig = useCallback((updates: Partial<NonNullable<typeof project.settings.automationConfig>>) => {
    if (!project) return;
    const currentConfig = project.settings?.automationConfig || { autoCaption: true, tts: false };
    updateSettings({
      automationConfig: {
        ...currentConfig,
        ...updates
      }
    });
  }, [project, updateSettings]);

  // Load configuration from project settings when project changes
  React.useEffect(() => {
    if (project) {
      const config = project.settings?.automationConfig;
      if (config) {
        if (config.sourceLanguage !== undefined) setSourceLanguage(config.sourceLanguage);
        if (config.targetLanguage !== undefined) setTargetLanguage(config.targetLanguage);
        if (config.animationStyle !== undefined) setAnimationStyle(config.animationStyle as CaptionAnimationStyle);
        if (config.translationMethod !== undefined) setTranslationMethod(config.translationMethod);
        if (config.aiProvider !== undefined) setAiProvider(config.aiProvider);
        if (config.aiTone !== undefined) setAiTone(config.aiTone);
        if (config.videoContext !== undefined) setVideoContext(config.videoContext);
        if (config.glossaryText !== undefined) setGlossaryText(config.glossaryText);
        if (config.aiTemperature !== undefined) setAiTemperature(config.aiTemperature);
        if (config.translationBranch !== undefined) setTranslationBranch(config.translationBranch);
        if (config.ttsProvider !== undefined) setTtsProvider(config.ttsProvider);
        if (config.ttsVoiceId !== undefined) setSelectedVoice(config.ttsVoiceId);
        if (config.ttsSpeed !== undefined) setTtsSpeed(config.ttsSpeed);
        if (config.ttsTargetType !== undefined) setTtsTargetType(config.ttsTargetType);
      }
    }
  }, [project?.id]);

  // Sync state values if defaults change
  React.useEffect(() => {
    setTtsProvider(defaultProvider);
    setSelectedVoice(
      defaultProvider === "elevenlabs" && favoriteVoices.length > 0
        ? favoriteVoices[0].voiceId
        : defaultProvider === "vieneu"
          ? "default"
          : "amy",
    );
  }, [defaultProvider, favoriteVoices]);

  React.useEffect(() => {
    if (hasAiKey) {
      setTranslationMethod("ai");
    }
  }, [hasAiKey]);

  // Hook ElevenLabs API
  const {
    allVoices,
    generateWithElevenLabs,
    generateWithPiper,
  } = useElevenLabsApi({
    provider: ttsProvider,
    hasElevenLabsKey,
    settingsOpen,
    elevenLabsModel,
    defaultLlmProvider,
  });

  // VieNeu: server Python cục bộ tại localhost:8000
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

  const selectedClip = useMemo(() => {
    const clipId = selectedClipIds[0];
    return clipId ? getClip(clipId) : undefined;
  }, [getClip, selectedClipIds, project?.modifiedAt]);

  const selectedMedia = selectedClip
    ? getMediaItem(selectedClip.mediaId)
    : undefined;
  const canTranscribe =
    !!selectedClip &&
    !!selectedMedia &&
    (selectedMedia.type === "video" || selectedMedia.type === "audio");

  // Filter target subtitles and map their correct speak text for TTS
  const speakItems = useMemo(() => {
    if (subtitles.length === 0) return [];

    const speakList: Array<{ subtitle: Subtitle; text: string }> = [];

    // Check if there are any old-format paired translations in the subtitle list
    const hasOldFormatTranslations = subtitles.some(s => s.id.endsWith("-translated"));

    if (hasOldFormatTranslations) {
      // Handle backward-compatibility for old paired format
      const translatedSubs = subtitles.filter((s) => s.id.endsWith("-translated"));
      const originalSubs = subtitles.filter((s) => !s.id.endsWith("-translated"));

      let targetSubs = subtitles;
      if (ttsTargetType === "translated") {
        targetSubs = translatedSubs;
      } else if (ttsTargetType === "original") {
        targetSubs = originalSubs;
      } else {
        targetSubs = translatedSubs.length > 0 ? translatedSubs : originalSubs;
      }
      for (const s of targetSubs) {
        speakList.push({ subtitle: s, text: s.text });
      }
    } else {
      // Handle new single-layer bilingual format
      for (const s of subtitles) {
        if (ttsTargetType === "translated") {
          speakList.push({ subtitle: s, text: s.text });
        } else if (ttsTargetType === "original") {
          speakList.push({ subtitle: s, text: s.originalText || s.text });
        } else {
          speakList.push({ subtitle: s, text: s.text });
        }
      }
    }

    return speakList;
  }, [subtitles, ttsTargetType]);

  // Available Voices
  const availableVoices = useMemo(() => {
    if (ttsProvider === "piper") {
      return [
        { voiceId: "amy", name: "Amy (Female)" },
        { voiceId: "ryan", name: "Ryan (Male)" },
      ];
    }
    if (ttsProvider === "vieneu") {
      return [
        { voiceId: "default", name: "VieNeu Mặc định" },
        { voiceId: "Binh", name: "Bình (Nam miền Bắc)" },
        { voiceId: "Tuyen", name: "Tuyên (Nam miền Bắc)" },
        { voiceId: "Vinh", name: "Vĩnh (Nam miền Nam)" },
        { voiceId: "Ly", name: "Lý (Nữ miền Bắc)" },
        { voiceId: "Ngoc", name: "Ngọc (Nữ miền Bắc)" },
        { voiceId: "Doan", name: "Đoan (Nữ miền Nam)" },
        { voiceId: "custom_0525", name: "Giọng bé" },
      ];
    }
    // ElevenLabs voices
    const list = [...favoriteVoices];
    for (const v of allVoices) {
      if (!list.some((fav) => fav.voiceId === v.voice_id)) {
        list.push({ voiceId: v.voice_id, name: v.name });
      }
    }
    // Fallback if empty
    if (list.length === 0) {
      list.push({ voiceId: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Default)" });
    }
    return list;
  }, [ttsProvider, favoriteVoices, allVoices]);

  // Update selected voice when ttsProvider or availableVoices changes
  React.useEffect(() => {
    if (ttsProvider === "piper") {
      if (selectedVoice !== "amy" && selectedVoice !== "ryan") {
        setSelectedVoice("amy");
      }
    } else if (ttsProvider === "vieneu") {
      if (selectedVoice !== "default") {
        setSelectedVoice("default");
      }
    } else {
      if (availableVoices.length > 0 && !availableVoices.some(v => v.voiceId === selectedVoice)) {
        setSelectedVoice(availableVoices[0].voiceId);
      }
    }
  }, [ttsProvider, availableVoices, selectedVoice]);

  const getOrCreateTtsTrackId = useCallback(async (): Promise<string> => {
    const currentProject = useProjectStore.getState().project;
    const existing = currentProject.timeline.tracks.find(
      (track) => track.type === "audio" && track.name === "TTS",
    );
    if (existing) return existing.id;

    const existingTrackIds = new Set(
      currentProject.timeline.tracks.map((track) => track.id),
    );
    const result = await addTrack("audio");
    if (!result.success) {
      throw new Error(result.error?.message || "Failed to create TTS track");
    }

    const updatedProject = useProjectStore.getState().project;
    const newTrack = updatedProject.timeline.tracks.find(
      (track) => track.type === "audio" && !existingTrackIds.has(track.id),
    );
    if (!newTrack) {
      throw new Error("Could not find created TTS track");
    }

    useProjectStore.setState((state) => ({
      project: {
        ...state.project,
        timeline: {
          ...state.project.timeline,
          tracks: state.project.timeline.tracks.map((track) =>
            track.id === newTrack.id ? { ...track, name: "TTS" } : track,
          ),
        },
        modifiedAt: Date.now(),
      },
    }));

    return newTrack.id;
  }, [addTrack]);

  const handleImportSRT = useCallback(async (file: File) => {
    if (isImportingSRT) return;
    setIsImportingSRT(true);
    setImportSRTResult(null);
    setError(null);
    try {
      clearCaptions();
      const text = await file.text();
      const { subtitles: parsed, errors } = parseSRT(text);
      if (parsed.length === 0) {
        throw new Error(errors.length > 0 ? errors[0] : "No valid subtitles found in the SRT file.");
      }
      for (const subtitle of parsed) {
        await addSubtitle({
          ...subtitle,
          animationStyle,
        });
      }
      setImportSRTResult({ count: parsed.length });
      toast.success(`Imported ${parsed.length} subtitles from SRT file!`);
      if (errors.length > 0) {
        console.warn("[ImportSRT] Errors:", errors);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import SRT file.");
    } finally {
      setIsImportingSRT(false);
    }
  }, [isImportingSRT, addSubtitle, animationStyle]);

  const handleGenerateVoiceNarration = useCallback(async () => {
    if (speakItems.length === 0 || isGeneratingTts) return;

    setIsGeneratingTts(true);
    setTtsProgress({
      current: 0,
      total: speakItems.length,
      message: "Creating TTS track...",
    });

    try {
      const trackId = await getOrCreateTtsTrackId();
      let currentIdx = 0;

      for (const item of speakItems) {
        const subtitle = item.subtitle;
        const textToSpeak = item.text;
        if (!textToSpeak.trim()) {
          currentIdx++;
          continue;
        }

        setTtsProgress({
          current: currentIdx,
          total: speakItems.length,
          message: `Synthesizing segment ${currentIdx + 1}/${speakItems.length}...`,
        });

        // Call the TTS synthesis API — route to correct provider
        let blob: Blob;
        if (ttsProvider === "vieneu") {
          blob = await generateWithVieNeu(textToSpeak.trim(), selectedVoice, ttsSpeed);
        } else if (ttsProvider === "elevenlabs") {
          blob = await generateWithElevenLabs(textToSpeak.trim(), selectedVoice);
        } else {
          blob = await generateWithPiper(textToSpeak.trim(), selectedVoice, ttsSpeed);
        }

        const safeName = textToSpeak
          .trim()
          .slice(0, 32)
          .replace(/[\\/:*?"<>|]/g, "")
          .replace(/\s+/g, "_");
        const voiceName = ttsProvider === "piper" ? selectedVoice : ttsProvider === "vieneu" ? "VieNeu" : "ElevenLabs";
        const fileName = `${voiceName}_${safeName || "text"}_${Date.now()}.wav`;
        const file = new File([blob], fileName, { type: "audio/wav" });
        
        // Import into media assets
        const importResult = await importMedia(file);
        if (!importResult.success || !importResult.actionId) {
          throw new Error(
            importResult.error?.message || "Failed to import generated audio",
          );
        }

        // Add clip to the timeline
        const addResult = await addClip(
          trackId,
          importResult.actionId,
          subtitle.startTime,
        );
        if (!addResult.success) {
          throw new Error(
            addResult.error?.message || "Failed to place audio on timeline",
          );
        }

        currentIdx++;
      }

      setTtsProgress({
        current: speakItems.length,
        total: speakItems.length,
        message: "TTS Narration generated successfully!",
      });

      toast.success(`Successfully generated narration for ${speakItems.length} subtitles.`);

      setTimeout(() => {
        setTtsProgress(null);
      }, 3000);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to generate TTS Narration");
      setTtsProgress(null);
    } finally {
      setIsGeneratingTts(false);
    }
  }, [
    speakItems,
    isGeneratingTts,
    ttsProvider,
    selectedVoice,
    ttsSpeed,
    generateWithElevenLabs,
    generateWithPiper,
    generateWithVieNeu,
    getOrCreateTtsTrackId,
    importMedia,
    addClip,
  ]);

  const handleGenerateCaptions = useCallback(async () => {
    if (!selectedClip || !selectedMedia || isTranscribing) return;

    setError(null);
    setLastCaptionCount(null);
    setIsTranscribing(true);
    setProgress({
      phase: "extracting",
      progress: 0,
      message: "Preparing clip audio...",
    });

    try {
      clearCaptions();
      let aiConfig = undefined;
      if (targetLanguage !== "none" && translationMethod === "ai") {
        if (!isSessionUnlocked()) {
          throw new Error("API Keys are locked. Please unlock them in Settings > API Keys.");
        }
        const apiKey = await getSecret(aiProvider);
        if (!apiKey) {
          let providerLabel = "OpenAI";
          if (aiProvider === "anthropic") providerLabel = "Anthropic";
          if (aiProvider === "gemini") providerLabel = "Google Gemini";
          throw new Error(`API key for ${providerLabel} is not set. Please add it in Settings > API Keys.`);
        }
        aiConfig = {
          provider: aiProvider,
          apiKey,
          tone: aiTone,
          videoContext: videoContext.trim() || undefined,
          translationBranch,
          customBaseUrl:
            aiProvider === "openai"
              ? customOpenAiBaseUrl
              : aiProvider === "anthropic"
                ? customAnthropicBaseUrl
                : customGeminiBaseUrl,
          customModel:
            aiProvider === "openai"
              ? customOpenAiModel
              : aiProvider === "anthropic"
                ? customAnthropicModel
                : customGeminiModel,
        };
      }

      const transcriptionService = initializeTranscriptionService({
        apiEndpoint: `${OPENREEL_TRANSCRIBE_URL}/transcribe`,
        language: sourceLanguage !== "none" ? sourceLanguage : undefined,
        targetLanguage: targetLanguage !== "none" ? targetLanguage : undefined,
        translationMethod: targetLanguage !== "none" ? translationMethod : undefined,
        aiConfig,
      });

      const subtitlesResult = await transcriptionService.transcribeClip(
        selectedClip,
        selectedMedia,
        setProgress,
      );
      for (const subtitle of subtitlesResult) {
        await addSubtitle({
          ...subtitle,
          animationStyle,
        });
      }

      setLastCaptionCount(subtitlesResult.length);
      setHasWhisperCache(true);

      setProgress({
        phase: "complete",
        progress: 100,
        message: `Added ${subtitlesResult.length} captions`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caption generation failed");
      setProgress({
        phase: "error",
        progress: 0,
        message: err instanceof Error ? err.message : "Caption generation failed",
      });
    } finally {
      setIsTranscribing(false);
    }
  }, [
    addSubtitle,
    animationStyle,
    isTranscribing,
    selectedClip,
    selectedMedia,
    sourceLanguage,
    targetLanguage,
    translationMethod,
    aiProvider,
    aiTone,
    videoContext,
  ]);

  return (
    <div className="space-y-4 w-full min-w-0 max-w-full">
      <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/30">
        <Captions size={16} className="text-primary" />
        <div>
          <span className="text-[11px] font-medium text-text-primary">
            Auto-Caption
          </span>
          <p className="text-[9px] text-text-muted">
            Generate captions from the selected clip
          </p>
        </div>
      </div>

      {!canTranscribe && (
        <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <span className="text-[10px] text-amber-300">
            Select a video or audio clip on the timeline first.
          </span>
        </div>
      )}

      <div className="space-y-3 p-3 bg-background-tertiary rounded-lg">
        {/* Source Language */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Languages size={14} className="text-text-secondary" />
            <span className="text-[10px] text-text-secondary">
              Source Language
            </span>
          </div>
          <Select
            value={sourceLanguage}
            onValueChange={(val) => {
              setSourceLanguage(val);
              saveAutomationConfig({ sourceLanguage: val });
            }}
            disabled={isTranscribing}
          >
            <SelectTrigger className="w-auto min-w-[120px] bg-background-secondary border-border text-text-primary text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              {LANGUAGE_OPTIONS.map((language) => (
                <SelectItem key={language.code} value={language.code}>
                  {language.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Target Language */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-text-secondary">Translate To</span>
          <Select
            value={targetLanguage}
            onValueChange={(val) => {
              setTargetLanguage(val);
              const nextMethod = val === "none" ? "google" : translationMethod;
              if (val === "none") {
                setTranslationMethod("google");
              }
              saveAutomationConfig({ 
                targetLanguage: val, 
                translationMethod: nextMethod 
              });
            }}
            disabled={isTranscribing}
          >
            <SelectTrigger className="w-auto min-w-[120px] bg-background-secondary border-border text-text-primary text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              <SelectGroup>
                <SelectLabel className="text-[10px]">Caption language</SelectLabel>
                {TARGET_LANGUAGE_OPTIONS.map((language) => (
                  <SelectItem key={language.code} value={language.code}>
                    {language.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Translation Mode & AI Configs */}
        {targetLanguage !== "none" && (
          <div className="mt-2 p-2 bg-background-secondary/50 rounded-lg border border-border/30 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-text-secondary">Translation Mode</span>
              <Select
                value={translationMethod}
                onValueChange={(val: "google" | "ai") => {
                  setTranslationMethod(val);
                  saveAutomationConfig({ translationMethod: val });
                }}
                disabled={isTranscribing}
              >
                <SelectTrigger className="w-auto min-w-[120px] bg-background-secondary border-border text-text-primary text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background-secondary border-border">
                  <SelectItem value="google">Google Translate</SelectItem>
                  <SelectItem value="ai">AI Contextual Translation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {translationMethod === "google" && (
              <div className="flex items-start gap-1.5 p-1.5 bg-primary/5 rounded border border-primary/20 mt-1">
                <Sparkles size={10} className="text-primary shrink-0 mt-0.5" />
                <p className="text-[9px] text-text-secondary leading-tight">
                  Google Translate dịch từng phân đoạn riêng lẻ nên sẽ rất thô. Chọn <strong>AI Contextual Translation</strong> để dịch thoát ý và tự nhiên theo ngữ cảnh video.
                </p>
              </div>
            )}

            {translationMethod === "ai" && (
              <>
                {/* AI Provider */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] text-text-secondary">AI Provider</span>
                  <Select
                    value={aiProvider}
                    onValueChange={(val: "openai" | "anthropic" | "gemini") => {
                      setAiProvider(val);
                      saveAutomationConfig({ aiProvider: val });
                    }}
                    disabled={isTranscribing}
                  >
                    <SelectTrigger className="w-auto min-w-[120px] bg-background-secondary border-border text-text-primary text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background-secondary border-border">
                      <SelectItem value="openai">OpenAI (GPT-4o Mini)</SelectItem>
                      <SelectItem value="anthropic">Anthropic (Claude Haiku)</SelectItem>
                      <SelectItem value="gemini">Google Gemini (Gemini 1.5 Flash)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* AI Tone */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] text-text-secondary">AI Tone/Style</span>
                  <Select
                    value={aiTone}
                    onValueChange={(val) => {
                      setAiTone(val);
                      saveAutomationConfig({ aiTone: val });
                    }}
                    disabled={isTranscribing}
                  >
                    <SelectTrigger className="w-auto min-w-[120px] bg-background-secondary border-border text-text-primary text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background-secondary border-border">
                      {TONE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Video Context (Optional) */}
                <div className="space-y-1">
                  <span className="text-[10px] text-text-secondary block">Chủ đề / Ngữ cảnh Video (Tùy chọn)</span>
                  <input
                    type="text"
                    value={videoContext}
                    onChange={(e) => {
                      const val = e.target.value;
                      setVideoContext(val);
                      saveAutomationConfig({ videoContext: val });
                    }}
                    disabled={isTranscribing}
                    placeholder="VD: review điện thoại iPhone, vlog nấu ăn, tin tức thời sự..."
                    className="w-full bg-background border border-border/80 rounded px-2 py-1.5 text-[10px] text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors"
                  />
                </div>

                {/* Glossary (Optional) */}
                <div className="space-y-1 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-secondary block">Từ điển / Glossary (Tùy chọn)</span>
                    <span className="text-[8px] text-text-muted">Định dạng: Key:Val, Key2:Val2</span>
                  </div>

                {/* AI Temperature Slider (Dynamic) */}
                <div className="space-y-1.5 mt-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-text-secondary">AI Temperature (Độ sáng tạo)</span>
                    <span className="text-primary font-medium">{aiTemperature.toFixed(2)}</span>
                  </div>
                  <Slider
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={[aiTemperature]}
                    onValueChange={(value) => {
                      const val = value[0];
                      setAiTemperature(val);
                      saveAutomationConfig({ aiTemperature: val });
                    }}
                    disabled={isTranscribing}
                  />
                  <span className="text-[8px] text-text-muted block leading-tight">
                    Mức thấp (0.0) sẽ dịch ổn định, bám sát nghĩa gốc. Mức cao (0.5 - 1.0) cho phép AI viết bay bổng, tự nhiên hơn. Bị giới hạn tối thiểu 0.0.
                  </span>
                </div>

                {/* A/B Optimization Test */}
                <div className="flex items-center justify-between gap-3 mt-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-text-secondary">Tối ưu hóa Token (A/B Test)</span>
                    <span className="text-[8px] text-text-muted">Nhánh B cắt bớt context và luật prompt</span>
                  </div>
                  <Select
                    value={translationBranch}
                    onValueChange={(val: "A" | "B") => {
                      setTranslationBranch(val);
                      saveAutomationConfig({ translationBranch: val });
                    }}
                    disabled={isTranscribing}
                  >
                    <SelectTrigger className="w-auto min-w-[120px] bg-background-secondary border-border text-text-primary text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background-secondary border-border">
                      <SelectItem value="A">Nhánh A (Đầy đủ)</SelectItem>
                      <SelectItem value="B">Nhánh B (Tối ưu)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                  <input
                    type="text"
                    value={glossaryText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGlossaryText(val);
                      saveAutomationConfig({ glossaryText: val });
                    }}
                    disabled={isTranscribing}
                    placeholder="VD: Ming:Lý Vô Địch, Silas:Tây Lạp Tư, HP:lượng máu..."
                    className="w-full bg-background border border-border/80 rounded px-2 py-1.5 text-[10px] text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors"
                  />
                </div>

                {!isSessionUnlocked() && (
                  <div className="flex items-center gap-1.5 p-1 bg-amber-500/10 rounded border border-amber-500/20">
                    <AlertCircle size={10} className="text-amber-400 shrink-0" />
                    <span className="text-[9px] text-amber-300">
                      Keys locked. Please unlock in Settings &gt; API Keys.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Animation */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-text-secondary">Animation</span>
          <Select
            value={animationStyle}
            onValueChange={(value) => {
              const val = value as CaptionAnimationStyle;
              setAnimationStyle(val);
              saveAutomationConfig({ animationStyle: val });
            }}
            disabled={isTranscribing}
          >
            <SelectTrigger className="w-auto min-w-[120px] bg-background-secondary border-border text-text-primary text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              {CAPTION_ANIMATION_STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {getAnimationStyleDisplayName(style)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {progress && (
        <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
          <div className="flex items-center gap-2">
            {isTranscribing && (
              <Loader2 size={12} className="animate-spin text-primary" />
            )}
            <span className="text-[10px] text-text-primary">
              {progress.message}
            </span>
          </div>
          <div className="h-1.5 bg-background-secondary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                progress.phase === "error"
                  ? "bg-red-500"
                  : progress.phase === "complete"
                    ? "bg-green-500"
                    : "bg-primary"
              }`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle size={14} className="text-red-400" />
          <span className="text-[10px] text-red-400">{error}</span>
        </div>
      )}

      {lastCaptionCount !== null && !error && (
        <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
          <span className="text-[10px] text-green-300">
            Added {lastCaptionCount} captions to the preview.
          </span>
        </div>
      )}

      <div className="space-y-2">
        {hasWhisperCache && (
          <button
            onClick={handleDownloadWhisperCache}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-colors rounded-lg mb-2"
            title="Tải xuống tệp phản hồi JSON gốc của Whisper để phân tích lỗi sắp xếp"
          >
            <Download size={14} className="text-amber-400" />
            <span className="text-[11px] font-medium text-amber-300">Download Raw Whisper JSON</span>
          </button>
        )}

        <button
          onClick={handleGenerateCaptions}
          disabled={!canTranscribe || isTranscribing}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTranscribing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Captions size={16} />
          )}
          <span className="text-[11px] font-medium">
            {isTranscribing ? "Generating..." : "Generate Captions"}
          </span>
        </button>

        {hasSubtitles && (
          <div className="space-y-2 w-full">
            <div className="flex gap-2 w-full">
              <button
                onClick={handleExportSRT}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-background-secondary border border-border text-text-primary rounded-lg hover:bg-background-tertiary transition-colors"
                title="Xuất tệp phụ đề SRT"
              >
                <Download size={14} />
                <span className="text-[11px] font-medium">Export SRT</span>
              </button>
              <button
                onClick={handleExportTXT}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-background-secondary border border-border text-text-primary rounded-lg hover:bg-background-tertiary transition-colors"
                title="Xuất văn bản thô dạng TXT"
              >
                <FileText size={14} className="text-primary" />
                <span className="text-[11px] font-medium">Export TXT</span>
              </button>
            </div>
            <div className="flex gap-2 w-full">
              <button
                onClick={handleCopyTranscript}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-background-secondary border border-border text-text-primary rounded-lg hover:bg-background-tertiary transition-colors"
                title="Sao chép toàn bộ văn bản transcribe"
              >
                <Copy size={14} className="text-teal-400" />
                <span className="text-[11px] font-medium">Copy Text</span>
              </button>
              <button
                onClick={() => {
                  clearCaptions();
                  toast.success("Cleared all captions and subtitles successfully!");
                }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
              >
                <Trash2 size={14} />
                <span className="text-[11px] font-medium">Clear All</span>
              </button>
            </div>
          </div>
        )}

        {/* Import SRT */}
        <div>
          <label
            htmlFor="import-srt-input"
            className={[
              "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border transition-colors",
              isImportingSRT
                ? "bg-background-secondary/50 border-border/30 text-text-muted cursor-not-allowed"
                : "bg-background-secondary border-border text-text-primary hover:bg-background-tertiary cursor-pointer"
            ].join(" ")}
          >
            {isImportingSRT ? (
              <Loader2 size={14} className="animate-spin" />
            ) : importSRTResult ? (
              <CheckCircle2 size={14} className="text-green-400" />
            ) : (
              <Upload size={14} />
            )}
            <span className="text-[11px] font-medium">
              {isImportingSRT
                ? "Importing..."
                : importSRTResult
                  ? `Imported ${importSRTResult.count} subtitles`
                  : "Import SRT"}
            </span>
          </label>
          <input
            id="import-srt-input"
            type="file"
            accept=".srt"
            className="hidden"
            disabled={isImportingSRT}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleImportSRT(file);
                e.target.value = "";
              }
            }}
          />
          <p className="text-[9px] text-text-muted text-center mt-1">
            Import .srt — timestamps sync automatically to timeline
          </p>
        </div>
      </div>

      {/* Voice Narration Section */}
      <hr className="border-border/30 my-4" />

      <div className="space-y-4 p-3 bg-background-tertiary rounded-lg border border-border/10">
        <div className="flex items-center gap-2">
          <Volume2 size={16} className="text-primary" />
          <div>
            <span className="text-[11px] font-medium text-text-primary">
              Voice Narration (Thuyết minh)
            </span>
            <p className="text-[9px] text-text-muted">
              Auto-generate voiceovers synced with subtitles
            </p>
          </div>
        </div>

        {!hasSubtitles ? (
          <div className="flex items-start gap-2 p-2 bg-background-secondary/50 rounded-lg">
            <Volume2 size={12} className="text-text-muted mt-0.5 shrink-0" />
            <span className="text-[10px] text-text-muted">
              Generate subtitles first to configure voice narration.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Target Subtitles Option */}
            {(subtitles.some(s => s.id.endsWith("-translated")) || subtitles.some(s => s.originalText)) && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-text-secondary">Read Target</span>
                <Select
                  value={ttsTargetType}
                  onValueChange={(val: "original" | "translated" | "auto") => {
                    setTtsTargetType(val);
                    saveAutomationConfig({ ttsTargetType: val });
                  }}
                  disabled={isGeneratingTts}
                >
                  <SelectTrigger className="w-auto min-w-[120px] bg-background-secondary border-border text-text-primary text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background-secondary border-border">
                    <SelectItem value="auto">Auto (Translated first)</SelectItem>
                    <SelectItem value="translated">Translated Subtitles Only</SelectItem>
                    <SelectItem value="original">Original Subtitles Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* TTS Provider */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-text-secondary">Voice Engine</span>
              <Select
                value={ttsProvider}
                onValueChange={(val: TtsProvider) => {
                  setTtsProvider(val);
                  saveAutomationConfig({ ttsProvider: val });
                }}
                disabled={isGeneratingTts}
              >
                <SelectTrigger className="w-auto min-w-[120px] bg-background-secondary border-border text-text-primary text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background-secondary border-border">
                  <SelectItem value="piper">Piper (Local / Free)</SelectItem>
                  <SelectItem value="elevenlabs">ElevenLabs (Premium AI)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Voice */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-text-secondary">Voice</span>
              <Select
                value={selectedVoice}
                onValueChange={(val) => {
                  setSelectedVoice(val);
                  saveAutomationConfig({ ttsVoiceId: val });
                }}
                disabled={isGeneratingTts}
              >
                <SelectTrigger className="w-auto min-w-[120px] bg-background-secondary border-border text-text-primary text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background-secondary border-border">
                  {availableVoices.map((voice) => (
                    <SelectItem key={voice.voiceId} value={voice.voiceId}>
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Speed Slider */}
            {ttsProvider === "piper" && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-text-secondary">Speech Speed</span>
                  <span className="text-primary font-medium">{ttsSpeed.toFixed(1)}x</span>
                </div>
                <Slider
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={[ttsSpeed]}
                  onValueChange={(value) => {
                    const val = value[0];
                    setTtsSpeed(val);
                    saveAutomationConfig({ ttsSpeed: val });
                  }}
                  disabled={isGeneratingTts}
                />
              </div>
            )}

            {/* TTS Generation Progress Bar */}
            {ttsProgress && (
              <div className="space-y-2 p-2 bg-background-secondary rounded-lg">
                <div className="flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                  <span className="text-[9px] text-text-primary">
                    {ttsProgress.message}
                  </span>
                </div>
                <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(ttsProgress.current / ttsProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleGenerateVoiceNarration}
              disabled={speakItems.length === 0 || isGeneratingTts}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingTts ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              <span className="text-[11px] font-medium">
                {isGeneratingTts ? "Generating..." : `Generate Voice Narration (${speakItems.length})`}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoCaptionPanel;
