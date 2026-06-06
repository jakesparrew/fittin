import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

export const metadata = {
  title: "Events & groepslessen | Fittin'",
  description: "Bekijk de komende events en groepslessen bij Fittin' in Gent — boek je plek online.",
  alternates: { canonical: `${SITE}/events` },
};

const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");
const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function EventsPage() {
  const supabase = await createClient();
  const { data: gym } = await supabase.from("gyms").select("id").eq("slug", "fittin").single();
  const { data: events } = gym
    ? await supabase
        .from("events")
        .select("id, title, description, starts_at, capacity, price_cents, event_signups(id, paid)")
        .eq("gym_id", gym.id)
        .eq("status", "approved")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(50)
    : { data: [] };
  const { user } = await getSessionProfile();

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Bij Fittin&rsquo;</p>
        <h1 className="mt-2 text-4xl font-black md:text-5xl">Events &amp; groepslessen</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-brand/70">
          Train samen tijdens een groepsles, workshop of community-event in onze privégym in Gent.
          Plekken zijn beperkt — boek op tijd.
        </p>

        <div className="mt-10 space-y-4">
          {(events || []).map((e) => {
            const taken = (e.event_signups || []).filter((s) => s.paid).length;
            const full = taken >= e.capacity;
            return (
              <div key={e.id} className="rounded-3xl border border-borderc bg-white p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-black text-brand">{e.title}</p>
                    <p className="mt-1 text-sm capitalize text-brand/60">{fmt(e.starts_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-accentdark">{e.price_cents ? euro(e.price_cents) : "Gratis"}</p>
                    <p className="text-xs font-bold text-brand/40">{full ? "Volzet" : `${Math.max(0, e.capacity - taken)} plaatsen`}</p>
                  </div>
                </div>
                {e.description && <p className="mt-3 leading-relaxed text-brand/70">{e.description}</p>}
                <div className="mt-4">
                  {full ? (
                    <span className="inline-block rounded-full bg-paper px-5 py-2.5 text-sm font-bold text-brand/50">Volzet</span>
                  ) : (
                    <Link href={user ? "/boeken" : "/login?next=/boeken"} className="inline-block rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">
                      {user ? "Boek je plek →" : "Maak een account om te boeken →"}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          {(!events || events.length === 0) && (
            <div className="rounded-3xl border border-dashed border-borderc bg-white p-12 text-center">
              <p className="font-semibold text-brand/70">Momenteel geen geplande events.</p>
              <p className="mt-1 text-sm text-brand/50">Hou deze pagina in de gaten of <Link href="/boeken" className="font-bold text-accentdark">boek een gewone sessie</Link>.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
