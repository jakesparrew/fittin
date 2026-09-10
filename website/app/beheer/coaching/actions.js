"use server";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCoachingWeek, sendAccessCode } from "@/lib/email";
import { MIJLPALEN } from "@/lib/coaching/mijlpalen.js";

// De testknoppen van de AI-coach.
//
// WAAROM ZE MOETEN BESTAAN. Vier van de vijf dingen die deze coach maakt, kan de eigenaar vandaag
// niet zien zonder erop te wachten: de zondagmail vertrekt pas als een week zes dagen loopt, en de
// deurcodemail met workout en afvinkknop hangt aan een echte boeking plus de vijf-minuten-cron. Wie
// wil weten of iets werkt, moest dus een week wachten of een boeking opofferen.
//
// DRIE HARDE GRENZEN, elk met een reden die in deze codebase al eens fout ging:
//
//  1. ALLEEN NAAR JEZELF. De ontvanger is altijd het e-mailadres van de INGELOGDE beheerder,
//     nooit een adres uit het formulier. Een testknop die een adres accepteert, is een knop om
//     namens de gym post te sturen.
//  2. EEN EIGEN `kind`. Vijf dedupe-remmen in dit project tellen rijen in `email_log` (abo_suggestie
//     60 dagen, sessie_feedback 30 dagen, week_rapport deze week, insight-mails 30 dagen,
//     nieuwsbrief_bevestiging 3 per dag). Eén testmail met een bestaande `kind` zou de ÉCHTE mail
//     tot zestig dagen onderdrukken. Vandaar `coaching_test`, dat door geen enkele rem gelezen wordt.
//  3. GEEN MODELAANROEP. Alle inhoud hieronder is verzonnen en staat in dit bestand. Testen mag
//     niets kosten en mag de dagrem niet opeten — anders is de knop zelf de reden dat een lid geen
//     plan meer kan maken.
//
// En wat deze knoppen NIET doen: ze raken geen enkele rij van een lid aan. Geen week openen, geen
// sessie afvinken, geen plan aanmaken. Zie ook /api/cron/coaching — die route mag hier nooit
// aangeroepen worden, want die verstuurt echte mail naar echte leden.

const VOORBEELD_SESSIES = [
  { naam: "Onderlichaam", aantal: 5 },
  { naam: "Bovenlichaam Push", aantal: 5 },
  { naam: "Bovenlichaam Pull", aantal: 5 },
];

const VOORBEELD_MENU = {
  weeknummer: 3,
  kcal_richtlijn: 2100,
  toelichting: "Voorbeeldmenu — dit is een testmail, de cijfers zijn verzonnen.",
  boodschappen: [
    { categorie: "Vers", items: ["kipfilet 800 g", "spinazie 400 g", "cherrytomaten"] },
    { categorie: "Voorraad", items: ["havermout", "rijst", "kikkererwten"] },
  ],
  menu: [{ dag: "maandag", ontbijt: "Havermout met banaan", lunch: "Wrap met kip", avondeten: "Zalm met rijst", tussendoor: "Griekse yoghurt" }],
};

async function ik() {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("email, full_name").eq("id", profile.id).single();
  if (!me?.email) return { error: "Je profiel heeft geen e-mailadres." };
  return { profile, admin, me };
}

/**
 * De drie zondagmails naar je eigen adres. Verzonnen cijfers, echte sjablonen.
 * Dit is de enige manier om de weekmail te zien zonder een week te wachten.
 */
export async function stuurTestCoachMails() {
  const mij = await ik();
  if (mij.error) return mij;
  const naam = mij.me.full_name;
  const to = mij.me.email;

  const mails = [
    { soort: "checkin", weekNr: 2, totaalWeken: 8, gedaan: 1, gepland: 3 },
    {
      soort: "week", weekNr: 3, totaalWeken: 8, sessies: VOORBEELD_SESSIES, menu: VOORBEELD_MENU,
      mijlpaal: { soort: "eerste_week", ...MIJLPALEN.eerste_week },
      analyse: "Je deed twee van de drie sessies vorige week en gaf aan dat het goed voelde. Deze week gaan we op de squat één herhaling omhoog; de rest blijft staan. (Dit is een testmail met verzonnen cijfers.)",
    },
    {
      soort: "afgerond", weekNr: 8, totaalWeken: 8,
      mijlpaal: { soort: "plan_af", ...MIJLPALEN.plan_af },
      analyse: "Alle weken zitten erop. (Dit is een testmail met verzonnen cijfers.)",
    },
  ];

  let verstuurd = 0;
  const mislukt = [];
  for (const m of mails) {
    try {
      const r = await sendCoachingWeek({ to, name: naam, kind: "coaching_test", ...m });
      if (r?.ok === false) mislukt.push(m.soort); else verstuurd++;
    } catch (e) {
      mislukt.push(`${m.soort} (${e?.message || e})`);
    }
  }
  if (!verstuurd) return { error: `Versturen mislukt: ${mislukt.join(", ")}` };
  return { ok: `${verstuurd} coachmail${verstuurd === 1 ? "" : "s"} naar ${to} ✓${mislukt.length ? ` — mislukt: ${mislukt.join(", ")}` : ""}` };
}

/**
 * De deurcodemail zoals een lid met coaching hem krijgt: met workout én afvinkknop. De token is
 * verzonnen, dus de knop landt op "deze link werkt niet meer" — dat is de bedoeling. Wie de echte
 * knop wil proberen, boekt een sessie.
 */
export async function stuurTestDeurcodeMail() {
  const mij = await ik();
  if (mij.error) return mij;
  const nu = Date.now();
  try {
    const r = await sendAccessCode({
      to: mij.me.email, name: mij.me.full_name, serviceName: "Gymsessie (test)",
      startsAt: new Date(nu + 5 * 60000).toISOString(),
      endsAt: new Date(nu + 65 * 60000).toISOString(),
      accessCode: "000000", personal: false,
      address: "Aannemersstraat 186, 9040 Gent",
      mapsUrl: "https://www.google.com/maps/dir/?api=1&destination=Aannemersstraat+186+9040+Gent",
      kind: "coaching_test",
      workout: {
        weekNr: 3, totaalWeken: 8, volgnummer: 1, totaal: 3, naam: "Onderlichaam",
        // Bewust een token die nergens op slaat: de knop hoort te tonen hoe hij eruitziet, niet een
        // echte sessie van iemand af te vinken.
        afvinkToken: "voorbeeld-token-werkt-niet",
        oefeningen: [
          { naam: "Barbell Squat", sets: 4, reps: 8, kg: null, rust: 120, sectie: "Hoofdoefening" },
          { naam: "Leg Press", sets: 3, reps: 12, kg: null, rust: 90, sectie: "Accessoire" },
          { naam: "Plank", sets: 3, reps: 30, kg: null, rust: 60, sectie: "Finisher" },
        ],
      },
    });
    if (r?.ok === false) return { error: "Versturen mislukt — check de e-mailinstellingen." };
  } catch (e) {
    return { error: `Versturen mislukt: ${e?.message || e}` };
  }
  return { ok: `Deurcodemail met workout naar ${mij.me.email} ✓ — de afvinkknop is een voorbeeld en werkt niet.` };
}
