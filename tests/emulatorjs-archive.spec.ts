import { describe, expect, test } from 'vitest';
import { archiveKindFromUrl } from '../scripts/lib/emulatorjs-archive.mjs';

describe('archiveKindFromUrl', () => {
  test('detects GitHub release .7z assets', () => {
    expect(
      archiveKindFromUrl(
        'https://github.com/EmulatorJS/EmulatorJS/releases/download/v4.2.3/4.2.3.7z'
      )
    ).toBe('7z');
  });

  test('treats .7z case-insensitively on the path', () => {
    expect(archiveKindFromUrl('https://example.com/asset.7Z')).toBe('7z');
  });

  test('ignores query strings when reading the pathname suffix', () => {
    expect(archiveKindFromUrl('https://example.com/pkg.7z?token=abc')).toBe('7z');
  });

  test('defaults to tar.gz for non-.7z archives', () => {
    expect(
      archiveKindFromUrl('https://github.com/EmulatorJS/EmulatorJS/archive/refs/tags/v4.2.3.tar.gz')
    ).toBe('tar.gz');
  });

  test('rejects invalid URLs', () => {
    expect(() => archiveKindFromUrl('not-a-url')).toThrow();
  });
});
