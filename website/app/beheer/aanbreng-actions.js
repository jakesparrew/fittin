"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { sendReferralProposal } from "@/lib/email";
import { beurtenVoor, FEE_MAX_CENTS, feeZin } from "@/lib/aanbreng";

// Aanbrengvergoeding — alles wat de beheerder doet. De coachkant staat in app/coach/actions.js.
//
// Schrijven gebeurt altijd via de service-role NA een requireStaff-controle: gym_referrals heeft
// bewust alleen een select-policy, zodat er geen tweede schrijfweg bestaat die iemand later per
// ongeluk kan openzetten.

const cents = (v) => {
  const n = Math.round(parseFloat(String(v ?? "").replace(",", ".")) * 100);
  return Number.isFinite(n) ? n : null;
};
const posInt = (v) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function vernieuw(extra = []) {
  revalidatePath("/beheer/aanbreng");
  revalidatePath("/beheer/coaches", "layout");
  for (const p of extra) revalidatePath(p);
}

// ── De doorgave maken ─────────────────────────────────────────────────────────────
// Kan vanaf een intake in de inbox (bron 'intake', met inboundEmailId) of handmatig. Het
// e-mailadres is de sleutel: de klant heeft vaak nog geen account, en de koppeling gebeurt
// automatisch zodra dat er is (trigger link_referral_to_profile, migratie 0152).
export async function geefDoorAanCoach(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const coachId = String(formData.get("coachId") || "");
  const clientEmail = String(formData.get("clientEmail") || "").trim().toLowerCase();
  const clientName = String(formData.get("clientName") || "").trim().slice(0, 120) || null;
  const source = formData.get("source") === "manueel" ? "manueel" : "intake";
  const inboundEmailId = String(formData.get("inboundEmailId") || "") || null;
  const note = String(formData.get("note") || "").trim().slice(0, 500) || null;
  const sessionsCap = posInt(formData.get("sessionsCap"));
  const monthsCap = posInt(formData.get("monthsCap"));

  if (!coachId) return { error: "Kies een coach." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clientEmail)) return { error: "Vul een geldig e-mailadres van de klant in." };

  const admin = createAdminClient();
  const { data: gym } = await admin.from("gyms").select("id, referral_fee_cents").eq("id", profile.gym_id).single();
  const fee = cents(formData.get("feeEur")) ?? gym?.referral_fee_cents ?? 600;
  if (fee < 0 || fee > FEE_MAX_CENTS) return { error: `Het tarief moet tussen € 0 en € ${FEE_MAX_CENTS / 100} liggen.` };

  const { data: coach } = await admin
    .from("profiles")
    .select("id, full_name, email, role, gym_id, coach_accepting_clients")
    .eq("id", coachId)
    .eq("gym_id", profile.gym_id)
    .maybeSingle();
  if (!coach || !["coach", "beheerder"].includes(coach.role)) return { error: "Onbekende coach." };
  if (!coach.coach_accepting_clients) return { error: `${coach.full_name || "Deze coach"} staat op "geen nieuwe klanten". Vraag het hem eerst.` };

  // Bestaat het account al, dan koppelen we meteen — anders doet de trigger dat later.
  const { data: bestaand } = await admin.from("profiles").select("id").eq("gym_id", profile.gym_id).ilike("email", clientEmail).maybeSingle();

  const { data: rij, error: e } = await admin
    .from("gym_referrals")
    .insert({
      gym_id: profile.gym_id,
      coach_id: coachId,
      client_id: bestaand?.id || null,
      client_email: clientEmail,
      client_name: clientName,
      source,
      fee_cents: fee,
      sessions_cap: sessionsCap,
      months_cap: monthsCap,
      inbound_email_id: inboundEmailId,
      created_by: profile.id,
      note,
    })
    .select("id")
    .single();
  if (e) {
    if (/gym_referrals_actief_uniek|duplicate key/i.test(e.message)) {
      return { error: "Er loopt al een doorgave van deze klant naar deze coach." };
    }
    return { error: e.message };
  }

  // De coach moet dit expliciet aanvaarden — die aanvaarding IS de afspraak. Zonder aanvaarding
  // wordt er niets aangerekend.
  try {
    await notify({
      gymId: profile.gym_id,
      userId: coachId,
      actorId: profile.id,
      type: "system",
      title: `Nieuwe klant van Fittin': ${clientName || clientEmail}`,
      body: `${feeZin(fee)} — aanvaarden of weigeren bij Mijn clienten.`,
      link: "/coach/clienten",
    });
  } catch (err) { console.error("aanbreng notify:", err?.message); }
  if (coach.email) {
    try {
      await sendReferralProposal({ to: coach.email, coachName: coach.full_name, clientName, clientEmail, feeCents: fee, note });
    } catch (err) { console.error("aanbreng mail:", err?.message); }
  }

  vernieuw(["/beheer/inbox", inboundEmailId ? `/beheer/inbox/${inboundEmailId}` : "/beheer/inbox"]);
  return { ok: true, message: `Doorgegeven aan ${coach.full_name || "de coach"} ✓ — hij moet nog aanvaarden.`, referralId: rij.id };
}

// ── Tarief en plafonds bijstellen ─────────────────────────────────────────────────
// Werkt vanaf nu: al aangerekende beurten blijven staan. Zo blijft de historiek kloppen met wat de
// coach op dat moment aanvaardde.
export async function wijzigDoorgave(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const id = String(formData.get("referralId") || "");
  if (!id) return { error: "Geen doorgave." };
  const fee = cents(formData.get("feeEur"));
  if (fee === null) return { error: "Vul een tarief in." };
  if (fee < 0 || fee > FEE_MAX_CENTS) return { error: `Het tarief moet tussen € 0 en € ${FEE_MAX_CENTS / 100} liggen.` };

  const admin = createAdminClient();
  const { data: oud } = await admin.from("gym_referrals").select("id, coach_id, fee_cents, client_name, client_email").eq("id", id).eq("gym_id", profile.gym_id).maybeSingle();
  if (!oud) return { error: "Doorgave niet gevonden." };

  const { error: e } = await admin
    .from("gym_referrals")
    .update({ fee_cents: fee, sessions_cap: posInt(formData.get("sessionsCap")), months_cap: posInt(formData.get("monthsCap")) })
    .eq("id", id)
    .eq("gym_id", profile.gym_id);
  if (e) return { error: e.message };

  // Een tariefwijziging raakt de portemonnee van de coach — die hoort dat te weten, niet te ontdekken.
  if (fee !== oud.fee_cents) {
    try {
      await notify({
        gymId: profile.gym_id, userId: oud.coach_id, actorId: profile.id, type: "system",
        title: `Tarief gewijzigd voor ${oud.client_name || oud.client_email}`,
        body: `Vanaf nu ${feeZin(fee)}.`, link: "/coach/clienten",
      });
    } catch {}
  }
  vernieuw();
  return { ok: true, message: "Doorgave bijgewerkt ✓" };
}

export async function beeindigDoorgave(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const id = String(formData.get("referralId") || "");
  const reden = String(formData.get("reason") || "").trim().slice(0, 300) || null;
  if (!id) return { error: "Geen doorgave." };
  const admin = createAdminClient();
  const { data: r } = await admin.from("gym_referrals").select("id, coach_id, client_name, client_email").eq("id", id).eq("gym_id", profile.gym_id).maybeSingle();
  if (!r) return { error: "Doorgave niet gevonden." };
  // Niet wissen: de rij blijft het bewijs onder elke reeds aangerekende beurt.
  const { error: e } = await admin
    .from("gym_referrals")
    .update({ status: "beeindigd", ended_at: new Date().toISOString(), ended_by: profile.id, ended_reason: reden })
    .eq("id", id)
    .eq("gym_id", profile.gym_id);
  if (e) return { error: e.message };
  try {
    await notify({
      gymId: profile.gym_id, userId: r.coach_id, actorId: profile.id, type: "system",
      title: `Aanbreng gestopt voor ${r.client_name || r.client_email}`,
      body: "Nieuwe sessies met deze klant kosten je geen extra beurt meer.", link: "/coach/clienten",
    });
  } catch {}
  vernieuw();
  return { ok: true, message: "Doorgave beëindigd ✓" };
}

// ── "Wat als een coach de client niet zet?" ───────────────────────────────────────
// Dan staat de sessie als gereserveerd uur op zijn eigen naam en ziet de trigger niets. De
// controlelijst in /beheer/aanbreng zet die sessies bovenaan; hieronder de twee knoppen die
// erbij horen. Er wordt nooit automatisch aangerekend — een coach mag op datzelfde uur met een
// eigen klant trainen, en een systeem dat dat zelf beslist, is erger dan het gat.
export async function rekenAanbrengAan(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const bookingId = String(formData.get("bookingId") || "");
  const referralId = String(formData.get("referralId") || "");
  if (!bookingId || !referralId) return { error: "Kies de sessie en de klant." };

  const admin = createAdminClient();
  const [{ data: bk }, { data: ref }] = await Promise.all([
    admin.from("bookings").select("id, gym_id, coach_id, status, starts_at").eq("id", bookingId).eq("gym_id", profile.gym_id).maybeSingle(),
    admin.from("gym_referrals").select("id, coach_id, fee_cents, client_name, client_email").eq("id", referralId).eq("gym_id", profile.gym_id).maybeSingle(),
  ]);
  if (!bk || !ref) return { error: "Sessie of doorgave niet gevonden." };
  if (bk.coach_id !== ref.coach_id) return { error: "Deze sessie is niet van die coach." };
  if (bk.status !== "bevestigd") return { error: "Deze sessie is geannuleerd — er valt niets aan te rekenen." };

  // Dezelfde netto-regel als de trigger: staat er al iets open op deze boeking, dan niet nog eens.
  const { data: bestaand } = await admin.from("coach_ledger").select("delta").eq("ref_id", bookingId).in("reason", ["aanbreng", "aanbreng_terug"]);
  const netto = (bestaand || []).reduce((a, r) => a + Number(r.delta || 0), 0);
  if (netto < 0) return { error: "Voor deze sessie is de aanbreng al aangerekend." };

  const beurten = beurtenVoor(ref.fee_cents);
  if (beurten <= 0) return { error: "Het tarief van deze doorgave is € 0." };
  const { error: e } = await admin.from("coach_ledger").insert({
    gym_id: profile.gym_id, coach_id: bk.coach_id, delta: -beurten, reason: "aanbreng", ref_id: bookingId, referral_id: referralId,
  });
  if (e) return { error: e.message };
  await admin.from("gym_referral_checks").upsert(
    { booking_id: bookingId, gym_id: profile.gym_id, checked_by: profile.id, note: "handmatig aangerekend" },
    { onConflict: "booking_id" }
  );
  try {
    await notify({
      gymId: profile.gym_id, userId: bk.coach_id, actorId: profile.id, type: "system",
      title: `Aanbreng aangerekend voor ${ref.client_name || ref.client_email}`,
      body: `Sessie van ${new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "long" }).format(new Date(bk.starts_at))} — ${feeZin(ref.fee_cents)}. Klopt dat niet? Laat het weten.`,
      link: "/coach",
    });
  } catch {}
  vernieuw(["/coach"]);
  return { ok: true, message: "Aangerekend ✓" };
}

export async function markeerNagekeken(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const bookingId = String(formData.get("bookingId") || "");
  if (!bookingId) return { error: "Geen sessie." };
  const { error: e } = await createAdminClient().from("gym_referral_checks").upsert(
    { booking_id: bookingId, gym_id: profile.gym_id, checked_by: profile.id, note: String(formData.get("note") || "").trim().slice(0, 300) || "geen aanbreng" },
    { onConflict: "booking_id" }
  );
  if (e) return { error: e.message };
  vernieuw();
  return { ok: true, message: "Afgevinkt ✓" };
}

// Een aangerekende beurt terugschenken. Positieve delta, eigen reden — de aanrekening blijft
// staan, zodat je later nog ziet wat er gebeurd is en waarom.
export async function scheldAanbrengKwijt(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const referralId = String(formData.get("referralId") || "");
  const beurten = Math.round(parseFloat(String(formData.get("beurten") || "").replace(",", ".")) * 100) / 100;
  if (!referralId) return { error: "Geen doorgave." };
  if (!Number.isFinite(beurten) || beurten <= 0) return { error: "Geef het aantal beurten op (bv. 0,5)." };
  const admin = createAdminClient();
  const { data: ref } = await admin.from("gym_referrals").select("id, coach_id, client_name, client_email").eq("id", referralId).eq("gym_id", profile.gym_id).maybeSingle();
  if (!ref) return { error: "Doorgave niet gevonden." };
  const { error: e } = await admin.from("coach_ledger").insert({
    gym_id: profile.gym_id, coach_id: ref.coach_id, delta: beurten, reason: "kwijtschelding", referral_id: referralId,
  });
  if (e) return { error: e.message };
  try {
    await notify({
      gymId: profile.gym_id, userId: ref.coach_id, actorId: profile.id, type: "system",
      title: "Aanbreng kwijtgescholden",
      body: `${String(beurten).replace(".", ",")} beurt teruggezet op je tegoed (${ref.client_name || ref.client_email}).`, link: "/coach",
    });
  } catch {}
  vernieuw(["/coach"]);
  return { ok: true, message: "Kwijtgescholden ✓" };
}

// ── Instellingen ──────────────────────────────────────────────────────────────────
export async function zetVerplichteClient(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const coachId = String(formData.get("coachId") || "");
  if (!coachId) return { error: "Geen coach." };
  const aan = formData.get("aan") === "1";
  const { error: e } = await createAdminClient()
    .from("profiles").update({ coach_require_client: aan })
    .eq("id", coachId).eq("gym_id", profile.gym_id).in("role", ["coach", "beheerder"]);
  if (e) return { error: e.message };
  vernieuw(["/coach"]);
  return { ok: true, message: aan ? "Client is nu verplicht bij elke boeking ✓" : "Verplichting uitgezet ✓" };
}

export async function bewaarAanbrengInstellingen(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const standaard = cents(formData.get("feeEur"));
  const voorkeur = cents(formData.get("feeVoorkeurEur"));
  if (standaard === null || voorkeur === null) return { error: "Vul beide tarieven in." };
  if ([standaard, voorkeur].some((c) => c < 0 || c > FEE_MAX_CENTS)) return { error: `Tarieven moeten tussen € 0 en € ${FEE_MAX_CENTS / 100} liggen.` };
  const { error: e } = await createAdminClient()
    .from("gyms").update({ referral_fee_cents: standaard, referral_fee_voorkeur_cents: voorkeur })
    .eq("id", profile.gym_id);
  if (e) return { error: e.message };
  vernieuw();
  return { ok: true, message: "Instellingen opgeslagen ✓" };
}
