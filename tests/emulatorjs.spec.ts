import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { buildManifestForVersion } from "../scripts/generate-manifest.mjs";
import { verifyManifest } from "../scripts/verify-manifest.mjs";

const version = "0.0.0-test";
const artifactDir = path.join(
  process.cwd(),
  "artifacts",
  "third-party",
  "emulatorjs",
  version
);
const manifestPath = path.join(
  process.cwd(),
  "manifests",
  "third-party",
  "emulatorjs",
  `${version}.json`
);

describe("emulatorjs integration", () => {
  test("builds and verifies a manifest, then detects tamper", async () => {
    await fs.rm(artifactDir, { recursive: true, force: true });
    await fs.rm(manifestPath, { force: true });
    await fs.mkdir(path.join(artifactDir, "assets"), { recursive: true });

    await fs.writeFile(path.join(artifactDir, "loader.js"), "window.loader = true;\n");
    await fs.writeFile(path.join(artifactDir, "assets", "a.bin"), "fixture-bytes\n");
    await fs.writeFile(
      path.join(artifactDir, "_source.json"),
      JSON.stringify(
        {
          source: {
            url: "https://example.com/source.tgz",
            fetchedAt: new Date().toISOString()
          }
        },
        null,
        2
      )
    );

    const builtPath = await buildManifestForVersion(version);
    expect(builtPath).toBe(manifestPath);
    await verifyManifest(manifestPath);

    await fs.writeFile(path.join(artifactDir, "assets", "a.bin"), "tampered\n");
    await expect(verifyManifest(manifestPath)).rejects.toThrow("SHA mismatch");

    await fs.rm(artifactDir, { recursive: true, force: true });
    await fs.rm(manifestPath, { force: true });
  });
});
