import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Large archives can have long listings; cap avoids unbounded memory. */
const LIST_MAX_BUFFER = 100 * 1024 * 1024;

/**
 * Normalize archive member paths so backslashes act as separators (Windows-style paths in
 * listings are not missed on POSIX, where `\\` would otherwise be a literal character).
 * @param {string} memberPath
 */
export function normalizeArchiveMemberPath(memberPath) {
  return String(memberPath)
    .trim()
    .replace(/[/\\]+$/, '')
    .replace(/\\/g, '/');
}

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
  const rel = normalizeArchiveMemberPath(memberPath);
  if (!rel) return;

  const resolved = path.resolve(root, rel);
  if (resolvedRelativeEscapesExtractRoot(root, resolved)) {
    throw new Error(
      `Refusing archive: member path escapes extraction directory (${JSON.stringify(memberPath)})`
    );
  }
}

/**
 * Walks the extracted tree and rejects symbolic links, hard-linked files, and any node that is
 * not a regular file or directory (FIFOs, sockets, devices). Intended for an empty extract root
 * populated only by the archive.
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
    if (st.isDirectory()) {
      const names = await fs.readdir(currentAbs);
      for (const name of names) {
        await walk(path.join(currentAbs, name));
      }
      return;
    }
    if (st.isFile()) {
      if (st.nlink > 1) {
        const rel = path.relative(root, currentAbs);
        throw new Error(
          `Refusing archive: hard-linked file in extracted tree (${JSON.stringify(rel || '.')})`
        );
      }
      return;
    }
    const rel = path.relative(root, currentAbs);
    throw new Error(
      `Refusing archive: disallowed node type in extracted tree (${JSON.stringify(rel || '.')})`
    );
  }

  await walk(root);
}

function splitTarListingLines(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, '').trimEnd())
    .filter((l) => l.length > 0);
}

/**
 * Rejects symlink / hardlink / device / fifo / socket entries using `tar -tv` mode letter.
 * Allows regular files, directories, and pax extended-header rows (`g`/`x`) so long-name tars work.
 * @param {string} verboseLine one line from `tar -tvzf` / `tar -tvjf` etc.
 */
export function assertTarVerboseListingTypeAllowed(verboseLine) {
  const line = verboseLine.trimEnd();
  if (!line) return;
  const typeChar = line[0];
  if (typeChar === '-' || typeChar === 'd' || typeChar === 'g' || typeChar === 'x') return;
  throw new Error(
    `Refusing archive: disallowed tar entry type ${JSON.stringify(typeChar)} in listing`
  );
}

/**
 * @param {string} archivePath
 * @param {string} extractDir
 */
export async function assertTarMemberPathsSafe(archivePath, extractDir) {
  const [{ stdout: namesOut }, { stdout: verbOut }] = await Promise.all([
    execFileAsync('tar', ['-tzf', archivePath], {
      encoding: 'utf8',
      maxBuffer: LIST_MAX_BUFFER,
    }),
    execFileAsync('tar', ['-tvzf', archivePath], {
      encoding: 'utf8',
      maxBuffer: LIST_MAX_BUFFER,
    }),
  ]);
  const names = splitTarListingLines(namesOut);
  const verbLines = splitTarListingLines(verbOut);
  if (names.length !== verbLines.length) {
    throw new Error(
      'Refusing archive: tar name listing and verbose listing length mismatch; refusing extraction'
    );
  }
  for (let i = 0; i < names.length; i++) {
    assertTarVerboseListingTypeAllowed(verbLines[i]);
    assertArchiveMemberInsideExtractDir(extractDir, names[i]);
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
  return parse7zSltMembers(sltStdout, archivePath).map((m) => m.path);
}

/**
 * @param {string} section text block for one `Path =` entry (including the `Path =` line)
 */
export function assert7zSltMemberSectionSafe(section) {
  if (/^SymLink = \+$/m.test(section) || /^SymLink = yes$/im.test(section)) {
    throw new Error('Refusing archive: 7z listing includes a symbolic-link member');
  }
  if (/^Hard = \+$/m.test(section)) {
    throw new Error('Refusing archive: 7z listing includes a hard-linked member');
  }
}

/**
 * @param {string} sltStdout
 * @param {string} [archivePath]
 * @returns {{ path: string, section: string }[]}
 */
export function parse7zSltMembers(sltStdout, archivePath) {
  const sep = /^-{3,}\s*$/m.exec(sltStdout);
  const body = sep ? sltStdout.slice(sep.index + sep[0].length) : sltStdout;
  const matches = [...body.matchAll(/^Path = (.+)$/gm)];
  const archiveResolved = archivePath ? path.resolve(archivePath) : '';
  const out = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const p = m[1].trim();
    if (!p) continue;
    if (!sep && archiveResolved && path.isAbsolute(p) && path.resolve(p) === archiveResolved) {
      continue;
    }
    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const section = body.slice(start, end);
    out.push({ path: p, section });
  }
  return out;
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
  for (const { path: memberPath, section } of parse7zSltMembers(stdout, archivePath)) {
    assert7zSltMemberSectionSafe(section);
    assertArchiveMemberInsideExtractDir(extractDir, memberPath);
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
