import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2).filter((argument) => argument !== "--");
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm release:worker\n\nPackage a fresh pnpm build as an independent Cloudflare Worker .tar.gz with a checksum. Requires tar. Does not deploy.");
  process.exit(0);
}
if (args.length) throw new Error("This command accepts no arguments. Use --help for usage.");

const manifest = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) throw new Error("package.json needs a valid release version.");
const config = JSON.parse(await readFile(path.join(projectRoot, "dist/server/wrangler.json"), "utf8"));
if (!config.main || !config.assets?.directory) throw new Error("Run pnpm build to create both Worker and client assets first.");
const resourceArrays = [
  "services", "d1_databases", "r2_buckets", "kv_namespaces", "hyperdrive", "vectorize",
  "workflows", "secrets_store_secrets", "dispatch_namespaces", "mtls_certificates", "pipelines",
  "vpc_services", "vpc_networks", "send_email", "analytics_engine_datasets",
];
if (resourceArrays.some((key) => config[key]?.length)
  || config.durable_objects?.bindings?.length || config.queues?.producers?.length || config.queues?.consumers?.length) {
  throw new Error("This build contains provisioned resource/service bindings. Configure independent resources before distributing it; original-account bindings cannot be inherited by this release helper.");
}
function assertRelativePaths(value, location = "config") {
  if (typeof value === "string" && (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.startsWith("file://"))) {
    throw new Error(`Absolute build path at ${location}; the Worker bundle must be relocatable.`);
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) assertRelativePaths(entry, `${location}.${key}`);
  }
}
assertRelativePaths({ main: config.main, assets: config.assets, build: config.build, rules: config.rules, tsconfig: config.tsconfig });
const releaseDirectory = path.join(projectRoot, "releases");
await mkdir(releaseDirectory, { recursive: true });
const staging = await mkdtemp(path.join(releaseDirectory, ".worker-stage-"));
const prefix = `fusion-table-worker-v${manifest.version}`;
const bundleRoot = path.join(staging, prefix);
const excluded = (name) => /^\.env|^\.dev\.vars/.test(name) || name === ".openai"
  || name === "node_modules" || name === ".wrangler" || name === ".sites-runtime"
  || /\.(?:pem|key|p12|pfx)$/i.test(name) || /^id_(?:rsa|dsa|ecdsa|ed25519)$/.test(name)
  || /^wrangler(?:\.[^.]+)?\.jsonc?$/.test(name);
const credentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/]{40}/,
  /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/,
];

async function copyBuild(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = (await readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (excluded(entry.name)) continue;
    const input = path.join(source, entry.name);
    const output = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing a symlink in a release build: ${path.relative(projectRoot, input)}`);
    if (entry.isDirectory()) await copyBuild(input, output);
    else if (entry.isFile()) {
      const content = await readFile(input);
      if (!content.includes(0) && credentialPatterns.some((pattern) => pattern.test(content.toString("utf8")))) {
        throw new Error(`Possible credential in build: ${path.relative(projectRoot, input)}. Contents were not displayed.`);
      }
      await cp(input, output);
    }
  }
}

try {
  await copyBuild(path.join(projectRoot, "dist/server"), path.join(bundleRoot, "dist/server"));
  await copyBuild(path.join(projectRoot, "dist/client"), path.join(bundleRoot, "dist/client"));
  const portable = { ...config, workers_dev: true, vars: {} };
  delete portable.name;
  delete portable.topLevelName;
  delete portable.account_id;
  delete portable.project_id;
  delete portable.routes;
  delete portable.route;
  delete portable.env;
  await writeFile(path.join(bundleRoot, "dist/server/wrangler.json"), `${JSON.stringify(portable, null, 2)}\n`);
  await writeFile(path.join(bundleRoot, "README.md"), `# Fusion Table ${manifest.version} — Cloudflare Worker bundle

This bundle contains the compiled Worker and client assets. For editable source,
use the matching source ZIP or Git repository. No local environment files, Sites project manifest, original Worker name or
account configuration is included.

Use Node.js 22.13.0+ and deploy into your own Cloudflare account. From this folder:

\`\`\`sh
npx --yes wrangler@${manifest.devDependencies.wrangler} login
npx --yes wrangler@${manifest.devDependencies.wrangler} deploy --config dist/server/wrangler.json --name your-name-fusion-table --keep-vars --dry-run
npx --yes wrangler@${manifest.devDependencies.wrangler} deploy --config dist/server/wrangler.json --name your-name-fusion-table --keep-vars
\`\`\`

Use your own distinct Worker name in every command. The configuration deliberately
omits a name. A dry run does not upload. The final deploy publishes the Worker and
prints its actual URL; its audience is managed in your Cloudflare account and does
not inherit the original Site's private access.

Recipes are assembled deterministically from the included templates. No runtime
language model, paid generation service or recipe API credential is used.

For a private whole-site audience configure an authentication layer in your own
hosting account. Runtime provider variables were cleared for this independent
bundle. Configure any optional map overrides in your own Worker settings; the
default map services work without keys. No database is required.

Full guide: https://github.com/blkph0x/fusion-table/blob/v${manifest.version}/docs/SELF_HOSTING.md
`);
  const archivePath = path.join(releaseDirectory, `fusion-table-v${manifest.version}-cloudflare-worker.tar.gz`);
  await promisify(execFile)("tar", ["-czf", archivePath, "-C", staging, prefix], { cwd: projectRoot });
  const sha256 = createHash("sha256").update(await readFile(archivePath)).digest("hex");
  await writeFile(`${archivePath}.sha256`, `${sha256}  ${path.basename(archivePath)}\n`);
  console.log(`Worker archive: ${archivePath}\nSHA-256: ${sha256}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
