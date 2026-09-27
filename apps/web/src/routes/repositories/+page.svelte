<script lang="ts">
  import RepositoryBrowser from '$lib/repositories/RepositoryBrowser.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<RepositoryBrowser {data} />
