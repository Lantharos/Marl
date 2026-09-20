<script lang="ts">
  import CodeViewer from '$lib/code/CodeViewer.svelte';
  import { page } from '$app/stores';
  import { onDestroy } from 'svelte';
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import Download from 'lucide-svelte/icons/download';
  import FileCode2 from 'lucide-svelte/icons/file-code-2';
  import History from 'lucide-svelte/icons/history';
  import Button from '$lib/components/Button.svelte';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import { encodeRepositoryPath, encodeRevision } from '$lib/repository-path';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  const filePath = $derived($page.params.path ?? 'README.md');
  const revision = $derived($page.params.revision ?? 'main');
  const revisionPath = $derived(encodeRevision(revision));
  const content = $derived(data.preview.content);
  const rawUrl = $derived(`/api/v1/repositories/${$page.params.owner}/${$page.params.repo}/blob/${revisionPath}/${encodeRepositoryPath(filePath)}`);
  const lines = $derived(content.split('\n'));
  const base = $derived(`/${$page.params.owner}/${$page.params.repo}`);
  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyFile() { await navigator.clipboard.writeText(content); copied = true; clearTimeout(copiedTimer); copiedTimer = setTimeout(() => (copied = false), 1400); }
  onDestroy(() => clearTimeout(copiedTimer));
</script>
<Seo title={`${filePath} · ${$page.params.owner}/${$page.params.repo} · Marl`} description={`View ${filePath} at ${revision} in ${$page.params.owner}/${$page.params.repo} on Marl.`} path={$page.url.pathname} robots={data.repository.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'} />
<nav class="crumbs"><a href="{base}/code">{$page.params.repo}</a><span>/</span>{#each filePath.split('/') as part, index (`${index}:${part}`)}<a href="{base}/{index === filePath.split('/').length - 1 ? 'blob' : 'tree'}/{revisionPath}/{encodeRepositoryPath(filePath.split('/').slice(0,index+1).join('/'))}">{part}</a>{#if index < filePath.split('/').length - 1}<span>/</span>{/if}{/each}</nav>
<header class="file-head"><div><FileCode2 size={16} /><strong>{filePath.split('/').at(-1)}</strong><span>{data.preview.binary ? `${data.preview.byteSize ?? 'Unknown'} bytes` : `${lines.length}${data.preview.truncated ? '+' : ''} lines`}</span></div><div><LinkButton size="small" href="{base}/commits/{revisionPath}"><History size={14} />History</LinkButton><Button disabled={data.preview.binary} icon size="small" aria-label={data.preview.truncated ? 'Copy preview' : 'Copy file'} onclick={copyFile}>{#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}</Button><a class="download" href={rawUrl} download={filePath.split('/').at(-1)} aria-label="Download original file"><Download size={14} /></a></div></header>
{#if data.preview.truncated}<p class="notice">Showing the first 1 MiB. Download the original file for the complete contents.</p>{/if}
{#if data.preview.binary}
  <section class="binary">{#if ['image/png','image/jpeg','image/gif','image/webp','image/avif'].includes(data.preview.contentType)}<img src={rawUrl} alt={filePath} />{:else}<p>This file has no text preview.</p>{/if}<a href={rawUrl} download={filePath.split('/').at(-1)}>Download original file</a></section>
{:else}{#key rawUrl}<CodeViewer {content} path={filePath} />{/key}{/if}
<style>
  .crumbs { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; color: var(--text-faint); font-size: 11px; } .crumbs a { color: var(--brand); font-weight: 570; text-decoration: none; } .file-head { display: flex; min-height: 46px; align-items: center; justify-content: space-between; padding: 0 10px 0 13px; border: 1px solid var(--border); border-radius: 8px 8px 0 0; background: var(--surface-muted); } .file-head > div { display: flex; align-items: center; gap: 7px; } .file-head strong { color: var(--text-strong); font-size: 11px; } .file-head span { color: var(--text-faint); font-size:11px; }
  .download{display:inline-flex;padding:8px;color:var(--text)}.notice,.binary{padding:20px;color:var(--text-muted);font-size:13px}.binary img{display:block;max-width:100%;max-height:70vh;margin:auto}.binary a{color:var(--brand)}
  @media(max-width:600px){.file-head :global(.link-button){display:none}.file-head span{display:none}}
</style>
