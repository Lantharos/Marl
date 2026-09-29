import type { MarlClient } from '../../qualification/client';
import { execute, quote } from '../database';
import { Checkout } from '../git';
import type { Member } from '../people';
import * as project from '../project/base';

export type Team = { you: Member; mira: Member; theo: Member; jun: Member; sam: Member };
export const organization = 'lumen';
export const repository = `/api/v1/repositories/${organization}/lumen`;

export async function createOrganization(team: Team) {
  await team.you.client.request('/api/v1/organizations', {
    method: 'POST',
    body: JSON.stringify({ slug: organization, name: 'Lumen', baseRepositoryRole: 'write' })
  });
  const members = [team.mira, team.theo, team.jun, team.sam];
  await execute(
    members.map(
      (member, index) =>
        `INSERT INTO organization_members (organization_id,user_id,role) SELECT id,${quote(member.id)},${quote(index === 0 ? 'admin' : 'member')} FROM organizations WHERE slug=${quote(organization)}`
    )
  );
}

export async function createRepository(
  client: MarlClient,
  owner: string,
  name: string,
  description: string,
  visibility = 'public'
) {
  const { repository } = await client.request<{ repository: { id: string } }>('/api/v1/repositories', {
    method: 'POST',
    body: JSON.stringify({ owner, name, description, visibility })
  });
  return repository.id;
}

export async function writeHistory(team: Team, checkout: Checkout) {
  const { you, mira, jun, sam, theo } = team;
  await checkout.commit(
    you,
    'Start Lumen with hex and rgb() parsing',
    {
      'package.json': project.packageJson.replace('0.2.0', '0.1.0'),
      'src/color/types.ts': project.types,
      'src/color/parse.ts': project.parse,
      LICENSE: project.license
    },
    41
  );
  await checkout.commit(mira, 'Convert between sRGB and OKLCH', { 'src/color/convert.ts': project.convert }, 38);
  await checkout.commit(
    jun,
    'Measure WCAG 2.2 contrast ratios',
    { 'src/contrast.ts': project.contrast, 'test/contrast.test.ts': project.contrastTest },
    35
  );
  await checkout.commit(mira, 'Generate tonal palettes in OKLCH', { 'src/palette.ts': project.palette }, 32);
  await checkout.commit(
    sam,
    'Write the README and theming guide',
    { 'README.md': project.readme, 'docs/theming.md': project.theming },
    30
  );
  await checkout.commit(
    theo,
    'Run type checks and tests on every push',
    { '.marl/workflows/verify.yml': project.workflow, '.marl/pull_template.md': project.pullTemplate },
    28
  );
  await checkout.commit(
    you,
    'Prepare the 0.2.0 release',
    { 'src/index.ts': project.index, 'CHANGELOG.md': project.changelog, 'package.json': project.packageJson },
    27
  );
  await checkout.push(you, 'main');
}

export async function publishRelease(member: Member, tag: string, name: string, body: string, prerelease = false) {
  const { release } = await member.client.request<{ release: { id: string } }>(`${repository}/releases`, {
    method: 'POST',
    body: JSON.stringify({ tagName: tag, target: 'main', name, body, prerelease, makeLatest: !prerelease })
  });
  const archive = new TextEncoder().encode(`Lumen ${tag} package contents\n`.repeat(400));
  const { upload } = await member.client.request<{ upload: { id: string } }>(
    `${repository}/releases/${release.id}/asset-uploads`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: `lumen-color-${tag.slice(1)}.tgz`,
        byteSize: archive.byteLength,
        contentType: 'application/gzip'
      })
    }
  );
  await member.client.response(`/api/v1/release-asset-uploads/${upload.id}/parts/1`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(archive.byteLength) },
    body: archive
  });
  await member.client.request(`/api/v1/release-asset-uploads/${upload.id}/complete`, { method: 'POST' });
}

export async function writeSideProjects(team: Team, root: string, gitUrl: string) {
  await createRepository(team.you.client, organization, 'website', 'The Lumen documentation site', 'private');
  const website = await Checkout.create(`${root}/website`, `${gitUrl}/${organization}/website.git`);
  await website.commit(
    team.sam,
    'Scaffold the documentation site',
    {
      'README.md': '# lumen.dev\n\nThe documentation site for Lumen, built from the `docs/` folder.\n',
      'src/pages/index.md': '# Accessible color, by default\n\nLumen builds palettes that pass contrast checks.\n'
    },
    25
  );
  await website.push(team.you, 'main');
  await createRepository(team.you.client, team.you.person.handle, 'dotfiles', 'Shell, editor, and terminal settings');
  const dotfiles = await Checkout.create(`${root}/dotfiles`, `${gitUrl}/${team.you.person.handle}/dotfiles.git`);
  await dotfiles.commit(
    team.you,
    'Add shell and editor settings',
    {
      'README.md': '# dotfiles\n\nPersonal settings for zsh, Helix, and Ghostty.\n',
      '.zshrc': 'export EDITOR=hx\nalias gs="git status --short"\n',
      'helix/config.toml': 'theme = "ayu_dark"\n\n[editor]\nline-number = "relative"\n'
    },
    20
  );
  await dotfiles.push(team.you, 'main');
}
