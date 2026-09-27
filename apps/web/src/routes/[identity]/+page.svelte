<script lang="ts">
  import OrganizationProfilePage from '$lib/components/profile/OrganizationProfilePage.svelte';
  import PublicProfileNav from '$lib/components/profile/PublicProfileNav.svelte';
  import UserProfilePage from '$lib/components/profile/UserProfilePage.svelte';
  import Seo from '$lib/components/page/Seo.svelte';
  import { isoTimestamp } from '$lib/time';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const identity = $derived(data.identity);
  const userProfile = $derived('profile' in identity ? identity.profile : null);
  const organization = $derived('organization' in identity ? identity.organization : null);
  const ownProfile = $derived(
    Boolean(userProfile && data.shellUser?.handle.toLowerCase() === userProfile.handle.toLowerCase())
  );
  const viewerOrganization = $derived(
    organization
      ? data.shellOrganizations?.find((item) => item.slug.toLowerCase() === organization.slug.toLowerCase())
      : null
  );
  const canManage = $derived(Boolean(viewerOrganization && viewerOrganization.role !== 'member'));
  const canonicalIdentity = $derived(userProfile?.handle ?? organization?.slug ?? '');
  const seoName = $derived(userProfile?.displayName ?? organization?.name ?? canonicalIdentity);
  const seoDescription = $derived(
    userProfile
      ? userProfile.bio || `${userProfile.displayName}'s public work on Marl.`
      : organization?.description || `${organization?.name}'s public projects on Marl.`
  );
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

{#if 'profile' in identity}
  <UserProfilePage data={identity} own={ownProfile} />
{:else}
  <OrganizationProfilePage data={identity} {canManage} />
{/if}
