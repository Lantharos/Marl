<script lang="ts">
  import CalendarDays from 'lucide-svelte/icons/calendar-days';
  import ExternalLink from 'lucide-svelte/icons/external-link';
  import Settings from 'lucide-svelte/icons/settings';
  import OrganizationAvatar from '$lib/components/OrganizationAvatar.svelte';
  import UserAvatar from '$lib/components/UserAvatar.svelte';
  import ProfileActivity from '$lib/components/profile/ProfileActivity.svelte';
  import ProfileRepositoryList from '$lib/components/profile/ProfileRepositoryList.svelte';
  import PublicProfileNav from '$lib/components/profile/PublicProfileNav.svelte';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const organization = $derived(data.organization);
  const viewerOrganization = $derived(data.shellOrganizations?.find((item: { slug: string; role: string }) => item.slug.toLowerCase() === organization.slug.toLowerCase()));
  const canManage = $derived(viewerOrganization && viewerOrganization.role !== 'member');
  const websiteLabel = $derived(organization.website ? new URL(organization.website).host : '');
</script>

<svelte:head><title>{organization.name} · Marl</title><meta name="description" content={organization.description || `${organization.name}'s public work on Marl.`} /></svelte:head>
<PublicProfileNav visible={!data.shellUser} />
<main class="organization-page">
  <header class="hero"><OrganizationAvatar name={organization.name} src={organization.avatarUrl} size={92} /><div><p class="slug">{organization.slug}</p><h1>{organization.name}</h1>{#if organization.description}<p class="description">{organization.description}</p>{/if}<div class="meta">{#if organization.website}<a href={organization.website} target="_blank" rel="noreferrer"><ExternalLink size={13} />{websiteLabel}</a>{/if}<span><CalendarDays size={13} />Created {new Date(organization.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></div></div>{#if canManage}<a class="manage" href="/organizations/{organization.slug}/settings/profile"><Settings size={13} />Organization settings</a>{/if}</header>
  <section class="signals"><span><strong>{data.stats.repositories}</strong> public repositories</span><span><strong>{data.stats.members}</strong> {data.stats.members === 1 ? 'member' : 'members'}</span><span><strong>{data.stats.contributions}</strong> contributions this year</span></section>
  <div class="content"><div class="main-column"><section><header><h2>Repositories</h2><p>Projects maintained in {organization.name}.</p></header><ProfileRepositoryList repositories={data.repositories} empty="No public repositories yet." /></section><section class="recent"><header><h2>Recent work</h2><p>The latest commits across public repositories.</p></header><ProfileActivity activity={data.activity} owner={organization.slug} /></section></div><aside><header><h2>People</h2><span>{data.stats.members}</span></header><div class="members">{#each data.members as member}<a href="/user/{member.handle}"><UserAvatar name={member.displayName || member.handle} src={member.avatarUrl} size={34} /><span><strong>{member.displayName}</strong><small>@{member.handle}</small></span></a>{/each}</div></aside></div>
</main>

<style>
  .organization-page{width:min(1120px,calc(100% - 56px));margin:0 auto;padding:52px 0 80px}.hero{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:22px;padding-bottom:32px;border-bottom:1px solid var(--border-subtle)}.slug{margin:2px 0 3px;color:var(--text-faint);font-size:10px}.hero h1{margin:0;color:var(--text-strong);font-size:29px;font-weight:670;letter-spacing:-.04em}.description{max-width:650px;margin:9px 0 0;color:var(--text);font-size:12px;line-height:1.55}.meta{display:flex;flex-wrap:wrap;gap:15px;margin-top:13px}.meta a,.meta span{display:flex;align-items:center;gap:6px;color:var(--text-faint);font-size:9px;text-decoration:none}.meta a:hover{color:var(--brand)}.manage{display:flex;height:32px;align-items:center;gap:6px;padding:0 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-size:10px;font-weight:620;text-decoration:none}.manage:hover{background:var(--surface-muted);color:var(--text-strong)}.signals{display:flex;gap:34px;padding:22px 0;border-bottom:1px solid var(--border-subtle)}.signals span{display:flex;align-items:baseline;gap:5px;color:var(--text-faint);font-size:9px}.signals strong{color:var(--text-strong);font-size:16px}.content{display:grid;grid-template-columns:minmax(0,1fr) 245px;gap:58px;padding-top:34px}.main-column{display:grid;gap:42px}.main-column section>header{margin-bottom:13px}.main-column h2,aside h2{margin:0;color:var(--text-strong);font-size:13px}.main-column header p{margin:4px 0 0;color:var(--text-faint);font-size:9px}aside{align-self:start}aside>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}aside>header span{color:var(--text-faint);font-size:9px}.members{border-top:1px solid var(--border)}.members>a{display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:9px;padding:10px 3px;border-bottom:1px solid var(--border-subtle);color:inherit;text-decoration:none}.members>a:hover{background:var(--surface-hover)}.members strong,.members small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.members strong{color:var(--text-strong);font-size:10px}.members small{margin-top:2px;color:var(--text-faint);font-size:9px}@media(max-width:800px){.content{grid-template-columns:1fr}.hero{grid-template-columns:auto 1fr}.manage{grid-column:1/-1;width:max-content}.content{gap:42px}}@media(max-width:580px){.organization-page{width:calc(100% - 28px);padding-top:34px}.hero{grid-template-columns:1fr}.signals{flex-wrap:wrap;gap:13px 24px}}
</style>
