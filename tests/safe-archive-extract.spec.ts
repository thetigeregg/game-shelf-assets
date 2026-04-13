import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import {
  assert7zSltMemberSectionSafe,
  assertArchiveMemberInsideExtractDir,
  assertExtractedTreeHasNoSymlinks,
  assertTarMemberPathsSafe,
  assertTarVerboseListingTypeAllowed,
  memberPathsFrom7zSltListing,
  normalizeArchiveMemberPath,
} from '../scripts/lib/safe-archive-extract.mjs';

const execFileAsync = promisify(execFile);

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

  test('treats backslashes as separators so Windows-style traversal is caught on POSIX', () => {
    expect(() => assertArchiveMemberInsideExtractDir(root, 'a\\..\\..\\b')).toThrow(
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

describe('normalizeArchiveMemberPath for sourceSubdir', () => {
  test('normalizes backslashes so path.join(extractDir, …) matches validation on POSIX', () => {
    const extractDir = '/tmp/emulatorjs-extract-xyz';
    const raw = 'data\\stable';
    const norm = normalizeArchiveMemberPath(raw);
    expect(norm).toBe('data/stable');
    expect(path.join(extractDir, norm)).toBe(path.join(extractDir, 'data', 'stable'));
  });
});

describe('assertTarVerboseListingTypeAllowed', () => {
  test('allows files, dirs, and pax header rows', () => {
    expect(() =>
      assertTarVerboseListingTypeAllowed('-rw-r--r-- 0 u g 1 2000-01-01 00:00 a')
    ).not.toThrow();
    expect(() =>
      assertTarVerboseListingTypeAllowed('drwxr-xr-x 0 u g 0 2000-01-01 00:00 d/')
    ).not.toThrow();
    expect(() => assertTarVerboseListingTypeAllowed('g blah')).not.toThrow();
    expect(() => assertTarVerboseListingTypeAllowed('x blah')).not.toThrow();
  });

  test('rejects symlink and hardlink rows', () => {
    expect(() =>
      assertTarVerboseListingTypeAllowed('lrwxrwxrwx 0 u g 0 2000-01-01 00:00 s -> t')
    ).toThrow(/disallowed tar entry type/);
    expect(() =>
      assertTarVerboseListingTypeAllowed('hrw-r--r-- 0 u g 0 2000-01-01 00:00 f2 link to f1')
    ).toThrow(/disallowed tar entry type/);
  });
});

describe('assert7zSltMemberSectionSafe', () => {
  test('allows normal sections', () => {
    expect(() =>
      assert7zSltMemberSectionSafe('Path = a.txt\nSize = 1\nAttributes = A_ -rw-r--r--\n')
    ).not.toThrow();
  });

  test('rejects SymLink = +', () => {
    expect(() => assert7zSltMemberSectionSafe('Path = s\nSymLink = +\n')).toThrow(
      /symbolic-link member/
    );
  });

  test('rejects Hard = +', () => {
    expect(() => assert7zSltMemberSectionSafe('Path = h\nHard = +\n')).toThrow(
      /hard-linked member/
    );
  });
});

describe('assertTarMemberPathsSafe', () => {
  test('allows archives with only files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-ok-'));
    const arc = path.join(dir, 'a.tgz');
    try {
      await fs.writeFile(path.join(dir, 'f'), 'x');
      await execFileAsync('tar', ['-czf', arc, '-C', dir, 'f']);
      await expect(assertTarMemberPathsSafe(arc, dir)).resolves.toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('rejects archives that list symlink members', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-bad-sym-'));
    const arc = path.join(dir, 'a.tgz');
    try {
      await fs.writeFile(path.join(dir, 'f'), 'x');
      await fs.symlink('f', path.join(dir, 's'));
      await execFileAsync('tar', ['-czf', arc, '-C', dir, 'f', 's']);
      await expect(assertTarMemberPathsSafe(arc, dir)).rejects.toThrow(/disallowed tar entry type/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('rejects archives that list hard-linked members', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tar-bad-hl-'));
    const arc = path.join(dir, 'a.tgz');
    try {
      const f1 = path.join(dir, 'f1');
      await fs.writeFile(f1, 'x');
      await fs.link(f1, path.join(dir, 'f2'));
      await execFileAsync('tar', ['-czf', arc, '-C', dir, 'f1', 'f2']);
      await expect(assertTarMemberPathsSafe(arc, dir)).rejects.toThrow(/disallowed tar entry type/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
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

  test('rejects trees that contain hard-linked files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hardlink-extract-'));
    try {
      const a = path.join(dir, 'a');
      const b = path.join(dir, 'b');
      await fs.writeFile(a, 'x');
      await fs.link(a, b);
      await expect(assertExtractedTreeHasNoSymlinks(dir)).rejects.toThrow(/hard-linked file/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test('rejects FIFO special files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fifo-extract-'));
    const fifo = path.join(dir, 'p');
    try {
      await execFileAsync('mkfifo', [fifo]);
    } catch {
      return;
    }
    try {
      await expect(assertExtractedTreeHasNoSymlinks(dir)).rejects.toThrow(/disallowed node type/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
