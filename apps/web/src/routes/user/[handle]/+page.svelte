<script lang="ts">
  import CalendarDays from 'lucide-svelte/icons/calendar-days';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Settings from 'lucide-svelte/icons/settings';
  import ContributionGraph from '$lib/components/profile/ContributionGraph.svelte';
  import ProfileActivity from '$lib/components/profile/ProfileActivity.svelte';
  import ProfileRepositoryList from '$lib/components/profile/ProfileRepositoryList.svelte';
  import PublicProfileNav from '$lib/components/profile/PublicProfileNav.svelte';
  import OrganizationAvatar from '$lib/components/OrganizationAvatar.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const profile = $derived(data.profile);
  const ownProfile = $derived(data.shellUser?.handle.toLowerCase() === profile.handle.toLowerCase());
  const websiteLabel = $derived(profile.website ? new URL(profile.website).host : '');
</script>

<svelte:head><title>{profile.displayName} (@{profile.handle}) · Marl</title><meta name="description" content={profile.bio || `${profile.displayName}'s work on Marl.`} /></svelte:head>
<PublicProfileNav visible={!data.shellUser} />
<main class="profile-page">
  <aside class="identity">
    <UserAvatar name={profile.displayName || profile.handle} src={profile.avatarUrl} size={116} />
    <h1>{profile.displayName}</h1><p class="handle">@{profile.handle}</p>
    {#if profile.bio}<p class="bio">{profile.bio}</p>{/if}
    <div class="meta">{#if profile.website}<a href={profile.website} target="_blank" rel="noreferrer"><ExternalLink size={13} />{websiteLabel}</a>{/if}<span><CalendarDays size={13} />Joined {new Date(profile.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></div>
    {#if ownProfile}<a class="edit" href="/settings/account/profile"><Settings size={13} />Edit profile</a>{/if}
    {#if data.organizations.length}<section class="organizations"><h2>Organizations</h2><div>{#each data.organizations as organization}<a href="/org/{organization.slug}" aria-label={organization.name} title={organization.name}><OrganizationAvatar name={organization.name} src={organization.avatarUrl} size={34} /></a>{/each}</div></section>{/if}
  </aside>
  <div class="work">
    <section class="intro"><div><span><strong>{data.stats.repositories}</strong> public repositories</span><span><strong>{data.stats.contributions}</strong> contributions</span><span><strong>{data.stats.pullRequests}</strong> pull requests</span></div></section>
    <ContributionGraph contributions={data.contributions} />
    <div class="columns"><section><header><h2>Public repositories</h2>{#if data.shellUser && data.stats.repositories > data.repositories.length}<a href="/repositories?q={profile.handle}">View all</a>{/if}</header><ProfileRepositoryList repositories={data.repositories.slice(0, 6)} /></section><section><header><h2>Recent work</h2></header><ProfileActivity activity={data.activity} /></section></div>
  </div>
</main>

<style>
  .profile-page{display:grid;width:min(1120px,calc(100% - 56px));grid-template-columns:240px minmax(0,1fr);gap:58px;margin:0 auto;padding:52px 0 80px}.identity{align-self:start}.identity h1{margin:17px 0 0;color:var(--text-strong);font-size:24px;font-weight:680;letter-spacing:-.035em}.handle{margin:2px 0 0;color:var(--text-faint);font-size:14px}.bio{margin:18px 0 0;color:var(--text);font-size:12px;line-height:1.6;white-space:pre-wrap}.meta{display:grid;gap:8px;margin-top:18px}.meta a,.meta span{display:flex;min-width:0;align-items:center;gap:7px;color:var(--text-muted);font-size:10px;text-decoration:none}.meta a{overflow:hidden;color:var(--text);text-overflow:ellipsis;white-space:nowrap}.meta a:hover{color:var(--brand)}.edit{display:flex;height:32px;align-items:center;justify-content:center;gap:6px;margin-top:18px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:10px;font-weight:620;text-decoration:none}.edit:hover{background:var(--surface-muted);color:var(--text-strong)}.organizations{margin-top:28px;padding-top:18px;border-top:1px solid var(--border-subtle)}.organizations h2{margin:0 0 10px;color:var(--text-muted);font-size:10px}.organizations div{display:flex;flex-wrap:wrap;gap:7px}.organizations a{display:flex;border-radius:7px}.work{min-width:0}.intro{display:flex;min-height:116px;align-items:flex-end;padding-bottom:25px}.intro>div{display:flex;flex-wrap:wrap;gap:28px}.intro span{display:grid;gap:3px;color:var(--text-faint);font-size:9px}.intro strong{color:var(--text-strong);font-size:20px;font-weight:650}.columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:42px;padding-top:31px}.columns section>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.columns h2{margin:0;color:var(--text-strong);font-size:12px}.columns header a{color:var(--text-faint);font-size:9px;text-decoration:none}.columns header a:hover{color:var(--brand)}@media(max-width:850px){.profile-page{grid-template-columns:1fr;gap:30px;padding-top:35px}.identity{display:grid;grid-template-columns:auto 1fr;column-gap:17px}.identity :global(.user-avatar){grid-row:1/5}.identity h1{margin-top:9px}.identity .handle{align-self:start}.bio,.meta,.edit,.organizations{grid-column:1/-1}.work .intro{min-height:auto}.columns{margin-top:0}}@media(max-width:650px){.profile-page{width:calc(100% - 28px)}.columns{grid-template-columns:1fr;gap:34px}.intro>div{gap:18px}}
</style>
