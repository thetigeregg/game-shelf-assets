# game-shelf-assets

Immutable third-party static artifact repository for Game Shelf.

## What this repo publishes

- Artifact paths: `/third-party/<artifact>/<version>/...`
- Initial artifact: `emulatorjs`
- Manifest paths: `manifests/third-party/emulatorjs/<version>.json`

## Install

```bash
npm install
```

## Commands

- `npm run artifact:fetch:emulatorjs` - fetch pinned EmulatorJS artifact snapshot.
- `npm run build:manifests` - generate manifests for local artifact versions.
- `npm run verify:all` - verify all manifests against current artifact bytes.
- `npm run artifact:release:emulatorjs` - fetch, manifest, verify, then publish hook.
- `npm run lint` - script syntax checks + typecheck.
- `npm test` - unit/integration tests.

## Config

`config/artifacts/emulatorjs.json` pins upstream source and version.

Example:

```json
{
  "artifactName": "emulatorjs",
  "version": "4.2.3",
  "sourceUrl": "https://github.com/EmulatorJS/EmulatorJS/archive/refs/tags/v4.2.3.tar.gz",
  "sourceSubdir": "EmulatorJS-4.2.3/stable/data"
}
```

## Manifest contract

Each `manifests/third-party/emulatorjs/<version>.json` contains:

- `artifactName`
- `version`
- `basePath` (must be immutable version path)
- `source` (URL and timestamp metadata)
- `entrypoints.loader.path`
- `entrypoints.loader.sri.sha384` (must be `sha384-...`)
- `files[]` entries: `path`, `size`, `sha256`
- `createdAt`

## Consumer integration

In the Game Shelf app, pin both values from the manifest:

- `emulatorJsPathToData = <domain>/third-party/emulatorjs/<version>/`
- `emulatorJsLoaderIntegrity = <manifest.entrypoints.loader.sri.sha384>`

Never use moving paths such as `/latest/` or `/stable/`.

## Rollback

1. Pick a previous manifest version in this repo.
2. Update app pins to that prior version path and SRI.
3. Redeploy app.

No asset overwrite is needed; versioned paths remain immutable.

## Release workflow

GitHub Actions workflow `Release EmulatorJS` accepts:

- `emulatorjsVersion`
- `sourceUrl`
- `dryRun`

Flow:

1. Fetch pinned artifact bytes.
2. Generate manifest with sha256 file hashes and loader sha384 SRI.
3. Verify integrity.
4. Stage a GitHub Pages bundle when `dryRun=false`.
5. Open release PR when `dryRun=false`.
6. Deploy staged bundle to GitHub Pages when `dryRun=false`.

## Production release runbook (GitHub Pages)

1. Go to `Actions` -> `Release EmulatorJS` -> `Run workflow`.
2. Set:
   - `emulatorjsVersion` to the pinned tag (for example `4.2.3`)
   - `sourceUrl` to matching upstream archive URL
   - `dryRun=false` for production publish
3. Confirm the run finishes both `release` and `deploy` jobs.
4. Merge the generated release PR.

Published URL pattern:

- `https://<org-or-user>.github.io/<repo>/third-party/emulatorjs/<version>/`
- `https://<org-or-user>.github.io/<repo>/manifests/third-party/emulatorjs/<version>.json`

Use the manifest to pin both values in your app:

- `emulatorJsPathToData = https://<org-or-user>.github.io/<repo>/third-party/emulatorjs/<version>/`
- `emulatorJsLoaderIntegrity = <manifest.entrypoints.loader.sri.sha384>`

## Publish strategy

The release script now stages a GitHub Pages artifact in `.pages-dist` during non-dry-run releases. The workflow uploads that directory and deploys it with official GitHub Pages actions. Keep all paths immutable under versioned directories.
