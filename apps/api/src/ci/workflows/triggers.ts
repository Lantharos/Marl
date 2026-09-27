function branchMatches(patterns: unknown, branch: string): boolean {
  const values = typeof patterns === 'string' ? [patterns] : patterns;
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) return false;
  return values.some((pattern: string) => {
    const expression = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`).test(branch);
  });
}

export function workflowTriggeredBy(value: unknown, trigger: 'push' | 'pull_request', branch: string): boolean {
  if (typeof value === 'string') return value === trigger;
  if (Array.isArray(value)) return value.includes(trigger);
  if (!value || typeof value !== 'object') return false;
  const config = (value as Record<string, unknown>)[trigger];
  if (config === null || config === true) return true;
  if (!config || typeof config !== 'object') return false;
  const rules = config as Record<string, unknown>;
  return (rules.branches === undefined || branchMatches(rules.branches, branch)) && (rules['branches-ignore'] === undefined || !branchMatches(rules['branches-ignore'], branch));
}
