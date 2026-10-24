import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export interface PublishedFile {
  bytes: Buffer;
  contentType: string;
}

/**
 * A public file shipped with the site. Rejects anything that is not a picture
 * under public/ or dist/client/, including path traversal.
 */
export async function readPublishedFile(pathname: string): Promise<PublishedFile | null> {
  if (!pathname.startsWith("/") || pathname.includes("\0") || pathname.includes("\\")) return null;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === ".." || part.startsWith("."))) return null;
  const relative = parts.join("/");
  const contentType = TYPES[extname(relative).toLowerCase()];
  if (!contentType) return null;
  const roots = [join(process.cwd(), "dist", "client"), join(process.cwd(), "public")];
  for (const root of roots) {
    const resolvedRoot = resolve(root);
    const resolved = resolve(root, relative);
    if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + sep)) continue;
    try {
      const bytes = await readFile(resolved);
      if (bytes.length > 0 && bytes.length <= 12_000_000) return { bytes, contentType };
    } catch {
      /* This root does not have the file. */
    }
  }
  return null;
}

/**
 * Vinext answers a public file with an empty signal when this host has no
 * assets binding. The browser then shows a broken picture. Fill that signal
 * from disk. A response that already has a body is left alone.
 */
export async function fillEmptyPublicFile(response: Response): Promise<Response> {
  const signal = response.headers.get("x-vinext-static-file");
  if (!signal || response.status !== 200) return response;
  const declared = response.headers.get("content-length");
  const hasType = response.headers.has("content-type");
  if (response.body && hasType && declared !== "0") return response;
  let pathname = signal;
  try {
    pathname = decodeURIComponent(signal);
  } catch {
    return response;
  }
  const file = await readPublishedFile(pathname);
  if (!file) return response;
  await response.body?.cancel().catch(() => undefined);
  return new Response(Uint8Array.from(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.byteLength),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
