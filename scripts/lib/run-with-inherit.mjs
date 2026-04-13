import { spawn } from 'node:child_process';

/**
 * Run a command with inherited stdio. Unlike execFile, output is not buffered in memory.
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<void>}
 */
export function runWithInherit(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal !== null) {
        reject(new Error(`${command} exited via signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}
