"use client";

import { useEffect } from "react";

/**
 * network.crypsurance.io embeds /verify in a full-screen iframe so the
 * branded address stays in the URL bar. Only the Verifier Network should
 * live inside that frame, so while framed:
 *
 * - clicks on links that leave /verify are intercepted and sent to the TOP
 *   window (done during the click so browsers allow the cross-origin
 *   top-navigation — doing it after load is blocked without a user gesture)
 * - as a fallback, if a non-verify page still ends up inside a frame, it
 *   attempts a break-out on load
 */
export default function FrameGuard() {
  useEffect(() => {
    let framed = false;
    try {
      framed = window.self !== window.top;
    } catch {
      framed = true;
    }
    if (!framed) return;

    if (!window.location.pathname.startsWith("/verify")) {
      try {
        window.top!.location.href = window.location.href;
      } catch {
        /* cross-origin without gesture — the click interceptor below is the
           primary mechanism; this is best-effort only */
      }
      return;
    }

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank") return;
      const url = new URL(href, window.location.href);
      // stay inside the frame only for verify-internal navigation
      if (
        url.origin === window.location.origin &&
        url.pathname.startsWith("/verify")
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      try {
        window.top!.location.href = url.href;
      } catch {
        window.open(url.href, "_blank", "noopener");
      }
    };

    // capture phase so we run before Next's client-side router
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
