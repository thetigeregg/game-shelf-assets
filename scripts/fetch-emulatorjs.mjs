import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ARTIFACTS_DIR,
  CONFIG_DIR,
  parseArgs,
  pathExists,
  readJson,
  writeJson
} from "./lib/artifacts.mjs";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const configPath = path.join(CONFIG_DIR, "emulatorjs.json");
const config = await readJson(configPath);
const version = args.version ?? config.version;
const sourceUrl = args.sourceUrl ?? config.sourceUrl;
const sourceSubdir = args.sourceSubdir ?? config.sourceSubdir;

if (!version || !sourceUrl || !sourceSubdir) {
  throw new Error("version, sourceUrl, and sourceSubdir are required");
}

const outDir = path.join(ARTIFACTS_DIR, "emulatorjs", version);
if (await pathExists(outDir)) {
  throw new Error(`Refusing to overwrite immutable version path: ${outDir}`);
}

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "emulatorjs-fetch-"));
const archivePath = path.join(tmpDir, "source.tar.gz");
const extractDir = path.join(tmpDir, "extract");
await fs.mkdir(extractDir, { recursive: true });

const response = await fetch(sourceUrl);
if (!response.ok) {
  throw new Error(`Failed to download source: ${response.status} ${response.statusText}`);
}
await fs.writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir]);

const sourcePath = path.join(extractDir, sourceSubdir);
if (!(await pathExists(sourcePath))) {
  throw new Error(`sourceSubdir does not exist in archive: ${sourceSubdir}`);
}

await fs.mkdir(path.dirname(outDir), { recursive: true });
await fs.cp(sourcePath, outDir, { recursive: true });

const metadata = {
  artifactName: "emulatorjs",
  version,
  source: {
    url: sourceUrl,
    sourceSubdir,
    fetchedAt: new Date().toISOString()
  }
};

await writeJson(path.join(outDir, "_source.json"), metadata);
await fs.rm(tmpDir, { recursive: true, force: true });
console.log(`Fetched emulatorjs ${version} into ${outDir}`);
