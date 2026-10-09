<script lang="ts">
  import { keyboardScroll } from '#lib/actions/keyboard-scroll.js';
  import BrandMark from '#lib/components/identity/BrandMark.svelte';
  import LinkButton from '#lib/components/controls/LinkButton.svelte';
  import Seo from '#lib/components/page/Seo.svelte';
  import SiteFooter from '#lib/components/shell/SiteFooter.svelte';
  import LandingActions from './LandingActions.svelte';
  import LandingArtwork from './LandingArtwork.svelte';
  import LandingHeading from './LandingHeading.svelte';
  import LandingProse from './LandingProse.svelte';
  import LandingReview from './LandingReview.svelte';
  import LandingRun from './LandingRun.svelte';
  import { landingWidth } from './layout.js';

  const description =
    'Marl is a code hosting platform for Git repositories, issues, pulls, releases, and CI on self-hosted runners.';
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

<div class="min-h-dvh overflow-clip bg-canvas text-ink">
  <a
    class="fixed top-2 left-2 z-1000 -translate-y-[150%] rounded-lg bg-ink-strong px-3.5 py-2.5 font-semibold text-canvas focus:translate-y-0"
    href="#main-content">Skip to content</a
  >

  <header class={['mx-auto flex h-16 items-center justify-between max-sm:h-14.5', landingWidth]}>
    <a class="flex min-h-11 items-center" href="/" aria-label="Marl home"><BrandMark /></a>
    <LinkButton href="/sign-in">Sign in</LinkButton>
  </header>

  <main id="main-content" tabindex="-1">
    <section
      class="relative isolate flex min-h-[calc(100svh-64px)] items-end overflow-clip bg-canvas pt-12 pb-[17svh] max-[900px]:items-start max-[900px]:pt-[clamp(24px,5svh,48px)] max-[900px]:pb-10 max-sm:min-h-[calc(100svh-58px)]"
    >
      <div class={['relative z-1 mx-auto', landingWidth]}>
        <div class="w-[min(720px,60%)] max-[900px]:w-[min(640px,100%)] max-[900px]:landscape:w-3/5">
          <h1
            class="text-[clamp(36px,min(5.4vw,8svh),76px)] leading-[0.98] font-semibold tracking-[-0.06em] text-balance text-ink-strong max-[900px]:text-[clamp(42px,6.7vw,60px)] max-sm:text-[clamp(34px,9.8vw,52px)] max-[900px]:landscape:text-[clamp(32px,8svh,52px)]"
          >
            We wanted somewhere better to work on code. <span class="mt-5 block text-brand-strong max-[900px]:mt-4"
              >So we built Marl.</span
            >
          </h1>
          <LandingActions
            class="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 max-[900px]:mt-7 max-sm:mt-6 max-sm:gap-x-5"
          />
        </div>
      </div>
      <LandingArtwork
        scene="landscape"
        sizes="100vw"
        priority
        class="absolute inset-x-0 -bottom-[9%] -z-1 h-[110%] w-full object-cover object-right-bottom max-[900px]:bottom-0 max-[900px]:h-[52%]"
      />
    </section>

    <section
      class={['mx-auto scroll-mt-12 pt-36 pb-28 max-[900px]:pt-24 max-[900px]:pb-20', landingWidth]}
      id="uptime"
      aria-labelledby="uptime-title"
    >
      <LandingHeading id="uptime-title" class="max-w-275"
        >We got tired of asking if GitHub was down again.</LandingHeading
      >
      <div
        class="mt-12 ml-auto grid w-[min(780px,76%)] grid-cols-2 gap-12 max-[900px]:mt-8 max-[900px]:w-full max-[900px]:gap-8 max-sm:grid-cols-1 max-sm:gap-5"
      >
        <LandingProse>
          On August 17, 2026, <a
            href="https://github.blog/news-insights/company-news/the-august-17-outage-and-the-work-ahead/"
            target="_blank"
            rel="noreferrer">a GitHub outage lasted 7 hours and 47 minutes</a
          >, disrupting code, reviews, Actions, and authentication.
        </LandingProse>
        <LandingProse>
          A code host should not be the reason a review stalls, a push fails, or a release waits. Somehow that became a
          lot to ask.
        </LandingProse>
      </div>
    </section>

    <section
      class={[
        'mx-auto grid grid-cols-[minmax(0,0.65fr)_minmax(0,1fr)] items-center gap-18 pt-16 pb-30 max-[900px]:grid-cols-1 max-[900px]:gap-8 max-[900px]:pt-8 max-[900px]:pb-22',
        landingWidth
      ]}
      aria-labelledby="git-title"
    >
      <div>
        <LandingHeading id="git-title">You already know how to use Marl.</LandingHeading>
        <LandingProse class="mt-6">
          Clone over HTTPS or SSH. Branch, commit, push. The Git habits and tools you already have come with you.
        </LandingProse>
      </div>
      <div class="min-w-0 overflow-hidden rounded-xl bg-surface-muted">
        <div
          class="overflow-x-auto p-8 font-mono text-[13px] leading-[1.8] focus-visible:rounded-xl focus-visible:outline-offset-[-4px] max-sm:px-4.5 max-sm:py-6 max-sm:text-xs [&_i]:w-5 [&_i]:flex-none [&_i]:text-brand [&_i]:not-italic [&_p]:mb-1 [&_p]:flex [&_p]:w-max [&_p]:min-w-full [&_p]:whitespace-nowrap"
          role="region"
          aria-label="Git clone and push example"
          {@attach keyboardScroll}
        >
          <p><i>$</i><code class="text-ink-strong">git clone ssh://git@ssh.marl.sh/lantharos/marl.git</code></p>
          <p class="pl-5 text-ink-muted">Cloning into 'marl'... done.</p>
          <p class="mt-5.5"><i>$</i><code class="text-ink-strong">cd marl && git switch -c share-search</code></p>
          <p class="mt-5.5"><i>$</i><code class="text-ink-strong">git push -u origin share-search</code></p>
          <p class="pl-5 text-success">[new branch] share-search -&gt; share-search</p>
        </div>
      </div>
    </section>

    <section
      class={[
        'mx-auto grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-20 pt-8 pb-28 max-[900px]:grid-cols-1 max-[900px]:gap-6 max-[900px]:pt-6 max-[900px]:pb-12',
        landingWidth
      ]}
      aria-labelledby="open-title"
    >
      <LandingArtwork
        scene="courtyard"
        sizes="(max-width: 900px) min(620px, 100vw), min(720px, 56vw)"
        class="-ml-[10%] h-auto w-[110%] max-w-none max-[900px]:order-2 max-[900px]:ml-auto max-[900px]:w-[min(620px,100%)]"
      />
      <div class="max-[900px]:max-w-[58ch]">
        <LandingHeading id="open-title" class="mb-8 max-[900px]:max-w-[10ch]">Write it however you want.</LandingHeading
        >
        <LandingProse class="max-w-[46ch] max-[900px]:max-w-[58ch]">
          <a href="https://codeberg.org/Codeberg/org/src/branch/main/TermsOfUse.md" target="_blank" rel="noreferrer"
            >Codeberg’s terms</a
          > reject projects that mostly consist of code written by generative AI. Marl does not.
        </LandingProse>
        <LandingProse class="mt-5 max-w-[46ch] max-[900px]:max-w-[58ch]">
          Write every line yourself, use AI where it helps, or let an agent take the first pass. If you’re making
          software, you’re welcome here.
        </LandingProse>
      </div>
    </section>

    <section
      class={['mx-auto scroll-mt-12 pt-20 pb-36 max-[900px]:pt-16 max-[900px]:pb-20', landingWidth]}
      id="review"
      aria-labelledby="review-title"
    >
      <LandingHeading id="review-title" class="mx-auto mb-14 max-w-240 text-center max-[900px]:mb-10 max-sm:text-left">
        Pulls, revision by revision.
      </LandingHeading>
      <LandingReview />
    </section>

    <section
      class={['mx-auto scroll-mt-12 pt-8 pb-36 max-[900px]:pt-4 max-[900px]:pb-20', landingWidth]}
      id="runs"
      aria-labelledby="runs-title"
    >
      <div
        class="mb-14 grid grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] items-end gap-16 max-[900px]:mb-10 max-[900px]:grid-cols-1 max-[900px]:gap-8"
      >
        <LandingHeading id="runs-title">Your checks run on your machines.</LandingHeading>
        <div class="grid gap-5">
          <LandingProse>
            In December 2025, GitHub <a
              href="https://www.theregister.com/2025/12/17/github_charge_dev_own_hardware/"
              target="_blank"
              rel="noreferrer">announced a per-minute fee</a
            > for Actions jobs on self-hosted runners, then postponed it days later. A fee for running code on hardware you
            already pay for.
          </LandingProse>
          <LandingProse>
            On Marl, every job runs on a runner you connect, in a fresh container that’s removed afterwards. Existing
            GitHub workflows run too, and anything Marl can’t run is flagged instead of quietly passing.
          </LandingProse>
        </div>
      </div>
      <LandingRun />
    </section>

    <section
      class={[
        'mx-auto flex items-end justify-between gap-16 pt-12 pb-18 max-[900px]:flex-col max-[900px]:items-start max-[900px]:gap-8 max-[900px]:pt-6 max-[900px]:pb-20',
        landingWidth
      ]}
    >
      <LandingHeading class="max-w-195">Put your next repository here.</LandingHeading>
      <LandingActions class="grid shrink-0 justify-items-end gap-3.5 max-[900px]:justify-items-start" />
    </section>
  </main>

  <SiteFooter width={landingWidth} />
  <div class="h-[clamp(180px,25vw,420px)] overflow-hidden">
    <LandingArtwork scene="inlay" sizes="100vw" class="-mt-[15%] h-auto w-full max-sm:mt-0" />
  </div>
</div>
