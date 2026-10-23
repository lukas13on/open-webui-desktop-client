import { app, dialog } from 'electron';
import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import { t } from './i18n';

export async function ensureAdministrator(): Promise<boolean> {
  if (platform() !== 'win32') return true;
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true });
  } catch {
    await dialog.showMessageBox({
      type: 'warning',
      title: 'Open Web UI Desktop',
      message: t('admin.required')
    });
    app.exit(1);
    return false;
  }
  return true;
}

export const delay = promisify(setTimeout);
