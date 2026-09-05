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
  .settings-layout{display:grid;width:min(1080px,calc(100% - 48px));grid-template-columns:210px minmax(0,780px);gap:40px;margin:0 auto;padding:36px 0 80px}
  .settings-layout aside{position:sticky;top:76px;align-self:start}
  .settings-content{min-width:0}
  .settings-content :global(.page-head){margin-bottom:28px!important;padding-bottom:0!important;border-bottom:0!important}
  .settings-content :global(.page-head h1),.settings-content :global(.page-head h2){margin:0;font-size:28px!important;font-weight:660;letter-spacing:-.035em;line-height:1.15}
  .settings-content :global(.page-head p){max-width:60ch;margin-top:10px;font-size:13px!important;line-height:1.6}
  .settings-content :global(section h3){font-size:14px}
  .settings-content :global(section p){font-size:12px;line-height:1.6}
  .settings-content :global(button){font-size:12px}
  .settings-content :global(button:not([aria-label])){min-height:38px}
  .settings-content :global(label>span),.settings-content :global(.security-field>span){font-size:12px}
  .settings-content :global(input:not([type=file])){min-width:0;height:42px;font-size:13px}
  .settings-content :global(textarea){font-size:13px}
  .settings-content :global(article strong){font-size:13px}
  .settings-content :global(article small),.settings-content :global(article div>span),.settings-content :global(.fields small){font-size:11px;line-height:1.6;overflow-wrap:anywhere}
  .settings-content :global(.notice),.settings-content :global(.error),.settings-content :global(.empty){font-size:12px}
  @media(max-width:800px){.settings-layout{width:calc(100% - 28px);grid-template-columns:1fr;gap:28px;padding-top:24px}.settings-layout aside{position:static}.settings-content :global(.page-head){flex-wrap:wrap}}
</style>
