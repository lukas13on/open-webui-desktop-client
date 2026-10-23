import { defineStore } from 'pinia';
import type { DesktopConfig, DesktopConfigInput, EnvEntry, EnvironmentSnapshot, PendingCommit } from '../types';
import { detectSystemLanguage, LANGUAGE_LABELS, setLocale, type Language, type LanguagePreference } from '../i18n';

export type Page = 'home' | 'wizard' | 'settings' | 'updates' | 'help';
export type ActionKey = 'initialize' | 'save' | 'preference' | 'environment' | 'wizard' | 'checkUpdates' | 'applyUpdate' | 'openWebUI' | 'restart' | 'window';

export type AppState = {
  page: Page;
  config: DesktopConfig;
  backendUrl: string;
  backendVersion: string;
  backendReady: boolean;
  windowMaximized: boolean;
  updateRunning: boolean;
  pending: Record<ActionKey, boolean>;
  commits: PendingCommit[];
  error: string;
  systemLanguage: Language;
  languageRestarting: boolean;
  languageFocus: number;
  envPath: string;
  envExamplePath: string;
  envEntries: EnvEntry[];
  envRaw: string;
  envLoaded: boolean;
  envDirty: boolean;
  wizardApplied: boolean;
};

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function idleActions(): Record<ActionKey, boolean> {
  return { initialize: false, save: false, preference: false, environment: false, wizard: false, checkUpdates: false, applyUpdate: false, openWebUI: false, restart: false, window: false };
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    page: 'home',
    config: {
      windowMaximized: false,
      hideDesktopOnOpen: true,
      launchAtLogin: false,
      backendPort: 3301,
      language: 'auto',
      resolvedLanguage: detectSystemLanguage()
    },
    backendUrl: '',
    backendVersion: '',
    backendReady: false,
    windowMaximized: false,
    updateRunning: false,
    pending: idleActions(),
    commits: [],
    error: '',
    systemLanguage: detectSystemLanguage(),
    languageRestarting: false,
    languageFocus: 0,
    envPath: '',
    envExamplePath: '',
    envEntries: [],
    envRaw: '',
    envLoaded: false,
    envDirty: false,
    wizardApplied: false
  }),
  getters: {
    overlayVisible: (state): boolean => state.pending.initialize || state.updateRunning,
    serverBusy: (state): boolean => state.pending.restart || state.updateRunning,
    languageLabel: (state): string => LANGUAGE_LABELS[state.config.resolvedLanguage],
    systemLanguageLabel: (state): string => LANGUAGE_LABELS[state.systemLanguage]
  },
  actions: {
    async initialize() {
      if (this.pending.initialize) return;
      this.pending.initialize = true;
      try {
        const [config, backendUrl, backendVersion, windowState, languageInfo] = await Promise.all([
          window.desktop.getConfig(),
          window.desktop.getBackendUrl(),
          window.desktop.getBackendVersion().catch(() => ''),
          window.desktop.getWindowState().catch(() => ({ maximized: false, minimized: false })),
          window.desktop.getLanguageInfo().catch(() => ({ language: detectSystemLanguage(), label: '' }))
        ]);
        this.config = config;
        this.backendUrl = backendUrl;
        this.backendVersion = backendVersion;
        this.backendReady = Boolean(backendUrl);
        this.windowMaximized = windowState.maximized;
        this.systemLanguage = languageInfo.language;
        setLocale(config.resolvedLanguage);
        await this.loadEnvironment();
      } catch (error) {
        this.error = toMessage(error);
      } finally {
        this.pending.initialize = false;
      }
    },
    async saveConfig() {
      if (this.pending.save) return;
      this.pending.save = true;
      this.error = '';
      try {
        if (this.envDirty) await this.saveEnvironment();
        // Send a plain snapshot: Vue reactive proxies cannot be structured-cloned over IPC.
        const payload: DesktopConfigInput = {
          windowMaximized: Boolean(this.config.windowMaximized),
          hideDesktopOnOpen: Boolean(this.config.hideDesktopOnOpen),
          launchAtLogin: Boolean(this.config.launchAtLogin),
          backendPort: Number(this.config.backendPort),
          language: this.config.language
        };
        await window.desktop.saveConfig(payload);
        this.backendReady = true;
        this.backendVersion = await window.desktop.getBackendVersion().catch(() => this.backendVersion);
      } catch (error) {
        this.error = toMessage(error);
      } finally {
        this.pending.save = false;
      }
    },
    async setHideDesktopOnOpen(value: boolean) {
      if (this.pending.preference || this.config.hideDesktopOnOpen === value) return;
      this.pending.preference = true;
      this.error = '';
      try {
        this.config.hideDesktopOnOpen = await window.desktop.setHideDesktopOnOpen(value);
      } catch (error) {
        this.error = toMessage(error);
      } finally {
        this.pending.preference = false;
      }
    },
    async setLaunchAtLogin(value: boolean) {
      if (this.pending.preference || this.config.launchAtLogin === value) return;
      this.pending.preference = true;
      this.error = '';
      try {
        this.config.launchAtLogin = await window.desktop.setLaunchAtLogin(value);
      } catch (error) {
        this.error = toMessage(error);
      } finally {
        this.pending.preference = false;
      }
    },
    async setLanguage(value: LanguagePreference) {
      if (this.pending.preference || this.config.language === value) return;
      this.pending.preference = true;
      this.languageRestarting = true;
      this.error = '';
      try {
        this.config.language = await window.desktop.setLanguage(value);
      } catch (error) {
        this.languageRestarting = false;
        this.error = toMessage(error);
      } finally {
        this.pending.preference = false;
      }
    },
    focusLanguage() {
      this.page = 'settings';
      this.languageFocus += 1;
    },
    applyEnvironment(snapshot: EnvironmentSnapshot) {
      this.envPath = snapshot.path;
      this.envExamplePath = snapshot.examplePath;
      this.envEntries = snapshot.entries.map((entry) => ({ ...entry }));
      this.envRaw = snapshot.raw;
      this.envLoaded = true;
      this.envDirty = false;
    },
    async loadEnvironment() {
      try {
        this.applyEnvironment(await window.desktop.getEnvironment());
      } catch (error) {
        this.error = toMessage(error);
      }
    },
    setEnvValue(key: string, value: string) {
      const entry = this.envEntries.find((item) => item.key === key);
      if (!entry || entry.value === value) return;
      entry.value = value;
      this.envDirty = true;
      this.wizardApplied = false;
    },
    envHasKey(key: string): boolean {
      return this.envEntries.some((entry) => entry.key === key);
    },
    addEnvEntry(key: string, value: string) {
      if (this.envHasKey(key)) return;
      this.envEntries.push({ key, value });
      this.envDirty = true;
      this.wizardApplied = false;
    },
    removeEnvEntry(key: string) {
      const index = this.envEntries.findIndex((entry) => entry.key === key);
      if (index === -1) return;
      this.envEntries.splice(index, 1);
      this.envDirty = true;
      this.wizardApplied = false;
    },
    async saveEnvironment() {
      if (!this.envDirty) return;
      this.pending.environment = true;
      this.error = '';
      try {
        const entries = this.envEntries.map((entry) => ({ key: entry.key, value: entry.value }));
        this.applyEnvironment(await window.desktop.saveEnvironment(entries));
      } catch (error) {
        this.error = toMessage(error);
        throw error;
      } finally {
        this.pending.environment = false;
      }
    },
    async saveEnvRaw(raw: string): Promise<boolean> {
      if (this.pending.environment) return false;
      this.pending.environment = true;
      this.error = '';
      try {
        this.applyEnvironment(await window.desktop.saveEnvironmentRaw(raw));
        return true;
      } catch (error) {
        this.error = toMessage(error);
        return false;
      } finally {
        this.pending.environment = false;
      }
    },
    async resetEnvironment(): Promise<boolean> {
      if (this.pending.environment) return false;
      this.pending.environment = true;
      this.error = '';
      try {
        this.applyEnvironment(await window.desktop.resetEnvironment());
        return true;
      } catch (error) {
        this.error = toMessage(error);
        return false;
      } finally {
        this.pending.environment = false;
      }
    },
    async applyProviderConfiguration(options: { baseUrl: string; apiKey: string }): Promise<boolean> {
      if (this.pending.wizard || !this.envLoaded) return false;
      this.pending.wizard = true;
      this.error = '';
      this.wizardApplied = false;
      try {
        const merged = new Map(this.envEntries.map((entry) => [entry.key, entry.value] as const));
        merged.set('OPENAI_API_BASE_URL', options.baseUrl);
        if (options.apiKey) merged.set('OPENAI_API_KEY', options.apiKey);
        const entries = [...merged].map(([key, value]) => ({ key, value }));
        this.applyEnvironment(await window.desktop.saveEnvironment(entries));
        await window.desktop.restart();
        this.backendReady = true;
        this.wizardApplied = true;
        return true;
      } catch (error) {
        this.error = toMessage(error);
        return false;
      } finally {
        this.pending.wizard = false;
      }
    },
    async checkUpdates() {
      if (this.pending.checkUpdates) return;
      this.pending.checkUpdates = true;
      this.error = '';
      this.page = 'updates';
      try {
        const [commits, version] = await Promise.all([
          window.desktop.pendingCommits(),
          window.desktop.getBackendVersion().catch(() => this.backendVersion)
        ]);
        this.commits = commits;
        this.backendVersion = version;
      } catch (error) {
        this.commits = [];
        this.error = toMessage(error);
      } finally {
        this.pending.checkUpdates = false;
      }
    },
    async applyUpdate() {
      if (this.pending.applyUpdate) return;
      this.pending.applyUpdate = true;
      this.error = '';
      try {
        const result = await window.desktop.applyUpdate();
        this.commits = result.commits;
        this.backendVersion = await window.desktop.getBackendVersion().catch(() => this.backendVersion);
        if (result.updated) await this.initialize();
      } catch (error) {
        this.error = toMessage(error);
      } finally {
        this.pending.applyUpdate = false;
      }
    },
    async openWebUI() {
      if (this.pending.openWebUI || !this.backendReady) return;
      this.pending.openWebUI = true;
      this.error = '';
      try {
        await window.desktop.openWebUI();
      } catch (error) {
        this.error = toMessage(error);
      } finally {
        this.pending.openWebUI = false;
      }
    },
    async restartServer() {
      if (this.pending.restart) return;
      this.pending.restart = true;
      this.error = '';
      try {
        await window.desktop.restart();
      } catch (error) {
        this.error = toMessage(error);
      } finally {
        this.pending.restart = false;
      }
    },
    async minimizeWindow() {
      if (this.pending.window) return;
      this.pending.window = true;
      try {
        await window.desktop.minimize();
      } catch (error) {
        this.error = toMessage(error);
      } finally {
        this.pending.window = false;
      }
    },
    async toggleMaximizeWindow() {
      if (this.pending.window) return;
      this.pending.window = true;
      try {
        const state = await window.desktop.toggleMaximize();
        this.windowMaximized = state.maximized;
      } catch (error) {
        this.error = toMessage(error);
      } finally {
        this.pending.window = false;
      }
    },
    closeWindow() {
      void window.desktop.closeWindow().catch((error: unknown) => { this.error = toMessage(error); });
    }
  }
});
