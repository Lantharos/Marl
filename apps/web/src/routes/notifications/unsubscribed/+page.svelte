<script lang="ts">
  import BellOff from '@lucide/svelte/icons/bell-off';
  import LinkButton from '$lib/components/controls/LinkButton.svelte';
  import EmptyState from '$lib/components/feedback/EmptyState.svelte';
  import Page from '$lib/components/page/Page.svelte';
</script>

<svelte:head><title>Unsubscribed · Marl</title></svelte:head>
<Page width="narrow">
  <div class="mt-10 surface">
    <EmptyState
      icon={BellOff}
      title="You won’t get notification emails"
      description="Your inbox still collects everything. Account and security email is not affected."
    >
      <LinkButton size="small" href="/settings/account/notifications">Notification settings</LinkButton>
    </EmptyState>
  </div>
</Page>
