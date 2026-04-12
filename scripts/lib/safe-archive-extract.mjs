import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Large archives can have long listings; cap avoids unbounded memory. */
const LIST_MAX_BUFFER = 100 * 1024 * 1024;

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
  const relativeToRoot = path.relative(root, resolved);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(
      `Refusing archive: member path escapes extraction directory (${JSON.stringify(memberPath)})`
    );
  }
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
