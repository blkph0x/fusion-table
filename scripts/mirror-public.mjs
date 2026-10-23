import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Site prefix from the build environment, or from this checkout's next.config. */
export function publishedBase(nextConfigText, envBase = "") {
  const fromEnv = String(envBase || "").replace(/\/$/, "");
  const match = String(nextConfigText || "").match(/basePath:\s*"(\/[^"]*)"/);
  const fromConfig = match ? match[1].replace(/\/$/, "") : "";
  const base = fromEnv || fromConfig;
  if (!base.startsWith("/") || base === "/" || base.includes("..") || base.includes("\\")) return "";
  return base;
}

/**
 * Vinext publishes public/ at the client root, while a basePath build is
 * requested under that prefix. Copy the pictures across so the asset server
 * can answer /fusion/images with the real file.
 */
export function mirrorPublic(publicDir, clientDir, base) {
  if (!base || !existsSync(publicDir) || !existsSync(clientDir)) return false;
  const dest = join(clientDir, base.slice(1));
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(publicDir)) {
    cpSync(join(publicDir, name), join(dest, name), { recursive: true, force: true });
  }
  return true;
}

const invoked = (process.argv[1] || "").replaceAll("\\", "/").endsWith("/scripts/mirror-public.mjs");
if (invoked) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const config = existsSync(join(root, "next.config.ts")) ? readFileSync(join(root, "next.config.ts"), "utf8") : "";
  const base = publishedBase(config, process.env.NEXT_PUBLIC_BASE_PATH || "");
  mirrorPublic(join(root, "public"), join(root, "dist", "client"), base);
}
