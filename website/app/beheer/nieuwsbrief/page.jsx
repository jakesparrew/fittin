import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createNewsletter, createDrip, createOnboardingDrip } from "../newsletter-actions";
import QuickStart from "@/components/admin/QuickStart";

export const dynamic = "force-dynamic";

const fmt = (iso) => (iso ? new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) + "%" : "—");
const STATUS = {
  draft: ["Concept", "bg-paper text-brand/60"],
  scheduled: ["Gepland", "bg-accent/15 text-accentdark"],
  sending: ["Verzenden…", "bg-accent/15 text-accentdark"],
  sent: ["Verzonden", "bg-brand/10 text-brand"],
  active: ["Actief", "bg-accent/20 text-accentdark"],
  paused: ["Gepauzeerd", "bg-paper text-brand/50"],
};

export default async function Newsletter() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym } = ctx;

  const [{ count: subActive }, { data: campaigns }] = await Promise.all([
    supabase.from("subscribers").select("id", { count: "exact", head: true }).eq("gym_id", gym.id).eq("status", "active"),
    supabase.from("campaigns").select("*").eq("gym_id", gym.id).in("kind", ["newsletter", "drip"]).order("created_at", { ascending: false }),
  ]);

  const sentCampaigns = (campaigns || []).filter((c) => c.kind === "newsletter" && c.status === "sent");
  const totSent = sentCampaigns.reduce((a, c) => a + (c.sent || 0), 0);
  const totOpened = sentCampaigns.reduce((a, c) => a + (c.opened || 0), 0);

  return (
    <div className="px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-brand">Nieuwsbrief & campagnes</h1>
          <p className="mt-1 text-sm text-brand/50">Verzend nieuwsbrieven, automatiseer drips en volg de resultaten.</p>
        </div>
        <Link href="/beheer/nieuwsbrief/abonnees" className="rounded-full bg-paper px-4 py-2 text-sm font-bold text-brand transition hover:bg-accent/15">
          Abonnees beheren →
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Actieve abonnees" value={subActive ?? 0} />
        <Stat label="Verzonden e-mails" value={totSent} />
        <Stat label="Gem. open rate" value={pct(totOpened, totSent)} />
      </div>

      <QuickStart title="Kies hoe je begint" defaultOpen={!campaigns || campaigns.length === 0} steps={[
        { title: "Kant-en-klare onboarding-reeks", body: "in één klik een bewezen reeks van 5 mails die nieuwe leden door alle functies leidt (boeken, buddies, coach, abonnement, events)." },
        { title: "Eigen drip", body: "bouw zelf een reeks met je eigen stappen en wachttijden." },
        { title: "Losse nieuwsbrief", body: "een eenmalige mail naar al je abonnees." },
      ]} />

      {/* Premade sequence — one click */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-accent/40 bg-accent/5 p-5">
        <div>
          <p className="font-black text-brand">✨ Fittin&rsquo; onboarding-reeks</p>
          <p className="mt-0.5 text-sm text-brand/60">5 kant-en-klare, converterende mails die nieuwe leden alle functies laten ontdekken — verspreid over ~2 weken.</p>
        </div>
        <form action={createOnboardingDrip}>
          <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">Maak deze reeks aan</button>
        </form>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <form action={createNewsletter} className="rounded-2xl border border-borderc bg-white p-5">
          <p className="font-black text-brand">Nieuwe nieuwsbrief</p>
          <p className="mt-0.5 text-xs text-brand/50">Eenmalige mail naar alle abonnees.</p>
          <div className="mt-3 flex gap-2">
            <input name="name" required placeholder="Titel (intern)" className="flex-1 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
            <button className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">Opstellen</button>
          </div>
        </form>
        <form action={createDrip} className="rounded-2xl border border-borderc bg-white p-5">
          <p className="font-black text-brand">Nieuwe drip-campagne</p>
          <p className="mt-0.5 text-xs text-brand/50">Reeks mails, automatisch bij nieuwe inschrijving.</p>
          <div className="mt-3 flex gap-2">
            <input name="name" required placeholder="Naam (bv. Welkomstreeks)" className="flex-1 rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
            <button className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-brand">Aanmaken</button>
          </div>
        </form>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-borderc bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs font-bold uppercase tracking-wide text-lav">
            <tr>
              <th className="px-5 py-3">Campagne</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Verzonden</th>
              <th className="px-5 py-3 text-right">Open</th>
              <th className="px-5 py-3 text-right">Klik</th>
              <th className="px-5 py-3 text-right">Datum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderc">
            {(campaigns || []).map((c) => {
              const [label, cls] = STATUS[c.status] || [c.status, "bg-paper"];
              return (
                <tr key={c.id}>
                  <td className="px-5 py-3">
                    <Link href={`/beheer/nieuwsbrief/${c.id}`} className="font-bold text-brand hover:text-accentdark">{c.name}</Link>
                    {c.subject && <p className="text-xs text-brand/45">{c.subject}</p>}
                  </td>
                  <td className="px-5 py-3"><span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-brand/70">{c.kind === "drip" ? "Drip" : "Nieuwsbrief"}</span></td>
                  <td className="px-5 py-3"><span className={"rounded-full px-2.5 py-0.5 text-xs font-bold " + cls}>{label}</span></td>
                  <td className="px-5 py-3 text-right font-bold text-brand">{c.sent || 0}</td>
                  <td className="px-5 py-3 text-right text-brand/70">{pct(c.opened, c.sent)}</td>
                  <td className="px-5 py-3 text-right text-brand/70">{pct(c.clicked, c.sent)}</td>
                  <td className="px-5 py-3 text-right text-xs text-brand/40">{fmt(c.sent_at || c.created_at)}</td>
                </tr>
              );
            })}
            {(!campaigns || campaigns.length === 0) && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-brand/40">Nog geen campagnes. Maak hierboven je eerste nieuwsbrief of drip.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-borderc bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-lav">{label}</p>
      <p className="mt-2 text-2xl font-black text-brand">{value}</p>
    </div>
  );
}
