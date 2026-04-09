import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ARTIFACTS_DIR,
  MANIFESTS_DIR,
  assertManifestShape,
  parseArgs,
  readJson
} from "./lib/artifacts.mjs";

export async function verifyManifest(manifestPath) {
  const manifest = await readJson(manifestPath);
  assertManifestShape(manifest);

  const artifactDir = path.join(ARTIFACTS_DIR, manifest.artifactName, manifest.version);
  for (const file of manifest.files) {
    const absolute = path.join(artifactDir, file.path);
    const buff = await fs.readFile(absolute);
    const sha256 = crypto.createHash("sha256").update(buff).digest("hex");
    if (sha256 !== file.sha256) {
      throw new Error(`SHA mismatch for ${file.path}`);
    }
    if (buff.length !== file.size) {
      throw new Error(`Size mismatch for ${file.path}`);
    }
  }

  const loader = await fs.readFile(
    path.join(artifactDir, manifest.entrypoints.loader.path)
  );
  const sri = `sha384-${crypto.createHash("sha384").update(loader).digest("base64")}`;
  if (sri !== manifest.entrypoints.loader.sri.sha384) {
    throw new Error("loader.js SRI mismatch");
  }
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPaths = [];

  if (args.manifest) {
    manifestPaths.push(path.resolve(String(args.manifest)));
  } else if (args.all) {
    const root = path.join(MANIFESTS_DIR, "emulatorjs");
    const files = await fs.readdir(root);
    for (const file of files) {
      if (file.endsWith(".json")) {
        manifestPaths.push(path.join(root, file));
      }
    }
  } else if (args.version) {
    manifestPaths.push(path.join(MANIFESTS_DIR, "emulatorjs", `${args.version}.json`));
  } else {
    throw new Error("Use --all, --version <x>, or --manifest <path>");
  }

  for (const manifestPath of manifestPaths.sort()) {
    await verifyManifest(manifestPath);
    console.log(`Verified manifest: ${manifestPath}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
