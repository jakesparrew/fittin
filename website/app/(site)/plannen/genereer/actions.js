"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, parseInt(n, 10) || lo));

// Equipment presets → which exercise equipment to draw from.
const EQUIP = {
  lichaamsgewicht: ["Lichaamsgewicht", "Weerstandsbanden"],
  basis: ["Lichaamsgewicht", "Dumbbell", "Kettlebell", "Kettlebells", "Weerstandsbanden", "Fitnessbal", "EZ-bar"],
  "volledige gym": null, // all
};

// Generate a plan with Claude, drawn strictly from our exercise library, and save it.
export async function generatePlan(prevState, formData) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: "AI-generatie is nog niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt)." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: profile } = await supabase.from("profiles").select("gym_id").eq("id", user.id).single();
  if (!profile) return { error: "Geen profiel." };

  // Rate limit: max 10 AI generations per hour per member (protects against API cost abuse).
  const since = new Date(Date.now() - 3600000).toISOString();
  const { count } = await supabase.from("ai_generations").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= 10) return { error: "Je hebt dit uur het maximum aantal AI-schema's bereikt. Probeer het later opnieuw." };
  await supabase.from("ai_generations").insert({ gym_id: profile.gym_id, user_id: user.id, kind: "plan" });

  const goal = String(formData.get("goal") || "fitter worden");
  const days = clamp(formData.get("days"), 2, 6);
  const level = String(formData.get("level") || "beginner");
  const equip = String(formData.get("equipment") || "volledige gym");
  // Sanitise free-text notes (strip newlines/control chars) — defence-in-depth against prompt
  // injection on top of the forced-tool output + slug validation below.
  const notes = String(formData.get("notes") || "").replace(/\s+/g, " ").slice(0, 300).trim();

  // Candidate exercises (curated 'gym' ones first), filtered by available equipment.
  let q = supabase.from("exercises").select("name, slug, category, primary_muscles, equipment").eq("gym_id", profile.gym_id).order("source", { ascending: true }).limit(160);
  const set = EQUIP[equip];
  if (set) q = q.in("equipment", set);
  const { data: lib } = await q;
  if (!lib?.length) return { error: "Geen oefeningen beschikbaar voor dit materiaal." };
  const catalog = lib.map((e) => `${e.slug} | ${e.name} | ${e.category} | ${(e.primary_muscles || [])[0] || ""}`).join("\n");

  const system = `Je bent een ervaren strength & conditioning coach bij een privégym. Stel een doordacht, veilig trainingsschema op.
Gebruik UITSLUITEND oefeningen uit de catalogus hieronder en verwijs met de EXACTE slug. Verzin geen slugs.
Catalogus (slug | naam | categorie | hoofdspier):
${catalog}`;
  const userMsg = `Maak een schema van ${days} trainingsdagen per week. Doel: ${goal}. Niveau: ${level}. Beschikbaar materiaal: ${equip}.${notes ? ` Aandachtspunten van het lid: ${notes}.` : ""}
Verdeel de spiergroepen logisch over de dagen (full body bij weinig dagen; upper/lower of push/pull/legs bij meer). 5 tot 7 oefeningen per dag. Kies sets/reps/rust passend bij het doel (kracht: 3-5 reps, 120-180s rust; spiermassa: 8-12 reps, 60-90s; uithouding/afvallen: 12-20 reps, 30-60s).`;

  const tool = {
    name: "create_workout_plan",
    description: "Lever het trainingsschema gestructureerd aan.",
    input_schema: {
      type: "object",
      properties: {
        plan_name: { type: "string" },
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              exercises: {
                type: "array",
                items: {
                  type: "object",
                  properties: { slug: { type: "string" }, sets: { type: "integer" }, reps: { type: "integer" }, rest_sec: { type: "integer" } },
                  required: ["slug", "sets", "reps", "rest_sec"],
                },
              },
            },
            required: ["name", "exercises"],
          },
        },
      },
      required: ["plan_name", "days"],
    },
  };

  let plan;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 2000, system,
        tools: [tool], tool_choice: { type: "tool", name: "create_workout_plan" },
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    if (!res.ok) { console.error("anthropic", res.status, (await res.text()).slice(0, 300)); return { error: "De AI-generatie mislukte. Probeer het opnieuw." }; }
    const data = await res.json();
    plan = (data.content || []).find((b) => b.type === "tool_use")?.input;
  } catch (e) {
    console.error("anthropic err", e?.message);
    return { error: "AI niet bereikbaar. Probeer het later opnieuw." };
  }
  if (!plan?.days?.length) return { error: "De AI gaf geen geldig schema terug. Probeer het opnieuw." };

  const { data: valid } = await supabase.from("exercises").select("id, slug").eq("gym_id", profile.gym_id);
  const idBySlug = new Map((valid || []).map((e) => [e.slug, e.id]));

  const { data: prog, error: pErr } = await supabase
    .from("programs")
    .insert({ gym_id: profile.gym_id, member_id: user.id, name: (plan.plan_name || "AI-schema").slice(0, 80), is_template: false })
    .select("id").single();
  if (pErr) return { error: pErr.message };

  let dayNo = 1;
  for (const d of plan.days.slice(0, 7)) {
    const { data: day } = await supabase.from("program_days").insert({ program_id: prog.id, day_no: dayNo, name: (d.name || `Dag ${dayNo}`).slice(0, 60) }).select("id").single();
    dayNo++;
    if (!day) continue;
    const rows = (d.exercises || [])
      .map((x, i) => ({ program_day_id: day.id, exercise_id: idBySlug.get(x.slug), sets: clamp(x.sets, 1, 10), reps: clamp(x.reps, 1, 50), rest_sec: clamp(x.rest_sec, 15, 300), position: i }))
      .filter((r) => r.exercise_id);
    if (rows.length) await supabase.from("program_exercises").insert(rows);
  }
  redirect(`/plannen/${prog.id}`);
}
