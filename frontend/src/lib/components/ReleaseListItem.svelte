<script lang="ts">
	import { d1Fetch } from '$lib/d1Session';
	import { apiBase, getStyToken } from '$lib/session';
	import type { Release, ReleaseArtifact } from '$lib/api';
	import { userName } from '$lib/identity';
	import Markdown from './Markdown.svelte';
	import Archive from 'lucide-svelte/icons/archive';
	import Box from 'lucide-svelte/icons/box';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Download from 'lucide-svelte/icons/download';
	import Pencil from 'lucide-svelte/icons/pencil';
	import GitCommit from 'lucide-svelte/icons/git-commit';
	import Tag from 'lucide-svelte/icons/tag';
	import Trash2 from 'lucide-svelte/icons/trash-2';

	let {
		release,
		tenant,
		project,
		canMutate = false,
		onDelete
	}: {
		release: Release;
		tenant: string;
		project: string;
		canMutate?: boolean;
		onDelete?: (release: Release) => Promise<void> | void;
	} = $props();

	let deleteArmed = $state(false);
	let deleting = $state(false);
	let notesExpanded = $state(false);
	let downloadBusyKey = $state('');
	let downloadError = $state('');

	const artifacts = $derived(artifactList(release));
	const title = $derived(release.name?.trim() || release.tag);
	const releasedAt = $derived(formatDate(release.created_at ?? release.updated_at));
	const releasePath = $derived(encodeURIComponent(release.tag));
	const notesAreLong = $derived(Boolean(release.notes && (release.notes.length > 900 || release.notes.split('\n').length > 18)));

	function artifactList(item: Release) {
		const seen: string[] = [];
		const list = [...(item.artifacts ?? []), ...(item.assets ?? [])].filter((artifact) => {
			if (!artifact.name?.trim()) return false;
			const key = artifact.id ?? artifact.url ?? artifact.download_url ?? `${artifact.name}:${artifact.digest ?? ''}`;
			if (seen.includes(key)) return false;
			seen.push(key);
			return true;
		});
		if (item.snapshot && !list.some((artifact) => artifact.source || artifact.id === 'source-zip')) {
			list.unshift({
				id: 'source-zip',
				name: `${project}-${item.tag}.zip`,
				download_url: `/v1/tenants/${encodeURIComponent(tenant)}/projects/${encodeURIComponent(project)}/source.zip?workspace=main&snapshot=${encodeURIComponent(item.snapshot)}`,
				content_type: 'application/zip',
				source: true,
				snapshot: item.snapshot
			});
		}
		return list;
	}

	function artifactHref(artifact: ReleaseArtifact) {
		const href = artifact.download_url ?? artifact.url;
		if (!href) return null;
		return href.startsWith('/') ? `${apiBase()}${href}` : href;
	}

	function artifactKey(artifact: ReleaseArtifact) {
		return artifact.id ?? artifact.download_url ?? artifact.url ?? artifact.name;
	}

	function isInternalDownload(href: string) {
		return href.startsWith(`${apiBase()}/v1/`);
	}

	function artifactMeta(artifact: ReleaseArtifact) {
		const parts = [formatSize(artifact.size), artifact.content_type, formatDigest(artifact.digest)].filter(Boolean);
		return parts.join(' · ');
	}

	function formatDigest(value: string | null | undefined) {
		if (!value) return '';
		const [algorithm, digest] = value.includes(':') ? value.split(':', 2) : ['', value];
		if (!digest || digest.length <= 16) return value;
		return algorithm ? `${algorithm}:${digest.slice(0, 12)}` : digest.slice(0, 12);
	}

	function formatSize(value: number | string | null | undefined) {
		const size = typeof value === 'number' ? value : Number(value);
		if (!Number.isFinite(size) || size <= 0) return '';
		if (size < 1024) return `${size} B`;
		const units = ['KB', 'MB', 'GB'];
		let current = size / 1024;
		for (const unit of units) {
			if (current < 1024 || unit === 'GB') return `${current.toFixed(current >= 10 ? 0 : 1)} ${unit}`;
			current /= 1024;
		}
		return '';
	}

	function formatDate(value: string | null | undefined) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.valueOf())) return '';
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	async function downloadArtifact(artifact: ReleaseArtifact, href: string) {
		const key = artifactKey(artifact);
		if (downloadBusyKey) return;
		downloadBusyKey = key;
		downloadError = '';
		try {
			const headers = new Headers();
			const token = await getStyToken();
			if (token) headers.set('authorization', `Bearer ${token}`);
			const response = await d1Fetch(href, { headers });
			if (!response.ok) {
				throw new Error(await response.text());
			}
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = safeName(artifact.name || `${project}-${release.tag}.zip`);
			document.body.append(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 0);
		} catch (e) {
			downloadError = e instanceof Error ? e.message : 'Failed to download file';
		} finally {
			downloadBusyKey = '';
		}
	}

	function safeName(value: string) {
		return value.replace(/[/\\"'\0-\u001f]+/g, '_').trim() || 'download';
	}

	async function deleteRelease() {
		if (!onDelete || deleting) return;
		if (!deleteArmed) {
			deleteArmed = true;
			return;
		}
		deleting = true;
		try {
			await onDelete(release);
		} finally {
			deleting = false;
			deleteArmed = false;
		}
	}
</script>

<article class="border border-[#2a2a28] bg-[#141412]">
	<div class="grid gap-3 border-b border-[#252522] px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
		<div class="flex min-w-0 gap-3">
			<div class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center bg-[#1e1e1c] text-[#d9a66c]">
				<Tag class="h-4 w-4" />
			</div>
			<div class="min-w-0">
				<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<h3 class="min-w-0 text-base font-semibold text-[#f0eee4]">{title}</h3>
					<span class="font-mono text-xs text-[#8c887e]">{release.tag}</span>
					{#if release.latest}
						<span class="text-xs text-[#7cb97c]">Latest</span>
					{/if}
					{#if release.prerelease}
						<span class="text-xs text-[#d9a66c]">Pre-release</span>
					{/if}
					{#if release.draft}
						<span class="text-xs text-[#8c887e]">Draft</span>
					{/if}
				</div>
				<div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#6f6b5f]">
					{#if release.author && userName(release.author) !== 'Unknown user'}
						<span>{userName(release.author)}</span>
					{/if}
					{#if releasedAt}
						<span>{releasedAt}</span>
					{/if}
					{#if release.snapshot}
						<span class="inline-flex min-w-0 items-center gap-1 font-mono">
							<GitCommit class="h-3 w-3 shrink-0" />
							<span class="truncate">{release.snapshot.slice(0, 12)}</span>
						</span>
					{/if}
				</div>
			</div>
		</div>
		{#if canMutate}
			<div class="flex items-center gap-2">
				<a class="grid h-8 w-8 place-items-center border border-[#2a2a28] bg-[#1e1e1c] text-[#a09d94] hover:text-[#eae9e4]" href={`/${tenant}/${project}/releases/${releasePath}/edit`} aria-label="Edit release">
					<Pencil class="h-3.5 w-3.5" />
				</a>
				<button
					class="inline-flex h-8 items-center gap-2 border border-[#2a2a28] bg-[#1e1e1c] px-2 text-xs {deleteArmed ? 'border-[#5d2a24] text-[#d96c5a]' : 'text-[#a09d94] hover:text-[#d96c5a]'}"
					type="button"
					disabled={deleting}
					onclick={deleteRelease}
				>
					<Trash2 class="h-3.5 w-3.5" />
					{#if deleteArmed}
						<span>{deleting ? 'Deleting...' : 'Confirm'}</span>
					{/if}
				</button>
			</div>
		{/if}
	</div>

	<div class="grid gap-4 p-4">
		<div class="grid gap-2">
			<div class="text-sm font-medium text-[#eae9e4]">Downloads</div>
			{#each artifacts as artifact (artifact.id ?? artifact.url ?? artifact.download_url ?? artifact.name)}
				{@const href = artifactHref(artifact)}
				{@const meta = artifactMeta(artifact)}
				{#if href}
					{#if isInternalDownload(href)}
						<button class="flex min-h-10 items-center gap-2 border border-[#252522] bg-[#0f0f0d] px-3 text-left hover:bg-[#171714] disabled:opacity-60" type="button" disabled={Boolean(downloadBusyKey)} onclick={() => downloadArtifact(artifact, href)}>
							{#if artifact.source}
								<Archive class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
							{:else}
								<Box class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
							{/if}
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm text-[#eae9e4]">{artifact.name}</span>
								{#if meta}
									<span class="block truncate font-mono text-[11px] text-[#6f6b5f]">{downloadBusyKey === artifactKey(artifact) ? 'Downloading...' : meta}</span>
								{/if}
							</span>
							<Download class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
						</button>
					{:else}
						<a class="flex min-h-10 items-center gap-2 border border-[#252522] bg-[#0f0f0d] px-3 hover:bg-[#171714]" href={href}>
							{#if artifact.source}
								<Archive class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
							{:else}
								<Box class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
							{/if}
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm text-[#eae9e4]">{artifact.name}</span>
								{#if meta}
									<span class="block truncate font-mono text-[11px] text-[#6f6b5f]">{meta}</span>
								{/if}
							</span>
							<Download class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
						</a>
					{/if}
				{:else}
					<div class="flex min-h-10 items-center gap-2 border border-[#252522] bg-[#0f0f0d] px-3">
						{#if artifact.source}
							<Archive class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
						{:else}
							<Box class="h-3.5 w-3.5 shrink-0 text-[#8c887e]" />
						{/if}
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm text-[#eae9e4]">{artifact.name}</span>
							{#if meta}
								<span class="block truncate font-mono text-[11px] text-[#6f6b5f]">{meta}</span>
							{/if}
						</span>
					</div>
				{/if}
			{/each}
			{#if !artifacts.length}
				<p class="text-xs text-[#6f6b5f]">No downloads attached.</p>
			{/if}
			{#if downloadError}
				<p class="text-xs text-[#d96c5a]">{downloadError}</p>
			{/if}
		</div>

		<div class="grid gap-2">
			<div class="text-sm font-medium text-[#eae9e4]">Changes</div>
			{#if release.notes}
				<div class="min-w-0 border border-[#252522] bg-[#0f0f0d]">
					<div class="relative p-3 {notesAreLong && !notesExpanded ? 'max-h-64 overflow-hidden' : ''}">
						<Markdown source={release.notes} />
						{#if notesAreLong && !notesExpanded}
							<div class="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-[#0f0f0d]"></div>
						{/if}
					</div>
					{#if notesAreLong}
						<button
							class="flex min-h-10 w-full items-center justify-center gap-2 border-t border-[#252522] text-sm text-[#a09d94] hover:bg-[#171714] hover:text-[#eae9e4]"
							type="button"
							aria-expanded={notesExpanded}
							onclick={() => (notesExpanded = !notesExpanded)}
						>
							<span>{notesExpanded ? 'Show less' : 'Show full changelog'}</span>
							<ChevronDown class="h-4 w-4 transition-transform {notesExpanded ? 'rotate-180' : ''}" />
						</button>
					{/if}
				</div>
			{:else}
				<p class="text-sm text-[#6f6b5f]">No release notes.</p>
			{/if}
		</div>
	</div>
</article>
