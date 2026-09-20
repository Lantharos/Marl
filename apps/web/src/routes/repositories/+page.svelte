<script lang="ts">
  import RepositoryBrowser from '$lib/repositories/RepositoryBrowser.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
</script>

<RepositoryBrowser {data} />
