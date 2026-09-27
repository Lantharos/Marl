import type { ReportSubjectType } from '@marl/contracts';

export type ReportTarget = { type: ReportSubjectType; id: string; label: string };

class Reporting {
  target = $state<ReportTarget | null>(null);

  open = (target: ReportTarget) => {
    this.target = target;
  };

  close = () => {
    this.target = null;
  };
}

export const reporting = new Reporting();
