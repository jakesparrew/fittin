"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Nieuwsbrief aan/uit vanuit het account zelf. Voorheen kon een lid zich enkel uitschrijven via de
// link onderaan een ontvangen mail — wie die mail weggooide, had geen knop meer. Terug AANzetten
// kon zelfs helemaal niet.
//
// Belangrijk (en zo staat het ook in de tekst bij de knop): dit raakt ALLEEN nieuwsbrieven en
// aanbiedingen. Inloglinks, boekingsbevestigingen, deurcodes, betaalbewijzen en facturen blijven
// altijd komen — dat zijn geen reclamemails maar berichten die bij de dienst zelf horen, en zonder
// deurcode raak je de gym niet binnen.
export async function setNewsletterOptIn(formData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: prof } = await supabase.from("profiles").select("gym_id, email, full_name").eq("id", user.id).single();
  if (!prof?.email) return { error: "Geen e-mailadres op je account." };

  const aan = String(formData.get("aan") || "") === "1";
  const admin = createAdminClient();
  const mail = prof.email.toLowerCase();

  // Een bounce niet stilzwijgend naar 'active' terugzetten: dan blijven we mailen naar een adres
  // dat weigert, wat de afzenderreputatie sloopt. Enkel de bewuste uitschrijving is omkeerbaar.
  const { data: bestaand } = await admin.from("subscribers").select("status").eq("gym_id", prof.gym_id).eq("email", mail).maybeSingle();
  if (aan && bestaand?.status === "bounced") {
    return { error: "Mails naar dit adres kwamen niet aan. Contacteer info@fittin.be zodat we het nakijken." };
  }

  const { error } = await admin.from("subscribers").upsert(
    { gym_id: prof.gym_id, email: mail, name: prof.full_name, source: "account", status: aan ? "active" : "unsubscribed" },
    { onConflict: "gym_id,email" }
  );
  if (error) return { error: error.message };

  // Uitschrijven → nog geplande reeks-mails afzeggen, anders komen die tóch nog binnen.
  if (!aan) {
    try {
      const { data: sub } = await admin.from("subscribers").select("id").eq("gym_id", prof.gym_id).eq("email", mail).maybeSingle();
      if (sub) {
        const { data: pending } = await admin.from("campaign_sends").select("id, resend_id").eq("subscriber_id", sub.id).eq("status", "scheduled");
        if (pending?.length) {
          const { Resend } = await import("resend");
          const r = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
          for (const p of pending) {
            if (p.resend_id && r) { try { await r.emails.cancel(p.resend_id); } catch {} }
            await admin.from("campaign_sends").update({ status: "skipped" }).eq("id", p.id);
          }
        }
        await admin.from("drip_enrollments").update({ status: "cancelled" }).eq("subscriber_id", sub.id).eq("status", "active");
      }
    } catch (e) { console.error("cancel pending on opt-out:", e?.message); }
  }

  revalidatePath("/account");
  return { ok: true, message: aan ? "Je ontvangt weer nieuwsbrieven ✓" : "Uitgeschreven voor nieuwsbrieven ✓" };
}
