"use client";
import { useState } from "react";
import { askBuddyToJoin } from "@/app/(site)/account/actions";

// "Ik heb geboekt, kom je mee?" — ask accepted buddies to join this booking. They accept/decline.
export default function BuddyJoin({ bookingId, buddies = [], askedIds = [] }) {
  const [asked, setAsked] = useState(new Set(askedIds));
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");

  if (!buddies.length) return null;

  async function ask(b) {
    setBusy(b.id); setErr("");
    const r = await askBuddyToJoin(bookingId, b.id);
    setBusy(null);
    if (r?.error) setErr(r.error);
    else setAsked((s) => new Set(s).add(b.id));
  }

  return (
    <div className="mt-3 border-t border-borderc pt-3">
      <p className="text-xs font-bold uppercase tracking-wide text-lav">Kom je mee? Vraag je buddies</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {buddies.map((b) => (
          <button
            key={b.id}
            type="button"
            disabled={busy === b.id || asked.has(b.id)}
            onClick={() => ask(b)}
            className={"rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-60 " + (asked.has(b.id) ? "bg-paper text-brand/50" : "border-2 border-borderc text-brand hover:border-accent")}
          >
            {asked.has(b.id) ? `✓ ${b.name} gevraagd` : `+ ${b.name}`}
          </button>
        ))}
      </div>
      {err && <p className="mt-2 text-xs font-semibold text-red-600">{err}</p>}
    </div>
  );
}
