import React from "react";
import {
  KeyframesSection,
  ClipTransitionSection,
  MotionPresetsPanel,
  MotionPathSection,
  EmphasisAnimationSection,
  TextAnimationSection,
} from "../";
import { InspectorSection } from "../shell/InspectorSection";
import { useTranslation } from "../../../../hooks/use-translation";

export interface AnimateTabProps {
  clipId: string;
  clipType: string | null;
  showTextSection: boolean;
}

export const AnimateTab: React.FC<AnimateTabProps> = ({
  clipId,
  clipType,
  showTextSection,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <InspectorSection title={t("inspector.sections.keyframes", "Keyframes")} sectionId="keyframes">
        <KeyframesSection clipId={clipId} />
      </InspectorSection>
      {(clipType === "video" ||
        clipType === "image" ||
        clipType === "text" ||
        clipType === "shape" ||
        clipType === "svg" ||
        clipType === "sticker") && (
        <InspectorSection
          title={t("inspector.sections.transitions", "Transitions")}
          sectionId="transitions"
          defaultOpen={false}
        >
          <ClipTransitionSection clipId={clipId} />
        </InspectorSection>
      )}
      {(clipType === "video" ||
        clipType === "image" ||
        clipType === "shape" ||
        clipType === "svg" ||
        clipType === "sticker") && (
        <InspectorSection
          title={t("inspector.sections.motion_presets", "Motion Presets")}
          sectionId="motion-presets"
          defaultOpen={false}
        >
          <MotionPresetsPanel clipId={clipId} />
        </InspectorSection>
      )}
      {(clipType === "video" ||
        clipType === "image" ||
        clipType === "text" ||
        clipType === "shape" ||
        clipType === "svg" ||
        clipType === "sticker") && (
        <InspectorSection
          title={t("inspector.sections.motion_path", "Motion Path")}
          sectionId="motion-path"
          defaultOpen={false}
        >
          <MotionPathSection clipId={clipId} />
        </InspectorSection>
      )}
      {(clipType === "video" ||
        clipType === "image" ||
        clipType === "text" ||
        clipType === "shape" ||
        clipType === "svg" ||
        clipType === "sticker") && (
        <InspectorSection
          title={t("inspector.sections.emphasis_animation", "Emphasis Animation")}
          sectionId="emphasis-animation"
          defaultOpen={false}
        >
          <EmphasisAnimationSection clipId={clipId} />
        </InspectorSection>
      )}
      {showTextSection && (
        <InspectorSection
          title={t("inspector.sections.text_animation", "Text Animation")}
          sectionId="text-animation"
          defaultOpen={false}
        >
          <TextAnimationSection clipId={clipId} />
        </InspectorSection>
      )}
    </>
  );
};

export default AnimateTab;
