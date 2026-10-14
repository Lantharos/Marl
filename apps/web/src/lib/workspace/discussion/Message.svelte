<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { IdentityKind } from '@marl/contracts';
  import Button from '#lib/components/controls/Button.svelte';
  import UserAvatar from '#lib/components/identity/UserAvatar.svelte';
  import UserProfileLink from '#lib/components/identity/UserProfileLink.svelte';
  import MarkdownBody from '#lib/components/markdown/MarkdownBody.svelte';
  import MarkdownComposer from '#lib/components/markdown/MarkdownComposer.svelte';
  import ActionMenu from '#lib/components/overlays/ActionMenu.svelte';
  import Time from '#lib/components/page/Time.svelte';
  import type { MarkdownContext } from '#lib/markdown/context.js';

  type Author = { handle: string; displayName: string; avatarUrl?: string | null; kind?: IdentityKind };
  type Action = { label: string; onSelect: () => void; danger?: boolean };

  let {
    author,
    createdAt,
    edited = false,
    deleted = false,
    body,
    bodyHtml,
    context,
    busy = false,
    size = 'regular',
    actions = [],
    verdict,
    editing = $bindable(false),
    onSave
  }: {
    author: Author;
    createdAt: string;
    edited?: boolean;
    deleted?: boolean;
    body: string;
    bodyHtml: string;
    context: MarkdownContext;
    busy?: boolean;
    size?: 'regular' | 'small';
    actions?: Action[];
    verdict?: Snippet;
    editing?: boolean;
    onSave?: (body: string) => Promise<boolean>;
  } = $props();
  let draft = $state('');
  let uploading = $state(false);
  const avatar = $derived(size === 'regular' ? 28 : 22);

  $effect.pre(() => {
    if (editing) draft = body;
  });

  async function save() {
    if (!onSave || !draft.trim() || uploading) return;
    if (await onSave(draft)) editing = false;
  }
</script>

<article
  class={[
    'group/message grid gap-x-3',
    size === 'regular' ? 'grid-cols-[28px_minmax(0,1fr)]' : 'grid-cols-[22px_minmax(0,1fr)]'
  ]}
>
  <UserAvatar name={author.displayName || author.handle} src={author.avatarUrl} size={avatar} />
  <div class="min-w-0">
    <header class={['flex min-w-0 items-center gap-2', size === 'regular' ? 'min-h-7' : 'min-h-5.5']}>
      <UserProfileLink
        handle={author.handle}
        displayName={author.displayName || author.handle}
        kind={author.kind}
        avatar={false}
        class="shrink-0 font-semibold"
      />
      {@render verdict?.()}
      <span class="truncate text-xs text-ink-faint"
        ><Time value={createdAt} />{#if edited && !deleted}<span> · edited</span>{/if}</span
      >
      {#if actions.length && !editing}<div
          class="ml-auto opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"
        >
          <ActionMenu label="Options for {author.displayName || author.handle}’s message" {actions} />
        </div>{/if}
    </header>
    {#if deleted}<p class="mt-0.5 text-sm text-ink-faint">This message was deleted.</p>
    {:else if editing}<div class="mt-2">
        <MarkdownComposer
          bind:value={draft}
          bind:uploading
          variant="inline"
          minHeight="72px"
          {context}
          disabled={busy}
          onsubmit={save}
        >
          {#snippet actions()}
            <Button size="small" variant="ghost" disabled={busy} onclick={() => (editing = false)}>Cancel</Button>
            <Button size="small" variant="primary" loading={busy} disabled={!draft.trim() || uploading} onclick={save}
              >Save</Button
            >
          {/snippet}
        </MarkdownComposer>
      </div>
    {:else if bodyHtml}<div class={['mt-0.5 min-w-0', size === 'regular' ? 'text-md' : 'text-sm']}>
        <MarkdownBody html={bodyHtml} />
      </div>{/if}
  </div>
</article>
