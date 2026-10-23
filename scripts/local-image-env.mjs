import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Wrangler only reads .dev.vars beside dist/server/wrangler.json, and a build
 * replaces that directory. When this machine has opted in, write the local
 * plate-model address back after the build. GitHub has no opt-in file.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const marker = join(root, "data", "plate-model.on");
const destination = join(root, "dist", "server", ".dev.vars");
if (!existsSync(marker) || !existsSync(join(root, "dist", "server"))) process.exit(0);
const written = readFileSync(marker, "utf8").trim();
const endpoint = written || "http://127.0.0.1:7860";
if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/.test(endpoint)) {
  throw new Error("data/plate-model.on must be empty or a loopback http address.");
}
writeFileSync(destination, `FUSION_LOCAL_IMAGE_URL=${endpoint}\n`);
// The worker bundle reads process.env at runtime, and wrangler does not put
// .dev.vars on that object. Splice the loopback address into the built server
// code so this machine's opt-in actually reaches the plate route.
const literal = JSON.stringify(endpoint);
const patterns = [
  /process\.env\.FUSION_LOCAL_IMAGE_URL/g,
  /process\.env\["FUSION_LOCAL_IMAGE_URL"\]/g,
  /process\.env\['FUSION_LOCAL_IMAGE_URL'\]/g,
];
const serverDir = join(root, "dist", "server");
const pending = [serverDir];
let rewritten = 0;
while (pending.length > 0) {
  const current = pending.pop();
  for (const name of readdirSync(current)) {
    const path = join(current, name);
    if (statSync(path).isDirectory()) {
      pending.push(path);
      continue;
    }
    if (!name.endsWith(".js") && !name.endsWith(".mjs")) continue;
    const text = readFileSync(path, "utf8");
    let next = text;
    for (const pattern of patterns) next = next.replace(pattern, literal);
    if (next === text) continue;
    writeFileSync(path, next);
    rewritten += 1;
  }
}
if (rewritten === 0) {
  throw new Error("The built server does not read FUSION_LOCAL_IMAGE_URL, so the local model would never be called.");
}
