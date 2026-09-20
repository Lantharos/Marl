<script lang="ts">
  import PublicProfileNav from '$lib/components/profile/PublicProfileNav.svelte';
  import RepositoryBrowser from '$lib/repositories/RepositoryBrowser.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
</script>

<PublicProfileNav visible={!data.shellUser} />
<RepositoryBrowser {data} owner={data.owner} path="/{data.owner}/-/repositories" endpoint="/profiles/{data.owner}/repositories" filters={['All', 'Active', 'Archived']} />
