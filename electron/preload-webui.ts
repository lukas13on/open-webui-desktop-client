import { ipcRenderer } from 'electron';

type WindowState = { maximized: boolean; minimized: boolean };

type LocaleStrings = {
  serverName: string;
  serverActive: string;
  minimize: string;
  maximize: string;
  restore: string;
  close: string;
};

const MAXIMIZE_PATH =
  'M64 64C28.7 64 0 92.7 0 128L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64L64 64zm24 64l336 0c13.3 0 24 10.7 24 24s-10.7 24-24 24L88 176c-13.3 0-24-10.7-24-24s10.7-24 24-24z';
const RESTORE_PATH =
  'M512 96L160 96c0-35.3 28.7-64 64-64l288 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64l-48 0 0-64 48 0 0-192zM0 224c0-35.3 28.7-64 64-64l288 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 224zm64 40c0 13.3 10.7 24 24 24l240 0c13.3 0 24-10.7 24-24s-10.7-24-24-24L88 240c-13.3 0-24 10.7-24 24z';

let labels: LocaleStrings | null = null;

function applyLabel(button: Element | null, label: string): void {
  if (!button) return;
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}

function updateMaximizeButton(maximized: boolean): void {
  const button = document.querySelector('[data-action="toggleMaximize"]');
  if (!button) return;
  const path = button.querySelector('svg path');
  const svg = button.querySelector('svg');
  if (path) path.setAttribute('d', maximized ? RESTORE_PATH : MAXIMIZE_PATH);
  if (svg) svg.setAttribute('viewBox', maximized ? '0 0 576 512' : '0 0 512 512');
  const label = maximized ? labels?.restore : labels?.maximize;
  if (label) applyLabel(button, label);
}

function applyLocale(strings: LocaleStrings): void {
  labels = strings;
  const suffix = document.querySelector('#titlebar-suffix');
  const status = document.querySelector('#titlebar-status');
  if (suffix) suffix.textContent = strings.serverName;
  if (status) status.textContent = strings.serverActive;
  applyLabel(document.querySelector('[data-action="minimize"]'), strings.minimize);
  applyLabel(document.querySelector('[data-action="toggleMaximize"]'), strings.maximize);
  applyLabel(document.querySelector('[data-action="close"]'), strings.close);
}

async function runAction(action: string | null): Promise<void> {
  try {
    if (action === 'minimize') {
      await ipcRenderer.invoke('webui-window:minimize');
    } else if (action === 'toggleMaximize') {
      const maximized = await ipcRenderer.invoke('webui-window:toggle-maximize');
      updateMaximizeButton(Boolean(maximized));
    } else if (action === 'close') {
      await ipcRenderer.invoke('webui-window:close');
    }
  } catch {
    /* The window may be closing; nothing to surface on the chrome. */
  }
}

function initialize(): void {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (target) void runAction(target.getAttribute('data-action'));
  });

  ipcRenderer.on('webui-window:maximized', (_event, maximized: boolean) => {
    updateMaximizeButton(Boolean(maximized));
  });

  ipcRenderer
    .invoke('webui-window:locale')
    .then((strings: LocaleStrings) => {
      applyLocale(strings);
      return ipcRenderer.invoke('webui-window:state');
    })
    .then((state: WindowState) => updateMaximizeButton(Boolean(state?.maximized)))
    .catch(() => { /* Cosmetic strings and window state; keep the markup defaults. */ });
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initialize);
else initialize();
