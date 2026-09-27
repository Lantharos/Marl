import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ComponentId } from './probes';

export type Incident = {
  slug: string;
  title: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  components: ComponentId[];
  started: string;
  resolved: string | null;
  updates: string[];
};

export function parseIncident(slug: string, source: string): Incident {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`${slug} is missing its front matter.`);
  const fields = Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => line.split(/:(.*)/s).map((part) => part.trim()))
      .filter(([key, value]) => key && value)
  );
  if (!fields.title || !fields.status || !fields.started)
    throw new Error(`${slug} needs a title, status, and start time.`);
  return {
    slug,
    title: fields.title,
    status: fields.status as Incident['status'],
    components: (fields.components ?? '')
      .split(',')
      .map((part: string) => part.trim())
      .filter(Boolean) as ComponentId[],
    started: fields.started,
    resolved: fields.resolved ?? null,
    updates: match[2]
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
  };
}

export async function loadIncidents(directory: string) {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.md'));
  const incidents = await Promise.all(
    files.map(async (file) => parseIncident(file.replace(/\.md$/, ''), await Bun.file(join(directory, file)).text()))
  );
  return incidents.toSorted((left, right) => right.started.localeCompare(left.started));
}
