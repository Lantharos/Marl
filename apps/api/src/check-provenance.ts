export type CheckProducer = { workflowId: string; jobKey: string };
export type RequiredCheck = CheckProducer & { name: string };
export type CheckState = CheckProducer & { name: string; state: string };

export function workflowCheckName(workflow: string, job: string) {
  return `${workflow} / ${job}`.slice(0, 240);
}

export function checkProducerKey(check: CheckProducer) {
  return `${check.workflowId}\0${check.jobKey}`;
}
