<script lang="ts">
  import ArrowDown from 'lucide-svelte/icons/arrow-down';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import LinkButton from '$lib/components/LinkButton.svelte';
  import Seo from '$lib/components/Seo.svelte';

  const description = 'Marl is a code hosting platform for Git repositories, issues, pull requests, releases, and CI on self-hosted runners.';
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
  </header>

  <main id="main-content" tabindex="-1">
    <section class="hero">
      <h1>We wanted somewhere better to work on code. <span>So we built Marl.</span></h1>

      <div class="hero-actions">
        <LinkButton variant="primary" size="large" href="/sign-up">Create an account <ArrowRight size={15} /></LinkButton>
        <a class="text-action" href="/lantharos/marl">Read Marl’s source</a>
      </div>

      <a class="scroll-cue" href="#uptime" aria-label="Continue to the next section"><ArrowDown size={16} /></a>
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
  :global(html){scroll-behavior:smooth;scroll-padding-top:72px}
  .landing{min-height:100dvh;background:var(--canvas);color:var(--text)}
  .skip-link{position:fixed;top:8px;left:8px;z-index:1000;padding:9px 12px;border-radius:6px;background:var(--text-strong);color:var(--canvas);font-weight:600;text-decoration:none;transform:translateY(-150%)}
  .skip-link:focus{transform:translateY(0)}
  .landing-nav{position:relative;z-index:50;display:flex;width:min(1320px,calc(100% - 48px));align-items:center;height:64px;margin:0 auto;border-bottom:1px solid var(--border-subtle)}
  .brand-link{display:flex;min-height:44px;align-items:center;color:inherit;text-decoration:none}
  .landing a:focus-visible{outline:2px solid var(--brand);outline-offset:3px}
  .text-action{display:inline-flex;align-items:center;gap:7px;color:var(--text-strong);font-size:12px;font-weight:650;text-decoration:none}
  .text-action:hover{color:var(--brand)}

  .hero{position:relative;display:flex;width:min(1320px,calc(100% - 48px));min-height:calc(100svh - 64px);flex-direction:column;justify-content:space-between;margin:0 auto;padding:76px 0 120px}
  .hero h1{max-width:1200px;margin:0;color:var(--text-strong);font-size:clamp(70px,8.9vw,136px);font-weight:600;letter-spacing:-.072em;line-height:.86;text-wrap:balance;animation:copy-in 650ms cubic-bezier(.2,.8,.2,1) both}
  .hero h1 span{display:block;margin-left:9%;color:var(--brand-strong)}
  .hero-actions{display:flex;align-self:flex-end;align-items:center;gap:20px;margin-top:90px;animation:copy-in 650ms cubic-bezier(.2,.8,.2,1) 110ms both}
  .scroll-cue{position:absolute;top:calc(100svh - 219px);left:50%;display:flex;width:34px;height:48px;align-items:flex-end;justify-content:center;color:var(--text-faint);transform:translateX(-50%);transition:color 160ms ease}
  .scroll-cue::before{position:absolute;top:0;left:50%;width:1px;height:22px;background:var(--border-strong);content:''}
  .scroll-cue :global(svg){animation:scroll-nudge 1.8s cubic-bezier(.3,.7,.3,1) infinite}
  .scroll-cue:hover{color:var(--brand)}

  .uptime,.open-section,.git-section,.publication,.closing{width:min(1220px,calc(100% - 48px));margin:0 auto;border-top:1px solid var(--border-subtle)}
  .uptime{padding:154px 0 164px}
  .uptime h2{max-width:1080px;margin:0;color:var(--text-strong);font-size:clamp(56px,7.7vw,108px);font-weight:600;letter-spacing:-.068em;line-height:.9;text-wrap:balance}
  .uptime-copy{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:70px;margin:92px 0 0 auto;width:min(760px,72%)}
  .uptime-copy p,.open-section p{margin:0;color:var(--text-muted);font-size:15px;line-height:1.72;text-wrap:pretty}
  .uptime-copy a,.open-section a{color:var(--text);text-decoration-color:var(--border-strong);text-underline-offset:3px}
  .uptime-copy a:hover,.open-section a:hover{color:var(--brand-strong);text-decoration-color:var(--brand)}
  .open-section{display:grid;grid-template-columns:minmax(520px,1fr) minmax(340px,.58fr);align-items:end;gap:120px;padding:168px 0 176px}
  .open-section h2,.git-copy h2,.publication h2,.closing h2{max-width:980px;margin:0;color:var(--text-strong);font-size:clamp(48px,6.4vw,88px);font-weight:600;letter-spacing:-.06em;line-height:.94;text-wrap:balance}

  .git-section{display:flex;flex-direction:column;align-items:center;padding:168px 0 176px}
  .git-copy{text-align:center}
  .git-copy p{max-width:560px;margin:27px auto 0;color:var(--text-muted);font-size:15px;line-height:1.72;text-wrap:pretty}
  .terminal{width:min(860px,100%);margin-top:82px;overflow:hidden;border-top:1px solid var(--border-strong);border-bottom:1px solid var(--border-strong);background:var(--canvas)}
  .terminal>header{display:flex;height:43px;align-items:center;justify-content:space-between;padding:0 2px;border-bottom:1px solid var(--border);color:var(--text-faint);font-family:var(--font-mono);font-size:9px}
  .terminal>header small{color:var(--brand)}
  .terminal-body{min-height:330px;padding:28px 2px;background:var(--canvas);font-family:var(--font-mono);font-size:11px;line-height:1.7}
  .terminal-body p{display:flex;margin:0 0 4px}
  .terminal-body i{width:20px;flex:none;color:var(--brand);font-style:normal}
  .terminal-body code{color:var(--text-strong);font:inherit}
  .terminal-body .response{padding-left:20px;color:var(--text-faint)}
  .terminal-body .success{margin-bottom:13px;color:var(--success)}
  .terminal-cursor{display:block;width:8px;height:13px;margin-left:20px;border-radius:1px;background:var(--brand);animation:cursor-blink 1.1s step-end infinite}

  .publication{padding:158px 0 172px}
  .publication-copy{display:grid;grid-template-columns:minmax(520px,1fr) minmax(340px,.54fr);align-items:end;gap:120px}
  .publication-copy p{margin:0 0 5px;color:var(--text-muted);font-size:15px;line-height:1.72;text-wrap:pretty}
  .ref-transition{margin:118px 0 0;border-top:1px solid var(--border-strong);border-bottom:1px solid var(--border-strong)}
  .ref-status{display:flex;align-items:center;justify-content:space-between;padding:18px 2px 0;color:var(--text-faint);font-family:var(--font-mono);font-size:10px}
  .ref-status span:last-child{color:var(--success)}
  .ref-move{display:grid;grid-template-columns:auto minmax(80px,1fr) auto;align-items:center;gap:32px;padding:48px 2px 58px}
  .ref-move code{color:var(--text-strong);font-family:var(--font-mono);font-size:clamp(28px,4.4vw,56px);font-weight:500;letter-spacing:-.045em}
  .ref-move code:last-child{color:var(--brand-strong)}
  .ref-rail{position:relative;height:1px;background:var(--border-strong)}
  .ref-rail::before{position:absolute;top:50%;left:0;width:7px;height:7px;border:1px solid var(--border-strong);border-radius:50%;background:var(--canvas);content:'';transform:translate(-50%,-50%)}
  .ref-rail::after{position:absolute;top:50%;right:0;width:11px;height:11px;border:2px solid var(--brand);border-radius:50%;background:var(--canvas);content:'';transform:translate(50%,-50%)}
  .ref-rail i{position:absolute;top:50%;right:1px;width:34%;height:1px;background:var(--brand);transform:translateY(-50%)}
  .ref-transition figcaption{display:flex;align-items:flex-end;justify-content:space-between;gap:40px;padding:0 2px 20px;color:var(--text-faint);font-size:11px}
  .ref-transition figcaption>span:last-child{display:grid;justify-items:end;color:var(--text-muted);font-size:13px;font-weight:600}
  .ref-transition figcaption small{margin-bottom:4px;color:var(--text-faint);font-size:9px;font-weight:400}

  .closing{display:flex;align-items:flex-end;justify-content:space-between;gap:80px;padding:156px 0 164px}
  .closing h2{max-width:780px}
  .closing-actions{display:grid;flex:none;justify-items:end;gap:20px}
  .landing>footer{display:grid;width:min(1320px,calc(100% - 48px));grid-template-columns:1fr auto auto;align-items:end;gap:42px;margin:0 auto;padding:38px 0 46px;border-top:1px solid var(--border-subtle)}
  .landing>footer>div p{margin:10px 0 0;color:var(--text-faint);font-size:9px}
  .landing>footer nav{display:flex;gap:19px}
  .landing>footer nav a{color:var(--text-muted);font-size:10px;text-decoration:none}
  .landing>footer nav a:hover{color:var(--text-strong)}
  .landing>footer>small{color:var(--text-faint);font-size:9px}

  @keyframes copy-in{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
  @keyframes cursor-blink{0%,45%{opacity:1}46%,100%{opacity:.2}}
  @keyframes scroll-nudge{0%,20%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
  @media(max-width:1100px){
    .open-section{grid-template-columns:1fr;gap:42px}
    .open-section p{max-width:600px;margin-left:auto}
    .publication-copy{grid-template-columns:1fr;gap:42px}
    .publication-copy p{max-width:600px;margin-left:auto}
  }
  @media(max-width:900px){
    .landing-nav{width:calc(100% - 32px)}
    .hero,.uptime,.open-section,.git-section,.publication,.closing,.landing>footer{width:calc(100% - 32px)}
    .hero{min-height:calc(100svh - 64px);padding:82px 0 114px}
    .hero h1{font-size:clamp(62px,14vw,94px)}
    .hero h1 span{margin-left:0}
    .uptime,.open-section,.git-section,.publication{padding:112px 0 122px}
    .uptime-copy{width:100%;margin-top:64px}
    .open-section p{margin-left:0}
    .terminal{margin-top:64px}
    .ref-transition{margin-top:78px}
    .closing{align-items:flex-start;padding:112px 0;flex-direction:column}
    .closing-actions{justify-items:start}
    .landing>footer{grid-template-columns:1fr auto}
    .landing>footer>small{grid-column:1/-1}
  }
  @media(max-width:560px){
    .landing-nav{height:58px}
    .hero{min-height:calc(100svh - 58px);padding:64px 0 106px}
    .scroll-cue{top:calc(100svh - 201px)}
    .hero h1{font-size:clamp(52px,15vw,70px);line-height:.89}
    .hero-actions{align-items:flex-start;flex-direction:column;gap:16px}
    .uptime h2,.open-section h2,.git-copy h2,.publication h2,.closing h2{font-size:45px}
    .uptime-copy{grid-template-columns:1fr;gap:24px;margin-top:48px}
    .terminal-body{min-height:300px;padding:20px 2px;font-size:8px}
    .terminal-body p{overflow:hidden}
    .terminal-body code{white-space:nowrap}
    .ref-move{gap:14px;padding:39px 2px 44px}
    .ref-move code{font-size:clamp(19px,6.5vw,28px)}
    .ref-transition figcaption{align-items:flex-start;flex-direction:column;gap:20px}
    .ref-transition figcaption>span:last-child{justify-items:start}
    .landing>footer{grid-template-columns:1fr}
    .landing>footer nav{flex-wrap:wrap}
    .landing>footer>small{grid-column:auto}
  }
  @media(prefers-reduced-motion:reduce){
    :global(html){scroll-behavior:auto}
    .hero h1,.hero-actions,.scroll-cue :global(svg),.terminal-cursor{animation:none}
  }
</style>
