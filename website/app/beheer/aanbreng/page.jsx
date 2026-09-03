import { Fragment } from "react";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import ActionForm from "@/components/ui/ActionForm";
import SearchSelect from "@/components/admin/SearchSelect";
import { fmt, fmtDate } from "@/lib/format";
import { brusselsDateStr, slotInstant } from "@/lib/time";
import {
  geefDoorAanCoach,
  wijzigDoorgave,
  beeindigDoorgave,
  rekenAanbrengAan,
  markeerNagekeken,
  scheldAanbrengKwijt,
  zetVerplichteClient,
  bewaarAanbrengInstellingen,
} from "../aanbreng-actions";
import {
  BRON_LABEL,
  FEE_MAX_CENTS,
  FEE_STANDAARD_CENTS,
  STATUS_LABEL,
  STATUS_TOON,
  beurtTekst,
  beurtenVoor,
  centsVoor,
  euroTekst,
  feeZin,
  opbrengstCents,
  teControleren,
  betaaldDoorDeKlant,
} from "@/lib/aanbreng";

export const dynamic = "force-dynamic";

// Waarom deze pagina bestaat: de aanbrengvergoeding is een afspraak tussen mensen, geen automaat.
// De databank rekent aan zodra een boeking naar een aanvaarde doorgave wijst, maar alles wat
// daarbuiten valt — een coach die geen client invult, een klant die stopt, een sessie die anders
// liep — hoort hier als signaal te staan waar de eigenaar zelf over beslist.

const REDEN_LABEL = {
  "naam-match": "De ingevulde naam lijkt op een aangebrachte klant",
  "geen-naam": "Geen naam ingevuld bij een gereserveerd uur",
  "andere-naam": "De naam lijkt op geen enkele aangebrachte klant",
};
const REDEN_TOON = {
  "naam-match": "bg-amber-100 text-amber-700",
  "geen-naam": "bg-paper text-brand/60",
  "andere-naam": "bg-paper text-brand/45",
};

const invoer = "rounded-lg border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent";
const knopGroen = "rounded-full bg-accent px-4 py-2 text-xs font-black text-brand transition hover:opacity-90";
const knopWit = "rounded-full border-2 border-borderc bg-white px-4 py-2 text-xs font-bold text-brand transition hover:border-lav";
const komma = (cents) => String(cents / 100).replace(".", ",");

export default async function Aanbreng() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { gym, profile } = ctx;
  if (profile.role !== "beheerder") {
    return <div className="px-8 py-8 text-brand/60">Enkel de beheerder kan de aanbreng bekijken.</div>;
  }

  const admin = createAdminClient();
  const nu = new Date();
  // Begin van deze maand in Brusselse tijd: de server draait op UTC, en een aanrekening van
  // 1 september om 01:00 hoort bij september, niet bij de maand ervoor.
  const maandStart = slotInstant(brusselsDateStr(nu).slice(0, 8) + "01", 0);

  const [doorgaven, checks, overzicht, ledger, personeel] = await Promise.all([
    admin.from("gym_referrals").select("*").eq("gym_id", gym.id).order("referred_at", { ascending: false }),
    admin.from("gym_referral_checks").select("booking_id").eq("gym_id", gym.id),
    admin.rpc("referral_overzicht", { p_gym: gym.id }),
    admin
      .from("coach_ledger")
      .select("delta, reason")
      .eq("gym_id", gym.id)
      .in("reason", ["aanbreng", "aanbreng_terug", "kwijtschelding"])
      .gte("created_at", maandStart.toISOString()),
    admin
      .from("profiles")
      .select("id, full_name, email, role, coach_accepting_clients, coach_require_client")
      .eq("gym_id", gym.id)
      .in("role", ["coach", "beheerder"])
      .order("full_name"),
  ]);

  const referrals = doorgaven.data || [];
  const coaches = personeel.data || [];
  const naamVan = new Map(coaches.map((c) => [c.id, c.full_name || c.email || "Coach"]));

  const lopend = referrals.filter((r) => r.status === "aanvaard" && !r.ended_at);
  const wachtend = referrals.filter((r) => r.status === "voorgesteld");

  // De controlelijst kijkt alleen naar sessies die ná de oudste lopende doorgave vielen. Loopt er
  // geen enkele doorgave, dan valt er niets te controleren en halen we de boekingen niet eens op.
  const vanaf = lopend.length ? Math.min(...lopend.map((r) => new Date(r.referred_at).getTime())) : null;
  const boekingen = vanaf
    ? (
        await admin
          .from("bookings")
          .select("id, user_id, coach_id, starts_at, status, notes, coach_billing")
          .eq("gym_id", gym.id)
          .eq("status", "bevestigd")
          .not("coach_id", "is", null)
          .gte("starts_at", new Date(vanaf).toISOString())
          .lte("starts_at", nu.toISOString())
          .order("starts_at", { ascending: false })
          .limit(1000)
      ).data || []
    : [];

  const afgevinkt = (checks.data || []).map((c) => c.booking_id);
  const controle = teControleren({ bookings: boekingen, referrals, checked: afgevinkt });

  // Tweede, subtieler geval: de klant boekt de zaal ZELF via /boeken en kiest daar de coach. Dan
  // staat de sessie op naam van de klant, betaalt de coach niets (dat is vandaag ook al zo) en
  // vindt de trigger geen 'credit'-boeking om iets aan op te hangen. Volledig herkenbaar, dus het
  // hoort zichtbaar te zijn — of daar iets voor betaald wordt, is een afspraak, geen automatisme.
  const zelfBetaald = boekingen.length
    ? betaaldDoorDeKlant({
        bookings: boekingen,
        referrals,
        ledger: ((await admin.from("coach_ledger").select("ref_id, reason, delta").eq("gym_id", gym.id).eq("reason", "aanbreng").not("ref_id", "is", null)).data) || [],
        checked: afgevinkt,
      })
    : [];

  // opbrengstCents telt bewust alleen aanrekeningen en terugboekingen. Wat je kwijtschold staat er
  // apart onder: het is geen omzet die nooit bestond, het is omzet die je zelf hebt weggegeven.
  const ledgerRijen = ledger.data || [];
  const maandOpbrengst = opbrengstCents(ledgerRijen);
  const kwijtCents = centsVoor(
    ledgerRijen.filter((r) => r.reason === "kwijtschelding").reduce((a, r) => a + Number(r.delta || 0), 0),
  );

  const perDoorgave = new Map((overzicht.data || []).map((r) => [r.referral_id, r]));
  const standaardCents = gym.referral_fee_cents ?? FEE_STANDAARD_CENTS;
  const voorkeurCents = gym.referral_fee_voorkeur_cents ?? FEE_STANDAARD_CENTS;
  const maxEur = FEE_MAX_CENTS / 100;

  const beschikbaar = coaches.filter((c) => c.coach_accepting_clients);
  const maandNaam = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", month: "long" }).format(nu);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-3xl font-black text-brand">Aanbreng</h1>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-brand/55">
        Klanten die Fittin&rsquo; aan een coach doorgeeft. Vanaf de aanvaarding kost elke boeking die de coach met
        die klant maakt {feeZin(standaardCents)} bovenop de gewone zaalhuur. Dat loopt volledig via het tegoed
        van de coach — het lid betaalt exact hetzelfde als anders.
      </p>

      {/* ── 1. Kopcijfers ─────────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tegel label="Lopende doorgaven" value={lopend.length} sub="aanvaard door de coach" />
        <Tegel label="Wacht op aanvaarding" value={wachtend.length} sub="zolang wordt niets aangerekend" />
        <Tegel
          label={`Opbrengst in ${maandNaam}`}
          value={euroTekst(maandOpbrengst)}
          sub={kwijtCents > 0 ? `${euroTekst(kwijtCents)} kwijtgescholden` : null}
          accent
        />
        <Tegel label="Te controleren" value={controle.length} sub="sessies zonder client" alarm={controle.length > 0} />
      </div>

      {/* ── 2. Te controleren ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-xl font-black text-brand">Te controleren</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-brand/55">
          Hangt een coach geen client aan zijn uur, dan staat de sessie als een gereserveerd uur op zijn eigen naam
          en ziet de databank geen aangebrachte klant. Hieronder staan precies die uren, van coaches met een lopende
          doorgave. Het systeem rekent hier bewust niets zelf aan: een coach mag op datzelfde uur met een eigen klant
          trainen, en verkeerd aanrekenen kost meer vertrouwen dan het gat opbrengt. Jij beslist per rij.
        </p>

        {controle.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-borderc bg-white p-5 text-sm text-brand/60">
            Niets open. Elke voorbije sessie heeft een client, of is al nagekeken.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-borderc bg-white">
            {controle.map((rij) => {
              // Bij een naam-match tonen we alleen de kandidaten; zonder match alle lopende doorgaven
              // van die coach, want de beheerder weet vaak wél met wie er getraind is.
              const opties = rij.kandidaten.length ? rij.kandidaten : rij.doorgaven;
              const enkel = opties.length === 1 ? opties[0] : null;
              return (
                <div key={rij.bookingId} className="border-b border-borderc px-5 py-4 last:border-0">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-brand">
                        {fmt(rij.startsAt)} · {naamVan.get(rij.coachId) || "Coach"}
                      </p>
                      <p className="mt-0.5 text-sm text-brand/60">
                        {rij.naam ? (
                          <>
                            Ingevuld: <b className="text-brand">{rij.naam}</b>
                          </>
                        ) : (
                          <span className="text-brand/45">Geen naam ingevuld</span>
                        )}
                      </p>
                      <span className={"mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold " + REDEN_TOON[rij.reden]}>
                        {REDEN_LABEL[rij.reden]}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <ActionForm action={rekenAanbrengAan} success="Aangerekend ✓" className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="bookingId" value={rij.bookingId} />
                        {enkel ? (
                          <input type="hidden" name="referralId" value={enkel.id} />
                        ) : (
                          <SearchSelect
                            name="referralId"
                            required
                            placeholder="Met welke klant?"
                            className="w-60"
                            options={opties.map((o) => ({
                              value: o.id,
                              label: `${o.client_name || o.client_email} · ${euroTekst(o.fee_cents)}`,
                            }))}
                          />
                        )}
                        <button className={knopGroen}>{enkel ? `Reken ${euroTekst(enkel.fee_cents)} aan` : "Reken aan"}</button>
                      </ActionForm>

                      <ActionForm action={markeerNagekeken} success="Afgevinkt ✓">
                        <input type="hidden" name="bookingId" value={rij.bookingId} />
                        <button className={knopWit}>Geen aanbreng</button>
                      </ActionForm>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* Sessies die de klant zelf betaalde. Leeg = onzichtbaar: dit gebeurt zelden en hoort
            geen vaste kop op het scherm te krijgen. */}
        {zelfBetaald.length > 0 && (
          <div className="mt-6 rounded-2xl border border-borderc bg-white p-5">
            <h3 className="text-sm font-black text-brand">De klant betaalde de zaal zelf</h3>
            <p className="mt-1 text-sm text-brand/60">
              Deze sessies boekte de klant via de site, met de coach erbij gekozen. De coach betaalde dus geen
              sessietegoed en er is automatisch niets aangerekend. Of je hier iets voor vraagt, spreek je met de
              coach af — de knop staat klaar.
            </p>
            <div className="mt-3 divide-y divide-borderc">
              {zelfBetaald.map((rij) => (
                <div key={rij.bookingId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <span className="text-sm font-bold text-brand">{fmt(rij.startsAt)}</span>
                  <span className="text-sm text-brand/60">{naamVan.get(rij.coachId) || "Coach"}</span>
                  <span className="text-sm text-brand/60">· {rij.doorgave.client_name || rij.doorgave.client_email}</span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <ActionForm action={rekenAanbrengAan} success="Aangerekend ✓">
                      <input type="hidden" name="bookingId" value={rij.bookingId} />
                      <input type="hidden" name="referralId" value={rij.doorgave.id} />
                      <button className={knopGroen}>Reken {euroTekst(rij.doorgave.fee_cents)} aan</button>
                    </ActionForm>
                    <ActionForm action={markeerNagekeken} success="Afgevinkt ✓">
                      <input type="hidden" name="bookingId" value={rij.bookingId} />
                      <button className={knopWit}>Geen aanbreng</button>
                    </ActionForm>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Doorgaven ──────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-xl font-black text-brand">Doorgaven</h2>

        {beschikbaar.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-borderc bg-white p-4 text-sm text-brand/60">
            Geen enkele coach staat op &ldquo;neemt nieuwe klanten aan&rdquo;. Zolang dat zo is, kan je niemand doorgeven.
          </p>
        ) : (
          <details className="mt-3 rounded-2xl border border-borderc bg-white">
            <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-brand/60">+ Klant handmatig doorgeven</summary>
            <ActionForm action={geefDoorAanCoach} success="Doorgegeven ✓" className="border-t border-borderc p-5">
              <input type="hidden" name="source" value="manueel" />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-brand">Coach</span>
                  <SearchSelect
                    name="coachId"
                    required
                    placeholder="Kies een coach…"
                    options={beschikbaar.map((c) => ({ value: c.id, label: c.full_name || c.email }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-brand">E-mail van de klant</span>
                  <input name="clientEmail" type="email" required placeholder="naam@voorbeeld.be" className={invoer + " w-full"} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-brand">Naam van de klant</span>
                  <input name="clientName" placeholder="Sarah Declerck" className={invoer + " w-full"} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-brand">Tarief per sessie (€)</span>
                  <input name="feeEur" inputMode="decimal" defaultValue={komma(standaardCents)} className={invoer + " w-full"} />
                  <span className="mt-1 block text-xs text-brand/45">Maximum € {maxEur}. Ligt vast zodra de coach aanvaardt.</span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-brand">Max sessies (optioneel)</span>
                  <input name="sessionsCap" inputMode="numeric" placeholder="onbeperkt" className={invoer + " w-full"} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-brand">Max maanden (optioneel)</span>
                  <input name="monthsCap" inputMode="numeric" placeholder="onbeperkt" className={invoer + " w-full"} />
                </label>
                <label className="block lg:col-span-3">
                  <span className="mb-1 block text-sm font-bold text-brand">Nota voor de coach (optioneel)</span>
                  <input name="note" placeholder="Wil twee keer per week trainen, revalidatie knie." className={invoer + " w-full"} />
                </label>
              </div>
              <button className="mt-4 rounded-full bg-accent px-6 py-2.5 text-sm font-black text-brand transition hover:opacity-90">
                Doorgeven aan de coach
              </button>
              <p className="mt-2 text-xs text-brand/45">
                De coach krijgt een melding en een mail, en moet zelf aanvaarden. Tot dan wordt er niets aangerekend.
              </p>
            </ActionForm>
          </details>
        )}

        {referrals.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-borderc bg-white p-5 text-sm text-brand/60">Nog geen enkele klant doorgegeven.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-borderc bg-white">
            <table className="w-full min-w-[940px] text-sm">
              <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
                <tr>
                  <th className="px-5 py-3">Klant</th>
                  <th className="px-5 py-3">Coach</th>
                  <th className="px-5 py-3">Bron</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Tarief</th>
                  <th className="px-5 py-3 text-right" title="Aantal boekingen waarvoor de aanbreng effectief is aangerekend">Sessies</th>
                  <th className="px-5 py-3 text-right">Opbrengst</th>
                  <th className="px-5 py-3">Doorgegeven</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => {
                  const o = perDoorgave.get(r.id);
                  const sessies = Number(o?.sessies || 0);
                  const beurten = Number(o?.beurten || 0);
                  const actief = r.status === "voorgesteld" || r.status === "aanvaard";
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t border-borderc align-top">
                        <td className="px-5 py-4">
                          <p className="font-bold text-brand">{r.client_name || r.client_email}</p>
                          {r.client_name && <p className="text-xs text-brand/50">{r.client_email}</p>}
                          <p className="mt-0.5 text-[11px] font-semibold text-brand/40">
                            {r.client_id ? "account gekoppeld" : "nog geen account"}
                          </p>
                        </td>
                        <td className="px-5 py-4 font-semibold text-brand/75">{naamVan.get(r.coach_id) || "Coach"}</td>
                        <td className="px-5 py-4 text-xs text-brand/55">{BRON_LABEL[r.source] || r.source}</td>
                        <td className="px-5 py-4">
                          <span className={"inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold " + (STATUS_TOON[r.status] || "bg-paper text-brand/50")}>
                            {STATUS_LABEL[r.status] || r.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="font-bold text-brand">{euroTekst(r.fee_cents)}</span>
                          <span className="ml-1 text-[11px] text-brand/40">{beurtTekst(beurtenVoor(r.fee_cents))} beurt</span>
                        </td>
                        <td className="px-5 py-4 text-right tabular-nums text-brand/70">{sessies}</td>
                        <td className="px-5 py-4 text-right font-bold tabular-nums text-accentdark">{euroTekst(centsVoor(beurten))}</td>
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-brand/55">{fmtDate(r.referred_at)}</td>
                      </tr>
                      <tr>
                        <td colSpan={8} className="px-5 pb-4">
                          <details>
                            <summary className="cursor-pointer text-xs font-bold text-brand/40">Beheren</summary>
                            <div className="mt-3 grid gap-5 rounded-xl bg-paper/70 p-4 lg:grid-cols-3">
                              {(r.accepted_at || r.note || r.ended_reason || r.sessions_cap || r.months_cap) && (
                                <div className="space-y-0.5 text-xs leading-relaxed text-brand/60 lg:col-span-3">
                                  {r.accepted_at && <p>Aanvaard op {fmtDate(r.accepted_at)}.</p>}
                                  {r.sessions_cap && <p>Plafond: {r.sessions_cap} sessies.</p>}
                                  {r.months_cap && <p>Plafond: {r.months_cap} maanden.</p>}
                                  {r.note && <p>Nota: {r.note}</p>}
                                  {r.ended_reason && <p>Gestopt: {r.ended_reason}</p>}
                                </div>
                              )}

                              {actief && (
                                <ActionForm action={wijzigDoorgave} success="Doorgave bijgewerkt ✓">
                                  <p className="text-xs font-bold uppercase tracking-wide text-lav">Tarief en plafonds</p>
                                  <input type="hidden" name="referralId" value={r.id} />
                                  <div className="mt-2 flex flex-wrap items-end gap-2">
                                    <label className="block">
                                      <span className="mb-1 block text-[11px] font-semibold text-brand/55">€ per sessie</span>
                                      <input name="feeEur" inputMode="decimal" defaultValue={komma(r.fee_cents)} className={invoer + " w-20"} />
                                    </label>
                                    <label className="block">
                                      <span className="mb-1 block text-[11px] font-semibold text-brand/55">Max sessies</span>
                                      <input name="sessionsCap" inputMode="numeric" defaultValue={r.sessions_cap ?? ""} placeholder="∞" className={invoer + " w-20"} />
                                    </label>
                                    <label className="block">
                                      <span className="mb-1 block text-[11px] font-semibold text-brand/55">Max maanden</span>
                                      <input name="monthsCap" inputMode="numeric" defaultValue={r.months_cap ?? ""} placeholder="∞" className={invoer + " w-20"} />
                                    </label>
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
                                    <label className="block">
                                      <span className="mb-1 block text-[11px] font-semibold text-brand/55">Reden</span>
                                      <input name="reason" placeholder="Klant traint niet meer" className={invoer + " w-52"} />
                                    </label>
                                    <button className={knopWit}>Beëindigen</button>
                                  </div>
                                  <p className="mt-1.5 text-[11px] text-brand/45">Nieuwe sessies met deze klant kosten de coach dan niets extra meer.</p>
                                </ActionForm>
                              )}

                              {beurten > 0 && (
                                <ActionForm action={scheldAanbrengKwijt} success="Kwijtgescholden ✓">
                                  <p className="text-xs font-bold uppercase tracking-wide text-lav">Kwijtschelden</p>
                                  <input type="hidden" name="referralId" value={r.id} />
                                  <div className="mt-2 flex flex-wrap items-end gap-2">
                                    <label className="block">
                                      <span className="mb-1 block text-[11px] font-semibold text-brand/55">Beurten terug</span>
                                      <input name="beurten" inputMode="decimal" placeholder="0,5" className={invoer + " w-20"} />
                                    </label>
                                    <button className={knopWit}>Terugzetten</button>
                                  </div>
                                  <p className="mt-1.5 text-[11px] text-brand/45">
                                    Tot nu aangerekend: {beurtTekst(beurten)} beurt. De aanrekening zelf blijft staan, zodat je later nog ziet wat er gebeurde.
                                  </p>
                                </ActionForm>
                              )}
                            </div>
                          </details>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 4. Instellingen ───────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-xl font-black text-brand">Instellingen</h2>

        <ActionForm action={bewaarAanbrengInstellingen} success="Instellingen opgeslagen ✓" className="mt-3 max-w-2xl rounded-2xl border border-borderc bg-white p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-brand">Standaardtarief (€ per sessie)</span>
              <input name="feeEur" inputMode="decimal" defaultValue={komma(standaardCents)} className={invoer + " w-full"} />
              <span className="mt-1 block text-xs text-brand/50">Fittin&rsquo; zoekt de klant én kiest de coach.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-brand">Klant koos zelf een coach (€ per sessie)</span>
              <input name="feeVoorkeurEur" inputMode="decimal" defaultValue={komma(voorkeurCents)} className={invoer + " w-full"} />
              <span className="mt-1 block text-xs text-brand/50">Bij een intake met een voorkeurcoach levert Fittin&rsquo; wel de klant, niet de match.</span>
            </label>
          </div>
          <button className="mt-5 rounded-full bg-accent px-6 py-2.5 text-sm font-black text-brand transition hover:opacity-90">Opslaan</button>
          <p className="mt-2 text-xs text-brand/45">
            Geldt voor nieuwe doorgaven. Lopende afspraken houden het tarief dat de coach aanvaardde. Maximum € {maxEur}.
          </p>
        </ActionForm>

        <div className="mt-4 overflow-hidden rounded-2xl border border-borderc bg-white">
          <div className="border-b border-borderc px-5 py-3">
            <p className="text-sm font-black text-brand">Client verplicht bij elke boeking</p>
            <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-brand/55">
              Deze verplichting gaat vanzelf aan zodra een coach zijn eerste aangebrachte klant aanvaardt — zonder naam
              bij een sessie valt de vergoeding niet te controleren. Je kan ze hier per coach weer uitzetten.
            </p>
          </div>
          {coaches.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-borderc px-5 py-3 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-brand">{c.full_name || c.email}</p>
                <p className="text-xs text-brand/45">
                  {c.coach_accepting_clients ? "neemt nieuwe klanten aan" : "neemt geen nieuwe klanten aan"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold " +
                    (c.coach_require_client ? "bg-accent/15 text-accentdark" : "bg-paper text-brand/45")
                  }
                >
                  {c.coach_require_client ? "verplicht" : "vrij"}
                </span>
                <ActionForm action={zetVerplichteClient} success="Aangepast ✓">
                  <input type="hidden" name="coachId" value={c.id} />
                  <input type="hidden" name="aan" value={c.coach_require_client ? "0" : "1"} />
                  <button className={knopWit}>{c.coach_require_client ? "Uitzetten" : "Aanzetten"}</button>
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Tegel({ label, value, sub, accent, alarm }) {
  return (
    <div className={"rounded-2xl border bg-white p-5 " + (alarm ? "border-amber-300" : "border-borderc")}>
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-3xl font-black " + (alarm ? "text-amber-600" : accent ? "text-accentdark" : "text-brand")}>{value}</p>
      {sub && <p className="mt-1 text-xs text-brand/40">{sub}</p>}
    </div>
  );
}
