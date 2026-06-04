import React, { useCallback, useMemo, useRef } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Crosshair,
  Bold,
  Italic,
  Underline,
  Type,
  Upload,
} from "lucide-react";
import { useProjectStore } from "../../../stores/project-store";
import type { TextStyle, FontWeight, Transform } from "@openreel/core";
import {
  ColorPicker,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@openreel/ui";
import {
  FONT_CATEGORIES,
  FONT_FILE_ACCEPT,
  registerCustomFont,
  useCustomFonts,
} from "./font-options";
import { toast } from "../../../stores/notification-store";

const ColorField: React.FC<{
  label: string;
  value: string;
  onChange: (color: string) => void;
  showAlpha?: boolean;
  allowTransparent?: boolean;
}> = ({ label, value, onChange, showAlpha = false, allowTransparent = false }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[10px] text-text-secondary">{label}</span>
    <ColorPicker
      value={value}
      onChange={onChange}
      showAlpha={showAlpha}
      allowTransparent={allowTransparent}
      className="max-w-[170px]"
    />
  </div>
);

const NumberInput: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}> = ({ label, value, onChange, min = 0, max = 1000, step = 1, unit = "" }) => (
  <div className="flex items-center justify-between">
    <span className="text-[10px] text-text-secondary">{label}</span>
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="w-16 px-2 py-1 text-[10px] font-mono text-text-primary bg-background-tertiary border border-border rounded text-right outline-none focus:border-primary"
      />
      {unit && <span className="text-[10px] text-text-muted">{unit}</span>}
    </div>
  </div>
);

const ToggleButtonGroup: React.FC<{
  options: { value: string; icon: React.ReactNode; label: string }[];
  value: string;
  onChange: (value: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="flex gap-1">
    {options.map((option) => (
      <button
        key={option.value}
        onClick={() => onChange(option.value)}
        className={`p-1.5 rounded transition-colors ${
          value === option.value
            ? "bg-primary text-white"
            : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
        }`}
        title={option.label}
      >
        {option.icon}
      </button>
    ))}
  </div>
);

const FontSelector: React.FC<{
  value: string;
  onChange: (font: string) => void;
}> = ({ value, onChange }) => {
  const customFonts = useCustomFonts();
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-text-secondary">Font</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="max-w-[140px] bg-background-tertiary border-border text-text-primary text-[10px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-background-secondary border-border max-h-80">
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
                Custom Uploads
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
  );
};

const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Inter",
  fontSize: 48,
  fontWeight: "normal" as FontWeight,
  fontStyle: "normal",
  color: "#ffffff",
  backgroundColor: "transparent",
  textAlign: "center",
  verticalAlign: "middle",
  lineHeight: 1.2,
  letterSpacing: 0,
  textDecoration: "none",
  strokeColor: "#000000",
  strokeWidth: 0,
  shadowColor: "#000000",
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  shadowBlur: 0,
};

interface TextPreset {
  id: string;
  name: string;
  style: Partial<TextStyle>;
  previewStyle: React.CSSProperties;
}

const TEXT_PRESETS: TextPreset[] = [
  {
    id: "none",
    name: "Mặc định",
    style: {
      color: "#ffffff",
      backgroundColor: "transparent",
      strokeColor: "#000000",
      strokeWidth: 0,
      shadowColor: "#000000",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
    },
    previewStyle: {
      color: "#ffffff",
    },
  },
  {
    id: "white-black-stroke",
    name: "Trắng viền đen",
    style: {
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 4,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#ffffff",
      WebkitTextStroke: "1.2px #000000",
      fontWeight: "bold",
    },
  },
  {
    id: "white-black-stroke-shadow",
    name: "Trắng viền đen bóng đổ",
    style: {
      color: "#ffffff",
      strokeColor: "#000000",
      strokeWidth: 3,
      shadowColor: "#000000",
      shadowOffsetX: 3,
      shadowOffsetY: 3,
      shadowBlur: 2,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#ffffff",
      WebkitTextStroke: "1px #000000",
      textShadow: "1.5px 1.5px 1px #000000",
      fontWeight: "bold",
    },
  },
  {
    id: "white-soft-shadow",
    name: "Trắng bóng đổ mềm",
    style: {
      color: "#ffffff",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "rgba(0, 0, 0, 0.6)",
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      shadowBlur: 4,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#ffffff",
      textShadow: "1.5px 1.5px 2px rgba(0, 0, 0, 0.7)",
      fontWeight: "bold",
    },
  },
  {
    id: "white-glow",
    name: "Trắng phát sáng",
    style: {
      color: "#ffffff",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "#000000",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 8,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#ffffff",
      textShadow: "0 0 4px #000000",
      fontWeight: "bold",
    },
  },
  {
    id: "yellow-black-stroke",
    name: "Vàng viền đen",
    style: {
      color: "#ffeb3b",
      strokeColor: "#000000",
      strokeWidth: 4,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#ffeb3b",
      WebkitTextStroke: "1.2px #000000",
      fontWeight: "bold",
    },
  },
  {
    id: "red-white-stroke",
    name: "Đỏ viền trắng bóng đổ",
    style: {
      color: "#f44336",
      strokeColor: "#ffffff",
      strokeWidth: 3,
      shadowColor: "#000000",
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      shadowBlur: 2,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#f44336",
      WebkitTextStroke: "1px #ffffff",
      textShadow: "1.5px 1.5px 1px #000000",
      fontWeight: "bold",
    },
  },
  {
    id: "orange-white-stroke",
    name: "Cam viền trắng bóng đổ",
    style: {
      color: "#ff9800",
      strokeColor: "#ffffff",
      strokeWidth: 3,
      shadowColor: "#000000",
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      shadowBlur: 2,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#ff9800",
      WebkitTextStroke: "1px #ffffff",
      textShadow: "1.5px 1.5px 1px #000000",
      fontWeight: "bold",
    },
  },
  {
    id: "blue-white-stroke",
    name: "Xanh viền trắng bóng đổ",
    style: {
      color: "#2196f3",
      strokeColor: "#ffffff",
      strokeWidth: 3,
      shadowColor: "#000000",
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      shadowBlur: 2,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#2196f3",
      WebkitTextStroke: "1px #ffffff",
      textShadow: "1.5px 1.5px 1px #000000",
      fontWeight: "bold",
    },
  },
  {
    id: "green-white-stroke",
    name: "Lá viền trắng bóng đổ",
    style: {
      color: "#4caf50",
      strokeColor: "#ffffff",
      strokeWidth: 3,
      shadowColor: "#000000",
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      shadowBlur: 2,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#4caf50",
      WebkitTextStroke: "1px #ffffff",
      textShadow: "1.5px 1.5px 1px #000000",
      fontWeight: "bold",
    },
  },
  {
    id: "grey-white-stroke",
    name: "Xám viền trắng",
    style: {
      color: "#2c2c2c",
      strokeColor: "#ffffff",
      strokeWidth: 2,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#2c2c2c",
      WebkitTextStroke: "0.8px #ffffff",
      fontWeight: "bold",
    },
  },
  // Row 2 (Badges)
  {
    id: "badge-dark-translucent",
    name: "Nền tối bán trong suốt",
    style: {
      color: "#ffffff",
      backgroundColor: "rgba(30, 30, 30, 0.75)",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
    },
    previewStyle: {
      color: "#ffffff",
      backgroundColor: "rgba(60, 60, 60, 0.85)",
      padding: "2px 6px",
      borderRadius: "3px",
      fontSize: "9px",
      fontWeight: "bold",
    },
  },
  {
    id: "badge-yellow-black",
    name: "Nền vàng chữ đen",
    style: {
      color: "#000000",
      backgroundColor: "#fadc19",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
    },
    previewStyle: {
      color: "#000000",
      backgroundColor: "#fadc19",
      padding: "2px 6px",
      borderRadius: "3px",
      fontSize: "9px",
      fontWeight: "bold",
    },
  },
  {
    id: "badge-purple-white",
    name: "Nền tím chữ trắng",
    style: {
      color: "#ffffff",
      backgroundColor: "#9c27b0",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
    },
    previewStyle: {
      color: "#ffffff",
      backgroundColor: "#9c27b0",
      padding: "2px 6px",
      borderRadius: "3px",
      fontSize: "9px",
      fontWeight: "bold",
    },
  },
  {
    id: "badge-white-purple",
    name: "Nền trắng chữ tím",
    style: {
      color: "#9c27b0",
      backgroundColor: "#ffffff",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
    },
    previewStyle: {
      color: "#9c27b0",
      backgroundColor: "#ffffff",
      padding: "2px 6px",
      borderRadius: "3px",
      fontSize: "9px",
      fontWeight: "bold",
    },
  },
  {
    id: "badge-white-black",
    name: "Nền trắng chữ đen",
    style: {
      color: "#000000",
      backgroundColor: "#ffffff",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
    },
    previewStyle: {
      color: "#000000",
      backgroundColor: "#ffffff",
      padding: "2px 6px",
      borderRadius: "3px",
      fontSize: "9px",
      fontWeight: "bold",
    },
  },
  {
    id: "badge-black-white",
    name: "Nền đen chữ trắng",
    style: {
      color: "#ffffff",
      backgroundColor: "#000000",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
    },
    previewStyle: {
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: "2px 6px",
      borderRadius: "3px",
      fontSize: "9px",
      fontWeight: "bold",
    },
  },
  {
    id: "badge-darkgreen-green",
    name: "Nền xanh lá đậm",
    style: {
      color: "#00ff00",
      backgroundColor: "#003300",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
    },
    previewStyle: {
      color: "#00ff00",
      backgroundColor: "#003300",
      padding: "2px 6px",
      borderRadius: "3px",
      fontSize: "9px",
      fontWeight: "bold",
    },
  },
  {
    id: "stroke-green-only",
    name: "Viền xanh lá rỗng",
    style: {
      color: "transparent",
      strokeColor: "#00ff00",
      strokeWidth: 3,
      shadowColor: "#000000",
      shadowOffsetX: 2,
      shadowOffsetY: 2,
      shadowBlur: 2,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "transparent",
      WebkitTextStroke: "1px #00ff00",
      textShadow: "1.5px 1.5px 1px #000000",
      fontWeight: "bold",
    },
  },
  {
    id: "yellow-red-stroke",
    name: "Vàng viền đỏ",
    style: {
      color: "#fadc19",
      strokeColor: "#e53935",
      strokeWidth: 3,
      shadowColor: "transparent",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 0,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#fadc19",
      WebkitTextStroke: "1px #e53935",
      fontWeight: "bold",
    },
  },
  {
    id: "pink-glow",
    name: "Hồng phát sáng",
    style: {
      color: "#ff4081",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "#ff4081",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 10,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#ff4081",
      textShadow: "0 0 5px #ff4081",
      fontWeight: "bold",
    },
  },
  // Row 3
  {
    id: "yellow-glow",
    name: "Vàng phát sáng",
    style: {
      color: "#fadc19",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "#fadc19",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 10,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#fadc19",
      textShadow: "0 0 5px #fadc19",
      fontWeight: "bold",
    },
  },
  {
    id: "green-glow",
    name: "Lá phát sáng",
    style: {
      color: "#00ff00",
      strokeColor: "transparent",
      strokeWidth: 0,
      shadowColor: "#00ff00",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowBlur: 10,
      backgroundColor: "transparent",
    },
    previewStyle: {
      color: "#00ff00",
      textShadow: "0 0 5px #00ff00",
      fontWeight: "bold",
    },
  },
];

interface TextSectionProps {
  clipId?: string;
  clipIds?: string[];
}

/**
 * TextSection Component
 *
 * - 15.1: Display text content editor and styling controls
 */
export const TextSection: React.FC<TextSectionProps> = ({ clipId, clipIds }) => {
  const {
    getTextClip,
    updateTextContent,
    updateTextStyle,
    updateTextTransform,
    project,
  } = useProjectStore();
  const fontInputRef = useRef<HTMLInputElement>(null);

  const targetClipIds = useMemo(
    () => (clipIds && clipIds.length > 0 ? clipIds : clipId ? [clipId] : []),
    [clipId, clipIds],
  );
  const textClips = useMemo(
    () =>
      targetClipIds
        .map((id) => getTextClip(id))
        .filter((clip): clip is NonNullable<ReturnType<typeof getTextClip>> =>
          Boolean(clip),
        ),
    [targetClipIds, getTextClip, project.modifiedAt],
  );
  const textClip = textClips[0];
  const isBatchEditing = textClips.length > 1;

  const style = useMemo(() => {
    return {
      ...DEFAULT_TEXT_STYLE,
      ...(textClip?.style || {}),
    };
  }, [textClip?.style]);

  const text = textClip?.text || "";
  const canvasWidth = project.settings.width || 1920;
  const canvasHeight = project.settings.height || 1080;
  const transform = textClip?.transform || {
    position: { x: 0.5, y: 0.5 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0.5, y: 0.5 },
    opacity: 1,
  };

  const handleTextChange = useCallback(
    (newText: string) => {
      for (const clip of textClips) {
        updateTextContent(clip.id, newText);
      }
    },
    [textClips, updateTextContent],
  );

  const handleStyleChange = useCallback(
    async (changes: Partial<TextStyle>) => {
      if (changes.fontFamily) {
        try {
          const fontSize = style.fontSize || 48;
          await document.fonts.load(`${fontSize}px "${changes.fontFamily}"`);
        } catch {
          // Font load failed, continue anyway - browser will fallback
        }
      }
      for (const clip of textClips) {
        updateTextStyle(clip.id, changes);
      }
    },
    [textClips, updateTextStyle, style.fontSize],
  );

  const handleTransformChange = useCallback(
    (changes: Parameters<typeof updateTextTransform>[1]) => {
      for (const clip of textClips) {
        updateTextTransform(clip.id, changes);
      }
    },
    [textClips, updateTextTransform],
  );
  const handleEachTransformChange = useCallback(
    (getChanges: (transform: Transform) => Partial<Transform>) => {
      for (const clip of textClips) {
        updateTextTransform(clip.id, getChanges(clip.transform));
      }
    },
    [textClips, updateTextTransform],
  );

  const handleCenterHorizontal = useCallback(() => {
    const currentY = textClip?.transform?.position?.y ?? 0.5;
    for (const clip of textClips) {
      updateTextTransform(clip.id, {
        position: { x: 0.5, y: clip.transform.position.y ?? currentY },
      });
    }
  }, [textClip, textClips, updateTextTransform]);

  const handleCenterVertical = useCallback(() => {
    const currentX = textClip?.transform?.position?.x ?? 0.5;
    for (const clip of textClips) {
      updateTextTransform(clip.id, {
        position: { x: clip.transform.position.x ?? currentX, y: 0.5 },
      });
    }
  }, [textClip, textClips, updateTextTransform]);

  const handleCenterBoth = useCallback(() => {
    for (const clip of textClips) {
      updateTextTransform(clip.id, { position: { x: 0.5, y: 0.5 } });
    }
  }, [textClips, updateTextTransform]);

  const handleCustomFontSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const result = await registerCustomFont(file);
      if (!result.success) {
        toast.error("Font upload failed", result.error ?? "Unknown error.");
      } else {
        await handleStyleChange({ fontFamily: result.fontFamily });
        toast.success("Custom font uploaded", `${result.fontFamily} is ready to use.`);
      }

      event.target.value = "";
    },
    [handleStyleChange],
  );

  if (!textClip) {
    return (
      <div className="p-4 text-center">
        <Type size={24} className="mx-auto mb-2 text-text-muted" />
        <p className="text-[10px] text-text-muted">No text clip selected</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isBatchEditing && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-[10px] font-medium text-amber-300">
            Editing {textClips.length} selected text clips
          </p>
          <p className="text-[9px] text-text-muted">
            Style, geometry, and text content changes apply to all selected text clips.
          </p>
        </div>
      )}
      <div className="space-y-2">
        <span className="text-[10px] text-text-secondary">Text Content</span>
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Enter text..."
          className="w-full h-20 px-3 py-2 text-sm text-text-primary bg-background-tertiary border border-border rounded-lg resize-none outline-none focus:border-primary"
          style={{ fontFamily: style.fontFamily }}
        />
      </div>

      {/* Preset Styles Section */}
      <div className="space-y-2">
        <span className="text-[10px] text-text-secondary font-medium">Kiểu mặc định</span>
        <div className="grid grid-cols-6 gap-2 p-2 bg-background-tertiary rounded-lg max-h-[160px] overflow-y-auto">
          {TEXT_PRESETS.map((preset) => {
            const isNoStyle = preset.id === "none";
            return (
              <button
                key={preset.id}
                onClick={() => handleStyleChange(preset.style)}
                className="aspect-square bg-background-secondary hover:bg-background-elevated border border-border hover:border-primary rounded-md flex items-center justify-center transition-all p-1 relative overflow-hidden group"
                title={preset.name}
              >
                {isNoStyle ? (
                  <div className="w-5 h-5 rounded-full border border-text-muted relative flex items-center justify-center">
                    <div className="w-6 h-0.5 bg-text-muted rotate-45 absolute" />
                  </div>
                ) : (
                  <span
                    style={{
                      fontFamily: style.fontFamily,
                      fontSize: "12px",
                      lineHeight: "1",
                      ...preset.previewStyle,
                    }}
                  >
                    Aa
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
        <input
          ref={fontInputRef}
          type="file"
          accept={FONT_FILE_ACCEPT}
          onChange={handleCustomFontSelect}
          className="hidden"
        />
        <FontSelector
          value={style.fontFamily}
          onChange={(fontFamily) => handleStyleChange({ fontFamily })}
        />
        <button
          onClick={() => fontInputRef.current?.click()}
          className="w-full py-1.5 px-2 bg-background-secondary border border-border rounded text-[10px] text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center gap-1.5"
        >
          <Upload size={11} />
          Upload Custom Font
        </button>
        <NumberInput
          label="Size"
          value={style.fontSize}
          onChange={(fontSize) => handleStyleChange({ fontSize })}
          min={8}
          max={500}
          unit="px"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-secondary">Style</span>
          <div className="flex gap-1">
            <button
              onClick={() =>
                handleStyleChange({
                  fontWeight: style.fontWeight === "bold" ? "normal" : "bold",
                })
              }
              className={`p-1.5 rounded transition-colors ${
                style.fontWeight === "bold"
                  ? "bg-primary text-white"
                  : "bg-background-secondary border border-border text-text-secondary hover:text-text-primary"
              }`}
              title="Bold"
            >
              <Bold size={12} />
            </button>
            <button
              onClick={() =>
                handleStyleChange({
                  fontStyle: style.fontStyle === "italic" ? "normal" : "italic",
                })
              }
              className={`p-1.5 rounded transition-colors ${
                style.fontStyle === "italic"
                  ? "bg-primary text-white"
                  : "bg-background-secondary border border-border text-text-secondary hover:text-text-primary"
              }`}
              title="Italic"
            >
              <Italic size={12} />
            </button>
            <button
              onClick={() =>
                handleStyleChange({
                  textDecoration:
                    style.textDecoration === "underline" ? "none" : "underline",
                })
              }
              className={`p-1.5 rounded transition-colors ${
                style.textDecoration === "underline"
                  ? "bg-primary text-white"
                  : "bg-background-secondary border border-border text-text-secondary hover:text-text-primary"
              }`}
              title="Underline"
            >
              <Underline size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-secondary">Text Align</span>
        <ToggleButtonGroup
          options={[
            { value: "left", icon: <AlignLeft size={12} />, label: "Left" },
            {
              value: "center",
              icon: <AlignCenter size={12} />,
              label: "Center",
            },
            { value: "right", icon: <AlignRight size={12} />, label: "Right" },
          ]}
          value={style.textAlign}
          onChange={(textAlign) =>
            handleStyleChange({
              textAlign: textAlign as "left" | "center" | "right",
            })
          }
        />
      </div>

      <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
        <span className="text-[10px] text-text-secondary font-medium">
          Geometry
        </span>
        <NumberInput
          label="X"
          value={Math.round(transform.position.x * canvasWidth)}
          onChange={(x) =>
            handleEachTransformChange((current) => ({
              position: {
                ...current.position,
                x: x / canvasWidth,
              },
            }))
          }
          min={-canvasWidth}
          max={canvasWidth * 2}
          unit="px"
        />
        <NumberInput
          label="Y"
          value={Math.round(transform.position.y * canvasHeight)}
          onChange={(y) =>
            handleEachTransformChange((current) => ({
              position: {
                ...current.position,
                y: y / canvasHeight,
              },
            }))
          }
          min={-canvasHeight}
          max={canvasHeight * 2}
          unit="px"
        />
        <NumberInput
          label="Scale X"
          value={Math.round(transform.scale.x * 100)}
          onChange={(scaleX) =>
            handleEachTransformChange((current) => ({
              scale: {
                ...current.scale,
                x: scaleX / 100,
              },
            }))
          }
          min={-300}
          max={300}
          unit="%"
        />
        <NumberInput
          label="Scale Y"
          value={Math.round(transform.scale.y * 100)}
          onChange={(scaleY) =>
            handleEachTransformChange((current) => ({
              scale: {
                ...current.scale,
                y: scaleY / 100,
              },
            }))
          }
          min={-300}
          max={300}
          unit="%"
        />
        <NumberInput
          label="Rotation"
          value={Math.round(transform.rotation)}
          onChange={(rotation) => handleTransformChange({ rotation })}
          min={-360}
          max={360}
          unit="deg"
        />
        <NumberInput
          label="Opacity"
          value={Math.round(transform.opacity * 100)}
          onChange={(opacity) =>
            handleTransformChange({ opacity: opacity / 100 })
          }
          min={0}
          max={100}
          unit="%"
        />
      </div>

      <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
        <span className="text-[10px] text-text-secondary font-medium">
          Position on Canvas
        </span>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-muted">Align to Canvas</span>
          <div className="flex gap-1">
            <button
              onClick={handleCenterHorizontal}
              className="p-1.5 rounded bg-background-secondary border border-border text-text-secondary hover:text-text-primary transition-colors"
              title="Center Horizontally"
            >
              <AlignHorizontalJustifyCenter size={12} />
            </button>
            <button
              onClick={handleCenterVertical}
              className="p-1.5 rounded bg-background-secondary border border-border text-text-secondary hover:text-text-primary transition-colors"
              title="Center Vertically"
            >
              <AlignVerticalJustifyCenter size={12} />
            </button>
            <button
              onClick={handleCenterBoth}
              className="p-1.5 rounded bg-primary text-white transition-colors"
              title="Center Both"
            >
              <Crosshair size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
        <ColorField
          label="Text Color"
          value={style.color}
          onChange={(color) => handleStyleChange({ color })}
        />
        <ColorField
          label="Background"
          value={style.backgroundColor || "transparent"}
          onChange={(backgroundColor) => handleStyleChange({ backgroundColor })}
          showAlpha
          allowTransparent
        />
      </div>

      <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
        <span className="text-[10px] text-text-secondary font-medium">
          Stroke
        </span>
        <ColorField
          label="Color"
          value={style.strokeColor || "#000000"}
          onChange={(strokeColor) => handleStyleChange({ strokeColor })}
        />
        <NumberInput
          label="Width"
          value={style.strokeWidth || 0}
          onChange={(strokeWidth) => handleStyleChange({ strokeWidth })}
          min={0}
          max={20}
          unit="px"
        />
      </div>

      <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
        <span className="text-[10px] text-text-secondary font-medium">
          Shadow
        </span>
        <ColorField
          label="Color"
          value={style.shadowColor || "#000000"}
          onChange={(shadowColor) => handleStyleChange({ shadowColor })}
          showAlpha
        />
        <NumberInput
          label="Offset X"
          value={style.shadowOffsetX || 0}
          onChange={(shadowOffsetX) => handleStyleChange({ shadowOffsetX })}
          min={-50}
          max={50}
          unit="px"
        />
        <NumberInput
          label="Offset Y"
          value={style.shadowOffsetY || 0}
          onChange={(shadowOffsetY) => handleStyleChange({ shadowOffsetY })}
          min={-50}
          max={50}
          unit="px"
        />
        <NumberInput
          label="Blur"
          value={style.shadowBlur || 0}
          onChange={(shadowBlur) => handleStyleChange({ shadowBlur })}
          min={0}
          max={50}
          unit="px"
        />
      </div>

      <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
        <NumberInput
          label="Line Height"
          value={style.lineHeight || 1.2}
          onChange={(lineHeight) => handleStyleChange({ lineHeight })}
          min={0.5}
          max={3}
          step={0.1}
        />
        <NumberInput
          label="Letter Spacing"
          value={style.letterSpacing || 0}
          onChange={(letterSpacing) => handleStyleChange({ letterSpacing })}
          min={-10}
          max={50}
          unit="px"
        />
      </div>

      <Text3DControls clipId={textClip.id} />
    </div>
  );
};

// ─── 3D Text controls ─────────────────────────────────────────────

interface Text3DControlsProps {
  clipId: string;
}

type Text3DDefaults = {
  enabled: boolean;
  depth: number;
  bevelThickness: number;
  bevelSize: number;
  bevelSegments: number;
  material: "basic" | "physical";
  metalness: number;
  roughness: number;
};

const DEFAULT_TEXT_3D: Text3DDefaults = {
  enabled: true,
  depth: 12,
  bevelThickness: 1.5,
  bevelSize: 0.8,
  bevelSegments: 3,
  material: "physical",
  metalness: 0.4,
  roughness: 0.45,
};

const Text3DControls: React.FC<Text3DControlsProps> = ({ clipId }) => {
  const { getTextClip, updateText3D, project, updateClipRotate3D } = useProjectStore();
  const textClip = useMemo(
    () => getTextClip(clipId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clipId, getTextClip, project.modifiedAt],
  );
  const text3d = textClip?.text3d;
  const enabled = text3d?.enabled ?? false;

  const apply = useCallback(
    (changes: Partial<typeof DEFAULT_TEXT_3D>) => {
      const next = { ...(text3d ?? DEFAULT_TEXT_3D), ...changes };
      updateText3D(clipId, next);
    },
    [text3d, clipId, updateText3D],
  );

  return (
    <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-primary font-medium">
          3D Text
        </span>
        <button
          onClick={() => {
            if (enabled) {
              // Toggle off — preserve other params for re-enable.
              apply({ enabled: false });
            } else {
              apply({ ...DEFAULT_TEXT_3D, enabled: true });
              // Nudge the rotation a touch so depth is visible by default
              const rot = textClip?.transform.rotate3d ?? { x: 0, y: 0, z: 0 };
              if (rot.x === 0 && rot.y === 0) {
                updateClipRotate3D(clipId, { x: -10, y: 18, z: 0 });
              }
            }
          }}
          className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
            enabled
              ? "bg-primary/20 border-primary text-primary"
              : "bg-background-tertiary border-border text-text-secondary hover:border-primary/50"
          }`}
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>
      {enabled && (
        <>
          <NumberInput
            label="Depth"
            value={text3d?.depth ?? DEFAULT_TEXT_3D.depth}
            onChange={(depth) => apply({ depth })}
            min={1}
            max={120}
            step={1}
            unit="px"
          />
          <NumberInput
            label="Bevel Thickness"
            value={text3d?.bevelThickness ?? DEFAULT_TEXT_3D.bevelThickness}
            onChange={(bevelThickness) => apply({ bevelThickness })}
            min={0}
            max={20}
            step={0.1}
          />
          <NumberInput
            label="Bevel Size"
            value={text3d?.bevelSize ?? DEFAULT_TEXT_3D.bevelSize}
            onChange={(bevelSize) => apply({ bevelSize })}
            min={0}
            max={10}
            step={0.1}
          />
          <NumberInput
            label="Bevel Segments"
            value={text3d?.bevelSegments ?? DEFAULT_TEXT_3D.bevelSegments}
            onChange={(bevelSegments) => apply({ bevelSegments: Math.max(1, Math.round(bevelSegments)) })}
            min={1}
            max={8}
            step={1}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-secondary">Material</span>
            <div className="flex gap-1">
              {(["basic", "physical"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => apply({ material: m })}
                  className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                    (text3d?.material ?? "physical") === m
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-background-tertiary border-border text-text-secondary hover:border-primary/50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          {(text3d?.material ?? "physical") === "physical" && (
            <>
              <NumberInput
                label="Metalness"
                value={text3d?.metalness ?? DEFAULT_TEXT_3D.metalness}
                onChange={(metalness) => apply({ metalness: Math.max(0, Math.min(1, metalness)) })}
                min={0}
                max={1}
                step={0.05}
              />
              <NumberInput
                label="Roughness"
                value={text3d?.roughness ?? DEFAULT_TEXT_3D.roughness}
                onChange={(roughness) => apply({ roughness: Math.max(0, Math.min(1, roughness)) })}
                min={0}
                max={1}
                step={0.05}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};

export default TextSection;
