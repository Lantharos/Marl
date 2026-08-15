<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { PullRequestDetail, PullRequestDiff } from '@sty/contracts';
  import BadgeCheck from 'lucide-svelte/icons/badge-check';
  import Check from 'lucide-svelte/icons/check';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import FileDiff from 'lucide-svelte/icons/file-diff';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import GitPullRequest from 'lucide-svelte/icons/git-pull-request';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Plus from 'lucide-svelte/icons/plus';
  import { api, StyApiError } from '$lib/api';
  import Select from '$lib/components/Select.svelte';

  type Tab = 'conversation' | 'changes' | 'checks';
  type PatchLine = { kind: 'meta' | 'context' | 'added' | 'removed'; text: string; oldLine: number | null; newLine: number | null };
  const owner = $derived($page.params.owner);
  const repo = $derived($page.params.repo);
  const number = $derived(Number($page.params.number));
  let pull = $state<PullRequestDetail | null>(null);
  let diff = $state<PullRequestDiff | null>(null);
  let tab = $state<Tab>('conversation');
  let loading = $state(true);
  let error = $state('');
  let reviewState = $state<'commented' | 'approved' | 'changes_requested'>('commented');
  let reviewBody = $state('');
  let busy = $state(false);
  let lineDraft = $state<{ path: string; line: number; side: 'old' | 'new' } | null>(null);
  let lineComment = $state('');

  async function load() {
    loading = true; error = '';
    try {
      const [detail, comparison] = await Promise.all([
        api<{ pullRequest: PullRequestDetail }>(`/repositories/${owner}/${repo}/pulls/${number}`),
        api<PullRequestDiff>(`/repositories/${owner}/${repo}/pulls/${number}/diff`)
      ]);
      pull = detail.pullRequest; diff = comparison;
    } catch (cause) { error = cause instanceof StyApiError ? cause.message : 'This pull request could not be loaded.'; }
    finally { loading = false; }
  }

  async function submitReview() {
    if (!pull || busy) return; busy = true; error = '';
    try { await api(`/repositories/${owner}/${repo}/pulls/${number}/reviews`, { method: 'POST', body: JSON.stringify({ state: reviewState, body: reviewBody }) }); reviewBody = ''; await load(); }
    catch (cause) { error = cause instanceof StyApiError ? cause.message : 'Review could not be submitted.'; }
    finally { busy = false; }
  }

  async function merge() {
    if (!pull || busy) return; busy = true; error = '';
    try { await api(`/repositories/${owner}/${repo}/pulls/${number}/merge`, { method: 'POST', body: '{}' }); await load(); }
    catch (cause) { error = cause instanceof StyApiError ? cause.message : 'Pull request could not be merged.'; }
    finally { busy = false; }
  }

  async function submitLineComment() {
    if (!lineDraft || !lineComment.trim() || busy) return; busy = true;
    try { await api(`/repositories/${owner}/${repo}/pulls/${number}/threads`, { method: 'POST', body: JSON.stringify({ ...lineDraft, body: lineComment }) }); lineDraft = null; lineComment = ''; await load(); tab = 'conversation'; }
    catch (cause) { error = cause instanceof StyApiError ? cause.message : 'Comment could not be added.'; }
    finally { busy = false; }
  }

  async function resolveThread(threadId: string) {
    if (busy) return; busy = true; error = '';
    try { await api(`/review-threads/${threadId}/resolve`, { method: 'POST', body: '{}' }); await load(); }
    catch (cause) { error = cause instanceof StyApiError ? cause.message : 'Conversation could not be resolved.'; }
    finally { busy = false; }
  }

  function currentReviewsHaveChangesRequested() {
    if (!pull) return false;
    const latest = new Map<string, PullRequestDetail['reviews'][number]>();
    for (const review of pull.reviews) if (review.commitId === pull.sourceCommitId) latest.set(review.author, review);
    return [...latest.values()].some((review) => review.state === 'changes_requested');
  }

  function openCurrentThreads() {
    return pull?.threads.filter((thread) => !thread.outdated && !thread.resolved) ?? [];
  }

  function patchLines(patch: string): PatchLine[] {
    let oldLine = 0, newLine = 0;
    return patch.split('\n').map((text) => {
      const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); return { kind: 'meta', text, oldLine: null, newLine: null }; }
      if (text.startsWith('+++') || text.startsWith('---') || text.startsWith('diff ') || text.startsWith('index ')) return { kind: 'meta', text, oldLine: null, newLine: null };
      if (text.startsWith('+')) return { kind: 'added', text, oldLine: null, newLine: newLine++ };
      if (text.startsWith('-')) return { kind: 'removed', text, oldLine: oldLine++, newLine: null };
      return { kind: 'context', text, oldLine: oldLine++, newLine: newLine++ };
    });
  }

  onMount(load);
</script>

<svelte:head><title>{pull?.title ?? `Pull request #${number}`} · {owner}/{repo} · Sty</title></svelte:head>

{#if loading}
  <div class="loading" aria-busy="true"><i></i><i></i><i></i></div>
{:else if !pull}
  <div class="fatal"><CircleAlert size={24} /><strong>Pull request unavailable</strong><p>{error}</p><a href="/{owner}/{repo}/pulls">Back to pull requests</a></div>
{:else}
  <header class="pr-header">
    <div class="title-row"><span class="state {pull.state}">{#if pull.state === 'merged'}<GitMerge size={17} />{:else}<GitPullRequest size={17} />{/if}{pull.state}</span><h1>{pull.title} <small>#{pull.number}</small></h1></div>
    <p><strong>{pull.author}</strong> wants to merge <b>{pull.sourceBranch}</b> into <b>{pull.targetBranch}</b></p>
    <div class="head-meta"><code>{pull.sourceCommitId.slice(0,7)}</code><span>→</span><code>{pull.targetCommitId.slice(0,7)}</code><span>·</span><span>{diff?.files.length ?? 0} changed files</span></div>
  </header>

  <nav class="tabs" aria-label="Pull request sections">
    <button class:active={tab === 'conversation'} onclick={() => (tab = 'conversation')}><MessageSquare size={15} />Conversation <span>{pull.reviews.length + pull.threads.length}</span></button>
    <button class:active={tab === 'changes'} onclick={() => (tab = 'changes')}><FileDiff size={15} />Changes <span>{diff?.files.length ?? 0}</span></button>
    <button class:active={tab === 'checks'} onclick={() => (tab = 'checks')}><CircleCheck size={15} />Checks <span>{pull.checks.length}</span></button>
  </nav>
  {#if error}<div class="action-error" role="alert">{error}</div>{/if}

  {#if tab === 'conversation'}
    <div class="conversation-layout">
      <main class="timeline">
        <article class="comment"><header><span class="avatar">{pull.author.slice(0,2).toUpperCase()}</span><strong>{pull.author}</strong><span>opened this pull request</span><time>{pull.createdAt}</time></header><div>{pull.body || 'No description was provided.'}</div></article>
        {#each pull.reviews as review}
          <article class="event"><span class="event-icon {review.state}">{#if review.state === 'approved'}<CircleCheck size={15} />{:else if review.state === 'changes_requested'}<CircleAlert size={15} />{:else}<MessageSquare size={15} />{/if}</span><p><strong>{review.author}</strong> {review.state === 'approved' ? 'approved these changes' : review.state === 'changes_requested' ? 'requested changes' : 'reviewed this pull request'} <time>{review.createdAt}</time></p>{#if review.body}<blockquote>{review.body}</blockquote>{/if}</article>
        {/each}
        {#each pull.threads as thread}
          <article class="thread" class:outdated={thread.outdated}><header><code>{thread.path}:{thread.line}</code><div>{#if thread.outdated}<span>Outdated</span>{:else if thread.resolved}<span class="resolved">Resolved</span>{:else}<button disabled={busy} onclick={() => resolveThread(thread.id)}>Resolve</button>{/if}</div></header>{#each thread.comments as comment}<div><strong>{comment.author}</strong><p>{comment.body}</p></div>{/each}</article>
        {/each}
        {#if pull.state !== 'merged' && pull.state !== 'closed'}
          <section class="review-box"><h2>Submit a review</h2><textarea bind:value={reviewBody} placeholder="Leave a review summary (optional)"></textarea><footer><div class="review-choice"><Select bind:value={reviewState} ariaLabel="Review decision" options={[{ value: 'commented', label: 'Comment' }, { value: 'approved', label: 'Approve' }, { value: 'changes_requested', label: 'Request changes' }]} /></div><button disabled={busy} onclick={submitReview}>{busy ? 'Submitting…' : 'Submit review'}</button></footer></section>
        {/if}
      </main>
      <aside class="merge-panel">
        <header>{#if pull.state === 'merged'}<span class="merge-icon merged"><GitMerge size={18} /></span><div><strong>Merged</strong><p>Commit <code>{pull.mergedCommitId?.slice(0,7)}</code> is on {pull.targetBranch}.</p></div>{:else}<span class="merge-icon"><GitMerge size={18} /></span><div><strong>{pull.state === 'mergeable' ? 'Ready to merge' : 'Merge requirements'}</strong><p>Review the current head before merging.</p></div>{/if}</header>
        {#if pull.state !== 'merged'}<ul><li class:passed={pull.checkSummary.failed === 0 && pull.checkSummary.running === 0}><Check size={13} />{pull.checkSummary.total ? `${pull.checkSummary.passed} of ${pull.checkSummary.total} checks passed` : 'No required checks configured'}</li><li class:passed={!currentReviewsHaveChangesRequested()}><Check size={13} />No unresolved change requests on this commit</li><li class:passed={openCurrentThreads().length === 0}><Check size={13} />{openCurrentThreads().length} unresolved current conversations</li></ul><button class="merge-button" disabled={busy || pull.checkSummary.failed > 0 || pull.checkSummary.running > 0 || currentReviewsHaveChangesRequested() || openCurrentThreads().length > 0} onclick={merge}><GitMerge size={15} />{busy ? 'Merging…' : `Merge into ${pull.targetBranch}`}</button>{/if}
      </aside>
    </div>
  {:else if tab === 'changes'}
    <div class="changes-layout">
      <aside class="file-index">{#each diff?.files ?? [] as file}<a href="#file-{file.path.replaceAll('/','-')}"><span>{file.path}</span><small><b>+{file.additions}</b><i>−{file.deletions}</i></small></a>{/each}</aside>
      <main class="diffs">
        {#each diff?.files ?? [] as file}
          <section class="diff-card" id="file-{file.path.replaceAll('/','-')}"><header><strong>{file.path}</strong><span>{file.status}</span><small><b>+{file.additions}</b><i>−{file.deletions}</i></small></header><div class="patch"><table><tbody>{#each patchLines(file.patch) as line}<tr class={line.kind}><td>{line.oldLine ?? ''}</td><td>{line.newLine ?? ''}</td><td class="add-comment">{#if line.kind !== 'meta'}<button aria-label="Comment on line {line.newLine ?? line.oldLine}" onclick={() => (lineDraft = { path: file.path, line: line.newLine ?? line.oldLine ?? 1, side: line.newLine ? 'new' : 'old' })}><Plus size={12} /></button>{/if}</td><td><pre>{line.text || ' '}</pre></td></tr>{#if lineDraft?.path === file.path && lineDraft.line === (line.newLine ?? line.oldLine)}<tr class="draft"><td colspan="4"><textarea bind:value={lineComment} placeholder="Comment on this line"></textarea><div><button onclick={() => (lineDraft = null)}>Cancel</button><button disabled={busy || !lineComment.trim()} onclick={submitLineComment}>Add review comment</button></div></td></tr>{/if}{/each}</tbody></table></div></section>
        {/each}
      </main>
    </div>
  {:else}
    <section class="checks-page"><header><h2>Checks for <code>{pull.sourceCommitId.slice(0,7)}</code></h2><p>Required checks must pass on the latest commit.</p></header>{#each pull.checks as check}<article><span class="check-icon {check.state}">{#if check.state === 'success'}<CircleCheck size={17} />{:else if check.state === 'failure'}<CircleAlert size={17} />{:else}<CircleDot size={17} />{/if}</span><div><strong>{check.name}</strong><p>{check.summary}</p></div><span>{check.state}</span></article>{:else}<div class="empty-checks"><CircleDot size={22} /><strong>No checks reported</strong><p>Push a workflow or attach a self-hosted runner to report checks.</p></div>{/each}</section>
  {/if}
{/if}

<style>
  .loading { display:grid;gap:10px;padding:20px 0}.loading i{display:block;height:52px;border-radius:8px;background:var(--surface-muted);animation:pulse 1.3s infinite alternate}.loading i:first-child{height:90px}@keyframes pulse{to{opacity:.48}}
  .fatal{padding:70px 20px;text-align:center;color:var(--text-faint)}.fatal strong{display:block;margin-top:10px;color:var(--text-strong)}.fatal p{font-size:11px}.fatal a{color:var(--brand);font-size:11px}.pr-header{padding:4px 0 23px}.title-row{display:flex;align-items:flex-start;gap:10px}.title-row h1{margin:0;color:var(--text-strong);font-size:23px;font-weight:660;letter-spacing:-.025em}.title-row h1 small{color:var(--text-faint);font-weight:500}.state{display:inline-flex;align-items:center;gap:5px;margin-top:1px;padding:5px 8px;border-radius:99px;background:var(--success-soft);color:var(--success);font-size:10px;font-weight:650;text-transform:capitalize}.state.merged{background:#eee7ff;color:#7145b8}.state.blocked{background:var(--danger-soft);color:var(--danger)}.pr-header>p{margin:10px 0 0;color:var(--text-muted);font-size:11px}.pr-header b{padding:2px 5px;border-radius:4px;background:var(--surface-muted);color:var(--text-strong);font-family:monospace;font-weight:500}.head-meta{display:flex;align-items:center;gap:6px;margin-top:9px;color:var(--text-faint);font-size:9px}.head-meta code{color:var(--text-muted)}
  .tabs{display:flex;height:42px;margin-bottom:20px;border-bottom:1px solid var(--border);gap:3px}.tabs button{position:relative;display:flex;align-items:center;gap:6px;padding:0 11px;border:0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:11px;font-weight:580}.tabs button::after{position:absolute;inset:auto 7px -1px;height:2px;background:transparent;content:''}.tabs button.active{color:var(--text-strong)}.tabs button.active::after{background:var(--brand)}.tabs span{padding:1px 5px;border-radius:99px;background:var(--surface-muted);color:var(--text-faint);font-size:9px}.action-error{margin:-8px 0 14px;padding:9px 11px;border:1px solid var(--danger);border-radius:7px;background:var(--danger-soft);color:var(--danger);font-size:10px}
  .conversation-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;align-items:start;gap:20px}.timeline{display:grid;gap:13px}.comment,.review-box,.thread{overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.comment>header{display:flex;align-items:center;gap:6px;min-height:45px;padding:0 12px;border-bottom:1px solid var(--border);background:var(--surface-muted);color:var(--text-muted);font-size:10px}.comment header strong{color:var(--text-strong)}.comment time,.event time{margin-left:auto;color:var(--text-faint);font-size:9px}.avatar{display:grid;width:25px;height:25px;place-items:center;border-radius:50%;background:#d5b496;color:#3d2518;font-size:8px;font-weight:740}.comment>div{padding:18px;color:var(--text);font-size:12px;line-height:1.65;white-space:pre-wrap}.event{position:relative;display:grid;grid-template-columns:29px 1fr;align-items:center;gap:9px;padding:3px 6px}.event-icon{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-muted)}.event-icon.approved{background:var(--success-soft);color:var(--success)}.event-icon.changes_requested{background:var(--danger-soft);color:var(--danger)}.event p{display:flex;margin:0;color:var(--text-muted);font-size:10px}.event strong{color:var(--text-strong)}.event blockquote{grid-column:2;margin:0;padding:9px 11px;border-left:2px solid var(--border-strong);background:var(--surface);color:var(--text);font-size:11px}.thread header{display:flex;align-items:center;justify-content:space-between;padding:8px 11px;border-bottom:1px solid var(--border);background:var(--surface-muted)}.thread header code{font-size:9px;color:var(--text)}.thread header span{color:var(--warning);font-size:9px;font-weight:650}.thread header span.resolved{color:var(--success)}.thread>div{padding:11px}.thread strong{font-size:10px;color:var(--text-strong)}.thread p{margin:5px 0 0;font-size:11px}.review-box{padding:14px}.review-box h2{margin:0 0 10px;color:var(--text-strong);font-size:12px}.review-box textarea{width:100%;min-height:82px;padding:9px;border:1px solid var(--border);border-radius:6px;resize:vertical;background:var(--surface);color:var(--text);font-size:11px}.review-box footer{display:flex;justify-content:flex-end;gap:7px;margin-top:8px}.review-choice{width:160px}.review-box footer>button{height:36px;padding:0 10px;border:1px solid var(--brand);border-radius:6px;background:var(--brand);color:white;font-size:10px;font-weight:620}
  .merge-panel{overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface)}.merge-panel>header{display:flex;gap:10px;padding:14px}.merge-icon{display:grid;width:34px;height:34px;flex:0 0 auto;place-items:center;border-radius:9px;background:var(--success-soft);color:var(--success)}.merge-icon.merged{background:#eee7ff;color:#7145b8}.merge-panel header strong{color:var(--text-strong);font-size:12px}.merge-panel header p{margin:4px 0 0;color:var(--text-faint);font-size:9px;line-height:1.45}.merge-panel ul{display:grid;gap:8px;margin:0;padding:12px 14px;border-top:1px solid var(--border);list-style:none}.merge-panel li{display:flex;align-items:center;gap:6px;color:var(--text-faint);font-size:9px}.merge-panel li.passed{color:var(--success)}.merge-button{display:flex;width:calc(100% - 24px);height:35px;align-items:center;justify-content:center;gap:6px;margin:0 12px 12px;border:0;border-radius:7px;background:var(--success);color:white;cursor:pointer;font-size:10px;font-weight:650}.merge-button:disabled{opacity:.5;cursor:not-allowed}.thread.outdated{opacity:.62}.thread header>div{display:flex}.thread header button{height:24px;padding:0 7px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);cursor:pointer;font-size:9px}.thread header button:hover{border-color:var(--brand);color:var(--brand)}
  .changes-layout{display:grid;grid-template-columns:210px minmax(0,1fr);align-items:start;gap:15px}.file-index{position:sticky;top:76px;overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.file-index a{display:flex;min-height:38px;align-items:center;justify-content:space-between;gap:7px;padding:0 9px;border-top:1px solid var(--border-subtle);color:var(--text);font-size:9px;text-decoration:none}.file-index a:first-child{border:0}.file-index a:hover{background:var(--surface-hover)}.file-index a>span{overflow:hidden;text-overflow:ellipsis}.file-index small{display:flex;gap:3px}.file-index b{color:var(--success)}.file-index i{color:var(--danger);font-style:normal}.diffs{display:grid;min-width:0;gap:16px}.diff-card{scroll-margin-top:75px;overflow:hidden;border:1px solid var(--border);border-radius:8px;background:var(--surface)}.diff-card>header{display:flex;align-items:center;gap:8px;min-height:43px;padding:0 11px;border-bottom:1px solid var(--border);background:var(--surface-muted)}.diff-card header strong{overflow:hidden;color:var(--text-strong);font-family:monospace;font-size:10px;text-overflow:ellipsis}.diff-card header>span{padding:2px 5px;border-radius:4px;background:var(--surface);color:var(--text-faint);font-size:8px;text-transform:capitalize}.diff-card header small{display:flex;gap:4px;margin-left:auto}.diff-card header small b{color:var(--success)}.diff-card header small i{color:var(--danger);font-style:normal}.patch{overflow:auto}.patch table{width:100%;border-collapse:collapse}.patch td{padding:0}.patch td:nth-child(1),.patch td:nth-child(2){width:38px;padding:0 6px;border-right:1px solid var(--border-subtle);background:var(--surface-muted);color:var(--text-faint);font-family:monospace;font-size:9px;text-align:right;user-select:none}.patch .add-comment{width:24px}.add-comment button{display:grid;width:20px;height:20px;place-items:center;border:0;border-radius:4px;background:transparent;color:transparent;cursor:pointer}.patch tr:hover .add-comment button{background:var(--brand);color:white}.patch pre{margin:0;padding:0 9px;color:var(--text);font-family:monospace;font-size:9px;line-height:20px;white-space:pre}.patch tr.added td{background:var(--success-soft)}.patch tr.added pre{color:var(--success)}.patch tr.removed td{background:var(--danger-soft)}.patch tr.removed pre{color:var(--danger)}.patch tr.meta td:last-child{background:var(--brand-soft)}.patch tr.meta pre{color:var(--brand)}.draft td{padding:9px!important;background:var(--surface)!important}.draft textarea{width:100%;min-height:64px;padding:7px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);font-size:10px}.draft div{display:flex;justify-content:flex-end;gap:6px;margin-top:6px}.draft button{height:28px;padding:0 8px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);font-size:9px}.draft button:last-child{border-color:var(--brand);background:var(--brand);color:white}
  .checks-page{overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--surface)}.checks-page>header{padding:14px;border-bottom:1px solid var(--border);background:var(--surface-muted)}.checks-page h2{margin:0;color:var(--text-strong);font-size:12px}.checks-page header p{margin:4px 0 0;color:var(--text-faint);font-size:9px}.checks-page article{display:grid;grid-template-columns:32px 1fr auto;align-items:center;gap:10px;min-height:65px;padding:10px 13px;border-top:1px solid var(--border-subtle)}.check-icon{display:grid;width:30px;height:30px;place-items:center;border-radius:7px}.check-icon.success{background:var(--success-soft);color:var(--success)}.check-icon.failure{background:var(--danger-soft);color:var(--danger)}.check-icon.running,.check-icon.queued{background:var(--brand-soft);color:var(--brand)}.checks-page article strong{color:var(--text-strong);font-size:11px}.checks-page article p{margin:3px 0 0;color:var(--text-faint);font-size:9px}.checks-page article>span:last-child{color:var(--text-muted);font-size:9px;text-transform:capitalize}.empty-checks{padding:50px 20px;color:var(--text-faint);text-align:center}.empty-checks strong{display:block;margin-top:9px;color:var(--text-strong);font-size:12px}.empty-checks p{font-size:10px}
  @media(max-width:900px){.conversation-layout{grid-template-columns:1fr}.merge-panel{grid-row:1}.changes-layout{grid-template-columns:1fr}.file-index{position:static;display:flex;overflow-x:auto}.file-index a{min-width:170px;border-top:0;border-left:1px solid var(--border)}}
  @media(max-width:600px){.title-row{display:block}.state{margin-bottom:8px}.title-row h1{font-size:20px}.tabs button{padding:0 8px}.tabs button span{display:none}.patch td:nth-child(1){display:none}.conversation-layout{gap:12px}}
</style>
