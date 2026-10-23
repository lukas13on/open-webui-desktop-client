export type Language = 'pt-BR' | 'en-US' | 'es-ES';
export type LanguagePreference = Language | 'auto';

export const SUPPORTED_LANGUAGES: readonly Language[] = ['pt-BR', 'en-US', 'es-ES'];

export const LANGUAGE_LABELS: Record<Language, string> = {
  'pt-BR': 'Português - Brasil',
  'en-US': 'English - United States',
  'es-ES': 'Español - España'
};

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  return value === 'pt-BR' || value === 'en-US' || value === 'es-ES' || value === 'auto' ? value : 'auto';
}

export function mapSystemLanguage(input: string | undefined): Language | null {
  const value = (input ?? '').toLowerCase();
  if (value.startsWith('pt')) return 'pt-BR';
  if (value.startsWith('es')) return 'es-ES';
  if (value.startsWith('en')) return 'en-US';
  return null;
}

export function pickSystemLanguage(candidates: readonly string[], fallback: Language = 'en-US'): Language {
  for (const candidate of candidates) {
    const mapped = mapSystemLanguage(candidate);
    if (mapped) return mapped;
  }
  return fallback;
}
