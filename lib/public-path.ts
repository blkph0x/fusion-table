/** Site prefix. Empty in a normal checkout. "/fusion" only when this host's build sets it. */
export function publicBase(): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
}

/** A same-origin path, with the host prefix when there is one. */
export function publicPath(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${publicBase()}${suffix}`;
}
