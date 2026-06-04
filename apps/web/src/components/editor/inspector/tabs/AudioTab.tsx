import React from "react";
import {
  AutoCutSilenceSection,
  AudioTextSyncPanel,
  NoiseReductionSection,
  AudioEffectsSection,
  AudioDuckingSection,
} from "../";
import { InspectorSection } from "../shell/InspectorSection";
import { LabeledSlider } from "@openreel/ui";
import { useTranslation } from "../../../../hooks/use-translation";

export interface AudioTabProps {
  clipId: string;
  clipType: string | null;
  showAudioEffects: boolean;
  noiseReductionSectionTitle: string;
  selectedNoiseReductionEffect: unknown;
  volume: number;
  onChangeVolume: (vol: number) => void;
}

export const AudioTab: React.FC<AudioTabProps> = ({
  clipId,
  clipType,
  showAudioEffects,
  noiseReductionSectionTitle,
  selectedNoiseReductionEffect,
  volume,
  onChangeVolume,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {showAudioEffects && (
        <InspectorSection
          title={t("inspector.sections.volume", "Volume")}
          sectionId="volume"
          defaultOpen={true}
        >
          <div className="space-y-3 p-3 bg-background-secondary rounded-lg border border-border/50">
            <LabeledSlider
              label={t("inspector.sections.volume", "Volume")}
              value={Math.round(volume * 100)}
              onChange={onChangeVolume}
              min={0}
              max={400}
              step={1}
              unit="%"
            />
            <div className="flex justify-between text-[10px] text-text-muted mt-1 px-1">
              <span>{t("inspector.quick_actions.mute", "Mute")}</span>
              <span>100% ({t("inspector.quick_actions.normal", "Normal")})</span>
              <span>400% ({t("inspector.quick_actions.boost", "Boost")})</span>
            </div>
          </div>
        </InspectorSection>
      )}

      {showAudioEffects && (
        <InspectorSection
          title={t("inspector.sections.cut_silence", "Auto Cut Silence")}
          sectionId="auto-cut-silence"
          defaultOpen={false}
        >
          <AutoCutSilenceSection clipId={clipId} />
        </InspectorSection>
      )}
      {clipType === "audio" && (
        <InspectorSection
          title={t("inspector.sections.beat_sync", "Beat Sync")}
          sectionId="beat-sync"
          defaultOpen={false}
        >
          <AudioTextSyncPanel clipId={clipId} />
        </InspectorSection>
      )}
      {showAudioEffects && (
        <InspectorSection
          title={noiseReductionSectionTitle}
          sectionId="background-noise-removal"
          defaultOpen={Boolean(selectedNoiseReductionEffect)}
        >
          <NoiseReductionSection clipId={clipId} />
        </InspectorSection>
      )}
      {showAudioEffects && (
        <>
          <InspectorSection
            title={t("inspector.sections.audio_effects", "Audio Effects")}
            sectionId="audio-effects"
            defaultOpen={false}
          >
            <AudioEffectsSection clipId={clipId} />
          </InspectorSection>
        </>
      )}
      {showAudioEffects && (
        <InspectorSection
          title={t("inspector.sections.audio_ducking", "Audio Ducking")}
          sectionId="audio-ducking"
          defaultOpen={false}
        >
          <AudioDuckingSection clipId={clipId} />
        </InspectorSection>
      )}
    </>
  );
};

export default AudioTab;
