import { run, type CommandResult } from './process';

export class MarlClient {
  private cookie = '';

  constructor(
    readonly apiUrl: string,
    readonly gitUrl: string,
    readonly workspace: string
  ) {}

  async authenticate(account: { name: string; username: string; email: string; password: string }) {
    const response = await fetch(`${this.apiUrl}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(account)
    });
    if (!response.ok) throw new Error(`Qualification sign-up failed (${response.status}): ${await response.text()}`);
    this.cookie = response.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
    if (!this.cookie) throw new Error('Qualification sign-up did not establish a session.');
  }

  async response(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set('cookie', this.cookie);
    if (init.body) headers.set('content-type', 'application/json');
    return fetch(`${this.apiUrl}${path}`, { ...init, headers });
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.response(path, init);
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${path} failed (${response.status}): ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }

  async text(path: string) {
    const response = await this.response(path);
    if (!response.ok) throw new Error(`GET ${path} failed (${response.status}): ${await response.text()}`);
    return response.text();
  }

  async git(args: string[], token: string, options: { cwd?: string; allowFailure?: boolean } = {}): Promise<CommandResult> {
    return run(['git', ...args], {
      cwd: options.cwd ?? this.workspace,
      allowFailure: options.allowFailure,
      timeoutMs: 120_000,
      env: {
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'http.extraHeader',
        GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`
      }
    });
  }

  async waitFor<T>(operation: () => Promise<T>, ready: (value: T) => boolean, message: string, timeoutMs = 30_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const value = await operation();
        if (ready(value)) return value;
      } catch (error) {
        lastError = error;
      }
      await Bun.sleep(200);
    }
    throw new Error(`${message}${lastError ? `: ${String(lastError)}` : ''}`);
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
