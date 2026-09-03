<script lang="ts">
  import type { PullRequestDetail } from '@marl/contracts';
  import Check from 'lucide-svelte/icons/check';
  import CircleAlert from 'lucide-svelte/icons/circle-alert';
  import Clock3 from 'lucide-svelte/icons/clock-3';
  import GitMerge from 'lucide-svelte/icons/git-merge';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import ShieldCheck from 'lucide-svelte/icons/shield-check';
  import { pullDetailSignal } from './pull-signal';

  let { pull, viewerHandle } = $props<{ pull: PullRequestDetail; viewerHandle?: string }>();
  const signal = $derived(pullDetailSignal(pull, viewerHandle));
  const approvalsPass = $derived(pull.mergeRequirements.approvals >= pull.mergeRequirements.requiredApprovals);
</script>

<section class="decision {signal.tone}" aria-label="Current pull state">
  <div class="current-move">
    <span>{#if signal.tone === 'ready' || signal.tone === 'complete'}<GitMerge size={18} />{:else if signal.tone === 'attention'}<CircleAlert size={18} />{:else}<Clock3 size={18} />{/if}</span>
    <div><small>Current move</small><strong>{signal.label}</strong><p>{signal.detail}</p></div>
  </div>
  <div class="requirements">
    <div class:passed={approvalsPass}><span>{#if approvalsPass}<Check size={13} />{:else}<ShieldCheck size={13} />{/if}</span><p><strong>Review</strong><small>{pull.mergeRequirements.approvals}/{pull.mergeRequirements.requiredApprovals} approvals</small></p></div>
    <div class:passed={pull.mergeRequirements.checksPass}><span>{#if pull.mergeRequirements.checksPass}<Check size={13} />{:else}<Clock3 size={13} />{/if}</span><p><strong>Checks</strong><small>{pull.checkSummary.total ? `${pull.checkSummary.passed}/${pull.checkSummary.total} passing` : 'None required'}</small></p></div>
    <div class:passed={pull.mergeRequirements.conversationsPass}><span>{#if pull.mergeRequirements.conversationsPass}<Check size={13} />{:else}<MessageSquare size={13} />{/if}</span><p><strong>Conversations</strong><small>{pull.mergeRequirements.unresolvedConversations ? `${pull.mergeRequirements.unresolvedConversations} open` : 'Resolved'}</small></p></div>
  </div>
</section>

{#if pull.mergeRequirements.reasons.length && pull.state !== 'merged' && pull.state !== 'closed'}
  <div class="reasons" aria-label="Remaining requirements">
    {#each pull.mergeRequirements.reasons as reason (reason)}<span><CircleAlert size={11} />{reason}</span>{/each}
  </div>
{/if}

<style>
  .decision{display:grid;grid-template-columns:minmax(240px,1fr) minmax(420px,1.25fr);align-items:center;gap:28px;margin:4px 0 26px}.current-move{display:grid;grid-template-columns:38px minmax(0,1fr);align-items:center;gap:11px;padding:8px 4px}.current-move>span{display:grid;width:36px;height:36px;place-items:center;border-radius:9px;background:var(--brand-soft);color:var(--brand)}.decision.attention .current-move>span{background:var(--danger-soft);color:var(--danger)}.decision.ready .current-move>span,.decision.complete .current-move>span{background:var(--success-soft);color:var(--success)}.current-move small,.current-move strong,.current-move p{display:block}.current-move small{color:var(--text-faint);font-size:8px}.current-move strong{margin-top:2px;color:var(--text-strong);font-size:13px;font-weight:670;letter-spacing:-.01em}.current-move p{margin:3px 0 0;color:var(--text-muted);font-size:9px}.requirements{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.requirements>div{display:flex;align-items:center;gap:8px;padding:8px 0}.requirements>div>span{display:grid;width:22px;height:22px;flex:none;place-items:center;border-radius:50%;background:var(--surface-muted);color:var(--text-faint)}.requirements>div.passed>span{background:var(--success-soft);color:var(--success)}.requirements p{margin:0}.requirements strong,.requirements small{display:block}.requirements strong{color:var(--text-strong);font-size:9px;font-weight:640}.requirements small{margin-top:2px;color:var(--text-faint);font-size:8px;white-space:nowrap}.reasons{display:flex;flex-wrap:wrap;gap:6px;margin:-13px 0 20px 53px}.reasons span{display:inline-flex;align-items:center;gap:4px;color:var(--danger);font-size:8px}
  @media(max-width:840px){.decision{grid-template-columns:1fr;gap:5px}.current-move{padding-left:0}}@media(max-width:560px){.requirements{grid-template-columns:1fr;gap:2px}.reasons{margin-left:0}}
</style>
