import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { emailFor } from './accounts';
import type { Member } from './people';
import { run } from '../qualification/process';

export class Checkout {
  constructor(
    readonly directory: string,
    readonly remote: string
  ) {}

  static async create(directory: string, remote: string) {
    await mkdir(directory, { recursive: true });
    await run(['git', 'init', '--quiet', '--initial-branch=main'], { cwd: directory });
    return new Checkout(directory, remote);
  }

  async switch(branch: string, base: string) {
    await run(['git', 'switch', '--quiet', '-C', branch, base], { cwd: this.directory });
  }

  async commit(author: Member, message: string, files: Record<string, string>, daysAgo: number) {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(this.directory, path)), { recursive: true });
      await Bun.write(join(this.directory, path), content);
    }
    await run(['git', 'add', '--all'], { cwd: this.directory });
    const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    await run(['git', 'commit', '--quiet', '-m', message], {
      cwd: this.directory,
      env: {
        GIT_AUTHOR_NAME: author.person.name,
        GIT_AUTHOR_EMAIL: emailFor(author.person),
        GIT_COMMITTER_NAME: author.person.name,
        GIT_COMMITTER_EMAIL: emailFor(author.person),
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date
      }
    });
  }

  async push(member: Member, branch: string) {
    await member.client.git(
      ['push', '--quiet', '--force', this.remote, `${branch}:refs/heads/${branch}`],
      member.token,
      {
        cwd: this.directory
      }
    );
  }

  async head() {
    return (await run(['git', 'rev-parse', 'HEAD'], { cwd: this.directory })).stdout.trim();
  }
}
