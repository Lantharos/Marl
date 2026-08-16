const ports = {
  web: 42617,
  api: 42618,
  git: 42619
} as const;

type ServiceName = keyof typeof ports;

const services: Record<ServiceName, { label: string; command: string[] }> = {
  web: {
    label: `web       http://127.0.0.1:${ports.web}`,
    command: ['bun', '--cwd', 'apps/web', 'run', 'dev']
  },
  api: {
    label: `api       http://127.0.0.1:${ports.api}`,
    command: ['bun', '--cwd', 'apps/api', 'run', 'dev']
  },
  git: {
    label: `git       http://127.0.0.1:${ports.git}`,
    command: ['cargo', 'run', '-p', 'sty-git']
  }
};

const requested = process.argv[2];
const selected: ServiceName[] = requested && requested !== '--plan'
  ? [requested as ServiceName]
  : ['web', 'api', 'git'];

if (selected.some((name) => !(name in services))) {
  console.error(`Unknown service "${requested}". Use web, api, or git.`);
  process.exit(1);
}

console.log('Sty development services');
for (const name of selected) console.log(`  ${services[name].label}`);

if (requested === '--plan') process.exit(0);

const children = selected.map((name) => ({
  name,
  process: Bun.spawn(services[name].command, {
    cwd: import.meta.dir.replace(/[\\/]scripts$/, ''),
    env: process.env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    detached: true,
    windowsHide: true
  })
}));

let stopping = false;

function killTree(pid: number, signal: 'SIGTERM' | 'SIGKILL') {
  if (process.platform === 'win32') {
    Bun.spawnSync(['taskkill', '/PID', String(pid), '/T', '/F'], {
      stdout: 'ignore',
      stderr: 'ignore'
    });
    return;
  }

  try {
    process.kill(-pid, signal);
  } catch {}
}

async function stop(exitCode: number) {
  if (stopping) return;
  stopping = true;

  for (const child of children) killTree(child.process.pid, 'SIGTERM');

  await Promise.race([
    Promise.all(children.map((child) => child.process.exited)),
    Bun.sleep(2_000)
  ]);

  if (process.platform !== 'win32') {
    for (const child of children) killTree(child.process.pid, 'SIGKILL');
  }

  process.exit(exitCode);
}

process.on('SIGINT', () => void stop(130));
process.on('SIGTERM', () => void stop(143));
process.on('exit', () => {
  for (const child of children) killTree(child.process.pid, 'SIGTERM');
});

for (const child of children) {
  void child.process.exited.then((exitCode) => {
    if (stopping) return;
    if (exitCode !== 0) console.error(`${child.name} exited with code ${exitCode}; stopping Sty.`);
    void stop(exitCode);
  });
}
