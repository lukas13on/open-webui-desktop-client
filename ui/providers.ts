export type ProviderId = 'openrouter' | 'openai' | 'groq' | 'custom';

export type Provider = {
  id: ProviderId;
  name: string;
  baseUrl: string;
  /** Present when the provider has a stable well-known endpoint and can be detected from .env. */
  detect: boolean;
};

export const PROVIDERS: readonly Provider[] = [
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', detect: true },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', detect: true },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', detect: true },
  { id: 'custom', name: '', baseUrl: '', detect: false }
];

export const DEFAULT_PROVIDER_ID: ProviderId = 'openrouter';

export function providerById(id: ProviderId): Provider {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Detects the configured provider from the current base URL, falling back to a custom entry. */
export function detectProvider(baseUrl: string): Provider {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return providerById(DEFAULT_PROVIDER_ID);
  const match = PROVIDERS.find((provider) => provider.detect && normalizeBaseUrl(provider.baseUrl) === normalized);
  return match ?? { id: 'custom', name: '', baseUrl: normalized, detect: false };
}
