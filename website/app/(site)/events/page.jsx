import Link from "next/link";
import { getGymCached } from "@/lib/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { jsonLdScript, SITE } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Events & groepslessen in Gent | Fittin'",
  description: "Kom naar een event of groepsles bij Fittin' in Gent. Bekijk de agenda en schrijf je in via je account.",
  alternates: { canonical: `${SITE}/events` },
};

const euro = (c) => (c ? "€ " + (c / 100).toFixed(2).replace(".", ",") : "Gratis");
const fmtLong = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default async function EventsPage() {
  const gym = await getGymCached();
  const admin = createAdminClient();
  const { user } = await getSessionProfile();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { data: events } = gym
    ? await admin
        .from("events")
        .select("id, title, description, image_url, starts_at, ends_at, capacity, price_cents, event_signups(id, paid)")
        .eq("gym_id", gym.id)
        .eq("status", "approved")
        .gte("starts_at", today.toISOString())
        .order("starts_at")
    : { data: [] };

  const list = events || [];

  return (
    <main className="min-h-screen bg-paper">
      {list.map((e) => (
        <script key={e.id} {...jsonLdScript({
          "@context": "https://schema.org",
          "@type": "Event",
          name: e.title,
          startDate: e.starts_at,
          ...(e.ends_at ? { endDate: e.ends_at } : {}),
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          eventStatus: "https://schema.org/EventScheduled",
          ...(e.description ? { description: String(e.description).slice(0, 300) } : {}),
          ...(e.image_url ? { image: e.image_url } : {}),
          location: { "@type": "Place", name: "Fittin'", address: { "@type": "PostalAddress", streetAddress: "Aannemersstraat 186", postalCode: "9040", addressLocality: "Gent", addressCountry: "BE" } },
          offers: { "@type": "Offer", price: ((e.price_cents || 0) / 100).toFixed(2), priceCurrency: "EUR", url: `${SITE}/events` },
        })} />
      ))}

      <section className="bg-brand px-5 py-16 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-bold uppercase tracking-widest text-accent">Fittin' · Gent</p>
          <h1 className="mt-2 text-4xl font-black sm:text-5xl">Events &amp; groepslessen</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">
            Samen trainen, workshops en groepslessen bij Fittin'. Bekijk wat eraan komt en schrijf je in via je account.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-14">
        {list.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-borderc bg-white p-10 text-center">
            <p className="font-semibold text-brand/70">Er staan nog geen events gepland.</p>
            <p className="mt-1 text-sm text-brand/50">Hou je account in de gaten — nieuwe events verschijnen hier en in je community-feed.</p>
            <Link href="/boeken" className="mt-5 inline-block rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Reserveer intussen een sessie</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {list.map((e) => {
              const taken = (e.event_signups || []).length;
              const spots = e.capacity ? Math.max(0, e.capacity - taken) : null;
              return (
                <div key={e.id} className="overflow-hidden rounded-3xl border border-borderc bg-white md:flex">
                  {e.image_url && (
                    <div className="md:w-56 md:shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={e.image_url} alt={e.title} className="h-40 w-full object-cover md:h-full" />
                    </div>
                  )}
                  <div className="flex-1 p-6">
                    <p className="text-xs font-bold uppercase tracking-wide text-accentdark">{fmtLong(e.starts_at)}</p>
                    <h2 className="mt-1 text-xl font-black text-brand">{e.title}</h2>
                    {e.description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-brand/65">{e.description}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                      <span className="rounded-full bg-paper px-3 py-1 text-brand/70">{euro(e.price_cents)}</span>
                      {spots !== null && <span className="rounded-full bg-paper px-3 py-1 text-brand/70">{spots > 0 ? `${spots} plaatsen vrij` : "Volzet"}</span>}
                    </div>
                    <Link
                      href={user ? "/community" : `/login?next=/community`}
                      className="mt-4 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                    >
                      {user ? "Schrijf je in" : "Log in om in te schrijven"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
