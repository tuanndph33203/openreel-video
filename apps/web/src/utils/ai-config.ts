export const NVIDIA_QWEN3_NEXT_MODEL = "qwen/qwen3-next-80b-a3b-instruct";
export const NVIDIA_OPENAI_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const SETTINGS_CUSTOM_MODEL = "__settings_custom__";

export type SupportedAiProvider = "openai" | "anthropic" | "gemini";

interface ResolveAiProviderConfigArgs {
  provider: SupportedAiProvider;
  selectedModel?: string;
  customOpenAiBaseUrl?: string;
  customAnthropicBaseUrl?: string;
  customGeminiBaseUrl?: string;
  customOpenAiModel?: string;
  customAnthropicModel?: string;
  customGeminiModel?: string;
}

export function getDefaultModelForProvider(provider: SupportedAiProvider): string {
  if (provider === "anthropic") {
    return "claude-3-5-haiku-20241022";
  }
  if (provider === "gemini") {
    return "gemini-1.5-flash";
  }
  return "gpt-4o-mini";
}

export function resolveAiProviderConfig({
  provider,
  selectedModel,
  customOpenAiBaseUrl,
  customAnthropicBaseUrl,
  customGeminiBaseUrl,
  customOpenAiModel,
  customAnthropicModel,
  customGeminiModel,
}: ResolveAiProviderConfigArgs): { customBaseUrl?: string; customModel?: string } {
  const trimmedSelectedModel = selectedModel?.trim();
  const normalizedSelectedModel =
    trimmedSelectedModel && trimmedSelectedModel !== SETTINGS_CUSTOM_MODEL
      ? trimmedSelectedModel
      : undefined;

  if (provider === "openai") {
    const trimmedBaseUrl = customOpenAiBaseUrl?.trim();
    const settingsModel = customOpenAiModel?.trim();
    const resolvedModel =
      trimmedSelectedModel === SETTINGS_CUSTOM_MODEL
        ? settingsModel || undefined
        : normalizedSelectedModel ?? settingsModel ?? undefined;

    if (resolvedModel === NVIDIA_QWEN3_NEXT_MODEL) {
      return {
        customBaseUrl: trimmedBaseUrl || NVIDIA_OPENAI_BASE_URL,
        customModel: resolvedModel,
      };
    }

    return {
      customBaseUrl: trimmedBaseUrl || undefined,
      customModel: resolvedModel,
    };
  }

  if (provider === "anthropic") {
    return {
      customBaseUrl: customAnthropicBaseUrl?.trim() || undefined,
      customModel:
        trimmedSelectedModel === SETTINGS_CUSTOM_MODEL
          ? customAnthropicModel?.trim() || undefined
          : normalizedSelectedModel ?? customAnthropicModel?.trim() ?? undefined,
    };
  }

  return {
    customBaseUrl: customGeminiBaseUrl?.trim() || undefined,
    customModel:
      trimmedSelectedModel === SETTINGS_CUSTOM_MODEL
        ? customGeminiModel?.trim() || undefined
        : normalizedSelectedModel ?? customGeminiModel?.trim() ?? undefined,
  };
}
