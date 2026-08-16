<script lang="ts">
  import { renderMarkdown } from '$lib/markdown';
  let { source, muted = false } = $props<{ source: string; muted?: boolean }>();
  const rendered = $derived(renderMarkdown(source));
</script>

<div class="markdown" class:muted>{@html rendered}</div>

<style>
  .markdown{color:var(--text);font-size:12px;line-height:1.65;overflow-wrap:anywhere}.markdown.muted{color:var(--text-muted)}
  .markdown :global(:first-child){margin-top:0}.markdown :global(:last-child){margin-bottom:0}.markdown :global(p),.markdown :global(ul),.markdown :global(ol),.markdown :global(blockquote),.markdown :global(pre){margin:0 0 12px}.markdown :global(ul),.markdown :global(ol){padding-left:22px}.markdown :global(li+li){margin-top:3px}.markdown :global(a){color:var(--brand);text-decoration:none}.markdown :global(a:hover){text-decoration:underline}.markdown :global(code){padding:2px 4px;border-radius:4px;background:var(--surface-muted);color:var(--text-strong);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em}.markdown :global(pre){overflow:auto;padding:11px 13px;border-radius:6px;background:var(--surface-muted)}.markdown :global(pre code){padding:0;background:transparent}.markdown :global(blockquote){padding-left:12px;border-left:2px solid var(--border-strong);color:var(--text-muted)}.markdown :global(h1),.markdown :global(h2),.markdown :global(h3){margin:18px 0 9px;color:var(--text-strong);line-height:1.25}.markdown :global(h1){font-size:18px}.markdown :global(h2){font-size:15px}.markdown :global(h3){font-size:13px}.markdown :global(hr){height:1px;margin:16px 0;border:0;background:var(--border)}
</style>
