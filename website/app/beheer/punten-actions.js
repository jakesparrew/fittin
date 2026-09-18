"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { nagekeken, leesbareFout } from "@/lib/uitkomst";
import { WAARDEN } from "@/lib/punten";
import { draaiPuntenmotor, herberekenRustigeUren } from "@/lib/punten-motor";
import { laadInstellingen, alles } from "@/lib/punten-db";
import { notify } from "@/lib/notify";

// Beheer → Punten. Elke wijziging raakt geld (gratis sessies) en wordt daarom gelogd in gamification_log.
// Een nieuwe waarde geldt vanaf nu: elke puntenrij bewaart de waarde van het moment waarop ze verdiend werd.

const getal = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export async function bewaarPuntenInstellingen(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const admin = createAdminClient();
  const oud = await laadInstellingen(admin, profile.gym_id);
  if (!oud) return { error: "Geen puntinstellingen voor deze gym." };

  const waarden = {};
  for (const k of Object.keys(WAARDEN)) {
    const v = formData.get(`w_${k}`);
    if (v === null || v === "") continue;
    const n = getal(v, 0, k === "rustig_factor" ? 5 : 1000);
    if (n === null) return { error: `Ongeldige waarde voor "${k}".` };
    if (n !== WAARDEN[k]) waarden[k] = n; // enkel afwijkingen bewaren
  }
  const velden = {
    aan: formData.get("aan") === "on",
    rustig_aan: formData.get("rustig_aan") === "on",
    prijs_sessie: getal(formData.get("prijs_sessie"), 50, 5000),
    max_gym_maand: getal(formData.get("max_gym_maand"), 0, 500),
    max_aanbreng_maand: getal(formData.get("max_aanbreng_maand"), 0, 500),
    max_per_lid_maand: getal(formData.get("max_per_lid_maand"), 0, 10),
    verval_maanden: getal(formData.get("verval_maanden"), 1, 60),
    rustig_max_weken: getal(formData.get("rustig_max_weken"), 0, 8),
    druk_min_weken: getal(formData.get("druk_min_weken"), 1, 8),
  };
  for (const [k, v] of Object.entries(velden)) if (v === null) return { error: `Ongeldige waarde voor "${k}".` };
  if (velden.rustig_max_weken >= velden.druk_min_weken) return { error: "'Rustig tot' moet kleiner zijn dan 'druk vanaf'." };

  const nieuw = { ...velden, waarden, updated_at: new Date().toISOString(), updated_by: profile.id };
  const fout = nagekeken(await admin.from("gamification_settings").update(nieuw, { count: "exact" }).eq("gym_id", profile.gym_id), "Instellingen bewaren");
  if (fout) return fout;
  const verschil = {};
  for (const k of Object.keys(velden)) if (oud[k] !== velden[k]) verschil[k] = [oud[k], velden[k]];
  if (JSON.stringify(oud.waarden || {}) !== JSON.stringify(waarden)) verschil.waarden = [oud.waarden || {}, waarden];
  const { error: le } = await admin.from("gamification_log").insert({ gym_id: profile.gym_id, door: profile.id, wat: "instellingen", details: verschil });
  if (le) console.error("gamification_log:", le.message);
  revalidatePath("/beheer/punten");
  const n = Object.keys(verschil).length;
  return { ok: true, message: n ? `${n} instelling${n === 1 ? "" : "en"} aangepast — geldt vanaf nu ✓` : "Niets veranderd ✓" };
}

// Punten bij- of afzetten met de hand. Altijd met een reden; het lid ziet "Aanpassing door Fittin'" + de reden.
export async function puntenCorrectie(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const userId = String(formData.get("userId") || "");
  const punten = getal(formData.get("punten"), -5000, 5000);
  const reden = String(formData.get("reden") || "").trim().slice(0, 200);
  if (!punten) return { error: "Geef een aantal punten (bv. 20 of -20)." };
  if (reden.length < 3) return { error: "Geef een reden — het lid ziet ze in zijn geschiedenis." };
  const admin = createAdminClient();
  const { data: lid } = await admin.from("profiles").select("id, full_name, gym_id").eq("id", userId).eq("gym_id", profile.gym_id).maybeSingle();
  if (!lid) return { error: "Lid niet gevonden." };
  const id = crypto.randomUUID();
  const { error: ie } = await admin.from("member_points").insert({
    id, gym_id: profile.gym_id, user_id: lid.id, kind: "handmatig", points: punten, source_key: `handmatig:${id}`,
    meta: { reden, door: profile.id },
  });
  if (ie) return { error: leesbareFout(ie, "Punten aanpassen") };
  const { error: le } = await admin.from("gamification_log").insert({ gym_id: profile.gym_id, door: profile.id, wat: "correctie", details: { lid: lid.id, punten, reden } });
  if (le) console.error("gamification_log:", le.message);
  await notify({ gymId: profile.gym_id, userId: lid.id, type: "system", title: `${punten > 0 ? "+" : ""}${punten} punten van Fittin'`, body: reden, link: "/account/punten" });
  revalidatePath("/beheer/punten");
  revalidatePath(`/beheer/leden/${lid.id}`);
  return { ok: true, message: `${punten > 0 ? "+" : ""}${punten} punten voor ${lid.full_name || "het lid"} — verwittigd ✓` };
}

// Een uur-van-de-week vastpinnen: altijd rustig (promotie), nooit, of weer automatisch.
export async function pinUur(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const dow = getal(formData.get("dow"), 1, 7), hour = getal(formData.get("hour"), 0, 23);
  const p = String(formData.get("pin") || "");
  const pin = p === "altijd" || p === "nooit" ? p : null;
  if (!dow || hour === null) return { error: "Ongeldig uur." };
  const admin = createAdminClient();
  const { error: e } = await admin.from("slot_demand").upsert({ gym_id: profile.gym_id, dow, hour, pin }, { onConflict: "gym_id,dow,hour" });
  if (e) return { error: leesbareFout(e, "Uur vastpinnen") };
  const dag = ["", "ma", "di", "wo", "do", "vr", "za", "zo"][dow];
  revalidatePath("/beheer/punten");
  return { ok: true, message: pin === "altijd" ? `${dag} ${hour}:00 is nu altijd een rustig uur ✓` : pin === "nooit" ? `${dag} ${hour}:00 krijgt nooit promotie ✓` : `${dag} ${hour}:00 volgt weer de automatische regel ✓` };
}

// De motor meteen laten lopen (anders elk uur): na een instellingswijziging of om te testen.
export async function puntenNuBijwerken() {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const admin = createAdminClient();
  const s = await laadInstellingen(admin, profile.gym_id);
  if (!s) return { error: "Geen puntinstellingen." };
  const boekingen = await alles(() => admin.from("bookings").select("starts_at, ends_at, status").eq("gym_id", profile.gym_id)
    .gte("starts_at", new Date(Date.now() - 60 * 86400000).toISOString()));
  await herberekenRustigeUren(admin, s, boekingen, new Date(), { forceer: true });
  const res = await draaiPuntenmotor(admin);
  const mijn = res.find((r) => r.gym === profile.gym_id) || {};
  if (mijn.fout) return { error: `Bijwerken mislukt: ${mijn.fout}` };
  revalidatePath("/beheer/punten");
  return { ok: true, message: `Bijgewerkt: ${mijn.nieuw || 0} nieuwe puntenrijen, ${mijn.badges || 0} badges, rustige uren herberekend ✓` };
}
