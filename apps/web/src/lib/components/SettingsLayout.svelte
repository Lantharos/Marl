<script lang="ts">
  let { sidebar, content } = $props<{
    sidebar: import('svelte').Snippet;
    content: import('svelte').Snippet;
  }>();
</script>

<div class="settings-layout">
  <aside>{@render sidebar()}</aside>
  <main class="settings-content">{@render content()}</main>
</div>

<style>
  .settings-layout{display:grid;width:min(1080px,calc(100% - 40px));grid-template-columns:215px minmax(0,760px);gap:42px;margin:0 auto;padding:42px 0 80px}.settings-layout aside{position:sticky;top:76px;align-self:start}.settings-content{min-width:0}.settings-content :global(.page-head h1),.settings-content :global(.page-head h2){font-size:25px}.settings-content :global(.page-head p){font-size:13px}.settings-content :global(section h3){font-size:13px}.settings-content :global(section p){font-size:12px}.settings-content :global(button){font-size:12px}.settings-content :global(button:not([aria-label])){min-height:36px}.settings-content :global(label>span),.settings-content :global(.security-field>span){font-size:12px}.settings-content :global(input){height:38px;font-size:13px}.settings-content :global(textarea){font-size:13px}.settings-content :global(article strong){font-size:13px}.settings-content :global(article small),.settings-content :global(article div>span),.settings-content :global(.fields small){font-size:11px}.settings-content :global(.notice),.settings-content :global(.error),.settings-content :global(.empty){font-size:12px}@media(max-width:720px){.settings-layout{grid-template-columns:1fr;gap:28px}.settings-layout aside{position:static}}
</style>
