"use client";
import { useState } from "react";

// Generic Web Share / copy-link button. Native share sheet on mobile, clipboard fallback on desktop.
export default function ShareButton({ title, text, path, label = "Deel", className = "" }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    const url = (typeof window !== "undefined" ? window.location.origin : "https://fittin.be") + (path || (typeof window !== "undefined" ? window.location.pathname : ""));
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch { /* dismissed — no-op */ }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={className || "inline-flex items-center gap-1.5 rounded-full border-2 border-borderc bg-white px-4 py-2 text-sm font-bold text-brand transition hover:border-accent"}
    >
      🔗 {copied ? "Link gekopieerd ✓" : label}
    </button>
  );
}
