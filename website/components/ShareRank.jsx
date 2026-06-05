"use client";
import { useState } from "react";

// Fetches the generated leaderboard PNG and shares it (native share sheet) or downloads it.
export default function ShareRank() {
  const [busy, setBusy] = useState(false);
  async function share() {
    setBusy(true);
    try {
      const res = await fetch("/api/share/rank", { cache: "no-store" });
      const blob = await res.blob();
      const file = new File([blob], "fittin-leaderboard.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Mijn Fittin'-positie" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fittin-leaderboard.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {}
    setBusy(false);
  }
  return (
    <button onClick={share} disabled={busy} className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand transition hover:opacity-90 disabled:opacity-60">
      {busy ? "Bezig…" : "📸 Deel mijn positie"}
    </button>
  );
}
