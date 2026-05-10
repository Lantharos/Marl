<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		searchUsers,
		type Collaborator,
		type CollaboratorRole,
		type UserProfile
	} from '$lib/api';
	import X from 'lucide-svelte/icons/x';

	let {
		title,
		description,
		collaborators,
		canManage,
		busy,
		onAdd,
		onUpdate,
		onRemove
	}: {
		title: string;
		description: string;
		collaborators: Collaborator[];
		canManage: boolean;
		busy: boolean;
		onAdd: (user: string, role: CollaboratorRole) => Promise<void>;
		onUpdate: (user: string, role: CollaboratorRole) => Promise<void>;
		onRemove: (user: string) => Promise<void>;
	} = $props();

	const roles: CollaboratorRole[] = ['viewer', 'contributor', 'maintainer'];
	let query = $state('');
	let selectedUser = $state('');
	let selectedRole = $state<CollaboratorRole>('contributor');
	let suggestions = $state<UserProfile[]>([]);
	let searching = $state(false);
	let searchController: AbortController | null = null;
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		if (searchTimer) clearTimeout(searchTimer);
		searchController?.abort();
	});

	async function runSearch() {
		searchController?.abort();
		const value = query.trim();
		selectedUser = '';
		if (!value) {
			suggestions = [];
			return;
		}
		const controller = new AbortController();
		searchController = controller;
		searching = true;
		try {
			const result = await searchUsers(value, { perPage: 8, signal: controller.signal });
			suggestions = result.items;
		} catch {
			if (!controller.signal.aborted) suggestions = [];
		} finally {
			if (searchController === controller) {
				searchController = null;
				searching = false;
			}
		}
	}

	function scheduleSearch() {
		selectedUser = '';
		if (searchTimer) clearTimeout(searchTimer);
		if (!query.trim()) {
			searchController?.abort();
			searching = false;
			suggestions = [];
			return;
		}
		searchTimer = setTimeout(() => {
			searchTimer = null;
			void runSearch();
		}, 180);
	}

	function chooseUser(profile: UserProfile) {
		selectedUser = profile.handle || profile.user;
		query = selectedUser;
		suggestions = [];
	}

	async function add() {
		const user = selectedUser || query.trim();
		if (!user) return;
		await onAdd(user, selectedRole);
		query = '';
		selectedUser = '';
		suggestions = [];
	}

	function displayName(item: Collaborator) {
		return item.profile?.display_name || item.profile?.handle || item.user;
	}

	function detail(item: Collaborator) {
		const handle = item.profile?.handle ? `@${item.profile.handle}` : item.user;
		return item.source === 'owner' ? `${handle} owner` : item.source === 'tenant' ? `${handle} via tenant` : handle;
	}

	function initials(item: Collaborator) {
		const value = displayName(item).trim();
		const parts = value.split(/\s+/).filter(Boolean);
		if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
		return value.slice(0, 2).toUpperCase();
	}
</script>

<section class="border border-[#2a2a28] bg-[#141412] p-4">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<div class="text-sm font-medium text-[#eae9e4]">{title}</div>
			<p class="mt-1 text-xs text-[#6f6b5f]">{description}</p>
		</div>
	</div>

	{#if canManage}
		<div class="mt-4 grid gap-2">
			<div class="relative">
				<input
					class="h-9 w-full border border-[#2a2a28] bg-[#0f0f0d] px-3 text-sm text-[#eae9e4] outline-none placeholder:text-[#6f6b5f] focus:border-[#d9a66c]"
					placeholder="Handle or user"
					bind:value={query}
					oninput={scheduleSearch}
				/>
				{#if suggestions.length}
					<div class="absolute left-0 right-0 top-full z-20 mt-1 border border-[#2a2a28] bg-[#10100e] py-1 shadow-lg">
						{#each suggestions as profile (profile.user)}
							<button
								class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#1e1e1c]"
								onclick={() => chooseUser(profile)}
							>
								<div class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[9px] text-[#eae9e4]">
									{#if profile.avatar_url}
										<img src={profile.avatar_url} alt="" class="h-full w-full object-cover" />
									{:else}
										{(profile.display_name || profile.handle || profile.user).slice(0, 2).toUpperCase()}
									{/if}
								</div>
								<div class="min-w-0">
									<div class="truncate text-xs text-[#eae9e4]">{profile.display_name}</div>
									<div class="truncate text-[11px] text-[#6f6b5f]">{profile.handle ? `@${profile.handle}` : profile.user}</div>
								</div>
							</button>
						{/each}
					</div>
				{:else if searching}
					<div class="absolute right-3 top-2.5 h-3 w-3 animate-spin rounded-full border border-[#6f6b5f] border-t-transparent"></div>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<div class="flex overflow-hidden border border-[#2a2a28]">
					{#each roles as role (role)}
						<button
							class="px-2.5 py-1 text-xs {selectedRole === role ? 'bg-[#eae9e4] text-[#0f0f0d]' : 'bg-[#0f0f0d] text-[#8c887e] hover:text-[#eae9e4]'}"
							onclick={() => (selectedRole = role)}
						>
							{role}
						</button>
					{/each}
				</div>
				<button
					class="bg-[#eae9e4] px-3 py-1.5 text-xs font-medium text-[#0f0f0d] disabled:opacity-50"
					disabled={busy || !query.trim()}
					onclick={add}
				>
					Add
				</button>
			</div>
		</div>
	{/if}

	<div class="mt-4 divide-y divide-[#252522]">
		{#each collaborators as item (item.user)}
			<div class="flex items-center gap-3 py-3">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2a2a28] text-[10px] font-medium text-[#eae9e4]">
					{#if item.profile?.avatar_url}
						<img src={item.profile.avatar_url} alt="" class="h-full w-full object-cover" />
					{:else}
						{initials(item)}
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm text-[#eae9e4]">{displayName(item)}</div>
					<div class="truncate text-xs text-[#6f6b5f]">{detail(item)}</div>
				</div>
				{#if canManage && item.removable}
					<div class="hidden overflow-hidden border border-[#2a2a28] sm:flex">
						{#each roles as role (role)}
							<button
								class="px-2 py-1 text-[11px] {item.role === role ? 'bg-[#eae9e4] text-[#0f0f0d]' : 'bg-[#0f0f0d] text-[#8c887e] hover:text-[#eae9e4]'}"
								disabled={busy || item.role === role}
								onclick={() => onUpdate(item.user, role)}
							>
								{role}
							</button>
						{/each}
					</div>
					<button
						class="flex h-7 w-7 items-center justify-center text-[#6f6b5f] hover:bg-[#1e1e1c] hover:text-[#d96c5a]"
						disabled={busy}
						aria-label="Remove collaborator"
						onclick={() => onRemove(item.user)}
					>
						<X class="h-3.5 w-3.5" />
					</button>
				{:else}
					<div class="text-xs text-[#8c887e]">{item.role}</div>
				{/if}
			</div>
		{:else}
			<div class="py-6 text-center text-sm text-[#8c887e]">No collaborators yet.</div>
		{/each}
	</div>
</section>
