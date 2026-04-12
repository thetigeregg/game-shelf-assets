import { describe, expect, test } from 'vitest';
import { assertArchiveMemberInsideExtractDir } from '../scripts/lib/safe-archive-extract.mjs';

describe('assertArchiveMemberInsideExtractDir', () => {
  const root = '/tmp/emulatorjs-extract-test';

  test('allows normal relative paths', () => {
    expect(() => assertArchiveMemberInsideExtractDir(root, 'data/file.js')).not.toThrow();
    expect(() => assertArchiveMemberInsideExtractDir(root, 'data/sub/')).not.toThrow();
  });

  test('rejects parent traversal', () => {
    expect(() => assertArchiveMemberInsideExtractDir(root, '../outside')).toThrow(
      /escapes extraction directory/
    );
    expect(() => assertArchiveMemberInsideExtractDir(root, 'a/../../b')).toThrow(
      /escapes extraction directory/
    );
  });

  test('rejects absolute paths', () => {
    expect(() => assertArchiveMemberInsideExtractDir(root, '/etc/passwd')).toThrow(
      /escapes extraction directory/
    );
  });

  test('ignores empty lines', () => {
    expect(() => assertArchiveMemberInsideExtractDir(root, '   ')).not.toThrow();
    expect(() => assertArchiveMemberInsideExtractDir(root, '')).not.toThrow();
  });
});
