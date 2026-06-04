import React from "react";
import { Sparkles, Trash2, Zap } from "lucide-react";
import type {
  AppliedEditingTemplate,
  Clip,
  EditingTemplate,
  EditingTemplatePrimitive,
} from "@openreel/core";
import { LabeledSlider, Switch } from "@openreel/ui";
import {
  VideoEffectsSection,
  GreenScreenSection,
  PiPSection,
  MaskSection,
  MotionTrackingSection,
  NestedSequenceSection,
  AdjustmentLayerSection,
  BackgroundRemovalSection,
  BehindSubjectSection,
} from "../";
import { InspectorSection } from "../shell/InspectorSection";
import {
  EditingTemplateControls,
  mergeEditingTemplateControlValues,
} from "../../panels/EditingTemplateControls";
import { toast } from "../../../../stores/notification-store";
import { ParticleEffectsSectionWrapper } from "./ParticleEffectsSectionWrapper";
import { useTranslation } from "../../../../hooks/use-translation";

interface EffectsTabClip {
  duration: number;
  startTime: number;
}

export interface EffectsTabProps {
  clipId: string;
  clipType: string | null;
  selectedClip: EffectsTabClip | null;
  selectedTimelineClip: Clip | null;
  showVideoControls: boolean;
  showVideoEffects: boolean;
  showTextSection: boolean;
  appliedEditingTemplates: AppliedEditingTemplate[];
  getEditingTemplate: (templateId: string) => EditingTemplate | undefined;
  removeEditingTemplateApplication: (
    clipId: string,
    applicationId: string,
  ) => boolean;
  expandedRecipeApplicationId: string | null;
  setExpandedRecipeApplicationId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  recipeControlValues: Record<
    string,
    Record<string, EditingTemplatePrimitive>
  >;
  setRecipeControlValues: React.Dispatch<
    React.SetStateAction<
      Record<string, Record<string, EditingTemplatePrimitive>>
    >
  >;
  handleRecipeControlChange: (
    applicationId: string,
    controlId: string,
    value: EditingTemplatePrimitive,
  ) => void;
  handleToggleRecipeControls: (
    applicationId: string,
    templateId: string,
    controlValues?: Record<string, unknown>,
  ) => void;
  handleResetRecipeControls: (
    applicationId: string,
    templateId: string,
    controlValues?: Record<string, unknown>,
  ) => void;
  handleUpdateRecipeControls: (
    applicationId: string,
    templateId: string,
    controlValues?: Record<string, unknown>,
  ) => void;
  chromaKeyEnabled: boolean;
  keyColor: string;
  tolerance: number;
  handleChromaKeyToggle: (enabled: boolean) => void;
  handleKeyColorChange: (hexColor: string) => void;
  handleToleranceChange: (tolerance: number) => void;
}

export const EffectsTab: React.FC<EffectsTabProps> = ({
  clipId,
  clipType,
  selectedClip,
  selectedTimelineClip,
  showVideoControls,
  showVideoEffects,
  showTextSection,
  appliedEditingTemplates,
  getEditingTemplate,
  removeEditingTemplateApplication,
  expandedRecipeApplicationId,
  setExpandedRecipeApplicationId,
  recipeControlValues,
  setRecipeControlValues,
  handleRecipeControlChange,
  handleToggleRecipeControls,
  handleResetRecipeControls,
  handleUpdateRecipeControls,
  chromaKeyEnabled,
  keyColor,
  tolerance,
  handleChromaKeyToggle,
  handleKeyColorChange,
  handleToleranceChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {showVideoControls && selectedTimelineClip && (appliedEditingTemplates.length > 0 || (selectedTimelineClip.effects && selectedTimelineClip.effects.length > 0)) && (
        <InspectorSection
          title={t("inspector.applied", "Applied ({{count}})", {
            count: appliedEditingTemplates.length + (selectedTimelineClip.effects?.filter((e: { metadata?: { templateSource?: unknown } }) => !e.metadata?.templateSource).length || 0)
          })}
          sectionId="applied-effects"
          defaultOpen={true}
        >
          <div className="space-y-2">
            {appliedEditingTemplates.map((application) => {
              const template = getEditingTemplate(application.templateId);
              const canEdit = Boolean(template?.controls?.length);
              const isExpanded =
                expandedRecipeApplicationId === application.applicationId;
              const currentControlValues = template
                ? recipeControlValues[application.applicationId] ||
                  mergeEditingTemplateControlValues(
                    template,
                    application.controlValues,
                  )
                : undefined;

              return (
                <div
                  key={application.applicationId}
                  className="rounded-lg border border-border bg-background-tertiary/70 px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <Sparkles size={11} className="text-primary shrink-0" />
                      <p className="truncate text-[11px] font-medium text-text-primary">
                        {application.name}
                      </p>
                      <span className="text-[9px] text-text-muted capitalize shrink-0">
                        {application.category?.replace(/-/g, " ") || "recipe"}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {canEdit && (
                        <button
                          onClick={() =>
                            handleToggleRecipeControls(
                              application.applicationId,
                              application.templateId,
                              application.controlValues,
                            )
                          }
                          className={`h-6 px-1.5 rounded text-[9px] font-medium transition-colors ${
                            isExpanded
                              ? "bg-primary/15 text-primary"
                              : "text-text-muted hover:text-text-primary"
                          }`}
                        >
                          {t("inspector.edit", "Edit")}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const removed = removeEditingTemplateApplication(
                            selectedTimelineClip.id,
                            application.applicationId,
                          );
                          if (!removed) {
                            toast.error("Could not remove recipe", "The recipe could not be removed from this clip.");
                            return;
                          }
                          setRecipeControlValues((current) => {
                            const next = { ...current };
                            delete next[application.applicationId];
                            return next;
                          });
                          if (expandedRecipeApplicationId === application.applicationId) {
                            setExpandedRecipeApplicationId(null);
                          }
                        }}
                        className="h-6 px-1.5 rounded text-text-muted hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && template && currentControlValues && (
                    <div className="mt-2 space-y-3 rounded-lg border border-border/80 bg-background-secondary/80 p-2.5">
                      <EditingTemplateControls
                        template={template}
                        values={currentControlValues}
                        onChange={(controlId, value) =>
                          handleRecipeControlChange(
                            application.applicationId,
                            controlId,
                            value,
                          )
                        }
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() =>
                            handleResetRecipeControls(
                              application.applicationId,
                              application.templateId,
                              application.controlValues,
                            )
                          }
                          className="h-6 px-2.5 rounded border border-border text-[9px] font-medium text-text-secondary hover:text-text-primary transition-colors"
                        >
                          {t("inspector.reset", "Reset")}
                        </button>
                        <button
                          onClick={() =>
                            handleUpdateRecipeControls(
                              application.applicationId,
                              application.templateId,
                              application.controlValues,
                            )
                          }
                          className="h-6 px-2.5 rounded bg-primary text-[9px] font-semibold text-black hover:bg-primary/85 transition-colors"
                        >
                          {t("inspector.update", "Update")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {selectedTimelineClip.effects
              ?.filter((e: { metadata?: { templateSource?: unknown } }) => !e.metadata?.templateSource)
              .map((effect: { id: string; type: string; enabled?: boolean }) => (
                <div
                  key={effect.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background-tertiary/70 px-2.5 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap size={11} className="text-amber-400 shrink-0" />
                    <p className="truncate text-[11px] font-medium text-text-primary capitalize">
                      {effect.type.replace(/-/g, " ")}
                    </p>
                  </div>
                  <span className={`text-[9px] font-medium ${effect.enabled !== false ? "text-green-400" : "text-text-muted"}`}>
                    {effect.enabled !== false ? t("inspector.on", "On") : t("inspector.off", "Off")}
                  </span>
                </div>
              ))}
          </div>
        </InspectorSection>
      )}

      {clipType === "video" && (
        <InspectorSection title={t("inspector.sections.bg_removal", "Background Removal")} sectionId="background-removal" defaultOpen={false}>
          <BackgroundRemovalSection clipId={clipId} />
        </InspectorSection>
      )}

      {/* Particle Effects - Visual particle systems */}
      {(clipType === "video" ||
        clipType === "image" ||
        clipType === "text" ||
        clipType === "shape" ||
        clipType === "svg" ||
        clipType === "sticker") &&
        selectedClip && (
          <InspectorSection
            title={t("inspector.sections.particle_effects", "Particle Effects")}
            sectionId="particle-effects"
            defaultOpen={false}
          >
            <ParticleEffectsSectionWrapper
              clipId={clipId}
              clipDuration={selectedClip.duration}
              clipStartTime={selectedClip.startTime}
            />
          </InspectorSection>
        )}

      {/* Chroma Key - Using ChromaKeyEngine - Only for video/image */}
      {showVideoControls && (
        <InspectorSection title={t("inspector.sections.chroma_key", "Chroma Key (Green Screen)")}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-secondary">
                {t("inspector.enable", "Enable")}
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
                    {t("inspector.key_color", "Key Color")}
                  </span>
                  <input
                    type="color"
                    value={keyColor}
                    onChange={(e) => handleKeyColorChange(e.target.value)}
                    className="w-8 h-6 rounded border border-border cursor-pointer"
                  />
                </div>
                <LabeledSlider
                  label={t("inspector.tolerance", "Tolerance")}
                  value={tolerance}
                  onChange={handleToleranceChange}
                  unit="%"
                />
              </>
            )}
          </div>
        </InspectorSection>
      )}

      {/* Motion Tracking - Using MotionTrackingEngine - Only for video/image */}
      {showVideoControls && (
        <InspectorSection title={t("inspector.sections.motion_tracking", "Motion Tracking")} sectionId="motion-tracking">
          <MotionTrackingSection clipId={clipId} />
        </InspectorSection>
      )}

      {showVideoEffects && (
        <InspectorSection title={t("inspector.sections.video_effects", "Video Effects")} sectionId="video-effects">
          <VideoEffectsSection clipId={clipId} />
        </InspectorSection>
      )}

      {showVideoEffects && (
        <InspectorSection
          title={t("inspector.sections.green_screen", "Green Screen")}
          sectionId="green-screen"
          defaultOpen={false}
        >
          <GreenScreenSection clipId={clipId} />
        </InspectorSection>
      )}

      {/* Picture-in-Picture Section */}
      {showVideoControls && (
        <InspectorSection
          title={t("inspector.sections.pip", "Picture-in-Picture")}
          sectionId="pip"
          defaultOpen={false}
        >
          <PiPSection clipId={clipId} />
        </InspectorSection>
      )}

      {showVideoControls && (
        <InspectorSection title={t("inspector.sections.masking", "Masking")} sectionId="masking" defaultOpen={false}>
          <MaskSection clipId={clipId} />
        </InspectorSection>
      )}

      {showVideoControls && (
        <InspectorSection title={t("inspector.sections.nested_sequences", "Nested Sequences")} defaultOpen={false}>
          <NestedSequenceSection clipId={clipId} />
        </InspectorSection>
      )}

      {showVideoControls && (
        <InspectorSection title={t("inspector.sections.adjustment_layers", "Adjustment Layers")} defaultOpen={false}>
          <AdjustmentLayerSection clipId={clipId} />
        </InspectorSection>
      )}

      {showTextSection && (
        <InspectorSection
          title={t("inspector.sections.text_behind", "Text Behind Subject")}
          sectionId="text-behind-subject"
          defaultOpen={false}
        >
          <BehindSubjectSection clipId={clipId} />
        </InspectorSection>
      )}
    </>
  );
};

