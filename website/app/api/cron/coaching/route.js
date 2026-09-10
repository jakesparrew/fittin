import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCoachingWeek } from "@/lib/email";
import { openVolgendeWeek } from "@/lib/coaching/plan.js";
import { coachAan } from "@/lib/coaching/model.js";
import { zorgVoorMenu, menuVoorWeek, maaltijdenAan } from "@/lib/coaching/maaltijd.js";
import { noteerMijlpalen, markeerGemeld, zwaarste, wekenOpRij } from "@/lib/coaching/mijlpalen.js";
import { magCoaching } from "@/lib/coaching/toegang.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// De zondagcron van de AI-coach. Draait één keer per week (vercel.json: zondag 18:00 UTC).
//
// Twee momenten in hetzelfde ritme, en bewust in DEZE volgorde:
//   1. Is de week rond maar de check-in nog niet ingevuld? Dan eerst vragen hoe het ging. De
//      volgende week wordt pas gemaakt ná dat antwoord — anders is de check-in decoratie.
//   2. Is de check-in er wél (of staat de week al 10 dagen open), dan gaat de volgende week open
//      en vertrekt de weekmail met de analyse van de coach erin.
//
// Waarom een lid dat niets invulde tóch verder kan: een plan dat blokkeert op een vergeten
// formulier is geen coach maar een muur. Na tien dagen gaat de week open met de standaardopbouw,
// en de mail zegt eerlijk dat de coach zonder feedback werkte.
//
// Wat er in dezelfde beweging meegaat wanneer de modules aanstaan: het weekmenu (meestal zonder
// model — zie `moetVernieuwen`) en één mijlpaal, de zwaarste die nog niet gemeld was.

const DAG = 86400000;
const LEEG = "00000000-0000-0000-0000-000000000000";

/** De stand van een heel plan, voor de mijlpalen. */
async function standVanHetPlan(admin, { planId, planWeken }) {
  const { data: weken } = await admin.from("coaching_weeks")
    .select("id, weeknummer, completed_at").eq("plan_id", planId).order("weeknummer");
  const ids = (weken || []).map((w) => w.id);
  const { data: sessies } = await admin.from("coaching_sessions")
    .select("week_id, gedaan_at").in("week_id", ids.length ? ids : [LEEG]);

  const volledig = (weken || []).map((w) => {
    const eigen = (sessies || []).filter((s) => s.week_id === w.id);
    return eigen.length > 0 && eigen.every((s) => s.gedaan_at);
  });
  return {
    afgevinkt: (sessies || []).filter((s) => s.gedaan_at).length,
    wekenAf: (weken || []).filter((w) => w.completed_at).length,
    planWeken,
    opRij: wekenOpRij(volledig),
  };
}

/** De zwaarste nog niet gemelde mijlpaal, of null. Faalt dit, dan gaat de mail gewoon door. */
async function mijlpaalVoor(admin, { gymId, memberId, planId, planWeken }) {
  try {
    const stand = await standVanHetPlan(admin, { planId, planWeken });
    const { nieuwe } = await noteerMijlpalen(admin, { gymId, memberId, stand });
    return zwaarste(nieuwe);
  } catch (e) {
    console.error("coaching mijlpaal:", e?.message || e);
    return null;
  }
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new NextResponse("cron not configured (set CRON_SECRET)", { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  if (!coachAan()) return NextResponse.json({ overgeslagen: "coach staat uit" });

  const admin = createAdminClient();
  const fouten = [];
  let gevraagd = 0, geopend = 0, gepauzeerd = 0, afgerond = 0, menus = 0, buitenGroep = 0;

  const { data: plannen, error } = await admin
    .from("coaching_plans").select("id, gym_id, member_id, weken").eq("status", "lopend");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const plan of plannen || []) {
    try {
      const { data: weken } = await admin.from("coaching_weeks")
        .select("id, weeknummer, unlocked_at, completed_at").eq("plan_id", plan.id).order("weeknummer");
      const open = [...(weken || [])].reverse().find((w) => w.unlocked_at && !w.completed_at);
      if (!open) continue;

      const { data: sessies } = await admin.from("coaching_sessions")
        .select("id, gedaan_at").eq("week_id", open.id);
      const gepland = (sessies || []).length;
      const gedaan = (sessies || []).filter((s) => s.gedaan_at).length;
      const { data: checkin } = await admin.from("coaching_checkins")
        .select("id, menu_gevolgd, honger").eq("week_id", open.id).maybeSingle();

      const dagenOpen = (Date.now() - new Date(open.unlocked_at).getTime()) / DAG;
      // Een week die nog geen zes dagen loopt, is gewoon nog bezig. Niets doen.
      if (dagenOpen < 6) continue;

      const { data: lid } = await admin.from("profiles").select("*").eq("id", plan.member_id).maybeSingle();
      if (!lid?.email) continue;
      // Wie buiten de proefgroep valt, krijgt geen zondagmail — ook niet als hij ooit een plan
      // maakte toen de lijst ruimer stond. De poort is de poort, in beide richtingen.
      if (!magCoaching(lid)) { buitenGroep++; continue; }

      // ---- 1. Nog geen check-in en nog niet te lang bezig: vragen hoe het ging ----
      if (!checkin && dagenOpen < 10) {
        await sendCoachingWeek({
          to: lid.email, name: lid.full_name, soort: "checkin",
          weekNr: open.weeknummer, totaalWeken: plan.weken, gedaan, gepland,
        });
        gevraagd++;
        continue;
      }

      // ---- 2. Volgende week openen ----
      const uit = await openVolgendeWeek(admin, { gymId: plan.gym_id, planId: plan.id });
      if (uit.error) { fouten.push(`plan ${plan.id}: ${uit.error}`); continue; }

      // ---- 3. Het plan is uit ----
      if (uit.klaar) {
        const mijlpaal = await mijlpaalVoor(admin, { gymId: plan.gym_id, memberId: plan.member_id, planId: plan.id, planWeken: plan.weken });
        await sendCoachingWeek({
          to: lid.email, name: lid.full_name, soort: "afgerond",
          weekNr: open.weeknummer, totaalWeken: plan.weken, mijlpaal,
          analyse: "Alle weken zitten erop. Wat je nu hebt is geen resultaat van één zware week maar van een reeks gewone — dat is precies hoe het hoort. Een nieuw plan begint van waar je nu staat, niet van nul.",
        });
        if (mijlpaal) await markeerGemeld(admin, { memberId: plan.member_id, soort: mijlpaal.soort });
        afgerond++;
        continue;
      }

      if (uit.besluit === "pauze_vragen") {
        // Niets gedaan en niets laten weten. Dan is de vraag niet "welke week nu" maar "ben je er nog".
        await sendCoachingWeek({
          to: lid.email, name: lid.full_name, soort: "checkin",
          weekNr: open.weeknummer, totaalWeken: plan.weken, gedaan, gepland,
          analyse: "Je hebt deze week niets afgevinkt en niets laten weten. Geen probleem — laat gewoon even weten hoe het gaat, dan pas ik je plan aan. Wil je pauzeren, dan kan dat ook.",
        });
        gepauzeerd++;
        continue;
      }
      if (uit.besluit === "doorverwijzen") {
        await sendCoachingWeek({
          to: lid.email, name: lid.full_name, soort: "checkin",
          weekNr: open.weeknummer, totaalWeken: plan.weken, gedaan, gepland,
          analyse: "Je gaf meerdere weken op rij aan dat het te zwaar was. Dat los ik niet op met een lichtere week — daar kijkt iemand beter even met je mee. Een gratis proeftraining bij een van onze coaches staat voor je klaar.",
        });
        gevraagd++;
        continue;
      }

      // Wat staat er in de nieuwe week?
      const { data: nieuweWeek } = await admin.from("coaching_weeks")
        .select("id, weeknummer, program_id, weekanalyse").eq("id", uit.weekId).maybeSingle();
      let sessieLijst = [];
      if (nieuweWeek?.program_id) {
        const { data: dagen } = await admin.from("program_days")
          .select("id, name").eq("program_id", nieuweWeek.program_id).order("day_no");
        for (const d of dagen || []) {
          const { count } = await admin.from("program_exercises")
            .select("id", { count: "exact", head: true }).eq("program_day_id", d.id);
          sessieLijst.push({ naam: d.name, aantal: count || 0 });
        }
      }

      // ---- 4. Het weekmenu, voor wie de module aanzette ----
      // Een menu dat niet lukt, mag de week niet tegenhouden: de training is de ruggengraat.
      let menu = null;
      const weekNr = nieuweWeek?.weeknummer || open.weeknummer + 1;
      if (maaltijdenAan(lid)) {
        try {
          const m = await zorgVoorMenu(admin, {
            gymId: plan.gym_id, memberId: plan.member_id, profiel: lid,
            weeknummer: weekNr, planId: plan.id, checkin,
          });
          if (m.ok) {
            menu = await menuVoorWeek(admin, plan.member_id, weekNr);
            if (!m.hergebruikt && !m.alBestond) menus++;
          } else if (m.error && !m.dietist) {
            fouten.push(`menu ${plan.id}: ${m.error}`);
          }
        } catch (e) {
          fouten.push(`menu ${plan.id}: ${e?.message || e}`);
        }
      }

      // ---- 5. Mijlpalen ----
      // Ze worden altijd genoteerd — het is gebeurd, ook als je er geen mail over wil. Alleen het
      // vermélden hangt aan de module. Wie ze later aanzet, krijgt zijn zwaarste alsnog te horen.
      const bereikt = await mijlpaalVoor(admin, { gymId: plan.gym_id, memberId: plan.member_id, planId: plan.id, planWeken: plan.weken });
      const motivatie = Array.isArray(lid.coaching_modules) && lid.coaching_modules.includes("motivatie");
      const mijlpaal = motivatie ? bereikt : null;

      await sendCoachingWeek({
        to: lid.email, name: lid.full_name, soort: "week",
        weekNr, totaalWeken: plan.weken,
        analyse: nieuweWeek?.weekanalyse, sessies: sessieLijst, menu, mijlpaal,
      });
      if (mijlpaal) await markeerGemeld(admin, { memberId: plan.member_id, soort: mijlpaal.soort });
      geopend++;
    } catch (e) {
      fouten.push(`plan ${plan.id}: ${e?.message || e}`);
      console.error("coaching cron:", e?.message || e);
    }
  }

  try {
    await admin.from("cron_runs").insert({
      job: "coaching_week", ok: fouten.length === 0,
      detail: { gevraagd, geopend, gepauzeerd, afgerond, menus, buitenGroep, ...(fouten.length ? { fouten } : {}) },
    });
  } catch {}

  return NextResponse.json(
    { gevraagd, geopend, gepauzeerd, afgerond, menus, buitenGroep, ...(fouten.length ? { fouten } : {}) },
    { status: fouten.length ? 500 : 200 }
  );
}
