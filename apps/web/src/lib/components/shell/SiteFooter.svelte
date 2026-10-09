<script lang="ts">
  import { legalDocuments } from '#lib/legal/documents.js';

  let { width = 'page-frame' }: { width?: string } = $props();

  const links = [
    { href: '/lantharos/marl', label: 'Source' },
    ...Object.entries(legalDocuments).map(([slug, document]) => ({ href: `/legal/${slug}`, label: document.label })),
    { href: 'https://status.marl.sh', label: 'Status' }
  ];
  const year = new Date().getFullYear();
</script>

<footer class={['mx-auto', width]}>
  <div
    class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line-subtle py-6 text-xs text-ink-faint"
  >
    <span>© {year} Lantharos</span>
    <nav aria-label="Footer" class="flex flex-wrap gap-x-5 gap-y-1">
      {#each links as link (link.href)}<a
          class="py-1 text-ink-muted transition-colors hover:text-ink-strong"
          href={link.href}>{link.label}</a
        >{/each}
    </nav>
  </div>
</footer>
