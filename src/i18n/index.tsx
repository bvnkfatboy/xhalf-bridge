import { createContext, useCallback, useContext, type ReactNode } from "react";
import { th } from "./th";

export type Lang = "en" | "th";

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "th", label: "ไทย (Thai)" },
];

type Params = Record<string, string | number>;

const dictionaries: Record<Lang, Record<string, string> | undefined> = { en: undefined, th };

/**
 * English text is the key itself: t("Import photos") → "นำเข้าภาพ" in Thai,
 * or falls back to the English text when a translation is missing.
 */
export function translate(lang: Lang, key: string, params?: Params): string {
  let out = (lang !== "en" ? dictionaries[lang]?.[key] : undefined) ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

export const LangContext = createContext<{ lang: Lang; t: (key: string, params?: Params) => string }>({
  lang: "en",
  t: (key, params) => translate("en", key, params),
});

export const useT = () => useContext(LangContext).t;

export function useLangSetup(lang: Lang) {
  const t = useCallback((key: string, params?: Params) => translate(lang, key, params), [lang]);
  return { lang, t };
}

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useLangSetup(lang);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
