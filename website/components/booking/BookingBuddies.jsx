"use client";
import { useState } from "react";
import { searchMembersAction } from "@/app/(site)/boeken/actions";
import { inviteBuddiesToBooking, removeBuddyFromBooking, inviteEmailToBooking } from "@/app/(site)/account/actions";

// Manage who comes along to one of your bookings: see current invitees, add (member search) up to
// the booking's capacity, remove. Optimistic UI; revalidates the account page on the server.
export default function BookingBuddies({ bookingId, capacity, participants = [], paid, gasten = [] }) {
  const [people, setPeople] = useState(participants); // [{id,name}]
  const [mails, setMails] = useState(gasten); // uitgenodigd per e-mail (nog geen account)
  const [mail, setMail] = useState("");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const left = Math.max(0, capacity - 1 - people.length - mails.length);

  async function nodigMailUit() {
    setBusy(true); setErr("");
    const r = await inviteEmailToBooking(bookingId, mail);
    setBusy(false);
    if (r?.error) return setErr(r.error);
    if (r?.email) setMails((m) => [...m, r.email]);
    setMail("");
  }

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
          <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-xs font-bold text-ink">
            {m.name}
            <button type="button" disabled={busy} onClick={() => remove(m.id)} className="text-ink/50 hover:text-red-600" aria-label="Verwijder">×</button>
          </span>
        ))}
        {mails.map((m) => (
          <span key={m} className="inline-flex items-center rounded-full bg-paper px-3 py-1 text-xs font-bold text-ink/70">✉ {m}</span>
        ))}
        {left > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-full border-2 border-borderc px-3 py-1 text-xs font-bold text-ink transition hover:border-lav">
            + Wie komt er mee?
          </button>
        )}
      </div>
      {left > 0 && people.length + mails.length === 0 && (
        <p className="mt-1.5 text-xs text-ink/55">Je boekte voor {capacity} — zet je gasten erbij: +5 punten per gast die bevestigt, +100 als die later zelf komt trainen.</p>
      )}

      {!paid && people.length > 0 && (
        <p className="mt-2 text-xs text-ink/50">Je vrienden zien deze sessie zodra je betaald hebt.</p>
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
          <div className="mt-2 flex gap-2">
            <input value={mail} onChange={(e) => setMail(e.target.value)} type="email" inputMode="email" placeholder="…of e-mail van iemand zonder account"
              className="min-w-0 flex-1 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
            <button type="button" disabled={busy || !mail.trim()} onClick={nodigMailUit} className="rounded-full bg-accent px-4 py-2 text-xs font-black text-brand disabled:opacity-50">Uitnodigen</button>
          </div>
          {results.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-lg border-2 border-borderc bg-surface">
              {results.slice(0, 6).map((m) => (
                <button key={m.id} type="button" disabled={busy} onClick={() => add(m)} className="block w-full px-3 py-2 text-left text-sm text-ink transition hover:bg-paper">
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
