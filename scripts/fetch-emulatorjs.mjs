import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import {
  ARTIFACTS_DIR,
  CONFIG_DIR,
  parseArgs,
  pathExists,
  readJson,
  writeJson,
} from './lib/artifacts.mjs';

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const configPath = path.join(CONFIG_DIR, 'emulatorjs.json');
const config = await readJson(configPath);
const version = args.version ?? config.version;
const sourceUrl = args.sourceUrl ?? config.sourceUrl;
const sourceSubdir = args.sourceSubdir ?? config.sourceSubdir;

if (!version || !sourceUrl || !sourceSubdir) {
  throw new Error('version, sourceUrl, and sourceSubdir are required');
}

/** @param {string} url */
function archiveKindFromUrl(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith('.7z')) return '7z';
  return 'tar.gz';
}

/** @param {Response} response @param {string} destPath */
async function downloadToFile(response, destPath) {
  if (!response.body) {
    throw new Error('Download response has no body');
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destPath));
}

const outDir = path.join(ARTIFACTS_DIR, 'emulatorjs', version);
if (await pathExists(outDir)) {
  throw new Error(`Refusing to overwrite immutable version path: ${outDir}`);
}

const archiveKind = archiveKindFromUrl(sourceUrl);
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'emulatorjs-fetch-'));
const archivePath = path.join(tmpDir, archiveKind === '7z' ? 'source.7z' : 'source.tar.gz');
const extractDir = path.join(tmpDir, 'extract');
await fs.mkdir(extractDir, { recursive: true });

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Failed to download source: ${response.status} ${response.statusText}`);
}
await downloadToFile(response, archivePath);

if (archiveKind === '7z') {
  await execFileAsync('7z', ['x', '-y', archivePath, `-o${extractDir}`]);
} else {
  await execFileAsync('tar', ['-xzf', archivePath, '-C', extractDir]);
}

const sourcePath = path.join(extractDir, sourceSubdir);
if (!(await pathExists(sourcePath))) {
  throw new Error(`sourceSubdir does not exist in archive: ${sourceSubdir}`);
}

await fs.mkdir(path.dirname(outDir), { recursive: true });
await fs.cp(sourcePath, outDir, { recursive: true });

const coresReports = path.join(outDir, 'cores', 'reports');
if (!(await pathExists(coresReports))) {
  throw new Error(
    'Fetched data is missing cores/reports. Use the GitHub release .7z asset, not the tag source tarball.'
  );
}

const metadata = {
  artifactName: 'emulatorjs',
  version,
  source: {
    url: sourceUrl,
    sourceSubdir,
    archiveFormat: archiveKind,
    fetchedAt: new Date().toISOString(),
  },
};

await writeJson(path.join(outDir, '_source.json'), metadata);
await fs.rm(tmpDir, { recursive: true, force: true });
console.log(`Fetched emulatorjs ${version} into ${outDir}`);
