<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import BackLink from '$lib/components/BackLink.svelte';
  import Select from '$lib/components/Select.svelte';
  import { api, StyApiError } from '$lib/api';

  type Branch = { name: string; commitId: string };
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  let branches = $state<Branch[]>([]);
  let branch = $state('');
  let name = $state('Verify changes');
  let jobName = $state('Checks');
  let image = $state('ubuntu:24.04');
  let shell = $state('bash');
  let labels = $state('docker');
  let timeoutMinutes = $state(30);
  let command = $state('apt-get update\napt-get install -y curl\n# Add your checks here');
  let artifacts = $state('');
  let busy = $state(false);
  let error = $state('');
  const branchOptions = $derived(branches.map((item) => ({ value: item.name, label: item.name, description: item.commitId.slice(0, 7) })));

  onMount(async () => {
    try {
      const result = await api<{ defaultBranch: string; branches: Branch[] }>(`/repositories/${owner}/${repo}/branches`);
      branches = result.branches;
      branch = result.defaultBranch;
    } catch (cause) { error = cause instanceof StyApiError ? cause.message : 'Branches could not be loaded.'; }
  });

  async function create() {
    if (!name.trim() || !jobName.trim() || !command.trim() || !image.trim() || busy) return;
    busy = true; error = '';
    try {
      const result = await api<{ run: { number: number } }>(`/repositories/${owner}/${repo}/runs`, { method: 'POST', body: JSON.stringify({ name, branch, jobs: [{ key: 'checks', name: jobName, labels: labels.split(',').map((value) => value.trim()).filter(Boolean), timeoutMinutes, runtime: { image, timeoutMinutes, services: [] }, steps: [{ name: jobName, run: command, shell }], artifacts: artifacts.split(',').map((value) => value.trim()).filter(Boolean) }] }) });
      await goto(`/${owner}/${repo}/runs/${result.run.number}`);
    } catch (cause) { error = cause instanceof StyApiError ? cause.message : 'Run could not be created.'; busy = false; }
  }
</script>

<svelte:head><title>New run · {owner}/{repo} · Sty</title></svelte:head>
<main class="page">
  <header><BackLink href="/{owner}/{repo}/runs" label="Runs" /><h1>New run</h1><p>Run one isolated Docker job on a self-hosted machine.</p></header>
  <form onsubmit={(event) => { event.preventDefault(); void create(); }}>
    <div class="row"><label><span>Run name</span><input bind:value={name} /></label><label><span>Branch</span><Select bind:value={branch} options={branchOptions} ariaLabel="Run branch" /></label></div>
    <div class="row"><label><span>Job name</span><input bind:value={jobName} /></label><label><span>Container image</span><input bind:value={image} placeholder="ubuntu:24.04" /></label></div>
    <div class="row"><label><span>Runner labels <small>comma-separated</small></span><input bind:value={labels} placeholder="docker, x86_64" /></label><label><span>Shell</span><Select bind:value={shell} ariaLabel="Container shell" options={[{ value: 'bash', label: 'Bash' }, { value: 'sh', label: 'sh' }, { value: 'pwsh', label: 'PowerShell 7' }]} /></label></div>
    <label><span>Commands</span><textarea class="commands" bind:value={command} spellcheck="false"></textarea></label>
    <div class="row"><label><span>Artifacts <small>paths separated by commas</small></span><input bind:value={artifacts} placeholder="dist, reports/test.xml" /></label><label><span>Timeout <small>minutes</small></span><input type="number" min="1" max="1440" bind:value={timeoutMinutes} /></label></div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <footer><a href="/{owner}/{repo}/runs">Cancel</a><button disabled={busy || !branch || !command.trim() || !image.trim()}>{busy ? 'Queueing...' : 'Queue run'}</button></footer>
  </form>
</main>

<style>
  .page{width:min(700px,100%);margin:0 auto}.page>header{margin-bottom:27px}h1{margin:15px 0 0;color:var(--text-strong);font-size:23px;letter-spacing:-.035em}.page>header p{margin:6px 0 0;color:var(--text-muted);font-size:11px}form{display:grid;gap:17px;padding-top:22px;border-top:1px solid var(--border)}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}label{display:grid;gap:7px}label>span{color:var(--text-strong);font-size:10px;font-weight:620}label small{color:var(--text-faint);font-size:8px;font-weight:400}input,textarea{width:100%;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:10px}input{height:36px;padding:0 9px}textarea{min-height:150px;padding:10px;resize:vertical}.commands{font-family:"SFMono-Regular",Consolas,monospace;line-height:1.6}input:focus,textarea:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}.error{margin:0;color:var(--danger);font-size:9px}footer{display:flex;justify-content:flex-end;gap:7px;padding-top:17px;border-top:1px solid var(--border-subtle)}footer a,footer button{display:inline-flex;height:33px;align-items:center;padding:0 10px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);font-size:9px;font-weight:630;text-decoration:none}footer button{border-color:var(--brand);background:var(--brand);color:#fff;cursor:pointer}footer button:disabled{opacity:.5}@media(max-width:600px){.row{grid-template-columns:1fr}}
</style>
