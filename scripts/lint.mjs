import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

await execFileAsync('node', ['--check', 'scripts/fetch-emulatorjs.mjs'], { stdio: 'inherit' });
await execFileAsync('node', ['--check', 'scripts/generate-manifest.mjs'], { stdio: 'inherit' });
await execFileAsync('node', ['--check', 'scripts/verify-manifest.mjs'], { stdio: 'inherit' });
await execFileAsync('node', ['--check', 'scripts/release-emulatorjs.mjs'], { stdio: 'inherit' });
await execFileAsync('node', ['--check', 'scripts/stage-pages.mjs'], { stdio: 'inherit' });
await execFileAsync('node', ['--check', 'scripts/lib/artifacts.mjs'], { stdio: 'inherit' });
await execFileAsync('node', ['--check', 'scripts/lib/emulatorjs-archive.mjs'], {
  stdio: 'inherit',
});
await execFileAsync('npx', ['tsc', '--noEmit'], { stdio: 'inherit' });

console.log('Lint checks passed.');
