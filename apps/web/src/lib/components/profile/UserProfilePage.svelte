<script lang="ts">
  import Bot from '@lucide/svelte/icons/bot';
  import Flag from '@lucide/svelte/icons/flag';
  import Button from '$lib/components/controls/Button.svelte';
  import { reporting } from '$lib/moderation/reporting.svelte';
  import type { PublicUserProfile } from '@marl/contracts';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Settings from '@lucide/svelte/icons/settings';
  import LinkButton from '../controls/LinkButton.svelte';
  import OrganizationAvatar from '../identity/OrganizationAvatar.svelte';
  import UserAvatar from '../identity/UserAvatar.svelte';
  import ProfileActivity from './ProfileActivity.svelte';
  import ProfileRepositoryList from './ProfileRepositoryList.svelte';
  import ContributionGraph from './ContributionGraph.svelte';

  let { data, own, signedIn }: { data: PublicUserProfile; own: boolean; signedIn: boolean } = $props();
  const userProfile = $derived(data.profile);
  const canonicalIdentity = $derived(data.profile.handle);
  const websiteLabel = $derived(userProfile.website ? new URL(userProfile.website).host : '');
</script>

{#snippet section(title: string, href?: string)}
  <header class="mb-3 flex items-center justify-between gap-4">
    <h2 class="text-base font-semibold text-ink-strong">{title}</h2>
    {#if href}<a class="text-sm text-ink-muted hover:text-brand" {href}>All repositories</a>{/if}
  </header>
{/snippet}

{#snippet meta(website: string | null, label: string, date: string)}
  {#if website}<a
      class="flex min-w-0 items-center gap-2 truncate text-ink hover:text-brand"
      href={website}
      target="_blank"
      rel="noreferrer"><ExternalLink size={14} class="shrink-0" />{websiteLabel}</a
    >{/if}
  <span class="flex items-center gap-2"
    ><CalendarDays size={14} class="shrink-0" />{label}
    {new Date(date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span
  >
{/snippet}

{#snippet stat(value: number, label: string)}
  <span><strong class="font-semibold text-ink-strong tabular-nums">{value}</strong> {label}</span>
{/snippet}

<main class="mx-auto grid w-full max-w-280 gap-9 px-4 pt-8 pb-20 sm:px-6 sm:pt-13 lg:grid-cols-[240px_minmax(0,1fr)]">
  <aside class="self-start">
    <UserAvatar name={userProfile.displayName || userProfile.handle} src={userProfile.avatarUrl} size={116} />
    <h1 class="mt-4 text-2xl font-semibold tracking-tight text-ink-strong">{userProfile.displayName}</h1>
    <p class="mt-0.5 text-base text-ink-muted">@{userProfile.handle}</p>
    {#if userProfile.kind === 'agent'}<p class="mt-3 flex items-center gap-2 text-sm text-ink">
        <Bot size={15} class="shrink-0 text-ink-muted" /><span
          >Agent operated by {#if userProfile.operator}<a
              class="font-semibold hover:text-brand"
              href="/{userProfile.operator.slug}">{userProfile.operator.name}</a
            >{/if}</span
        >
      </p>{/if}
    {#if userProfile.bio}<p class="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">{userProfile.bio}</p>{/if}
    <div class="mt-4 grid gap-2 text-sm text-ink-muted">
      {@render meta(userProfile.website, 'Joined', userProfile.joinedAt)}
    </div>
    {#if own}<LinkButton class="mt-5 w-full" href="/settings/account/profile"
        ><Settings size={15} />Edit profile</LinkButton
      >{:else if signedIn}<Button
        class="mt-4 -ml-2"
        size="small"
        variant="ghost"
        onclick={() => reporting.open({ type: 'user', id: userProfile.handle, label: `@${userProfile.handle}` })}
        ><Flag size={14} />Report account</Button
      >{/if}
    {#if data.organizations.length}
      <section class="mt-7">
        <h2 class="mb-2.5 text-sm font-semibold text-ink-strong">Organizations</h2>
        <div class="flex flex-wrap gap-2">
          {#each data.organizations as item (item.slug)}<a
              href="/{item.slug}"
              aria-label={item.name}
              title={item.name}
              class="rounded-lg transition-opacity hover:opacity-80"
              ><OrganizationAvatar name={item.name} src={item.avatarUrl} size={34} /></a
            >{/each}
        </div>
      </section>
    {/if}
  </aside>
  <div class="grid min-w-0 content-start gap-7">
    <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
      {@render stat(data.stats.repositories, 'public repositories')}
      {@render stat(data.stats.contributions, 'contributions')}
      {@render stat(data.stats.pullRequests, 'pulls')}
    </div>
    <ContributionGraph contributions={data.contributions} />
    <div class="grid gap-8 xl:grid-cols-2">
      <section>
        {@render section('Public repositories', `/${canonicalIdentity}/-/repositories`)}
        <ProfileRepositoryList repositories={data.repositories.slice(0, 7)} />
      </section>
      <section>
        {@render section('Recent work')}
        <ProfileActivity activity={data.activity} />
      </section>
    </div>
  </div>
</main>
