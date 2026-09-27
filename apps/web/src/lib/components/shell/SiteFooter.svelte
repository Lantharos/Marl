<script lang="ts">
  import { legalDocuments } from '$lib/legal/documents';

  const links = [
    ...Object.entries(legalDocuments).map(([slug, document]) => ({ href: `/legal/${slug}`, label: document.label })),
    { href: 'https://status.marl.sh', label: 'Status' }
  ];
</script>

<footer
  class="mx-auto flex w-[min(1240px,calc(100%-32px))] flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line-subtle py-6 text-xs text-ink-faint sm:w-[min(1240px,calc(100%-48px))]"
>
  <span>© {new Date().getFullYear()} Lantharos</span>
  <nav aria-label="Policies" class="flex flex-wrap gap-x-5 gap-y-1">
    {#each links as link (link.href)}<a
        class="py-1 text-ink-muted transition-colors hover:text-ink-strong"
        href={link.href}>{link.label}</a
      >{/each}
  </nav>
</footer>
