import { ipcRenderer } from 'electron';

type WindowState = { maximized: boolean; minimized: boolean };

function updateMaximizeButton(maximized: boolean): void {
  const button = document.querySelector('[data-action="toggleMaximize"]');
  if (!button) return;
  button.textContent = maximized ? '\u2750' : '\u25A1';
  button.setAttribute('aria-label', maximized ? 'Restaurar' : 'Maximizar');
  button.setAttribute('title', maximized ? 'Restaurar' : 'Maximizar');
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
    .invoke('webui-window:state')
    .then((state: WindowState) => updateMaximizeButton(Boolean(state?.maximized)))
    .catch(() => { /* Window state is cosmetic; keep the default glyph. */ });
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initialize);
else initialize();

