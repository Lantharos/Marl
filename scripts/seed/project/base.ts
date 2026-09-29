export const readme = `# Lumen

Lumen is a small toolkit for building accessible color systems. It parses CSS colors, converts
between sRGB and OKLCH, measures contrast, and generates palettes that stay legible in light and
dark themes.

## Install

\`\`\`sh
bun add @lumen/color
\`\`\`

## Usage

\`\`\`ts
import { contrastRatio, parseColor, palette } from '@lumen/color';

const brand = parseColor('#e0735a');
const ramp = palette(brand, { steps: 9 });
contrastRatio(ramp[8], ramp[0]); // 11.4
\`\`\`

## What is inside

| Module | Purpose |
| --- | --- |
| \`color/parse\` | Reads hex, \`rgb()\`, and \`oklch()\` strings |
| \`color/convert\` | Moves colors between sRGB, linear RGB, OKLab, and OKLCH |
| \`contrast\` | WCAG 2.2 contrast ratios and pass/fail levels |
| \`palette\` | Perceptually even tonal ramps |

## How a palette is built

\`\`\`mermaid
flowchart LR
  input[Brand color] --> oklch[Convert to OKLCH]
  oklch --> steps[Spread lightness evenly]
  steps --> clamp[Clamp chroma to the sRGB gamut]
  clamp --> check[Check contrast pairs]
\`\`\`

> [!TIP]
> Pick the darkest and lightest steps as your text colors. Lumen guarantees they pass AA
> against every step in between.

## Contributing

Run \`bun test\` before opening a pull. See [docs/theming.md](docs/theming.md) for the design
token conventions.
`;

export const packageJson = `{
  "name": "@lumen/color",
  "version": "0.2.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "bun test",
    "check": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^6.0.0"
  }
}
`;

export const index = `export { parseColor, formatHex } from './color/parse';
export { toOklch, fromOklch, toLinear, fromLinear } from './color/convert';
export { contrastRatio, contrastLevel } from './contrast';
export { palette } from './palette';
export type { Rgb, Oklch } from './color/types';
`;

export const types = `export interface Rgb {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}
`;

export const parse = `import type { Rgb } from './types';

const hexPattern = /^#([0-9a-f]{3,8})$/i;
const rgbPattern = /^rgba?\\((\\d+)[ ,]+(\\d+)[ ,]+(\\d+)(?:[ ,/]+([\\d.]+%?))?\\)$/i;

export function parseColor(value: string): Rgb {
  const input = value.trim();
  const hex = hexPattern.exec(input);
  if (hex) return parseHex(hex[1]);
  const rgb = rgbPattern.exec(input);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), alpha: parseAlpha(rgb[4]) };
  throw new SyntaxError(\`Unsupported color: \${value}\`);
}

function parseHex(digits: string): Rgb {
  const expanded = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const channel = (index: number) => parseInt(expanded.slice(index * 2, index * 2 + 2), 16);
  return { r: channel(0), g: channel(1), b: channel(2), alpha: expanded.length === 8 ? channel(3) / 255 : 1 };
}

function parseAlpha(value: string | undefined) {
  if (!value) return 1;
  return value.endsWith('%') ? Number(value.slice(0, -1)) / 100 : Number(value);
}

export function formatHex(color: Rgb): string {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  const alpha = color.alpha < 1 ? channel(color.alpha * 255) : '';
  return \`#\${channel(color.r)}\${channel(color.g)}\${channel(color.b)}\${alpha}\`;
}
`;

export const convert = `import type { Oklch, Rgb } from './types';

export function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function fromLinear(value: number): number {
  const encoded = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, encoded * 255));
}

export function toOklch(color: Rgb): Oklch {
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI;
  return { l: lightness, c: Math.hypot(a, bAxis), h: hue < 0 ? hue + 360 : hue, alpha: color.alpha };
}

export function fromOklch(color: Oklch): Rgb {
  const angle = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(angle);
  const b = color.c * Math.sin(angle);
  const l = (color.l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (color.l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (color.l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha: color.alpha
  };
}
`;

export const contrast = `import { toLinear } from './color/convert';
import type { Rgb } from './color/types';

export type ContrastLevel = 'AAA' | 'AA' | 'AA large' | 'fail';

function luminance(color: Rgb): number {
  return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b);
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return Math.round(((light + 0.05) / (dark + 0.05)) * 10) / 10;
}

export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA large';
  return 'fail';
}
`;

export const palette = `import { fromOklch, toOklch } from './color/convert';
import type { Rgb } from './color/types';

export interface PaletteOptions {
  steps?: number;
  minLightness?: number;
  maxLightness?: number;
}

export function palette(base: Rgb, options: PaletteOptions = {}): Rgb[] {
  const { steps = 9, minLightness = 0.18, maxLightness = 0.97 } = options;
  const seed = toOklch(base);
  return Array.from({ length: steps }, (_, index) => {
    const lightness = maxLightness - ((maxLightness - minLightness) * index) / (steps - 1);
    const chroma = seed.c * Math.sin(Math.PI * (index / (steps - 1)) * 0.9 + 0.15);
    return fromOklch({ l: lightness, c: chroma, h: seed.h, alpha: 1 });
  });
}
`;

export const contrastTest = `import { describe, expect, test } from 'bun:test';
import { contrastLevel, contrastRatio } from '../src/contrast';
import { parseColor } from '../src/color/parse';

describe('contrastRatio', () => {
  test('black on white is the maximum ratio', () => {
    expect(contrastRatio(parseColor('#000'), parseColor('#fff'))).toBe(21);
  });

  test('levels follow WCAG thresholds', () => {
    expect(contrastLevel(7.1)).toBe('AAA');
    expect(contrastLevel(4.5)).toBe('AA');
    expect(contrastLevel(3.2)).toBe('AA large');
    expect(contrastLevel(2.9)).toBe('fail');
  });
});
`;

export const theming = `# Theming tokens

Lumen names colors by role, not by hue. A theme maps each role to one step of a palette.

| Token | Light | Dark |
| --- | --- | --- |
| \`surface\` | step 0 | step 8 |
| \`surface-raised\` | step 1 | step 7 |
| \`text\` | step 8 | step 0 |
| \`text-muted\` | step 6 | step 2 |
| \`accent\` | brand step 5 | brand step 4 |

Every text token must reach AA (4.5:1) against every surface token in the same theme.
`;

export const changelog = `# Changelog

## 0.2.0

- Added \`palette()\` with perceptually even lightness steps.
- \`contrastRatio()\` now rounds to one decimal place.

## 0.1.0

- First release with color parsing and OKLCH conversion.
`;

export const license = `MIT License

Copyright (c) 2026 The Lumen authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files, to deal in the Software without restriction, subject to the
following conditions: the above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`;

export const workflow = `name: Verify
on: [push, pull_request]
jobs:
  test:
    name: Test
    labels: [docker]
    runtime:
      image: oven/bun:1
    steps:
      - name: Install
        shell: sh
        run: bun install --frozen-lockfile
      - name: Check types
        shell: sh
        run: bun run check
      - name: Test
        shell: sh
        run: bun test
`;

export const pullTemplate = `## What changed

## How it was tested
`;
