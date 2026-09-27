import type { RunSummary } from './ci';
import type { RepositorySummary } from './repositories';

export type InboxItemKind = 'issue' | 'pull' | 'run';

export type InboxReason = 'mention' | 'assignment' | 'authored' | 'participating' | 'failure';

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  reason: InboxReason;
  repository: Pick<RepositorySummary, 'owner' | 'name'>;
  number: number;
  title: string;
  state: string;
  href: string;
  updatedAt: string;
  unread: boolean;
  done: boolean;
}

export interface InboxPage {
  items: InboxItem[];
  nextCursor: string | null;
  counts: { inbox: number; unread: number; done: number };
}

export type OnboardingStep = 'repository' | 'push' | 'teammate' | 'pull' | 'runner';

export interface OnboardingProgress {
  id: OnboardingStep;
  done: boolean;
}

export interface DashboardData {
  inbox: Pick<InboxPage, 'items' | 'counts'>;
  onboarding: OnboardingProgress[] | null;
  runs: RunSummary[];
}

export type EmailNotificationMode = 'immediate' | 'daily' | 'off';
export type RepositoryNotificationLevel = 'all' | 'mentions' | 'ignore';

export interface NotificationPreferences {
  email: string | null;
  mode: EmailNotificationMode;
  reasons: InboxReason[];
  repositories: Array<{ owner: string; name: string; level: Exclude<RepositoryNotificationLevel, 'all'> }>;
}
