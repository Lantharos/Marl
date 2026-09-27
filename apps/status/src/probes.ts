import { connect } from 'bun';

export type ComponentId = 'web' | 'api' | 'git' | 'ssh';
export type ProbeResult = { component: ComponentId; ok: boolean; latencyMs: number; detail: string };

export const components: Array<{ id: ComponentId; name: string; description: string }> = [
  { id: 'web', name: 'Website', description: 'marl.sh and repository pages' },
  { id: 'api', name: 'API', description: 'Sign-in, issues, pulls, and automation' },
  { id: 'git', name: 'Git over HTTPS', description: 'Clone, fetch, and push at git.marl.sh' },
  { id: 'ssh', name: 'Git over SSH', description: 'Clone, fetch, and push at ssh.marl.sh' }
];

const timeoutMs = 10_000;

async function timed(component: ComponentId, check: () => Promise<string>): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const detail = await check();
    return { component, ok: true, latencyMs: Math.round(performance.now() - started), detail };
  } catch (error) {
    return {
      component,
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function expectStatus(url: string, accept: (response: Response) => boolean | Promise<boolean>) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
  if (!(await accept(response))) throw new Error(`${url} answered ${response.status}`);
  return String(response.status);
}

function sshBanner(hostname: string, port: number) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SSH banner timed out')), timeoutMs);
    connect({
      hostname,
      port,
      socket: {
        data(socket, data) {
          const banner = new TextDecoder().decode(data).split('\r\n')[0];
          clearTimeout(timer);
          socket.end();
          if (banner.startsWith('SSH-2.0')) resolve(banner);
          else reject(new Error('Unexpected SSH banner'));
        },
        error(_socket, error) {
          clearTimeout(timer);
          reject(error);
        },
        connectError(_socket, error) {
          clearTimeout(timer);
          reject(error);
        }
      }
    }).catch(reject);
  });
}

export function runProbes() {
  return Promise.all([
    timed('web', () => expectStatus('https://marl.sh/', (response) => response.status === 200)),
    timed('api', () =>
      expectStatus('https://marl.sh/health', async (response) => {
        const body = (await response.json().catch(() => null)) as { status?: string } | null;
        return response.status === 200 && body?.status === 'ok';
      })
    ),
    timed('git', () =>
      expectStatus(
        'https://git.marl.sh/lantharos/marl.git/info/refs?service=git-upload-pack',
        (response) => response.status === 200
      )
    ),
    timed('ssh', () => sshBanner('ssh.marl.sh', 22))
  ]);
}
