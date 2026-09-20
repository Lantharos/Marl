export type Theme = 'light' | 'dark';

export function readTheme(): Theme {
  return localStorage.getItem('marl-theme') === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0d0f' : '#f7f6f3');
}
