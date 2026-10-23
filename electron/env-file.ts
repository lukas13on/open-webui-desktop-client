export type EnvEntry = { key: string; value: string };

export const MAX_ENV_ENTRIES = 500;
export const MAX_ENV_KEY_LENGTH = 96;
export const MAX_ENV_VALUE_LENGTH = 8192;

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ASSIGNMENT_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

export function isValidEnvKey(key: string): boolean {
  return key.length > 0 && key.length <= MAX_ENV_KEY_LENGTH && KEY_PATTERN.test(key);
}

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      return value.slice(1, -1);
    }
  }
  const commentIndex = value.search(/\s#/);
  return commentIndex === -1 ? value : value.slice(0, commentIndex).trim();
}

export function formatEnvLine(key: string, value: string): string {
  if (!value.includes("'")) return `${key}='${value}'`;
  if (!value.includes('"')) return `${key}="${value}"`;
  return `${key}=${JSON.stringify(value)}`;
}

export function parseEnvEntries(content: string): EnvEntry[] {
  const entries = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const match = ASSIGNMENT_PATTERN.exec(line);
    if (!match) continue;
    entries.set(match[1], unquote(match[2]));
  }
  return [...entries].map(([key, value]) => ({ key, value }));
}

export function applyEnvEntries(content: string, entries: EnvEntry[]): string {
  const desired = new Map(entries.map(({ key, value }) => [key, value]));
  return rewriteEnv(content, desired, true);
}

/** Updates the given keys but keeps every other variable already present in the file. */
export function mergeEnvEntries(content: string, entries: EnvEntry[]): string {
  const desired = new Map(entries.map(({ key, value }) => [key, value]));
  return rewriteEnv(content, desired, false);
}

function rewriteEnv(content: string, desired: Map<string, string>, removeMissing: boolean): string {
  const written = new Set<string>();
  const lines: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    const match = ASSIGNMENT_PATTERN.exec(line);
    if (!match) {
      lines.push(line);
      continue;
    }
    const key = match[1];
    if (!desired.has(key)) {
      if (!removeMissing) lines.push(line);
      continue;
    }
    written.add(key);
    lines.push(`${formatEnvLine(key, desired.get(key) ?? '')}`);
  }

  const pending = [...desired].filter(([key]) => !written.has(key));
  if (pending.length) {
    const lastLine = lines.length ? lines[lines.length - 1] : '';
    if (lastLine.trim() !== '') lines.push('');
    for (const [key, value] of pending) lines.push(formatEnvLine(key, value));
  }

  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

export class EnvValidationError extends Error {
  constructor(readonly reason: 'key' | 'duplicate' | 'value' | 'count' | 'line', readonly detail: string) {
    super(`${reason}:${detail}`);
  }
}

export function normalizeEnvEntries(input: unknown): EnvEntry[] {
  if (!Array.isArray(input)) throw new EnvValidationError('line', 'entries');
  if (input.length > MAX_ENV_ENTRIES) throw new EnvValidationError('count', String(input.length));

  const seen = new Set<string>();
  const entries: EnvEntry[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') throw new EnvValidationError('line', 'entry');
    const { key, value } = item as Record<string, unknown>;
    if (typeof key !== 'string' || !isValidEnvKey(key.trim())) throw new EnvValidationError('key', String(key ?? ''));
    const normalizedKey = key.trim();
    if (seen.has(normalizedKey)) throw new EnvValidationError('duplicate', normalizedKey);
    seen.add(normalizedKey);
    if (typeof value !== 'string') throw new EnvValidationError('value', normalizedKey);
    if (value.length > MAX_ENV_VALUE_LENGTH || /[\0\r\n]/.test(value)) throw new EnvValidationError('value', normalizedKey);
    entries.push({ key: normalizedKey, value });
  }
  return entries;
}

export function validateRawEnv(content: string): void {
  if (typeof content !== 'string') throw new EnvValidationError('line', 'content');
  if (content.length > 512_000) throw new EnvValidationError('count', String(content.length));
  const seen = new Set<string>();
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    const match = ASSIGNMENT_PATTERN.exec(lines[index]);
    if (!match) throw new EnvValidationError('line', String(index + 1));
    const key = match[1];
    if (!isValidEnvKey(key)) throw new EnvValidationError('key', key);
    if (seen.has(key)) throw new EnvValidationError('duplicate', key);
    seen.add(key);
    if (unquote(match[2]).length > MAX_ENV_VALUE_LENGTH) throw new EnvValidationError('value', key);
  }
}

export function changedEnvKeys(before: EnvEntry[], after: EnvEntry[]): string[] {
  const previous = new Map(before.map(({ key, value }) => [key, value]));
  const next = new Map(after.map(({ key, value }) => [key, value]));
  const changed: string[] = [];
  for (const [key, value] of next) {
    if (previous.get(key) !== value) changed.push(key);
  }
  for (const key of previous.keys()) {
    if (!next.has(key)) changed.push(key);
  }
  return [...new Set(changed)];
}
