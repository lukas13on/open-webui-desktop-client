import { defineStore } from 'pinia';
import type { DesktopConfig, PendingCommit } from '../types';

export type Page = 'home' | 'settings' | 'updates' | 'help';
export type ActionKey = 'initialize' | 'save' | 'preference' | 'checkUpdates' | 'applyUpdate' | 'openWebUI' | 'restart' | 'window';

export type AppState = {
  page: Page;
  config: DesktopConfig;
  backendUrl: string;
  backendReady: boolean;
  windowMaximized: boolean;
  updateRunning: boolean;
  pending: Record<ActionKey, boolean>;
  commits: PendingCommit[];
  error: string;
};

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function idleActions(): Record<ActionKey, boolean> {
  return { initialize: false, save: false, preference: false, checkUpdates: false, applyUpdate: false, openWebUI: false, restart: false, window: false };
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    page: 'home',
    config: { windowMaximized: false, hideDesktopOnOpen: true, backendPort: 3301, environment: {} },
    backendUrl: '',
    backendReady: false,
    windowMaximized: false,
    updateRunning: false,
    pending: idleActions(),
    commits: [],
    error: ''
  }),
  getters: {
    overlayVisible: (state): boolean => state.pending.initialize || state.updateRunning,
    serverBusy: (state): boolean => state.pending.restart || state.updateRunning
  },
  actions: {
    async initialize() {
      if (this.pending.initialize) return;
      this.pending.initialize = true;
      try {
        const [config, backendUrl, windowState] = await Promise.all([
          window.desktop.getConfig(),
          window.desktop.getBackendUrl(),
          window.desktop.getWindowState().catch(() => ({ maximized: false, minimized: false }))
        ]);
        this.config = config;
        this.backendUrl = backendUrl;
        this.backendReady = Boolean(backendUrl);
        this.windowMaximized = windowState.maximized;
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
        await window.desktop.saveConfig(this.config);
        this.backendReady = true;
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
    async checkUpdates() {
      if (this.pending.checkUpdates) return;
      this.pending.checkUpdates = true;
      this.error = '';
      this.page = 'updates';
      try {
        this.commits = await window.desktop.pendingCommits();
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
