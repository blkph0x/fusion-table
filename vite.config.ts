import vinext from "vinext";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { readRuntimeProfile } from "./scripts/runtime-profile.mjs";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { sites } from "./scripts/vite/sites-vite-plugin";
import { connectorPreview } from "./scripts/vite/connector-preview-plugin.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  const nodeRuntime = readRuntimeProfile() === "node";
  if (!nodeRuntime) configureToolEnvironment(process.cwd());

  // Import Worker tooling only for the Worker profile. Normal Node requests need
  // real filesystem storage for the shared ledger, not a Worker virtual FS.
  const workerPlugins = [];
  if (!nodeRuntime) {
    // Wrangler snapshots its log path while the Cloudflare plugin is imported.
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    workerPlugins.push(connectorPreview(), cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      inspectorPort: false,
      config: {
        ...localBindingConfig,
        ...(command === "serve" ? {
          services: [{ binding: "CONNECTORS", service: "sites-connector-preview", entrypoint: "ConnectorPreview" }],
        } : {}),
      },
      ...(command === "serve" ? {
        auxiliaryWorkers: [{
          config: {
            name: "sites-connector-preview",
            main: "./scripts/connector-preview/worker.mjs",
            compatibility_date: "2026-05-15",
          },
        }],
      } : {}),
    }));
  }

  return {
    ...(nodeRuntime ? { cacheDir: "node_modules/.vite-fusion-node" } : {}),
    ...(nodeRuntime ? { resolve: { alias: {
      "cloudflare:workers": fileURLToPath(new URL("./scripts/node-worker-env.mjs", import.meta.url)),
    } } } : {}),
    // Match the host profile without keeping an uncommitted /fusion patch.
    define: {
      "process.env.NEXT_PUBLIC_BASE_PATH": JSON.stringify((process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "")),
    },
    server: {
      ...(nodeRuntime
        ? { host: "127.0.0.1", strictPort: true }
        : managedLinux
        ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
        : {}),
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: nodeRuntime || !managedLinux }),
      ...workerPlugins,
    ],
  };
});
