export interface CommandOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  allowFailure?: boolean;
  timeoutMs?: number;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const activeProcesses = new Set<number>();

export class ManagedService {
  readonly process: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  readonly output: Promise<string>;

  constructor(command: string[], options: CommandOptions = {}) {
    this.process = Bun.spawn(command, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      detached: process.platform !== 'win32',
      windowsHide: true
    });
    activeProcesses.add(this.process.pid);
    void this.process.exited.then(() => activeProcesses.delete(this.process.pid));
    this.output = Promise.all([
      new Response(this.process.stdout).text(),
      new Response(this.process.stderr).text()
    ]).then(([stdout, stderr]) => `${stdout}${stderr}`);
  }

  async stop() {
    if (this.process.exitCode !== null) return;
    killProcessTree(this.process.pid);
    await Promise.race([this.process.exited, Bun.sleep(5_000)]);
  }
}

export async function run(command: string[], options: CommandOptions = {}): Promise<CommandResult> {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true
  });
  activeProcesses.add(child.pid);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = options.timeoutMs
    ? new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          killProcessTree(child.pid);
          reject(new Error(`Command timed out after ${options.timeoutMs} ms.`));
        }, options.timeoutMs);
      })
    : new Promise<never>(() => undefined);
  const completed = Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text()
  ]).then(([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr }));
  const result = await Promise.race([completed, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
    activeProcesses.delete(child.pid);
  });
  if (!options.allowFailure && result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Command exited with ${result.exitCode}.`);
  }
  return result;
}

export async function waitForHttp(url: string, service: ManagedService, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (service.process.exitCode !== null) {
      throw new Error(`Service exited before becoming ready.\n${await service.output}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {}
    await Bun.sleep(150);
  }
  await service.stop();
  throw new Error(`Service did not become ready at ${url}.\n${await service.output}`);
}

export function reservePorts(count: number) {
  const listeners = Array.from({ length: count }, () => Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: { data() {} }
  }));
  const ports = listeners.map((listener) => listener.port);
  for (const listener of listeners) listener.stop(true);
  return ports;
}

export function stopActiveProcesses() {
  for (const pid of activeProcesses) killProcessTree(pid);
  activeProcesses.clear();
}

function killProcessTree(pid: number) {
  if (process.platform === 'win32') {
    Bun.spawnSync(['taskkill', '/PID', String(pid), '/T', '/F'], {
      stdout: 'ignore',
      stderr: 'ignore',
      windowsHide: true
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {}
}
