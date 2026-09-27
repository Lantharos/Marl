import { uptime, type DayBucket, type History } from './history';
import type { Incident } from './incidents';
import { components, type ComponentId } from './probes';

const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const dateFormat = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const timeFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short'
});

const statusLabels: Record<Incident['status'], string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved'
};

function dayTone(day: DayBucket | undefined) {
  if (!day?.checks) return 'empty';
  const ratio = (day.checks - day.failures) / day.checks;
  return ratio === 1 ? 'up' : ratio >= 0.95 ? 'partial' : 'down';
}

function bars(days: DayBucket[], now: Date) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return Array.from({ length: 90 }, (_, index) => {
    const date = new Date(now.getTime() - (89 - index) * 86_400_000).toISOString().slice(0, 10);
    const day = byDate.get(date);
    const label = day?.checks
      ? `${dateFormat.format(new Date(date))}: ${(((day.checks - day.failures) / day.checks) * 100).toFixed(2)}% available`
      : `${dateFormat.format(new Date(date))}: no data`;
    return `<span class="bar ${dayTone(day)}" title="${escape(label)}"></span>`;
  }).join('');
}

function incidentBlock(incident: Incident) {
  return `<article class="incident"><header><h3>${escape(incident.title)}</h3><span class="state ${incident.status}">${statusLabels[incident.status]}</span></header><p class="when">${timeFormat.format(new Date(incident.started))}${incident.resolved ? ` – ${timeFormat.format(new Date(incident.resolved))}` : ''}</p>${incident.updates.map((update) => `<p>${escape(update)}</p>`).join('')}</article>`;
}

export function renderPage(history: History, incidents: Incident[], now = new Date()) {
  const active = incidents.filter((incident) => incident.status !== 'resolved');
  const down = components.filter((component) => history.components[component.id].last?.ok === false);
  const affected = new Set<ComponentId>([
    ...down.map((component) => component.id),
    ...active.flatMap((incident) => incident.components)
  ]);
  const overall =
    down.length >= 2
      ? { tone: 'down', text: 'Marl is having a major outage' }
      : down.length || active.length
        ? { tone: 'partial', text: 'Some parts of Marl are degraded' }
        : { tone: 'up', text: 'Everything is working' };
  const recent = incidents.filter(
    (incident) =>
      incident.status === 'resolved' && now.getTime() - new Date(incident.started).getTime() < 90 * 86_400_000
  );
  const rows = components
    .map((component) => {
      const record = history.components[component.id];
      const ratio = uptime(record.days);
      const today = record.days.find((day) => day.date === now.toISOString().slice(0, 10));
      const latency = today?.checks ? Math.round(today.latencyTotal / today.checks) : null;
      const state =
        record.last?.ok === false
          ? 'Down'
          : affected.has(component.id)
            ? 'Degraded'
            : record.last
              ? 'Working'
              : 'Waiting for data';
      return `<section class="component"><header><div><h2>${escape(component.name)}</h2><p>${escape(component.description)}</p></div><span class="state ${state === 'Working' ? 'up' : state === 'Down' ? 'down' : state === 'Degraded' ? 'partial' : ''}">${state}</span></header><div class="bars" role="img" aria-label="${escape(component.name)} availability over 90 days">${bars(record.days, now)}</div><footer><span>90 days ago</span><span>${ratio === null ? '' : `${(ratio * 100).toFixed(2)}% available${latency === null ? '' : ` · ${latency} ms today`}`}</span><span>Today</span></footer></section>`;
    })
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="300">
<title>Marl status</title>
<meta name="description" content="Live availability of Marl's website, API, and Git hosting.">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="style.css">
</head>
<body>
<main>
<header class="top"><a class="brand" href="https://marl.sh">marl<span></span></a><span>Status</span></header>
<section class="overall ${overall.tone}"><h1>${overall.text}</h1><p>Checked ${timeFormat.format(new Date(history.updatedAt))} from outside Marl’s own infrastructure.</p></section>
${active.length ? `<section class="incidents"><h2 class="section">Ongoing</h2>${active.map(incidentBlock).join('')}</section>` : ''}
<div class="components">${rows}</div>
<section class="incidents"><h2 class="section">Past incidents</h2>${recent.length ? recent.map(incidentBlock).join('') : '<p class="quiet">No incidents in the last 90 days.</p>'}</section>
</main>
<footer class="bottom"><a href="https://marl.sh">marl.sh</a><span>Availability is checked every 10 minutes.</span></footer>
</body>
</html>
`;
}
