<script lang="ts">
  import BrandMark from '../BrandMark.svelte';
  let { title, description, children, footer }: { title: string; description: string; children: import('svelte').Snippet; footer?: import('svelte').Snippet } = $props();
</script>

<main class="auth-page">
  <section>
    <a class="brand" href="/" aria-label="Marl"><BrandMark /></a>
    <header><h1>{title}</h1><p>{description}</p></header>
    {@render children()}
    {#if footer}<footer>{@render footer()}</footer>{/if}
  </section>
</main>

<style>
  .auth-page{display:grid;min-height:calc(100vh / var(--interface-scale));place-items:center;padding:32px 18px;background:var(--canvas)}section{width:min(368px,100%)}.brand{display:inline-flex;margin-bottom:32px;color:inherit;text-decoration:none}header{margin-bottom:23px}h1{margin:0;color:var(--text-strong);font-size:25px;font-weight:680;letter-spacing:-.035em}p{margin:7px 0 0;color:var(--text-muted);font-size:11px;line-height:1.55}footer{margin-top:20px;color:var(--text-muted);font-size:10px;text-align:center}:global(.auth-form){display:grid;gap:14px}:global(.auth-field){display:grid;gap:6px}:global(.auth-field span){color:var(--text-strong);font-size:10px;font-weight:630}:global(.auth-field input){height:39px;padding:0 10px;border:1px solid var(--border-strong);border-radius:6px;outline:0;background:var(--surface);color:var(--text-strong);font-size:12px}:global(.auth-field input:focus){border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}:global(.auth-submit){display:flex;width:100%;height:39px;align-items:center;justify-content:center;border:1px solid var(--brand);border-radius:6px;background:var(--brand);color:white;font-size:11px;font-weight:650;text-decoration:none}:global(.auth-submit:hover){background:var(--brand-hover)}:global(.auth-divider){display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;color:var(--text-faint);font-size:9px}:global(.auth-divider)::before,:global(.auth-divider)::after{height:1px;background:var(--border-subtle);content:''}:global(.auth-error){margin:0;padding:9px 10px;border-radius:6px;background:var(--danger-soft);color:var(--danger);font-size:10px;line-height:1.45}:global(.auth-link){color:var(--brand-strong);font-weight:620;text-decoration:none}:global(.auth-link:hover){text-decoration:underline}
</style>
