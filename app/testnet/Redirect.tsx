"use client";

import { useEffect } from "react";

/**
 * Sends /testnet to /devnet in the browser.
 *
 * A static export has no server, so there is no 301 to issue and no
 * `redirect()` to call. Next's `metadata.other` can only emit `<meta name=...>`,
 * never `http-equiv`, so a meta refresh declared that way is inert — it renders
 * but does nothing. This runs the navigation directly instead.
 *
 * `replace` rather than `assign`: the old URL must not enter history, or Back
 * from /devnet returns here and bounces the visitor straight forward again.
 */
export default function Redirect() {
  useEffect(() => {
    window.location.replace("/devnet/");
  }, []);
  return null;
}
