"use client";
import { useState } from "react";
import { searchMembersAction } from "@/app/(site)/boeken/actions";
import { inviteBuddiesToBooking, removeBuddyFromBooking } from "@/app/(site)/account/actions";

// Manage who comes along to one of your bookings: see current invitees, add (member search) up to
// the booking's capacity, remove. Optimistic UI; revalidates the account page on the server.
export default function BookingBuddies({ bookingId, capacity, participants = [], paid }) {
  const [people, setPeople] = useState(participants); // [{id,name}]
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const left = Math.max(0, capacity - 1 - people.length);

  async function add(m) {
    setBusy(true); setErr("");
    const prev = people;
    setPeople((s) => [...s, m]); setQ(""); setResults([]);
    const r = await inviteBuddiesToBooking(bookingId, [m.id]);
    setBusy(false);
    if (r?.error) { setPeople(prev); setErr(r.error); }
  }
  async function remove(id) {
    setBusy(true); setErr("");
    const prev = people;
    setPeople((s) => s.filter((x) => x.id !== id));
    const r = await removeBuddyFromBooking(bookingId, id);
    setBusy(false);
    if (r?.error) { setPeople(prev); setErr(r.error); }
  }

  if (capacity <= 1) return null;

  return (
    <div className="mt-3 border-t border-borderc pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-lav">Vrienden ({people.length}/{capacity - 1})</span>
        {people.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-xs font-bold text-brand">
            {m.name}
            <button type="button" disabled={busy} onClick={() => remove(m.id)} className="text-brand/50 hover:text-red-600" aria-label="Verwijder">×</button>
          </span>
        ))}
        {left > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-full border-2 border-borderc px-3 py-1 text-xs font-bold text-brand transition hover:border-lav">
            + Nodig uit
          </button>
        )}
      </div>

      {!paid && people.length > 0 && (
        <p className="mt-2 text-xs text-brand/50">Je vrienden zien deze sessie zodra je betaald hebt.</p>
      )}
      {err && <p className="mt-2 text-xs font-semibold text-red-600">{err}</p>}

      {open && left > 0 && (
        <div className="mt-2 max-w-sm">
          <input
            value={q}
            onChange={async (e) => {
              const v = e.target.value; setQ(v);
              const r = await searchMembersAction(v);
              setResults(r.filter((m) => !people.some((p) => p.id === m.id)));
            }}
            placeholder="Zoek een lid…"
            className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm"
          />
          {results.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-lg border-2 border-borderc bg-white">
              {results.slice(0, 6).map((m) => (
                <button key={m.id} type="button" disabled={busy} onClick={() => add(m)} className="block w-full px-3 py-2 text-left text-sm text-brand transition hover:bg-paper">
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
