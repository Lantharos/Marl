import type { Component } from 'svelte';

export type ShellAction = {
  id: string;
  label: string;
  keys?: string;
  icon: Component<{ size?: number; class?: string }>;
  run: () => void;
};

const inspectorKey = 'marl:workspace:inspector';

function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

class ShellState {
  inspectorOpen = $state(stored(inspectorKey) !== 'closed');
  detailsSheetOpen = $state(false);
  paletteOpen = $state(false);
  shortcutsOpen = $state(false);
  actions = $state.raw<ShellAction[]>([]);

  toggleInspector = () => {
    if (matchMedia('(width < 64rem)').matches) {
      this.detailsSheetOpen = !this.detailsSheetOpen;
      return;
    }
    this.inspectorOpen = !this.inspectorOpen;
    store(inspectorKey, this.inspectorOpen ? 'open' : 'closed');
  };

  provideActions(actions: () => ShellAction[]) {
    $effect(() => {
      const provided = actions();
      this.actions = provided;
      return () => {
        if (this.actions === provided) this.actions = [];
      };
    });
  }
}

export const shell = new ShellState();
