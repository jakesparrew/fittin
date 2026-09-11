"use client";
import { useState } from "react";
import { deel } from "@/lib/native/share";

// Generic share / copy-link button. Native share sheet in the app and on mobile, clipboard fallback
// on desktop. Always shares the public fittin.be URL, also inside the app.
export default function ShareButton({ title, text, path, label = "Deel", className = "" }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    const url = "https://fittin.be" + (path || (typeof window !== "undefined" ? window.location.pathname : ""));
    const r = await deel({ title, text, url });
    if (r === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={className || "inline-flex items-center gap-1.5 rounded-full border-2 border-borderc bg-surface px-4 py-2 text-sm font-bold text-ink transition hover:border-accent"}
    >
      🔗 {copied ? "Link gekopieerd ✓" : label}
    </button>
  );
}
