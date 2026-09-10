"use client";
import { useMemo, useState } from "react";
import ActionForm from "@/components/ui/ActionForm";
import { wijzigDoorgave, beeindigDoorgave, scheldAanbrengKwijt } from "@/app/beheer/aanbreng-actions";
import { STATUS_LABEL, STATUS_TOON, BRON_LABEL, euroTekst, beurtTekst, beurtenVoor, centsVoor } from "@/lib/aanbreng";

// De doorgaven, met een zoekbalk en drie tabbladen.
//
// Waarom dit een client component is en de tabel eerst gewoon server-HTML was: zoeken in een lijst
// waar namen in staan, moet meteen reageren. Een zoekopdracht die een paginabezoek kost, gebruikt
// niemand twee keer. De rijen komen kant-en-klaar uit de server; hier gebeurt alleen filteren.

const invoer = "rounded-lg border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent";
const knopGroen = "rounded-full bg-accent px-4 py-2 text-xs font-black text-brand transition hover:opacity-90";
const knopWit = "rounded-full border-2 border-borderc bg-white px-4 py-2 text-xs font-bold text-brand transition hover:border-lav";
const komma = (cents) => String(cents / 100).replace(".", ",");
const datum = (iso) => (iso ? new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "—");

const TABS = [
  { v: "lopend", l: "Loopt", statussen: ["aanvaard"] },
  { v: "wacht", l: "Wacht op de coach", statussen: ["voorgesteld"] },
  { v: "gestopt", l: "Gestopt", statussen: ["beeindigd", "geweigerd"] },
];

export default function AanbrengDoorgaven({ rijen }) {
  const [tab, setTab] = useState("lopend");
  const [zoek, setZoek] = useState("");
  const [openId, setOpenId] = useState(null);

  const tellers = useMemo(() => {
    const t = {};
    for (const tb of TABS) t[tb.v] = rijen.filter((r) => tb.statussen.includes(r.status)).length;
    return t;
  }, [rijen]);

  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    const statussen = TABS.find((t) => t.v === tab)?.statussen || [];
    return rijen.filter((r) => {
      if (!statussen.includes(r.status)) return false;
      if (!q) return true;
      return [r.client_name, r.client_email, r.coachNaam, r.note].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [rijen, tab, zoek]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.v} type="button" onClick={() => setTab(t.v)}
              className={"rounded-full px-4 py-1.5 text-sm font-bold transition " + (tab === t.v ? "bg-brand text-white" : "bg-paper text-brand/60 hover:bg-accent/15")}>
              {t.l} {tellers[t.v] > 0 && <span className="tabular-nums">({tellers[t.v]})</span>}
            </button>
          ))}
        </div>
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op klant, coach of nota…"
          className={invoer + " ml-auto w-full sm:w-72"} />
      </div>

      {zichtbaar.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-borderc bg-white p-5 text-sm text-brand/55">
          {zoek.trim()
            ? `Niets gevonden voor "${zoek.trim()}".`
            : tab === "lopend"
              ? "Er loopt op dit moment geen enkele doorgave."
              : tab === "wacht"
                ? "Geen enkele coach moet nog aanvaarden."
                : "Nog niets gestopt of geweigerd."}
        </p>
      ) : (
        <ul className="mt-3 overflow-hidden rounded-2xl border border-borderc bg-white">
          {zichtbaar.map((r) => {
            const uit = openId === r.id;
            const actief = r.status === "voorgesteld" || r.status === "aanvaard";
            return (
              <li key={r.id} className="border-b border-borderc last:border-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black text-brand">{r.client_name || r.client_email}</p>
                    <p className="truncate text-xs text-brand/50">
                      {r.client_name ? `${r.client_email} · ` : ""}naar {r.coachNaam}
                      {r.client_id ? "" : " · nog geen account"}
                    </p>
                  </div>

                  <span className={"shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold " + (STATUS_TOON[r.status] || "bg-paper text-brand/50")}>
                    {STATUS_LABEL[r.status] || r.status}
                  </span>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-brand">{euroTekst(r.fee_cents)}<span className="font-normal text-brand/40"> / sessie</span></p>
                    <p className="text-xs text-brand/45">
                      {r.sessies} sessie{r.sessies === 1 ? "" : "s"} · {euroTekst(centsVoor(r.beurten))} verdiend
                    </p>
                  </div>

                  <button type="button" onClick={() => setOpenId(uit ? null : r.id)}
                    className="shrink-0 rounded-full border-2 border-borderc bg-white px-3.5 py-1.5 text-xs font-bold text-brand/70 transition hover:border-lav">
                    {uit ? "Sluiten" : "Beheren"}
                  </button>
                </div>

                {uit && (
                  <div className="anim-in border-t border-borderc bg-paper/60 px-5 py-4">
                    <dl className="grid gap-x-8 gap-y-1 text-xs leading-relaxed text-brand/60 sm:grid-cols-2 lg:grid-cols-4">
                      <Feit label="Doorgegeven" waarde={datum(r.referred_at)} />
                      <Feit label="Bron" waarde={BRON_LABEL[r.source] || r.source} />
                      <Feit label="Aanvaard" waarde={r.accepted_at ? datum(r.accepted_at) : "nog niet"} />
                      <Feit label="Plafond" waarde={[r.sessions_cap && `${r.sessions_cap} sessies`, r.months_cap && `${r.months_cap} maanden`].filter(Boolean).join(" · ") || "geen"} />
                      {r.note && <Feit label="Nota" waarde={r.note} breed />}
                      {r.ended_reason && <Feit label="Gestopt" waarde={r.ended_reason} breed />}
                    </dl>

                    {(actief || r.beurten > 0) && (
                      <div className="mt-4 grid gap-5 lg:grid-cols-3">
                        {actief && (
                          <ActionForm action={wijzigDoorgave} success="Doorgave bijgewerkt ✓">
                            <p className="text-xs font-bold uppercase tracking-wide text-lav">Tarief en plafonds</p>
                            <input type="hidden" name="referralId" value={r.id} />
                            <div className="mt-2 flex flex-wrap items-end gap-2">
                              <Veld label="€ per sessie" naam="feeEur" waarde={komma(r.fee_cents)} />
                              <Veld label="Max sessies" naam="sessionsCap" waarde={r.sessions_cap ?? ""} plaats="∞" />
                              <Veld label="Max maanden" naam="monthsCap" waarde={r.months_cap ?? ""} plaats="∞" />
                              <button className={knopGroen}>Bewaren</button>
                            </div>
                            <p className="mt-1.5 text-[11px] text-brand/45">Geldt vanaf nu — al aangerekende beurten blijven staan.</p>
                          </ActionForm>
                        )}

                        {actief && (
                          <ActionForm action={beeindigDoorgave} success="Doorgave beëindigd ✓">
                            <p className="text-xs font-bold uppercase tracking-wide text-lav">Stoppen</p>
                            <input type="hidden" name="referralId" value={r.id} />
                            <div className="mt-2 flex flex-wrap items-end gap-2">
                              <Veld label="Reden" naam="reason" plaats="Klant traint niet meer" breed />
                              <button className={knopWit}>Beëindigen</button>
                            </div>
                            <p className="mt-1.5 text-[11px] text-brand/45">Nieuwe sessies met deze klant kosten de coach dan niets extra meer.</p>
                          </ActionForm>
                        )}

                        {r.beurten > 0 && (
                          <ActionForm action={scheldAanbrengKwijt} success="Kwijtgescholden ✓">
                            <p className="text-xs font-bold uppercase tracking-wide text-lav">Kwijtschelden</p>
                            <input type="hidden" name="referralId" value={r.id} />
                            <div className="mt-2 flex flex-wrap items-end gap-2">
                              <Veld label="Beurten terug" naam="beurten" plaats="0,5" />
                              <button className={knopWit}>Terugzetten</button>
                            </div>
                            <p className="mt-1.5 text-[11px] text-brand/45">
                              Tot nu aangerekend: {beurtTekst(r.beurten)} beurt. De aanrekening blijft staan, zodat je later ziet wat er gebeurde.
                            </p>
                          </ActionForm>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Feit({ label, waarde, breed }) {
  return (
    <div className={breed ? "sm:col-span-2 lg:col-span-4" : ""}>
      <dt className="inline font-bold text-brand/45">{label}: </dt>
      <dd className="inline">{waarde}</dd>
    </div>
  );
}

function Veld({ label, naam, waarde, plaats, breed }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-brand/55">{label}</span>
      <input name={naam} defaultValue={waarde} placeholder={plaats} inputMode={naam === "reason" ? undefined : "decimal"}
        className={invoer + (breed ? " w-52" : " w-24")} />
    </label>
  );
}
