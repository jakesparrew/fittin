import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dossierVoor } from "@/lib/coaching/plan.js";
import { coachAan } from "@/lib/coaching/model.js";
import IntakeWizard from "@/components/coaching/IntakeWizard";
import WeekPaneel from "@/components/coaching/WeekPaneel";
import MaaltijdPaneel from "@/components/coaching/MaaltijdPaneel";
import PlanBeheer from "@/components/coaching/PlanBeheer";
import { maaltijdenAan, richtlijnVoor } from "@/lib/coaching/maaltijd.js";
import { magCoaching } from "@/lib/coaching/toegang.js";
import { MIJLPALEN } from "@/lib/coaching/mijlpalen.js";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Je AI-coach | Fittin'",
  description: "Een trainingsplan op maat, week per week, met opvolging.",
  // Een persoonlijk dossier hoort niet in Google.
  robots: { index: false, follow: false },
};

export default async function CoachingPagina() {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/coaching");
  if (profile?.role === "coach") redirect("/coach");
  // De AI-coach draait voorlopig voor een proefgroep. Wie er niet in zit, hoort niet te weten dat
  // deze pagina bestaat — vandaar een omleiding en geen "geen toegang"-scherm.
  if (!magCoaching(profile)) redirect("/account");

  const admin = createAdminClient();
  const dossier = await dossierVoor(admin, user.id);
  const aan = coachAan();

  if (!aan && !dossier.plan) {
    return (
      <Kader>
        <h1 className="font-display text-3xl font-black text-brand">Je AI-coach</h1>
        <p className="mt-3 text-ink-soft">Deze functie staat op dit moment even uit. Probeer het later opnieuw.</p>
      </Kader>
    );
  }

  // ---------- Nog geen plan: de voordeur ----------
  if (!dossier.plan) {
    const heeftIntake = !!(profile?.coaching_doel && profile?.coaching_ervaring && profile?.coaching_dagen);
    return (
      <Kader>
        <p className="text-[11px] font-bold uppercase tracking-widest text-accentdark">Fittin&rsquo; coaching</p>
        <h1 className="mt-2 font-display text-3xl font-black leading-tight text-brand sm:text-4xl">
          Start je Fittin&rsquo; AI Coaching hier
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Een paar vragen, en je krijgt een plan van meerdere weken dat bij jou past. Elke week staat
          klaar wanneer je een sessie boekt, je vinkt af wat je deed, en je coach past de week erna
          daarop aan. Wil je er een weekmenu bij, dan kies je dat straks zelf.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kaartje titel="Workouts" tekst="Je sessie staat klaar in je deurcodemail, met oefeningen en gewichten." />
          <Kaartje titel="Meal plan" tekst="Een weekmenu met boodschappenlijst, afgestemd op je doel." />
          <Kaartje titel="Motivatie" tekst="Een bericht wanneer je een mijlpaal haalt. Geen dagelijkse duwtjes." />
          <Kaartje titel="Een echte coach" tekst="Loopt het vast, dan stuurt je coach je door naar een van onze acht coaches." />
        </div>

        <div className="mt-8">
          <IntakeWizard profiel={heeftIntake ? profile : null} />
        </div>
      </Kader>
    );
  }

  // ---------- Wél een plan: het dossier ----------
  const { plan, weken, open, sessies, oefeningen, checkin, menu, mijlpalen } = dossier;
  const eten = maaltijdenAan(profile);
  const kanMenuMaken = eten && !richtlijnVoor(profile).error;
  const afgevinkt = sessies.filter((s) => s.gedaan_at).length;
  const alleAf = sessies.length > 0 && afgevinkt === sessies.length;
  // De check-in verscheen alleen bij een perfecte week. Maar de zondagmail vraagt juist aan wie
  // NIET alles afwerkte hoe het ging — die klikte dan door naar een pagina zonder formulier, en
  // daarmee was de hele feedbacklus onbereikbaar voor precies de weken waarover iets te zeggen valt.
  const dagenOpen = open?.unlocked_at ? (Date.now() - new Date(open.unlocked_at).getTime()) / 86400000 : 0;
  const magCheckin = alleAf || dagenOpen >= 6;
  const isLaatste = open?.weeknummer === plan.weken;
  const eerdere = weken.filter((w) => w.completed_at).reverse();

  return (
    <Kader>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-accentdark">Je coaching</p>
          <h1 className="mt-1 font-display text-3xl font-black leading-tight text-brand">
            {open ? `Week ${open.weeknummer} van ${plan.weken}` : `Plan van ${plan.weken} weken`}
          </h1>
        </div>
        {plan.status === "gepauzeerd" && (
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">Op pauze</span>
        )}
      </div>

      {/* De weekbalk: waar sta je in het plan. Elke bol is een week. */}
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {weken.map((w) => {
          const staat = w.completed_at ? "af" : w.unlocked_at ? "open" : "slot";
          return (
            <span key={w.id}
              title={`Week ${w.weeknummer}${w.is_rustweek ? " — lichtere week" : ""}`}
              className={
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition " +
                (staat === "af" ? "bg-accent text-brand" : staat === "open" ? "border-2 border-accent bg-white text-brand" : "bg-borderc/50 text-brand/35")
              }>
              {w.weeknummer}
            </span>
          );
        })}
      </div>

      {plan.samenvatting && (
        <div className="mt-6 rounded-3xl border border-borderc bg-white p-5">
          <p className="text-sm leading-relaxed text-brand">{plan.samenvatting}</p>
        </div>
      )}

      {open?.weekanalyse && (
        <div className="anim-in mt-4 rounded-3xl border-2 border-accent/30 bg-accent/5 p-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-accentdark">Van je coach</p>
          <p className="mt-1.5 text-sm leading-relaxed text-brand">{open.weekanalyse}</p>
        </div>
      )}

      {open?.is_rustweek && (
        <p className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm text-ink-soft">
          Dit is bewust een lichtere week. Die hoort erbij — je lichaam bouwt op tijdens de rust, niet tijdens de sessie.
        </p>
      )}

      {open && (
        <div className="mt-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-black text-brand">Deze week</h2>
            <span className="text-sm text-ink-soft">{afgevinkt} van {sessies.length} gedaan</span>
          </div>
          <WeekPaneel week={open} sessies={sessies} oefeningen={oefeningen} checkin={checkin} alleSessiesAf={alleAf} magCheckin={magCheckin} isLaatsteWeek={isLaatste} maaltijden={eten} />
        </div>
      )}

      {eten && open && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-black text-brand">Je eten deze week</h2>
          <MaaltijdPaneel menu={menu} profiel={profile} kanMaken={kanMenuMaken} />
        </div>
      )}

      {mijlpalen.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-black text-brand">Wat je al haalde</h2>
          <ul className="flex flex-wrap gap-2">
            {mijlpalen.filter((m) => MIJLPALEN[m.soort]).map((m) => (
              <li key={m.soort} title={MIJLPALEN[m.soort].tekst}
                className="rounded-full border-2 border-accent/40 bg-accent/5 px-4 py-2 text-xs font-bold text-brand">
                {MIJLPALEN[m.soort].titel}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.doorverwezen_at && (
        <div className="anim-in mt-8 rounded-3xl border-2 border-amber-300 bg-amber-50 p-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-700">Van je coach</p>
          <p className="mt-1.5 text-sm leading-relaxed text-brand">
            Hier loopt het vast op iets dat een schema niet oplost. Een van onze acht coaches kijkt
            liever even met je mee — de intake en de proeftraining zijn gratis, en je hoeft niets te
            beslissen voor je geweest bent.
          </p>
          <Link href="/personal-training#intake"
            className="mt-4 inline-block rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">
            Praat met een coach
          </Link>
        </div>
      )}

      {!open && (
        <p className="mt-6 rounded-2xl bg-paper px-4 py-3 text-sm text-ink-soft">
          Je eerste week wordt klaargezet. Ververs deze pagina zo dadelijk.
        </p>
      )}

      <p className="mt-6 text-sm text-ink-soft">
        Nog geen moment geboekt? <Link href="/boeken" className="font-bold text-accentdark hover:underline">Boek je sessie</Link> — je workout gaat mee in je deurcodemail.
      </p>

      {eerdere.length > 0 && (
        <details className="mt-8 rounded-3xl border border-borderc bg-white p-5">
          <summary className="cursor-pointer text-sm font-black text-brand">Wat je coach eerder schreef ({eerdere.length})</summary>
          <ul className="mt-4 space-y-4">
            {eerdere.map((w) => (
              <li key={w.id} className="border-l-2 border-borderc pl-4">
                <p className="text-xs font-bold uppercase tracking-wide text-brand/40">Week {w.weeknummer}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{w.weekanalyse || "—"}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-8">
        <PlanBeheer status={plan.status} toestemming={!!profile?.coaching_toestemming_at} />
      </div>

      <p className="mt-8 text-xs leading-relaxed text-brand/40">
        Je coach geeft geen medisch advies. Stop bij pijn en raadpleeg een arts of kinesist.
        Je gegevens en toestemming beheer je bij <Link href="/account" className="underline">je account</Link>.
      </p>
    </Kader>
  );
}

function Kader({ children }) {
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">{children}</div>
    </main>
  );
}

function Kaartje({ titel, tekst }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-4">
      <p className="text-sm font-black text-brand">{titel}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{tekst}</p>
    </div>
  );
}
