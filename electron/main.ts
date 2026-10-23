import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray, WebContentsView } from 'electron';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { BackendManager } from './backend-manager';
import { ConfigStore, normalizeLanguagePreference, SUPPORTED_LANGUAGES, type DesktopConfigPayload, type Language, type PublicDesktopConfig } from './config-store';
import { EnvironmentService } from './environment-service';
import { ensureAdministrator } from './security';
import { UpdateManager } from './updater';
import { createTrayIcon } from './tray-icon';
import { LANGUAGE_LABELS, resolveLanguage, setLanguage, t } from './i18n';

const AUTHOR = 'Lucas de Oliveira Neitzke';
const WEBUI_TITLEBAR_HEIGHT = 52;
type WebUiShell = { win: BrowserWindow; bar: WebContentsView; app: WebContentsView };
let window: BrowserWindow | null = null;
let webUIShell: WebUiShell | null = null;
let tray: Tray | null = null;
let trayMenu: Menu | null = null;
let backendUrl = '';
let quitting = false;
let restarting = false;
let hideHintShown = false;
const backend = BackendManager.getInstance();
const store = ConfigStore.getInstance();
const updater = UpdateManager.getInstance();
const environment = EnvironmentService.getInstance();

function isTrustedUi(sender: Electron.WebContents): boolean {
  if (BrowserWindow.fromWebContents(sender) !== window) return false;
  const url = sender.getURL();
  if (process.env.VITE_DEV_SERVER_URL) return url.startsWith(new URL(process.env.VITE_DEV_SERVER_URL).origin);
  return url === pathToFileURL(path.join(app.getAppPath(), 'dist', 'index.html')).href;
}

function createWindow(maximized = false): BrowserWindow {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#0f0f11',
    title: 'Open Web UI Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'desktop-control',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => {
    if (win.isDestroyed()) return;
    win.webContents.send('window:maximized', win.isMaximized());
  });
  win.on('maximize', () => {
    win.webContents.send('window:maximized', true);
    updateTrayState();
    void store.load().then((config) => store.save({ ...config, windowMaximized: true }));
  });
  win.on('unmaximize', () => {
    win.webContents.send('window:maximized', false);
    updateTrayState();
    void store.load().then((config) => store.save({ ...config, windowMaximized: false }));
  });
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      hideWindow();
    }
  });
  win.on('closed', () => { if (window === win) window = null; });
  const devOrigin = process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL).origin : '';
  win.webContents.on('will-redirect', (event, url) => {
    if (process.env.VITE_DEV_SERVER_URL && url.startsWith(devOrigin)) return;
    if (!url.startsWith('file:')) event.preventDefault();
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (process.env.VITE_DEV_SERVER_URL && url.startsWith(devOrigin)) return;
    if (url === backendUrl) {
      event.preventDefault();
      void openWebUI().catch(reportActionError);
    } else if (!url.startsWith('file:')) {
      event.preventDefault();
      if (url.startsWith('https://')) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === backendUrl) void openWebUI().catch(reportActionError);
    else if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (!process.env.VITE_DEV_SERVER_URL) {
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"]
        }
      });
    });
  }
  if (process.env.VITE_DEV_SERVER_URL) void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  return win;
}

function openWindow(): void {
  if (!window || window.isDestroyed()) window = createWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function hideWindow(): void {
  if (!window || window.isDestroyed()) return;
  window.hide();
  showTrayHint();
}

function showTrayHint(): void {
  if (hideHintShown || !tray) return;
  hideHintShown = true;
  tray.displayBalloon({
    title: t('balloon.title'),
    content: t('balloon.content'),
    iconType: 'info'
  });
}

async function hideDesktopForWebUi(): Promise<void> {
  if (!window || window.isDestroyed() || !window.isVisible()) return;
  const config = await store.load();
  if (!config.hideDesktopOnOpen) return;
  window.hide();
  showTrayHint();
}

function layoutWebUiShell(shell: WebUiShell): void {
  if (shell.win.isDestroyed()) return;
  const { width, height } = shell.win.getContentBounds();
  const titlebarHeight = Math.min(WEBUI_TITLEBAR_HEIGHT, Math.max(0, height));
  shell.bar.setBounds({ x: 0, y: 0, width, height: titlebarHeight });
  shell.app.setBounds({ x: 0, y: titlebarHeight, width, height: Math.max(0, height - titlebarHeight) });
}

function sendMaximizeState(shell: WebUiShell, maximized: boolean): void {
  if (shell.bar.webContents.isDestroyed()) return;
  shell.bar.webContents.send('webui-window:maximized', maximized);
}

function closeWebUiShell(): void {
  const shell = webUIShell;
  webUIShell = null;
  if (!shell) return;
  if (!shell.win.isDestroyed()) shell.win.close();
  if (!shell.bar.webContents.isDestroyed()) shell.bar.webContents.close();
  if (!shell.app.webContents.isDestroyed()) shell.app.webContents.close();
}

function createWebUiShell(): WebUiShell {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 640,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0f11',
    title: 'Open Web UI',
    show: false
  });
  win.setMenuBarVisibility(false);

  const bar = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-webui.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  bar.setBackgroundColor('#0f0f11');
  const appView = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  appView.setBackgroundColor('#0f0f11');

  win.contentView.addChildView(bar);
  win.contentView.addChildView(appView);

  const webUi: WebUiShell = { win, bar, app: appView };
  layoutWebUiShell(webUi);

  const relayout = (): void => { layoutWebUiShell(webUi); };
  win.on('resize', relayout);
  win.on('maximize', () => { relayout(); setTimeout(relayout, 60); sendMaximizeState(webUi, true); });
  win.on('unmaximize', () => { relayout(); setTimeout(relayout, 60); sendMaximizeState(webUi, false); });
  win.on('enter-full-screen', relayout);
  win.on('leave-full-screen', relayout);
  win.on('closed', () => {
    if (!bar.webContents.isDestroyed()) bar.webContents.close();
    if (!appView.webContents.isDestroyed()) appView.webContents.close();
    if (webUIShell === webUi) webUIShell = null;
    updateTrayState();
  });

  bar.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  bar.webContents.on('will-navigate', (event) => event.preventDefault());
  bar.webContents.on('did-finish-load', () => { sendMaximizeState(webUi, win.isMaximized()); });
  appView.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  appView.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(backendOrigin())) event.preventDefault();
  });
  appView.webContents.on('will-redirect', (event, url) => {
    if (!url.startsWith(backendOrigin())) event.preventDefault();
  });
  appView.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const contents = appView.webContents;
    const key = input.key.toLowerCase();
    const control = input.control || input.meta;
    if (key === 'f12' || (control && input.shift && ['i', 'j', 'c'].includes(key))) {
      event.preventDefault();
      if (contents.isDevToolsOpened()) contents.closeDevTools();
      else contents.openDevTools({ mode: 'detach' });
    } else if (key === 'f5' || (control && key === 'r')) {
      event.preventDefault();
      if (control && input.shift) contents.reloadIgnoringCache();
      else contents.reload();
    }
  });
  appView.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(backendOrigin())) {
      if (url !== backendUrl) void appView.webContents.loadURL(url);
    } else if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return webUi;
}

function backendOrigin(): string {
  return backendUrl ? new URL(backendUrl).origin : '';
}

function applyLoginItem(enabled: boolean): void {
  if (process.platform !== 'win32' || !app.isPackaged || process.windowsStore) return;
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: [] });
  } catch (error) {
    console.error(t('loginItem.failed'), error);
  }
}

async function backendVersion(): Promise<string> {
  const installPath = app.isPackaged
    ? path.resolve(process.env.OPENWEBUI_DESKTOP_PATH || path.dirname(app.getPath('exe')))
    : app.getAppPath();
  const resourceRoot = app.isPackaged ? path.join(installPath, 'resources') : installPath;
  try {
    const raw = await readFile(path.join(resourceRoot, 'backend', 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '';
  } catch {
    return '';
  }
}

async function relaunchApplication(): Promise<void> {
  quitting = true;
  await backend.stop();
  app.relaunch();
  app.exit(0);
}

async function openWebUI(): Promise<void> {
  if (!backendUrl) throw new Error(t('backend.notReady'));
  const existing = webUIShell;
  if (existing && !existing.win.isDestroyed()) {
    if (existing.app.webContents.getURL() !== backendUrl) await existing.app.webContents.loadURL(backendUrl);
    if (existing.win.isMinimized()) existing.win.restore();
    existing.win.show();
    existing.win.focus();
    await hideDesktopForWebUi();
    return;
  }
  const shell = createWebUiShell();
  webUIShell = shell;
  try {
    await shell.bar.webContents.loadFile(path.join(__dirname, 'webui-titlebar.html'));
    await shell.app.webContents.loadURL(backendUrl);
  } catch (error) {
    if (webUIShell === shell) webUIShell = null;
    if (!shell.bar.webContents.isDestroyed()) shell.bar.webContents.close();
    if (!shell.app.webContents.isDestroyed()) shell.app.webContents.close();
    if (!shell.win.isDestroyed()) shell.win.destroy();
    throw new Error(t('webui.openFailed', { url: backendUrl, reason: error instanceof Error ? error.message : String(error) }));
  }
  updateTrayState();
  shell.win.show();
  shell.win.focus();
  await hideDesktopForWebUi();
}

function reportActionError(error: unknown): void {
  void dialog.showMessageBox({
    type: 'error',
    title: 'Open Web UI Desktop',
    message: error instanceof Error ? error.message : String(error)
  });
}

function updateTrayState(): void {
  if (!trayMenu) return;
  const busy = restarting || updater.isRunning || !backendUrl;
  for (const id of ['tray-open', 'tray-restart', 'tray-updates', 'tray-settings', 'tray-help']) {
    const item = trayMenu.getMenuItemById(id);
    if (item) item.enabled = !busy;
  }
  const openItem = trayMenu.getMenuItemById('tray-open');
  if (openItem) openItem.label = webUIShell && !webUIShell.win.isDestroyed() ? t('tray.focus') : t('tray.open');
}

function createTray(): void {
  tray = new Tray(createTrayIcon());
  tray.setToolTip(t('tray.tooltip'));
  const menu = Menu.buildFromTemplate([
    { label: t('tray.open'), id: 'tray-open', click: () => { void openWebUI().catch(reportActionError); } },
    { label: t('tray.show'), id: 'tray-show', click: openWindow },
    { type: 'separator' },
    { label: t('tray.restart'), id: 'tray-restart', click: () => { void restart().catch(reportActionError); } },
    { label: t('tray.updates'), id: 'tray-updates', click: () => { openWindow(); window?.webContents.send('update:request'); } },
    { label: t('tray.settings'), id: 'tray-settings', click: () => { openWindow(); window?.webContents.send('settings:request'); } },
    { label: t('tray.help'), id: 'tray-help', click: () => { openWindow(); window?.webContents.send('help:request'); } },
    { type: 'separator' },
    { label: t('tray.quit'), id: 'tray-quit', click: () => { void quitSafely(); } }
  ]);
  trayMenu = menu;
  tray.setContextMenu(menu);
  tray.on('click', openWindow);
  tray.on('double-click', () => { void openWebUI().catch(reportActionError); });
  updateTrayState();
}

async function restart(): Promise<void> {
  if (updater.isRunning) throw new Error(t('restart.updateRunning'));
  if (restarting) throw new Error(t('restart.alreadyRunning'));
  restarting = true;
  updateTrayState();
  window?.webContents.send('backend:restarting', true);
  try {
    await backend.stop();
    await environment.applyPendingConfigReset();
    const config = await store.load();
    backendUrl = await backend.start(config.environment, config.backendPort);
    if (!window || window.isDestroyed()) window = createWindow();
    window?.webContents.send('backend:restarted', backendUrl);
    if (webUIShell && !webUIShell.win.isDestroyed()) closeWebUiShell();
  } catch (error) {
    backendUrl = '';
    window?.webContents.send('backend:restarted', '');
    throw error;
  } finally {
    restarting = false;
    updateTrayState();
    window?.webContents.send('backend:restarting', false);
  }
}

async function quitSafely(): Promise<void> {
  if (updater.isRunning) {
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: [t('quit.confirm'), t('quit.cancel')],
      defaultId: 1,
      cancelId: 1,
      title: t('quit.title'),
      message: t('quit.message'),
      detail: t('quit.detail')
    });
    if (result.response !== 0) return;
    await updater.markCorruptedAndExit();
    return;
  }
  quitting = true;
  await backend.stop();
  app.quit();
}

function registerHandlers(): void {
  const untrusted = (): Error => new Error(t('untrusted'));
  ipcMain.handle('config:get', async (event): Promise<DesktopConfigPayload> => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    const { environment: _environment, ...config } = await store.load();
    return { ...config, resolvedLanguage: resolveLanguage(config.language) };
  });
  ipcMain.handle('config:save', async (event, input: PublicDesktopConfig) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    if (!input || typeof input !== 'object' || !Number.isInteger(input.backendPort) || input.backendPort < 1 || input.backendPort > 65535) throw new Error(t('config.invalid'));
    const existing = await store.load();
    await store.save({
      windowMaximized: Boolean(input.windowMaximized),
      hideDesktopOnOpen: input.hideDesktopOnOpen !== false,
      launchAtLogin: Boolean(input.launchAtLogin),
      backendPort: input.backendPort,
      language: normalizeLanguagePreference(input.language),
      environment: existing.environment
    });
    applyLoginItem(Boolean(input.launchAtLogin));
    await restart();
  });
  ipcMain.handle('config:hide-desktop-on-open', async (event, value: boolean) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    if (typeof value !== 'boolean') throw new Error(t('config.invalidWindowPreference'));
    const config = await store.load();
    await store.save({ ...config, hideDesktopOnOpen: value });
    return value;
  });
  ipcMain.handle('config:launch-at-login', async (event, value: boolean) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    if (typeof value !== 'boolean') throw new Error(t('config.invalidLoginPreference'));
    const config = await store.load();
    await store.save({ ...config, launchAtLogin: value });
    applyLoginItem(value);
    return value;
  });
  ipcMain.handle('config:language', async (event, value: unknown) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    const preference = normalizeLanguagePreference(value);
    if (value !== 'auto' && !SUPPORTED_LANGUAGES.includes(preference as Language)) throw new Error(t('config.invalidLanguage'));
    const config = await store.load();
    await store.save({ ...config, language: preference });
    setTimeout(() => { void relaunchApplication(); }, 150);
    return preference;
  });
  ipcMain.handle('env:get', async (event) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    return environment.read();
  });
  ipcMain.handle('env:save', async (event, entries: unknown) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    return environment.saveEntries(entries);
  });
  ipcMain.handle('env:save-raw', async (event, raw: unknown) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    return environment.saveRaw(raw);
  });
  ipcMain.handle('env:reset', async (event) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    return environment.resetToExample();
  });
  ipcMain.handle('app:language-info', () => ({
    language: resolveLanguage('auto'),
    label: LANGUAGE_LABELS[resolveLanguage('auto')]
  }));
  ipcMain.handle('backend:version', async (event) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    return backendVersion();
  });
  ipcMain.handle('webui-window:locale', () => ({
    serverName: t('webui.serverName'),
    serverActive: t('webui.serverActive'),
    minimize: t('webui.minimize'),
    maximize: t('webui.maximize'),
    restore: t('webui.restore'),
    close: t('webui.close')
  }));
  ipcMain.handle('backend:url', (event) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    return backendUrl;
  });
  ipcMain.handle('backend:open-ui', async (event) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    await openWebUI();
  });
  const authorizeWebUi = (event: Electron.IpcMainInvokeEvent): BrowserWindow => {
    const shell = webUIShell;
    if (!shell || shell.win.isDestroyed() || event.sender !== shell.bar.webContents) {
      throw untrusted();
    }
    return shell.win;
  };
  ipcMain.handle('webui-window:state', (event) => {
    const win = authorizeWebUi(event);
    return { maximized: win.isMaximized(), minimized: win.isMinimized() };
  });
  ipcMain.handle('webui-window:minimize', (event) => { authorizeWebUi(event).minimize(); });
  ipcMain.handle('webui-window:toggle-maximize', (event) => {
    const win = authorizeWebUi(event);
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('webui-window:close', (event) => { authorizeWebUi(event).close(); });
  const authorizeWindow = (event: Electron.IpcMainInvokeEvent): BrowserWindow => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !isTrustedUi(event.sender)) throw untrusted();
    return win;
  };
  ipcMain.handle('window:state', (event) => {
    const win = authorizeWindow(event);
    return { maximized: win.isMaximized(), minimized: win.isMinimized() };
  });
  ipcMain.handle('window:minimize', (event) => {
    const win = authorizeWindow(event);
    win.minimize();
    return { maximized: false, minimized: true };
  });
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = authorizeWindow(event);
    const next = !win.isMaximized();
    if (next) win.maximize(); else win.unmaximize();
    return { maximized: next, minimized: false };
  });
  ipcMain.handle('window:close', (event) => {
    authorizeWindow(event);
    hideWindow();
    return { hidden: true };
  });
  ipcMain.handle('app:restart', async (event) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    await restart();
  });
  ipcMain.handle('update:pending', async (event) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    window?.webContents.send('update:state', true);
    updateTrayState();
    try { return await updater.pendingCommits(); }
    finally {
      window?.webContents.send('update:state', false);
      updateTrayState();
    }
  });
  ipcMain.handle('update:apply', async (event) => {
    if (!isTrustedUi(event.sender)) throw untrusted();
    window?.webContents.send('update:state', true);
    updateTrayState();
    try {
      const result = await updater.update(true);
      if (result.updated) {
        const config = await store.load();
        backendUrl = await backend.start(config.environment, config.backendPort);
        window?.webContents.send('backend:restarted', backendUrl);
        closeWebUiShell();
      }
      return result;
    } catch (error) {
      if (!backend.url) {
        const config = await store.load();
        backendUrl = await backend.start(config.environment, config.backendPort);
        window?.webContents.send('backend:restarted', backendUrl);
      }
      throw error;
    } finally {
      window?.webContents.send('update:state', false);
      updateTrayState();
    }
  });
}

app.setAppUserModelId('com.openwebui.desktop');
app.on('before-quit', (event) => {
  if (!quitting && backend.port !== null) {
    event.preventDefault();
    void quitSafely();
  }
});
app.on('window-all-closed', () => { /* Keep the tray process alive until the user selects Sair. */ });

void app.whenReady().then(async () => {
  if (!(app.isPackaged && process.windowsStore) && !await ensureAdministrator()) return;
  if (!app.isReady()) return;
  if (process.platform !== 'win32') {
    await dialog.showMessageBox({ type: 'error', title: 'Open Web UI Desktop', message: t('platform.unsupported') });
    app.quit();
    return;
  }
  try {
    const config = await store.load();
    setLanguage(resolveLanguage(config.language));
    await updater.recoverIfCorrupted();
    registerHandlers();
    await environment.ensureInitialized();
    if (!config.environment.WEBUI_SECRET_KEY) {
      config.environment.WEBUI_SECRET_KEY = randomBytes(32).toString('hex');
      config.environment.WEBUI_JWT_SECRET_KEY = randomBytes(32).toString('hex');
      await store.save(config);
    }
    backendUrl = await backend.start(config.environment, config.backendPort);
    window = createWindow(config.windowMaximized);
    createTray();
    applyLoginItem(config.launchAtLogin);
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error', title: t('startup.title'),
      message: error instanceof Error ? error.message : String(error),
      detail: t('startup.detail', { author: AUTHOR })
    });
    quitting = true;
    await backend.stop();
    app.quit();
  }
});
