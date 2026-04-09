import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const ROOT = process.cwd();
export const ARTIFACTS_DIR = path.join(ROOT, "artifacts", "third-party");
export const MANIFESTS_DIR = path.join(ROOT, "manifests", "third-party");
export const CONFIG_DIR = path.join(ROOT, "config", "artifacts");

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

export async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

export async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function walkFiles(dir, prefix = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, entry.name);
    const rel = path.join(prefix, entry.name).replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(abs, rel)));
    } else if (entry.isFile()) {
      files.push({ abs, rel });
    }
  }
  return files;
}

export async function fileHash(filePath, algo) {
  const buff = await fs.readFile(filePath);
  return crypto.createHash(algo).update(buff).digest("base64");
}

export async function fileHashHex(filePath, algo) {
  const buff = await fs.readFile(filePath);
  return crypto.createHash(algo).update(buff).digest("hex");
}

export function isImmutableBasePath(basePath) {
  if (!basePath.startsWith("/third-party/")) return false;
  if (!basePath.endsWith("/")) return false;
  const unsafe = ["latest", "stable", "current"];
  return !unsafe.some((token) => basePath.toLowerCase().includes(`/${token}/`));
}

export function assertManifestShape(manifest) {
  if (manifest.artifactName !== "emulatorjs") {
    throw new Error("manifest.artifactName must be emulatorjs");
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    throw new Error("manifest.version is required");
  }
  if (!isImmutableBasePath(manifest.basePath)) {
    throw new Error("manifest.basePath must be immutable version path");
  }
  if (
    !manifest.entrypoints?.loader?.path ||
    manifest.entrypoints.loader.path !== "loader.js"
  ) {
    throw new Error("manifest.entrypoints.loader.path must equal loader.js");
  }
  if (
    typeof manifest.entrypoints.loader.sri?.sha384 !== "string" ||
    !manifest.entrypoints.loader.sri.sha384.startsWith("sha384-")
  ) {
    throw new Error("manifest.entrypoints.loader.sri.sha384 must start with sha384-");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("manifest.files must contain at least one file");
  }
}
