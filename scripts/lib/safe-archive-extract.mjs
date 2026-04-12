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
 * @param {string} archivePath
 * @param {string} extractDir
 */
export async function assert7zMemberPathsSafe(archivePath, extractDir) {
  const { stdout } = await execFileAsync('7z', ['l', '-slt', archivePath], {
    encoding: 'utf8',
    maxBuffer: LIST_MAX_BUFFER,
  });
  for (const match of stdout.matchAll(/^Path = (.+)$/gm)) {
    const p = match[1].trim();
    if (!p) continue;
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
