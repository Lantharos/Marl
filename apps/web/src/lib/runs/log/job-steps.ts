import type { RunJob, RunState } from '@marl/contracts';
import { instant } from '../duration';
import type { LogBuffer } from './log-buffer.svelte';

export type StepState = RunState | 'skipped' | 'warning';

export type JobStep = {
  key: string;
  name: string;
  state: StepState;
  from: number;
  to: number;
  startedAt: number | null;
  endedAt: number | null;
};

function lastStepState(job: RunJob, continued: boolean): StepState {
  if (job.state === 'success') return continued ? 'warning' : 'success';
  if (job.state === 'queued') return 'running';
  return job.state;
}

export function jobSteps(buffer: LogBuffer, job: RunJob): JobStep[] {
  const sections = buffer.sections;
  const steps: JobStep[] = sections.map((section, index) => {
    const last = index === sections.length - 1;
    const from = section.header + 1;
    let to = buffer.sectionEnd(index);
    while (to > from && buffer.line(to - 1) === '') to--;
    return {
      key: index ? `step-${index}` : 'setup',
      name: section.name ?? 'Set up job',
      state: section.timedOut
        ? 'failure'
        : last
          ? lastStepState(job, section.continued)
          : section.continued
            ? 'warning'
            : 'success',
      from,
      to,
      startedAt: section.startedAt ?? (index ? null : instant(job.startedAt)),
      endedAt: sections[index + 1]?.startedAt ?? (last ? instant(job.completedAt) : null)
    };
  });
  if (steps[0].to === 0 && (steps.length > 1 || !buffer.count)) steps.shift();
  const active = job.state === 'queued' || job.state === 'running';
  const pending = job.steps.slice(sections.length - 1).map((name, index) => ({
    key: `step-${sections.length + index}`,
    name,
    state: (active ? 'queued' : 'skipped') as StepState,
    from: 0,
    to: 0,
    startedAt: null,
    endedAt: null
  }));
  return [...steps, ...pending];
}
