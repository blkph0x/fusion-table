import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
