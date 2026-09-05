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
  .auth-page{display:grid;min-height:calc(100dvh / var(--interface-scale));place-items:center;padding:48px 20px;background:var(--canvas)}
  section{width:min(420px,100%);padding:28px;border-radius:16px;background:var(--surface);box-shadow:var(--shadow-surface)}
  .brand{display:inline-flex;margin-bottom:32px;color:inherit;text-decoration:none}
  header{margin-bottom:28px}
  h1{margin:0;color:var(--text-strong);font-size:28px;font-weight:660;letter-spacing:-.035em}
  p{margin:9px 0 0;color:var(--text-muted);font-size:13px;line-height:1.6}
  footer{margin-top:24px;color:var(--text-muted);font-size:12px;text-align:center}
  :global(.auth-form){display:grid;gap:20px}
  :global(.auth-field){display:grid;gap:8px}
  :global(.auth-field span){color:var(--text-strong);font-size:12px;font-weight:600}
  :global(.auth-field input){min-width:0;height:44px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--canvas);color:var(--text-strong);font-size:14px}
  :global(.auth-field input:focus){border-color:var(--brand)}
  :global(.auth-submit){display:flex;width:100%;min-height:44px;align-items:center;justify-content:center;border:0;border-radius:8px;background:var(--brand);color:var(--on-brand);font-size:13px;font-weight:650;text-decoration:none}
  :global(.auth-submit:hover){background:var(--brand-hover)}
  :global(.auth-divider){display:flex;justify-content:center;color:var(--text-faint);font-size:11px}
  :global(.auth-error){margin:0;padding:12px;border-radius:8px;background:var(--danger-soft);color:var(--danger);font-size:12px;line-height:1.55}
  :global(.auth-link){color:var(--brand-strong);font-weight:600;text-decoration:none}
  :global(.auth-link:hover){text-decoration:underline}
  @media(max-width:480px){.auth-page{padding:28px 14px}section{padding:24px 20px}}
</style>
