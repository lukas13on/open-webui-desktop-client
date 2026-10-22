import { app, dialog } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { isPortAvailable, resolvePort } from './ports';
import { delay } from './security';

export class BackendManager {
  private static instance: BackendManager;
  private process: ChildProcess | null = null;
  private activePort: number | null = null;
  private constructor() {}

  static getInstance(): BackendManager {
    return (this.instance ??= new BackendManager());
  }

  get port(): number | null {
    return this.activePort;
  }

  get url(): string | null {
    return this.port ? `http://127.0.0.1:${this.port}` : null;
  }

  async start(environment: Record<string, string>, preferredPort = 3301): Promise<string> {
    if (this.process) await this.stop();
    if (!Number.isInteger(preferredPort) || preferredPort < 1 || preferredPort > 65535) throw new Error('A porta deve estar entre 1 e 65535.');
    const available = await isPortAvailable(preferredPort);
    let port = preferredPort;
    if (!available) {
      const choice = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Buscar porta alternativa', 'Sair'],
        defaultId: 0,
        cancelId: 1,
        title: 'Porta ocupada',
        message: `A porta ${preferredPort} já está em uso.`,
        detail: 'Você pode procurar outra porta ou fechar o aplicativo.'
      });
      if (choice.response !== 0) throw new Error('Inicialização cancelada porque a porta está ocupada.');
      const alternative = await resolvePort(preferredPort);
      if (!alternative) throw new Error('Nenhuma porta disponível nos intervalos 3100–3999 e 4100–4999.');
      port = alternative;
    }

    const installPath = app.isPackaged
      ? path.resolve(process.env.OPENWEBUI_DESKTOP_PATH || path.dirname(app.getPath('exe')))
      : app.getAppPath();
    const root = app.isPackaged ? path.join(installPath, 'resources') : installPath;
    const backendPath = path.join(root, 'backend');
    const sourcePath = path.join(backendPath, 'backend');
    const embeddedPython = path.join(root, 'lib', 'python', 'python.exe');
    const candidates = app.isPackaged ? [embeddedPython] : [process.env.DESKTOP_PYTHON, embeddedPython].filter((item): item is string => Boolean(item));
    let python: string | undefined;
    for (const candidate of candidates) {
      try { await access(candidate); python = candidate; break; } catch { /* Try the next interpreter. */ }
    }
    if (!python) throw new Error('Interpretador Python não encontrado em lib/python/python.exe.');
    try { await access(path.join(sourcePath, 'open_webui', 'main.py')); }
    catch { throw new Error('Código do servidor ausente na pasta backend.'); }

    const inheritedVariables = ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'PATHEXT', 'ComSpec'];
    const childEnv = {
      ...Object.fromEntries(inheritedVariables.filter((key) => process.env[key]).map((key) => [key, process.env[key] as string])),
      ...environment,
      ANTHROPIC_API_KEY: '',
      GROQ_API_KEY: '',
      OPENAI_API_BASE_URL: 'https://openrouter.ai/api/v1',
      OPENAI_API_KEY: environment.OPENROUTER_API_KEY ?? '',
      OPENAI_API_BASE_URLS: 'https://openrouter.ai/api/v1',
      OPENAI_API_KEYS: environment.OPENROUTER_API_KEY ?? '',
      DEFAULT_MODELS: 'openai/gpt-6-luna-pro',
      USE_SLIM_DOCKER: 'True',
      WEBUI_SECRET_KEY: environment.WEBUI_SECRET_KEY || randomBytes(32).toString('hex'),
      WEBUI_JWT_SECRET_KEY: environment.WEBUI_JWT_SECRET_KEY || randomBytes(32).toString('hex'),
      WEBUI_AUTH: 'True',
      PYTHONPATH: [sourcePath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      DATA_DIR: path.join(app.getPath('appData'), 'openwebui-desktop', 'data'),
      HOST: '127.0.0.1',
      PORT: String(port),
      UVICORN_WORKERS: '1',
      PYTHONUTF8: '1',
      SCARF_NO_ANALYTICS: 'true',
      DO_NOT_TRACK: 'true',
      ANONYMIZED_TELEMETRY: 'false'
    };
    this.process = spawn(python, ['-m', 'uvicorn', 'open_webui.main:app', '--host', '127.0.0.1', '--port', String(port), '--workers', '1'], {
      cwd: sourcePath,
      env: childEnv,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });
    const child = this.process;
    this.activePort = port;
    let startupOutput = '';
    let startupError = '';
    const appendOutput = (chunk: string) => {
      startupOutput = `${startupOutput}${chunk}`.slice(-12_000);
    };
    child.stdout?.setEncoding('utf8').on('data', appendOutput);
    child.stderr?.setEncoding('utf8').on('data', appendOutput);
    child.once('error', (error) => { startupError = error.message; });
    child.once('exit', () => {
      if (this.process === child) {
        this.process = null;
        this.activePort = null;
      }
    });
    await this.waitForHealth(`http://127.0.0.1:${port}`, child, () => ({ startupError, startupOutput }));
    return `http://127.0.0.1:${port}`;
  }

  private async waitForHealth(url: string, child: ChildProcess, getOutput: () => { startupError: string; startupOutput: string }): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < 120_000) {
      if (child.exitCode !== null || child.killed) {
        const { startupError, startupOutput } = getOutput();
        const detail = startupOutput.trim().slice(-3000);
        const reason = startupError || detail || `processo encerrado com código ${child.exitCode}`;
        throw new Error(`O servidor Python encerrou antes de iniciar. ${reason}`);
      }
      try {
        const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return;
      } catch { /* Continue polling until startup succeeds or times out. */ }
      await delay(500);
    }
    const { startupOutput } = getOutput();
    await this.stop();
    throw new Error(`O servidor não respondeu ao health check em 120 segundos.${startupOutput ? `\\n${startupOutput.slice(-3000)}` : ''}`);
  }

  async stop(): Promise<void> {
    const child = this.process;
    this.process = null;
    this.activePort = null;
    if (!child || child.exitCode !== null) return;
    if (process.platform === 'win32' && child.pid) {
      await new Promise<void>((resolve) => {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.once('exit', () => resolve());
        killer.once('error', () => resolve());
        setTimeout(() => resolve(), 5000).unref();
      });
    } else {
      child.kill('SIGKILL');
    }
    await Promise.race([new Promise<void>((resolve) => child.once('exit', () => resolve())), delay(3000)]);
  }
}
