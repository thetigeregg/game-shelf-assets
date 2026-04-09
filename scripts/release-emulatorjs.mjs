import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "./lib/artifacts.mjs";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));

if (args.artifact && args.artifact !== "emulatorjs") {
  throw new Error("Only emulatorjs is supported right now");
}

const version = args.version;
const sourceUrl = args.sourceUrl;
const dryRun = String(args.dryRun ?? "true") !== "false";
const pagesOutDir = args.pagesOutDir ?? ".pages-dist";

const script = (file) => path.join(process.cwd(), "scripts", file);
const passthrough = [];
if (version) passthrough.push("--version", String(version));
if (sourceUrl) passthrough.push("--sourceUrl", String(sourceUrl));

await execFileAsync("node", [script("fetch-emulatorjs.mjs"), ...passthrough], {
  stdio: "inherit"
});
await execFileAsync("node", [script("generate-manifest.mjs"), ...passthrough], {
  stdio: "inherit"
});
await execFileAsync("node", [script("verify-manifest.mjs"), ...passthrough], {
  stdio: "inherit"
});

if (dryRun) {
  console.log("Dry run complete. Publish step skipped.");
} else {
  await execFileAsync(
    "node",
    [
      script("stage-pages.mjs"),
      "--artifact",
      "emulatorjs",
      "--version",
      String(version),
      "--outDir",
      String(pagesOutDir)
    ],
    { stdio: "inherit" }
  );
  console.log(`Prepared GitHub Pages bundle in ${pagesOutDir}.`);
}
