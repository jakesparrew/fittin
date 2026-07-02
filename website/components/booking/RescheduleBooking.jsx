"use client";
import { useEffect, useState } from "react";
import { rescheduleBookingAction } from "@/app/(site)/account/actions";
import { slotInstant } from "@/lib/time";

const pad = (n) => String(n).padStart(2, "0");
const toast = (type, msg) => {
  try { window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type, msg } })); } catch {}
};
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Member self-reschedule: move a confirmed booking to another slot, up to 6h before the start.
// The reschedule_booking RPC re-checks opening hours, overlaps and slot blocks server-side — but we
// also grey out already-taken slots client-side so the member doesn't pick one that will bounce.
export default function RescheduleBooking({ bookingId, startsAt, openHour = 6, closeHour = 23 }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("");
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(new Set()); // ms-timestamps of booked slots on the chosen day

  const locked = Date.now() > new Date(startsAt).getTime() - 6 * 3600000;
  const hours = [];
  for (let h = openHour; h < closeHour; h += 0.5) hours.push(h);

  // Load booked slots whenever the chosen day changes, so taken hours can be disabled.
  useEffect(() => {
    if (!open || !date) { setTaken(new Set()); return; }
    let active = true;
    fetch(`/api/available-slots?date=${date}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (active) setTaken(new Set((d.taken || []).map((iso) => new Date(iso).getTime()))); })
      .catch(() => {});
    return () => { active = false; };
  }, [open, date]);

  const isTaken = (h) => date && taken.has(slotInstant(date, h).getTime());

  if (locked) {
    return <span className="text-xs text-brand/40">Verplaatsen kan tot 6u vooraf</span>;
  }
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border-2 border-borderc px-5 py-2.5 text-sm font-bold text-brand transition hover:border-accent hover:text-accentdark"
      >
        Verplaatsen
      </button>
    );
  }

  async function submit() {
    if (!date || hour === "") { toast("error", "Kies een dag en uur."); return; }
    setBusy(true);
    const fd = new FormData();
    fd.set("bookingId", bookingId);
    fd.set("date", date);
    fd.set("hour", String(hour));
    const res = await rescheduleBookingAction(fd);
    setBusy(false);
    if (res?.error) { toast("error", res.error); return; }
    toast("success", res?.message || "Verplaatst ✓");
    setOpen(false);
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        min={todayStr()}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-xl border border-borderc px-3 py-2 text-sm text-brand"
      />
      <select
        value={hour}
        onChange={(e) => setHour(e.target.value)}
        className="rounded-xl border border-borderc px-3 py-2 text-sm text-brand"
      >
        <option value="">Uur…</option>
        {hours.map((h) => (
          <option key={h} value={h} disabled={isTaken(h)}>
            {pad(Math.floor(h))}:{h % 1 ? "30" : "00"}{isTaken(h) ? " — bezet" : ""}
          </option>
        ))}
      </select>
      <button
        onClick={submit}
        disabled={busy}
        className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Bezig…" : "Bevestig"}
      </button>
      <button onClick={() => setOpen(false)} className="rounded-full px-2 py-2 text-sm font-bold text-brand/40 hover:text-brand">✕</button>
    </div>
  );
}
