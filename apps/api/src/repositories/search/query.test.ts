import { describe, expect, test } from 'bun:test';
import { parseCodeQuery } from './query';

const plain = { regex: false, caseSensitive: false };

describe('parseCodeQuery', () => {
  test('separates qualifiers from the searched text', () => {
    expect(parseCodeQuery('createAuth lang:ts path:src/auth ext:svelte', plain)).toEqual({
      pattern: 'createAuth',
      regex: false,
      caseSensitive: false,
      paths: ['src/auth'],
      extensions: ['ts', 'tsx', 'mts', 'cts', 'svelte']
    });
  });

  test('keeps quoted phrases and slash-delimited expressions', () => {
    expect(parseCodeQuery('"fn main" path:"my dir"', plain)).toMatchObject({ pattern: 'fn main', paths: ['my dir'] });
    expect(parseCodeQuery('/use\\s+crate/', plain)).toMatchObject({ pattern: 'use\\s+crate', regex: true });
  });
});
