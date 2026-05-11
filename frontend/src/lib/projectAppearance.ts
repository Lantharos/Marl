import type { ProjectAppearance } from '$lib/api';

export const DEFAULT_PROJECT_APPEARANCE: ProjectAppearance = {
	accent_color: '#d9a66c',
	background_color: '#0f0f0d',
	surface_color: '#141412',
	foreground_color: '#eae9e4',
	muted_color: '#8c887e',
	border_color: '#2a2a28',
	nav_background_color: '#0f0f0d',
	nav_foreground_color: '#eae9e4',
	nav_muted_color: '#8c887e',
	primary_color: '#eae9e4',
	primary_foreground_color: '#0f0f0d',
	code_background_color: '#0b0b0a'
};

const COLOR_KEYS = Object.keys(DEFAULT_PROJECT_APPEARANCE) as (keyof ProjectAppearance)[];

export function isHexColor(value: string) {
	const trimmed = value.trim();
	return /^#?[0-9a-fA-F]{3}$/.test(trimmed) || /^#?[0-9a-fA-F]{6}$/.test(trimmed);
}

export function normalizeHexColor(value: string, fallback: string) {
	const trimmed = value.trim().replace(/^#/, '');
	if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
		return `#${trimmed
			.split('')
			.map((char) => `${char}${char}`)
			.join('')
			.toLowerCase()}`;
	}
	if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
		return `#${trimmed.toLowerCase()}`;
	}
	return fallback;
}

export function normalizeProjectAppearance(
	appearance?: Partial<ProjectAppearance> | null
): ProjectAppearance {
	const normalized = { ...DEFAULT_PROJECT_APPEARANCE };
	for (const key of COLOR_KEYS) {
		const value = appearance?.[key];
		normalized[key] = normalizeHexColor(value ?? '', DEFAULT_PROJECT_APPEARANCE[key]);
	}
	return normalized;
}

export function projectAppearanceStyle(appearance?: Partial<ProjectAppearance> | null) {
	const colors = normalizeProjectAppearance(appearance);
	return [
		`--sty-project-accent: ${colors.accent_color}`,
		`--sty-project-bg: ${colors.background_color}`,
		`--sty-project-surface: ${colors.surface_color}`,
		`--sty-project-fg: ${colors.foreground_color}`,
		`--sty-project-muted: ${colors.muted_color}`,
		`--sty-project-border: ${colors.border_color}`,
		`--sty-project-nav-bg: ${colors.nav_background_color}`,
		`--sty-project-nav-fg: ${colors.nav_foreground_color}`,
		`--sty-project-nav-muted: ${colors.nav_muted_color}`,
		`--sty-project-primary: ${colors.primary_color}`,
		`--sty-project-primary-fg: ${colors.primary_foreground_color}`,
		`--sty-project-code-bg: ${colors.code_background_color}`
	].join('; ');
}
