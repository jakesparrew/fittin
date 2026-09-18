import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import ActionForm from "@/components/ui/ActionForm";
import { oordeelZaalcheck, stuurNetheidHerinnering } from "../netheid-actions";
import { STAAT, TAGS, netheidsScore, weekTrend, uurband, KLEUR } from "@/lib/netheid";
import { isoWeek } from "@/lib/punten";

export const dynamic = "force-dynamic";
export const metadata = { title: "Netheid | Beheer" };

const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const uurFmt = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" });
const TAG_L = new Map(TAGS.map((t) => [t.v, t.l]));

// Hoe netjes is de zaal, en wie liet ze zo achter? Eén scherm voor de uitbater.
//
// Wat hier NIET gebeurt: niets gaat automatisch naar een lid. "Wie zat er vóór" is een vermoeden (geen deurlog per
// persoon, codes worden gedeeld). De kleur verschijnt pas na drie checks, en een herinnering stuur je zelf.
export default async function Netheid({ searchParams }) {
  const sp = (await searchParams) || {};
  const tab = sp.tab === "ervaring" ? "ervaring" : "zaal";
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { gym } = ctx;
  const admin = createAdminClient();
  const sinds = new Date(Date.now() - 90 * 86400000).toISOString();

  const [{ data: checks }, { count: sessies8w }, { data: ratings }] = await Promise.all([
    admin.from("zaal_checks")
      .select("booking_id, state, tags, photo_path, previous_kind, previous_user, owner_verdict, herinnerd_at, created_at, member:profiles!zaal_checks_user_id_fkey(full_name), prev:profiles!zaal_checks_previous_user_fkey(id, full_name, role), vorige:bookings!zaal_checks_previous_booking_fkey(starts_at, ends_at, persons), deze:bookings!zaal_checks_booking_id_fkey(starts_at)")
      .eq("gym_id", gym.id).gte("created_at", sinds).order("created_at", { ascending: false }).limit(500),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "bevestigd")
      .gte("starts_at", new Date(Date.now() - 56 * 86400000).toISOString()).lte("starts_at", new Date().toISOString()),
    admin.from("session_feedback").select("rating, comment, energie, created_at, member:profiles!session_feedback_user_id_fkey(full_name)")
      .eq("gym_id", gym.id).gte("created_at", sinds).order("created_at", { ascending: false }).limit(300),
  ]);
  const alle = checks || [];
  const w8 = alle.filter((c) => new Date(c.created_at).getTime() >= Date.now() - 56 * 86400000);
  const respons = sessies8w ? Math.round((w8.length / sessies8w) * 100) : 0;
  const trend = weekTrend(w8, isoWeek).slice(-8);
  const dezeWeek = trend.find((t) => t.week === isoWeek(new Date().toISOString()));
  const perBand = ["ochtend", "middag", "avond"].map((b) => {
    const x = w8.filter((c) => c.state !== "stuk" && uurband(c.deze?.starts_at || c.created_at) === b);
    return { b, n: x.length, pct: x.length ? Math.round((x.filter((c) => c.state === "netjes").length / x.length) * 100) : null };
  });

  // Signed URLs voor de foto's (privébak), een uur geldig.
  const fotoUrls = {};
  for (const c of alle.filter((c) => c.photo_path && c.state !== "netjes").slice(0, 60)) {
    try {
      const { data } = await admin.storage.from("meldingen").createSignedUrl(c.photo_path, 3600);
      if (data?.signedUrl) fotoUrls[c.booking_id] = data.signedUrl;
    } catch {}
  }

  // Score per persoon (enkel de checks waarin hij de VORIGE was).
  const perPersoon = new Map();
  for (const c of alle) {
    if (!c.previous_user || c.previous_kind === "eigen") continue;
    if (!perPersoon.has(c.previous_user)) perPersoon.set(c.previous_user, { naam: c.prev?.full_name || "?", rol: c.prev?.role, checks: [] });
    perPersoon.get(c.previous_user).checks.push(c);
  }
  const scores = [...perPersoon.entries()].map(([id, p]) => ({ id, ...p, ...netheidsScore(p.checks) }))
    .filter((p) => p.kleur).sort((a, b) => (a.kleur === "rood" ? -1 : 0) - (b.kleur === "rood" ? -1 : 0) || a.score - b.score);
  const aandacht = scores.filter((p) => p.kleur === "rood");
  const tijdlijn = alle.filter((c) => c.state !== "netjes").slice(0, 60);

  const r8 = (ratings || []).filter((r) => new Date(r.created_at).getTime() >= Date.now() - 56 * 86400000);
  const gem = r8.length ? (r8.reduce((a, r) => a + r.rating, 0) / r8.length).toFixed(1).replace(".", ",") : "—";

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-3xl font-black text-ink">Netheid & ervaring</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink/60">
        Bij het binnenkomen tikken leden in hun deurcodemail hoe ze de zaal vonden. Wie er vóór hen zat, zie enkel jij —
        leden nooit. Een kleur verschijnt pas na drie checks, en er vertrekt nooit iets automatisch.
      </p>

      <div className="mt-5 flex gap-2 text-sm font-bold">
        <Link href="/beheer/netheid" className={"rounded-full px-4 py-2 " + (tab === "zaal" ? "bg-brand text-white" : "border border-borderc bg-surface text-ink/60")}>Zaal</Link>
        <Link href="/beheer/netheid?tab=ervaring" className={"rounded-full px-4 py-2 " + (tab === "ervaring" ? "bg-brand text-white" : "border border-borderc bg-surface text-ink/60")}>Ervaring (sterren)</Link>
      </div>

      {tab === "zaal" ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <Stat label="Netjes deze week" value={dezeWeek?.pct != null ? `${dezeWeek.pct}%` : "—"} sub={dezeWeek ? `${dezeWeek.totaal} antwoorden` : "nog geen antwoorden"} grijs={!dezeWeek || dezeWeek.teWeinig} />
            <Stat label="Zaalchecks (8 weken)" value={w8.length} sub={`${respons}% van ${sessies8w || 0} sessies`} grijs={respons < 20} />
            <Stat label="Niet netjes (8 weken)" value={w8.filter((c) => c.state === "rommel").length} />
            <Stat label="Iets stuk (8 weken)" value={w8.filter((c) => c.state === "stuk").length} />
          </div>
          {respons < 20 && (
            <p className="mt-3 text-xs text-ink/50">Minder dan 20 % van de sessies gaf een antwoord — de percentages zijn dus nog een ruwe indruk.</p>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-borderc bg-surface p-6">
              <h2 className="font-black text-ink">% netjes per week</h2>
              {trend.length === 0 ? <p className="mt-3 text-sm text-ink/50">Nog geen zaalchecks.</p> : (
                <div className="mt-4 flex h-36 items-end gap-2">
                  {trend.map((t) => (
                    <div key={t.week} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-bold text-ink/60">{t.pct}%</span>
                      <div className={"w-full rounded-t-md " + (t.teWeinig ? "bg-lav/40" : t.pct >= 80 ? "bg-accent" : t.pct >= 60 ? "bg-amber-400" : "bg-red-400")} style={{ height: `${Math.max(6, t.pct)}%` }} title={`${t.netjes}/${t.totaal}`} />
                      <span className="text-[10px] text-ink/40">{t.week.slice(-3)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                {perBand.map((b) => (
                  <div key={b.b} className="rounded-lg bg-paper p-2">
                    <p className="font-bold capitalize text-ink">{b.b}</p>
                    <p className="text-ink/60">{b.pct == null ? "—" : `${b.pct}% netjes`} · {b.n}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-borderc bg-surface p-6">
              <h2 className="font-black text-ink">Wie laat de zaal hoe achter</h2>
              <p className="mt-1 text-xs text-ink/50">Enkel mensen met minstens 3 checks na hun sessie. Rood = 2 bevestigde meldingen in 30 dagen.</p>
              {scores.length === 0 ? <p className="mt-3 text-sm text-ink/50">Nog niemand met genoeg checks.</p> : (
                <div className="mt-3 divide-y divide-borderc">
                  {scores.slice(0, 20).map((p) => (
                    <Link key={p.id} href={`/beheer/leden/${p.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-paper">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + KLEUR[p.kleur].dot} />
                        {p.naam}{p.rol === "coach" && <span className="text-xs font-normal text-ink/45">(coach)</span>}
                      </span>
                      <span className="text-xs text-ink/50">{KLEUR[p.kleur].l} · {p.aantal} checks</span>
                    </Link>
                  ))}
                </div>
              )}
              {aandacht.length > 0 && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{aandacht.length} {aandacht.length === 1 ? "persoon vraagt" : "personen vragen"} aandacht.</p>}
            </section>
          </div>

          <section className="mt-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-lav">Meldingen · niet netjes en iets stuk</h2>
            {tijdlijn.length === 0 ? <p className="mt-3 rounded-2xl border border-borderc bg-surface p-6 text-sm text-ink/50">Nog geen enkele melding van rommel of iets stuk. 🎉</p> : (
              <div className="mt-3 space-y-3">
                {tijdlijn.map((c) => (
                  <div key={c.booking_id} className="rounded-2xl border border-borderc bg-surface p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black text-ink">{STAAT[c.state].e} {STAAT[c.state].l} <span className="font-normal text-ink/50">· {fmt(c.deze?.starts_at || c.created_at)} · gemeld door {c.member?.full_name || "een lid"}</span></p>
                        {c.tags?.length > 0 && <p className="mt-1 text-sm text-ink/70">{c.tags.map((t) => TAG_L.get(t) || t).join(" · ")}</p>}
                        <p className="mt-2 text-sm text-ink/70">
                          <span className="font-bold text-ink">Vóór deze sessie: </span>
                          {c.previous_kind === "eigen" ? "dezelfde persoon (meerdere uren na elkaar)"
                            : !c.previous_user ? "niemand in de 3 uur ervoor (eerste van de dag of een lange pauze)"
                            : <>
                                <Link href={`/beheer/leden/${c.previous_user}`} className="font-bold text-accentdark hover:underline">{c.prev?.full_name || "?"}</Link>
                                {c.previous_kind === "pt" && " (coach, met een klant)"}
                                {c.vorige && ` · ${uurFmt.format(new Date(c.vorige.starts_at))}–${uurFmt.format(new Date(c.vorige.ends_at))}`}
                                {c.vorige?.persons > 1 && ` · ${c.vorige.persons} personen`}
                              </>}
                        </p>
                      </div>
                      {fotoUrls[c.booking_id] && (
                        <a href={fotoUrls[c.booking_id]} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fotoUrls[c.booking_id]} alt="Foto van de melding" className="h-24 w-24 rounded-xl object-cover" />
                        </a>
                      )}
                    </div>
                    {c.state === "rommel" && c.previous_user && c.previous_kind !== "eigen" && (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <ActionForm action={oordeelZaalcheck}>
                          <input type="hidden" name="bookingId" value={c.booking_id} />
                          <input type="hidden" name="verdict" value={c.owner_verdict === "terecht" ? "" : "terecht"} />
                          <button className={"rounded-full px-3 py-1.5 text-xs font-bold " + (c.owner_verdict === "terecht" ? "bg-brand text-white" : "border border-borderc bg-paper text-ink/70")}>Terecht</button>
                        </ActionForm>
                        <ActionForm action={oordeelZaalcheck}>
                          <input type="hidden" name="bookingId" value={c.booking_id} />
                          <input type="hidden" name="verdict" value={c.owner_verdict === "onterecht" ? "" : "onterecht"} />
                          <button className={"rounded-full px-3 py-1.5 text-xs font-bold " + (c.owner_verdict === "onterecht" ? "bg-brand text-white" : "border border-borderc bg-paper text-ink/70")}>Onterecht</button>
                        </ActionForm>
                        {c.herinnerd_at ? (
                          <span className="text-xs text-ink/50">Herinnering verstuurd op {fmt(c.herinnerd_at)}</span>
                        ) : (
                          <ActionForm action={stuurNetheidHerinnering}>
                            <input type="hidden" name="bookingId" value={c.booking_id} />
                            <button className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-brand">Stuur vriendelijke herinnering</button>
                          </ActionForm>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Stat label="Gemiddeld (8 weken)" value={`${gem} ★`} sub={`${r8.length} beoordelingen`} />
            <Stat label="Met opmerking" value={r8.filter((r) => r.comment).length} />
            <Stat label="Voelde zich sterk 💪" value={r8.filter((r) => r.energie === 4).length} />
          </div>
          <section className="mt-6 rounded-2xl border border-borderc bg-surface p-6">
            <h2 className="font-black text-ink">Opmerkingen</h2>
            <div className="mt-3 divide-y divide-borderc">
              {(ratings || []).filter((r) => r.comment).slice(0, 50).map((r, i) => (
                <div key={i} className="py-3 text-sm">
                  <p className="font-bold text-ink">{"★".repeat(r.rating)}<span className="text-ink/20">{"★".repeat(5 - r.rating)}</span> <span className="font-normal text-ink/50">· {r.member?.full_name || "lid"} · {fmt(r.created_at)}</span></p>
                  <p className="mt-1 text-ink/75">{r.comment}</p>
                </div>
              ))}
              {!(ratings || []).some((r) => r.comment) && <p className="py-3 text-sm text-ink/50">Nog geen opmerkingen.</p>}
            </div>
            <p className="mt-4 text-xs text-ink/50">De vraag voor een Google-review staat na élke score op de bedankpagina, ook na 1 ster — Google verbiedt enkel tevreden klanten te vragen.</p>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, grijs }) {
  return (
    <div className="rounded-2xl border border-borderc bg-surface p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className={"mt-2 text-2xl font-black " + (grijs ? "text-ink/35" : "text-ink")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/50">{sub}</p>}
    </div>
  );
}
