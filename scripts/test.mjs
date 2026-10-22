import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

async function discoverTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return discoverTests(filename);
    return /\.test\.(?:ts|mts|js|mjs)$/.test(entry.name) ? [filename] : [];
  }));
  return nested.flat().sort();
}

const tests = await discoverTests(path.join(projectRoot, "tests"));
if (!tests.length) throw new Error("No test files were found under tests/.");

// Expand filenames in Node so this command also works in Windows shells.
const flags = process.argv.slice(2).filter((argument) => argument !== "--");
const result = spawnSync(process.execPath, [
  "--experimental-strip-types", "--test", ...flags, ...tests,
], { cwd: projectRoot, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
