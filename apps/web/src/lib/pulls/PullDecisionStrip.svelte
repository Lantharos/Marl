<script lang="ts">
  import type { PullRequestDetail } from '@marl/contracts';
  import { pullDetailSignal } from './pull-signal';

  let { pull } = $props<{ pull: PullRequestDetail }>();
  const signal = $derived(pullDetailSignal(pull));
</script>

<section class="decision {signal.tone}" aria-label="Current pull state">
  <strong><span></span>{signal.label}</strong>
  <dl>
    <div><dt>Review</dt><dd class:pending={pull.mergeRequirements.approvals < pull.mergeRequirements.requiredApprovals}>{pull.mergeRequirements.approvals} / {pull.mergeRequirements.requiredApprovals}</dd></div>
    <div><dt>Checks</dt><dd class:pending={!pull.mergeRequirements.checksPass}>{pull.checkSummary.total ? `${pull.checkSummary.passed} / ${pull.checkSummary.total}` : 'Not required'}</dd></div>
    <div><dt>Conversations</dt><dd class:pending={!pull.mergeRequirements.conversationsPass}>{pull.mergeRequirements.unresolvedConversations ? `${pull.mergeRequirements.unresolvedConversations} open` : 'Clear'}</dd></div>
  </dl>
</section>

<style>
  .decision{display:flex;min-height:40px;align-items:center;justify-content:space-between;gap:24px;margin:0 0 18px}.decision>strong{display:flex;align-items:center;gap:8px;color:var(--text-strong);font-size:13px;font-weight:670}.decision>strong span{width:7px;height:7px;border-radius:50%;background:var(--brand)}.decision.attention>strong span{background:var(--danger)}.decision.ready>strong span,.decision.complete>strong span{background:var(--success)}dl{display:flex;align-items:center;gap:20px;margin:0}dl>div{display:flex;align-items:baseline;gap:6px}dt{color:var(--text-faint);font-size:11px}dd{margin:0;color:var(--text-muted);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}dd.pending{color:var(--text-strong)}
  @media(max-width:700px){.decision{align-items:flex-start;flex-direction:column;gap:12px;margin-bottom:18px}dl{width:100%;justify-content:space-between;gap:12px}dl>div{align-items:flex-start;flex-direction:column;gap:3px}}
</style>
