import { app } from 'electron';
import path from 'node:path';

export function installRoot(): string {
  return app.isPackaged
    ? path.resolve(process.env.OPENWEBUI_DESKTOP_PATH || path.dirname(app.getPath('exe')))
    : app.getAppPath();
}

export function resourceRoot(): string {
  return app.isPackaged ? path.join(installRoot(), 'resources') : installRoot();
}

export function backendRoot(): string {
  return path.join(resourceRoot(), 'backend');
}

export function environmentFile(): string {
  return path.join(backendRoot(), '.env');
}

export function environmentExampleFile(): string {
  return path.join(backendRoot(), '.env.example');
}

export function dataDirectory(): string {
  return path.join(app.getPath('appData'), 'openwebui-desktop', 'data');
}

export function databaseFile(): string {
  return path.join(dataDirectory(), 'webui.db');
}

export function pythonExecutable(): string | null {
  const candidates = app.isPackaged
    ? [path.join(resourceRoot(), 'lib', 'python', 'python.exe')]
    : [process.env.DESKTOP_PYTHON, path.join(resourceRoot(), 'lib', 'python', 'python.exe')];
  return candidates.find((candidate): candidate is string => Boolean(candidate)) ?? null;
}
