import { describe, expect, it } from 'vitest';
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  formatMessage,
  mapSystemLanguage,
  messages,
  type Language
} from './messages';

function placeholders(value: string): string[] {
  return (value.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
}

describe('desktop i18n', () => {
  it('ships exactly the three supported languages', () => {
    expect([...SUPPORTED_LANGUAGES]).toEqual(['pt-BR', 'en-US', 'es-ES']);
    expect(Object.keys(messages).sort()).toEqual(['en-US', 'es-ES', 'pt-BR']);
    expect(LANGUAGE_LABELS['pt-BR']).toBe('Português - Brasil');
    expect(LANGUAGE_LABELS['en-US']).toBe('English - United States');
    expect(LANGUAGE_LABELS['es-ES']).toBe('Español - España');
  });

  it('keeps every language with the same message keys', () => {
    const reference = Object.keys(messages['pt-BR']).sort();
    for (const language of SUPPORTED_LANGUAGES) {
      expect(Object.keys(messages[language]).sort()).toEqual(reference);
    }
  });

  it('has no empty translations', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const [key, value] of Object.entries(messages[language])) {
        expect(value.trim(), `${language}:${key}`).not.toBe('');
      }
    }
  });

  it('keeps the same placeholders across languages', () => {
    for (const key of Object.keys(messages['pt-BR'])) {
      const reference = placeholders(messages['pt-BR'][key as keyof (typeof messages)['pt-BR']]);
      for (const language of SUPPORTED_LANGUAGES) {
        expect(placeholders(messages[language][key as keyof (typeof messages)['pt-BR']]), `${language}:${key}`).toEqual(reference);
      }
    }
  });

  it('interpolates named parameters and keeps unknown placeholders untouched', () => {
    expect(formatMessage('pt-BR', 'updates.serverVersion', { version: '0.12.3' })).toBe('Versão do servidor 0.12.3');
    expect(formatMessage('en-US', 'updates.serverVersion', { version: '0.12.3' })).toBe('Server version 0.12.3');
    expect(formatMessage('es-ES', 'updates.serverVersion', { version: '0.12.3' })).toBe('Versión del servidor 0.12.3');
    expect(formatMessage('en-US', 'home.footerPort', {})).toBe('Port {port}');
  });

  it('translates the same key differently per language', () => {
    const labels = SUPPORTED_LANGUAGES.map((language) => formatMessage(language, 'updates.upToDate'));
    expect(new Set(labels).size).toBe(3);
  });

  it('maps regional system locales to the closest supported language', () => {
    const cases: Array<[string | undefined, Language | null]> = [
      ['pt-BR', 'pt-BR'],
      ['pt-PT', 'pt-BR'],
      ['en-US', 'en-US'],
      ['en-GB', 'en-US'],
      ['es-ES', 'es-ES'],
      ['es-MX', 'es-ES'],
      ['fr-FR', null],
      [undefined, null]
    ];
    for (const [input, expected] of cases) {
      expect(mapSystemLanguage(input), String(input)).toBe(expected);
    }
  });
});
