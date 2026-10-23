import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopConfigPayload, PublicDesktopConfig } from './config-store';
import type { EnvironmentSnapshot } from './environment-service';
import type { EnvEntry } from './env-file';
import type { PendingCommit } from './updater';

type WindowState = { maximized: boolean; minimized: boolean };

const desktop = {
  getConfig: (): Promise<DesktopConfigPayload> => ipcRenderer.invoke('config:get'),
  saveConfig: (config: PublicDesktopConfig): Promise<void> => ipcRenderer.invoke('config:save', config),
  getBackendUrl: (): Promise<string> => ipcRenderer.invoke('backend:url'),
  getBackendVersion: (): Promise<string> => ipcRenderer.invoke('backend:version'),
  getLanguageInfo: (): Promise<{ language: string; label: string }> => ipcRenderer.invoke('app:language-info'),
  setLanguage: (value: string): Promise<string> => ipcRenderer.invoke('config:language', value),
  getEnvironment: (): Promise<EnvironmentSnapshot> => ipcRenderer.invoke('env:get'),
  saveEnvironment: (entries: EnvEntry[]): Promise<EnvironmentSnapshot> => ipcRenderer.invoke('env:save', entries),
  saveEnvironmentRaw: (raw: string): Promise<EnvironmentSnapshot> => ipcRenderer.invoke('env:save-raw', raw),
  resetEnvironment: (): Promise<EnvironmentSnapshot> => ipcRenderer.invoke('env:reset'),
  setHideDesktopOnOpen: (value: boolean): Promise<boolean> => ipcRenderer.invoke('config:hide-desktop-on-open', value),
  setLaunchAtLogin: (value: boolean): Promise<boolean> => ipcRenderer.invoke('config:launch-at-login', value),
  openWebUI: (): Promise<void> => ipcRenderer.invoke('backend:open-ui'),
  getWindowState: (): Promise<WindowState> => ipcRenderer.invoke('window:state'),
  minimize: (): Promise<WindowState> => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: (): Promise<WindowState> => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: (): Promise<{ hidden: boolean }> => ipcRenderer.invoke('window:close'),
  restart: (): Promise<void> => ipcRenderer.invoke('app:restart'),
  pendingCommits: (): Promise<PendingCommit[]> => ipcRenderer.invoke('update:pending'),
  applyUpdate: (): Promise<{ commits: PendingCommit[]; updated: boolean }> => ipcRenderer.invoke('update:apply'),
  onUpdateState: (callback: (running: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, running: boolean) => callback(running);
    ipcRenderer.on('update:state', listener);
    return () => ipcRenderer.removeListener('update:state', listener);
  },
  onBackendRestarting: (callback: (restarting: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, restarting: boolean) => callback(restarting);
    ipcRenderer.on('backend:restarting', listener);
    return () => ipcRenderer.removeListener('backend:restarting', listener);
  },
  onWindowMaximized: (callback: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window:maximized', listener);
    return () => ipcRenderer.removeListener('window:maximized', listener);
  },
  onUpdateRequest: (callback: () => void): (() => void) => subscribe('update:request', callback),
  onSettingsRequest: (callback: () => void): (() => void) => subscribe('settings:request', callback),
  onHelpRequest: (callback: () => void): (() => void) => subscribe('help:request', callback),
  onBackendRestarted: (callback: (url: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('backend:restarted', listener);
    return () => ipcRenderer.removeListener('backend:restarted', listener);
  }
};

function subscribe(channel: string, callback: () => void): () => void {
  const listener = () => callback();
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('desktop', desktop);
