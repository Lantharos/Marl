<script lang="ts">
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';

  let { href, label }: { href: string; label: string } = $props();
</script>

<a {href}><ArrowLeft size={13} strokeWidth={1.8} /><span>{label}</span></a>

<style>
  a{display:inline-flex;align-items:center;gap:6px;color:var(--text-faint);font-size:10px;text-decoration:none}
  a:hover{color:var(--brand)}
</style>
