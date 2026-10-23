/**
 * Keeps the local Stable Diffusion server on this machine only.
 * The weights and sd-server binary live outside the git checkout.
 *
 *   node scripts/plate-model-server.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = process.env.PLATE_MODEL_HOME || join(homedir(), "opt", "sd");
const bin = join(home, "sd-server");
const weights = join(home, "models", "sd_turbo-f16-q8_0.gguf");
const port = process.env.PLATE_MODEL_PORT || "7860";

if (!existsSync(bin) || !existsSync(weights)) {
  console.error("The local image model is not installed in " + home);
  process.exit(1);
}

const child = spawn(bin, [
  "--listen-ip", "127.0.0.1",
  "--listen-port", port,
  "-m", weights,
  "--steps", "4",
  "--cfg-scale", "1",
  "--scheduler", "karras",
  "--sampling-method", "euler",
  "-t", "6",
  "-W", "512",
  "-H", "512",
], {
  cwd: home,
  env: {
    ...process.env,
    LD_LIBRARY_PATH: `${home}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""}`,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
