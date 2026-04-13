import { runWithInherit } from './lib/run-with-inherit.mjs';

await runWithInherit('node', ['--check', 'scripts/fetch-emulatorjs.mjs']);
await runWithInherit('node', ['--check', 'scripts/generate-manifest.mjs']);
await runWithInherit('node', ['--check', 'scripts/verify-manifest.mjs']);
await runWithInherit('node', ['--check', 'scripts/release-emulatorjs.mjs']);
await runWithInherit('node', ['--check', 'scripts/stage-pages.mjs']);
await runWithInherit('node', ['--check', 'scripts/lib/artifacts.mjs']);
await runWithInherit('node', ['--check', 'scripts/lib/emulatorjs-archive.mjs']);
await runWithInherit('node', ['--check', 'scripts/lib/safe-archive-extract.mjs']);
await runWithInherit('node', ['--check', 'scripts/lib/run-with-inherit.mjs']);
await runWithInherit('npx', ['tsc', '--noEmit']);

console.log('Lint checks passed.');
