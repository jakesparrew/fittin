"use client";
import { useState } from "react";
import { adminCancelBooking, adminAssignCoach, adminMarkBookingPaid } from "@/app/beheer/actions";
import ActionForm from "@/components/ui/ActionForm";
import BookingDetail from "@/components/BookingDetail";
import { isSettled, sourceLabel } from "@/lib/booking-status";
import { slotInstant, brusselsDateStr } from "@/lib/time";

const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const ago = (iso) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "vandaag" : d === 1 ? "gisteren" : d < 31 ? `${d}d geleden` : `${Math.floor(d / 30)} mnd geleden`;
};

// Real money owed: a confirmed 'los'/'abo' booking that isn't settled yet.
const isUnpaid = (b) => b.status === "bevestigd" && !isSettled(b) && (b.payment_source === "los" || b.payment_source === "abo") && (b.price_cents || 0) > 0;

// Betaalwijze in één oogopslag — de owner wil vooral zien wie op beurtenkaart traint en wie
// abonnee is, dus die twee krijgen een eigen kleur + icoon en hun resterende tegoed erbij.
const SRC_STYLE = {
  "Abonnement": { icon: "★", cls: "bg-accent/20 text-accentdark" },
  "Beurtenkaart": { icon: "🎟", cls: "bg-lav/30 text-brand" },
  "Gratis code": { icon: "🎁", cls: "bg-paper text-brand/55" },
  "Uitgenodigd": { icon: "👥", cls: "bg-paper text-brand/55" },
  "Coach-tegoed": { icon: "🧑‍🏫", cls: "bg-brand/10 text-brand" },
  "Coach-factuur": { icon: "🧾", cls: "bg-brand/10 text-brand" },
  "Coach · gratis": { icon: "🧑‍🏫", cls: "bg-brand/10 text-brand" },
  "Ingepland door beheer": { icon: "🏠", cls: "bg-paper text-brand/55" },
  "Via coach": { icon: "🧑‍🏫", cls: "bg-brand/10 text-brand" },
  "Online": { icon: "💳", cls: "bg-paper text-brand/55" },
};

function SourceChip({ b }) {
  const label = sourceLabel(b);
  const st = SRC_STYLE[label] || SRC_STYLE["Online"];
  const short = label === "Ingepland door beheer" ? "Door beheer" : label;
  const credits = b.credits_left;      // HUIDIG lidtegoed — niet de betaalstatus van déze sessie
  const cc = b.coach_credits_left;     // resterend coach-tegoed
  return (
    <span className="block">
      <span
        className={"inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold " + st.cls}
        title={label === "Beurtenkaart" ? "Betaald: de beurt is bij het boeken van de kaart afgetrokken." : undefined}
      >
        <span aria-hidden>{st.icon}</span>{short}
      </span>
      {/* Het saldo hieronder is het HUIDIGE tegoed van het lid, niet de status van deze sessie —
          "nog 0 over" naast een betaalde sessie las als "onbetaald". Enkel tonen als er actie is. */}
      {credits != null && credits <= 2 && (
        <span className="mt-0.5 block text-[10px] font-bold text-amber-600">
          {credits === 0 ? "kaart is op → nieuwe verkopen" : `nog ${String(credits).replace(".", ",")} ${credits === 1 ? "beurt" : "beurten"} op de kaart`}
        </span>
      )}
      {/* Coach-tegoed enkel tonen wanneer er actie nodig is (op of onder nul). Een gezond saldo op
          élke rij herhalen was ruis — en negatief betekent: de coach boekte meer dan hij kocht. */}
      {cc != null && cc <= 1 && (
        <span className={"mt-0.5 block text-[10px] font-bold " + (cc < 0 ? "text-red-600" : "text-amber-600")}>
          {cc < 0 ? `coach ${String(cc).replace(".", ",")} → € ${Math.ceil(Math.abs(cc) * 12)} te innen` : `coach: nog ${String(cc).replace(".", ",")} sessie${cc === 1 ? "" : "s"}`}
        </span>
      )}
    </span>
  );
}

export default function BookingsList({ bookings = [], coaches = [], initialTab = "upcoming" }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState(initialTab);
  const now = Date.now();
  // "Komende" = vanaf het begin van vandaag, zodat een sessie van eerder vandaag niet meteen
  // uit de standaardlijst verdwijnt (owner denkt in dagen, niet in "vanaf dit exacte minuut").
  // BRUSSELS-middernacht via lib/time, niet setHours(0,0,0,0): de server draait UTC, dus tussen
  // 00:00–02:00 lokale tijd verschilde "vandaag" tussen server en browser → andere rijenset +
  // teller → React #418 hydration mismatch (gebeurde effectief om 00:29).
  const dayStartMs = slotInstant(brusselsDateStr(new Date()), 0).getTime();
  const needle = q.trim().toLowerCase();

  const unpaidCount = bookings.filter(isUnpaid).length;
  const unpaidTotal = bookings.filter(isUnpaid).reduce((a, b) => a + (b.price_cents || 0), 0);

  let rows = bookings;
  if (tab === "upcoming") rows = rows.filter((b) => new Date(b.starts_at).getTime() >= dayStartMs && b.status === "bevestigd");
  else if (tab === "past") rows = rows.filter((b) => new Date(b.starts_at).getTime() < dayStartMs || b.status !== "bevestigd");
  else if (tab === "onbetaald") rows = rows.filter(isUnpaid);
  if (needle) rows = rows.filter((b) => [b.member_name, b.service_name, b.coach_name].some((x) => (x || "").toLowerCase().includes(needle)));
  rows = [...rows].sort((a, b) => (tab === "past" ? new Date(b.starts_at) - new Date(a.starts_at) : new Date(a.starts_at) - new Date(b.starts_at)));

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-brand">Alle boekingen <span className="text-base font-bold text-brand/40">({rows.length})</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek lid, sessie of coach…" className="w-64 max-w-full rounded-full border-2 border-borderc bg-white px-4 py-2 text-sm text-brand outline-none transition focus:border-accent" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-borderc bg-white p-1 text-sm font-bold">
          {[["upcoming", "Komende"], ["past", "Verleden"], ["all", "Alle"], ["onbetaald", `Onbetaald${unpaidCount ? ` (${unpaidCount})` : ""}`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={"rounded-full px-4 py-1.5 transition " + (tab === k ? (k === "onbetaald" ? "bg-red-500 text-white" : "bg-brand text-white") : "text-brand/60 hover:text-brand")}>{l}</button>
          ))}
        </div>
        {tab === "onbetaald" && unpaidCount > 0 && (
          <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-bold text-red-600">€ {(unpaidTotal / 100).toFixed(2).replace(".", ",")} openstaand</span>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-borderc bg-white">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-4 py-3">Wanneer</th>
              <th className="px-4 py-3">Lid</th>
              <th className="px-4 py-3">Sessie</th>
              <th className="px-4 py-3" title="Hoe deze sessie betaald is">Betaalwijze</th>
              <th className="px-4 py-3">Coach</th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {rows.map((b) => {
              const upcoming = new Date(b.starts_at).getTime() >= now;
              const paid = isSettled(b);
              return (
                <tr key={b.id} className={b.status !== "bevestigd" ? "opacity-50" : ""}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="block capitalize text-brand/80">{fmt(b.starts_at)}</span>
                    {b.created_at && <span className="block text-[10px] text-brand/35">geboekt {ago(b.created_at)}</span>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-brand">
                    {b.reserved ? (
                      // Coach blokkeert gymtijd voor een eigen (externe) PT-client — de "lid"-kolom is
                      // dan de coach zelf, dus dat expliciet tonen i.p.v. het als gewoon lid te laten lezen.
                      <span className="block">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <BookingDetail bookingId={b.id} className="font-semibold text-brand">{b.coach_name || "Coach"}</BookingDetail>
                          <span className="rounded bg-brand px-1.5 py-0.5 text-[9px] font-black text-white">COACH</span>
                        </span>
                        <span className="block text-[11px] font-normal text-brand/45">{b.notes ? `PT · ${b.notes}` : "PT · nog geen client"}</span>
                      </span>
                    ) : (
                      <BookingDetail bookingId={b.id} className="whitespace-nowrap font-semibold text-brand">{b.member_name || "—"}</BookingDetail>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand/70">
                    {b.service_name || "Sessie"}{b.persons > 1 && <span className="ml-1 text-xs font-bold text-brand/40">· {b.persons}p</span>}
                  </td>
                  <td className="px-4 py-3"><SourceChip b={b} /></td>
                  <td className="px-4 py-3">
                    {upcoming && b.status === "bevestigd" ? (
                      <ActionForm action={adminAssignCoach} success="Coach bijgewerkt ✓" className="flex items-center gap-1">
                        <input type="hidden" name="bookingId" value={b.id} />
                        <select name="coachId" defaultValue={b.coach_id || ""} className="max-w-[9rem] rounded-lg border-2 border-borderc px-2 py-1 text-xs">
                          <option value="">— geen —</option>
                          {coaches.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <button className="rounded-lg bg-brand px-2 py-1 text-[10px] font-bold text-white">OK</button>
                      </ActionForm>
                    ) : (
                      <span className="text-xs text-brand/50">{b.coach_name || "—"}</span>
                    )}
                  </td>
                  {/* Betaald + status + annuleren samengevoegd tot één compacte icoon-cel. */}
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {b.status !== "bevestigd" ? (
                        <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold capitalize text-brand/50">{b.status}</span>
                      ) : paid ? (
                        <span className="text-base leading-none text-accentdark" title="Betaald · bevestigd">✓</span>
                      ) : (
                        <>
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-600" title="Nog niet betaald">€ open</span>
                          <ActionForm action={adminMarkBookingPaid} success="Gemarkeerd als betaald ✓" className="inline" onSubmit={(e) => { if (!confirm("Markeer als betaald (cash/overschrijving aan de balie)?")) e.preventDefault(); }}>
                            <input type="hidden" name="bookingId" value={b.id} />
                            <button className="rounded-full border border-borderc px-1.5 py-0.5 text-[10px] font-bold text-brand/60 transition hover:border-accent hover:text-brand" title="Cash/overschrijving ontvangen aan de balie">✓ cash</button>
                          </ActionForm>
                        </>
                      )}
                      {upcoming && b.status === "bevestigd" && (
                        <form action={adminCancelBooking} className="inline" onSubmit={(e) => { if (!confirm("Deze boeking annuleren? Het lid krijgt bericht en wordt (indien online betaald) automatisch terugbetaald.")) e.preventDefault(); }}>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <button className="rounded-full px-1.5 py-0.5 text-xs font-bold text-brand/30 transition hover:bg-red-50 hover:text-red-600" title="Annuleer deze boeking">✕</button>
                        </form>
                      )}
                    </span>
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
