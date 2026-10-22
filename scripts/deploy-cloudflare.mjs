import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2).filter((argument) => argument !== "--");
const help = `Publish your own Cloudflare Worker after running pnpm build.

Usage: pnpm deploy:cloudflare --name YOUR-OWN-WORKER-NAME [--dry-run | --config-only]

--name         Required: a distinct name for a Worker in your Cloudflare account.
--dry-run      Validate the build without uploading it.
--config-only  Prepare the independent Wrangler configuration without deploying.

The original Sites identity and generated configuration are never modified.
Dashboard variables are preserved by Wrangler --keep-vars. Deployed secrets are
managed separately with Wrangler or your Cloudflare dashboard.
`;

if (args.includes("--help") || args.includes("-h")) {
  console.log(help);
  process.exit(0);
}

let name;
let dryRun = false;
let configOnly = false;
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--name") name = args[++index];
  else if (argument === "--dry-run") dryRun = true;
  else if (argument === "--config-only") configOnly = true;
  else throw new Error(`Unknown argument: ${argument}. Use --help for usage.`);
}

if (!name || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name)) {
  throw new Error("Supply --name with your own Worker name (1–63 lowercase letters, digits or hyphens; start and end with a letter or digit).");
}
if (dryRun && configOnly) throw new Error("Choose --dry-run or --config-only, not both.");

const manifest = JSON.parse(await readFile(path.join(projectRoot, ".openai/hosting.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
if ([manifest.project_id, packageJson.name].includes(name)) {
  throw new Error("Choose your own distinct Worker name, for example alex-fusion-table. The original project name is reserved here to prevent an accidental overwrite.");
}

const buildDirectory = path.join(projectRoot, "dist/server");
let builtConfig;
try {
  builtConfig = JSON.parse(await readFile(path.join(buildDirectory, "wrangler.json"), "utf8"));
} catch (error) {
  if (error.code === "ENOENT") throw new Error("Build the application with pnpm build before preparing a deployment.");
  throw error;
}
if (!builtConfig.main || !builtConfig.assets?.directory) {
  throw new Error("The build must contain both the Worker entry point and client assets. Run pnpm build again.");
}

// Keep generated module/asset/binding paths, which are relative to this folder.
// Do not inherit an account or custom-domain routes from another deployment.
const independentConfig = { ...builtConfig, name, topLevelName: name, workers_dev: true };
delete independentConfig.account_id;
delete independentConfig.route;
delete independentConfig.routes;
delete independentConfig.env;
delete independentConfig.project_id;
const configPath = path.join(buildDirectory, "wrangler.self-hosted.json");
await writeFile(configPath, `${JSON.stringify(independentConfig, null, 2)}\n`);
console.log(`Independent configuration: ${configPath}`);
if (configOnly) process.exit(0);

const result = spawnSync(process.execPath, [
  "--import", path.join(projectRoot, "scripts/sites-env.mjs"),
  path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
  "deploy", "--config", configPath, "--keep-vars", "--experimental-autoconfig=false",
  ...(dryRun ? ["--dry-run"] : []),
], { cwd: projectRoot, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
