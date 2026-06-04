import React from "react";
import type { Clip, FitMode, Transform } from "@openreel/core";
import { LabeledSlider } from "@openreel/ui";
import {
  CropSection,
  AlignmentSection,
  BlendingSection,
  Transform3DSection,
} from "../";
import { InspectorSection } from "../shell/InspectorSection";
import { useTranslation } from "../../../../hooks/use-translation";

interface TransformTabClip {
  id: string;
  mediaId: string;
}

export interface TransformTabProps {
  clipId: string;
  clipIds?: string[];
  clipType: string | null;
  selectedClip: TransformTabClip | null;
  showTransformControls: boolean;
  showVideoControls: boolean;
  transform: Transform;
  handleTransformChange: (changes: Partial<Transform>) => void;
}

export const TransformTab: React.FC<TransformTabProps> = ({
  clipId,
  clipIds,
  clipType,
  selectedClip,
  showTransformControls,
  showVideoControls,
  transform,
  handleTransformChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {showTransformControls && (
        <>
          <InspectorSection title={t("inspector.sections.transform", "Transform")} sectionId="transform">
            <div className="space-y-3">
              <LabeledSlider
                label={t("inspector.transform.pos_x", "Position X")}
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
                defaultValue={0}
              />
              <LabeledSlider
                label={t("inspector.transform.pos_y", "Position Y")}
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
                defaultValue={0}
              />
              <LabeledSlider
                label={t("inspector.transform.scale_x", "Scale X")}
                value={transform.scale.x * 100}
                onChange={(x) =>
                  handleTransformChange({
                    scale: { ...transform.scale, x: x / 100 },
                  })
                }
                min={0}
                max={300}
                step={1}
                unit="%"
                defaultValue={100}
              />
              <LabeledSlider
                label={t("inspector.transform.scale_y", "Scale Y")}
                value={transform.scale.y * 100}
                onChange={(y) =>
                  handleTransformChange({
                    scale: { ...transform.scale, y: y / 100 },
                  })
                }
                min={0}
                max={300}
                step={1}
                unit="%"
                defaultValue={100}
              />
              <LabeledSlider
                label={t("inspector.transform.rotation", "Rotation")}
                value={transform.rotation}
                onChange={(rotation) => handleTransformChange({ rotation })}
                min={-180}
                max={180}
                step={1}
                unit="°"
                defaultValue={0}
              />
              <LabeledSlider
                label={t("inspector.transform.opacity", "Opacity")}
                value={transform.opacity * 100}
                onChange={(opacity) =>
                  handleTransformChange({ opacity: opacity / 100 })
                }
                min={0}
                max={100}
                step={1}
                unit="%"
                defaultValue={100}
              />
              <LabeledSlider
                label={t("inspector.transform.border_radius", "Border Radius")}
                value={transform.borderRadius || 0}
                onChange={(borderRadius) =>
                  handleTransformChange({ borderRadius })
                }
                min={0}
                max={200}
                step={1}
                unit="px"
                defaultValue={0}
              />
              {(clipType === "image" || clipType === "video") && (
                <div className="space-y-1 pt-2 border-t border-border">
                  <span className="text-[10px] text-text-secondary">
                    {t("inspector.transform.fit_mode", "Fit Mode")}
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {(["contain", "cover", "stretch"] as FitMode[]).map(
                      (mode) => {
                        const activeMode =
                          !transform.fitMode || transform.fitMode === "none"
                            ? "contain"
                            : transform.fitMode;
                        return (
                          <button
                            key={mode}
                            onClick={() =>
                              handleTransformChange({ fitMode: mode })
                            }
                            className={`py-1.5 rounded text-[9px] capitalize transition-colors ${
                              activeMode === mode
                                ? "bg-primary text-white"
                                : "bg-background-tertiary border border-border text-text-secondary hover:text-text-primary"
                            }`}
                          >
                            {mode === "contain"
                              ? t("inspector.transform.fit", "Fit")
                              : mode === "cover"
                                ? t("inspector.transform.fill", "Fill")
                                : t("inspector.transform.stretch", "Stretch")}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              )}
            </div>
          </InspectorSection>
        </>
      )}

      {showVideoControls &&
        selectedClip &&
        !selectedClip.mediaId.startsWith("text-") &&
        !selectedClip.mediaId.startsWith("shape-") &&
        !selectedClip.mediaId.startsWith("svg-") &&
        !selectedClip.mediaId.startsWith("sticker-") && (
          <InspectorSection title={t("inspector.sections.crop", "Crop")} sectionId="crop" defaultOpen={false}>
            <CropSection clip={selectedClip as Clip} />
          </InspectorSection>
        )}

      {(clipType === "video" ||
        clipType === "image" ||
        clipType === "text" ||
        clipType === "shape" ||
        clipType === "svg" ||
        clipType === "sticker") && (
        <InspectorSection
          title={t("inspector.sections.alignment", "Alignment")}
          sectionId="alignment"
          defaultOpen={false}
        >
          <AlignmentSection clipId={clipId} clipIds={clipIds} />
        </InspectorSection>
      )}

      {(clipType === "video" ||
        clipType === "image" ||
        clipType === "text" ||
        clipType === "shape" ||
        clipType === "svg" ||
        clipType === "sticker") && (
        <InspectorSection
          title={t("inspector.sections.blending", "Blending")}
          sectionId="blending"
          defaultOpen={false}
        >
          <BlendingSection clipId={clipId} clipIds={clipIds} />
        </InspectorSection>
      )}

      {(clipType === "video" ||
        clipType === "image" ||
        clipType === "text" ||
        clipType === "shape" ||
        clipType === "svg" ||
        clipType === "sticker") && (
        <InspectorSection
          title={t("inspector.sections.transform_3d", "3D Transforms")}
          sectionId="transform-3d"
          defaultOpen={false}
        >
          <Transform3DSection clipId={clipId} clipIds={clipIds} />
        </InspectorSection>
      )}
    </>
  );
};

