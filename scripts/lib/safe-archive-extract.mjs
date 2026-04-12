import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Large archives can have long listings; cap avoids unbounded memory. */
const LIST_MAX_BUFFER = 100 * 1024 * 1024;

/**
 * True when path.relative(root, resolved) denotes escaping the root (zip-slip), including
 * cross-drive results on Windows (absolute relative).
 * Does not treat `..foo` as `..` + segment — only real `..` path segments.
 * @param {string} rootResolved
 * @param {string} resolvedMember
 */
export function resolvedRelativeEscapesExtractRoot(rootResolved, resolvedMember) {
  const relativeToRoot = path.relative(rootResolved, resolvedMember);
  if (path.isAbsolute(relativeToRoot)) return true;
  if (relativeToRoot === '..') return true;
  if (relativeToRoot.startsWith('..' + path.sep)) return true;
  return false;
}

/**
 * Ensures a member path cannot escape extractDir (zip-slip / absolute paths).
 * @param {string} extractDir
 * @param {string} memberPath
 */
export function assertArchiveMemberInsideExtractDir(extractDir, memberPath) {
  const root = path.resolve(extractDir);
  const raw = String(memberPath).trim();
  if (!raw) return;

  const rel = raw.replace(/[/\\]+$/, '');
  const resolved = path.resolve(root, rel);
  if (resolvedRelativeEscapesExtractRoot(root, resolved)) {
    throw new Error(
      `Refusing archive: member path escapes extraction directory (${JSON.stringify(memberPath)})`
    );
  }
}

/**
 * Walks the extracted tree and rejects any symbolic link (mitigates symlink-based escapes
 * during/after extraction). Intended for an empty extract root populated only by the archive.
 * @param {string} rootDir
 */
export async function assertExtractedTreeHasNoSymlinks(rootDir) {
  const root = path.resolve(rootDir);

  async function walk(currentAbs) {
    const st = await fs.lstat(currentAbs);
    if (st.isSymbolicLink()) {
      const rel = path.relative(root, currentAbs);
      throw new Error(
        `Refusing archive: symbolic link in extracted tree (${JSON.stringify(rel || '.')})`
      );
    }
    if (!st.isDirectory()) return;
    const names = await fs.readdir(currentAbs);
    for (const name of names) {
      await walk(path.join(currentAbs, name));
    }
  }

  await walk(root);
}

/**
 * @param {string} archivePath
 * @param {string} extractDir
 */
export async function assertTarMemberPathsSafe(archivePath, extractDir) {
  const { stdout } = await execFileAsync('tar', ['-tzf', archivePath], {
    encoding: 'utf8',
    maxBuffer: LIST_MAX_BUFFER,
  });
  for (const line of stdout.split(/\r?\n/)) {
    const name = line.replace(/\r$/, '').trimEnd();
    if (!name) continue;
    assertArchiveMemberInsideExtractDir(extractDir, name);
  }
}

/**
 * Returns member paths from `7z l -slt` stdout. The listing begins with archive metadata
 * including `Path = <absolute .7z path>`; member entries follow a `----------` separator.
 * @param {string} sltStdout
 * @param {string} [archivePath] when set, used to skip a header Path if no separator is found
 * @returns {string[]}
 */
export function memberPathsFrom7zSltListing(sltStdout, archivePath) {
  const sep = /^-{3,}\s*$/m.exec(sltStdout);
  const body = sep ? sltStdout.slice(sep.index + sep[0].length) : sltStdout;
  const paths = [];
  const archiveResolved = archivePath ? path.resolve(archivePath) : '';
  for (const match of body.matchAll(/^Path = (.+)$/gm)) {
    const p = match[1].trim();
    if (!p) continue;
    if (!sep && archiveResolved && path.isAbsolute(p) && path.resolve(p) === archiveResolved) {
      continue;
    }
    paths.push(p);
  }
  return paths;
}

/**
 * @param {string} archivePath
 * @param {string} extractDir
 */
export async function assert7zMemberPathsSafe(archivePath, extractDir) {
  const { stdout } = await execFileAsync('7z', ['l', '-slt', archivePath], {
    encoding: 'utf8',
    maxBuffer: LIST_MAX_BUFFER,
  });
  for (const p of memberPathsFrom7zSltListing(stdout, archivePath)) {
    assertArchiveMemberInsideExtractDir(extractDir, p);
  }
}

/** @returns {Promise<string[]>} extra flags for `tar -x` (GNU tar only). */
export async function gnuTarExtractSafetyFlags() {
  try {
    const { stdout } = await execFileAsync('tar', ['--version'], { encoding: 'utf8' });
    if (stdout.includes('GNU tar')) {
      return ['--no-absolute-names'];
    }
  } catch {
    // ignore: unknown tar
  }
  return [];
}
