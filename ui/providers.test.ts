import { describe, expect, it } from 'vitest';
import { DEFAULT_PROVIDER_ID, PROVIDERS, detectProvider, isHttpUrl, normalizeBaseUrl, providerById } from './providers';

describe('provider catalog', () => {
  it('uses OpenRouter as the default provider', () => {
    expect(DEFAULT_PROVIDER_ID).toBe('openrouter');
    expect(providerById(DEFAULT_PROVIDER_ID).baseUrl).toBe('https://openrouter.ai/api/v1');
  });

  it('ships at least three known providers plus a custom entry', () => {
    const known = PROVIDERS.filter((provider) => provider.detect);
    expect(known.length).toBeGreaterThanOrEqual(3);
    expect(known.map((provider) => provider.id)).toEqual(['openrouter', 'openai', 'groq']);
    expect(PROVIDERS.some((provider) => provider.id === 'custom')).toBe(true);
  });

  it('normalizes base URLs before detecting', () => {
    expect(normalizeBaseUrl(' https://openrouter.ai/api/v1/ ')).toBe('https://openrouter.ai/api/v1');
    expect(detectProvider('https://openrouter.ai/api/v1/').id).toBe('openrouter');
    expect(detectProvider('https://api.openai.com/v1').id).toBe('openai');
    expect(detectProvider('https://api.groq.com/openai/v1').id).toBe('groq');
  });

  it('falls back to OpenRouter when nothing is configured', () => {
    expect(detectProvider('').id).toBe('openrouter');
  });

  it('treats unknown hosts as custom providers', () => {
    const detected = detectProvider('https://example.com/v1');
    expect(detected.id).toBe('custom');
    expect(detected.baseUrl).toBe('https://example.com/v1');
  });

  it('validates http and https URLs', () => {
    expect(isHttpUrl('https://openrouter.ai/api/v1')).toBe(true);
    expect(isHttpUrl('http://localhost:11434/v1')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });
});
