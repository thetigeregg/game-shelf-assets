import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  assertArchiveMemberInsideExtractDir,
  assertExtractedTreeHasNoSymlinks,
  memberPathsFrom7zSltListing,
} from '../scripts/lib/safe-archive-extract.mjs';

describe('assertArchiveMemberInsideExtractDir', () => {
  const root = '/tmp/emulatorjs-extract-test';

  test('allows normal relative paths', () => {
    expect(() => assertArchiveMemberInsideExtractDir(root, 'data/file.js')).not.toThrow();
    expect(() => assertArchiveMemberInsideExtractDir(root, 'data/sub/')).not.toThrow();
  });

  test('allows names that start with .. as a prefix (not a parent segment)', () => {
    expect(() => assertArchiveMemberInsideExtractDir(root, '..foo/bar')).not.toThrow();
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

describe('assertExtractedTreeHasNoSymlinks', () => {
  test('allows a tree with only files and directories', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nosym-extract-'));
    try {
      await fs.mkdir(path.join(dir, 'a'), { recursive: true });
      await fs.writeFile(path.join(dir, 'a', 'b.txt'), 'x');
      await expect(assertExtractedTreeHasNoSymlinks(dir)).resolves.toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('rejects trees that contain a symlink', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sym-extract-'));
    try {
      await fs.writeFile(path.join(dir, 'f'), 'x');
      await fs.symlink('f', path.join(dir, 'l'));
      await expect(assertExtractedTreeHasNoSymlinks(dir)).rejects.toThrow(/symbolic link/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
