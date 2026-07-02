import { en } from "./en";
import type { Locale, LocaleOption, Messages } from "./type";
import { zh } from "./zh";

export type { Locale, Messages };

export const defaultLocale: Locale = "zh";

export const localeOptions: LocaleOption[] = [
  {
    code: "zh",
    label: "简体中文",
    shortLabel: "简",
    htmlLang: "zh-CN"
  },
  {
    code: "en",
    label: "English",
    shortLabel: "EN",
    htmlLang: "en"
  }
];

export const translations: Record<Locale, Messages> = {
  zh,
  en
};

export function resolveLocale(value?: string | null): Locale {
  if (!value) {
    return defaultLocale;
  }

  return value.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function getLocaleOption(locale: Locale) {
  return localeOptions.find((option) => option.code === locale) ?? localeOptions[0];
}
