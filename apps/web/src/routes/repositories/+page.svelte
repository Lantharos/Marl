<script lang="ts">
  import RepositoryBrowser from '$lib/repositories/RepositoryBrowser.svelte';
  import type { PageData } from './$types';
  let { data } = $props<{ data: PageData }>();
</script>

<RepositoryBrowser {data} />

<div class="recovery"><a href="/repositories/deleted">Recently deleted</a></div>
<style>.recovery{padding:0 24px 24px;text-align:right}.recovery a{color:var(--text-muted);font-size:12px}</style>
