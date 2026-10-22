const allowedSecretKeys = new Set(['OPENROUTER_API_KEY', 'WEBUI_SECRET_KEY', 'WEBUI_JWT_SECRET_KEY']);

export function sanitizeSecretEnvironment(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key, item]) =>
      allowedSecretKeys.has(key) && typeof item === 'string' && !/[\0\r\n]/.test(item)
    )
  );
}

export function validateSecretEnvironment(environment: Record<string, unknown>): void {
  if (Object.entries(environment).some(([key, value]) =>
    !allowedSecretKeys.has(key) || typeof value !== 'string' || /[\0\r\n]/.test(value)
  )) {
    throw new Error('As variáveis devem usar nomes permitidos e valores sem quebras de linha ou caracteres nulos.');
  }
  if (Object.values(environment).reduce<number>((total, value) => total + (typeof value === 'string' ? value.length : 0), 0) > 1_000_000) {
    throw new Error('O conjunto de variáveis excede o limite de tamanho permitido.');
  }
}
