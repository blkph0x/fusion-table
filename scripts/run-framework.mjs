import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";
import { readRuntimeProfile } from "./runtime-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "start"].includes(command)) throw new Error("Expected dev, build or start.");
const managedLinux = readExecutionProfile() === "managed-linux";
const nodeRuntime = readRuntimeProfile() === "node";

if (managedLinux && !nodeRuntime && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const hasPort = args.some((arg) => arg === "--port" || arg === "-p" || arg.startsWith("--port="));
const hasHost = args.some((arg) => arg === "--hostname" || arg === "-H" || arg.startsWith("--hostname="));

if (command === "start" && !nodeRuntime) {
  if (!existsSync(new URL("../dist/server/wrangler.json", import.meta.url))) {
    throw new Error("Build the Worker profile before starting it. The current dist may contain a Node build.");
  }
  await import("./sites-env.mjs");
  const cli = new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url);
  process.argv = [process.execPath, fileURLToPath(cli), "dev", "--config", "dist/server/wrangler.json", "--local", "--persist-to", ".wrangler/state", "--ip", "127.0.0.1", "--inspector-port", "0", ...(!hasPort ? ["--port", "5173"] : []), ...args];
  await import(cli.href);
} else {
  if (command === "start" && existsSync(new URL("../dist/server/wrangler.json", import.meta.url))) {
    throw new Error("Build with FUSION_RUNTIME=node before starting Node. The current dist contains a Worker build.");
  }

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux && !nodeRuntime
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...((!managedLinux || nodeRuntime) && (command === "dev" || command === "start") && !hasPort ? ["--port", "5173"] : []),
  ...(nodeRuntime && (command === "dev" || command === "start") && !hasHost ? ["--hostname", "127.0.0.1"] : []), ...args];
await import(cli.href);
}
