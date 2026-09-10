import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dossierVoor } from "@/lib/coaching/plan.js";
import { coachAan } from "@/lib/coaching/model.js";
import IntakeWizard from "@/components/coaching/IntakeWizard";
import WeekPaneel from "@/components/coaching/WeekPaneel";

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
          Een paar vragen, en je krijgt een trainingsplan van meerdere weken dat bij jou past. Elke week
          staat klaar wanneer je een sessie boekt, je vinkt af wat je deed, en je coach past de week
          erna daarop aan.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Kaartje titel="Workouts" tekst="Je sessie staat klaar in je deurcodemail, met oefeningen en gewichten." />
          <Kaartje titel="Opvolging" tekst="Eén tik na je sessie stuurt je volgende week — geen logboek bijhouden." />
          <Kaartje titel="Een echte coach" tekst="Loopt het vast, dan stuurt je coach je door naar een van onze acht coaches." />
        </div>

        <div className="mt-8">
          <IntakeWizard profiel={heeftIntake ? profile : null} />
        </div>
      </Kader>
    );
  }

  // ---------- Wél een plan: het dossier ----------
  const { plan, weken, open, sessies, oefeningen, checkin } = dossier;
  const afgevinkt = sessies.filter((s) => s.gedaan_at).length;
  const alleAf = sessies.length > 0 && afgevinkt === sessies.length;
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
          <WeekPaneel week={open} sessies={sessies} oefeningen={oefeningen} checkin={checkin} alleSessiesAf={alleAf} isLaatsteWeek={isLaatste} />
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
