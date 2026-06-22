"use client";
import { useState } from "react";
import { coachRescheduleBooking, cancelCoachBooking, coachDayAvailability } from "@/app/coach/actions";

const pad = (n) => String(n).padStart(2, "0");
const fh = (h) => `${pad(Math.floor(h))}:${h % 1 ? "30" : "00"}`;
const toast = (type, msg) => { try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {} };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Per-session controls for a coach: Verplaats (to a free slot) + Annuleer. Both only up to 6h before.
export default function CoachSessionActions({ bookingId, startsAt }) {
  const locked = Date.now() > new Date(startsAt).getTime() - 6 * 3600000;
  const [mode, setMode] = useState(null); // null | 'move'
  const [date, setDate] = useState(todayStr());
  const [hours, setHours] = useState(null);
  const [hour, setHour] = useState("");
  const [busy, setBusy] = useState(false);

  if (locked) return <span className="text-xs text-brand/40">Wijzigen kan tot 6u vooraf</span>;

  async function loadHours(d) {
    setHours(null); setHour("");
    const r = await coachDayAvailability(d);
    setHours(r?.hours || []);
  }
  async function openMove() { setMode("move"); await loadHours(date); }

  async function submitMove() {
    if (!date || hour === "") { toast("error", "Kies een dag en vrij uur."); return; }
    setBusy(true);
    const fd = new FormData(); fd.set("bookingId", bookingId); fd.set("date", date); fd.set("hour", String(hour));
    const res = await coachRescheduleBooking(fd);
    setBusy(false);
    if (res?.error) { toast("error", res.error); return; }
    toast("success", res?.message || "Verplaatst ✓");
    window.location.reload();
  }

  async function doCancel() {
    if (!window.confirm("Deze sessie annuleren? De client krijgt een mail.")) return;
    setBusy(true);
    const fd = new FormData(); fd.set("bookingId", bookingId);
    const res = await cancelCoachBooking(fd);
    setBusy(false);
    if (res?.error) { toast("error", res.error); return; }
    toast("success", res?.message || "Geannuleerd ✓");
    window.location.reload();
  }

  if (mode === "move") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" min={todayStr()} value={date} onChange={(e) => { setDate(e.target.value); loadHours(e.target.value); }} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
        <select value={hour} onChange={(e) => setHour(e.target.value)} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
          <option value="">{hours === null ? "Laden…" : hours.length ? "Vrij uur…" : "Geen vrij uur"}</option>
          {(hours || []).map((h) => <option key={h} value={h}>{fh(h)}</option>)}
        </select>
        <button onClick={submitMove} disabled={busy} className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-brand disabled:opacity-50">{busy ? "Bezig…" : "Bevestig"}</button>
        <button onClick={() => setMode(null)} className="px-2 py-1.5 text-xs font-bold text-brand/40 hover:text-brand">✕</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={openMove} className="rounded-full border-2 border-borderc px-4 py-1.5 text-xs font-bold text-brand transition hover:border-accent hover:text-accentdark">Verplaats</button>
      <button onClick={doCancel} disabled={busy} className="rounded-full border-2 border-borderc px-4 py-1.5 text-xs font-bold text-brand transition hover:border-red-300 hover:text-red-600 disabled:opacity-50">Annuleer</button>
    </div>
  );
}
