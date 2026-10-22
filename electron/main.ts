import { app, BrowserWindow, dialog, ipcMain, Menu, shell, Tray, WebContentsView } from 'electron';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { BackendManager } from './backend-manager';
import { ConfigStore, type DesktopConfig } from './config-store';
import { ensureAdministrator } from './security';
import { UpdateManager } from './updater';
import { validateSecretEnvironment } from './secrets';
import { createTrayIcon } from './tray-icon';

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
    title: 'Open Web UI Desktop continua em execuÃ§Ã£o',
    content: 'Use o Ã­cone na bandeja do sistema para reabrir a janela ou sair do aplicativo.',
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

async function openWebUI(): Promise<void> {
  if (!backendUrl) throw new Error('O servidor ainda nÃ£o estÃ¡ pronto.');
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
    throw new Error(`NÃ£o foi possÃ­vel abrir a interface do Open Web UI em ${backendUrl}. ${error instanceof Error ? error.message : String(error)}`);
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
  if (openItem) openItem.label = webUIShell && !webUIShell.win.isDestroyed() ? 'Focar Open Web UI' : 'Abrir Open Web UI';
}

function createTray(): void {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Open Web UI Desktop');
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Open Web UI', id: 'tray-open', click: () => { void openWebUI().catch(reportActionError); } },
    { label: 'Mostrar janela', id: 'tray-show', click: openWindow },
    { type: 'separator' },
    { label: 'Reiniciar', id: 'tray-restart', click: () => { void restart().catch(reportActionError); } },
    { label: 'Procurar AtualizaÃ§Ãµes', id: 'tray-updates', click: () => { openWindow(); window?.webContents.send('update:request'); } },
    { label: 'ConfiguraÃ§Ãµes', id: 'tray-settings', click: () => { openWindow(); window?.webContents.send('settings:request'); } },
    { label: 'Ajuda', id: 'tray-help', click: () => { openWindow(); window?.webContents.send('help:request'); } },
    { type: 'separator' },
    { label: 'Sair', id: 'tray-quit', click: () => { void quitSafely(); } }
  ]);
  trayMenu = menu;
  tray.setContextMenu(menu);
  tray.on('click', openWindow);
  tray.on('double-click', () => { void openWebUI().catch(reportActionError); });
  updateTrayState();
}

async function restart(): Promise<void> {
  if (updater.isRunning) throw new Error('Aguarde a atualizaÃ§Ã£o em andamento terminar antes de reiniciar.');
  if (restarting) throw new Error('O servidor jÃ¡ estÃ¡ sendo reiniciado.');
  restarting = true;
  updateTrayState();
  window?.webContents.send('backend:restarting', true);
  try {
    await backend.stop();
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
      buttons: ['Sair e marcar atualizaÃ§Ã£o incompleta', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'AtualizaÃ§Ã£o em andamento',
      message: 'Sair agora pode deixar os arquivos do servidor inconsistentes.',
      detail: 'Se continuar, serÃ¡ solicitada uma atualizaÃ§Ã£o limpa na prÃ³xima inicializaÃ§Ã£o.'
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
  ipcMain.handle('config:get', async (event) => {
    if (!isTrustedUi(event.sender)) throw new Error('Janela nÃ£o autorizada.');
    const config = await store.load();
    const visibleEnvironment = config.environment.OPENROUTER_API_KEY ? { OPENROUTER_API_KEY: '' } : {};
    return { ...config, environment: visibleEnvironment };
  });
  ipcMain.handle('config:save', async (event, input: DesktopConfig) => {
    if (!isTrustedUi(event.sender)) throw new Error('Janela nÃ£o autorizada.');
    if (!input || typeof input !== 'object' || typeof input.environment !== 'object' || input.environment === null || !Number.isInteger(input.backendPort) || input.backendPort < 1 || input.backendPort > 65535) throw new Error('ConfiguraÃ§Ã£o invÃ¡lida.');
    if (Object.keys(input.environment).some((key) => key !== 'OPENROUTER_API_KEY')) throw new Error('Somente o provedor OpenRouter pode ser configurado na interface.');
    const existing = (await store.load()).environment;
    const environment = {
      WEBUI_SECRET_KEY: existing.WEBUI_SECRET_KEY,
      WEBUI_JWT_SECRET_KEY: existing.WEBUI_JWT_SECRET_KEY,
      ...Object.fromEntries(Object.entries(input.environment)
        .filter(([key, value]) => key === 'OPENROUTER_API_KEY' && typeof value === 'string')
        .map(([key, value]) => [key, value || existing[key] || '']))
    };
    validateSecretEnvironment(environment);
    const config = { windowMaximized: Boolean(input.windowMaximized), hideDesktopOnOpen: input.hideDesktopOnOpen !== false, backendPort: input.backendPort, environment };
    await store.save(config);
    await restart();
  });
  ipcMain.handle('config:hide-desktop-on-open', async (event, value: boolean) => {
    if (!isTrustedUi(event.sender)) throw new Error('Janela nÃ£o autorizada.');
    if (typeof value !== 'boolean') throw new Error('Valor invÃ¡lido para a preferÃªncia da janela.');
    const config = await store.load();
    await store.save({ ...config, hideDesktopOnOpen: value });
    return value;
  });
  ipcMain.handle('backend:url', (event) => {
    if (!isTrustedUi(event.sender)) throw new Error('Janela nÃ£o autorizada.');
    return backendUrl;
  });
  ipcMain.handle('backend:open-ui', async (event) => {
    if (!isTrustedUi(event.sender)) throw new Error('Janela nÃ£o autorizada.');
    await openWebUI();
  });
  const authorizeWebUi = (event: Electron.IpcMainInvokeEvent): BrowserWindow => {
    const shell = webUIShell;
    if (!shell || shell.win.isDestroyed() || event.sender !== shell.bar.webContents) {
      throw new Error('Janela nÃ£o autorizada.');
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
    if (!win || !isTrustedUi(event.sender)) throw new Error('Janela nÃ£o autorizada.');
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
    if (!isTrustedUi(event.sender)) throw new Error('Janela nÃ£o autorizada.');
    await restart();
  });
  ipcMain.handle('update:pending', async (event) => {
    if (!isTrustedUi(event.sender)) throw new Error('Janela nÃ£o autorizada.');
    window?.webContents.send('update:state', true);
    updateTrayState();
    try { return await updater.pendingCommits(); }
    finally {
      window?.webContents.send('update:state', false);
      updateTrayState();
    }
  });
  ipcMain.handle('update:apply', async (event) => {
    if (!isTrustedUi(event.sender)) throw new Error('Janela nÃ£o autorizada.');
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
    await dialog.showMessageBox({ type: 'error', title: 'Open Web UI Desktop', message: 'Este aplicativo requer Windows 10/11 x64.' });
    app.quit();
    return;
  }
  try {
    await updater.recoverIfCorrupted();
    registerHandlers();
    const config = await store.load();
    if (!config.environment.WEBUI_SECRET_KEY) {
      config.environment.WEBUI_SECRET_KEY = randomBytes(32).toString('hex');
      config.environment.WEBUI_JWT_SECRET_KEY = randomBytes(32).toString('hex');
      await store.save(config);
    }
    backendUrl = await backend.start(config.environment, config.backendPort);
    window = createWindow(config.windowMaximized);
    createTray();
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error', title: 'NÃ£o foi possÃ­vel iniciar o servidor',
      message: error instanceof Error ? error.message : String(error),
      detail: `Verifique se o Python embeddable e as dependÃªncias estÃ£o em lib. Autor: ${AUTHOR}`
    });
    quitting = true;
    await backend.stop();
    app.quit();
  }
});
