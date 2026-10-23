import { computed, ref } from 'vue';
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  formatMessage,
  mapSystemLanguage,
  messages,
  type Language,
  type LanguagePreference,
  type MessageKey
} from './messages';
import { LANGUAGE_FLAGS } from './flags';

export { LANGUAGE_FLAGS, LANGUAGE_LABELS, SUPPORTED_LANGUAGES, mapSystemLanguage };
export type { Language, LanguagePreference, MessageKey };

export function detectSystemLanguage(): Language {
  const candidates = typeof navigator === 'undefined'
    ? []
    : [...(navigator.languages ?? []), navigator.language];
  for (const candidate of candidates) {
    const mapped = mapSystemLanguage(candidate);
    if (mapped) return mapped;
  }
  return 'en-US';
}

function isSupported(value: unknown): value is Language {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.includes(value as Language);
}

export const locale = ref<Language>(detectSystemLanguage());

export const currentLocale = computed(() => locale.value);
export const currentLanguageLabel = computed(() => LANGUAGE_LABELS[locale.value]);
export const currentLanguageFlag = computed(() => LANGUAGE_FLAGS[locale.value]);

export function setLocale(value: Language): void {
  if (isSupported(value)) locale.value = value;
}

export function isSupportedLanguage(value: unknown): value is Language {
  return isSupported(value);
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return formatMessage(locale.value, key, params);
}

export function translate(language: Language, key: MessageKey, params: Record<string, string | number> = {}): string {
  return formatMessage(language, key, params);
}

export function messageKeys(language: Language): string[] {
  return Object.keys(messages[language]).sort();
}
