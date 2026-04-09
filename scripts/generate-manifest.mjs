import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ARTIFACTS_DIR,
  MANIFESTS_DIR,
  assertManifestShape,
  fileHash,
  fileHashHex,
  parseArgs,
  pathExists,
  readJson,
  walkFiles,
  writeJson
} from "./lib/artifacts.mjs";

export async function buildManifestForVersion(version) {
  const artifactDir = path.join(ARTIFACTS_DIR, "emulatorjs", version);
  if (!(await pathExists(artifactDir))) {
    throw new Error(`Artifact directory not found: ${artifactDir}`);
  }

  const loaderPath = path.join(artifactDir, "loader.js");
  if (!(await pathExists(loaderPath))) {
    throw new Error(`Required entrypoint not found: ${loaderPath}`);
  }

  const sourceFile = path.join(artifactDir, "_source.json");
  const sourceData = (await pathExists(sourceFile))
    ? await readJson(sourceFile)
    : { source: { url: "unknown", fetchedAt: new Date().toISOString() } };

  const files = [];
  for (const file of await walkFiles(artifactDir)) {
    const stat = await fs.stat(file.abs);
    files.push({
      path: file.rel,
      size: stat.size,
      sha256: await fileHashHex(file.abs, "sha256")
    });
  }

  const manifest = {
    artifactName: "emulatorjs",
    version,
    basePath: `/third-party/emulatorjs/${version}/`,
    source: sourceData.source ?? sourceData,
    entrypoints: {
      loader: {
        path: "loader.js",
        sri: {
          sha384: `sha384-${await fileHash(loaderPath, "sha384")}`
        }
      }
    },
    files,
    createdAt: new Date().toISOString()
  };

  assertManifestShape(manifest);
  const outPath = path.join(MANIFESTS_DIR, "emulatorjs", `${version}.json`);
  await writeJson(outPath, manifest);
  return outPath;
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifactRoot = path.join(ARTIFACTS_DIR, "emulatorjs");

  const versions = args.all
    ? await fs.readdir(artifactRoot)
    : [args.version ?? ""].filter(Boolean);

  if (versions.length === 0) {
    throw new Error("Provide --version <x> or use --all with existing artifacts");
  }

  for (const version of versions.sort()) {
    const outPath = await buildManifestForVersion(version);
    console.log(`Generated manifest: ${outPath}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
