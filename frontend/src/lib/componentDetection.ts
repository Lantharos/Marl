import { getProjectFile, getProjectTree, type ProjectComponent, type ProjectCiSettings } from '$lib/api';

type SourceFile = { path: string; text: string };
type PackageInfo = { path: string; name: string; scripts: Record<string, string>; deps: string[]; manager: 'bun' | 'pnpm' | 'npm' };
type CrateInfo = { path: string; name: string; deps: string[] };

export type ProjectDetection = {
	components: ProjectComponent[];
	ciCommands: ProjectCiSettings['commands'];
};

export async function detectProjectSetup(tenant: string, project: string, signal?: AbortSignal): Promise<ProjectDetection> {
	const tree = await getProjectTree(tenant, project, 'main', undefined, { depth: 5, limit: 1200, signal });
	const paths = tree.entries.map((entry) => entry.path).filter(Boolean);
	const interesting = paths.filter((path) =>
		path === 'package.json'
		|| path.endsWith('/package.json')
		|| path === 'pnpm-workspace.yaml'
		|| path === 'bun.lockb'
		|| path === 'bun.lock'
		|| path === 'pnpm-lock.yaml'
		|| path === 'turbo.json'
		|| path === 'wrangler.toml'
		|| path.endsWith('/wrangler.toml')
		|| path === 'Cargo.toml'
		|| path.endsWith('/Cargo.toml')
	);
	const files = await Promise.all(interesting.map((path) => readSourceFile(tenant, project, path, signal)));
	const sourceFiles = files.filter((file): file is SourceFile => Boolean(file?.text));
	const packages = sourceFiles.filter((file) => file.path.endsWith('package.json')).map(packageInfo).filter((info): info is PackageInfo => Boolean(info));
	const crates = sourceFiles.filter((file) => file.path.endsWith('Cargo.toml')).map(crateInfo).filter((info): info is CrateInfo => Boolean(info));
	const packageNames = new Map(packages.map((item) => [item.name, componentId(item.name)]));
	const crateNames = new Map(crates.map((item) => [item.name, componentId(item.name)]));
	const components = [
		...packages.map((pkg, order) => packageComponent(pkg, packageNames, order)),
		...crates.map((crate, index) => crateComponent(crate, crateNames, packages.length + index))
	].filter((component, index, list) => list.findIndex((item) => item.id === component.id) === index);
	return { components, ciCommands: suggestedCiCommands(components, sourceFiles) };
}

async function readSourceFile(tenant: string, project: string, path: string, signal?: AbortSignal): Promise<SourceFile | null> {
	try {
		const file = await getProjectFile(tenant, project, path, 'main', undefined, { signal });
		return file.text ? { path, text: file.text } : null;
	} catch {
		return null;
	}
}

function packageInfo(file: SourceFile): PackageInfo | null {
	try {
		const json = JSON.parse(file.text) as { name?: unknown; scripts?: unknown; dependencies?: unknown; devDependencies?: unknown; peerDependencies?: unknown };
		const name = typeof json.name === 'string' && json.name.trim() ? json.name.trim() : basename(dirname(file.path));
		return {
			path: dirname(file.path),
			name,
			scripts: recordOfStrings(json.scripts),
			deps: Object.keys({ ...recordOfStrings(json.dependencies), ...recordOfStrings(json.devDependencies), ...recordOfStrings(json.peerDependencies) }),
			manager: 'bun'
		};
	} catch {
		return null;
	}
}

function crateInfo(file: SourceFile): CrateInfo | null {
	const packageBlock = tomlBlock(file.text, 'package');
	const name = tomlValue(packageBlock, 'name') || basename(dirname(file.path));
	if (!name) return null;
	return {
		path: dirname(file.path),
		name,
		deps: Object.keys(tomlDeps(file.text))
	};
}

function packageComponent(pkg: PackageInfo, packageNames: Map<string, string>, order: number): ProjectComponent {
	const depends_on = pkg.deps.map((dep) => packageNames.get(dep)).filter((value): value is string => Boolean(value));
	const framework = packageFramework(pkg);
	return {
		id: componentId(pkg.name),
		name: displayName(pkg.name),
		paths: [pkg.path || '.'],
		depends_on,
		owners: [],
		language: 'typescript',
		framework,
		build_command: pkg.scripts.build ? `${pkg.manager} run build` : null,
		test_command: pkg.scripts.test ? `${pkg.manager} test` : pkg.scripts.check ? `${pkg.manager} run check` : null,
		deploy_targets: framework === 'cloudflare' ? ['production'] : [],
		issue_labels: [],
		release_policy: 'independent',
		version_policy: 'independent',
		visible: true,
		require_owner_approval: false,
		order
	};
}

function crateComponent(crate: CrateInfo, crateNames: Map<string, string>, order: number): ProjectComponent {
	const depends_on = crate.deps.map((dep) => crateNames.get(dep)).filter((value): value is string => Boolean(value));
	return {
		id: componentId(crate.name),
		name: displayName(crate.name),
		paths: [crate.path || '.'],
		depends_on,
		owners: [],
		language: 'rust',
		framework: null,
		build_command: `cargo build -p ${crate.name}`,
		test_command: `cargo test -p ${crate.name}`,
		deploy_targets: [],
		issue_labels: [],
		release_policy: 'independent',
		version_policy: 'independent',
		visible: true,
		require_owner_approval: false,
		order
	};
}

function suggestedCiCommands(components: ProjectComponent[], files: SourceFile[]): ProjectCiSettings['commands'] {
	const hasWrangler = files.some((file) => file.path.endsWith('wrangler.toml'));
	const commands = components.flatMap((component) => {
		const output: ProjectCiSettings['commands'] = [];
		if (component.test_command) {
			output.push({
				name: `${component.id} / test`,
				run: component.test_command,
				timeout_seconds: 900,
				events: ['workspace.push', 'workspace.ready'],
				components: [component.id],
				paths: component.paths.map((path) => path === '.' ? '**' : `${path}/**`),
				labels: component.language === 'rust' ? ['rust'] : ['linux'],
				env: [],
				secrets: [],
				artifacts: [],
				cache: component.language === 'rust' ? [{ key: 'cargo-target', path: 'target' }] : [{ key: 'bun-cache', path: '.bun/install/cache' }]
			});
		}
		if (component.build_command) {
			output.push({
				name: `${component.id} / build`,
				run: component.build_command,
				timeout_seconds: 1200,
				events: ['workspace.ready'],
				components: [component.id],
				paths: component.paths.map((path) => path === '.' ? '**' : `${path}/**`),
				labels: component.language === 'rust' ? ['rust'] : ['linux'],
				env: [],
				secrets: [],
				artifacts: component.framework === 'svelte' ? [`${component.paths[0]}/build`, `${component.paths[0]}/dist`] : [],
				cache: component.language === 'rust' ? [{ key: 'cargo-target', path: 'target' }] : [{ key: 'bun-cache', path: '.bun/install/cache' }]
			});
		}
		if (hasWrangler && component.deploy_targets?.length) {
			output.push({
				name: `${component.id} / deploy`,
				run: component.framework === 'cloudflare' ? 'bunx wrangler deploy --env production' : 'bun run build\nbunx wrangler pages deploy dist --project-name my-project --branch production',
				timeout_seconds: 1200,
				events: ['release.created'],
				components: [component.id],
				labels: ['linux'],
				env: [],
				secrets: ['CLOUDFLARE_API_TOKEN'],
				artifacts: [],
				cache: [{ key: 'bun-cache', path: '.bun/install/cache' }]
			});
		}
		return output;
	});
	return commands.filter((command, index, list) => list.findIndex((item) => item.name === command.name) === index);
}

function packageFramework(pkg: PackageInfo) {
	const deps = new Set(pkg.deps);
	if (deps.has('@sveltejs/kit') || deps.has('svelte')) return 'svelte';
	if (deps.has('next')) return 'next';
	if (deps.has('@cloudflare/workers-types') || deps.has('wrangler')) return 'cloudflare';
	if (deps.has('vite')) return 'vite';
	return null;
}

function recordOfStrings(value: unknown): Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function tomlBlock(source: string, name: string) {
	const match = source.match(new RegExp(`\\[${name.replace('.', '\\.')}\\]([\\s\\S]*?)(?:\\n\\[|$)`));
	return match?.[1] ?? '';
}

function tomlValue(source: string, key: string) {
	const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm'));
	return match?.[1]?.trim() ?? '';
}

function tomlDeps(source: string) {
	return {
		...tomlInlineDeps(tomlBlock(source, 'dependencies')),
		...tomlInlineDeps(tomlBlock(source, 'dev-dependencies')),
		...tomlInlineDeps(tomlBlock(source, 'build-dependencies'))
	};
}

function tomlInlineDeps(source: string) {
	const deps: Record<string, string> = {};
	for (const line of source.split('\n')) {
		const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
		if (match?.[1]) deps[match[1]] = match[1];
	}
	return deps;
}

function componentId(value: string) {
	return value.replace(/^@/, '').replace(/[\/_]+/g, '-').replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function displayName(value: string) {
	return value.replace(/^@/, '').replace(/[\/_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dirname(path: string) {
	const index = path.lastIndexOf('/');
	return index <= 0 ? '' : path.slice(0, index);
}

function basename(path: string) {
	return path.split('/').filter(Boolean).pop() ?? 'project';
}

export function mergeComponents(current: ProjectComponent[], detected: ProjectComponent[]) {
	const existing = new Map(current.map((component) => [component.id, component]));
	const merged = [...current];
	for (const component of detected) {
		if (existing.has(component.id)) continue;
		merged.push({ ...component, order: merged.length });
	}
	return merged.map((component, order) => ({ ...component, order }));
}

export function mergeCiCommands(current: ProjectCiSettings, detected: ProjectCiSettings['commands']): ProjectCiSettings {
	const names = new Set(current.commands.map((command) => command.name));
	return {
		...current,
		enabled: current.enabled || detected.length > 0,
		commands: [...current.commands, ...detected.filter((command) => !names.has(command.name))]
	};
}
