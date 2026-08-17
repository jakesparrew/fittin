"use server";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { newsletterHtml, enrollMemberInTargetDrip } from "@/lib/newsletter";
import { magOpnieuw, buildAboVoorstel, buildWinback, buildPastdueHulp, buildOpzegBehoud, aboMath } from "@/lib/insight-mails";
import { FROM_NEWS, REPLY_TO } from "@/lib/email";

// Acties achter de inzichten op het dashboard en de beheerlijsten. Owner-doel (2026-08-16):
// "als ik op een inzicht klik, gebeurt er niets — geef me een actiemenu: stuur een voorgeschreven
// mail, zet in een mailcampagne, …". Elk inzicht is hier dus een HANDELING, geen doodlopende link.
//
// Drie vaste regels, telkens met reden:
//  • dedupe van 30 dagen per soort per lid (email_log): één overtuigingsmail is een dienst,
//    twee in dezelfde maand is spam die ook de deurcode-mails de ongewenst-map in duwt;
//  • uitschrijvingen worden gerespecteerd — dit is marketing, geen transactie;
//  • alles wordt gelogd in email_log mét to_user_id, zodat de dedupe op de persoon werkt en
//    het mail-cockpit toont wat er vertrok.

const resendKey = process.env.RESEND_API_KEY;
const resend = resendKey ? new Resend(resendKey) : null;

async function requireBeheerder() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: profile } = await supabase.from("profiles").select("id, gym_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "beheerder") return { error: "Alleen beheerder." };
  return { profile };
}

const PRESETS = {
  abo_voorstel: { bouw: buildAboVoorstel, succes: "Abo-voorstel verstuurd" },
  winback: { bouw: buildWinback, succes: "Comeback-mail verstuurd" },
  pastdue: { bouw: buildPastdueHulp, succes: "Betaalhulp-mail verstuurd" },
  opzeg: { bouw: buildOpzegBehoud, succes: "Waarom-mail verstuurd" },
};

// Cijfers voor de gepersonaliseerde varianten. Eén plek, zodat de mail en het dashboard
// dezelfde definitie gebruiken (60 dagen, enkel bevestigde sessies).
async function ledenCijfers(admin, gymId, memberId) {
  const d60 = new Date(Date.now() - 60 * 86400000).toISOString();
  const [{ data: bk60 }, { data: laatste }] = await Promise.all([
    admin.from("bookings").select("payment_source").eq("gym_id", gymId).eq("user_id", memberId)
      .eq("status", "bevestigd").gte("starts_at", d60).lte("starts_at", new Date().toISOString()),
    admin.from("bookings").select("starts_at").eq("gym_id", gymId).eq("user_id", memberId)
      .eq("status", "bevestigd").lte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const los = (bk60 || []).filter((b) => b.payment_source === "los").length;
  const kaart = (bk60 || []).filter((b) => b.payment_source === "credit").length;
  const { count: ooit } = await admin.from("bookings").select("id", { count: "exact", head: true })
    .eq("gym_id", gymId).eq("user_id", memberId).eq("status", "bevestigd");
  return { math: aboMath({ los, kaart }), laatsteBezoek: laatste?.starts_at || null, sessiesOoit: ooit || 0 };
}

export async function sendInsightPreset(formData) {
  const { profile, error } = await requireBeheerder();
  if (error) return { error };
  if (!resend) return { error: "E-mail is niet geconfigureerd." };
  const memberId = String(formData.get("memberId") || "");
  const preset = PRESETS[String(formData.get("preset") || "")];
  if (!memberId || !preset) return { error: "Onbekende actie." };

  const admin = createAdminClient();
  const { data: lid } = await admin.from("profiles")
    .select("id, full_name, email, is_test").eq("id", memberId).eq("gym_id", profile.gym_id).single();
  if (!lid?.email) return { error: "Lid niet gevonden of zonder e-mailadres." };
  if (lid.is_test) return { error: "Testaccount — geen mails sturen." };

  // Marketing → uitschrijving respecteren.
  const { data: sub } = await admin.from("subscribers")
    .select("unsub_token, status").eq("gym_id", profile.gym_id).eq("email", lid.email.toLowerCase()).maybeSingle();
  if (sub && sub.status !== "active") return { error: "Dit lid schreef zich uit voor mails." };

  const extra = await ledenCijfers(admin, profile.gym_id, memberId);
  const mail = preset.bouw({ name: lid.full_name, ...extra, eindDatum: formData.get("eindDatum") || null });

  // Dedupe: zelfde soort naar zelfde lid max. 1× per 30 dagen.
  const { data: eerder } = await admin.from("email_log")
    .select("created_at").eq("to_user_id", memberId).eq("kind", mail.kind).eq("status", "sent")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (eerder && !magOpnieuw(eerder.created_at)) {
    const dag = new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long" }).format(new Date(eerder.created_at));
    return { error: `Al verstuurd op ${dag} — dezelfde mail kan pas 30 dagen later opnieuw.` };
  }

  const html = newsletterHtml({
    subject: mail.subject,
    preheader: mail.preheader,
    body: mail.body + (mail.cta ? `<p style="margin:18px 0 4px"><a href="${mail.cta.href}" style="display:inline-block;background:#22194F;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;font-size:14px">${mail.cta.label}</a></p>` : ""),
    unsubUrl: sub?.unsub_token ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/uitschrijven?token=${sub.unsub_token}` : `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/uitschrijven`,
  });

  let status = "sent", resendId = null, sendErr = null;
  try {
    const res = await resend.emails.send({ from: FROM_NEWS, to: lid.email, replyTo: REPLY_TO, subject: mail.subject, html });
    if (res?.error) { status = "failed"; sendErr = res.error?.message || JSON.stringify(res.error); }
    else resendId = res?.data?.id || null;
  } catch (e) { status = "failed"; sendErr = e?.message; }

  // Loggen mét to_user_id — de dedupe hierboven leunt erop.
  try {
    await admin.from("email_log").insert({
      gym_id: profile.gym_id, to_email: lid.email, to_user_id: memberId,
      kind: mail.kind, subject: mail.subject, status, resend_id: resendId,
      error: sendErr ? String(sendErr).slice(0, 500) : null,
    });
  } catch {}

  if (status === "failed") return { error: `Versturen mislukt: ${sendErr}` };
  revalidatePath("/beheer");
  return { ok: true, message: `${preset.succes} naar ${lid.full_name || lid.email} ✓` };
}

export async function enrollInsightDrip(formData) {
  const { profile, error } = await requireBeheerder();
  if (error) return { error };
  const memberId = String(formData.get("memberId") || "");
  const reeks = String(formData.get("reeks") || "");
  if (!memberId || !["abo_reeks", "comeback_reeks"].includes(reeks)) return { error: "Onbekende reeks." };
  const admin = createAdminClient();
  const { data: lid } = await admin.from("profiles").select("full_name, is_test").eq("id", memberId).eq("gym_id", profile.gym_id).single();
  if (!lid) return { error: "Lid niet gevonden." };
  if (lid.is_test) return { error: "Testaccount — geen mails sturen." };
  const r = await enrollMemberInTargetDrip(profile.gym_id, memberId, reeks);
  if (r.error) return r;
  revalidatePath("/beheer");
  return { ok: true, message: `${lid.full_name || "Lid"} zit in de ${reeks === "abo_reeks" ? "abo-reeks (3 mails / 8 dagen)" : "comeback-reeks (2 mails / 5 dagen)"} ✓` };
}

// Verberg een inzicht-kaart voor dit lid, standaard 60 dagen. Geen verwijdering: na de termijn
// mag de kaart terugkomen, want tegen dan kan de situatie veranderd zijn.
export async function snoozeInsight(formData) {
  const { profile, error } = await requireBeheerder();
  if (error) return { error };
  const memberId = String(formData.get("memberId") || "");
  const kind = String(formData.get("kind") || "");
  const dagen = Math.min(365, Math.max(1, parseInt(formData.get("dagen") || "60", 10) || 60));
  if (!memberId || !kind) return { error: "Onbekende actie." };
  const admin = createAdminClient();
  const until = new Date(Date.now() + dagen * 86400000).toISOString();
  const { error: e } = await admin.from("insight_snoozes")
    .upsert({ gym_id: profile.gym_id, kind, user_id: memberId, until, created_by: profile.id }, { onConflict: "gym_id,kind,user_id" });
  if (e) return { error: e.message };
  revalidatePath("/beheer");
  return { ok: true, message: `Verborgen tot over ${dagen} dagen ✓` };
}

// Bulk: alle at-risk leden in de comeback-reeks.
// Idempotent — wie er al in zit of uitgeschreven is, wordt overgeslagen met een telling.
//
// De doelgroep is EXACT dezelfde als wat /beheer/leden?filter=atrisk toont, anders mailt deze knop
// mensen die de eigenaar nooit in de lijst zag staan: al minstens één keer getraind, meer dan 30
// dagen stil, en niets meer in de agenda. Wie nog nooit boekte hoort in de onboarding-reeks — een
// comeback-mail die naar zijn "vorige bezoek" verwijst klopt daar gewoon niet.
export async function enrollAllAtRiskInComeback() {
  const { profile, error } = await requireBeheerder();
  if (error) return { error };
  const admin = createAdminClient();
  const nu = Date.now();
  const d30 = nu - 30 * 86400000;
  const [{ data: leden }, { data: sessies }] = await Promise.all([
    admin.from("profiles").select("id, is_test").eq("gym_id", profile.gym_id).eq("role", "lid"),
    admin.from("bookings").select("user_id, starts_at").eq("gym_id", profile.gym_id).eq("status", "bevestigd"),
  ]);
  const laatste = new Map(), komtNog = new Set();
  for (const b of sessies || []) {
    if (!b.user_id) continue;
    const t = new Date(b.starts_at).getTime();
    if (t > nu) komtNog.add(b.user_id);
    else if (t > (laatste.get(b.user_id) || 0)) laatste.set(b.user_id, t);
  }
  const doelwitten = (leden || []).filter(
    (m) => !m.is_test && laatste.has(m.id) && !komtNog.has(m.id) && laatste.get(m.id) < d30
  );

  let gestart = 0, overgeslagen = 0;
  for (const m of doelwitten) {
    const r = await enrollMemberInTargetDrip(profile.gym_id, m.id, "comeback_reeks");
    if (r.ok) gestart++;
    else overgeslagen++;
  }
  revalidatePath("/beheer");
  revalidatePath("/beheer/leden");
  return { ok: true, message: `Comeback-reeks gestart voor ${gestart} leden (${overgeslagen} overgeslagen: zaten er al in of zijn uitgeschreven) ✓` };
}
