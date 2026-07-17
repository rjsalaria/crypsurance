"use client";

import { useEffect } from "react";

/** Spawns an expanding ring of light wherever a link or button is clicked. */
export default function ClickRipple() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("a, button");
      if (!target) return;
      const ripple = document.createElement("span");
      ripple.className = "click-ripple";
      // navbar clicks get the brighter, larger burst
      if (target.closest("header")) ripple.classList.add("click-ripple-nav");
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      document.body.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
      // safety net in case animationend never fires
      setTimeout(() => ripple.remove(), 900);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
