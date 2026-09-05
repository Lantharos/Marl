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
  import LinkButton from '$lib/components/LinkButton.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import { isoTimestamp } from '$lib/time';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const isUser = $derived('profile' in data);
  const userProfile = $derived(isUser ? data.profile : null);
  const organization = $derived(!isUser ? data.organization : null);
  const ownProfile = $derived(Boolean(userProfile && data.shellUser?.handle.toLowerCase() === userProfile.handle.toLowerCase()));
  const viewerOrganization = $derived(organization ? data.shellOrganizations?.find((item: { slug: string; role: string }) => item.slug.toLowerCase() === organization.slug.toLowerCase()) : null);
  const canManage = $derived(Boolean(viewerOrganization && viewerOrganization.role !== 'member'));
  const websiteLabel = $derived((userProfile?.website || organization?.website) ? new URL((userProfile?.website || organization?.website)!).host : '');
  const canonicalIdentity = $derived(userProfile?.handle ?? organization?.slug ?? '');
  const seoName = $derived(userProfile?.displayName ?? organization?.name ?? canonicalIdentity);
  const seoDescription = $derived(userProfile ? (userProfile.bio || `${userProfile.displayName}'s public work on Marl.`) : (organization?.description || `${organization?.name}'s public projects on Marl.`));
  const profileUrl = $derived(`https://marl.sh/${encodeURIComponent(canonicalIdentity)}`);
  const profileImage = $derived(userProfile?.avatarUrl ?? organization?.avatarUrl ?? null);
  const profileWebsite = $derived(userProfile?.website ?? organization?.website ?? null);
  const profileCreatedAt = $derived(isoTimestamp(userProfile?.joinedAt ?? organization?.createdAt ?? ''));
</script>

<Seo
  title={`${userProfile ? `${userProfile.displayName} (@${userProfile.handle})` : organization?.name} · Marl`}
  description={seoDescription}
  path={`/${encodeURIComponent(canonicalIdentity)}`}
  type={userProfile ? 'profile' : 'website'}
  jsonLd={{
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: profileUrl,
    ...(profileCreatedAt ? { dateCreated: profileCreatedAt } : {}),
    mainEntity: {
      '@type': userProfile ? 'Person' : 'Organization',
      name: seoName,
      url: profileUrl,
      ...(userProfile ? { alternateName: `@${userProfile.handle}` } : {}),
      ...(seoDescription ? { description: seoDescription } : {}),
      ...(profileImage ? { image: new URL(profileImage, 'https://marl.sh').href } : {}),
      ...(profileWebsite ? { sameAs: [profileWebsite] } : {})
    }
  }}
/>
<PublicProfileNav visible={!data.shellUser} />

{#if userProfile}
  <main class="profile-page">
    <aside class="identity">
      <UserAvatar name={userProfile.displayName || userProfile.handle} src={userProfile.avatarUrl} size={116} />
      <h1>{userProfile.displayName}</h1><p class="handle">@{userProfile.handle}</p>
      {#if userProfile.bio}<p class="bio">{userProfile.bio}</p>{/if}
      <div class="meta">{#if userProfile.website}<a href={userProfile.website} target="_blank" rel="noreferrer"><ExternalLink size={13} />{websiteLabel}</a>{/if}<span><CalendarDays size={13} />Joined {new Date(userProfile.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></div>
      {#if ownProfile}<LinkButton class="edit" href="/settings/account/profile"><Settings size={13} />Edit profile</LinkButton>{/if}
      {#if data.organizations.length}<section class="organizations"><h2>Organizations</h2><div>{#each data.organizations as item (item.slug)}<a href="/{item.slug}" aria-label={item.name} title={item.name}><OrganizationAvatar name={item.name} src={item.avatarUrl} size={34} /></a>{/each}</div></section>{/if}
    </aside>
    <div class="work">
      <section class="intro"><div><span><strong>{data.stats.repositories}</strong> public repositories</span><span><strong>{data.stats.contributions}</strong> contributions</span><span><strong>{data.stats.pullRequests}</strong> pulls</span></div></section>
      <ContributionGraph contributions={data.contributions} />
      <div class="columns"><section><header><h2>Public repositories</h2>{#if data.shellUser && data.stats.repositories > data.repositories.length}<a href="/repositories?q={userProfile.handle}">View all</a>{/if}</header><ProfileRepositoryList repositories={data.repositories.slice(0, 6)} />{#if data.archivedRepositories.length}<div class="archived"><h3>Archived</h3><ProfileRepositoryList repositories={data.archivedRepositories.slice(0, 6)} /></div>{/if}</section><section><header><h2>Recent work</h2></header><ProfileActivity activity={data.activity} /></section></div>
    </div>
  </main>
{:else if organization}
  <main class="organization-page">
    <header class="hero"><OrganizationAvatar name={organization.name} src={organization.avatarUrl} size={92} /><div><h1>{organization.name}</h1><p class="slug">@{organization.slug}</p>{#if organization.description}<p class="description">{organization.description}</p>{/if}<div class="meta">{#if organization.website}<a href={organization.website} target="_blank" rel="noreferrer"><ExternalLink size={13} />{websiteLabel}</a>{/if}<span><CalendarDays size={13} />Created {new Date(organization.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></div></div>{#if canManage}<LinkButton class="manage" href="/organizations/{organization.slug}/settings/profile"><Settings size={13} />Organization settings</LinkButton>{/if}</header>
    <section class="signals"><span><strong>{data.stats.repositories}</strong> public repositories</span><span><strong>{data.stats.members}</strong> {data.stats.members === 1 ? 'member' : 'members'}</span><span><strong>{data.stats.contributions}</strong> contributions this year</span></section>
    <div class="content"><div class="main-column"><section><header><h2>Repositories</h2></header><ProfileRepositoryList repositories={data.repositories} empty="No public repositories yet." />{#if data.archivedRepositories.length}<div class="archived"><h3>Archived</h3><ProfileRepositoryList repositories={data.archivedRepositories} /></div>{/if}</section><section class="recent"><header><h2>Recent work</h2></header><ProfileActivity activity={data.activity} owner={organization.slug} /></section></div><aside class="people"><header><h2>People</h2><span>{data.stats.members}</span></header><div class="members">{#each data.members as member (member.handle)}<a href="/{member.handle}"><UserAvatar name={member.displayName || member.handle} src={member.avatarUrl} size={34} /><span><strong>{member.displayName}</strong><small>@{member.handle}</small></span></a>{/each}</div></aside></div>
  </main>
{/if}

<style>
  .profile-page,.organization-page{width:min(1120px,calc(100% - 56px));margin:0 auto;padding:52px 0 80px}.profile-page{display:grid;grid-template-columns:240px minmax(0,1fr);gap:36px}.identity{align-self:start}.identity h1{margin:17px 0 0;color:var(--text-strong);font-size:24px;font-weight:680;letter-spacing:-.035em}.handle{margin:2px 0 0;color:var(--text-faint);font-size:14px}.bio{margin:18px 0 0;color:var(--text);font-size:13px;line-height:1.65;white-space:pre-wrap}.meta{display:flex;flex-wrap:wrap;gap:15px;margin-top:13px}.identity .meta{display:grid;gap:8px;margin-top:18px}.meta a,.meta span{display:flex;min-width:0;align-items:center;gap:7px;color:var(--text-faint);font-size:11px;text-decoration:none}.identity .meta a,.identity .meta span{font-size:11px}.meta a{overflow:hidden;color:var(--text);text-overflow:ellipsis;white-space:nowrap}.meta a:hover{color:var(--brand)}.identity :global(.edit.link-button){width:100%;margin-top:18px}.hero :global(.manage.link-button){align-self:start}.organizations{margin-top:28px;padding-top:0}.organizations h2{margin:0 0 10px;color:var(--text-muted);font-size:11px}.organizations div{display:flex;flex-wrap:wrap;gap:7px}.organizations a{display:flex;border-radius:7px}.work{min-width:0}.intro{display:flex;min-height:116px;align-items:flex-end;padding-bottom:25px}.intro>div{display:flex;flex-wrap:wrap;gap:28px}.intro span{display:grid;gap:3px;color:var(--text-faint);font-size:11px}.intro strong{color:var(--text-strong);font-size:20px;font-weight:650}.columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:42px;padding-top:31px}.columns section>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.columns h2{margin:0;color:var(--text-strong);font-size:12px}.columns header a{color:var(--text-faint);font-size:11px;text-decoration:none}.columns header a:hover{color:var(--brand)}.archived{margin-top:25px}.archived h3{margin:0 0 8px;color:var(--text-faint);font-size:11px;font-weight:620}
  .hero{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:22px;padding-bottom:24px}.slug{margin:2px 0 3px;color:var(--text-faint);font-size:11px}.hero h1{margin:0;color:var(--text-strong);font-size:29px;font-weight:670;letter-spacing:-.04em}.description{max-width:650px;margin:9px 0 0;color:var(--text);font-size:12px;line-height:1.55}.signals{display:flex;gap:34px;padding:20px 24px;border-radius:12px;background:var(--surface)}.signals span{display:flex;align-items:baseline;gap:5px;color:var(--text-faint);font-size:11px}.signals strong{color:var(--text-strong);font-size:16px}.content{display:grid;grid-template-columns:minmax(0,1fr) 245px;gap:58px;padding-top:34px}.main-column{display:grid;gap:42px}.main-column section>header{margin-bottom:13px}.main-column h2,.people h2{margin:0;color:var(--text-strong);font-size:13px}.people{align-self:start}.people>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.people>header span{color:var(--text-faint);font-size:11px}.members{padding:6px;border-radius:12px;background:var(--surface)}.members>a{display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:9px;padding:12px 8px;border-radius:7px;color:inherit;text-decoration:none}.members>a:hover{background:var(--surface-hover)}.members strong,.members small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.members strong{color:var(--text-strong);font-size:13px}.members small{margin-top:2px;color:var(--text-faint);font-size:11px}
  @media(max-width:850px){.profile-page{grid-template-columns:1fr;gap:30px;padding-top:35px}.identity{display:grid;grid-template-columns:auto 1fr;column-gap:17px}.identity :global(.user-avatar){grid-row:1/5}.identity h1{margin-top:9px}.identity .handle{align-self:start}.bio,.identity .meta,.organizations{grid-column:1/-1}.identity :global(.edit.link-button){grid-column:1/-1}.work .intro{min-height:auto}}
  @media(max-width:800px){.content{grid-template-columns:1fr;gap:42px}.hero{grid-template-columns:auto 1fr}.hero :global(.manage.link-button){grid-column:1/-1;width:max-content}}
  @media(max-width:650px){.profile-page,.organization-page{width:calc(100% - 28px)}.columns{grid-template-columns:1fr;gap:34px}.intro>div{gap:18px}}
  @media(max-width:580px){.organization-page{padding-top:34px}.hero{grid-template-columns:1fr}.signals{flex-wrap:wrap;gap:13px 24px}}
</style>
