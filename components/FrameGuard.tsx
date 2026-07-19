"use client";

import { useEffect } from "react";

/**
 * The network.crypsurance.io subdomain embeds /verify in a full-screen frame
 * so the branded address stays in the URL bar. If a visitor navigates from
 * there to any other page, break out of the frame to the real site — nobody
 * should browse the whole app inside an iframe.
 */
export default function FrameGuard() {
  useEffect(() => {
    const framed = window.self !== window.top;
    if (framed && !window.location.pathname.startsWith("/verify")) {
      window.top!.location.href = window.location.href;
    }
  }, []);

  return null;
}
