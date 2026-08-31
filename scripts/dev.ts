const ports = {
  web: 42617,
  api: 42618,
  git: 42619
} as const;
const gatewayToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');

type ServiceName = keyof typeof ports;
type ManagedProcess = ReturnType<typeof Bun.spawn>;

const services: Record<ServiceName, { label: string; command: string[] }> = {
  web: {
    label: `web       http://127.0.0.1:${ports.web}`,
    command: ['bun', 'run', '--cwd', 'apps/web', 'dev']
  },
  api: {
    label: `api       http://127.0.0.1:${ports.api}`,
    command: [
      'bun', 'run', '--cwd', 'apps/api', 'dev', '--',
      '--var', 'ENVIRONMENT:development',
      '--var', `GIT_GATEWAY_URL:http://127.0.0.1:${ports.git}`,
      '--var', `GIT_PUBLIC_URL:http://127.0.0.1:${ports.git}`,
      '--var', 'GIT_SSH_PUBLIC_URL:ssh://git@127.0.0.1:42621',
      '--var', `PUBLIC_URL:http://127.0.0.1:${ports.web}`,
      '--var', `GIT_GATEWAY_TOKEN:${gatewayToken}`
    ]
  },
  git: {
    label: `git       http://127.0.0.1:${ports.git}  ssh://git@127.0.0.1:42621`,
    command: ['cargo', 'run', '-p', 'git']
  }
};

const requested = process.argv[2];
const selected: ServiceName[] = requested && requested !== 'plan'
  ? requested === 'api' ? ['git', 'api'] : [requested as ServiceName]
  : ['git', 'api', 'web'];

if (selected.some((name) => !(name in services))) {
  console.error(`Unknown service "${requested}". Use web, api, or git.`);
  process.exit(1);
}

console.log('Marl development services');
for (const name of selected) console.log(`  ${services[name].label}`);

if (requested === 'plan') process.exit(0);

const workspace = import.meta.dir.replace(/[\\/]scripts$/, '');
const repositoryRoot = `${workspace}/.marl-data/repositories`;
const children = new Map<number, { name: string; process: ManagedProcess }>();
let stopping = false;

function spawn(name: string, command: string[], env = process.env, cwd = workspace) {
  const child = Bun.spawn(command, {
    cwd,
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    detached: true,
    windowsHide: process.platform === 'win32'
  });
  children.set(child.pid, { name, process: child });
  return child;
}

function killTree(pid: number, signal: 'SIGTERM' | 'SIGKILL') {
  if (process.platform === 'win32') {
    Bun.spawnSync(['taskkill', '/PID', String(pid), '/T', '/F'], {
      stdout: 'ignore',
      stderr: 'ignore',
      windowsHide: true
    });
    return;
  }

  try {
    process.kill(-pid, signal);
  } catch {}
}

function killChildren(signal: 'SIGTERM' | 'SIGKILL') {
  for (const child of children.values()) killTree(child.process.pid, signal);
  if (process.platform === 'win32') cleanupWindowsProcesses();
}

function cleanupWindowsProcesses() {
  const selectedPorts = [
    ...selected.map((name) => ports[name]),
    ...(selected.includes('api') ? [42620] : []),
    ...(selected.includes('git') ? [42621] : [])
  ];
  const script = [
    '$workspacePattern = [regex]::Escape($args[0])',
    '$marlPorts = @($args[1].Split(",") | ForEach-Object { [int]$_ })',
    '$supervisorPid = [int]$args[2]',
    '$listenerPids = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $marlPorts -contains $_.LocalPort } | Select-Object -ExpandProperty OwningProcess -Unique)',
    '$serviceNames = "^(bun|vite|wrangler|node|workerd|cargo|git-gateway|esbuild)\\.exe$"',
    '$processes = @(Get-CimInstance Win32_Process)',
    '$targets = @($processes | Where-Object { $_.ProcessId -ne $supervisorPid -and ($listenerPids -contains $_.ProcessId -or ($_.CommandLine -and $_.CommandLine -match $workspacePattern -and $_.Name -match $serviceNames)) })',
    '$targetIds = @($targets | Select-Object -ExpandProperty ProcessId -Unique)',
    '$roots = @($targets | Where-Object { $targetIds -notcontains $_.ParentProcessId } | Select-Object -ExpandProperty ProcessId -Unique)',
    'foreach ($processId in $roots) { taskkill.exe /PID $processId /T /F *> $null }'
  ].join('; ');
  Bun.spawnSync(['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script, workspace, selectedPorts.join(','), String(process.pid)], {
    stdout: 'ignore',
    stderr: 'ignore',
    windowsHide: true
  });
}

function forceStop(exitCode: number) {
  killChildren('SIGKILL');
  process.exit(exitCode);
}

async function stop(exitCode: number) {
  if (stopping) return forceStop(exitCode);
  stopping = true;
  console.log('\nStopping Marl development services...');
  killChildren('SIGTERM');

  const forceTimer = setTimeout(() => forceStop(exitCode), 2_000);
  forceTimer.unref();
  await Promise.allSettled([...children.values()].map((child) => child.process.exited));
  clearTimeout(forceTimer);
  process.exit(exitCode);
}

process.on('SIGINT', () => void stop(130));
process.on('SIGTERM', () => void stop(143));
if (process.platform === 'win32') process.on('SIGBREAK', () => void stop(131));
process.on('exit', () => killChildren('SIGKILL'));

if (selected.includes('api')) {
  console.log('  data      preparing local D1');
  const commands = [
    ['bunx', 'wrangler', 'd1', 'migrations', 'apply', 'marl', '--local']
  ];
  for (const command of commands) {
    const preparation = spawn('data', command, { ...process.env, CI: 'true' }, `${workspace}/apps/api`);
    const exitCode = await preparation.exited;
    children.delete(preparation.pid);
    if (exitCode !== 0) await stop(exitCode);
  }
}

function startService(name: ServiceName) {
  const env = name === 'git'
    ? { ...process.env, MARL_GIT_GATEWAY_TOKEN: gatewayToken, MARL_GIT_ROOT: repositoryRoot }
    : process.env;
  const child = spawn(name, services[name].command, env);
  void child.exited.then((exitCode) => {
    if (stopping) return;
    if (exitCode !== 0) console.error(`${name} exited with code ${exitCode}; stopping Marl.`);
    void stop(exitCode);
  });
}

async function waitForGitGateway() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${ports.git}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await Bun.sleep(75);
  }
  throw new Error('Git gateway did not become ready within 30 seconds.');
}

if (selected.includes('git')) {
  startService('git');
  if (selected.includes('api')) await waitForGitGateway();
}
for (const name of selected) {
  if (name !== 'git') startService(name);
}
