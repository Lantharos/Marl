<script lang="ts">
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Button from '$lib/components/Button.svelte';
  import ErrorPage from './ErrorPage.svelte';
</script>

<ErrorPage title="Marl isn’t answering." scene="gone">
  <Button id="retry-page" variant="primary"><RefreshCw size={15} />Try again</Button>
</ErrorPage>
