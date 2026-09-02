<script lang="ts">
  type StructuredData = Record<string, unknown>;

  let {
    title,
    description,
    path,
    type = 'website',
    robots = 'index, follow',
    image = '/marl-social.png',
    imageAlt = 'Marl — a better place to work on code',
    socialTitle,
    socialDescription,
    jsonLd
  } = $props<{
    title: string;
    description: string;
    path: string;
    type?: 'website' | 'profile';
    robots?: string;
    image?: string;
    imageAlt?: string;
    socialTitle?: string;
    socialDescription?: string;
    jsonLd?: StructuredData;
  }>();

  const canonical = $derived(new URL(path, 'https://marl.sh').href);
  const socialImage = $derived(new URL(image, 'https://marl.sh').href);
  const openGraphTitle = $derived(socialTitle ?? title);
  const openGraphDescription = $derived(socialDescription ?? description);
  const structuredData = $derived(jsonLd ? JSON.stringify(jsonLd).replaceAll('<', '\\u003c') : null);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <meta name="robots" content={robots} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content={type} />
  <meta property="og:site_name" content="Marl" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:title" content={openGraphTitle} />
  <meta property="og:description" content={openGraphDescription} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={socialImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={imageAlt} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={openGraphTitle} />
  <meta name="twitter:description" content={openGraphDescription} />
  <meta name="twitter:image" content={socialImage} />
  <meta name="twitter:image:alt" content={imageAlt} />
  {#if structuredData}<svelte:element this={'script'} type="application/ld+json">{structuredData}</svelte:element>{/if}
</svelte:head>
