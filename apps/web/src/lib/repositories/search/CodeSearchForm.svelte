<script lang="ts">
  import { goto } from '$app/navigation';
  import Chip from '$lib/components/controls/Chip.svelte';
  import SearchField from '$lib/components/controls/SearchField.svelte';
  import { plainKey } from '$lib/ui/keyboard';

  let {
    owner,
    repository,
    revision,
    query = '',
    regex = false,
    caseSensitive = false,
    compact = false,
    class: className = ''
  }: {
    owner: string;
    repository: string;
    revision: string;
    query?: string;
    regex?: boolean;
    caseSensitive?: boolean;
    compact?: boolean;
    class?: string;
  } = $props();
  let value = $derived(query);
  let useRegex = $derived(regex);
  let matchCase = $derived(caseSensitive);
  let input = $state<HTMLInputElement>();

  function submit(event?: SubmitEvent) {
    event?.preventDefault();
    if (!value.trim()) return;
    const search = new URLSearchParams({ q: value.trim(), ref: revision });
    if (useRegex) search.set('regex', '1');
    if (matchCase) search.set('case', '1');
    void goto(`/${owner}/${repository}/search?${search}`, { keepFocus: true, noScroll: !compact });
  }

  function toggle(option: 'regex' | 'case') {
    if (option === 'regex') useRegex = !useRegex;
    else matchCase = !matchCase;
    if (!compact && value.trim()) submit();
  }

  function focusShortcut(event: KeyboardEvent) {
    if (plainKey(event) !== '/') return;
    event.preventDefault();
    input?.focus();
    input?.select();
  }
</script>

<svelte:window onkeydown={focusShortcut} />
<form class={['flex min-w-0 items-center gap-1.5', className]} role="search" onsubmit={submit}>
  <SearchField
    bind:value
    bind:input
    label="Search code"
    class={compact ? 'w-full sm:w-64' : 'min-w-0 flex-1'}
    enterkeyhint="search"
    autocomplete="off"
    spellcheck="false"
  />
  {#if !compact}
    <Chip active={matchCase} title="Match case" aria-label="Match case" onclick={() => toggle('case')}
      ><span class="font-mono text-xs">Aa</span></Chip
    >
    <Chip active={useRegex} title="Regular expression" aria-label="Regular expression" onclick={() => toggle('regex')}
      ><span class="font-mono text-xs">.*</span></Chip
    >
  {/if}
</form>
