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
  "Coach · vooraf betaald": { icon: "🧑‍🏫", cls: "bg-brand/10 text-brand" },
  "Coach-factuur": { icon: "🧾", cls: "bg-brand/10 text-brand" },
  "Coach · gratis": { icon: "🧑‍🏫", cls: "bg-brand/10 text-brand" },
  "Ingepland door beheer": { icon: "🏠", cls: "bg-paper text-brand/55" },
  "Gratis gegeven": { icon: "🎁", cls: "bg-amber-100 text-amber-700" },
  "Via coach": { icon: "🧑‍🏫", cls: "bg-brand/10 text-brand" },
  "Online": { icon: "💳", cls: "bg-paper text-brand/55" },
};

function SourceChip({ b }) {
  const label = sourceLabel(b);
  const st = SRC_STYLE[label] || SRC_STYLE["Online"];
  const short = label === "Ingepland door beheer" ? "Door beheer" : label;
  const used = b.credits_used;         // wat DEZE boeking van de kaart nam
  return (
    <span className="block">
      <span
        className={"inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold " + st.cls}
        title={label === "Beurtenkaart" ? "Betaald: de beurt is bij het boeken van de kaart afgetrokken." : undefined}
      >
        <span aria-hidden>{st.icon}</span>{short}
      </span>
      {/* Waarom gaven we deze sessie weg? Zonder deze regel was "gratis" een blinde vlek. */}
      {b.comp_reason && (
        <span className="mt-0.5 block text-[10px] font-bold text-amber-700">
          {b.comp_reason}{b.comp_value_cents ? ` · € ${(b.comp_value_cents / 100).toFixed(2).replace(".", ",")} weggegeven` : ""}
        </span>
      )}
      {/* WAT DEZE SESSIE KOSTTE — per rij, uit credits_ledger. Voorheen stond hier het huidige
          saldo van het lid, op élke rij hetzelfde. Wie vier sessies in één keer boekte zag dus vier
          keer "kaart nu leeg", wat leest alsof die vier samen met één beurt betaald waren en de
          boeking misgelopen was. Nu zie je per sessie de beurt die ervoor is afgetrokken. */}
      {/* Enkel bij een échte beurtenkaart. Een abonnementssessie boekt ook een beurt af (de
          inbegrepen maandsessie), maar "van de kaart" zou daar de verkeerde uitleg zijn. */}
      {label === "Beurtenkaart" && used != null && used > 0 && (
        <span className="mt-0.5 block text-[10px] font-bold text-accentdark">
          −{String(used).replace(".", ",")} {used === 1 ? "beurt" : "beurten"} van de kaart
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

      {/* Per render bijhouden van welke leden het kaartsaldo al getoond is (zie hieronder). */}
      <div className="mt-3 overflow-x-auto rounded-2xl border border-borderc bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-4 py-3">Wanneer</th>
              <th className="px-4 py-3">Lid</th>
              <th className="px-4 py-3">Sessie</th>
              <th className="px-4 py-3" title="Hoe deze sessie betaald is">Betaalwijze</th>
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
                          <BookingDetail bookingId={b.id} coaches={coaches} assignAction={adminAssignCoach} className="font-semibold text-brand">{b.coach_name || "Coach"}</BookingDetail>
                          <span className="rounded bg-brand px-1.5 py-0.5 text-[9px] font-black text-white">COACH</span>
                        </span>
                        <span className="block text-[11px] font-normal text-brand/45">{b.notes ? `PT · ${b.notes}` : "PT · nog geen client"}</span>
                        {/* Ook bij een coach hoort het saldo bij de persoon. Zonder dit getal leest
                            "Coach · vooraf betaald" als een gunst, terwijl het gewoon zijn vooraf
                            gekochte sessies zijn die per boeking afgaan — net als een beurtenkaart. */}
                        {b.coach_credits_left != null && (
                          <span className={"mt-0.5 block text-[11px] font-bold " + (b.coach_credits_left <= 0 ? "text-red-600" : "text-brand/45")}>
                            {b.coach_credits_left <= 0
                              ? `🎟 tegoed op — € ${Math.ceil(Math.abs(b.coach_credits_left) * 12)} te innen`
                              : `🎟 nog ${String(b.coach_credits_left).replace(".", ",")} vooraf betaalde ${b.coach_credits_left === 1 ? "sessie" : "sessies"}`}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="block">
                        <BookingDetail bookingId={b.id} coaches={coaches} assignAction={adminAssignCoach} className="whitespace-nowrap font-semibold text-brand">{b.member_name || "—"}</BookingDetail>
                        {/* Kaartsaldo hoort bij de PERSOON, dus staat het bij de naam en niet in de
                            betaalwijze-kolom. Daar had het al eens voor verwarring gezorgd: vier
                            rijen die alle vier het eindsaldo toonden lazen alsof één beurt vier
                            sessies betaalde. Hier is het ondubbelzinnig "dit lid heeft nog X". */}
                        {b.credits_left != null && (
                          <span className={"mt-0.5 block text-[11px] font-bold " + (b.credits_left <= 0 ? "text-amber-600" : "text-brand/45")}>
                            {b.credits_left <= 0
                              ? "🎟 kaart is op"
                              : `🎟 nog ${String(b.credits_left).replace(".", ",")} ${b.credits_left === 1 ? "beurt" : "beurten"}`}
                          </span>
                        )}
                        {/* Coach kreeg een eigen kolom met een keuzelijst op élke rij. Dat was bijna
                            altijd "— geen —" en dus vooral ruis; nu enkel tonen als er echt een
                            coach aan hangt. Toewijzen kan nog steeds via het boekingsdetail. */}
                        {b.coach_name && (
                          <span className="mt-0.5 block text-[11px] font-normal text-brand/45">🧑‍🏫 {b.coach_name}</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-brand/70">
                    {b.service_name || "Sessie"}{b.persons > 1 && <span className="ml-1 text-xs font-bold text-brand/40">· {b.persons}p</span>}
                  </td>
                  <td className="px-4 py-3"><SourceChip b={b} /></td>
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
