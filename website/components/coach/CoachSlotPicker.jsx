"use client";
import { useState, useEffect } from "react";
import { coachDayAvailability } from "@/app/coach/actions";

const pad = (n) => String(n).padStart(2, "0");
const fh = (h) => `${pad(Math.floor(h))}:${h % 1 ? "30" : "00"}`;

// Date + time picker for the coach booking form. The time dropdown only lists FREE 1h slots for the
// chosen date (refetched on change), so already-booked/blocked hours are never offered.
export default function CoachSlotPicker({ defaultDate }) {
  const [date, setDate] = useState(defaultDate);
  const [hours, setHours] = useState(null); // null = loading
  const [hour, setHour] = useState("");

  useEffect(() => {
    let active = true;
    setHours(null);
    setHour("");
    coachDayAvailability(date).then((r) => {
      if (!active) return;
      const hs = r?.hours || [];
      setHours(hs);
      setHour(hs.length ? String(hs[0]) : "");
    });
    return () => { active = false; };
  }, [date]);

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Datum</span>
        <input name="date" type="date" required value={date} min={defaultDate} onChange={(e) => setDate(e.target.value)} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Uur (enkel vrij)</span>
        <select name="hour" required value={hour} onChange={(e) => setHour(e.target.value)} className="w-32 rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">
          {hours === null ? (
            <option value="">Laden…</option>
          ) : hours.length === 0 ? (
            <option value="">Geen vrij uur</option>
          ) : (
            hours.map((h) => <option key={h} value={h}>{fh(h)}</option>)
          )}
        </select>
      </label>
    </>
  );
}
