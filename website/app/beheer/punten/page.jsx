import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import ActionForm from "@/components/ui/ActionForm";
import { bewaarPuntenInstellingen, puntenCorrectie, pinUur, puntenNuBijwerken } from "../punten-actions";
import { WAARDEN, SOORT, soortLabel, tellers, niveauVan, NIVEAUS, isoWeek } from "@/lib/punten";
import { laadInstellingen, alles, beginMaand, huidigeReeks } from "@/lib/punten-db";
import { netheidsScore, KLEUR } from "@/lib/netheid";
import { isSettled } from "@/lib/booking-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Punten | Beheer" };

const euro = (c) => `€ ${(c / 100).toFixed(0)}`;
const datum = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short" });
const maandNaam = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", month: "short", year: "2-digit" });
const DAGEN = ["", "ma", "di", "wo", "do", "vr", "za", "zo"];
const SESSIEPRIJS = 1500; // wat een gratis sessie de gym kost aan gemiste omzet (losse prijs)

// Fittin' Punten — het dashboard van de uitbater. Bovenaan: kost het wat, en werkt het? Daaronder: wie, waarom, en
// de knoppen om het bij te sturen. Plan: docs/plans/2026-09-18-gamification-community.md §8.
export default async function Punten({ searchParams }) {
  const sp = (await searchParams) || {};
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { gym } = ctx;
  const admin = createAdminClient();
  const s = await laadInstellingen(admin, gym.id);
  if (!s) return <div className="p-8">Geen puntinstellingen voor deze gym (migratie 0165).</div>;

  const nu = Date.now();
  const maand = beginMaand();
  const d56 = new Date(nu - 56 * 86400000).toISOString();
  const [ledger, profielen, boekingen, credits, demand, logs, checks, invites, deelnemers, referrals, memberships, metingen] = await Promise.all([
    alles(() => admin.from("member_points").select("user_id, kind, points, source_key, meta, created_at").eq("gym_id", gym.id)),
    alles(() => admin.from("profiles").select("id, full_name, role, created_at, is_test").eq("gym_id", gym.id).eq("role", "lid")),
    alles(() => admin.from("bookings").select("id, user_id, starts_at, ends_at, status, paid, price_cents, payment_source, promo, persons").eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", new Date(nu - 400 * 86400000).toISOString())),
    alles(() => admin.from("credits_ledger").select("user_id, delta, reason, created_at").eq("gym_id", gym.id).in("reason", ["punten", "ambassadeur"])),
    admin.from("slot_demand").select("dow, hour, klasse, pin, weeks_booked, computed_at").eq("gym_id", gym.id).then((r) => r.data || []),
    admin.from("gamification_log").select("wat, details, created_at, door:profiles!gamification_log_door_fkey(full_name)").eq("gym_id", gym.id).order("created_at", { ascending: false }).limit(8).then((r) => r.data || []),
    alles(() => admin.from("zaal_checks").select("previous_user, state, photo_path, owner_verdict, created_at").eq("gym_id", gym.id).gte("created_at", new Date(nu - 90 * 86400000).toISOString())),
    alles(() => admin.from("email_invites").select("id, inviter_id, confirmed_at, created_at").eq("gym_id", gym.id)),
    alles(() => admin.from("booking_participants").select("id, booking_id, user_id, confirmed_at, created_at").eq("gym_id", gym.id)),
    alles(() => admin.from("referrals").select("id, referrer_id, referred_id, created_at").eq("gym_id", gym.id)),
    alles(() => admin.from("memberships").select("user_id, started_at").eq("gym_id", gym.id)),
    alles(() => admin.from("body_metrics").select("user_id, weight_kg, created_at").eq("gym_id", gym.id).gte("created_at", d56)),
  ]);

  const leden = new Map(profielen.map((p) => [p.id, p]));
  const start = new Date(s.gestart_op).getTime();
  const tMaand = new Date(maand).getTime();
  const dezeMaand = ledger.filter((r) => new Date(r.created_at).getTime() >= tMaand);
  const verdiend = dezeMaand.filter((r) => r.points > 0 && !["handmatig"].includes(r.kind)).reduce((a, r) => a + r.points, 0);
  const verdieners = new Set(dezeMaand.filter((r) => r.points > 0).map((r) => r.user_id));
  const actieveLeden = new Set(boekingen.filter((b) => new Date(b.starts_at).getTime() >= nu - 30 * 86400000 && new Date(b.starts_at).getTime() <= nu && leden.has(b.user_id)).map((b) => b.user_id));
  const inwisselMaand = credits.filter((c) => c.reason === "punten" && new Date(c.created_at).getTime() >= tMaand).length;
  const ambMaand = credits.filter((c) => c.reason === "ambassadeur" && new Date(c.created_at).getTime() >= tMaand).length;

  // Per lid: tellers en reeks.
  const perLid = new Map();
  for (const r of ledger) { if (!perLid.has(r.user_id)) perLid.set(r.user_id, []); perLid.get(r.user_id).push(r); }
  const rijen = [...leden.values()].map((p) => {
    const l = perLid.get(p.id) || [];
    const t = tellers(l, { sinds: maand });
    const laatste = boekingen.filter((b) => b.user_id === p.id && isSettled(b) && new Date(b.ends_at).getTime() <= nu).map((b) => b.starts_at).sort().pop() || null;
    const mijnChecks = checks.filter((c) => c.previous_user === p.id);
    return {
      id: p.id, naam: p.full_name || "Lid", ...t, niveau: niveauVan(t.lifetime), reeks: huidigeReeks(l), laatste,
      ingewisseld: credits.filter((c) => c.user_id === p.id && c.reason === "punten").length,
      gebracht: l.filter((r) => r.kind === "vriend_eerste").length,
      netheid: netheidsScore(mijnChecks).kleur,
    };
  });
  const sort = sp.sort || "maand";
  rijen.sort((a, b) => (sort === "saldo" ? b.saldo - a.saldo : sort === "lifetime" ? b.lifetime - a.lifetime : sort === "naam" ? a.naam.localeCompare(b.naam) : b.klassement - a.klassement || b.lifetime - a.lifetime));
  const openSaldo = rijen.reduce((a, r) => a + Math.max(0, r.saldo), 0);

  // Waar komen de punten vandaan (deze maand, per soort)?
  const perSoort = new Map();
  for (const r of dezeMaand) { if (r.points <= 0) continue; perSoort.set(r.kind, (perSoort.get(r.kind) || 0) + r.points); }
  const soorten = [...perSoort.entries()].sort((a, b) => b[1] - a[1]);
  const maxSoort = Math.max(1, ...soorten.map(([, v]) => v));
  const nooit = Object.keys(SOORT).filter((k) => !["inwissel", "verval", "correctie", "handmatig", "scorebord", "badge", "quest", "coach", "event", "gymdoel"].includes(k) && !perSoort.has(k));

  // Werkt het? Vóór de lancering (8 weken) tegenover de laatste 8 weken.
  const venster = (van, tot) => {
    const bs = boekingen.filter((b) => isSettled(b) && leden.has(b.user_id) && new Date(b.starts_at).getTime() >= van && new Date(b.starts_at).getTime() < tot);
    const per = new Map(); for (const b of bs) per.set(b.user_id, (per.get(b.user_id) || 0) + 1);
    const actief = per.size, sessies = bs.length;
    return { sessies, actief, perLid: actief ? (sessies / actief).toFixed(1).replace(".", ",") : "—", vaak: [...per.values()].filter((n) => n >= 8).length, rustig: bs.filter((b) => b.promo === "rustig").length };
  };
  const voor = venster(start - 56 * 86400000, start);
  const na = venster(Math.max(start, nu - 56 * 86400000), nu);
  const tweedeBinnen14 = (van, tot) => {
    const nieuw = profielen.filter((p) => new Date(p.created_at).getTime() >= van && new Date(p.created_at).getTime() < tot);
    let ok = 0;
    for (const p of nieuw) {
      const bs = boekingen.filter((b) => b.user_id === p.id && isSettled(b)).map((b) => new Date(b.starts_at).getTime()).sort((a, b) => a - b);
      if (bs.length >= 2 && bs[1] - bs[0] <= 14 * 86400000) ok++;
    }
    return { nieuw: nieuw.length, pct: nieuw.length ? Math.round((ok / nieuw.length) * 100) : null };
  };
  const actVoor = tweedeBinnen14(start - 90 * 86400000, start);
  const actNa = tweedeBinnen14(start, nu - 14 * 86400000);
  const abosNa = memberships.filter((m) => m.started_at && new Date(m.started_at).getTime() >= start).length;

  // Groei via leden.
  const gastenGenoemd = invites.length + deelnemers.length;
  const bevestigd = invites.filter((i) => i.confirmed_at).length + deelnemers.filter((d) => d.confirmed_at).length;
  const accounts = referrals.filter((r) => new Date(r.created_at).getTime() >= start).length;
  const eersteBetaald = ledger.filter((r) => r.kind === "vriend_eerste").length;
  const klant = ledger.filter((r) => r.kind === "vriend_abo").length;
  const meerPersonen = boekingen.filter((b) => (b.persons || 1) > 1 && new Date(b.starts_at).getTime() >= nu - 56 * 86400000 && new Date(b.starts_at).getTime() <= nu).length;
  const bringers = rijen.filter((r) => r.gebracht > 0).sort((a, b) => b.gebracht - a.gebracht).slice(0, 5);
  const groeiPunten = ledger.filter((r) => ["gast_bevestigd", "gast_account", "vriend_eerste", "vriend_eerste_zelf", "vriend_abo"].includes(r.kind)).reduce((a, r) => a + r.points, 0);

  // Cohorten: per aanmeldmaand, % dat nog traint na 1/2/3 maanden.
  const cohorten = [];
  for (let m = 6; m >= 1; m--) {
    const van = new Date(beginMaand(new Date(), m)).getTime(), tot = new Date(beginMaand(new Date(), m - 1)).getTime();
    const nieuw = profielen.filter((p) => new Date(p.created_at).getTime() >= van && new Date(p.created_at).getTime() < tot);
    const maandVan = (k) => [new Date(beginMaand(new Date(), m - k)).getTime(), new Date(beginMaand(new Date(), m - k - 1)).getTime()];
    const pct = (k) => {
      if (m - k - 1 < -1 || k > m - 1) return null;
      const [a, b] = maandVan(k);
      if (a > nu) return null;
      const n = nieuw.filter((p) => boekingen.some((x) => x.user_id === p.id && isSettled(x) && new Date(x.starts_at).getTime() >= a && new Date(x.starts_at).getTime() < b)).length;
      return nieuw.length ? Math.round((n / nieuw.length) * 100) : null;
    };
    cohorten.push({ label: maandNaam.format(new Date(van)), n: nieuw.length, m1: pct(1), m2: pct(2), m3: pct(3) });
  }

  // Waakzaamheid.
  const gewichtSprong = [];
  const perGewicht = new Map();
  for (const m of metingen) { if (!perGewicht.has(m.user_id)) perGewicht.set(m.user_id, []); perGewicht.get(m.user_id).push(m); }
  for (const [uid, l] of perGewicht) {
    l.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < l.length; i++) if (Math.abs(Number(l[i].weight_kg) - Number(l[i - 1].weight_kg)) > 5) { gewichtSprong.push(uid); break; }
  }
  const nietBevestigd = new Map();
  for (const i of invites) if (!i.confirmed_at && new Date(i.created_at).getTime() < nu - 86400000) nietBevestigd.set(i.inviter_id, (nietBevestigd.get(i.inviter_id) || 0) + 1);
  const waak = [
    ...gewichtSprong.map((id) => ({ id, wat: "Gewicht sprong > 5 kg tussen twee metingen" })),
    ...[...nietBevestigd.entries()].filter(([, n]) => n >= 5).map(([id, n]) => ({ id, wat: `${n} gasten uitgenodigd die nooit bevestigden` })),
    ...rijen.filter((r) => (perLid.get(r.id) || []).filter((x) => x.kind === "zaalcheck" && new Date(x.created_at).getTime() >= nu - 30 * 86400000).length >= 12).map((r) => ({ id: r.id, wat: "12+ zaalchecks in 30 dagen" })),
  ].filter((w) => leden.has(w.id));

  // Rustige uren: raster.
  const rooster = new Map(demand.map((d) => [`${d.dow}:${d.hour}`, d]));
  const uren = [...new Set(demand.map((d) => d.hour))].sort((a, b) => a - b);
  const berekend = demand[0]?.computed_at;

  const niveauTelling = NIVEAUS.map((n) => ({ ...n, n: rijen.filter((r) => r.niveau.id === n.id).length }));

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-ink">Fittin&rsquo; punten</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink/60">
            Gestart op {datum.format(new Date(s.gestart_op))} · {s.aan ? "staat aan" : "staat UIT"} · {s.prijs_sessie} punten = 1 gratis sessie · max {s.max_gym_maand} gratis sessies per maand voor de hele gym.
          </p>
        </div>
        <ActionForm action={puntenNuBijwerken}>
          <button className="rounded-full border border-borderc bg-surface px-4 py-2 text-sm font-bold text-ink hover:border-lav">↻ Nu bijwerken</button>
        </ActionForm>
      </div>

      {/* 1. Deze maand */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Punten verdiend (maand)" value={verdiend.toLocaleString("nl-BE")} sub={`${verdieners.size} leden · ${actieveLeden.size ? Math.round((verdieners.size / actieveLeden.size) * 100) : 0}% van de actieven`} />
        <Stat label="Gratis sessies (maand)" value={`${inwisselMaand} / ${s.max_gym_maand}`} sub={`+ ${ambMaand} / ${s.max_aanbreng_maand} via ambassadeurs`} />
        <Stat label="Kost deze maand" value={euro((inwisselMaand + ambMaand) * SESSIEPRIJS)} sub="aan gemiste omzet (losse prijs)" />
        <Stat label="Open saldo" value={`${openSaldo.toLocaleString("nl-BE")} pt`} sub={`≈ ${Math.floor(openSaldo / s.prijs_sessie)} gratis sessies · ${euro(Math.floor(openSaldo / s.prijs_sessie) * SESSIEPRIJS)}`} />
      </div>

      {/* 2. Werkt het? */}
      <section className="mt-6 rounded-2xl border border-borderc bg-surface p-6">
        <h2 className="font-black text-ink">Werkt het?</h2>
        <p className="mt-1 text-xs text-ink/50">De 8 weken vóór de lancering tegenover de laatste 8 weken (of sinds de lancering, als dat korter is).</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs text-ink/50"><th className="py-1 font-bold">Wat</th><th className="font-bold">Vóór</th><th className="font-bold">Nu</th></tr></thead>
            <tbody className="divide-y divide-borderc">
              <Rij l="Sessies" a={voor.sessies} b={na.sessies} />
              <Rij l="Actieve leden" a={voor.actief} b={na.actief} />
              <Rij l="Sessies per actief lid" a={voor.perLid} b={na.perLid} />
              <Rij l="Leden met ≥ 8 sessies (± 1×/week)" a={voor.vaak} b={na.vaak} />
              <Rij l="Nieuwe leden met 2e sessie binnen 14 dagen" a={actVoor.pct == null ? "—" : `${actVoor.pct}% (${actVoor.nieuw})`} b={actNa.pct == null ? "nog te vroeg" : `${actNa.pct}% (${actNa.nieuw})`} />
              <Rij l="Sessies op een rustig uur ⚡" a={voor.rustig} b={na.rustig} />
              <Rij l="Nieuwe abonnementen" a="—" b={abosNa} />
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* 3. Waar komen de punten vandaan */}
        <section className="rounded-2xl border border-borderc bg-surface p-6">
          <h2 className="font-black text-ink">Waar komen de punten vandaan? <span className="text-xs font-bold text-ink/40">· deze maand</span></h2>
          {soorten.length === 0 ? <p className="mt-3 text-sm text-ink/50">Nog niets verdiend deze maand.</p> : (
            <div className="mt-4 space-y-2">
              {soorten.map(([k, v]) => (
                <div key={k} className="text-sm">
                  <div className="flex justify-between"><span className="text-ink">{soortLabel(k).e} {soortLabel(k).l}</span><span className="font-bold text-ink">{v}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((v / maxSoort) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
          {nooit.length > 0 && <p className="mt-4 text-xs text-ink/50">Nog door niemand gedaan deze maand: {nooit.map((k) => soortLabel(k).l.toLowerCase()).join(", ")}.</p>}
        </section>

        {/* 5. Groei via leden */}
        <section className="rounded-2xl border border-borderc bg-surface p-6">
          <h2 className="font-black text-ink">Groei via leden</h2>
          <p className="mt-1 text-xs text-ink/50">Van gast tot klant, sinds de lancering. Ter vergelijking: {meerPersonen} sessies met 2+ personen in de laatste 8 weken — zoveel gasten kwamen er al mee.</p>
          <div className="mt-4 space-y-1.5 text-sm">
            <Trechter l="Gasten bij een boeking gezet" n={gastenGenoemd} max={gastenGenoemd} />
            <Trechter l="…die bevestigden (“Ik kom”)" n={bevestigd} max={gastenGenoemd} />
            <Trechter l="Accounts via een lid" n={accounts} max={gastenGenoemd} />
            <Trechter l="Eerste betaalde sessie" n={eersteBetaald} max={gastenGenoemd} />
            <Trechter l="Abonnement of kaart" n={klant} max={gastenGenoemd} />
          </div>
          <p className="mt-3 text-xs text-ink/55">Uitgegeven aan groei: {groeiPunten.toLocaleString("nl-BE")} punten (≈ {euro(Math.round((groeiPunten / s.prijs_sessie) * SESSIEPRIJS))}) + {credits.filter((c) => c.reason === "ambassadeur").length} ambassadeurssessies.</p>
          {bringers.length > 0 && (
            <div className="mt-4 border-t border-borderc pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-lav">Brengen mensen binnen</p>
              {bringers.map((b) => <p key={b.id} className="mt-1 text-sm text-ink"><Link href={`/beheer/leden/${b.id}`} className="font-bold hover:underline">{b.naam}</Link> · {b.gebracht} vriend{b.gebracht === 1 ? "" : "en"}</p>)}
            </div>
          )}
        </section>

        {/* Cohorten */}
        <section className="rounded-2xl border border-borderc bg-surface p-6">
          <h2 className="font-black text-ink">Blijven ze komen?</h2>
          <p className="mt-1 text-xs text-ink/50">Per aanmeldmaand: welk deel trainde nog 1, 2 en 3 maanden later. Het getal dat zegt of alles hierboven werkt.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead><tr className="text-left text-xs text-ink/50"><th className="py-1 font-bold">Maand</th><th className="font-bold">Nieuw</th><th className="font-bold">+1 m</th><th className="font-bold">+2 m</th><th className="font-bold">+3 m</th></tr></thead>
              <tbody className="divide-y divide-borderc">
                {cohorten.map((c) => (
                  <tr key={c.label}><td className="py-1.5 font-bold text-ink">{c.label}</td><td className="text-ink">{c.n}</td>{[c.m1, c.m2, c.m3].map((p, i) => <td key={i} className={p == null ? "text-ink/30" : p >= 40 ? "font-bold text-accentdark" : "text-ink"}>{p == null ? "—" : `${p}%`}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 6. Niveaus + log */}
        <section className="rounded-2xl border border-borderc bg-surface p-6">
          <h2 className="font-black text-ink">Niveaus</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {niveauTelling.map((n) => <span key={n.id} className="rounded-full bg-paper px-3 py-1.5 text-sm text-ink"><b>{n.n}</b> {n.naam}</span>)}
          </div>
          {waak.length > 0 && (
            <div className="mt-5 border-t border-borderc pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-lav">Om in het oog te houden</p>
              {waak.map((w, i) => <p key={i} className="mt-1 text-sm text-ink"><Link href={`/beheer/leden/${w.id}`} className="font-bold hover:underline">{leden.get(w.id)?.full_name || "Lid"}</Link> · {w.wat}</p>)}
              <p className="mt-2 text-xs text-ink/45">Enkel ter info — er gebeurt niets automatisch.</p>
            </div>
          )}
          {logs.length > 0 && (
            <div className="mt-5 border-t border-borderc pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-lav">Laatste aanpassingen</p>
              {logs.map((l, i) => <p key={i} className="mt-1 text-xs text-ink/60">{datum.format(new Date(l.created_at))} · {l.door?.full_name || "beheer"} · {l.wat === "correctie" ? `${l.details?.punten > 0 ? "+" : ""}${l.details?.punten} pt: ${l.details?.reden}` : `instellingen (${Object.keys(l.details || {}).join(", ")})`}</p>)}
            </div>
          )}
        </section>
      </div>

      {/* 7. Leden */}
      <section className="mt-6 rounded-2xl border border-borderc bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-black text-ink">Leden</h2>
          <div className="flex gap-1 text-xs font-bold">
            {[["maand", "Deze maand"], ["saldo", "Saldo"], ["lifetime", "Totaal"], ["naam", "Naam"]].map(([k, l]) => (
              <Link key={k} href={`/beheer/punten?sort=${k}`} className={"rounded-full px-3 py-1 " + (sort === k ? "bg-brand text-white" : "bg-paper text-ink/60")}>{l}</Link>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs text-ink/50"><th className="py-1 font-bold">Lid</th><th className="font-bold">Niveau</th><th className="font-bold">Deze maand</th><th className="font-bold">Saldo</th><th className="font-bold">Totaal</th><th className="font-bold">Reeks</th><th className="font-bold">Laatste sessie</th><th className="font-bold">Netheid</th><th className="font-bold">🎁</th><th className="font-bold">Bracht</th></tr></thead>
            <tbody className="divide-y divide-borderc">
              {rijen.filter((r) => r.lifetime > 0 || r.laatste).slice(0, 150).map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5"><Link href={`/beheer/leden/${r.id}#punten`} className="font-bold text-ink hover:underline">{r.naam}</Link></td>
                  <td className="text-ink/70">{r.niveau.naam}</td>
                  <td className="font-bold text-ink">{r.klassement}</td>
                  <td className="text-ink">{r.saldo}</td>
                  <td className="text-ink/70">{r.lifetime}</td>
                  <td className="text-ink/70">{r.reeks >= 2 ? `🔥 ${r.reeks}` : "—"}</td>
                  <td className="text-ink/60">{r.laatste ? datum.format(new Date(r.laatste)) : "—"}</td>
                  <td>{r.netheid ? <span className="inline-flex items-center gap-1 text-xs text-ink/70"><span className={"h-2 w-2 rounded-full " + KLEUR[r.netheid].dot} />{KLEUR[r.netheid].l}</span> : <span className="text-ink/30">—</span>}</td>
                  <td className="text-ink/70">{r.ingewisseld || ""}</td>
                  <td className="text-ink/70">{r.gebracht || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ActionForm action={puntenCorrectie} className="mt-5 grid gap-2 border-t border-borderc pt-4 sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,2fr)_auto] sm:items-end">
          <label className="block"><span className="mb-1 block text-xs font-bold text-ink">Lid</span>
            <select name="userId" className="w-full rounded-xl border-2 border-borderc bg-surface px-3 py-2 text-sm text-ink" defaultValue="">
              <option value="" disabled>Kies…</option>
              {[...rijen].sort((a, b) => a.naam.localeCompare(b.naam)).map((r) => <option key={r.id} value={r.id}>{r.naam}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-ink">Punten (±)</span><input name="punten" type="number" placeholder="20 of -20" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></label>
          <label className="block"><span className="mb-1 block text-xs font-bold text-ink">Reden (het lid ziet dit)</span><input name="reden" placeholder="bv. Hielp de zaal opruimen na het event" className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" /></label>
          <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">Punten aanpassen</button>
        </ActionForm>
      </section>

      {/* Rustige uren */}
      <section className="mt-6 rounded-2xl border border-borderc bg-surface p-6">
        <h2 className="font-black text-ink">Rustige uren ⚡</h2>
        <p className="mt-1 text-xs text-ink/50">
          Elke nacht herberekend op de laatste 8 weken{berekend ? ` (laatst ${datum.format(new Date(berekend))})` : ""}: in hoeveel weken was dit uur geboekt. ≤ {s.rustig_max_weken} = rustig (dubbele punten, 2 uur voor 1) · ≥ {s.druk_min_weken} = druk (nooit promotie). Plus: elk vrij uur binnen 24 uur dat niet druk is.
          Tik een vakje om het vast te pinnen: automatisch → altijd rustig → nooit → automatisch.
        </p>
        {uren.length === 0 ? <p className="mt-3 text-sm text-ink/50">Nog niet berekend — tik op “Nu bijwerken”.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[560px] border-separate border-spacing-0.5 text-center text-[11px]">
              <thead><tr><th />{[1, 2, 3, 4, 5, 6, 7].map((d) => <th key={d} className="px-1 font-bold text-ink/50">{DAGEN[d]}</th>)}</tr></thead>
              <tbody>
                {uren.map((h) => (
                  <tr key={h}>
                    <td className="pr-1 text-right font-bold text-ink/40">{h}:00</td>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                      const c = rooster.get(`${d}:${h}`);
                      const volgende = !c?.pin ? "altijd" : c.pin === "altijd" ? "nooit" : "";
                      const kleur = c?.pin === "altijd" ? "bg-amber-100 text-ink ring-2 ring-amber-400" : c?.pin === "nooit" ? "bg-ink/10 text-ink/40 line-through" : c?.klasse === "rustig" ? "bg-amber-100 text-ink" : c?.klasse === "druk" ? "bg-brand text-white" : "bg-paper text-ink/60";
                      return (
                        <td key={d} className="p-0">
                          <ActionForm action={pinUur}>
                            <input type="hidden" name="dow" value={d} /><input type="hidden" name="hour" value={h} /><input type="hidden" name="pin" value={volgende} />
                            <button className={"h-7 w-12 rounded " + kleur} title={`${DAGEN[d]} ${h}:00 · ${c?.weeks_booked ?? 0}/8 weken geboekt${c?.pin ? ` · vastgepind: ${c.pin}` : ""}`}>
                              {c?.pin ? "📌" : ""}{c?.weeks_booked ?? 0}
                            </button>
                          </ActionForm>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink/50"><span className="rounded bg-amber-100 px-1.5">rustig</span> <span className="rounded bg-paper px-1.5">normaal</span> <span className="rounded bg-brand px-1.5 text-white">druk</span> · het getal = in hoeveel van de 8 weken geboekt · 📌 = vastgepind</p>
          </div>
        )}
      </section>

      {/* 9. Instellingen */}
      <ActionForm action={bewaarPuntenInstellingen} success="Opgeslagen ✓" className="mt-6 rounded-2xl border border-borderc bg-surface p-6">
        <h2 className="font-black text-ink">Instellingen</h2>
        <p className="mt-1 text-xs text-ink/50">Een nieuwe waarde geldt vanaf nu — punten die al verdiend zijn, veranderen niet. Zet een waarde op 0 om die actie uit te zetten. Elke wijziging wordt gelogd.</p>
        <div className="mt-4 flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2 font-bold text-ink"><input type="checkbox" name="aan" defaultChecked={s.aan} className="h-4 w-4" /> Punten aan</label>
          <label className="flex items-center gap-2 font-bold text-ink"><input type="checkbox" name="rustig_aan" defaultChecked={s.rustig_aan} className="h-4 w-4" /> Rustige uren aan</label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Veld n="prijs_sessie" l="Punten per gratis sessie" v={s.prijs_sessie} />
          <Veld n="max_gym_maand" l="Max gratis sessies/maand (gym)" v={s.max_gym_maand} />
          <Veld n="max_aanbreng_maand" l="Max ambassadeurssessies/maand" v={s.max_aanbreng_maand} />
          <Veld n="max_per_lid_maand" l="Max inwisselen per lid/maand" v={s.max_per_lid_maand} />
          <Veld n="verval_maanden" l="Punten vervallen na (maanden zonder sessie)" v={s.verval_maanden} />
          <Veld n="rustig_max_weken" l="Rustig: geboekt in ≤ … van 8 weken" v={s.rustig_max_weken} />
          <Veld n="druk_min_weken" l="Druk: geboekt in ≥ … van 8 weken" v={s.druk_min_weken} />
        </div>
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-bold text-ink">Punten per actie</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.keys(WAARDEN).map((k) => <Veld key={k} n={`w_${k}`} l={k.replace(/_/g, " ")} v={s.waarden?.[k] ?? WAARDEN[k]} />)}
          </div>
        </details>
        <button className="mt-5 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">Opslaan</button>
      </ActionForm>
      <p className="mt-3 text-xs text-ink/40">Weeknummer nu: {isoWeek(new Date().toISOString())}. De puntenmotor draait elk uur; badges en weekpunten verschijnen dus met wat vertraging.</p>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-borderc bg-surface p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className="mt-2 text-2xl font-black text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/50">{sub}</p>}
    </div>
  );
}
function Rij({ l, a, b }) {
  return <tr><td className="py-1.5 text-ink">{l}</td><td className="text-ink/60">{a}</td><td className="font-bold text-ink">{b}</td></tr>;
}
function Trechter({ l, n, max }) {
  return (
    <div>
      <div className="flex justify-between"><span className="text-ink">{l}</span><span className="font-bold text-ink">{n}</span></div>
      <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-brand" style={{ width: `${max ? Math.max(2, Math.round((n / max) * 100)) : 0}%` }} /></div>
    </div>
  );
}
function Veld({ n, l, v }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold capitalize text-ink">{l}</span>
      <input name={n} type="number" defaultValue={v} className="w-full rounded-xl border-2 border-borderc px-3 py-2 text-sm" />
    </label>
  );
}
