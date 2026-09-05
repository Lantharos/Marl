<script lang="ts">
  import BackLink from './BackLink.svelte';
  let { title, description, backHref = '/', backLabel = 'Marl', children }: { title: string; description?: string; backHref?: string; backLabel?: string; children: import('svelte').Snippet } = $props();
</script>

<main class="page"><header><BackLink href={backHref} label={backLabel} /><h1>{title}</h1>{#if description}<p>{description}</p>{/if}</header><section>{@render children()}</section></main>

<style>
  .page{width:min(720px,calc(100% - 48px));margin:0 auto;padding:36px 0 80px}
  .page>header{margin-bottom:28px}
  h1{margin:20px 0 0;color:var(--text-strong);font-size:30px;font-weight:660;letter-spacing:-.04em;line-height:1.15}
  p{max-width:58ch;margin:10px 0 0;color:var(--text-muted);font-size:13px;line-height:1.6}
  section{padding:24px;border-radius:14px;background:var(--surface);box-shadow:var(--shadow-surface)}
  :global(.form-grid){display:grid;gap:24px}
  :global(.field-row){display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
  :global(.field-row .field){grid-template-rows:auto 1fr}
  :global(.field-row .field>.select),:global(.field-row .field>input){height:100%;min-height:42px}
  :global(.field){display:grid;min-width:0;gap:8px}
  :global(.field>span){color:var(--text-strong);font-size:12px;font-weight:600}
  :global(.field small){color:var(--text-muted);font-size:11px;line-height:1.55}
  :global(.field>input),:global(.field>textarea){width:100%;border:1px solid var(--border);border-radius:8px;background:var(--canvas);color:var(--text-strong);font-size:13px}
  :global(.field>input){height:42px;padding:0 12px}
  :global(.field>textarea){min-height:100px;resize:vertical;padding:12px;line-height:1.6}
  :global(.field>input:focus),:global(.field>textarea:focus){border-color:var(--brand)}
  :global(.form-actions){display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding-top:8px}
  :global(.form-actions a){display:inline-flex;min-height:38px;align-items:center;padding:0 12px;border-radius:8px;color:var(--text-muted);font-size:12px;font-weight:600;text-decoration:none}
  :global(.form-actions a:hover){background:var(--surface-hover);color:var(--text-strong)}
  @media(max-width:600px){.page{width:calc(100% - 28px);padding-top:24px}section{padding:20px 16px}:global(.field-row){grid-template-columns:1fr}}
</style>
