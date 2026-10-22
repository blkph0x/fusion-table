import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2).filter((argument) => argument !== "--");
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: pnpm release:source\n\nArchive the clean, committed Git HEAD into releases/fusion-table-vVERSION-source.zip\nand write its SHA-256 checksum. Includes tracked source only; no build or secrets.");
  process.exit(0);
}
if (args.length) throw new Error("This command accepts no arguments. Use --help for usage.");

const run = promisify(execFile);
async function git(...arguments_) {
  const result = await run("git", arguments_, { cwd: projectRoot, maxBuffer: 64 * 1024 * 1024, encoding: "buffer" });
  return result.stdout;
}

const gitRoot = (await git("rev-parse", "--show-toplevel")).toString().trim();
if (path.resolve(gitRoot) !== path.resolve(projectRoot)) {
  throw new Error("Run this script from a standalone Fusion Table Git checkout.");
}
if ((await git("status", "--porcelain=v1", "--untracked-files=normal")).toString().trim()) {
  throw new Error("Commit all source changes and new files before packaging. The release must correspond exactly to a clean Git HEAD.");
}

const filenames = (await git("ls-tree", "-r", "--name-only", "-z", "HEAD")).toString().split("\0").filter(Boolean);
const excludedDirectories = new Set([
  "node_modules", "dist", ".next", ".vinext", ".wrangler", ".sites-runtime", "coverage", ".git",
]);
const knownSecret = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/,
];
const rejected = [];
for (const filename of filenames) {
  const segments = filename.split("/");
  const basename = segments.at(-1);
  const environmentFile = /^\.env|^\.dev\.vars/.test(basename)
    && ![".env.example", ".dev.vars.example"].includes(basename);
  if (segments[0] === "releases" || segments.some((segment) => excludedDirectories.has(segment)) || environmentFile
    || /\.(?:pem|key|p12|pfx)$/i.test(basename) || /^id_(?:rsa|dsa|ecdsa|ed25519)$/.test(basename)) {
    rejected.push(filename);
    continue;
  }
  const content = await git("cat-file", "blob", `HEAD:${filename}`);
  // These checks are a backstop for common key formats, not a secret audit.
  if (!content.includes(0) && knownSecret.some((pattern) => pattern.test(content.toString("utf8")))) rejected.push(filename);
}
if (rejected.length) {
  throw new Error(`Refusing to archive generated state, secret filenames or possible credentials:\n${rejected.join("\n")}\nRemove these from tracked source before making a release. Matched contents are not displayed.`);
}

const manifest = JSON.parse((await git("show", "HEAD:package.json")).toString());
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) throw new Error("package.json needs a valid release version.");
const releaseDirectory = path.join(projectRoot, "releases");
await mkdir(releaseDirectory, { recursive: true });
const filename = `fusion-table-v${manifest.version}-source.zip`;
const archivePath = path.join(releaseDirectory, filename);
await git("archive", "--format=zip", "--prefix=fusion-table/", `--output=${archivePath}`, "HEAD");
const sha256 = createHash("sha256").update(await readFile(archivePath)).digest("hex");
await writeFile(`${archivePath}.sha256`, `${sha256}  ${filename}\n`);
console.log(`Source archive: ${archivePath}\nSHA-256: ${sha256}\nCommit: ${(await git("rev-parse", "HEAD")).toString().trim()}`);
