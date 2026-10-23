import { app, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BackendManager } from './backend-manager';
import { t } from './i18n';

export type PendingCommit = { hash: string; subject: string };

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || t('git.exitCode', { code: code ?? 0 }))));
  });
}

export class UpdateManager {
  private static instance: UpdateManager;
  private running = false;
  private constructor() {}

  static getInstance(): UpdateManager {
    return (this.instance ??= new UpdateManager());
  }

  get isRunning(): boolean { return this.running; }
  private get isStorePackage(): boolean { return app.isPackaged && process.windowsStore === true; }

  private get backendPath(): string {
    const installPath = app.isPackaged
      ? path.resolve(process.env.OPENWEBUI_DESKTOP_PATH || path.dirname(app.getPath('exe')))
      : app.getAppPath();
    const resourceRoot = app.isPackaged ? path.join(installPath, 'resources') : installPath;
    return path.join(resourceRoot, 'backend');
  }

  async pendingCommits(): Promise<PendingCommit[]> {
    const backendRoot = this.backendPath;
    await access(path.join(backendRoot, '.git'));
    await git(backendRoot, ['fetch', '--depth', '1', 'origin', 'main', '--quiet']);
    const output = await git(backendRoot, ['log', '--format=%h%x09%s', 'HEAD..origin/main']);
    return output ? output.split(/\r?\n/).map((line) => {
      const [hash, ...subject] = line.split('\t');
      return { hash, subject: subject.join('\t') };
    }) : [];
  }

  async update(confirmed = false): Promise<{ commits: PendingCommit[]; updated: boolean }> {
    if (this.running) throw new Error(t('update.alreadyRunning'));
    this.running = true;
    try {
      const commits = await this.pendingCommits();
      if (!commits.length) return { commits, updated: false };
      if (!confirmed) return { commits, updated: false };
      const detail = commits.slice(0, 25).map(({ hash, subject }) => `${hash} ${subject}`).join('\n');
      const result = await dialog.showMessageBox({
        type: 'warning',
        buttons: [t('update.confirmButton'), t('update.cancelButton')],
        defaultId: 1,
        cancelId: 1,
        title: t('update.confirmTitle'),
        message: t('update.confirmMessage', { count: commits.length }),
        detail: commits.length > 25
          ? t('update.confirmDetail', { commits: detail, remaining: commits.length - 25 })
          : detail
      });
      if (result.response !== 0) return { commits, updated: false };
      if (this.isStorePackage) throw new Error(t('update.storeBlocked'));
      await BackendManager.getInstance().stop();
      await git(this.backendPath, ['fetch', '--depth', '1', 'origin', 'main', '--quiet']);
      await git(this.backendPath, ['reset', '--hard', 'origin/main']);
      return { commits, updated: true };
    } finally {
      this.running = false;
    }
  }

  async markCorruptedAndExit(): Promise<void> {
    const markerDir = path.join(app.getPath('appData'), 'openwebui-desktop');
    await mkdir(markerDir, { recursive: true });
    await writeFile(path.join(markerDir, 'update-interrupted'), new Date().toISOString(), 'utf8');
    app.exit(0);
  }

  async recoverIfCorrupted(): Promise<boolean> {
    const marker = path.join(app.getPath('appData'), 'openwebui-desktop', 'update-interrupted');
    try { await access(marker); } catch { return false; }
    if (this.isStorePackage) {
      const recoveryChoice = await dialog.showMessageBox({
        type: 'warning', buttons: [t('update.cancelExit'), t('update.continueWithoutUpdating')], defaultId: 0, cancelId: 0,
        title: t('update.interruptedTitle'),
        message: t('update.storeRepairMessage'),
        detail: t('update.storeRepairDetail')
      });
      await rm(marker, { force: true });
      if (recoveryChoice.response === 0) throw new Error(t('update.storeExit'));
      return false;
    }
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: [t('update.interruptedClean'), t('update.cancelExit')],
      defaultId: 0,
      cancelId: 1,
      title: t('update.interruptedTitle'),
      message: t('update.interruptedMessage'),
      detail: t('update.interruptedDetail')
    });
    if (result.response !== 0) throw new Error(t('update.recoveryCancelled'));
    const backendPath = this.backendPath;
    await rm(backendPath, { recursive: true, force: true });
    try {
      await git(app.getAppPath(), ['clone', '--depth', '1', '--branch', 'main', 'https://github.com/lukas13on/open-webui-desktop-server.git', 'backend']);
    } catch (error) {
      await writeFile(marker, new Date().toISOString(), 'utf8');
      throw error;
    }
    await rm(marker, { force: true });
    return true;
  }
}
