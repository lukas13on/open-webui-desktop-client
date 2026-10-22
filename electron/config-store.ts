import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sanitizeSecretEnvironment, validateSecretEnvironment } from './secrets';

export type DesktopConfig = {
  windowMaximized: boolean;
  hideDesktopOnOpen: boolean;
  backendPort: number;
  environment: Record<string, string>;
};

const defaults: DesktopConfig = { windowMaximized: false, hideDesktopOnOpen: true, backendPort: 3301, environment: {} };
export class ConfigStore {
  private static instance: ConfigStore;
  private constructor() {}

  static getInstance(): ConfigStore {
    return (this.instance ??= new ConfigStore());
  }

  get directory(): string {
    return path.join(app.getPath('appData'), 'openwebui-desktop');
  }

  get configPath(): string {
    return path.join(this.directory, 'config.json');
  }

  get secretsPath(): string {
    return path.join(this.directory, 'environment.dpapi');
  }

  async load(): Promise<DesktopConfig> {
    await mkdir(this.directory, { recursive: true });
    let config: Partial<DesktopConfig> = {};
    try {
      config = JSON.parse(await readFile(this.configPath, 'utf8')) as Partial<DesktopConfig>;
    } catch { /* First launch or invalid config: use safe defaults. */ }
    config = {
      ...config,
      backendPort: Number.isInteger(config.backendPort) && Number(config.backendPort) >= 1 && Number(config.backendPort) <= 65535 ? Number(config.backendPort) : defaults.backendPort,
      windowMaximized: typeof config.windowMaximized === 'boolean' ? config.windowMaximized : defaults.windowMaximized,
      hideDesktopOnOpen: typeof config.hideDesktopOnOpen === 'boolean' ? config.hideDesktopOnOpen : defaults.hideDesktopOnOpen
    };

    let environment: Record<string, string> = {};
    if (safeStorage.isEncryptionAvailable()) {
      try {
        environment = sanitizeSecretEnvironment(JSON.parse(safeStorage.decryptString(await readFile(this.secretsPath))));
      } catch { /* Missing or unreadable encrypted secrets. */ }
    }
    return { ...defaults, ...config, environment };
  }

  async save(config: DesktopConfig): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    validateSecretEnvironment(config.environment);
    const { environment, ...publicConfig } = config;
    if (!safeStorage.isEncryptionAvailable() && Object.keys(environment).length) {
      throw new Error('O cofre DPAPI não está disponível; as variáveis secretas não foram salvas.');
    }
    await writeFile(this.configPath, JSON.stringify(publicConfig, null, 2), { mode: 0o600 });
    if (safeStorage.isEncryptionAvailable()) {
      await writeFile(this.secretsPath, safeStorage.encryptString(JSON.stringify(environment)), { mode: 0o600 });
    }
  }
}
