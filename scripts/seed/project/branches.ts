import { contrast, index, packageJson, parse, theming } from './base';

export type BranchCommit = { message: string; files: Record<string, string> };
export type Branch = { name: string; base: string; commits: BranchCommit[] };

export const clampedPalette = `import { fromOklch, toOklch } from './color/convert';
import type { Oklch, Rgb } from './color/types';

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
    return fromOklch(clampChroma({ l: lightness, c: chroma, h: seed.h, alpha: 1 }));
  });
}

export function clampChroma(color: Oklch): Oklch {
  let low = 0;
  let high = color.c;
  while (high - low > 0.0005) {
    const middle = (low + high) / 2;
    if (inGamut(fromOklch({ ...color, c: middle }))) low = middle;
    else high = middle;
  }
  return { ...color, c: low };
}

function inGamut(color: Rgb): boolean {
  return [color.r, color.g, color.b].every((channel) => channel > 0.5 && channel < 254.5);
}
`;

const paletteTest = `import { describe, expect, test } from 'bun:test';
import { contrastRatio } from '../src/contrast';
import { parseColor } from '../src/color/parse';
import { palette } from '../src/palette';

describe('palette', () => {
  test('returns the requested number of steps', () => {
    expect(palette(parseColor('#e0735a'), { steps: 5 })).toHaveLength(5);
  });

  test('the ends of the ramp pass AA against each other', () => {
    const ramp = palette(parseColor('#3f7fd8'));
    expect(contrastRatio(ramp[0], ramp[8])).toBeGreaterThanOrEqual(4.5);
  });
});
`;

const cache = `import type { Rgb } from './color/types';
import { palette, type PaletteOptions } from './palette';

const cached = new Map<string, Rgb[]>();

export function cachedPalette(base: Rgb, options: PaletteOptions = {}): Rgb[] {
  const key = \`\${base.r},\${base.g},\${base.b}:\${options.steps ?? 9}:\${options.minLightness ?? ''}:\${options.maxLightness ?? ''}\`;
  let ramp = cached.get(key);
  if (!ramp) {
    ramp = palette(base, options);
    cached.set(key, ramp);
  }
  return ramp;
}
`;

const precision = contrast.replace(
  'return Math.round(((light + 0.05) / (dark + 0.05)) * 10) / 10;',
  'return Math.floor(((light + 0.05) / (dark + 0.05)) * 100) / 100;'
);

const hex = `import type { Rgb } from './types';

export const hexPattern = /^#([0-9a-f]{3,8})$/i;

export function parseHex(digits: string): Rgb {
  const expanded = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const channel = (index: number) => parseInt(expanded.slice(index * 2, index * 2 + 2), 16);
  return { r: channel(0), g: channel(1), b: channel(2), alpha: expanded.length === 8 ? channel(3) / 255 : 1 };
}
`;

const parseWithoutHex = parse
  .replace(
    "import type { Rgb } from './types';\n",
    "import { hexPattern, parseHex } from './hex';\nimport type { Rgb } from './types';\n"
  )
  .replace('const hexPattern = /^#([0-9a-f]{3,8})$/i;\n', '')
  .replace(/function parseHex[\s\S]*?\n}\n\n/, '');

const hsl = `import type { Rgb } from './types';

export const hslPattern = /^hsla?\\((\\d+(?:\\.\\d+)?)(?:deg)?[ ,]+(\\d+(?:\\.\\d+)?)%[ ,]+(\\d+(?:\\.\\d+)?)%\\)$/i;

export function parseHsl(match: RegExpExecArray): Rgb {
  const hue = Number(match[1]) / 360;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const channel = (offset: number) => {
    const k = (offset + hue * 12) % 12;
    return 255 * (lightness - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return { r: channel(0), g: channel(8), b: channel(4), alpha: 1 };
}
`;

const parseWithHsl = parseWithoutHex
  .replace(
    "import type { Rgb } from './types';\n",
    "import { hslPattern, parseHsl } from './hsl';\nimport type { Rgb } from './types';\n"
  )
  .replace(
    '  throw new SyntaxError',
    '  const hsl = hslPattern.exec(input);\n  if (hsl) return parseHsl(hsl);\n  throw new SyntaxError'
  );

export const branches: Branch[] = [
  {
    name: 'theo/palette-cache',
    base: 'main',
    commits: [
      {
        message: 'Cache palettes by seed color and options',
        files: {
          'src/cache.ts': cache,
          'src/index.ts': index.replace(
            "export { palette } from './palette';",
            "export { palette } from './palette';\nexport { cachedPalette } from './cache';"
          )
        }
      }
    ]
  },
  {
    name: 'mira/oklch-palette',
    base: 'main',
    commits: [
      { message: 'Clamp palette chroma to the sRGB gamut', files: { 'src/palette.ts': clampedPalette } },
      { message: 'Test palette length and end-to-end contrast', files: { 'test/palette.test.ts': paletteTest } }
    ]
  },
  {
    name: 'jun/contrast-rounding',
    base: 'main',
    commits: [
      { message: 'Stop rounding contrast ratios up across the AA boundary', files: { 'src/contrast.ts': precision } }
    ]
  },
  {
    name: 'sam/theming-docs',
    base: 'main',
    commits: [
      {
        message: 'Document dark mode token mapping',
        files: {
          'docs/theming.md': `${theming}
## Dark mode

Dark themes reuse the same palette in reverse. Raise \`surface-raised\` one step lighter than
\`surface\` so cards stay distinguishable without borders.
`
        }
      }
    ]
  },
  {
    name: 'demo/color-mix-fallback',
    base: 'main',
    commits: [
      {
        message: 'Try emitting color-mix() for unsupported gamuts',
        files: {
          'src/fallback.ts':
            'export const colorMixFallback = (a: string, b: string) => `color-mix(in oklch, ${a}, ${b})`;\n'
        }
      }
    ]
  },
  {
    name: 'demo/parser-module',
    base: 'main',
    commits: [
      {
        message: 'Move hex parsing into its own module',
        files: { 'src/color/hex.ts': hex, 'src/color/parse.ts': parseWithoutHex }
      }
    ]
  },
  {
    name: 'demo/parse-hsl',
    base: 'demo/parser-module',
    commits: [
      {
        message: 'Parse hsl() and hsla() colors',
        files: { 'src/color/hsl.ts': hsl, 'src/color/parse.ts': parseWithHsl }
      }
    ]
  }
];

export const dependencyUpdate: Branch = {
  name: 'lumen-bot/typescript-6.1',
  base: 'main',
  commits: [
    {
      message: 'Bump typescript from 6.0.0 to 6.1.2',
      files: { 'package.json': packageJson.replace('^6.0.0', '^6.1.2') }
    }
  ]
};
