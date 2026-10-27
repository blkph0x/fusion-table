"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & { src: string; alt: string };
function statusUrl(src: string): string | null {
  // Poll only this site's recipe-image endpoint; static or external images stay ordinary images.
  try { const url = new URL(src, window.location.href); if (url.origin !== window.location.origin || !/\/(?:api\/plate)$/.test(url.pathname) || !url.searchParams.has("t")) return null; url.searchParams.set("status", "1"); return `${url.pathname}${url.search}`; } catch { return null; }
}

/** Missing pictures finish independently of recipe generation and page navigation. */
export function RecipeImage({ src, alt, ...props }: Props) {
  const [ready, setReady] = useState<{ source: string; key: string } | null>(null);
  useEffect(() => {
    const endpoint = statusUrl(src); if (!endpoint) return;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, attempts = 0;
    const controller = new AbortController();
    async function poll() {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const response = await fetch(endpoint!, { cache: "no-store", signal: controller.signal });
        const result = await response.json() as { status?: string; key?: string; retryAfterMs?: number };
        if (stopped) return;
        if (result.status === "ready" && result.key) { setReady({ source: src, key: result.key }); return; }
        if (result.status === "unavailable") return;
        if (++attempts < 60) timer = setTimeout(poll, Math.max(2000, Math.min(60_000, result.retryAfterMs || 3000)));
      } catch { if (!stopped && ++attempts < 60) timer = setTimeout(poll, 10_000); }
    }
    const visible = () => { if (document.visibilityState === "visible" && !stopped && attempts < 60) { if (timer) clearTimeout(timer); void poll(); } };
    document.addEventListener("visibilitychange", visible); void poll();
    return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [src]);
  const actual = ready?.source === src ? `${src}${src.includes("?") ? "&" : "?"}ready=${ready.key}` : src;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} src={actual} alt={alt} />;
}
