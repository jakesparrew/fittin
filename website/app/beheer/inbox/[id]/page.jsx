import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { markRead, archiveInbox } from "../../inbox-actions";
import InboxReply from "@/components/admin/InboxReply";
import GeefDoorAanCoach from "@/components/admin/GeefDoorAanCoach";
import { STATUS_LABEL, STATUS_TOON, feeZin } from "@/lib/aanbreng";

export const dynamic = "force-dynamic";
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Zo schrijft app/(site)/personal-training/actions.js een intake in de inbox: onderwerp
// "PT-intake aanvraag — <naam>" en to_email intake@fittin.be. Beide worden gecontroleerd, want het
// onderwerp is de enige herkenning die een doorgestuurde intake op een ander adres overleeft, en
// het adres de enige die een gewijzigde onderwerpregel overleeft.
const isIntake = (m) => /^PT-intake/i.test(String(m.subject || "")) || m.to_email === "intake@fittin.be";

export default async function InboxItem({ params }) {
  const { id } = await params;
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym, profile } = ctx;
  if (profile.role !== "beheerder") return <div className="px-8 py-8 text-brand/60">Geen toegang.</div>;

  const { data: m } = await supabase.from("inbound_emails").select("*").eq("id", id).eq("gym_id", gym.id).single();
  if (!m) return <div className="px-4 py-6 md:px-8 md:py-8">Bericht niet gevonden. <Link href="/beheer/inbox" className="text-accentdark">← Inbox</Link></div>;
  if (!m.read) { try { await markRead(id); } catch {} }

  // ── Aanbreng: een intake mag hier meteen aan een coach doorgegeven worden ──────────────────
  // Het e-mailadres van de afzender is de sleutel: de prospect heeft nog geen account, dus de
  // doorgave bestaat voor de persoon bestaat (migratie 0152).
  const intake = isIntake(m) && !!m.from_email;
  const clientEmail = String(m.from_email || "").trim().toLowerCase();
  let coaches = [];
  let actief = [];
  let afgehandeld = [];
  let voorkeurCoach = null;
  if (intake) {
    const [{ data: co }, { data: refs }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, coach_accepting_clients").eq("gym_id", gym.id).eq("role", "coach").order("full_name"),
      // eq en geen ilike: geefDoorAanCoach schrijft het adres altijd in kleine letters weg, en een
      // e-mailadres mag een % bevatten — dat zou in een ilike-patroon een joker worden.
      supabase.from("gym_referrals").select("id, coach_id, status, fee_cents, referred_at, ended_at").eq("gym_id", gym.id).eq("client_email", clientEmail).order("referred_at", { ascending: false }),
    ]);
    coaches = co || [];
    actief = (refs || []).filter((r) => !r.ended_at && (r.status === "voorgesteld" || r.status === "aanvaard"));
    afgehandeld = (refs || []).filter((r) => !actief.includes(r));

    // De intake schrijft "Voorkeurcoach: <naam>" als eigen regel in text_body, met een naam die daar
    // uit profiles.full_name kwam — vandaar de exacte vergelijking.
    const gevraagd = String(m.text_body || "").match(/^Voorkeurcoach:[ \t]*(.+)$/m);
    const naam = gevraagd ? gevraagd[1].trim().toLowerCase() : "";
    voorkeurCoach = naam ? coaches.find((c) => String(c.full_name || "").trim().toLowerCase() === naam) : null;
    // Staat die coach zelf niet open voor nieuwe klanten, dan gaat de klant naar iemand anders en
    // deed de gym de matching alsnog. Dan geldt het gewone tarief, niet het voorkeurtarief.
    if (voorkeurCoach && !voorkeurCoach.coach_accepting_clients) voorkeurCoach = null;
  }
  const coachNaam = (cid) => {
    const c = coaches.find((x) => x.id === cid);
    return c?.full_name || c?.email || "een coach";
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="flex items-center justify-between">
        <Link href="/beheer/inbox" className="text-sm font-semibold text-brand/50 hover:text-brand">← Inbox</Link>
        <form action={archiveInbox}><input type="hidden" name="id" value={m.id} /><button className="rounded-full bg-paper px-3 py-1.5 text-xs font-bold text-brand/60 hover:bg-borderc">Archiveren</button></form>
      </div>

      <div className="mt-4 rounded-2xl border border-borderc bg-white p-6">
        <h1 className="text-2xl font-black text-brand">{m.subject}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand/60">
          <span className="font-bold text-brand">{m.from_name || m.from_email}</span>
          <span className="text-brand/40">&lt;{m.from_email}&gt;</span>
          <span className="text-brand/30">→</span>
          <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-bold">{m.to_email}</span>
          <span className="ml-auto text-xs text-brand/40">{fmt(m.received_at)}</span>
        </div>

        <div className="mt-5 border-t border-borderc pt-5">
          {m.html_body ? (
            <iframe title="email" sandbox="" srcDoc={m.html_body} className="h-[460px] w-full rounded-lg border border-borderc bg-white" />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-brand/80">{m.text_body || "(geen inhoud)"}</pre>
          )}
        </div>
      </div>

      {intake && (
        <div className="mt-5">
          {actief.length > 0 ? (
            // Loopt er al een doorgave voor dit adres, dan is doorgeven niet meer de vraag — dan wil
            // je weten waar ze staat. De knop verdwijnt: een tweede doorgave naar dezelfde coach
            // ketst af op de unieke index, en een tweede coach hoort een beslissing te zijn die je
            // op het overzicht neemt, niet terloops vanaf een oud bericht.
            <div className="rounded-2xl border border-borderc bg-white p-5">
              <p className="text-sm font-bold text-brand">Al doorgegeven</p>
              <ul className="mt-3 space-y-2">
                {actief.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-bold text-brand">{coachNaam(r.coach_id)}</span>
                    <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + (STATUS_TOON[r.status] || "bg-paper text-brand/50")}>{STATUS_LABEL[r.status] || r.status}</span>
                    <span className="text-brand/50">{feeZin(r.fee_cents)}</span>
                    <span className="ml-auto text-xs text-brand/40">{fmt(r.referred_at)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/beheer/aanbreng" className="mt-3 inline-block text-xs font-bold text-accentdark hover:underline">Bekijk de doorgaven →</Link>
            </div>
          ) : (
            <>
              {afgehandeld.length > 0 && (
                <p className="mb-2 text-xs text-brand/45">
                  Eerder doorgegeven: {afgehandeld.slice(0, 3).map((r) => `${coachNaam(r.coach_id)} — ${(STATUS_LABEL[r.status] || r.status).toLowerCase()}`).join(" · ")}
                </p>
              )}
              <GeefDoorAanCoach
                coaches={coaches.map((c) => ({ id: c.id, full_name: c.full_name || c.email, accepting: !!c.coach_accepting_clients }))}
                defaultEmail={clientEmail}
                defaultName={m.from_name || ""}
                inboundEmailId={m.id}
                feeCents={voorkeurCoach ? (gym.referral_fee_voorkeur_cents ?? 600) : (gym.referral_fee_cents ?? 600)}
                defaultCoachId={voorkeurCoach?.id || ""}
                voorkeur={!!voorkeurCoach}
              />
            </>
          )}
        </div>
      )}

      <div className="mt-5">
        <InboxReply id={m.id} fromEmail={m.to_email} toName={m.from_name || m.from_email} />
      </div>
    </div>
  );
}
