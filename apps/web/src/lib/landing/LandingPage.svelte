<script lang="ts">
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import Seo from '$lib/components/Seo.svelte';
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
    <nav aria-label="Main"><a href="#review">Code review</a><a href="/lantharos/marl">Source</a><LinkButton href="/sign-in">Sign in</LinkButton></nav>
  </header>

  <main id="main-content" tabindex="-1">
    <section class="hero">
      <h1>We wanted somewhere better to work on code. <span>So we built Marl.</span></h1>

      <p class="hero-description">Git hosting, code review, issues, and CI on your own machines.</p>
      <div class="hero-actions">
        <LinkButton variant="primary" size="large" href="/sign-up">Create an account <ArrowRight size={15} /></LinkButton>
        <a class="text-action" href="/lantharos/marl">Read Marl’s source</a>
      </div>

    </section>





    <section class="review-section" id="review">
      <div class="review-copy"><h2>A review you can follow.</h2><p>The latest revision comes first. Comments stay with the code they’re about. Earlier discussions are one click away, without taking over the page.</p></div>
      <LandingReview />
    </section>

    <section class="git-section" id="git">
      <div class="git-copy">
        <h2>You already know how to use Marl.</h2>
        <p>Clone over HTTPS or SSH. Branch, commit, push. The Git habits and tools you already have come with you.</p>
      </div>

      <div class="terminal" aria-label="Git clone and push example">
        <header><span>~/code</span><small>marl</small></header>
        <div class="terminal-body">
          <p><i>$</i><code>git clone ssh://git@ssh.marl.sh/lantharos/marl.git</code></p>
          <p class="response">Cloning into 'marl'...</p>
          <p class="response">Receiving objects: 100% · done.</p>
          <p><i>$</i><code>cd marl && git switch -c recover-publication</code></p>
          <p class="response">Switched to a new branch 'recover-publication'</p>
          <p><i>$</i><code>git push -u origin recover-publication</code></p>
          <p class="response success">[new branch] recover-publication -&gt; recover-publication</p>
          <span class="terminal-cursor" aria-hidden="true"></span>
        </div>
      </div>
    </section>

    <section class="publication">
      <div class="publication-copy">
        <h2>If Marl says your push landed, it landed.</h2>
        <p>Marl does not return success until the new refs and every object behind them have been durably published. If the response disappears, Marl recovers the committed push instead of throwing it away. Replaced generations stay recoverable for 31 days.</p>
      </div>

      <figure class="ref-transition">
        <div class="ref-status">
          <span>main</span>
          <span>published</span>
        </div>
        <div class="ref-move" aria-label="The main branch moved from commit 7f3aff2 to commit 4b68808">
          <code>7f3aff2</code>
          <span class="ref-rail" aria-hidden="true"><i></i></span>
          <code>4b68808</code>
        </div>
        <figcaption>
          <span>The response comes after publication.</span>
          <span><small>Previous generation</small>Recoverable for 31 days</span>
        </figcaption>
      </figure>
    </section>

    <section class="uptime" id="uptime">
      <h2>We got tired of asking if GitHub was down again.</h2>
      <div class="uptime-copy">
        <p>From January through July 2026, GitHub reported <a href="https://github.blog/tag/github-availability-report/" target="_blank" rel="noreferrer">45 degraded-service incidents</a>. On August 17, <a href="https://github.blog/news-insights/company-news/the-august-17-outage-and-the-work-ahead/" target="_blank" rel="noreferrer">one outage lasted 7 hours and 47 minutes</a>, disrupting GitHub.com, authentication, Actions, APIs, pull requests, issues, and Copilot.</p>
        <p>A code host should not be the reason a review stalls, a push fails, or a release waits. Somehow that became a lot to ask.</p>
      </div>
    </section>

    <section class="open-section">
      <h2>We’re not grading how you made it.</h2>
      <p><a href="https://codeberg.org/Codeberg/org/src/branch/main/TermsOfUse.md" target="_blank" rel="noreferrer">Codeberg’s current terms</a> reject projects that mostly consist of code written by generative AI. Marl does not. Write every line yourself, use AI where it helps, or let an agent take the first pass. If you’re making software, you’re welcome here.</p>
    </section>

    <section class="closing">
      <h2>Put your next repository here.</h2>
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
</div>

<style>
  .landing{min-height:100dvh;background:var(--canvas);color:var(--text)}
  .skip-link{position:fixed;top:8px;left:8px;z-index:1000;padding:10px 14px;border-radius:8px;background:var(--text-strong);color:var(--canvas);font-weight:600;text-decoration:none;transform:translateY(-150%)}
  .skip-link:focus{transform:none}
  .landing-nav{display:flex;width:min(1200px,calc(100% - 64px));align-items:center;justify-content:space-between;min-height:80px;margin:0 auto}
  .brand-link{display:flex;min-height:44px;align-items:center;color:inherit;text-decoration:none}
  .landing-nav nav{display:flex;align-items:center;gap:24px}
  .landing-nav nav>a{color:var(--text-muted);font-size:12px;text-decoration:none}
  .landing-nav nav>a:hover{color:var(--text-strong)}
  .text-action{display:inline-flex;min-height:40px;align-items:center;gap:7px;color:var(--text-strong);font-size:13px;font-weight:600;text-decoration:none}
  .text-action:hover{color:var(--brand)}
  .hero{width:min(1200px,calc(100% - 64px));margin:0 auto;padding:72px 0 100px}
  .hero h1{max-width:1000px;margin:0;color:var(--text-strong);font-size:clamp(52px,6.9vw,88px);font-weight:600;letter-spacing:-.062em;line-height:1.02;text-wrap:balance}
  .hero h1 span{display:block;color:var(--brand-strong)}
  .hero-description{max-width:540px;margin:28px 0 0;color:var(--text-muted);font-size:16px;line-height:1.7;text-wrap:pretty}
  .hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:24px;margin-top:28px}
  .review-section,.uptime,.open-section,.git-section,.publication,.closing{width:min(1200px,calc(100% - 64px));margin:0 auto;scroll-margin-top:24px}
  .review-section{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,1fr);align-items:start;gap:72px;padding:0 0 100px}
  .review-copy{padding-top:24px}
  h2{margin:0;color:var(--text-strong);font-size:clamp(34px,4vw,52px);font-weight:600;letter-spacing:-.045em;line-height:1.1;text-wrap:balance}
  .review-copy p,.git-copy p,.publication-copy p,.uptime-copy p,.open-section p{max-width:60ch;margin:22px 0 0;color:var(--text-muted);font-size:15px;line-height:1.75;text-wrap:pretty}
  .uptime-copy a,.open-section a{color:var(--text);text-decoration-color:var(--border-strong);text-underline-offset:3px}
  .uptime-copy a:hover,.open-section a:hover{color:var(--brand-strong)}
  .git-section{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,1fr);align-items:center;gap:72px;padding:48px 0 100px}
  .terminal{min-width:0;overflow:hidden;border-radius:14px;background:var(--surface);box-shadow:var(--shadow-surface)}
  .terminal>header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;color:var(--text-faint);font:11px var(--font-mono)}
  .terminal>header small{font-size:11px;color:var(--brand)}
  .terminal-body{overflow-x:auto;padding:8px 20px 24px;font:12px/1.8 var(--font-mono)}
  .terminal-body p{display:flex;width:max-content;min-width:100%;margin:0 0 4px;white-space:nowrap}
  .terminal-body i{width:20px;flex:none;color:var(--brand);font-style:normal}
  .terminal-body code{color:var(--text-strong);font:inherit}
  .terminal-body .response{padding-left:20px;color:var(--text-faint)}
  .terminal-body .success{color:var(--success)}
  .terminal-cursor{display:block;width:7px;height:13px;margin:14px 0 0 20px;border-radius:1px;background:var(--brand)}
  .publication{padding:32px 0 100px}
  .publication-copy{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,1fr);align-items:start;gap:72px}
  .publication-copy p{margin-top:0}
  .ref-transition{margin:40px 0 0;padding:24px 28px;border-radius:14px;background:var(--surface)}
  .ref-status{display:flex;align-items:center;justify-content:space-between;color:var(--text-muted);font:12px var(--font-mono)}
  .ref-status span:last-child{color:var(--success)}
  .ref-move{display:grid;grid-template-columns:auto minmax(40px,1fr) auto;align-items:center;gap:32px;padding:32px 0}
  .ref-move code{color:var(--text-strong);font:500 clamp(24px,3.5vw,42px) var(--font-mono);letter-spacing:-.045em}
  .ref-move code:last-child{color:var(--brand-strong)}
  .ref-rail{position:relative;height:1px;background:var(--border-strong)}
  .ref-rail::after{position:absolute;top:50%;right:0;width:9px;height:9px;border:2px solid var(--brand);border-radius:50%;background:var(--surface);content:'';transform:translate(50%,-50%)}
  .ref-rail i{position:absolute;right:1px;width:34%;height:1px;background:var(--brand)}
  .ref-transition figcaption{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;color:var(--text-faint);font-size:12px}
  .ref-transition figcaption>span:last-child{display:grid;gap:4px;justify-items:end;color:var(--text-muted)}
  .ref-transition figcaption small{color:var(--text-faint);font-size:11px}
  .uptime{padding:40px 0 88px}
  .uptime h2{max-width:820px}
  .uptime-copy{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:64px;max-width:960px}
  .open-section{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,1fr);gap:72px;padding:32px 0 88px}
  .open-section p{margin:0}
  .closing{display:flex;align-items:center;justify-content:space-between;gap:48px;padding:56px 0 88px}
  .closing h2{max-width:580px}
  .closing-actions{display:grid;flex:none;justify-items:start;gap:12px}
  .landing>footer{display:flex;flex-wrap:wrap;width:min(1200px,calc(100% - 64px));align-items:center;gap:32px;margin:0 auto;padding:24px 0 40px;color:var(--text-faint)}
  .landing>footer>div{flex:1}.landing>footer>div p{margin:8px 0 0;font-size:12px}
  .landing>footer nav{display:flex;flex-wrap:wrap;gap:20px}
  .landing>footer nav a{color:var(--text-muted);font-size:12px;text-decoration:none}
  .landing>footer nav a:hover{color:var(--text-strong)}
  .landing>footer>small{font-size:11px}
  @media(max-width:900px){
    .landing-nav,.hero,.review-section,.uptime,.open-section,.git-section,.publication,.closing,.landing>footer{width:calc(100% - 40px)}
    .hero{padding:48px 0 64px}.hero h1{font-size:clamp(48px,8vw,72px)}
    .review-section,.git-section,.publication-copy,.open-section{grid-template-columns:1fr;gap:32px}
    .review-copy{padding-top:0}.review-copy p{max-width:62ch}
    .review-section,.git-section,.publication,.uptime,.open-section{padding-bottom:72px}
    .uptime-copy{gap:32px}.closing{align-items:flex-start;flex-direction:column;gap:28px}
  }
  @media(max-width:560px){
    .landing-nav{min-height:68px}.landing-nav nav{gap:14px}.landing-nav nav>a:first-child{display:none}
    .hero{padding-top:32px}.hero h1{font-size:46px}.hero-description{font-size:14px}.hero-actions{gap:12px 20px}
    h2{font-size:34px}.review-copy p,.git-copy p,.publication-copy p,.uptime-copy p,.open-section p{font-size:14px}
    .uptime-copy{grid-template-columns:1fr;gap:0}.ref-transition{padding:20px}.ref-move{gap:18px}.ref-move code{font-size:21px}
    .ref-transition figcaption{align-items:flex-start;flex-direction:column;gap:14px}.ref-transition figcaption>span:last-child{justify-items:start}
    .landing>footer{align-items:flex-start;flex-direction:column;gap:20px}
  }
</style>
