export type ThemePreference = 'system' | 'light' | 'dark';

export const themeCookie = 'marl-theme';
const oneYear = 60 * 60 * 24 * 365;

export function themePreference(): ThemePreference {
  const value = document.documentElement.dataset.theme;
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolvedTheme(): 'light' | 'dark' {
  const preference = themePreference();
  if (preference !== 'system') return preference;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function setThemePreference(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === 'system') {
    delete root.dataset.theme;
    document.cookie = `${themeCookie}=; Path=/; Max-Age=0; SameSite=Lax`;
  } else {
    root.dataset.theme = preference;
    document.cookie = `${themeCookie}=${preference}; Path=/; Max-Age=${oneYear}; SameSite=Lax`;
  }
}

export function watchResolvedTheme(onChange: (theme: 'light' | 'dark') => void) {
  const media = matchMedia('(prefers-color-scheme: light)');
  const notify = () => onChange(resolvedTheme());
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  media.addEventListener('change', notify);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', notify);
  };
}
