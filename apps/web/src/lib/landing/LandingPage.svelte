<script lang="ts">
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import { keyboardScroll } from '$lib/actions/keyboard-scroll';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import Seo from '$lib/components/Seo.svelte';
  import LandingArtwork from './LandingArtwork.svelte';
  import LandingReview from './LandingReview.svelte';

  const description = 'Marl is a code hosting platform for Git repositories, issues, pulls, releases, and CI on self-hosted runners.';
</script>

<Seo
  title="Marl — Git hosting, code review, and self-hosted CI"
  {description}
  path="/"
  socialTitle="Marl — A better place to work on code"
  socialDescription="Host Git repositories, review code, track issues, publish releases, and run CI on your own machines."
  jsonLd={{
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': 'https://marl.sh/#website',
        name: 'Marl',
        url: 'https://marl.sh/'
      },
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://marl.sh/#software',
        name: 'Marl',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        url: 'https://marl.sh/',
        description,
        codeRepository: 'https://marl.sh/lantharos/marl',
        license: 'https://marl.sh/lantharos/marl/blob/master/LICENSE'
      }
    ]
  }}
/>

<div class="landing">
  <a class="skip-link" href="#main-content">Skip to content</a>

  <header class="landing-nav">
    <a class="brand-link" href="/" aria-label="Marl home"><BrandMark /></a>
    <LinkButton href="/sign-in">Sign in</LinkButton>
  </header>

  <main id="main-content" tabindex="-1">
    <section class="hero">
      <div class="hero-content">
        <div class="hero-copy">
          <h1>We wanted somewhere better to work on code. <span>So we built Marl.</span></h1>
          <div class="hero-actions">
            <LinkButton variant="primary" size="large" href="/sign-up">Create an account <ArrowRight size={15} /></LinkButton>
            <a class="text-action" href="/lantharos/marl">Read Marl’s source</a>
          </div>
        </div>
      </div>
      <div class="hero-art"><LandingArtwork scene="landscape" sizes="100vw" eager /></div>
    </section>

    <section class="uptime" id="uptime" aria-labelledby="uptime-title">
      <h2 id="uptime-title">We got tired of asking if GitHub was down again.</h2>
      <div class="uptime-copy">
        <p>On August 17, 2026, <a href="https://github.blog/news-insights/company-news/the-august-17-outage-and-the-work-ahead/" target="_blank" rel="noreferrer">a GitHub outage lasted 7 hours and 47 minutes</a>, disrupting code, reviews, Actions, and authentication.</p>
        <p>A code host should not be the reason a review stalls, a push fails, or a release waits. Somehow that became a lot to ask.</p>
      </div>
    </section>

    <section class="git-section" aria-labelledby="git-title">
      <div class="git-copy">
        <h2 id="git-title">You already know how to use Marl.</h2>
        <p>Clone over HTTPS or SSH. Branch, commit, push. The Git habits and tools you already have come with you.</p>
      </div>
      <div class="terminal">
        <div class="terminal-body" role="region" aria-label="Git clone and push example" {@attach keyboardScroll}>
          <p><i>$</i><code>git clone ssh://git@ssh.marl.sh/lantharos/marl.git</code></p>
          <p class="response">Cloning into 'marl'... done.</p>
          <p class="command"><i>$</i><code>cd marl && git switch -c share-search</code></p>
          <p class="command"><i>$</i><code>git push -u origin share-search</code></p>
          <p class="response success">[new branch] share-search -&gt; share-search</p>
        </div>
      </div>
    </section>

    <section class="open-section" aria-labelledby="open-title">
      <div class="open-art"><LandingArtwork scene="courtyard" sizes="(max-width: 900px) 90vw, 48vw" /></div>
      <div class="open-copy">
        <h2 id="open-title">Write it however you want.</h2>
        <p><a href="https://codeberg.org/Codeberg/org/src/branch/main/TermsOfUse.md" target="_blank" rel="noreferrer">Codeberg’s terms</a> reject projects that mostly consist of code written by generative AI. Marl does not.</p>
        <p>Write every line yourself, use AI where it helps, or let an agent take the first pass. If you’re making software, you’re welcome here.</p>
      </div>
    </section>

    <section class="review-section" id="review" aria-labelledby="review-title">
      <h2 id="review-title">Pulls, revision by revision.</h2>
      <LandingReview />
    </section>

    <section class="closing">
      <div>
        <h2>Put your next repository here.</h2>
      </div>
      <div class="closing-actions">
        <LinkButton variant="primary" size="large" href="/sign-up">Create an account <ArrowRight size={15} /></LinkButton>
        <a class="text-action" href="/lantharos/marl">Read Marl’s source</a>
      </div>
    </section>
  </main>

  <footer>
    <div><BrandMark compact /><p>Marl is built by Lantharos.</p></div>
    <nav aria-label="Footer">
      <a href="/lantharos/marl">Source</a>
      <a href="/lantharos/marl/blob/master/LICENSE">AGPL-3.0-or-later</a>
      <a href="/sign-in">Sign in</a>
    </nav>
    <small>© 2026 Lantharos</small>
  </footer>
  <div class="closing-art"><LandingArtwork scene="inlay" sizes="100vw" /></div>
</div>

<style>
  .landing{min-height:100dvh;overflow:clip;background:var(--canvas);color:var(--text)}
  .skip-link{position:fixed;top:8px;left:8px;z-index:1000;padding:10px 14px;border-radius:8px;background:var(--text-strong);color:var(--canvas);font-weight:600;text-decoration:none;transform:translateY(-150%)}
  .skip-link:focus{transform:none}
  .landing-nav,.hero-content,.uptime,.git-section,.open-section,.review-section,.closing,.landing>footer{width:min(1320px,calc(100% - 48px));margin:0 auto}
  .landing-nav{display:flex;align-items:center;justify-content:space-between;height:64px}
  .brand-link{display:flex;min-height:44px;align-items:center;color:inherit;text-decoration:none}
  .text-action{display:inline-flex;min-height:44px;align-items:center;gap:7px;color:var(--text-strong);font-size:13px;font-weight:600;text-decoration:none}
  .text-action:hover{color:var(--brand)}
  .hero{position:relative;isolation:isolate;display:flex;min-height:calc(100svh / var(--interface-scale) - 64px);align-items:flex-end;padding:48px 0 calc(17svh / var(--interface-scale));overflow:clip}
  .hero-content{position:relative;z-index:1}
  .hero-copy{width:min(720px,60%)}
  .hero h1{margin:0;color:var(--text-strong);font-size:clamp(36px,min(5.4vw,8svh),76px);font-weight:600;letter-spacing:-.06em;line-height:.98;text-wrap:balance}
  .hero h1 span{display:block;margin-top:20px;color:var(--brand-strong)}
  .hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;margin-top:36px}
  .hero-art{position:absolute;z-index:-1;inset:0}
  .hero-art :global(.artwork){position:relative;height:100%;aspect-ratio:auto}
  .hero-art :global(img){position:absolute;right:0;bottom:-9%;width:auto;min-width:100%;max-width:none;height:110%;object-fit:cover;object-position:right bottom}
  section[id]{scroll-margin-top:48px}
  h2{margin:0;color:var(--text-strong);font-size:clamp(48px,6.4vw,88px);font-weight:600;letter-spacing:-.06em;line-height:.96;text-wrap:balance}
  .uptime{padding:144px 0 112px}
  .uptime h2{max-width:1100px}
  .uptime-copy{display:grid;width:min(780px,76%);grid-template-columns:1fr 1fr;gap:48px;margin:48px 0 0 auto}
  .uptime-copy p,.open-copy p{margin:0;color:var(--text-muted);font-size:16px;line-height:1.75;text-wrap:pretty}
  .uptime-copy a,.open-copy a{color:var(--text);text-decoration-color:var(--border-strong);text-underline-offset:4px}
  .uptime-copy a:hover,.open-copy a:hover{color:var(--brand-strong)}
  .open-section{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:center;gap:80px;padding:32px 0 112px}
  .open-art{margin-left:-10%;width:110%}
  .open-copy h2{margin-bottom:32px;font-size:clamp(48px,5.3vw,72px)}
  .open-copy p{max-width:46ch}.open-copy p+p{margin-top:20px}
  .review-section{padding:80px 0 144px}
  .review-section h2{max-width:960px;margin:0 auto 56px;font-size:clamp(48px,5.7vw,80px)}
  .git-section{display:grid;grid-template-columns:minmax(0,.65fr) minmax(0,1fr);align-items:center;gap:72px;padding:64px 0 120px}
  .git-copy h2{font-size:clamp(48px,5.7vw,76px)}
  .git-copy p{margin:24px 0 0;color:var(--text-muted);font-size:16px;line-height:1.7;text-wrap:pretty}
  .terminal{min-width:0;overflow:hidden;border-radius:14px;background:var(--surface-muted)}
  .terminal-body{overflow-x:auto;padding:32px;font:13px/1.8 var(--font-mono)}
  .terminal-body:focus-visible{outline-offset:-4px;border-radius:14px}
  .terminal-body p{display:flex;width:max-content;min-width:100%;margin:0 0 4px;white-space:nowrap}
  .terminal-body .command{margin-top:22px}
  .terminal-body i{width:20px;flex:none;color:var(--brand);font-style:normal}
  .terminal-body code{color:var(--text-strong);font:inherit}
  .terminal-body .response{padding-left:20px;color:var(--text-muted)}
  .terminal-body .success{color:var(--success)}
  .closing{display:flex;align-items:flex-end;justify-content:space-between;gap:64px;padding:48px 0 72px}
  .closing h2{max-width:780px}
  .closing-actions{display:grid;flex:none;justify-items:end;gap:14px}
  .landing>footer{display:flex;flex-wrap:wrap;align-items:center;gap:32px;padding:24px 0 40px;color:var(--text-faint)}
  .landing>footer>div{flex:1}.landing>footer>div p{margin:8px 0 0;font-size:12px}
  .landing>footer nav{display:flex;flex-wrap:wrap;gap:20px}
  .landing>footer nav a{display:inline-flex;min-height:40px;align-items:center;color:var(--text-muted);font-size:12px;text-decoration:none}
  .landing>footer nav a:hover{color:var(--text-strong)}
  .landing>footer>small{font-size:11px}
  .closing-art{height:clamp(180px,25vw,420px);overflow:hidden}
  .closing-art :global(.artwork){margin-top:-15%}
  @media(max-width:900px){
    .landing-nav,.hero-content,.uptime,.git-section,.open-section,.review-section,.closing,.landing>footer{width:calc(100% - 40px)}
    .hero{align-items:flex-start;padding:clamp(24px,5svh,48px) 0 40px}.hero-copy{width:min(640px,100%)}
    .hero h1{font-size:clamp(42px,6.7vw,60px)}.hero h1 span{margin-top:16px}.hero-actions{margin-top:28px}
    .hero-art{top:auto;height:52%}.hero-art :global(img){height:100%}
    .review-section{padding:64px 0 80px}.review-section h2{margin-bottom:40px}
    .uptime{padding:96px 0 80px}.uptime-copy{width:100%;gap:32px;margin-top:32px}
    .git-section{grid-template-columns:1fr;gap:32px;padding:32px 0 88px}
    .open-section{grid-template-columns:1fr;gap:24px;padding:24px 0 48px}.open-copy{grid-row:1;max-width:58ch}.open-copy h2{max-width:10ch}.open-copy p{max-width:58ch}
    .open-art{width:min(620px,100%);margin:0 0 0 auto}
    .closing{align-items:flex-start;flex-direction:column;gap:32px;padding:24px 0 80px}.closing-actions{justify-items:start}
  }
  @media(max-width:560px){
    .landing-nav{height:58px}.hero{min-height:calc(100svh - 58px)}
    .hero h1{font-size:clamp(34px,9.8vw,52px)}.hero-actions{gap:8px 20px;margin-top:24px}
    h2,.git-copy h2,.open-copy h2{font-size:44px}
    .review-section h2{text-align:left}
    .uptime-copy{grid-template-columns:1fr;gap:20px}
    .git-copy p,.uptime-copy p,.open-copy p{font-size:15px}
    .terminal-body{padding:24px 18px;font-size:12px}
    .landing>footer{align-items:flex-start;flex-direction:column;gap:16px}
    .closing-art :global(.artwork){margin-top:0}
  }
  @media(max-width:900px) and (min-aspect-ratio:1/1){
    .hero-copy{width:60%}.hero h1{font-size:clamp(32px,8svh,52px)}
  }
</style>
