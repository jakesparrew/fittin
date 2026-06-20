"use client";
import { useState } from "react";
import { adminCancelBooking } from "@/app/beheer/actions";

const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function BookingsList({ bookings = [] }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("upcoming");
  const now = Date.now();
  const needle = q.trim().toLowerCase();

  let rows = bookings;
  if (tab === "upcoming") rows = rows.filter((b) => new Date(b.starts_at).getTime() >= now && b.status === "bevestigd");
  else if (tab === "past") rows = rows.filter((b) => new Date(b.starts_at).getTime() < now || b.status !== "bevestigd");
  if (needle) rows = rows.filter((b) => [b.member_name, b.service_name, b.coach_name].some((x) => (x || "").toLowerCase().includes(needle)));
  rows = [...rows].sort((a, b) => (tab === "past" ? new Date(b.starts_at) - new Date(a.starts_at) : new Date(a.starts_at) - new Date(b.starts_at)));

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-brand">Alle boekingen <span className="text-base font-bold text-brand/40">({rows.length})</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek lid, sessie of coach…" className="w-64 max-w-full rounded-full border-2 border-borderc bg-white px-4 py-2 text-sm text-brand outline-none transition focus:border-accent" />
      </div>

      <div className="mt-3 inline-flex rounded-full border border-borderc bg-white p-1 text-sm font-bold">
        {[["upcoming", "Komende"], ["past", "Verleden"], ["all", "Alle"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={"rounded-full px-4 py-1.5 transition " + (tab === k ? "bg-brand text-white" : "text-brand/60 hover:text-brand")}>{l}</button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-borderc bg-white">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-4 py-3">Wanneer</th>
              <th className="px-4 py-3">Lid</th>
              <th className="px-4 py-3">Sessie</th>
              <th className="px-4 py-3">Coach</th>
              <th className="px-4 py-3">Pers</th>
              <th className="px-4 py-3">Betaald</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {rows.map((b) => {
              const upcoming = new Date(b.starts_at).getTime() >= now;
              const paid = b.paid || b.price_cents === 0 || b.payment_source !== "los";
              return (
                <tr key={b.id} className={b.status !== "bevestigd" ? "opacity-50" : ""}>
                  <td className="whitespace-nowrap px-4 py-3 capitalize text-brand/70">{fmt(b.starts_at)}</td>
                  <td className="px-4 py-3 font-semibold text-brand">{b.member_name || "—"}</td>
                  <td className="px-4 py-3 text-brand/70">{b.service_name || "Sessie"}</td>
                  <td className="px-4 py-3 text-brand/50">{b.coach_name || "—"}</td>
                  <td className="px-4 py-3">{b.persons}</td>
                  <td className="px-4 py-3">{paid ? <span className="font-bold text-accentdark">✓</span> : <span className="font-bold text-red-500">onbetaald</span>}</td>
                  <td className="px-4 py-3 text-xs font-semibold capitalize text-brand/60">{b.status}</td>
                  <td className="px-4 py-3 text-right">
                    {upcoming && b.status === "bevestigd" && (
                      <form action={adminCancelBooking}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <button className="text-xs font-bold text-red-500 hover:underline">annuleer</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="mt-3 text-sm text-brand/50">Geen boekingen{q ? ` voor “${q}”` : ""}.</p>}
    </div>
  );
}
