/**
 * API proxy utility for third-party service calls.
 *
 * In development: calls third-party APIs directly (for convenience).
 * In production: routes through Cloudflare Pages Functions proxy so
 * API keys never leave the same origin.
 */

import { useSettingsStore } from "../stores/settings-store";

const isDev = import.meta.env.DEV;

const DIRECT_CONFIG = {
  elevenlabs: {
    baseUrl: "https://api.elevenlabs.io/v1",
    authHeaders: (key: string): Record<string, string> => ({
      "xi-api-key": key,
    }),
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    authHeaders: (key: string): Record<string, string> => ({
      Authorization: `Bearer ${key}`,
    }),
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    authHeaders: (key: string): Record<string, string> => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    }),
  },
} as const;

export type ApiService = keyof typeof DIRECT_CONFIG;

/**
 * Fetch from a third-party API, automatically routing through the proxy
 * in production builds.
 *
 * @param service - Target service (elevenlabs, openai, anthropic)
 * @param path - API path including leading slash, e.g. "/models" or "/text-to-speech/voiceId"
 * @param apiKey - Decrypted API key for the service
 * @param options - Standard RequestInit (method, body, extra headers, etc.)
 */
export async function apiFetch(
  service: ApiService,
  path: string,
  apiKey: string,
  options: globalThis.RequestInit = {},
): Promise<Response> {
  const extraHeaders = (options.headers ?? {}) as Record<string, string>;

  // Check if there is a custom base URL configured in the settings store
  let customBaseUrl = "";
  try {
    const settingsState = useSettingsStore.getState();
    if (service === "openai" && settingsState.customOpenAiBaseUrl) {
      customBaseUrl = settingsState.customOpenAiBaseUrl.trim().replace(/\/$/, "");
    } else if (service === "anthropic" && settingsState.customAnthropicBaseUrl) {
      customBaseUrl = settingsState.customAnthropicBaseUrl.trim().replace(/\/$/, "");
    }
  } catch (e) {
    console.error("Failed to read settings store in apiFetch:", e);
  }

  // If we are in development, call directly. If a custom base URL is specified,
  // we must route through the backend proxy in production to avoid browser CORS issues.
  if (isDev) {
    const config = DIRECT_CONFIG[service];
    const baseUrl = customBaseUrl || config.baseUrl;
    const url = `${baseUrl}${path}`;
    return fetch(url, {
      ...options,
      headers: {
        ...config.authHeaders(apiKey),
        ...extraHeaders,
      },
    });
  }

  // Production environment with custom endpoint: route through same-origin proxy
  if (customBaseUrl) {
    const url = `/api/proxy/${service}${path}`;
    return fetch(url, {
      ...options,
      headers: {
        "x-proxy-api-key": apiKey,
        "x-proxy-base-url": customBaseUrl,
        ...extraHeaders,
      },
    });
  }

  // Production with default endpoints: route through same-origin proxy
  const url = `/api/proxy/${service}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "x-proxy-api-key": apiKey,
      ...extraHeaders,
    },
  });
}
