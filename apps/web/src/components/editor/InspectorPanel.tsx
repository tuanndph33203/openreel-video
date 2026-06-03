import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Zap, Captions, Loader2, Sparkles, Trash2, FlipHorizontal, FlipVertical, Upload } from "lucide-react";
import { useProjectStore } from "../../stores/project-store";
import { useTranslation } from "../../hooks/use-translation";
import { useTimelineStore } from "../../stores/timeline-store";
import { useUIStore } from "../../stores/ui-store";
import { useEngineStore } from "../../stores/engine-store";
import type { Transform, EditingTemplatePrimitive } from "@openreel/core";
import {
  ChromaKeyEngine,
  initializeTranscriptionService,
  type WhisperTranscriptionProgress,
  type CaptionAnimationStyle,
  CAPTION_ANIMATION_STYLES,
  getAnimationStyleDisplayName,
} from "@openreel/core";
import { OPENREEL_TRANSCRIBE_URL } from "../../config/api-endpoints";
import { mergeEditingTemplateControlValues } from "./panels/EditingTemplateControls";
import {
  getAudioBridgeEffects,
  initializeAudioBridgeEffects,
  DEFAULT_NOISE_REDUCTION,
} from "../../bridges/audio-bridge-effects";
import { toast } from "../../stores/notification-store";
import {
  FONT_CATEGORIES,
  FONT_FILE_ACCEPT,
  registerCustomFont,
  useCustomFonts,
} from "./inspector/font-options";
import { getNoiseReductionPreset } from "./inspector/noise-reduction-presets";
import {
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@openreel/ui";
import {
  getTabsForClipType,
  getTabIdsForClipType,
  type InspectorClipType,
  type InspectorTabId,
} from "./inspector/clip-tabs.config";
import { InspectorTabs } from "./inspector/shell/InspectorTabs";
import { InspectorClipHeader } from "./inspector/shell/InspectorClipHeader";
import { InspectorTabPanel } from "./inspector/shell/InspectorTabPanel";
import { InspectorTabErrorBoundary } from "./inspector/shell/InspectorTabErrorBoundary";
import { InspectorSection } from "./inspector/shell/InspectorSection";
import { ColorTab } from "./inspector/tabs/ColorTab";
import { AudioTab } from "./inspector/tabs/AudioTab";
import { TransformTab } from "./inspector/tabs/TransformTab";
import { SpeedTab } from "./inspector/tabs/SpeedTab";
import { AnimateTab } from "./inspector/tabs/AnimateTab";
import { StyleTab } from "./inspector/tabs/StyleTab";
import { EffectsTab } from "./inspector/tabs/EffectsTab";
import { AiTab } from "./inspector/tabs/AiTab";

// Initialize engines as singletons
const chromaKeyEngine = new ChromaKeyEngine({ width: 1920, height: 1080 });

const Section = InspectorSection;

const EmptyState: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center opacity-50">
      <p className="text-sm text-text-secondary mb-2">{t('inspector.no_selection')}</p>
      <p className="text-xs text-text-muted">
        {t('inspector.select_clip_hint')}
      </p>
    </div>
  );
};

export const InspectorPanel: React.FC = () => {
  const { t } = useTranslation();
  // Stores
  const {
    getClip,
    getMediaItem,
    addSubtitle,
    importSRT,
    updateSubtitle,
    getSubtitle,
    getEditingTemplate,
    updateEditingTemplateApplication,
    removeEditingTemplateApplication,
  } = useProjectStore();
  const project = useProjectStore((state) => state.project);
  const { getSelectedClipIds } = useUIStore();
  const selectedItems = useUIStore((state) => state.selectedItems);
  const effectApplicationClipId = useUIStore(
    (state) => state.effectApplicationClipId,
  );
  const startEffectApplication = useUIStore(
    (state) => state.startEffectApplication,
  );
  const finishEffectApplication = useUIStore(
    (state) => state.finishEffectApplication,
  );
  const selectedClipIds = getSelectedClipIds();
  const pausePlayback = useTimelineStore((state) => state.pause);
  const lockPlayback = useTimelineStore((state) => state.lockPlayback);
  const unlockPlayback = useTimelineStore((state) => state.unlockPlayback);
  const getTitleEngine = useEngineStore((state) => state.getTitleEngine);
  const getGraphicsEngine = useEngineStore((state) => state.getGraphicsEngine);

  // Transcription state
  const [transcriptionProgress, setTranscriptionProgress] =
    useState<WhisperTranscriptionProgress | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("none");
  const [defaultAnimationStyle, setDefaultAnimationStyle] =
    useState<CaptionAnimationStyle>("word-highlight");
  const [expandedRecipeApplicationId, setExpandedRecipeApplicationId] =
    useState<string | null>(null);
  const [recipeControlValues, setRecipeControlValues] = useState<
    Record<string, Record<string, EditingTemplatePrimitive>>
  >({});
  const srtInputRef = useRef<HTMLInputElement>(null);
  const subtitleFontInputRef = useRef<HTMLInputElement>(null);
  const customFonts = useCustomFonts();

  useEffect(() => {
    setExpandedRecipeApplicationId(null);
  }, [selectedClipIds.join("|")]);

  // Check if a subtitle is selected
  const selectedSubtitleId = useMemo(() => {
    const subtitleSelection = selectedItems.find(
      (item) => item.type === "subtitle",
    );
    return subtitleSelection?.id || null;
  }, [selectedItems]);

  const selectedSubtitle = useMemo(() => {
    if (!selectedSubtitleId) return null;
    return getSubtitle(selectedSubtitleId) || null;
  }, [selectedSubtitleId, getSubtitle, project.timeline.subtitles]);

  const selectedTimelineClip = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    return getClip(selectedClipIds[0]) || null;
  }, [getClip, project.modifiedAt, selectedClipIds]);

  // Get selected clip (check regular clips, text clips, and shape clips)
  const selectedClip = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    const clipId = selectedClipIds[0];
    const regularClip = getClip(clipId);
    if (regularClip) return regularClip;
    const titleEngine = getTitleEngine();
    const textClip = titleEngine?.getTextClip(clipId);
    if (textClip) {
      return {
        id: textClip.id,
        mediaId: `text-${textClip.id}`,
        startTime: textClip.startTime,
        duration: textClip.duration,
        inPoint: 0,
        outPoint: textClip.duration,
        transform: textClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        text: textClip.text,
        trackId: textClip.trackId,
      };
    }
    const graphicsEngine = getGraphicsEngine();
    const shapeClip = graphicsEngine?.getShapeClip(clipId);
    if (shapeClip) {
      return {
        id: shapeClip.id,
        mediaId: `shape-${shapeClip.id}`,
        startTime: shapeClip.startTime,
        duration: shapeClip.duration,
        inPoint: 0,
        outPoint: shapeClip.duration,
        transform: shapeClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        shapeType: shapeClip.shapeType,
        trackId: shapeClip.trackId,
      };
    }
    const svgClip = graphicsEngine?.getSVGClip(clipId);
    if (svgClip) {
      return {
        id: svgClip.id,
        mediaId: `svg-${svgClip.id}`,
        startTime: svgClip.startTime,
        duration: svgClip.duration,
        inPoint: 0,
        outPoint: svgClip.duration,
        transform: svgClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        svgContent: svgClip.svgContent,
        trackId: svgClip.trackId,
      };
    }
    const stickerClip = graphicsEngine?.getStickerClip(clipId);
    if (stickerClip) {
      return {
        id: stickerClip.id,
        mediaId: `sticker-${stickerClip.id}`,
        startTime: stickerClip.startTime,
        duration: stickerClip.duration,
        inPoint: 0,
        outPoint: stickerClip.duration,
        transform: stickerClip.transform || {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        effects: [],
        imageUrl: stickerClip.imageUrl,
        trackId: stickerClip.trackId,
      };
    }
    return null;
  }, [
    selectedClipIds,
    getClip,
    getTitleEngine,
    getGraphicsEngine,
    project.modifiedAt,
  ]);

  const selectedTextClipIds = useMemo(() => {
    const titleEngine = getTitleEngine();
    if (!titleEngine || selectedClipIds.length < 2) return [];

    const textIds = selectedClipIds.filter((id) => titleEngine.getTextClip(id));
    return textIds.length === selectedClipIds.length ? textIds : [];
  }, [selectedClipIds, getTitleEngine, project.modifiedAt]);

  const selectedAdjustableClips = useMemo(() => {
    return selectedClipIds
      .map((id) => getClip(id))
      .filter((clip): clip is Clip => !!clip);
  }, [selectedClipIds, getClip, project.modifiedAt]);

  // Force re-render trigger - increment to force recalculation of engine values
  const [updateCounter, forceUpdate] = React.useReducer((x) => x + 1, 0);

  // Get current values from engines - recalculate when updateCounter changes
  const clipId = selectedClip?.id || "";

  const chromaKeySettings = useMemo(() => {
    return clipId ? chromaKeyEngine.getSettings(clipId) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, updateCounter]);

  // Get updateClipTransform from store
  const updateClipTransform = useProjectStore(
    (state) => state.updateClipTransform,
  );

  // Transform handlers
  const handleTransformChange = useCallback(
    (changes: Partial<Transform>) => {
      if (!selectedClip) return;
      updateClipTransform(selectedClip.id, changes);
    },
    [selectedClip, updateClipTransform],
  );

  // Chroma Key handlers using ChromaKeyEngine
  const handleChromaKeyToggle = useCallback(
    (enabled: boolean) => {
      if (!selectedClip) return;
      if (enabled) {
        chromaKeyEngine.enableChromaKey(selectedClip.id);
      } else {
        chromaKeyEngine.disableChromaKey(selectedClip.id);
      }
      forceUpdate();
    },
    [selectedClip],
  );

  const handleKeyColorChange = useCallback(
    (hexColor: string) => {
      if (!selectedClip) return;
      const hex = hexColor.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      chromaKeyEngine.setKeyColor(selectedClip.id, { r, g, b });
      forceUpdate();
    },
    [selectedClip],
  );

  const handleToleranceChange = useCallback(
    (tolerance: number) => {
      if (!selectedClip) return;
      chromaKeyEngine.setTolerance(selectedClip.id, tolerance / 100);
      forceUpdate();
    },
    [selectedClip],
  );

  const {
    addVideoEffect,
    updateVideoEffect,
    getAudioEffects,
    updateAudioEffect,
    toggleAudioEffect,
  } = useProjectStore();

  const [isEnhancingAudio, setIsEnhancingAudio] = useState(false);
  const [audioEnhanced, setAudioEnhanced] = useState(false);
  const isApplyingSelectedClipEffect =
    effectApplicationClipId !== null && effectApplicationClipId === selectedClip?.id;

  const waitForEffectApplicationPaint = useCallback(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
    [],
  );

  const applyClipEffectWithPlaybackLock = useCallback(
    async (
      clipId: string,
      label: string,
      apply: () => void | Promise<void>,
    ) => {
      pausePlayback();
      lockPlayback(label);
      startEffectApplication(clipId, label);

      try {
        await waitForEffectApplicationPaint();
        await apply();
        window.dispatchEvent(new CustomEvent("openreel:preview-invalidate"));
        await waitForEffectApplicationPaint();
      } finally {
        finishEffectApplication();
        unlockPlayback();
      }
    },
    [
      finishEffectApplication,
      lockPlayback,
      pausePlayback,
      startEffectApplication,
      unlockPlayback,
      waitForEffectApplicationPaint,
    ],
  );

  const handleRemoveBackground = useCallback(() => {
    if (!selectedClip) return;
    void applyClipEffectWithPlaybackLock(
      selectedClip.id,
      "Applying background removal",
      () => {
        chromaKeyEngine.enableChromaKey(selectedClip.id);
        chromaKeyEngine.setKeyColor(selectedClip.id, { r: 0, g: 1, b: 0 });
        chromaKeyEngine.setTolerance(selectedClip.id, 0.35);
        forceUpdate();
      },
    );
  }, [applyClipEffectWithPlaybackLock, forceUpdate, selectedClip]);

  const handleEnhanceAudio = useCallback(async () => {
    if (!selectedClip) return;
    setIsEnhancingAudio(true);
    try {
      await applyClipEffectWithPlaybackLock(
        selectedClip.id,
        "Applying audio cleanup",
        async () => {
          await initializeAudioBridgeEffects();
          const bridge = getAudioBridgeEffects();
          const noiseCleanupConfig = {
            ...DEFAULT_NOISE_REDUCTION,
            ...getNoiseReductionPreset("speech").config,
          };

          const existingNoiseReduction = getAudioEffects(selectedClip.id).find(
            (effect) => effect.type === "noiseReduction",
          );

          if (existingNoiseReduction) {
            updateAudioEffect(
              selectedClip.id,
              existingNoiseReduction.id,
              noiseCleanupConfig as unknown as Record<string, unknown>,
            );
            toggleAudioEffect(selectedClip.id, existingNoiseReduction.id, true);
          } else {
            const result = bridge.applyNoiseReduction(
              selectedClip.id,
              noiseCleanupConfig,
            );

            if (!result.success) {
              throw new Error(result.error ?? "Failed to apply noise cleanup");
            }
          }

          setAudioEnhanced(true);
          setTimeout(() => setAudioEnhanced(false), 2000);
          toast.success(
            "Noise cleanup applied",
            "Fine-tune or switch presets in Background Noise Removal.",
          );

          forceUpdate();
        },
      );
    } catch (error) {
      console.error("Failed to enhance audio:", error);
      toast.error(
        "Could not clean up audio",
        error instanceof Error
          ? error.message
          : "Noise cleanup could not be applied to this clip.",
      );
    } finally {
      setIsEnhancingAudio(false);
    }
  }, [
    applyClipEffectWithPlaybackLock,
    selectedClip,
    forceUpdate,
    getAudioEffects,
    toggleAudioEffect,
    updateAudioEffect,
  ]);

  const handleAutoColor = useCallback(async () => {
    if (!selectedClip) return;
    await applyClipEffectWithPlaybackLock(
      selectedClip.id,
      "Applying auto color",
      () => {
        addVideoEffect(selectedClip.id, "saturation");
        addVideoEffect(selectedClip.id, "contrast");
        addVideoEffect(selectedClip.id, "brightness");
        const effects = useProjectStore.getState().getVideoEffects(selectedClip.id);
        const satEffect = effects.find((e) => e.type === "saturation");
        const contEffect = effects.find((e) => e.type === "contrast");
        const brightEffect = effects.find((e) => e.type === "brightness");
        if (satEffect) {
          updateVideoEffect(selectedClip.id, satEffect.id, { value: 1.15 });
        }
        if (contEffect) {
          updateVideoEffect(selectedClip.id, contEffect.id, { value: 1.1 });
        }
        if (brightEffect) {
          updateVideoEffect(selectedClip.id, brightEffect.id, { value: 5 });
        }
      },
    );
  }, [
    addVideoEffect,
    applyClipEffectWithPlaybackLock,
    selectedClip,
    updateVideoEffect,
  ]);

  const handleGenerateSubtitles = useCallback(async () => {
    if (!selectedClip || isTranscribing) return;

    const mediaItem = getMediaItem(selectedClip.mediaId);
    if (!mediaItem) {
      console.error("[Subtitles] No media item found for clip");
      return;
    }

    setIsTranscribing(true);
    setTranscriptionProgress({
      phase: "extracting",
      progress: 0,
      message: "Preparing audio...",
    });

    try {
      const transcriptionService = initializeTranscriptionService({
        apiEndpoint: `${OPENREEL_TRANSCRIBE_URL}/transcribe`,
        targetLanguage: targetLanguage !== "none" ? targetLanguage : undefined,
      });

      const regularClip = getClip(selectedClip.id);
      if (!regularClip) {
        throw new Error("Could not find clip data");
      }

      const subtitles = await transcriptionService.transcribeClip(
        regularClip,
        mediaItem,
        setTranscriptionProgress,
      );

      for (const subtitle of subtitles) {
        addSubtitle({
          ...subtitle,
          animationStyle: defaultAnimationStyle,
        });
      }

      setTranscriptionProgress({
        phase: "complete",
        progress: 100,
        message: `Added ${subtitles.length} subtitles`,
      });

      setTimeout(() => {
        setTranscriptionProgress(null);
        setIsTranscribing(false);
      }, 2000);
    } catch (error) {
      console.error("[Subtitles] Transcription failed:", error);
      setTranscriptionProgress({
        phase: "error",
        progress: 0,
        message:
          error instanceof Error ? error.message : "Transcription failed",
      });
      setTimeout(() => {
        setTranscriptionProgress(null);
        setIsTranscribing(false);
      }, 3000);
    }
  }, [
    selectedClip,
    isTranscribing,
    getMediaItem,
    getClip,
    addSubtitle,
    defaultAnimationStyle,
    targetLanguage,
  ]);

  const handleVolumeChange = useCallback(
    (volumePercentage: number) => {
      const volumeValue = volumePercentage / 100;
      const targetClipIds = selectedAdjustableClips.map((c) => c.id);

      const tracks = project.timeline.tracks.map((track) => {
        let trackChanged = false;
        const newClips = track.clips.map((c) => {
          // Case 1: The clip itself is in our selection
          if (targetClipIds.includes(c.id)) {
            trackChanged = true;
            return {
              ...c,
              volume: volumeValue,
            };
          }

          // Case 2: The clip is an audio clip linked to one of our selected video clips
          if (track.type === "audio") {
            const linkedClip = selectedAdjustableClips.find((tc) => tc.mediaId === c.mediaId);
            if (linkedClip) {
              trackChanged = true;
              return {
                ...c,
                volume: volumeValue,
              };
            }
          }

          return c;
        });
        return trackChanged ? { ...track, clips: newClips } : track;
      });

      useProjectStore.setState({
        project: {
          ...project,
          timeline: { ...project.timeline, tracks },
          modifiedAt: Date.now(),
        },
      });
    },
    [selectedAdjustableClips, project],
  );

  const handleSRTImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const srtContent = await file.text();
        const result = await importSRT(srtContent);

        if (result.success) {
          if (result.errors.length > 0) {
            toast.warning(
              "SRT imported with warnings",
              `${result.errors.length} subtitle segment(s) were skipped.`,
            );
          } else {
            toast.success("SRT imported", "Subtitles were added to the Captions track.");
          }
        } else {
          toast.error("SRT import failed", result.errors[0] || "No valid subtitles found.");
        }
      } catch {
        toast.error("SRT import failed", "Could not read the selected subtitle file.");
      } finally {
        event.target.value = "";
      }
    },
    [importSRT],
  );

  const handleSubtitleFontUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !selectedSubtitle) return;

      const result = await registerCustomFont(file);
      if (!result.success) {
        toast.error("Font upload failed", result.error ?? "Unknown error.");
      } else {
        updateSubtitle(selectedSubtitle.id, {
          style: {
            ...(selectedSubtitle.style || {}),
            fontFamily: result.fontFamily,
          } as typeof selectedSubtitle.style,
        });
        toast.success("Custom font uploaded", `${result.fontFamily} is ready to use.`);
      }

      event.target.value = "";
    },
    [selectedSubtitle, updateSubtitle],
  );

  // Default transform
  const defaultTransform: Transform = {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
    anchor: { x: 0.5, y: 0.5 },
    borderRadius: 0,
  };
  const transform = selectedClip?.transform || defaultTransform;

  // Derive UI state from engines
  const chromaKeyEnabled = chromaKeySettings?.enabled || false;
  const keyColor = chromaKeySettings
    ? `#${Math.round(chromaKeySettings.keyColor.r * 255)
        .toString(16)
        .padStart(2, "0")}${Math.round(chromaKeySettings.keyColor.g * 255)
        .toString(16)
        .padStart(2, "0")}${Math.round(chromaKeySettings.keyColor.b * 255)
        .toString(16)
        .padStart(2, "0")}`
    : "#00ff00";
  const tolerance = (chromaKeySettings?.tolerance || 0.3) * 100;

  /**
   * Detect clip type based on track type and clip properties
   */
  const clipType = useMemo(() => {
    if (!selectedClip) return null;

    // Check mediaId prefix first for text, shape, and SVG clips (they may not be in timeline tracks)
    if (selectedClip.mediaId.startsWith("text-")) {
      return "text";
    }

    if (selectedClip.mediaId.startsWith("shape-")) {
      return "shape";
    }

    if (selectedClip.mediaId.startsWith("svg-")) {
      return "svg";
    }

    if (
      selectedClip.mediaId.startsWith("sticker-") ||
      selectedClip.mediaId.startsWith("emoji-")
    ) {
      return "sticker";
    }

    // Find the track this clip belongs to
    const track = project.timeline.tracks.find((t) =>
      t.clips.some((c) => c.id === selectedClip.id),
    );

    if (!track) return "video";

    // Check for clip types based on track type and media
    const mediaItem = project.mediaLibrary.items.find(
      (item) => item.id === selectedClip.mediaId,
    );

    if (track.type === "audio") {
      return "audio";
    }

    if (track.type === "image" || mediaItem?.type === "image") {
      return "image";
    }

    // Default to video for video tracks
    return "video";
  }, [selectedClip, project.timeline.tracks, project.mediaLibrary.items]);

  /**
   * Determine which sections to show based on clip type
   */
  const showVideoEffects = clipType === "video" || clipType === "image";
  const showColorGrading = clipType === "video" || clipType === "image";
  const showAudioEffects = clipType === "video" || clipType === "audio";
  const showTextSection = clipType === "text";
  const showShapeSection = clipType === "shape";
  const showSVGSection = clipType === "svg";
  const selectedNoiseReductionEffect = selectedTimelineClip?.audioEffects?.find(
    (effect) => effect.type === "noiseReduction",
  );
  const noiseReductionSectionTitle = selectedNoiseReductionEffect
    ? selectedNoiseReductionEffect.enabled
      ? "Background Noise Removal (Active)"
      : "Background Noise Removal (Configured)"
    : "Background Noise Removal";
  const appliedEditingTemplates =
    selectedTimelineClip?.metadata?.appliedTemplates || [];
  const handleRecipeControlChange = useCallback(
    (
      applicationId: string,
      controlId: string,
      value: EditingTemplatePrimitive,
    ) => {
      setRecipeControlValues((current) => ({
        ...current,
        [applicationId]: {
          ...(current[applicationId] || {}),
          [controlId]: value,
        },
      }));
    },
    [],
  );
  const handleToggleRecipeControls = useCallback(
    (applicationId: string, templateId: string, controlValues?: Record<string, unknown>) => {
      const template = getEditingTemplate(templateId);
      if (!template || !template.controls || template.controls.length === 0) {
        return;
      }

      setExpandedRecipeApplicationId((current) =>
        current === applicationId ? null : applicationId,
      );
      setRecipeControlValues((current) =>
        current[applicationId]
          ? current
          : {
              ...current,
              [applicationId]: mergeEditingTemplateControlValues(
                template,
                controlValues,
              ),
            },
      );
    },
    [getEditingTemplate],
  );
  const handleResetRecipeControls = useCallback(
    (applicationId: string, templateId: string, controlValues?: Record<string, unknown>) => {
      const template = getEditingTemplate(templateId);
      if (!template) {
        return;
      }

      setRecipeControlValues((current) => ({
        ...current,
        [applicationId]: mergeEditingTemplateControlValues(template, controlValues),
      }));
    },
    [getEditingTemplate],
  );
  const handleUpdateRecipeControls = useCallback(
    (applicationId: string, templateId: string, controlValues?: Record<string, unknown>) => {
      if (!selectedTimelineClip) {
        return;
      }

      const template = getEditingTemplate(templateId);
      if (!template) {
        toast.error("Recipe unavailable", "This recipe definition is no longer available.");
        return;
      }

      const nextControlValues =
        recipeControlValues[applicationId] ||
        mergeEditingTemplateControlValues(template, controlValues);
      const updated = updateEditingTemplateApplication(
        selectedTimelineClip.id,
        applicationId,
        nextControlValues,
      );

      if (!updated) {
        toast.error("Could not update recipe", "The recipe controls could not be saved for this clip.");
        return;
      }

      toast.success("Recipe updated", `${template.name} was updated on this clip.`);
    },
    [
      getEditingTemplate,
      recipeControlValues,
      selectedTimelineClip,
      updateEditingTemplateApplication,
    ],
  );
  const showVideoControls = clipType === "video" || clipType === "image";
  const showTransformControls =
    clipType === "video" ||
    clipType === "image" ||
    clipType === "text" ||
    clipType === "shape" ||
    clipType === "svg" ||
    clipType === "sticker";

  const tabs = useMemo(
    () => getTabsForClipType(clipType as InspectorClipType | null),
    [clipType],
  );
  const tabIds = useMemo(
    () => getTabIdsForClipType(clipType as InspectorClipType | null),
    [clipType],
  );
  const inspectorActiveTab = useUIStore((s) => s.inspectorActiveTab);
  const setInspectorActiveTab = useUIStore((s) => s.setInspectorActiveTab);

  const activeTab: InspectorTabId =
    (tabIds.includes(inspectorActiveTab as InspectorTabId)
      ? (inspectorActiveTab as InspectorTabId)
      : tabIds[0]) ?? ("transform" as InspectorTabId);

  useEffect(() => {
    if (
      tabIds.length > 0 &&
      !tabIds.includes(inspectorActiveTab as InspectorTabId)
    ) {
      setInspectorActiveTab(tabIds[0]);
    }
  }, [tabIds, inspectorActiveTab, setInspectorActiveTab]);

  return (
    <div
      data-tour="inspector"
      className="w-full min-w-0 bg-bg-1 flex flex-col h-full"
    >
      {selectedClip && tabs.length > 0 && (
        <>
          <InspectorClipHeader
            name={`${selectedClip.id.substring(0, 20)}…`}
            durationSeconds={selectedClip.duration}
            typeLabel={clipType ?? "clip"}
          />
          <InspectorTabs
            tabs={tabs}
            activeId={activeTab}
            onSelect={(id) => setInspectorActiveTab(id)}
          />
        </>
      )}

      <div className="overflow-y-auto flex-1 min-h-0 pb-3.5 custom-scrollbar">
      <div className="px-4 pt-3">
        {selectedClip ? (
            {clipType === "text" && (
              <Section title={t('inspector.sections.text_content')} sectionId="text-content" defaultOpen={true}>
                <div className="space-y-3">
                  <textarea
                    value={(selectedClip as any).text || ""}
                    onChange={(e) => {
                      const titleEngine = getTitleEngine();
                      if (titleEngine) {
                        titleEngine.updateTextClip(clipId, { text: e.target.value });
                        forceUpdate();
                      }
                    }}
                    className="w-full h-24 px-3 py-2 bg-background-tertiary border border-border rounded-lg text-xs text-text-primary resize-none focus:outline-none focus:border-primary"
                    placeholder={t('inspector.text_placeholder')}
                  />
                </div>
              </Section>
            )}

            {/* Transform */}
            {showTransformControls && (
              <Section title={t('inspector.sections.transform')} sectionId="transform">
                <div className="space-y-3">
                  <LabeledSlider
                    label={t('inspector.transform.pos_x')}
                    value={transform.position.x}
                    onChange={(x) =>
                      handleTransformChange({
                        position: { ...transform.position, x },
                      })
                    }
                    min={-1920}
                    max={1920}
                    step={1}
                    unit="px"
                  />
                  <LabeledSlider
                    label={t('inspector.transform.pos_y')}
                    value={transform.position.y}
                    onChange={(y) =>
                      handleTransformChange({
                        position: { ...transform.position, y },
                      })
                    }
                    min={-1080}
                    max={1080}
                    step={1}
                    unit="px"
                  />
                  <LabeledSlider
                    label={t('inspector.transform.scale_x')}
                    value={Math.abs(transform.scale.x) * 100}
                    onChange={(x) =>
                      handleTransformChange({
                        scale: {
                          ...transform.scale,
                          x: (transform.scale.x < 0 ? -1 : 1) * (x / 100),
                        },
                      })
                    }
                    min={0}
                    max={300}
                    step={1}
                    unit="%"
                  />
                  <LabeledSlider
                    label={t('inspector.transform.scale_y')}
                    value={Math.abs(transform.scale.y) * 100}
                    onChange={(y) =>
                      handleTransformChange({
                        scale: {
                          ...transform.scale,
                          y: (transform.scale.y < 0 ? -1 : 1) * (y / 100),
                        },
                      })
                    }
                    min={0}
                    max={300}
                    step={1}
                    unit="%"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleTransformChange({
                          scale: {
                            ...transform.scale,
                            x:
                              (transform.scale.x < 0 ? 1 : -1) *
                              (Math.abs(transform.scale.x) || 1),
                          },
                        })
                      }
                      className={`flex items-center justify-center gap-2 rounded border px-2 py-2 text-[10px] transition-colors ${
                        transform.scale.x < 0
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-background-tertiary text-text-secondary hover:text-text-primary"
                      }`}
                      title="Reflect horizontally"
                    >
                      <FlipHorizontal size={14} />
                      {t('inspector.transform.flip_h')}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleTransformChange({
                          scale: {
                            ...transform.scale,
                            y:
                              (transform.scale.y < 0 ? 1 : -1) *
                              (Math.abs(transform.scale.y) || 1),
                          },
                        })
                      }
                      className={`flex items-center justify-center gap-2 rounded border px-2 py-2 text-[10px] transition-colors ${
                        transform.scale.y < 0
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-background-tertiary text-text-secondary hover:text-text-primary"
                      }`}
                      title="Reflect vertically"
                    >
                      <FlipVertical size={14} />
                      {t('inspector.transform.flip_v')}
                    </button>
                  </div>
                  <LabeledSlider
                    label={t('inspector.transform.rotation')}
                    value={transform.rotation}
                    onChange={(rotation) => handleTransformChange({ rotation })}
                    min={-180}
                    max={180}
                    step={1}
                    unit="°"
                  />
                  <LabeledSlider
                    label={t('inspector.transform.opacity')}
                    value={transform.opacity * 100}
                    onChange={(opacity) =>
                      handleTransformChange({ opacity: opacity / 100 })
                    }
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                  />
                  <LabeledSlider
                    label={t('inspector.transform.border_radius')}
                    value={transform.borderRadius || 0}
                    onChange={(borderRadius) =>
                      handleTransformChange({ borderRadius })
                    }
                    min={0}
                    max={200}
                    step={1}
                    unit="px"
                  />
                  {clipType === "image" && (
                    <div className="space-y-1 pt-2 border-t border-border">
                      <span className="text-[10px] text-text-secondary">
                        {t('inspector.transform.fit_mode')}
                      </span>
                      <div className="grid grid-cols-4 gap-1">
                        {(
                          ["contain", "cover", "stretch", "none"] as FitMode[]
                        ).map((mode) => (
                          <button
                            key={mode}
                            onClick={() =>
                              handleTransformChange({ fitMode: mode })
                            }
                            className={`py-1.5 rounded text-[9px] capitalize transition-colors ${
                              (transform.fitMode || "none") === mode
                                ? "bg-primary text-white"
                                : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
                            }`}
                          >
                            {mode === "contain"
                              ? t('inspector.transform.fit')
                              : mode === "cover"
                                ? t('inspector.transform.fill')
                                : mode}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Crop */}
            {showVideoControls &&
              selectedClip &&
              !selectedClip.mediaId.startsWith("text-") &&
              !selectedClip.mediaId.startsWith("shape-") &&
              !selectedClip.mediaId.startsWith("svg-") &&
              !selectedClip.mediaId.startsWith("sticker-") && (
                <Section title={t('inspector.sections.crop')} sectionId="crop" defaultOpen={false}>
                  <CropSection clip={selectedClip as Clip} />
                </Section>
              )}

            {/* Speed & Direction */}
            {showVideoControls &&
              selectedClip &&
              !selectedClip.mediaId.startsWith("text-") &&
              !selectedClip.mediaId.startsWith("shape-") &&
              !selectedClip.mediaId.startsWith("svg-") &&
              !selectedClip.mediaId.startsWith("sticker-") && (
                <Section
                  title={t('inspector.sections.speed_direction')}
                  sectionId="speed"
                  defaultOpen={true}
                >
                  <SpeedSection clip={selectedClip as Clip} />
                </Section>
              )}

            {/* Stabilization */}
            {showVideoControls &&
              selectedClip &&
              !selectedClip.mediaId.startsWith("text-") &&
              !selectedClip.mediaId.startsWith("shape-") &&
              !selectedClip.mediaId.startsWith("svg-") &&
              !selectedClip.mediaId.startsWith("sticker-") && (
                <Section
                  title={t('inspector.sections.stabilization')}
                  sectionId="stabilization"
                  defaultOpen={false}
                >
                  <StabilizationSection clip={selectedClip as Clip} />
                </Section>
              )}

            {/* Speed Curves */}
            {showVideoControls &&
              selectedClip &&
              !selectedClip.mediaId.startsWith("text-") &&
              !selectedClip.mediaId.startsWith("shape-") &&
              !selectedClip.mediaId.startsWith("svg-") &&
              !selectedClip.mediaId.startsWith("sticker-") && (
                <Section
                  title={t('inspector.sections.speed_curves')}
                  sectionId="speed-curves"
                  defaultOpen={false}
                >
                  <SpeedRampSection clip={selectedClip as Clip} />
                </Section>
              )}

            {/* Alignment - Position element on canvas */}
            {(clipType === "video" ||
              clipType === "image" ||
              clipType === "text" ||
              clipType === "shape" ||
              clipType === "svg" ||
              clipType === "sticker") && (
              <Section
                title={t('inspector.sections.alignment')}
                sectionId="alignment"
                defaultOpen={false}
              >
                <AlignmentSection clipId={clipId} />
              </Section>
            )}

            {/* Blending - Layer compositing blend modes */}
            {(clipType === "video" ||
              clipType === "image" ||
              clipType === "text" ||
              clipType === "shape" ||
              clipType === "svg" ||
              clipType === "sticker") && (
              <Section
                title={t('inspector.sections.blending')}
                sectionId="blending"
                defaultOpen={false}
              >
                <BlendingSection clipId={clipId} />
              </Section>
            )}

            {/* 3D Transforms - After Effects-style 3D rotation */}
            {(clipType === "video" ||
              clipType === "image" ||
              clipType === "text" ||
              clipType === "shape" ||
              clipType === "svg" ||
              clipType === "sticker") && (
              <Section
                title={t('inspector.sections.transform_3d')}
                sectionId="transform-3d"
                defaultOpen={false}
              >
                <Transform3DSection clipId={clipId} />
              </Section>
            )}

            {/* Keyframes - Using KeyframeEngine */}
            <Section title={t('inspector.sections.keyframes')} sectionId="keyframes">
              <KeyframesSection clipId={clipId} />
            </Section>

            {/* Entry/Exit Transitions - For all visual clips */}
            {(clipType === "video" ||
              clipType === "image" ||
              clipType === "text" ||
              clipType === "shape" ||
              clipType === "svg" ||
              clipType === "sticker") && (
              <Section
                title={t('inspector.sections.transitions')}
                sectionId="transitions"
                defaultOpen={false}
              >
                <ClipTransitionSection clipId={clipId} />
              </Section>
            )}

            {/* Motion Presets - Advanced animation presets */}
            {(clipType === "video" ||
              clipType === "image" ||
              clipType === "shape" ||
              clipType === "svg" ||
              clipType === "sticker") && (
              <Section
                title={t('inspector.sections.motion_presets')}
                sectionId="motion-presets"
                defaultOpen={false}
              >
                <MotionPresetsPanel clipId={clipId} />
              </Section>
            )}

            {/* Motion Path - Animate position along a path */}
            {(clipType === "video" ||
              clipType === "image" ||
              clipType === "text" ||
              clipType === "shape" ||
              clipType === "svg" ||
              clipType === "sticker") && (
              <Section
                title={t('inspector.sections.motion_path')}
                sectionId="motion-path"
                defaultOpen={false}
              >
                <MotionPathSection clipId={clipId} />
              </Section>
            )}

            {/* Particle Effects - Visual particle systems */}
            {(clipType === "video" ||
              clipType === "image" ||
              clipType === "text" ||
              clipType === "shape" ||
              clipType === "svg" ||
              clipType === "sticker") &&
              selectedClip && (
                <Section
                  title={t('inspector.sections.particle_effects')}
                  sectionId="particle-effects"
                  defaultOpen={false}
                >
                  <ParticleEffectsSectionWrapper
                    clipId={clipId}
                    clipDuration={selectedClip.duration}
                    clipStartTime={selectedClip.startTime}
                  />
                </Section>
              )}

            {/* Emphasis Animation - Looping animations while clip is visible */}
            {(clipType === "video" ||
              clipType === "image" ||
              clipType === "text" ||
              clipType === "shape" ||
              clipType === "svg" ||
              clipType === "sticker") && (
              <Section
                title={t('inspector.sections.emphasis_animation')}
                sectionId="emphasis-animation"
                defaultOpen={false}
              >
                <EmphasisAnimationSection clipId={clipId} />
              </Section>
            )}

            {/* Chroma Key - Using ChromaKeyEngine - Only for video/image */}
            {showVideoControls && (
              <Section title={t('inspector.sections.chroma_key')}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-secondary">
                      {t('template_preview.label_enabled')}
                    </span>
                    <Switch
                      checked={chromaKeyEnabled}
                      onCheckedChange={handleChromaKeyToggle}
                    />
                  </div>
                  {chromaKeyEnabled && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-text-secondary">
                          {t('inspector.subtitle_style.highlight_color')}
                        </span>
                        <input
                          type="color"
                          value={keyColor}
                          onChange={(e) => handleKeyColorChange(e.target.value)}
                          className="w-8 h-6 rounded border border-border cursor-pointer"
                        />
                      </div>
                      <LabeledSlider
                        label={t('inspector.sections.tolerance')}
                        value={tolerance}
                        onChange={handleToleranceChange}
                        unit="%"
                      />
                    </>
                  )}
                </div>
              </Section>
            )}

            {/* Motion Tracking - Using MotionTrackingEngine - Only for video/image */}
            {showVideoControls && (
              <Section title={t('inspector.sections.motion_tracking')} sectionId="motion-tracking">
                <MotionTrackingSection clipId={clipId} />
              </Section>
            )}

            {showVideoEffects && (
              <Section title={t('inspector.sections.video_effects')} sectionId="video-effects">
                <VideoEffectsSection clipId={clipId} />
              </Section>
            )}

            {showVideoEffects && (
              <Section
                title={t('inspector.sections.green_screen')}
                sectionId="green-screen"
                defaultOpen={false}
              >
                <GreenScreenSection clipId={clipId} />
              </Section>
            )}

            {/* Picture-in-Picture Section */}
            {showVideoControls && (
              <Section
                title={t('inspector.sections.pip')}
                sectionId="pip"
                defaultOpen={false}
              >
                <PiPSection clipId={clipId} />
              </Section>
            )}

            {showVideoControls && (
              <Section title={t('inspector.sections.masking')} sectionId="masking" defaultOpen={false}>
                <MaskSection clipId={clipId} />
              </Section>
            )}

            {showVideoControls && (
              <Section title={t('inspector.sections.nested_sequences')} defaultOpen={false}>
                <NestedSequenceSection clipId={clipId} />
              </Section>
            )}

            {showVideoControls && (
              <Section title={t('inspector.sections.adjustment_layers')} defaultOpen={false}>
                <AdjustmentLayerSection clipId={clipId} />
              </Section>
            )}

            {showColorGrading && (
              <Section
                title={t('inspector.sections.color_grading')}
                sectionId="color-grading"
                defaultOpen={false}
              >
                <ColorGradingSection clipId={clipId} />
              </Section>
            )}

            {showAudioEffects && selectedAdjustableClips.length === 1 && (
              <Section title={t('inspector.sections.volume')} sectionId="volume" defaultOpen={true}>
                <div className="space-y-3 p-3 bg-background-secondary rounded-lg border border-border/50">
                  <LabeledSlider
                    label={t('inspector.sections.volume')}
                    value={Math.round((selectedAdjustableClips[0]?.volume ?? 1) * 100)}
                    onChange={handleVolumeChange}
                    min={0}
                    max={400}
                    step={1}
                    unit="%"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-1 px-1">
                    <span>{t('inspector.quick_actions.mute')}</span>
                    <span>100% ({t('inspector.quick_actions.normal')})</span>
                    <span>400% ({t('inspector.quick_actions.boost')})</span>
                  </div>
                </div>
              </Section>
            )}

            {showAudioEffects && (
              <Section
                title={noiseReductionSectionTitle}
                sectionId="background-noise-removal"
                defaultOpen={Boolean(selectedNoiseReductionEffect)}
              >
                <NoiseReductionSection clipId={clipId} />
              </Section>
            )}

            {showAudioEffects && (
              <Section
                title={t('inspector.sections.audio_effects')}
                sectionId="audio-effects"
                defaultOpen={false}
              >
                <AudioEffectsSection clipId={clipId} />
              </Section>
            )}

            {showAudioEffects && (
              <Section
                title={t('inspector.sections.audio_ducking')}
                sectionId="audio-ducking"
                defaultOpen={false}
              >
                <AudioDuckingSection clipId={clipId} />
              </Section>
            )}

            {showTextSection && (
              <Section title={t('inspector.sections.text_properties')} sectionId="text-properties">
                <TextSection clipId={clipId} />
              </Section>
            )}

            {showTextSection && (
              <Section
                title={t('inspector.sections.text_animation')}
                sectionId="text-animation"
                defaultOpen={false}
              >
                <TextAnimationSection clipId={clipId} />
              </Section>
            )}

            {showTextSection && (
              <Section
                title={t('inspector.sections.text_behind')}
                sectionId="text-behind-subject"
                defaultOpen={false}
              >
                <BehindSubjectSection clipId={clipId} />
              </Section>
            )}

            {showShapeSection && (
              <Section title={t('inspector.sections.shape_properties')} sectionId="shape-properties">
                <ShapeSection clipId={clipId} />
              </Section>
            )}

            {/* SVG Section */}
            {showSVGSection && (
              <Section title={t('inspector.sections.svg_properties')}>
                <SVGSection clipId={clipId} />
              </Section>
            )}
             {/* Quick Actions - Only show when there are actions available */}
            {(showVideoControls || showAudioEffects || showVideoEffects) && (
              <div className="border border-primary/30 bg-primary/5 rounded-xl p-4 relative overflow-hidden">
                <div className="flex items-center gap-2 text-primary mb-3">
                  <Zap size={14} />
                  <span className="text-xs font-bold">{t('inspector.quick_actions.title')}</span>
                </div>
                <div className="space-y-2">
                  {showVideoControls && (
                    <button
                      onClick={handleRemoveBackground}
                      disabled={isApplyingSelectedClipEffect}
                      className={`w-full py-2 border rounded-lg text-[10px] transition-all ${
                        isApplyingSelectedClipEffect
                          ? "bg-background-tertiary border-border text-text-muted cursor-not-allowed"
                          : "bg-background-tertiary hover:bg-primary hover:text-white border-border hover:border-primary"
                      }`}
                    >
                      {t('inspector.quick_actions.remove_bg')}
                    </button>
                  )}
                  {showAudioEffects && (
                    <button
                      onClick={handleEnhanceAudio}
                      disabled={isEnhancingAudio || isApplyingSelectedClipEffect}
                      className={`w-full py-2 border rounded-lg text-[10px] transition-all flex items-center justify-center gap-1.5 ${
                        audioEnhanced
                          ? "bg-green-500/20 border-green-500 text-green-400"
                          : isEnhancingAudio || isApplyingSelectedClipEffect
                            ? "bg-background-tertiary border-border text-text-muted cursor-not-allowed"
                            : "bg-background-tertiary hover:bg-primary hover:text-white border-border hover:border-primary"
                      }`}
                    >
                      {isEnhancingAudio ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          {t('inspector.quick_actions.cleaning')}
                        </>
                      ) : audioEnhanced ? (
                        t('inspector.quick_actions.noise_reduced')
                      ) : (
                        t('inspector.quick_actions.dialogue_cleanup')
                      )}
                    </button>
                  )}
                  {showVideoEffects && (
                    <button
                      onClick={handleAutoColor}
                      disabled={isApplyingSelectedClipEffect}
                      className={`w-full py-2 border rounded-lg text-[10px] transition-all ${
                        isApplyingSelectedClipEffect
                          ? "bg-background-tertiary border-border text-text-muted cursor-not-allowed"
                          : "bg-background-tertiary hover:bg-primary hover:text-white border-border hover:border-primary"
                      }`}
                    >
                      {isApplyingSelectedClipEffect ? t('inspector.quick_actions.applying') : t('inspector.quick_actions.auto_color')}
                    </button>
                  )}
                </div>iv>
              </div>
            )}
          </>
        ) : selectedAdjustableClips.length > 1 ? (
          <>
            <div className="mb-4 p-3 bg-background-tertiary rounded-lg border border-primary/30">
              <p className="text-xs text-text-primary font-medium">
                {selectedAdjustableClips.length} clips selected
              </p>
              <p className="text-[10px] text-text-muted">
                Changes below apply to all selected clips.
              </p>
            </div>

            <Section
              title={`Speed & Direction (${selectedAdjustableClips.length} clips)`}
              sectionId="speed"
              defaultOpen={true}
            >
              <SpeedSection clips={selectedAdjustableClips} />
            </Section>

            <Section
              title={`Volume (${selectedAdjustableClips.length} clips)`}
              sectionId="volume"
              defaultOpen={true}
            >
              <div className="space-y-3 p-3 bg-background-secondary rounded-lg border border-border/50">
                <LabeledSlider
                  label="Volume"
                  value={Math.round((selectedAdjustableClips[0]?.volume ?? 1) * 100)}
                  onChange={handleVolumeChange}
                  min={0}
                  max={400}
                  step={1}
                  unit="%"
                />
                <div className="flex justify-between text-[10px] text-text-muted mt-1 px-1">
                  <span>Mute</span>
                  <span>100% (Normal)</span>
                  <span>400% (Boost)</span>
                </div>
              </div>
            </Section>
          </>
        ) : selectedTextClipIds.length > 1 ? (
          <>
            <div className="mb-4 p-3 bg-background-tertiary rounded-lg border border-amber-500/30">
              <p className="text-xs text-text-primary font-medium">
                {selectedTextClipIds.length} text clips selected
              </p>
              <p className="text-[10px] text-text-muted">
                Changes below apply to all selected text/sub clips.
              </p>
            </div>

            <Section title="Text Properties" sectionId="text-properties">
              <TextSection clipIds={selectedTextClipIds} />
            </Section>
          </>
=======
          <InspectorTabErrorBoundary key={activeTab}>
            <InspectorTabPanel tab="effects" active={activeTab}>
              <EffectsTab
                clipId={clipId}
                clipType={clipType}
                selectedClip={selectedClip}
                selectedTimelineClip={selectedTimelineClip}
                showVideoControls={showVideoControls}
                showVideoEffects={showVideoEffects}
                showTextSection={showTextSection}
                appliedEditingTemplates={appliedEditingTemplates}
                getEditingTemplate={getEditingTemplate}
                removeEditingTemplateApplication={removeEditingTemplateApplication}
                expandedRecipeApplicationId={expandedRecipeApplicationId}
                setExpandedRecipeApplicationId={setExpandedRecipeApplicationId}
                recipeControlValues={recipeControlValues}
                setRecipeControlValues={setRecipeControlValues}
                handleRecipeControlChange={handleRecipeControlChange}
                handleToggleRecipeControls={handleToggleRecipeControls}
                handleResetRecipeControls={handleResetRecipeControls}
                handleUpdateRecipeControls={handleUpdateRecipeControls}
                chromaKeyEnabled={chromaKeyEnabled}
                keyColor={keyColor}
                tolerance={tolerance}
                handleChromaKeyToggle={handleChromaKeyToggle}
                handleKeyColorChange={handleKeyColorChange}
                handleToleranceChange={handleToleranceChange}
              />
            </InspectorTabPanel>

            <InspectorTabPanel tab="ai" active={activeTab}>
              <AiTab
                clipId={clipId}
                clipType={clipType}
                showVideoControls={showVideoControls}
                showAudioEffects={showAudioEffects}
                showVideoEffects={showVideoEffects}
                transcriptionProgress={transcriptionProgress}
                isTranscribing={isTranscribing}
                targetLanguage={targetLanguage}
                setTargetLanguage={setTargetLanguage}
                defaultAnimationStyle={defaultAnimationStyle}
                setDefaultAnimationStyle={setDefaultAnimationStyle}
                handleGenerateSubtitles={handleGenerateSubtitles}
                handleSRTImport={handleSRTImport}
                srtInputRef={srtInputRef}
                handleRemoveBackground={handleRemoveBackground}
                handleEnhanceAudio={handleEnhanceAudio}
                handleAutoColor={handleAutoColor}
                isEnhancingAudio={isEnhancingAudio}
                audioEnhanced={audioEnhanced}
                isApplyingSelectedClipEffect={isApplyingSelectedClipEffect}
              />
            </InspectorTabPanel>

            <InspectorTabPanel tab="audio" active={activeTab}>
              <AudioTab
                clipId={clipId}
                clipType={clipType}
                showAudioEffects={showAudioEffects}
                noiseReductionSectionTitle={noiseReductionSectionTitle}
                selectedNoiseReductionEffect={selectedNoiseReductionEffect}
              />
            </InspectorTabPanel>

            <InspectorTabPanel tab="transform" active={activeTab}>
              <TransformTab
                clipId={clipId}
                clipType={clipType}
                selectedClip={selectedClip}
                showTransformControls={showTransformControls}
                showVideoControls={showVideoControls}
                transform={transform}
                handleTransformChange={handleTransformChange}
              />
            </InspectorTabPanel>

            <InspectorTabPanel tab="speed" active={activeTab}>
              <SpeedTab
                showVideoControls={showVideoControls}
                selectedClip={selectedClip}
              />
            </InspectorTabPanel>

            <InspectorTabPanel tab="animate" active={activeTab}>
              <AnimateTab
                clipId={clipId}
                clipType={clipType}
                showTextSection={showTextSection}
              />
            </InspectorTabPanel>

            <InspectorTabPanel tab="color" active={activeTab}>
              <ColorTab clipId={clipId} showColorGrading={showColorGrading} />
            </InspectorTabPanel>

            <InspectorTabPanel tab="style" active={activeTab}>
              <StyleTab
                clipId={clipId}
                showTextSection={showTextSection}
                showShapeSection={showShapeSection}
                showSVGSection={showSVGSection}
              />
            </InspectorTabPanel>

          </InspectorTabErrorBoundary>
>>>>>>> upstream/main
        ) : selectedSubtitle ? (
          <>
            {/* Subtitle Info */}
            <div className="mb-4 p-3 bg-primary/10 rounded-lg border border-primary/30">
              <div className="flex items-center gap-2 mb-1">
                <Captions size={14} className="text-primary" />
                <span className="text-xs font-bold text-primary">{t("inspector.subtitle_badge")}</span>
              </div>
              <p className="text-[10px] text-text-muted">
                {selectedSubtitle.startTime.toFixed(2)}s -{" "}
                {selectedSubtitle.endTime.toFixed(2)}s
              </p>
            </div>

            {/* Subtitle Text Editor */}
            <Section title={t("inspector.subtitle_style.text_content")}>
              <div className="space-y-3">
                <textarea
                  value={selectedSubtitle.text}
                  onChange={(e) =>
                    updateSubtitle(selectedSubtitle.id, {
                      text: e.target.value,
                    })
                  }
                  className="w-full h-24 px-3 py-2 bg-background-tertiary border border-border rounded-lg text-xs text-text-primary resize-none focus:outline-none focus:border-primary"
                  placeholder={t("inspector.subtitle_placeholder")}
                />
              </div>
            </Section>

            {/* Subtitle Timing */}
            <Section title={t("inspector.subtitle_style.timing")}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    {t("inspector.subtitle_style.start_time")}
                  </span>
                  <Input
                    type="number"
                    step="0.1"
                    value={selectedSubtitle.startTime.toFixed(2)}
                    onChange={(e) =>
                      updateSubtitle(selectedSubtitle.id, {
                        startTime: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-20 h-7 text-[10px] bg-background-tertiary border-border text-text-primary text-right"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    {t("inspector.subtitle_style.end_time")}
                  </span>
                  <Input
                    type="number"
                    step="0.1"
                    value={selectedSubtitle.endTime.toFixed(2)}
                    onChange={(e) =>
                      updateSubtitle(selectedSubtitle.id, {
                        endTime: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-20 h-7 text-[10px] bg-background-tertiary border-border text-text-primary text-right"
                  />
                </div>
              </div>
            </Section>

            {/* Subtitle Position */}
            <Section title={t("inspector.subtitle_style.position")}>
              <div className="grid grid-cols-3 gap-2">
                {(["top", "center", "bottom"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() =>
                      updateSubtitle(selectedSubtitle.id, {
                        style: {
                          ...(selectedSubtitle.style || {}),
                          position: pos,
                        } as typeof selectedSubtitle.style,
                      })
                    }
                    className={`py-1.5 rounded text-[10px] capitalize transition-colors ${
                      (selectedSubtitle.style?.position || "bottom") === pos
                        ? "bg-primary text-white"
                        : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {pos === "top"
                      ? t("inspector.subtitle_style.top")
                      : pos === "center"
                        ? t("inspector.subtitle_style.center")
                        : t("inspector.subtitle_style.bottom")}
                  </button>
                ))}
              </div>
            </Section>

            {/* Subtitle Animation Style */}
            <Section title={t("inspector.subtitle_style.animation")}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    {t("inspector.subtitle_style.style")}
                  </span>
                  <Select
                    value={selectedSubtitle.animationStyle || "none"}
                    onValueChange={(v) =>
                      updateSubtitle(selectedSubtitle.id, {
                        animationStyle: v as CaptionAnimationStyle,
                      })
                    }
                  >
                    <SelectTrigger className="w-auto min-w-[100px] bg-background-tertiary border-border text-text-primary text-[10px]">
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
                <p className="text-[9px] text-text-muted">
                  {selectedSubtitle.animationStyle === "karaoke" &&
                    t("inspector.subtitle_style.karaoke_desc")}
                  {selectedSubtitle.animationStyle === "word-highlight" &&
                    t("inspector.subtitle_style.word_highlight_desc")}
                  {selectedSubtitle.animationStyle === "word-by-word" &&
                    t("inspector.subtitle_style.word_by_word_desc")}
                  {selectedSubtitle.animationStyle === "bounce" &&
                    t("inspector.subtitle_style.bounce_desc")}
                  {selectedSubtitle.animationStyle === "typewriter" &&
                    t("inspector.subtitle_style.typewriter_desc")}
                  {(!selectedSubtitle.animationStyle ||
                    selectedSubtitle.animationStyle === "none") &&
                    t("inspector.subtitle_style.none_desc")}
                </p>
                {selectedSubtitle.animationStyle &&
                  selectedSubtitle.animationStyle !== "none" &&
                  !selectedSubtitle.words?.length && (
                    <p className="text-[9px] text-amber-400 bg-amber-400/10 p-2 rounded">
                      {t("inspector.subtitle_style.no_timing_warning")}
                    </p>
                  )}
                {selectedSubtitle.animationStyle &&
                  selectedSubtitle.animationStyle !== "none" &&
                  selectedSubtitle.animationStyle !== "typewriter" &&
                  selectedSubtitle.animationStyle !== "word-by-word" && (
                    <div className="pt-2 border-t border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-text-secondary">
                          {t("inspector.subtitle_style.highlight_color")}
                        </span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={
                              selectedSubtitle.style?.highlightColor ||
                              "#ffff00"
                            }
                            onChange={(e) =>
                              updateSubtitle(selectedSubtitle.id, {
                                style: {
                                  ...(selectedSubtitle.style || {}),
                                  highlightColor: e.target.value,
                                } as typeof selectedSubtitle.style,
                              })
                            }
                            className="w-6 h-6 rounded border border-border cursor-pointer"
                          />
                          <span className="text-[9px] font-mono text-text-muted uppercase">
                            {selectedSubtitle.style?.highlightColor ||
                              "#ffff00"}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {[
                          "#ffff00",
                          "#00ff00",
                          "#ff6b6b",
                          "#4ecdc4",
                          "#ff9f43",
                          "#a55eea",
                        ].map((color) => (
                          <button
                            key={color}
                            onClick={() =>
                              updateSubtitle(selectedSubtitle.id, {
                                style: {
                                  ...(selectedSubtitle.style || {}),
                                  highlightColor: color,
                                } as typeof selectedSubtitle.style,
                              })
                            }
                            className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${
                              (selectedSubtitle.style?.highlightColor ||
                                "#ffff00") === color
                                ? "border-white"
                                : "border-transparent"
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </Section>

            {/* Subtitle Font Settings */}
            <Section title={t("inspector.subtitle_style.font")}>
              <div className="space-y-3">
                <input
                  ref={subtitleFontInputRef}
                  type="file"
                  accept={FONT_FILE_ACCEPT}
                  onChange={handleSubtitleFontUpload}
                  className="hidden"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    {t("inspector.subtitle_style.font_family")}
                  </span>
                  <Select
                    value={selectedSubtitle.style?.fontFamily || "Inter"}
                    onValueChange={(v) =>
                      updateSubtitle(selectedSubtitle.id, {
                        style: {
                          ...(selectedSubtitle.style || {}),
                          fontFamily: v,
                        } as typeof selectedSubtitle.style,
                      })
                    }
                  >
                    <SelectTrigger className="max-w-[120px] bg-background-tertiary border-border text-text-primary text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background-secondary border-border max-h-60">
                      {Object.entries(FONT_CATEGORIES).map(([category, fonts]) => (
                        <SelectGroup key={category}>
                          <SelectLabel className="text-text-muted text-[10px] font-medium">
                            {category}
                          </SelectLabel>
                          {fonts.map((font) => (
                            <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                              {font}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                      {customFonts.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-text-muted text-[10px] font-medium">
                            {t("inspector.subtitle_style.custom_uploads", "Custom Uploads")}
                          </SelectLabel>
                          {customFonts.map((font) => (
                            <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                              {font}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  onClick={() => subtitleFontInputRef.current?.click()}
                  className="w-full py-1.5 px-2 bg-background-secondary border border-border rounded text-[10px] text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center gap-1.5"
                >
                  <Upload size={11} />
                  {t("inspector.subtitle_style.upload_font")}
                </button>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    {t("inspector.subtitle_style.font_size")}
                  </span>
                  <Input
                    type="number"
                    min={12}
                    max={72}
                    value={selectedSubtitle.style?.fontSize || 24}
                    onChange={(e) =>
                      updateSubtitle(selectedSubtitle.id, {
                        style: {
                          ...(selectedSubtitle.style || {}),
                          fontSize: parseInt(e.target.value) || 24,
                        } as typeof selectedSubtitle.style,
                      })
                    }
                    className="w-16 h-7 text-[10px] bg-background-tertiary border-border text-text-primary text-right"
                  />
                </div>
              </div>
            </Section>

            {/* Subtitle Colors */}
            <Section title={t("inspector.subtitle_style.colors")}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    {t("inspector.subtitle_style.text_color")}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedSubtitle.style?.color || "#ffffff"}
                      onChange={(e) =>
                        updateSubtitle(selectedSubtitle.id, {
                          style: {
                            ...(selectedSubtitle.style || {}),
                            color: e.target.value,
                          } as typeof selectedSubtitle.style,
                        })
                      }
                      className="w-6 h-6 rounded border border-border cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-text-muted uppercase">
                      {selectedSubtitle.style?.color || "#ffffff"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-text-secondary">
                    {t("inspector.subtitle_style.background")}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={
                        selectedSubtitle.style?.backgroundColor?.replace(
                          /rgba?\([^)]+\)/,
                          "#000000",
                        ) || "#000000"
                      }
                      onChange={(e) => {
                        const hex = e.target.value;
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        updateSubtitle(selectedSubtitle.id, {
                          style: {
                            ...(selectedSubtitle.style || {}),
                            backgroundColor: `rgba(${r}, ${g}, ${b}, 0.7)`,
                          } as typeof selectedSubtitle.style,
                        });
                      }}
                      className="w-6 h-6 rounded border border-border cursor-pointer"
                    />
                    <Select
                      value={
                        selectedSubtitle.style?.backgroundColor?.includes("0.7")
                          ? "0.7"
                          : selectedSubtitle.style?.backgroundColor?.includes("0.5")
                            ? "0.5"
                            : "1"
                      }
                      onValueChange={(v) => {
                        const currentBg =
                          selectedSubtitle.style?.backgroundColor ||
                          "rgba(0, 0, 0, 0.7)";
                        const newBg = currentBg.replace(
                          /[\d.]+\)$/,
                          `${v})`,
                        );
                        updateSubtitle(selectedSubtitle.id, {
                          style: {
                            ...(selectedSubtitle.style || {}),
                            backgroundColor: newBg,
                          } as typeof selectedSubtitle.style,
                        });
                      }}
                    >
                      <SelectTrigger className="w-auto min-w-[50px] bg-background-tertiary border-border text-text-primary text-[9px] h-6">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background-secondary border-border">
                        <SelectItem value="0">{t("inspector.subtitle_style.bg_none")}</SelectItem>
                        <SelectItem value="0.5">50%</SelectItem>
                        <SelectItem value="0.7">70%</SelectItem>
                        <SelectItem value="1">100%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </Section>

            {/* Delete Subtitle */}
            <div className="pt-4 border-t border-border">
              <button
                onClick={() => {
                  const { removeSubtitle } = useProjectStore.getState();
                  removeSubtitle(selectedSubtitle.id);
                }}
                className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg text-[10px] transition-all"
              >
                {t("inspector.subtitle_style.delete")}
              </button>
            </div>
          </>
        ) : (
          <EmptyState />
        )}
      </div>
      </div>
    </div>
  );
};

export default InspectorPanel;
