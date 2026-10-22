import { app, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BackendManager } from './backend-manager';

export type PendingCommit = { hash: string; subject: string };

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `Git terminou com código ${code}.`)));
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
    if (this.running) throw new Error('A atualização já está em andamento.');
    this.running = true;
    try {
      const commits = await this.pendingCommits();
      if (!commits.length) return { commits, updated: false };
      if (!confirmed) return { commits, updated: false };
      const result = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Atualizar servidor', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        title: 'Confirmar atualização',
        message: `${commits.length} commit(s) do servidor serão instalados.`,
        detail: commits.slice(0, 25).map(({ hash, subject }) => `${hash} ${subject}`).join('\n') + (commits.length > 25 ? `\n… e mais ${commits.length - 25}` : '')
      });
      if (result.response !== 0) return { commits, updated: false };
      if (this.isStorePackage) throw new Error('A Microsoft Store não permite substituir código empacotado durante a execução. Atualize o aplicativo pela Store.');
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
        type: 'warning', buttons: ['Sair', 'Continuar sem atualizar'], defaultId: 0, cancelId: 0,
        title: 'Atualização interrompida',
        message: 'A Microsoft Store não permite reparar os arquivos empacotados no local.',
        detail: 'Reinstale uma versão atualizada do aplicativo Desktop para restaurar o servidor.'
      });
      await rm(marker, { force: true });
      if (recoveryChoice.response === 0) throw new Error('Reinicie o aplicativo pela Microsoft Store após instalar uma versão atualizada.');
      return false;
    }
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Atualização limpa', 'Sair'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização interrompida',
      message: 'Uma atualização foi interrompida e os arquivos podem estar inconsistentes.',
      detail: 'A atualização limpa remove e clona novamente a pasta backend. Faça backup dos dados personalizados antes de continuar.'
    });
    if (result.response !== 0) throw new Error('A recuperação foi cancelada. O backend não será iniciado até reparar a instalação.');
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
