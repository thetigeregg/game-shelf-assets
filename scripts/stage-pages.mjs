import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ARTIFACTS_DIR,
  MANIFESTS_DIR,
  parseArgs,
  pathExists
} from "./lib/artifacts.mjs";

export async function stagePagesBundle({ artifactName, version, outDir }) {
  if (!artifactName || artifactName !== "emulatorjs") {
    throw new Error("Only emulatorjs is supported right now");
  }
  if (!version) {
    throw new Error("version is required");
  }
  if (!outDir) {
    throw new Error("outDir is required");
  }

  const artifactVersionDir = path.join(ARTIFACTS_DIR, artifactName, version);
  const manifestFile = path.join(MANIFESTS_DIR, artifactName, `${version}.json`);

  if (!(await pathExists(artifactVersionDir))) {
    throw new Error(`Artifact version directory not found: ${artifactVersionDir}`);
  }
  if (!(await pathExists(manifestFile))) {
    throw new Error(`Manifest file not found: ${manifestFile}`);
  }

  const resolvedOutDir = path.resolve(outDir);
  await fs.rm(resolvedOutDir, { recursive: true, force: true });
  await fs.mkdir(resolvedOutDir, { recursive: true });

  const outArtifactDir = path.join(resolvedOutDir, "third-party", artifactName, version);
  const outManifestDir = path.join(resolvedOutDir, "manifests", "third-party", artifactName);

  await fs.mkdir(path.dirname(outArtifactDir), { recursive: true });
  await fs.mkdir(outManifestDir, { recursive: true });

  await fs.cp(artifactVersionDir, outArtifactDir, { recursive: true });
  await fs.copyFile(manifestFile, path.join(outManifestDir, `${version}.json`));

  console.log(`Staged artifact path: ${outArtifactDir}`);
  console.log(`Staged manifest path: ${path.join(outManifestDir, `${version}.json`)}`);
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  await stagePagesBundle({
    artifactName: String(args.artifact ?? "emulatorjs"),
    version: args.version ? String(args.version) : "",
    outDir: String(args.outDir ?? ".pages-dist")
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
