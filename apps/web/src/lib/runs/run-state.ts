import type { RunSummary } from '@marl/contracts';

type RunStatus = Pick<RunSummary, 'state' | 'approvalRequired' | 'cancellationReason'>;

export function awaitingCheckApproval(run: RunStatus): boolean {
  return run.state === 'queued' && run.approvalRequired;
}

export function runStateLabel(run: RunStatus): string {
  if (awaitingCheckApproval(run)) return 'Awaiting approval';
  return run.cancellationReason === 'superseded' ? 'Superseded' : run.state;
}
