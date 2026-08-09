"use client";

import { useEffect, useState } from "react";

/**
 * Tells the visitor when the page they are running is out of date.
 *
 * The site is a static export behind aggressive caching, and old chunk files
 * remain on the server after a deploy — so a tab opened before a release keeps
 * running the old code indefinitely and fails in ways the current code cannot
 * explain. Rather than expecting people to know to hard-refresh, compare the
 * build the page was served from against the one currently deployed.
 *
 * Deliberately does NOT reload on its own: someone mid-purchase with a wallet
 * prompt open should not have the page pulled out from under them.
 */
export default function UpdatePrompt() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const loaded = document
      .querySelector('meta[name="build-id"]')
      ?.getAttribute("content");
    if (!loaded) return;

    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      try {
        // cache-busted: the point is to see the server's current answer
        const res = await fetch(`/build-id.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const { id } = await res.json();
        if (!cancelled && id && id !== loaded) setStale(true);
      } catch {
        /* offline or blocked — say nothing */
      }
    };

    check(); // always check on load — the page is being looked at
    // ...but don't keep polling a tab nobody is watching
    const timer = setInterval(() => {
      if (!document.hidden) check();
    }, 90_000);
    // catch the common case: user returns to a tab left open for hours
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stale) return null;

  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-[200] -translate-x-1/2 px-4 w-full max-w-md"
    >
      <div className="glass-card ring-glow flex items-center gap-4 px-5 py-3.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-lime-neon animate-pulse" />
        <p className="flex-1 text-sm leading-snug">
          A newer version of this page is available.
          <span className="block text-xs text-muted">
            Reload to pick it up — the old one can behave oddly.
          </span>
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-gradient shrink-0 rounded-xl px-4 py-2 text-sm font-display font-bold text-white"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
