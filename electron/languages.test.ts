import { describe, expect, it } from 'vitest';
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  mapSystemLanguage,
  normalizeLanguagePreference,
  pickSystemLanguage,
  type Language
} from './languages';

describe('desktop language preferences', () => {
  it('defaults unknown persisted values to automatic detection', () => {
    expect(normalizeLanguagePreference(undefined)).toBe('auto');
    expect(normalizeLanguagePreference(null)).toBe('auto');
    expect(normalizeLanguagePreference('fr-FR')).toBe('auto');
    expect(normalizeLanguagePreference(42)).toBe('auto');
    expect(normalizeLanguagePreference('')).toBe('auto');
  });

  it('keeps supported values untouched', () => {
    expect(normalizeLanguagePreference('auto')).toBe('auto');
    for (const language of SUPPORTED_LANGUAGES) {
      expect(normalizeLanguagePreference(language)).toBe(language);
    }
  });

  it('exposes native labels for the three languages', () => {
    expect(LANGUAGE_LABELS).toEqual({
      'pt-BR': 'Português - Brasil',
      'en-US': 'English - United States',
      'es-ES': 'Español - España'
    });
  });

  it('maps Windows locales to the closest supported language', () => {
    const cases: Array<[string | undefined, Language | null]> = [
      ['pt-BR', 'pt-BR'],
      ['pt-PT', 'pt-BR'],
      ['en-US', 'en-US'],
      ['en-GB', 'en-US'],
      ['es-ES', 'es-ES'],
      ['es-419', 'es-ES'],
      ['de-DE', null],
      [undefined, null]
    ];
    for (const [input, expected] of cases) {
      expect(mapSystemLanguage(input), String(input)).toBe(expected);
    }
  });

  it('uses the first supported system locale and falls back to English', () => {
    expect(pickSystemLanguage(['fr-FR', 'es-MX', 'en-US'])).toBe('es-ES');
    expect(pickSystemLanguage(['ja-JP'])).toBe('en-US');
    expect(pickSystemLanguage([], 'pt-BR')).toBe('pt-BR');
  });
});
