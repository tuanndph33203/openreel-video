import React from "react";
import { TextSection, ShapeSection, SVGSection } from "../";
import { InspectorSection } from "../shell/InspectorSection";
import { useTranslation } from "../../../../hooks/use-translation";

export interface StyleTabProps {
  clipId: string;
  clipIds?: string[];
  showTextSection: boolean;
  showShapeSection: boolean;
  showSVGSection: boolean;
}

export const StyleTab: React.FC<StyleTabProps> = ({
  clipId,
  clipIds,
  showTextSection,
  showShapeSection,
  showSVGSection,
}) => {
  const { t } = useTranslation();

  return (
    <>
      {showTextSection && (
        <InspectorSection title={t("inspector.sections.text_properties", "Text Properties")} sectionId="text-properties">
          <TextSection clipId={clipId} clipIds={clipIds} />
        </InspectorSection>
      )}
      {showShapeSection && (
        <InspectorSection title={t("inspector.sections.shape_properties", "Shape Properties")} sectionId="shape-properties">
          <ShapeSection clipId={clipId} />
        </InspectorSection>
      )}
      {showSVGSection && (
        <InspectorSection title={t("inspector.sections.svg_properties", "SVG Properties")}>
          <SVGSection clipId={clipId} />
        </InspectorSection>
      )}
    </>
  );
};

