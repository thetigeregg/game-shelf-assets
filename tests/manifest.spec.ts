import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertManifestShape,
  fileHash,
  isImmutableBasePath
} from "../scripts/lib/artifacts.mjs";

describe("manifest schema and policy", () => {
  test("accepts immutable base path", () => {
    expect(isImmutableBasePath("/third-party/emulatorjs/4.2.3/")).toBe(true);
    expect(isImmutableBasePath("/third-party/emulatorjs/latest/")).toBe(false);
    expect(isImmutableBasePath("/third-party/emulatorjs/stable/")).toBe(false);
  });

  test("requires sha384- prefixed loader SRI", async () => {
    const file = path.join(process.cwd(), "tests", ".tmp-loader.js");
    await fs.writeFile(file, "console.log('loader');\n", "utf8");
    const sri = `sha384-${await fileHash(file, "sha384")}`;

    const manifest = {
      artifactName: "emulatorjs",
      version: "9.9.9",
      basePath: "/third-party/emulatorjs/9.9.9/",
      source: { url: "https://example.com", fetchedAt: new Date().toISOString() },
      entrypoints: { loader: { path: "loader.js", sri: { sha384: sri } } },
      files: [{ path: "loader.js", size: 1, sha256: "abc" }],
      createdAt: new Date().toISOString()
    };

    expect(() => assertManifestShape(manifest)).not.toThrow();
    await fs.rm(file, { force: true });
  });

  test("rejects missing required fields", () => {
    expect(() =>
      assertManifestShape({
        artifactName: "emulatorjs",
        version: "1.0.0",
        basePath: "/third-party/emulatorjs/1.0.0/",
        entrypoints: { loader: { path: "loader.js", sri: { sha384: "bad-value" } } },
        files: []
      })
    ).toThrow();
  });
});
