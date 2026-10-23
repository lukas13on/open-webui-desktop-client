import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { envValidationMessage } from './i18n';
import { validateRawEnv, normalizeEnvEntries, applyEnvEntries, mergeEnvEntries, changedEnvKeys, parseEnvEntries, EnvValidationError, type EnvEntry } from './env-file';
import { databaseFile, environmentExampleFile, environmentFile, pythonExecutable } from './paths';

export type EnvironmentSnapshot = {
  path: string;
  examplePath: string;
  entries: EnvEntry[];
  raw: string;
};

const FALLBACK_EXAMPLE = [
  '# Open Web UI server environment',
  "OPENAI_API_BASE_URL='https://openrouter.ai/api/v1'",
  "OPENAI_API_KEY=''",
  ''
].join('\n');

export const DEFAULT_ENV_OVERRIDES: Record<string, string> = {
  OPENAI_API_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENAI_API_KEY: ''
};

/**
 * The Open Web UI keeps some settings in its own database once seeded, and the environment
 * only provides defaults. Deleting these rows makes the server re-seed them from `.env`.
 */
const PERSISTED_CONFIG_KEYS: Record<string, readonly string[]> = {
  OPENAI_API_BASE_URL: ['openai.api_base_urls', 'openai.api_configs'],
  OPENAI_API_BASE_URLS: ['openai.api_base_urls', 'openai.api_configs'],
  OPENAI_API_KEY: ['openai.api_keys'],
  OPENAI_API_KEYS: ['openai.api_keys'],
  ENABLE_OPENAI_API: ['openai.enable'],
  OLLAMA_BASE_URL: ['ollama.base_urls'],
  OLLAMA_BASE_URLS: ['ollama.base_urls'],
  ENABLE_OLLAMA_API: ['ollama.enable']
};

const DELETE_CONFIG_SCRIPT = `
import os
import sqlite3
import sys

path, *keys = sys.argv[1:]
if not keys or not os.path.exists(path):
    sys.exit(0)

connection = sqlite3.connect(path, timeout=15)
try:
    placeholders = ','.join('?' for _ in keys)
    try:
        cursor = connection.execute('DELETE FROM config WHERE key IN (%s)' % placeholders, keys)
        connection.commit()
    except sqlite3.OperationalError:
        sys.exit(0)
finally:
    connection.close()
`.trim();

function translateError(error: unknown): Error {
  if (error instanceof EnvValidationError) {
    return new Error(envValidationMessage(error.reason, error.detail));
  }
  return error instanceof Error ? error : new Error(String(error));
}

export class EnvironmentService {
  private static instance: EnvironmentService;
  private pendingConfigKeys = new Set<string>();
  private constructor() {}

  static getInstance(): EnvironmentService {
    return (this.instance ??= new EnvironmentService());
  }

  get path(): string {
    return environmentFile();
  }

  get examplePath(): string {
    return environmentExampleFile();
  }

  private async readOptional(file: string): Promise<string | null> {
    try {
      return await readFile(file, 'utf8');
    } catch {
      return null;
    }
  }

  private async exampleContent(): Promise<string> {
    return (await this.readOptional(this.examplePath)) ?? FALLBACK_EXAMPLE;
  }

  async ensureInitialized(): Promise<void> {
    if (await this.readOptional(this.path)) return;
    const content = mergeEnvEntries(await this.exampleContent(), this.overrides());
    await writeFile(this.path, content, { encoding: 'utf8', mode: 0o600 });
  }

  private overrides(): EnvEntry[] {
    return Object.entries(DEFAULT_ENV_OVERRIDES).map(([key, value]) => ({ key, value }));
  }

  async read(): Promise<EnvironmentSnapshot> {
    await this.ensureInitialized();
    const raw = (await this.readOptional(this.path)) ?? '';
    return { path: this.path, examplePath: this.examplePath, raw, entries: parseEnvEntries(raw) };
  }

  async saveEntries(input: unknown): Promise<EnvironmentSnapshot> {
    try {
      const entries = normalizeEnvEntries(input);
      const current = await this.read();
      const next = applyEnvEntries(current.raw, entries);
      await this.write(next);
      this.queueConfigReset(changedEnvKeys(current.entries, parseEnvEntries(next)));
      return this.read();
    } catch (error) {
      throw translateError(error);
    }
  }

  async saveRaw(content: unknown): Promise<EnvironmentSnapshot> {
    try {
      if (typeof content !== 'string') throw new EnvValidationError('line', 'content');
      validateRawEnv(content);
      const current = await this.read();
      const trimmed = content.replace(/\r\n/g, '\n');
      const next = trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`;
      await this.write(next);
      this.queueConfigReset(changedEnvKeys(current.entries, parseEnvEntries(next)));
      return this.read();
    } catch (error) {
      throw translateError(error);
    }
  }

  async resetToExample(): Promise<EnvironmentSnapshot> {
    const current = await this.read();
    const next = mergeEnvEntries(await this.exampleContent(), this.overrides());
    await this.write(next);
    this.queueConfigReset(changedEnvKeys(current.entries, parseEnvEntries(next)));
    return this.read();
  }

  private async write(content: string): Promise<void> {
    await writeFile(this.path, content, { encoding: 'utf8', mode: 0o600 });
  }

  private queueConfigReset(changedKeys: string[]): void {
    for (const key of changedKeys) {
      for (const configKey of PERSISTED_CONFIG_KEYS[key] ?? []) this.pendingConfigKeys.add(configKey);
    }
  }

  get hasPendingConfigReset(): boolean {
    return this.pendingConfigKeys.size > 0;
  }

  /** Runs while the backend is stopped so the SQLite database is not locked. */
  async applyPendingConfigReset(): Promise<void> {
    if (!this.pendingConfigKeys.size) return;
    const keys = [...this.pendingConfigKeys];
    this.pendingConfigKeys.clear();
    try {
      await access(databaseFile());
    } catch {
      return;
    }
    const python = pythonExecutable();
    if (!python) return;
    try {
      await access(python);
    } catch {
      return;
    }
    await new Promise<void>((resolve) => {
      const child = spawn(python, ['-c', DELETE_CONFIG_SCRIPT, databaseFile(), ...keys], {
        windowsHide: true,
        stdio: 'ignore'
      });
      child.once('error', () => resolve());
      child.once('exit', () => resolve());
    });
  }
}
