import { useSettingsStore } from "../stores/settings-store";
import { en } from "../locales/en";
import { vi } from "../locales/vi";

const TRANSLATIONS = { en, vi } as const;

export function useTranslation() {
  const language = useSettingsStore((state) => state.language) as "en" | "vi";
  const dict = TRANSLATIONS[language] || en;

  const t = (
    key: string,
    defaultValueOrReplacements?: string | Record<string, string | number>,
    replacements?: Record<string, string | number>
  ): string => {
    const keys = key.split(".");
    let current: any = dict;
    for (const k of keys) {
      if (current && typeof current === "object" && k in current) {
        current = current[k];
      } else {
        if (typeof defaultValueOrReplacements === "string") {
          let result = defaultValueOrReplacements;
          if (replacements) {
            for (const [k, v] of Object.entries(replacements)) {
              result = result.replace(new RegExp(`{{${k}}}`, "g"), String(v));
            }
          }
          return result;
        }
        return key;
      }
    }
    
    if (typeof current === "string") {
      let result = current;
      const actualReplacements = typeof defaultValueOrReplacements === "object"
        ? defaultValueOrReplacements
        : replacements;
      if (actualReplacements) {
        for (const [k, v] of Object.entries(actualReplacements)) {
          result = result.replace(new RegExp(`{{${k}}}`, "g"), String(v));
        }
      }
      return result;
    }
    
    if (typeof defaultValueOrReplacements === "string") {
      return defaultValueOrReplacements;
    }
    return key;
  };

  return { t, language };
}
