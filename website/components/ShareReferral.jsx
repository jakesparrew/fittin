"use client";
import { useState } from "react";
import { track } from "@/lib/track";

// Surfaces the (already fully wired) referral loop: copy link + WhatsApp share. The invitee lands on
// signup with ?ref=<code>; when they later pay, the existing webhook rewards the inviter. Fires the
// referral_link_shared event (Batch 0.1 whitelist) so we can see the loop working.
export default function ShareReferral({ code, compact = false }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  const site = typeof window !== "undefined" ? window.location.origin : "https://fittin.be";
  const url = `${site}/login?mode=signup&ref=${encodeURIComponent(code)}`;
  const msg = `Kom trainen bij Fittin' 💪 Je eerste sessie is gratis. Maak je account via mijn link: ${url}`;

  const copy = async () => {
    try {
      // Prefer the native share sheet on mobile; fall back to clipboard.
      if (navigator.share) {
        await navigator.share({ title: "Train mee bij Fittin'", text: "Je eerste sessie is gratis 💪", url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
      track("referral_link_shared");
    } catch { /* user dismissed the share sheet — no-op */ }
  };
  const whatsapp = () => { track("referral_link_shared"); };

  return (
    <div className={compact ? "flex flex-wrap gap-2" : "flex flex-wrap items-center gap-2"}>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
      >
        🔗 {copied ? "Gekopieerd ✓" : "Deel je link"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={whatsapp}
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-borderc bg-white px-4 py-2 text-sm font-bold text-brand transition hover:border-accent"
      >
        WhatsApp
      </a>
    </div>
  );
}
