declare module "../scripts/lib/artifacts.mjs" {
  export function assertManifestShape(manifest: unknown): void;
  export function fileHash(filePath: string, algo: string): Promise<string>;
  export function isImmutableBasePath(basePath: string): boolean;
}

declare module "../scripts/generate-manifest.mjs" {
  export function buildManifestForVersion(version: string): Promise<string>;
}

declare module "../scripts/verify-manifest.mjs" {
  export function verifyManifest(manifestPath: string): Promise<void>;
}
