import React, { useState, useCallback } from "react";
import { Sparkles, Play, Clock, Copy, BookOpen, Tag, Check, AlertCircle, Loader2, Settings, ChevronDown } from "lucide-react";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { generateVideoInsights, type VideoInsights } from "@openreel/core";
import { getSecret, isSessionUnlocked } from "../../../services/secure-storage";
import { useSettingsStore } from "../../../stores/settings-store";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Slider,
} from "@openreel/ui";

export const VideoSummaryPanel: React.FC = () => {
  const [insights, setInsights] = useState<VideoInsights | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "chapters" | "seo">("summary");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // AI Configuration states specific to Insights
  const [insightsAiProvider, setInsightsAiProvider] = useState<"openai" | "anthropic" | "gemini">("openai");
  const [insightsModelType, setInsightsModelType] = useState<string>("mimo-v2.5");
  const [insightsCustomModelName, setInsightsCustomModelName] = useState<string>("");
  const [insightsTemperature, setInsightsTemperature] = useState<number>(0.7);
  const [insightsSeoLanguages, setInsightsSeoLanguages] = useState<string[]>(["vi", "en"]);
  const [selectedSeoLang, setSelectedSeoLang] = useState<string>("vi");
  const [showSettings, setShowSettings] = useState(false);

  const project = useProjectStore((s) => s.project);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const setPlayheadPosition = useTimelineStore((s) => s.setPlayheadPosition);
  
  const subtitles = useProjectStore((s) => s.project?.timeline?.subtitles || []);
  const hasSubtitles = subtitles.length > 0;

  const saveInsightsConfig = useCallback((updates: Partial<NonNullable<typeof project.settings.automationConfig>>) => {
    if (!project) return;
    const currentConfig = project.settings?.automationConfig || { autoCaption: true, tts: false };
    updateSettings({
      automationConfig: {
        ...currentConfig,
        ...updates
      }
    });
  }, [project, updateSettings]);

  // Load settings on mount / project change
  React.useEffect(() => {
    if (project) {
      const config = project.settings?.automationConfig;
      if (config) {
        if (config.insightsAiProvider !== undefined) {
          setInsightsAiProvider(config.insightsAiProvider);
        }
        if (config.insightsCustomModel !== undefined) {
          const m = config.insightsCustomModel;
          const standardModels = [
            "gpt-4o", "gpt-4o-mini", "mimo-v2.5", "o1", "o3-mini",
            "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022",
            "gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"
          ];
          if (standardModels.includes(m)) {
            setInsightsModelType(m);
          } else {
            setInsightsModelType("custom");
            setInsightsCustomModelName(m);
          }
        }
        if (config.insightsTemperature !== undefined) {
          setInsightsTemperature(config.insightsTemperature);
        }
        if (config.insightsSeoLanguages !== undefined && Array.isArray(config.insightsSeoLanguages)) {
          setInsightsSeoLanguages(config.insightsSeoLanguages);
        }
      }
    }
  }, [project?.id]);

  const handleCopy = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!project || subtitles.length === 0) return;

    setError(null);
    setIsGenerating(true);

    try {
      const config = project.settings?.automationConfig;
      const aiProvider = insightsAiProvider;
      
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

      // Determine model name to send
      const resolvedCustomModel = insightsModelType === "custom"
        ? insightsCustomModelName.trim()
        : insightsModelType;

      const settingsState = useSettingsStore.getState();
      const customBaseUrl = aiProvider === "openai"
        ? settingsState.customOpenAiBaseUrl
        : aiProvider === "anthropic"
          ? settingsState.customAnthropicBaseUrl
          : settingsState.customGeminiBaseUrl;

      const aiConfig = {
        provider: aiProvider,
        apiKey,
        tone: config?.aiTone || "natural and fluent",
        videoContext: config?.videoContext || undefined,
        customBaseUrl: customBaseUrl || undefined,
        customModel: resolvedCustomModel || undefined,
        temperature: insightsTemperature,
        seoLanguages: insightsSeoLanguages,
      };

      const result = await generateVideoInsights(subtitles, aiConfig as any);
      setInsights(result);

      const seoKeys = result.seo ? Object.keys(result.seo) : [];
      if (seoKeys.length > 0 && !("titleSuggestions" in result.seo)) {
        setSelectedSeoLang(seoKeys[0]);
      }
    } catch (err) {
      console.error("[VideoSummaryPanel] Failed to generate insights:", err);
      setError(err instanceof Error ? err.message : "Failed to generate video insights.");
    } finally {
      setIsGenerating(false);
    }
  }, [project, subtitles, insightsAiProvider, insightsModelType, insightsCustomModelName, insightsTemperature, insightsSeoLanguages]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!hasSubtitles) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-background-tertiary/30 rounded-lg border border-border/60 text-center space-y-3">
        <AlertCircle className="text-text-muted" size={24} />
        <h4 className="text-[11px] font-bold text-text-primary">Chưa có phụ đề</h4>
        <p className="text-[9px] text-text-muted max-w-[200px] leading-relaxed">
          Vui lòng tạo phụ đề tự động bằng AI Auto-Captions trước để Mimo có thể phân tích nội dung video của bạn.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Generate / Action Button */}
      {!insights && (
        <div className="p-3 bg-background-tertiary/20 rounded-lg border border-border/40 space-y-3">
          <p className="text-[9px] text-text-muted leading-relaxed px-1">
            Sử dụng mô hình Mimo hoặc mô hình tự chọn để tóm tắt cốt truyện, phân tích mối quan hệ, tạo các mốc chapter thông minh và đề xuất các thẻ SEO/Tiêu đề tối ưu nhất.
          </p>

          {/* Collapsible Model Configurations */}
          <div className="bg-background-tertiary/40 border border-border/60 rounded-lg p-2.5 space-y-2.5">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center justify-between w-full text-[10px] font-bold text-text-primary hover:text-primary transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Settings size={12} className="text-text-muted" />
                Cấu hình AI Insights ({insightsAiProvider.toUpperCase()}: {insightsModelType === "custom" ? insightsCustomModelName || "Custom" : insightsModelType})
              </span>
              <ChevronDown
                size={12}
                className={`transition-transform duration-200 ${showSettings ? "" : "-rotate-90"} text-text-muted`}
              />
            </button>

            {showSettings && (
              <div className="space-y-2.5 pt-2 border-t border-border/40 animate-in slide-in-from-top-2 duration-200">
                {/* AI Provider */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] text-text-secondary">AI Provider</span>
                  <Select
                    value={insightsAiProvider}
                    onValueChange={(val: "openai" | "anthropic" | "gemini") => {
                      setInsightsAiProvider(val);
                      const defaultModel = val === "openai" ? "mimo-v2.5" : val === "anthropic" ? "claude-3-5-sonnet-20241022" : "gemini-1.5-flash";
                      setInsightsModelType(defaultModel);
                      saveInsightsConfig({ insightsAiProvider: val, insightsCustomModel: defaultModel });
                    }}
                    disabled={isGenerating}
                  >
                    <SelectTrigger className="w-auto min-w-[125px] bg-background-secondary border-border text-text-primary text-[9px] h-7 px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background-secondary border-border">
                      <SelectItem value="openai">OpenAI (GPT / Mimo)</SelectItem>
                      <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Model Selection */}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] text-text-secondary">AI Model</span>
                  <Select
                    value={insightsModelType}
                    onValueChange={(val: string) => {
                      setInsightsModelType(val);
                      const savedModelName = val === "custom" ? insightsCustomModelName : val;
                      saveInsightsConfig({ insightsCustomModel: savedModelName });
                    }}
                    disabled={isGenerating}
                  >
                    <SelectTrigger className="w-auto min-w-[125px] bg-background-secondary border-border text-text-primary text-[9px] h-7 px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background-secondary border-border">
                      {insightsAiProvider === "openai" && (
                        <>
                          <SelectItem value="mimo-v2.5">Mimo v2.5 (Reasoning)</SelectItem>
                          <SelectItem value="gpt-4o">GPT-4o (Standard)</SelectItem>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                          <SelectItem value="o1">OpenAI o1 (Reasoning)</SelectItem>
                          <SelectItem value="o3-mini">OpenAI o3-mini (Reasoning)</SelectItem>
                          <SelectItem value="custom">Custom Model...</SelectItem>
                        </>
                      )}
                      {insightsAiProvider === "anthropic" && (
                        <>
                          <SelectItem value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</SelectItem>
                          <SelectItem value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</SelectItem>
                          <SelectItem value="custom">Custom Model...</SelectItem>
                        </>
                      )}
                      {insightsAiProvider === "gemini" && (
                        <>
                          <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash</SelectItem>
                          <SelectItem value="gemini-1.5-pro">Gemini 1.5 Pro</SelectItem>
                          <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
                          <SelectItem value="custom">Custom Model...</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom Model Input */}
                {insightsModelType === "custom" && (
                  <div className="space-y-1">
                    <span className="text-[9px] text-text-secondary block">Tên mô hình tùy chỉnh</span>
                    <input
                      type="text"
                      value={insightsCustomModelName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInsightsCustomModelName(val);
                        saveInsightsConfig({ insightsCustomModel: val });
                      }}
                      disabled={isGenerating}
                      placeholder="VD: deepseek-reasoner, llama3..."
                      className="w-full bg-background border border-border/80 rounded px-2 py-1 text-[9px] text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-colors"
                    />
                  </div>
                )}

                {/* Temperature Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-text-secondary">AI Temperature (Độ sáng tạo)</span>
                    <span className="text-primary font-medium">{insightsTemperature.toFixed(2)}</span>
                  </div>
                  <Slider
                    min={0.0}
                    max={1.0}
                    step={0.05}
                    value={[insightsTemperature]}
                    onValueChange={(value) => {
                      const val = value[0];
                      setInsightsTemperature(val);
                      saveInsightsConfig({ insightsTemperature: val });
                    }}
                    disabled={isGenerating}
                  />
                  <span className="text-[8px] text-text-muted block leading-tight">
                    Mức thấp (0.0) tối ưu cho chapter/tóm tắt chính xác. Mức cao (0.7 - 1.0) phù hợp viết SEO/Tiêu đề bay bổng.
                  </span>
                </div>

                {/* SEO Target Languages (Multi-select) */}
                <div className="space-y-1.5 pt-1.5 border-t border-border/40">
                  <span className="text-[9px] text-text-secondary block font-medium">Ngôn ngữ SEO mong muốn (Chọn nhiều)</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { code: "vi", label: "Tiếng Việt" },
                      { code: "en", label: "English" },
                      { code: "zh", label: "Chinese" },
                      { code: "ja", label: "Japanese" },
                      { code: "es", label: "Spanish" },
                      { code: "fr", label: "French" },
                    ].map((lang) => {
                      const isChecked = insightsSeoLanguages.includes(lang.code);
                      return (
                        <label
                          key={lang.code}
                          className="flex items-center gap-2 p-1.5 bg-background-secondary hover:bg-background-tertiary border border-border/40 rounded cursor-pointer text-[9px] text-text-secondary select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              let nextLangs;
                              if (e.target.checked) {
                                nextLangs = [...insightsSeoLanguages, lang.code];
                              } else {
                                nextLangs = insightsSeoLanguages.filter((c) => c !== lang.code);
                                if (nextLangs.length === 0) nextLangs = ["vi"];
                              }
                              setInsightsSeoLanguages(nextLangs);
                              saveInsightsConfig({ insightsSeoLanguages: nextLangs });
                            }}
                            disabled={isGenerating}
                            className="rounded border-border text-primary focus:ring-primary h-3 w-3"
                          />
                          <span>{lang.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/95 hover:to-primary/75 text-white rounded text-[11px] font-medium transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Đang phân tích video...
              </>
            ) : (
              <>
                <Sparkles size={13} />
                Phân tích & Tóm tắt Video
              </>
            )}
          </button>
          {error && (
            <div className="flex gap-1.5 p-2 bg-red-500/10 border border-red-500/20 rounded text-[9px] text-red-400">
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {insights && (
        <div className="space-y-3">
          {/* Tabs */}
          <div className="flex border-b border-border bg-background-tertiary/40 rounded-t-lg p-0.5">
            <button
              onClick={() => setActiveTab("summary")}
              className={`flex-1 py-1.5 px-2 text-[10px] font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "summary"
                  ? "bg-background-secondary text-primary shadow"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <BookOpen size={11} />
              Tóm tắt
            </button>
            <button
              onClick={() => setActiveTab("chapters")}
              className={`flex-1 py-1.5 px-2 text-[10px] font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "chapters"
                  ? "bg-background-secondary text-primary shadow"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Clock size={11} />
              Chapters
            </button>
            <button
              onClick={() => setActiveTab("seo")}
              className={`flex-1 py-1.5 px-2 text-[10px] font-medium rounded transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "seo"
                  ? "bg-background-secondary text-primary shadow"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <Tag size={11} />
              SEO & Socials
            </button>
          </div>

          {/* Tab content */}
          <div className="p-3 bg-background-tertiary/20 border border-border/80 border-t-0 rounded-b-lg min-h-[180px]">
            {activeTab === "summary" && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-text-primary">Tóm tắt nội dung</span>
                  <button
                    onClick={() => handleCopy(insights.summary, "summary")}
                    className="p-1 hover:bg-background-secondary rounded text-text-muted hover:text-text-primary transition-colors"
                    title="Sao chép tóm tắt"
                  >
                    {copiedField === "summary" ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                  </button>
                </div>
                <p className="text-[10px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {insights.summary}
                </p>
              </div>
            )}

            {activeTab === "chapters" && (
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-text-primary block mb-1">Mốc thời gian (Chapters)</span>
                {insights.chapters.length === 0 ? (
                  <p className="text-[9px] text-text-muted italic">Không tìm thấy chapters nào.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                    {insights.chapters.map((ch, idx) => (
                      <div
                        key={idx}
                        onClick={() => setPlayheadPosition(ch.time)}
                        className="flex items-center justify-between p-1.5 bg-background-tertiary/50 hover:bg-primary/10 border border-border/40 hover:border-primary/20 rounded cursor-pointer transition-all group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[9px] font-bold text-primary font-mono bg-background-secondary px-1 py-0.5 rounded border border-border/60">
                            {formatTime(ch.time)}
                          </span>
                          <span className="text-[10px] text-text-primary font-medium truncate group-hover:text-primary transition-colors">
                            {ch.label}
                          </span>
                        </div>
                        <Play size={8} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => {
                    const chapterStr = insights.chapters.map(ch => `${formatTime(ch.time)} - ${ch.label}`).join("\n");
                    handleCopy(chapterStr, "chapters");
                  }}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 py-1 bg-background-secondary hover:bg-background-tertiary border border-border text-[9px] text-text-secondary rounded transition-colors"
                >
                  {copiedField === "chapters" ? (
                    <>
                      <Check size={10} className="text-green-400" />
                      Đã sao chép danh sách Chapter
                    </>
                  ) : (
                    <>
                      <Copy size={10} />
                      Sao chép danh sách Chapter
                    </>
                  )}
                </button>
              </div>
            )}

            {activeTab === "seo" && (() => {
              const isMultiLangSeo = insights.seo && !("titleSuggestions" in insights.seo);
              const seoKeys = isMultiLangSeo ? Object.keys(insights.seo) : [];
              const activeLangKey = isMultiLangSeo
                ? (insights.seo[selectedSeoLang] ? selectedSeoLang : seoKeys[0])
                : "";

              const seoData = isMultiLangSeo
                ? (insights.seo[activeLangKey] || { titleSuggestions: [], tags: [], description: "" })
                : (insights.seo as unknown as { titleSuggestions: string[]; tags: string[]; description: string });

              const getLangLabel = (code: string) => {
                const map: Record<string, string> = {
                  vi: "Tiếng Việt",
                  en: "English",
                  zh: "Chinese",
                  ja: "Japanese",
                  es: "Spanish",
                  fr: "French",
                };
                return map[code] || code.toUpperCase();
              };

              return (
                <div className="space-y-4">
                  {/* Language Pills for Multi-lang SEO */}
                  {isMultiLangSeo && seoKeys.length > 1 && (
                    <div className="flex flex-wrap gap-1 border-b border-border/40 pb-2">
                      {seoKeys.map((langKey) => (
                        <button
                          key={langKey}
                          onClick={() => setSelectedSeoLang(langKey)}
                          className={`px-2 py-0.5 rounded text-[9px] font-medium border transition-all ${
                            selectedSeoLang === langKey
                              ? "bg-primary/10 border-primary text-primary"
                              : "bg-background-secondary border-border/60 text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {getLangLabel(langKey)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Title suggestions */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-text-primary">Tiêu đề YouTube gợi ý</span>
                    </div>
                    <div className="space-y-1">
                      {seoData.titleSuggestions && seoData.titleSuggestions.length > 0 ? (
                        seoData.titleSuggestions.map((title, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 p-1.5 bg-background-tertiary/30 border border-border/40 rounded text-[9.5px] text-text-secondary"
                          >
                            <span className="truncate flex-1 font-medium">{title}</span>
                            <button
                              onClick={() => handleCopy(title, `title-${idx}`)}
                              className="p-0.5 hover:bg-background-secondary rounded text-text-muted hover:text-text-primary transition-colors shrink-0"
                            >
                              {copiedField === `title-${idx}` ? <Check size={9} className="text-green-400" /> : <Copy size={9} />}
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-[9px] text-text-muted italic">Không có tiêu đề gợi ý.</p>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-text-primary">Mô tả video chuẩn SEO</span>
                      <button
                        onClick={() => handleCopy(seoData.description || "", "seo-desc")}
                        className="p-1 hover:bg-background-secondary rounded text-text-muted hover:text-text-primary transition-colors"
                        title="Sao chép mô tả"
                      >
                        {copiedField === "seo-desc" ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                      </button>
                    </div>
                    <p className="text-[9px] text-text-secondary leading-relaxed bg-background-tertiary/30 border border-border/40 rounded p-2 max-h-[100px] overflow-y-auto custom-scrollbar">
                      {seoData.description || "Không có mô tả gợi ý."}
                    </p>
                  </div>

                  {/* Tags */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-text-primary">SEO Tags</span>
                      <button
                        onClick={() => handleCopy((seoData.tags || []).join(", "), "seo-tags")}
                        className="p-1 hover:bg-background-secondary rounded text-text-muted hover:text-text-primary transition-colors"
                        title="Sao chép toàn bộ tags"
                      >
                        {copiedField === "seo-tags" ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {seoData.tags && seoData.tags.length > 0 ? (
                        seoData.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-[8px] bg-background-secondary border border-border/80 text-text-secondary px-1.5 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <p className="text-[9px] text-text-muted italic">Không có tags nào.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Reset / Regenerate button */}
          <button
            onClick={() => setInsights(null)}
            className="w-full text-center text-[9px] text-text-muted hover:text-primary transition-colors py-1"
          >
            Phân tích lại video này
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoSummaryPanel;
