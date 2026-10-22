export type DesktopConfig = {
  windowMaximized: boolean;
  hideDesktopOnOpen: boolean;
  backendPort: number;
  environment: Record<string, string>;
};

export type PendingCommit = { hash: string; subject: string };

export type WindowState = { maximized: boolean; minimized: boolean };

export type DesktopBridge = {
  getConfig(): Promise<DesktopConfig>;
  saveConfig(config: DesktopConfig): Promise<void>;
  getBackendUrl(): Promise<string>;
  setHideDesktopOnOpen(value: boolean): Promise<boolean>;
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
