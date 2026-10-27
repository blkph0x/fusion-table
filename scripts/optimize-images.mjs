import { createRequire } from "node:module";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

function installedSharp() {
  try {
    return require("sharp");
  } catch {
    // Sharp is already locked transitively by the local Worker tooling. Resolve
    // that installation without adding another image pipeline or downloading it.
    const store = join(projectRoot, "node_modules", ".pnpm");
    const versions = existsSync(store) ? readdirSync(store).filter((name) => name.startsWith("sharp@")) : [];
    for (const version of versions) {
      try { return require(join(store, version, "node_modules", "sharp")); } catch { /* Try another installed version. */ }
    }
    throw new Error("The project's installed Sharp encoder is unavailable. Restore the existing lockfile dependencies before running this script.");
  }
}

const sharp = installedSharp();
const imageRoot = join(projectRoot, "public", "images");
const sources = ["fusion-table-hero", "korean-tacos", "moroccan-traybake"];
const outputs = [];
for (const name of sources) {
  const source = join(imageRoot, `${name}.png`);
  const originalBytes = statSync(source).size;
  for (const width of [960, 480]) {
    const filename = `${name}-${width}.webp`;
    const output = join(imageRoot, filename);
    const info = await sharp(source)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 86, effort: 6 })
      .toFile(output);
    outputs.push({ filename, width: info.width, height: info.height, bytes: info.size, originalBytes, savedPercent: Number((100 * (1 - info.size / originalBytes)).toFixed(1)) });
  }
}
console.log(JSON.stringify({ note: "Delivery derivatives only; original PNGs are retained.", outputs }, null, 2));
