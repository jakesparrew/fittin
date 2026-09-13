"use server";
import { revalidatePath } from "next/cache";
import { nagekeken, leesbareFout } from "@/lib/uitkomst";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { runActivationCampaign } from "@/lib/activation";

const num = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

const SITE_ACT = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

export async function createActivation(formData) {
  const { supabase, profile, userId, error } = await requireStaff(true);
  if (error) return { error };
  const trigger = formData.get("trigger_type") || "inactive";
  const { data, error: e } = await supabase
    .from("campaigns")
    .insert({
      gym_id: profile.gym_id,
      kind: "activation",
      name: formData.get("name") || "Activatie-campagne",
      trigger_type: trigger,
      trigger_params: { days: 10, min: 4, max: 1 },
      status: "draft",
      created_by: userId,
    })
    .select("id")
    .single();
  if (e) return { error: leesbareFout(e, "Campagne aanmaken") };
  redirect(`/beheer/activatie/${data.id}`);
}

// Create a fully-configured activation in one go (from the step-by-step wizard).
export async function createActivationFull(formData) {
  const { supabase, profile, userId, error } = await requireStaff(true);
  if (error) return { error };
  const trigger = formData.get("trigger_type") || "inactive";
  // Build trigger_params from whichever single param this segment uses.
  const paramKey = formData.get("param_key") || "";
  const paramVal = num(formData.get("param_value"), 0);
  const params = { days: 10, min: 4, max: 1 };
  if (paramKey) params[paramKey] = paramVal;
  const activate = formData.get("activate") === "on";
  const { data, error: e } = await supabase
    .from("campaigns")
    .insert({
      gym_id: profile.gym_id,
      kind: "activation",
      name: formData.get("name") || "Activatie-campagne",
      trigger_type: trigger,
      trigger_params: params,
      subject: formData.get("subject") || null,
      body_html: formData.get("body") || null,
      reward_credits: num(formData.get("reward_credits"), 0),
      discount_percent: Math.max(0, Math.min(100, num(formData.get("discount_percent"), 0))),
      cooldown_days: num(formData.get("cooldown_days"), 30),
      status: activate ? "active" : "draft",
      created_by: userId,
    })
    .select("id")
    .single();
  if (e) return { error: leesbareFout(e, "Campagne aanmaken") };
  redirect(`/beheer/activatie/${data.id}`);
}

export async function updateActivation(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const paramKey = formData.get("param_key"); // days | min | max | (none)
  const params = {};
  if (paramKey) params[paramKey] = num(formData.get("param_value"), 0);
  const res = await supabase
    .from("campaigns")
    .update({
      name: formData.get("name"),
      subject: formData.get("subject"),
      preheader: formData.get("preheader"),
      body_html: formData.get("body"),
      cooldown_days: num(formData.get("cooldown_days"), 30),
      reward_credits: num(formData.get("reward_credits"), 0),
      discount_percent: Math.max(0, Math.min(100, num(formData.get("discount_percent"), 0))),
      ...(paramKey ? { trigger_params: params } : {}),
    }, { count: "exact" })
    .eq("id", id)
    .eq("kind", "activation");
  const fout = nagekeken(res, "Campagne opslaan");
  if (fout) return fout;
  revalidatePath(`/beheer/activatie/${id}`);
  return { ok: true, message: "Campagne opgeslagen ✓" };
}

export async function setActivationStatus(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const status = formData.get("status");
  const fout = nagekeken(await supabase.from("campaigns").update({ status }, { count: "exact" }).eq("id", id).eq("kind", "activation"), "Campagne wijzigen");
  if (fout) return fout;
  revalidatePath(`/beheer/activatie/${id}`);
  revalidatePath("/beheer/activatie");
  return { ok: true, message: status === "active" ? "Campagne staat aan — de dagelijkse ronde stuurt vanaf nu mee ✓" : "Campagne gepauzeerd — er vertrekt niets meer ✓" };
}

export async function runActivationNow(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const id = formData.get("id");
  const { data: own } = await supabase.from("campaigns").select("id").eq("id", id).maybeSingle(); // RLS scopes to gym
  if (!own) return { error: "Onbekende campagne." };
  const res = await runActivationCampaign(id);
  revalidatePath(`/beheer/activatie/${id}`);
  revalidatePath("/beheer/activatie");
  if (res?.error || res?.message) return res;
  // Nul verstuurd is geen fout, maar zonder uitleg leest het als een knop die niets deed.
  const n = res?.sent || 0, m = res?.matched || 0, t = res?.targets ?? n;
  // Mislukt versturen is wél een fout: die leden kregen niets, en hun eventuele gratis sessie ook niet.
  if (t > n) return { error: `${t - n} van de ${t} mails zijn NIET vertrokken (e-mailfout)${n ? ` — ${n} wel` : ""}. Probeer later opnieuw; wie al een mail kreeg, krijgt er geen tweede.` };
  return { ...res, message: n ? `${n} mail${n === 1 ? "" : "s"} verstuurd (van ${m} leden die matchen) ✓` : m ? `${m} leden matchen, maar ze kregen deze campagne al binnen de wachttijd — niets verstuurd.` : "Er is op dit moment niemand die matcht — niets verstuurd." };
}

export async function deleteActivation(formData) {
  const { supabase, error } = await requireStaff(true);
  if (error) return { error };
  const fout = nagekeken(await supabase.from("campaigns").delete({ count: "exact" }).eq("id", formData.get("id")).eq("kind", "activation"), "Campagne verwijderen");
  if (fout) return fout;
  revalidatePath("/beheer/activatie");
  redirect("/beheer/activatie");
}

// Batch 2.5 — one-click win-back prefabs. Creates two ready-to-review DRAFT campaigns (honest tone,
// no pushy discounts): "We missen je" (inactive ≥14d) and "Abonnement gestopt" (lapsed member, +1
// reward credit). Owner reviews the copy, then flips one toggle to activate — the daily cron does the rest.
export async function createWinbackPrefabs() {
  const { supabase, profile, userId, error } = await requireStaff(true);
  if (error) return { error };
  const drafts = [
    {
      name: "We missen je 👋",
      trigger_type: "inactive",
      trigger_params: { days: 14, min: 4, max: 1 },
      subject: "We missen je bij Fittin' 👋",
      body_html: `<p>Hey {{naam}}, we zagen je al even niet meer in de gym. Alles goed?</p><p>De zaal staat wanneer jij wil klaar — reserveer een uur dat past en pik gewoon weer op waar je gebleven was. Geen lidgeld, je betaalt enkel voor je tijd.</p><p><a href="${SITE_ACT}/boeken" style="background:#5fda6b;color:#22194f;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block">Boek een sessie</a></p>`,
      reward_credits: 0,
      cooldown_days: 45,
    },
    {
      name: "Abonnement gestopt — kom terug",
      trigger_type: "lapsed_member",
      trigger_params: { days: 10, min: 4, max: 1 },
      subject: "Je bent welkom terug bij Fittin' 💚",
      body_html: `<p>Hey {{naam}}, je abonnement is een tijdje geleden gestopt — geen probleem, dat hoort erbij.</p><p>Als welkom-terug zetten we <strong>1 gratis sessie</strong> voor je klaar. Kom eens langs, helemaal vrijblijvend. Boek gewoon een uur dat past en je gratis sessie wordt automatisch verrekend.</p><p><a href="${SITE_ACT}/boeken" style="background:#5fda6b;color:#22194f;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block">Kom terug trainen</a></p>`,
      reward_credits: 1,
      cooldown_days: 90,
    },
  ];
  let created = 0;
  const fouten = [];
  for (const d of drafts) {
    // Skip if a prefab with this exact name already exists for the gym (idempotent — no duplicates).
    const { data: existing } = await supabase.from("campaigns").select("id").eq("gym_id", profile.gym_id).eq("kind", "activation").eq("name", d.name).maybeSingle();
    if (existing) continue;
    const { error: e } = await supabase.from("campaigns").insert({
      gym_id: profile.gym_id,
      kind: "activation",
      name: d.name,
      trigger_type: d.trigger_type,
      trigger_params: d.trigger_params,
      subject: d.subject,
      body_html: d.body_html,
      reward_credits: d.reward_credits,
      discount_percent: 0,
      cooldown_days: d.cooldown_days,
      status: "draft",
      created_by: userId,
    });
    if (e) fouten.push(leesbareFout(e, `"${d.name}"`));
    else created++;
  }
  revalidatePath("/beheer/activatie");
  // Drie uitkomsten die er vroeger allemaal hetzelfde uitzagen (niets): aangemaakt, stonden er al,
  // of mislukt. Wie op "Sjablonen aanmaken" drukt en niets ziet verschijnen, wil weten welke.
  if (fouten.length) return { error: fouten.join(" ") };
  if (!created) return { ok: true, message: "Beide sjablonen stonden er al — er is niets dubbel aangemaakt ✓" };
  return { ok: true, created, message: `${created} sjabloon${created === 1 ? "" : "en"} aangemaakt als concept — lees ze na en zet ze aan ✓` };
}
