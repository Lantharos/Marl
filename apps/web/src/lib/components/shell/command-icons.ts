import BookOpen from '@lucide/svelte/icons/book-open';
import Building2 from '@lucide/svelte/icons/building-complex';
import CircleDot from '@lucide/svelte/icons/circle-dot';
import CirclePlay from '@lucide/svelte/icons/circle-play';
import FileCode from '@lucide/svelte/icons/file-code-corner';
import GitBranch from '@lucide/svelte/icons/git-branch';
import GitCommit from '@lucide/svelte/icons/git-commit-horizontal';
import GitPullRequest from '@lucide/svelte/icons/git-pull-request';
import Home from '@lucide/svelte/icons/house';
import Inbox from '@lucide/svelte/icons/inbox';
import KeyRound from '@lucide/svelte/icons/key-round';
import Plus from '@lucide/svelte/icons/plus';
import Server from '@lucide/svelte/icons/server';
import Settings from '@lucide/svelte/icons/settings';
import ShieldCheck from '@lucide/svelte/icons/shield-check';
import UserRound from '@lucide/svelte/icons/user-round';
import type { CommandKind } from './commands';

export const commandIcons = {
  home: Home,
  inbox: Inbox,
  repository: BookOpen,
  organization: Building2,
  user: UserRound,
  commit: GitCommit,
  file: FileCode,
  issue: CircleDot,
  pull: GitPullRequest,
  run: CirclePlay,
  runner: Server,
  create: Plus,
  settings: Settings,
  security: ShieldCheck,
  branch: GitBranch,
  key: KeyRound
} satisfies Record<CommandKind, unknown>;
