import { describe, expect, test } from 'vitest';
import {
  assertArchiveMemberInsideExtractDir,
  memberPathsFrom7zSltListing,
} from '../scripts/lib/safe-archive-extract.mjs';

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

describe('memberPathsFrom7zSltListing', () => {
  const sampleSlt = `
7-Zip [64] 17.05

Listing archive: /tmp/example/t.7z

--
Path = /tmp/example/t.7z
Type = 7z
Physical Size = 123

----------
Path = data/readme.txt
Size = 5

Path = data/other.bin
Size = 1
`;

  test('drops archive header Path before the dashed separator', () => {
    expect(memberPathsFrom7zSltListing(sampleSlt)).toEqual(['data/readme.txt', 'data/other.bin']);
  });

  test('without separator, skips Path equal to archive path when provided', () => {
    const noSep = 'Path = /abs/archive.7z\nType = 7z\n\nPath = safe/file.txt\n';
    expect(memberPathsFrom7zSltListing(noSep, '/abs/archive.7z')).toEqual(['safe/file.txt']);
  });
});
