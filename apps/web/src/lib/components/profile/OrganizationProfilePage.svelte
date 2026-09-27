<script lang="ts">
  import type { PublicOrganizationProfile } from '@marl/contracts';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Settings from '@lucide/svelte/icons/settings';
  import LinkButton from '../controls/LinkButton.svelte';
  import OrganizationAvatar from '../identity/OrganizationAvatar.svelte';
  import UserAvatar from '../identity/UserAvatar.svelte';
  import ProfileActivity from './ProfileActivity.svelte';
  import ProfileRepositoryList from './ProfileRepositoryList.svelte';

  let { data, canManage }: { data: PublicOrganizationProfile; canManage: boolean } = $props();
  const organization = $derived(data.organization);
  const canonicalIdentity = $derived(data.organization.slug);
  const websiteLabel = $derived(organization.website ? new URL(organization.website).host : '');
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

<main class="mx-auto w-full max-w-280 px-4 pt-8 pb-20 sm:px-6 sm:pt-13">
  <header class="flex flex-wrap items-start gap-5">
    <OrganizationAvatar name={organization.name} src={organization.avatarUrl} size={92} />
    <div class="min-w-0 flex-1">
      <h1 class="text-3xl font-semibold tracking-tight text-ink-strong">{organization.name}</h1>
      <p class="mt-0.5 text-base text-ink-muted">@{organization.slug}</p>
      {#if organization.description}<p class="mt-3 max-w-[64ch] text-sm leading-relaxed text-ink">
          {organization.description}
        </p>{/if}
      <div class="mt-3 flex flex-wrap gap-4 text-sm text-ink-muted">
        {@render meta(organization.website, 'Created', organization.createdAt)}
      </div>
    </div>
    {#if canManage}<LinkButton href="/organizations/{organization.slug}/settings/profile"
        ><Settings size={15} />Organization settings</LinkButton
      >{/if}
  </header>
  <div class="mt-7 mb-8 flex flex-wrap gap-x-6 gap-y-1 border-y border-line-subtle py-4 text-sm text-ink-muted">
    {@render stat(data.stats.repositories, 'public repositories')}
    {@render stat(data.stats.members, data.stats.members === 1 ? 'member' : 'members')}
    {@render stat(data.stats.contributions, 'contributions this year')}
  </div>
  <div class="grid gap-9 lg:grid-cols-[minmax(0,1fr)_280px]">
    <div class="grid min-w-0 content-start gap-8">
      <section>
        {@render section('Repositories', `/${canonicalIdentity}/-/repositories`)}
        <ProfileRepositoryList repositories={data.repositories.slice(0, 7)} empty="No public repositories yet" />
      </section>
      <section>
        {@render section('Recent work')}
        <ProfileActivity activity={data.activity} owner={organization.slug} />
      </section>
    </div>
    <aside class="self-start">
      <header class="mb-3 flex items-center gap-2">
        <h2 class="text-base font-semibold text-ink-strong">People</h2>
        <span class="text-sm text-ink-muted tabular-nums">{data.stats.members}</span>
      </header>
      <div class="surface p-1.5">
        {#each data.members as member (member.handle)}
          <a
            href="/{member.handle}"
            class="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-hover"
          >
            <UserAvatar name={member.displayName || member.handle} src={member.avatarUrl} size={32} />
            <span class="min-w-0">
              <strong class="block truncate text-sm font-semibold text-ink-strong group-hover:text-brand"
                >{member.displayName}</strong
              >
              <span class="block truncate text-xs text-ink-muted">@{member.handle}</span>
            </span>
          </a>
        {/each}
      </div>
    </aside>
  </div>
</main>
