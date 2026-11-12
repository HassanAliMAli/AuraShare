import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards on the design tokens themselves.
 *
 * Two bugs slipped through review in this file and neither showed up as a
 * failing test — both were invisible until the page was measured in a browser:
 *
 *  1. A `--color-base` token made Tailwind resolve `text-base` as a *colour*
 *     rule instead of a font-size, painting a button's label the same colour
 *     as its own background.
 *  2. `font-size: var(--text-base)` on `:root` moved the rem basis off 16px
 *     and silently rescaled every rem-based size on the page.
 *
 * Both are cheap to prevent here.
 */

const TOKENS_PATH = path.resolve(
  import.meta.dirname,
  '../../frontend/src/styles/tokens.css',
);
const BASE_PATH = path.resolve(
  import.meta.dirname,
  '../../frontend/src/styles/base.css',
);

const tokensCss = readFileSync(TOKENS_PATH, 'utf8');
const baseCss = readFileSync(BASE_PATH, 'utf8');

function themeTokens(namespace: string): Map<string, string> {
  const found = new Map<string, string>();
  const re = new RegExp(`--${namespace}-([a-z0-9-]+):\\s*([^;]+);`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(tokensCss)) !== null) {
    found.set(match[1]!, match[2]!.trim());
  }
  return found;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '').trim();
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('styles/tokens — Tailwind namespace safety', () => {
  it('has no colour token whose name collides with a font-size token', () => {
    const colors = themeTokens('color');
    const sizes = themeTokens('text');

    const collisions = [...sizes.keys()].filter((name) => colors.has(name));
    expect(collisions).toEqual([]);
  });

  it('keeps the rem basis at 16px', () => {
    const rootBlock = baseCss.slice(0, baseCss.indexOf('}'));
    expect(rootBlock).toMatch(/font-size:\s*1rem/);
    expect(rootBlock).not.toMatch(/font-size:\s*var\(/);
  });
});

describe('styles/tokens — palette contrast', () => {
  const surfaces = ['canvas', 'surface', 'raised'].map((name) => ({
    name,
    hex: themeTokens('color').get(name)!,
  }));

  const foregrounds = ['text', 'text-2', 'text-3', 'accent', 'success', 'error'];

  it.each(surfaces)('every text colour clears AA on the $name surface', (surface) => {
    for (const name of foregrounds) {
      const hex = themeTokens('color').get(name);
      expect(hex, `${name} token must exist`).toBeTruthy();
      const ratio = contrast(hex!, surface.hex);
      expect(ratio, `${name} on ${surface.name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('keeps accent-ink readable on the accent fill', () => {
    const colors = themeTokens('color');
    expect(contrast(colors.get('accent-ink')!, colors.get('accent')!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('styles/tokens — scale integrity', () => {
  it('defines an eight-step type scale with a 12px floor', () => {
    const sizes = themeTokens('text');
    const px = [...sizes.values()].map((v) => parseFloat(v) * 16);
    expect(px.length).toBe(8);
    expect(Math.min(...px)).toBeGreaterThanOrEqual(12);
    expect(new Set(px).size).toBe(px.length);
  });

  it('defines exactly three type families', () => {
    const fonts = themeTokens('font');
    expect([...fonts.keys()].sort()).toEqual(['body', 'display', 'mono']);
  });
});
