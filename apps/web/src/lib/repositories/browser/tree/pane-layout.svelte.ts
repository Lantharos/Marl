const storageKey = 'marl:code-tree';

export const paneWidth = { min: 220, max: 560, initial: 296 };

export class PaneLayout {
  width = $state(paneWidth.initial);
  collapsed = $state(false);

  restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as { width?: unknown; collapsed?: unknown };
      if (typeof saved.width === 'number') this.resize(saved.width);
      this.collapsed = saved.collapsed === true;
    } catch {}
  }

  resize(width: number) {
    this.width = Math.round(Math.min(paneWidth.max, Math.max(paneWidth.min, width)));
  }

  setCollapsed(collapsed: boolean) {
    this.collapsed = collapsed;
    this.save();
  }

  save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ width: this.width, collapsed: this.collapsed }));
    } catch {}
  }
}
