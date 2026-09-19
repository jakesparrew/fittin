import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { wie } from "@/lib/coaching/wie.js";
import { createClient } from "@/lib/supabase/server";
import { coachAan, roepMetTerugval, MODELLEN } from "@/lib/coaching/model.js";
import { magNogOfBoek, boekVerbruik, boekResultaat, DAGBUDGET_MICRO, beginVanVandaag } from "@/lib/coaching/budget.js";
import { schoon, veiligheid, limiet, systeemTekst, metPijnRegel, PIJN_HINT, TEKST_SPOED, TEKST_CRISIS, CHAT_BUDGET_DEEL } from "@/lib/coaching/chat-regels.js";
import { GEREEDSCHAP, LEZEN, VOORSTEL, kaartTekst } from "@/lib/coaching/chat-tools.js";
import { laadLid, keurVoorstel, voerLezenUit } from "@/lib/coaching/chat-context.js";

// De coach-chat. Eén POST = één bericht van het lid en één antwoord van de coach.
//
// Volgorde (bewaakt door lib/coaching/chat.test.js): poort (wie) → akkoord → limieten → veiligheid (spoed/crisis
// krijgen een vaste tekst, het model ziet ze nooit) → budget (de chat mag niet meer dan CHAT_BUDGET_DEEL van de dag
// opgebruiken: plannen gaan voor) → model met gereedschap, hoogstens RONDES rondes → opslaan.
//
// Het model VOERT NIETS UIT. Een stel_…-oproep wordt gekeurd en als kaart bewaard; uitvoeren gebeurt in
// app/(site)/coaching/chat-actions.js na een tik van het lid.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RONDES = 4;
const GESCHIEDENIS = 14;
const TIJD = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fout = (bericht, status = 400) => NextResponse.json({ error: bericht }, { status });

async function bewaar(admin, rij) {
  const { data, error } = await admin.from("coach_berichten").insert(rij).select("id, rol, tekst, acties, vlag, created_at").single();
  if (error) throw new Error(error.message);
  return data;
}

/** Eerdere berichten als modelberichten. Kaarten worden een regel tekst: het model moet weten wat het lid koos. */
function naarModel(rijen) {
  const uit = [];
  for (const r of rijen) {
    if (r.rol === "systeem") continue;
    const kaarten = (r.acties || []).map((a) => `[voorstel ${kaartTekst(a).titel}: ${kaartTekst(a).regel} — ${a.status}]`).join(" ");
    const tekst = [r.tekst, kaarten].filter(Boolean).join("\n").trim();
    if (!tekst) continue;
    const rol = r.rol === "lid" ? "user" : "assistant";
    if (uit.length && uit[uit.length - 1].role === rol) uit[uit.length - 1].content += `\n\n${tekst}`;
    else uit.push({ role: rol, content: tekst });
  }
  while (uit.length && uit[0].role !== "user") uit.shift();
  return uit;
}

export async function POST(req) {
  const mij = await wie();
  if (!mij) return fout("Geen toegang.", 403);
  const { admin, profile, user } = mij;
  if (!profile.coach_chat_akkoord_at) return fout("Lees eerst wat de coach kan en niet kan.", 409);

  let body = {};
  try { body = await req.json(); } catch { /* leeg */ }
  const tekst = schoon(body?.tekst);
  if (!tekst) return fout("Leeg bericht.");

  // Limieten tellen op de berichten van het lid zelf.
  const minuutGeleden = new Date(Date.now() - 60_000).toISOString();
  const [{ count: vandaag }, { count: laatsteMinuut }] = await Promise.all([
    admin.from("coach_berichten").select("id", { count: "exact", head: true }).eq("member_id", user.id).eq("rol", "lid").gte("created_at", beginVanVandaag()),
    admin.from("coach_berichten").select("id", { count: "exact", head: true }).eq("member_id", user.id).eq("rol", "lid").gte("created_at", minuutGeleden),
  ]);
  const rem = limiet({ vandaag: vandaag || 0, laatsteMinuut: laatsteMinuut || 0 });
  if (rem) return fout(rem, 429);

  const basis = { gym_id: profile.gym_id, member_id: user.id };
  const vlag = veiligheid(tekst);
  const lidBericht = await bewaar(admin, { ...basis, rol: "lid", tekst, vlag });

  // Noodgeval of crisis: vaste tekst, geen model, geen kost.
  if (vlag === "spoed" || vlag === "crisis") {
    const coach = await bewaar(admin, { ...basis, rol: "coach", tekst: vlag === "spoed" ? TEKST_SPOED : TEKST_CRISIS, vlag });
    return NextResponse.json({ berichten: [lidBericht, coach] });
  }

  const systeem = async (t, v = null) => NextResponse.json({ berichten: [lidBericht, await bewaar(admin, { ...basis, rol: "systeem", tekst: t, vlag: v })] });
  if (!coachAan()) return systeem("De AI-coach is even niet beschikbaar. Probeer het later opnieuw.");
  const budget = await magNogOfBoek(admin, { gymId: profile.gym_id, memberId: user.id, soort: "chat" });
  if (!budget.mag || (budget.verbruikt || 0) > DAGBUDGET_MICRO * CHAT_BUDGET_DEEL) {
    return systeem("De coach heeft vandaag zijn limiet bereikt (testfase). Morgen is hij er weer.", "limiet");
  }

  const supabase = await createClient();
  const lid = await laadLid(admin, supabase, profile);
  const ctx = { admin, supabase, profiel: profile, lid };
  const { data: eerder } = await admin.from("coach_berichten").select("rol, tekst, acties")
    .eq("member_id", user.id).lt("created_at", lidBericht.created_at).order("created_at", { ascending: false }).limit(GESCHIEDENIS);
  const messages = naarModel([...(eerder || []).reverse(), { rol: "lid", tekst: vlag === "pijn" ? `${tekst}

${PIJN_HINT}` : tekst, acties: [] }]);
  const system = systeemTekst({ context: lid.tekst, nu: TIJD.format(new Date()) });

  const acties = [];
  let antwoord = "", mislukt = false;
  const rijen = []; // coaching_verbruik-id's van deze beurt: allemaal krijgen ze de uitkomst
  for (let ronde = 0; ronde < RONDES; ronde++) {
    const uit = await roepMetTerugval({ model: MODELLEN.tekst, system, messages, tools: GEREEDSCHAP, maxTokens: 700, temperatuur: 0.4, timeoutMs: 25_000 });
    rijen.push((await boekVerbruik(admin, { gymId: profile.gym_id, memberId: user.id, soort: "chat", uitkomst: uit })).id);
    if (!uit.ok) { mislukt = true; break; }
    if (uit.tekst) antwoord = uit.tekst;
    if (!uit.gereedschap.length) break;

    messages.push({
      role: "assistant",
      content: [
        ...(uit.tekst ? [{ type: "text", text: uit.tekst }] : []),
        ...uit.gereedschap.map((g) => ({ type: "tool_use", id: g.id, name: g.naam, input: g.invoer || {} })),
      ],
    });
    const resultaten = [];
    for (const g of uit.gereedschap) {
      let inhoud;
      if (LEZEN.has(g.naam)) {
        inhoud = await voerLezenUit(ctx, g.naam, g.invoer).catch(() => "Dat lukte niet.");
      } else if (VOORSTEL.has(g.naam)) {
        if (acties.length >= 3) inhoud = "Niet meer dan drie voorstellen per antwoord.";
        else {
          const k = await keurVoorstel(ctx, g.naam, g.invoer || {});
          if (k.fout) inhoud = `Niet voorgesteld: ${k.fout}. Pas aan of leg het uit aan het lid.`;
          else {
            acties.push({ id: randomUUID(), type: g.naam, invoer: k.invoer, status: "voorgesteld" });
            inhoud = "Voorgesteld: het lid ziet een kaart met een bevestigknop. Zeg kort wat je voorstelt; zeg NIET dat het al gebeurd is.";
          }
        }
      } else inhoud = "Onbekend gereedschap.";
      resultaten.push({ type: "tool_result", tool_use_id: g.id, content: inhoud });
    }
    messages.push({ role: "user", content: resultaten });
  }

  if (mislukt && !antwoord && !acties.length) {
    await Promise.all(rijen.map((id) => boekResultaat(admin, id, "chat_mislukt")));
    return systeem("Er ging iets mis bij de coach. Probeer het zo meteen opnieuw.");
  }
  if (!antwoord) antwoord = acties.length ? "Hier is mijn voorstel — bevestig hieronder als het klopt." : "Sorry, daar heb ik geen goed antwoord op.";
  if (vlag === "pijn") antwoord = metPijnRegel(antwoord);
  const coach = await bewaar(admin, { ...basis, rol: "coach", tekst: antwoord.slice(0, 2000), acties, vlag: vlag === "pijn" ? "pijn" : null });
  await Promise.all(rijen.map((id) => boekResultaat(admin, id, "chat_antwoord")));
  return NextResponse.json({ berichten: [lidBericht, coach], feiten: lid.feiten });
}
