import type { Language, LanguagePreference } from './i18n/messages';

export type DesktopConfig = {
  windowMaximized: boolean;
  hideDesktopOnOpen: boolean;
  launchAtLogin: boolean;
  backendPort: number;
  language: LanguagePreference;
  resolvedLanguage: Language;
};

export type DesktopConfigInput = Omit<DesktopConfig, 'resolvedLanguage'>;

export type PendingCommit = { hash: string; subject: string };

export type WindowState = { maximized: boolean; minimized: boolean };

export type LanguageInfo = { language: Language; label: string };

export type EnvEntry = { key: string; value: string };

export type EnvironmentSnapshot = {
  path: string;
  examplePath: string;
  entries: EnvEntry[];
  raw: string;
};

export type DesktopBridge = {
  getConfig(): Promise<DesktopConfig>;
  saveConfig(config: DesktopConfigInput): Promise<void>;
  getBackendUrl(): Promise<string>;
  getBackendVersion(): Promise<string>;
  getLanguageInfo(): Promise<LanguageInfo>;
  setLanguage(value: LanguagePreference): Promise<LanguagePreference>;
  getEnvironment(): Promise<EnvironmentSnapshot>;
  saveEnvironment(entries: EnvEntry[]): Promise<EnvironmentSnapshot>;
  saveEnvironmentRaw(raw: string): Promise<EnvironmentSnapshot>;
  resetEnvironment(): Promise<EnvironmentSnapshot>;
  setHideDesktopOnOpen(value: boolean): Promise<boolean>;
  setLaunchAtLogin(value: boolean): Promise<boolean>;
  openWebUI(): Promise<void>;
  getWindowState(): Promise<WindowState>;
  minimize(): Promise<WindowState>;
  toggleMaximize(): Promise<WindowState>;
  closeWindow(): Promise<{ hidden: boolean }>;
  restart(): Promise<void>;
  pendingCommits(): Promise<PendingCommit[]>;
  applyUpdate(): Promise<{ commits: PendingCommit[]; updated: boolean }>;
  onUpdateState(callback: (running: boolean) => void): () => void;
  onBackendRestarting(callback: (restarting: boolean) => void): () => void;
  onWindowMaximized(callback: (maximized: boolean) => void): () => void;
  onUpdateRequest(callback: () => void): () => void;
  onSettingsRequest(callback: () => void): () => void;
  onHelpRequest(callback: () => void): () => void;
  onBackendRestarted(callback: (url: string) => void): () => void;
};

declare global {
  interface Window { desktop: DesktopBridge; }
}
