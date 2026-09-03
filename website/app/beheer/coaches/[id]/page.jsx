import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { addCoachAvailability, deleteCoachAvailability } from "../../coaching-actions";
import {
  setCoachBilling, grantCoachCredits, assignCoachClient, unassignCoachClient,
  setCoachPublic, adminSaveCoachProfile, adminUploadCoachPhoto, startViewAsCoach,
} from "../../actions";
import SearchSelect from "@/components/admin/SearchSelect";
import ActionForm from "@/components/ui/ActionForm";
import { coachDebts, debtOf, debtReasons } from "@/lib/coach-debt";
import { COACH_SESSIE_KOLOMMEN, coachStats, statsVan, isCoachSessie } from "@/lib/coach-stats";
import { fmtHour } from "@/lib/time";
import SpecialtyPicker from "@/components/coach/SpecialtyPicker";

// Alles wat vroeger per coach uitgeklapt op de lijstpagina stond. Een gewone subroute in plaats van
// een lade: deelbaar, bookmarkbaar, en de blokken konden grotendeels ongewijzigd verhuizen.

export const dynamic = "force-dynamic";
const WD_FULL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const getal = (n) => String(n ?? 0).replace(".", ",");
const fmt = (iso) =>
  new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function CoachDetail({ params }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;
  const nu = new Date();

  const { data: c } = await supabase.from("profiles").select("*").eq("id", id).eq("gym_id", gym.id).maybeSingle();
  if (!c || !["coach", "beheerder"].includes(c.role)) notFound();

  const [
    { data: people }, { data: sessies }, { count: sessiesOoit }, { data: pay },
    { data: ledger }, { data: avail }, { data: links }, { data: activity }, schuld,
  ] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, is_test").eq("gym_id", gym.id).order("full_name"),
    supabase.from("bookings").select(COACH_SESSIE_KOLOMMEN).eq("gym_id", gym.id).eq("coach_id", id).order("starts_at", { ascending: false }).limit(60),
    // Aparte count: "sessies ooit" hoort niet af te hangen van hoeveel rijen we toevallig ophaalden.
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("coach_id", id).eq("status", "bevestigd"),
    supabase.from("payments").select("amount_cents, status, description, created_at").eq("gym_id", gym.id).eq("user_id", id).eq("kind", "coach_credits").order("created_at", { ascending: false }),
    supabase.from("coach_ledger").select("delta, reason, created_at").eq("gym_id", gym.id).eq("coach_id", id).order("created_at", { ascending: false }).limit(40),
    supabase.from("coach_availability").select("*").eq("gym_id", gym.id).eq("coach_id", id).order("weekday"),
    supabase.from("coach_clients").select("id, client_id").eq("gym_id", gym.id).eq("coach_id", id).eq("status", "accepted"),
    // Per coach i.p.v. gym-breed met limit 200 — één drukke coach at vroeger het hele venster op.
    supabase.from("coach_activity").select("summary, created_at").eq("gym_id", gym.id).eq("coach_id", id).order("created_at", { ascending: false }).limit(50),
    coachDebts(supabase, gym.id),
  ]);

  const all = people || [];
  const naamVan = (uid) => all.find((p) => p.id === uid)?.full_name || all.find((p) => p.id === uid)?.email || "—";
  const stats = statsVan(coachStats(sessies || [], nu), id);
  const d = debtOf(schuld, id);
  const betaaldCents = (pay || []).filter((p) => ["betaald", "paid"].includes(p.status)).reduce((a, p) => a + (p.amount_cents || 0), 0);
  const cls = links || [];
  const assignedIds = new Set(cls.map((l) => l.client_id));
  // Toewijsbaar: alleen leden. Vroeger stond hier `role !== 'beheerder'`, waardoor je een coach als
  // client van een andere coach kon hangen.
  const toewijsbaar = all.filter((m) => m.role === "lid" && m.id !== id && !assignedIds.has(m.id) && !m.is_test);
  const uren = [];
  for (let h = gym.open_hour; h <= gym.close_hour; h += 0.5) uren.push(h);

  // Is de inline tegoedknop zinvol? Alleen als het openstaande bedrag PUUR een negatief saldo is.
  // Bij een open post of niet-gefactureerde sessies lost tegoed bijschrijven niets op: je boekt dan
  // een tweede bedrag als omzet, de coach blijft geblokkeerd, en je denkt dat het geregeld is.
  const enkelNegatief = d.negatiefCents > 0 && d.openPostCents === 0 && d.factuurCents === 0;
  const nodig = enkelNegatief ? Math.abs(d.saldo) : 0;

  const clientLabel = (s) => {
    if (s.user_id && s.user_id !== id) return naamVan(s.user_id);
    if (s.notes) return `${String(s.notes).slice(0, 40)} · extern`;
    // De coach boekte de zaal op eigen naam — bij 31 van de 41 coach-boekingen van de laatste
    // 60 dagen is dat zo. We wéten dan niet wie hij trainde, en dat zeggen we ook zo.
    return "zaal geboekt";
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link href="/beheer/coaches" className="text-sm font-semibold text-ink-soft hover:text-brand">← Coaches</Link>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        {c.coach_photo_url
          ? <Image src={c.coach_photo_url} alt="" width={72} height={72} sizes="72px" className="h-18 w-18 rounded-2xl object-cover" style={{ height: 72, width: 72 }} />
          : <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-borderc text-2xl font-black text-brand/40">{(c.full_name || "?").slice(0, 1)}</div>}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-brand md:text-3xl">{c.full_name || c.email}</h1>
          <p className="text-sm text-ink-soft">{c.email}{c.role === "beheerder" && " · beheerder"}{c.is_test && " · 🧪 testaccount"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Enige schrijver van coach_public. De checkbox in het profielformulier is weg: die
                schreef bij élke "Profiel opslaan" mee, waardoor een coach ongemerkt van de website
                verdween. */}
            <ActionForm action={setCoachPublic} success="Zichtbaarheid bijgewerkt ✓">
              <input type="hidden" name="coachId" value={c.id} />
              <input type="hidden" name="on" value={c.coach_public ? "0" : "1"} />
              <button className={"rounded-full px-4 py-2 text-sm font-bold transition " + (c.coach_public ? "bg-accent text-brand" : "bg-paper text-ink-soft hover:bg-brand/5")}>
                {c.coach_public ? "● Op de website" : "○ Niet op de website"}
              </button>
            </ActionForm>
            {/* Bewust een kale <form>: startViewAsCoach eindigt in redirect('/coach') en dat breekt
                binnen een ActionForm. */}
            <form action={startViewAsCoach}>
              <input type="hidden" name="coachId" value={c.id} />
              <button className="rounded-full border-2 border-brand px-4 py-2 text-sm font-bold text-brand transition hover:bg-brand hover:text-white">👁️ Bekijk als coach →</button>
            </form>
          </div>
        </div>
      </div>

      {/* Vier cijfers */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cijfer label="Betaald ooit" waarde={euro(betaaldCents)} sub="sessietegoed gekocht" />
        <Cijfer label="Sessies ooit" waarde={sessiesOoit ?? 0} sub={stats.dagenGeleden == null ? "nog geen" : `laatst ${stats.dagenGeleden} d geleden`} />
        <Cijfer label="Tegoed" waarde={`${getal(d.saldo)} beurten`} sub={d.saldo < 0 ? "staat in de min" : "nog te gebruiken"} rood={d.saldo < 0} />
        <Cijfer label="Gepland" waarde={stats.gepland} sub="komende sessies" />
      </div>

      {/* Openstaand */}
      {d.totaalCents > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-black text-amber-900">Openstaand: {euro(d.totaalCents)}</p>
          <p className="mt-1 text-sm text-amber-800">{debtReasons(d).join(" · ")}</p>
          {enkelNegatief ? (
            <ActionForm action={grantCoachCredits} success="Sessietegoed bijgeschreven ✓" className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="coachId" value={c.id} />
              <input type="hidden" name="betaling" value="betaald" />
              <Lbl t="Beurten à € 12">
                <input name="delta" type="number" step="0.5" defaultValue={nodig} className="w-24 rounded-lg border-2 border-borderc bg-white px-2 py-1.5 text-sm" />
              </Lbl>
              {/* Het bedrag staat in de KNOP: naast een euro-bedrag typt iedereen ooit 12 in plaats
                  van 1, en dat schrijft 12 beurten én € 144 echte omzet weg. */}
              <button className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">Boek {euro(Math.round(nodig * 1200))} als ontvangen</button>
            </ActionForm>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {d.openPostCents > 0 && <Link href="/beheer/betalingen" className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">Markeer de factuur als betaald →</Link>}
              {d.factuurCents > 0 && <Link href="/beheer/financien" className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">Factureer via Financiën →</Link>}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* Sessies */}
        <div className="rounded-2xl border border-borderc bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-lav">Sessies</p>
          <div className="mt-3 space-y-1">
            {(sessies || []).filter(isCoachSessie).slice(0, 12).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 border-b border-borderc py-2 text-sm last:border-b-0">
                <span className="min-w-0 truncate font-semibold text-brand">{clientLabel(s)}</span>
                <span className="shrink-0 text-xs text-ink-soft">{fmt(s.starts_at)}</span>
              </div>
            ))}
            {(sessies || []).filter(isCoachSessie).length === 0 && <p className="text-sm text-ink-soft">Nog geen sessies.</p>}
          </div>
        </div>

        {/* Clients */}
        <div className="rounded-2xl border border-borderc bg-white p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-lav">Toegewezen clients</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Dit is een koppeling in de app, geen maat voor hoeveel er getraind wordt — coaches brengen
            ook eigen clients mee die hier geen account hebben.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {cls.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">
                <Link href={`/beheer/leden/${l.client_id}`} className="hover:text-accentdark">{naamVan(l.client_id)}</Link>
                <ActionForm action={unassignCoachClient} success="Verwijderd ✓" className="inline">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="clientId" value={l.client_id} />
                  <button className="text-red-500 hover:underline" title="Verwijder">×</button>
                </ActionForm>
              </span>
            ))}
            {cls.length === 0 && <span className="text-xs text-ink-soft">Nog geen clients toegewezen.</span>}
          </div>
          <ActionForm action={assignCoachClient} success="Client toegewezen ✓" className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="coachId" value={c.id} />
            <SearchSelect name="clientId" required placeholder="Wijs een lid toe…" options={toewijsbaar.map((m) => ({ value: m.id, label: m.full_name || m.email }))} />
            <button className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-brand">+ Toewijzen</button>
          </ActionForm>
        </div>
      </div>

      {/* Profiel & foto — ALLE velden in ÉÉN form. adminSaveCoachProfile schrijft altijd alle
          velden met `formData.get(x) || null`; een veld dat buiten dit form valt wordt bij elke
          opslag stilzwijgend op NULL gezet (btw-nummer, facturatieadres). Niet opsplitsen. */}
      <details className="mt-5 rounded-2xl border border-borderc bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-brand">Profiel &amp; foto</summary>
        <div className="flex flex-wrap items-start gap-5 border-t border-borderc p-5">
          <div className="text-center">
            {c.coach_photo_url
              ? <Image src={c.coach_photo_url} alt="" width={96} height={96} sizes="96px" className="rounded-2xl object-cover" style={{ height: 96, width: 96 }} />
              : <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-borderc text-2xl font-black text-brand/40">{(c.full_name || "?").slice(0, 1)}</div>}
            <ActionForm action={adminUploadCoachPhoto} success="Foto geüpload ✓" className="mt-2">
              <input type="hidden" name="coachId" value={c.id} />
              <input type="file" name="photo" accept="image/*" className="block w-32 text-[10px]" />
              <button className="mt-1 rounded-full bg-brand px-3 py-1 text-[10px] font-bold text-white">Upload foto</button>
            </ActionForm>
          </div>
          <ActionForm action={adminSaveCoachProfile} success="Profiel opgeslagen ✓" className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="coachId" value={c.id} />
            <Lbl t="Naam"><input name="full_name" defaultValue={c.full_name || ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
            <Lbl t="Telefoon"><input name="phone" defaultValue={c.phone || ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-lav">Specialiteit</span>
              <SpecialtyPicker name="specialty" defaultValue={c.coach_specialty || ""} />
            </label>
            <Lbl t="Prijslijst (kort)"><input name="pricelist" defaultValue={c.coach_pricelist || ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
            <label className="block sm:col-span-2"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Bio</span><textarea name="bio" rows={3} defaultValue={c.coach_bio || ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></label>
            <Lbl t="PT 1-op-1 (€)"><input name="pt1_eur" defaultValue={c.coach_pt_price_cents != null ? c.coach_pt_price_cents / 100 : ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
            <div className="grid grid-cols-2 gap-2">
              <Lbl t="PT 1-op-2 (€ pp)"><input name="pt2_eur" defaultValue={c.coach_pt2_price_cents != null ? c.coach_pt2_price_cents / 100 : ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
              <Lbl t="PT 1-op-3 (€ pp)"><input name="pt3_eur" defaultValue={c.coach_pt3_price_cents != null ? c.coach_pt3_price_cents / 100 : ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
            </div>
            <div className="rounded-lg border border-borderc bg-paper/50 p-3 sm:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-lav">Facturatiegegevens (B2B — voor de factuur van zijn sessietegoed)</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Lbl t="Bedrijfsnaam"><input name="bill_company" defaultValue={c.bill_company || ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
                <Lbl t="Btw-nummer"><input name="bill_vat" defaultValue={c.bill_vat || ""} placeholder="BE 0123.456.789" className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></Lbl>
              </div>
              <label className="mt-2 block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Facturatieadres</span><textarea name="bill_address" rows={2} defaultValue={c.bill_address || ""} className="w-full rounded-lg border-2 border-borderc px-2 py-1.5 text-sm" /></label>
            </div>
            <div className="sm:col-span-2"><button className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand">Profiel opslaan</button></div>
          </ActionForm>
        </div>
      </details>

      {/* Facturatie, tegoed & beschikbaarheid */}
      <details className="mt-3 rounded-2xl border border-borderc bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-brand">Facturatie, tegoed &amp; beschikbaarheid</summary>
        <div className="border-t border-borderc p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <ActionForm action={setCoachBilling} success="Facturatie opgeslagen ✓" className="rounded-xl bg-paper/60 p-4">
              <input type="hidden" name="coachId" value={c.id} />
              <p className="text-sm text-ink-soft">Facturatie: <strong className="text-brand">vast € 12 / sessie</strong> via sessietegoed.</p>
              {(c.coach_billing_mode !== "credit" || c.coach_session_price_cents !== 1200) && (
                <button className="mt-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-brand">Standaard toepassen (€ 12 / sessietegoed)</button>
              )}
            </ActionForm>
            <ActionForm action={grantCoachCredits} success="Sessietegoed bijgeschreven ✓" className="rounded-xl bg-paper/60 p-4">
              <input type="hidden" name="coachId" value={c.id} />
              <div className="flex flex-wrap items-end gap-2">
                <Lbl t="Beurten ±"><input name="delta" type="number" step="0.5" placeholder="bv. 10" className="w-24 rounded-lg border-2 border-borderc bg-white px-2 py-1.5 text-sm" /></Lbl>
                <Lbl t="Afrekening">
                  <select name="betaling" className="rounded-lg border-2 border-borderc bg-white px-2 py-1.5 text-sm">
                    <option value="betaald">Betaald (cash/overschrijving ontvangen)</option>
                    <option value="gratis">Gratis gegeven (niets aanrekenen)</option>
                  </select>
                </Lbl>
                <button className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand">Toekennen</button>
              </div>
              <p className="mt-2 text-[11px] text-ink-soft">Rekent hij zelf online af, dan hoef je hier niets te doen.</p>
            </ActionForm>
          </div>

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-lav">Beschikbaarheid</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(avail || []).map((a) => (
              <span key={a.id} className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand">
                {WD_FULL[a.weekday].slice(0, 2)} {fmtHour(a.from_hour)}–{fmtHour(a.to_hour)}
                <ActionForm action={deleteCoachAvailability} success="Verwijderd ✓" className="inline">
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-red-500 hover:underline">×</button>
                </ActionForm>
              </span>
            ))}
            {(avail || []).length === 0 && <span className="text-xs text-ink-soft">Geen beschikbaarheid ingesteld.</span>}
          </div>
          <ActionForm action={addCoachAvailability} success="Beschikbaarheid toegevoegd ✓" className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="coachId" value={c.id} />
            <Lbl t="Dag"><select name="weekday" className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{WD_FULL.map((dg, i) => <option key={i} value={i}>{dg}</option>)}</select></Lbl>
            <Lbl t="Van"><select name="from_hour" defaultValue={9} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{uren.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}</select></Lbl>
            <Lbl t="Tot"><select name="to_hour" defaultValue={18} className="rounded-lg border-2 border-borderc px-2 py-1.5 text-sm">{uren.map((h) => <option key={h} value={h}>{fmtHour(h)}</option>)}</select></Lbl>
            <button className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-brand">+ Beschikbaarheid</button>
          </ActionForm>

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-lav">Tegoedhistoriek</p>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {(ledger || []).map((l, i) => (
              <div key={i} className="flex justify-between gap-3 border-b border-borderc py-1.5 text-xs last:border-b-0">
                <span className="text-ink-soft">{l.reason || "—"}</span>
                <span className="flex shrink-0 gap-3">
                  <span className={"font-bold tabular-nums " + (Number(l.delta) < 0 ? "text-red-600" : "text-accentdark")}>{Number(l.delta) > 0 ? "+" : ""}{getal(l.delta)}</span>
                  <span className="text-ink-soft/70">{fmt(l.created_at)}</span>
                </span>
              </div>
            ))}
            {(ledger || []).length === 0 && <p className="text-xs text-ink-soft">Nog geen tegoedbewegingen.</p>}
          </div>
        </div>
      </details>

      {/* Activiteitenlog */}
      {(activity || []).length > 0 && (
        <details className="mt-3 rounded-2xl border border-borderc bg-white">
          <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-brand">Activiteitenlog ({activity.length})</summary>
          <div className="max-h-72 space-y-1 overflow-y-auto border-t border-borderc p-5">
            {activity.map((a, i) => (
              <div key={i} className="flex justify-between gap-3 text-xs">
                <span className="text-ink-soft">{a.summary}</span>
                <span className="shrink-0 text-ink-soft/60">{fmt(a.created_at)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Cijfer({ label, waarde, sub, rood = false }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-lav">{label}</p>
      <p className={"mt-1 text-2xl font-black " + (rood ? "text-red-600" : "text-brand")}>{waarde}</p>
      <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>
    </div>
  );
}

function Lbl({ t, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">{t}</span>
      {children}
    </label>
  );
}
