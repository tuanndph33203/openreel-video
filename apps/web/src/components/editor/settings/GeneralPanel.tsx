import React from "react";
import { Switch } from "@openreel/ui";
import { Label } from "@openreel/ui";
import { useSettingsStore, SERVICE_REGISTRY, type TtsProvider, type LlmProvider, type AggregatorProvider } from "../../../stores/settings-store";
import { useTranslation } from "../../../hooks/use-translation";

export const GeneralPanel: React.FC = () => {
  const {
    autoSave,
    autoSaveInterval,
    language,
    defaultTtsProvider,
    defaultLlmProvider,
    defaultAggregator,
    configuredServices,
    setAutoSave,
    setAutoSaveInterval,
    setLanguage,
    setDefaultTtsProvider,
    setDefaultLlmProvider,
    setDefaultAggregator,
  } = useSettingsStore();

  const { t } = useTranslation();

  const ttsProviders = [
    { id: "piper", label: "Piper (Free / Built-in)" },
    ...SERVICE_REGISTRY.filter(
      (s) => s.id === "elevenlabs" || configuredServices.includes(s.id),
    ),
  ];

  const llmProviders = SERVICE_REGISTRY.filter(
    (s) =>
      s.id === "openai" ||
      s.id === "anthropic" ||
      configuredServices.includes(s.id),
  );

  const aggregatorProviders = SERVICE_REGISTRY.filter(
    (s) =>
      s.id === "kie-ai" ||
      s.id === "freepik" ||
      configuredServices.includes(s.id),
  );

  return (
    <div className="space-y-6 pb-4">
      {/* Language Selection */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-text-primary">
          {t("settings.general.language")}
        </h3>
        <div className="flex items-center justify-between">
          <Label className="text-sm text-text-secondary">
            {t("settings.general.language_select")}
          </Label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
          >
            <option value="en">English</option>
            <option value="vi">Tiếng Việt</option>
          </select>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Auto-save */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-text-primary">
          {t("settings.general.auto_save_title")}
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm text-text-secondary">
              {t("settings.general.auto_save_enable")}
            </Label>
            <p className="text-xs text-text-muted mt-0.5">
              {t("settings.general.auto_save_desc")}
            </p>
          </div>
          <Switch checked={autoSave} onCheckedChange={setAutoSave} />
        </div>

        {autoSave && (
          <div className="flex items-center gap-3">
            <Label className="text-sm text-text-secondary whitespace-nowrap">
              {t("settings.general.save_every")}
            </Label>
            <select
              value={autoSaveInterval}
              onChange={(e) => setAutoSaveInterval(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value={1}>{t("settings.general.time.minute")}</option>
              <option value={2}>{t("settings.general.time.minutes", { count: 2 })}</option>
              <option value={5}>{t("settings.general.time.minutes", { count: 5 })}</option>
              <option value={10}>{t("settings.general.time.minutes", { count: 10 })}</option>
              <option value={15}>{t("settings.general.time.minutes", { count: 15 })}</option>
              <option value={30}>{t("settings.general.time.minutes", { count: 30 })}</option>
            </select>
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Default providers */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-text-primary">
          {t("settings.general.ai_providers_title")}
        </h3>
        <p className="text-xs text-text-muted">
          {t("settings.general.ai_providers_desc")}
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-text-secondary">
              {t("settings.general.tts_label")}
            </Label>
            <select
              value={defaultTtsProvider}
              onChange={(e) => setDefaultTtsProvider(e.target.value as TtsProvider)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
            >
              {ttsProviders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm text-text-secondary">
              {t("settings.general.llm_label")}
            </Label>
            <select
              value={defaultLlmProvider}
              onChange={(e) => setDefaultLlmProvider(e.target.value as LlmProvider)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
            >
              {llmProviders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm text-text-secondary">
                {t("settings.general.aggregator_label")}
              </Label>
              <p className="text-xs text-text-muted mt-0.5">
                {t("settings.general.aggregator_desc")}
              </p>
            </div>
            <select
              value={defaultAggregator}
              onChange={(e) => setDefaultAggregator(e.target.value as AggregatorProvider)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]"
            >
              {aggregatorProviders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
