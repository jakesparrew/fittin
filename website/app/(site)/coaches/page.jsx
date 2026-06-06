import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
export const metadata = {
  title: "Onze coaches | Fittin'",
  description: "Maak kennis met de personal trainers van Fittin' in Gent — bekijk hun specialiteit, aanpak en beschikbaarheid en boek rechtstreeks.",
  alternates: { canonical: `${SITE}/coaches` },
};

export default async function CoachesPage() {
  const supabase = await createClient();
  const { data: gym } = await supabase.from("gyms").select("id").eq("slug", "fittin").single();
  const admin = createAdminClient();
  const { data: coaches } = gym
    ? await admin.from("profiles").select("id, full_name, coach_specialty, coach_photo_url, coach_bio").eq("gym_id", gym.id).eq("role", "coach").eq("coach_public", true).order("full_name")
    : { data: [] };

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Personal training</p>
        <h1 className="mt-2 text-4xl font-black md:text-5xl">Onze coaches</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-brand/70">
          Train onder begeleiding van een ervaren personal trainer in onze privégym. Kies een coach
          die bij jou past en boek je sessie.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(coaches || []).map((c) => (
            <Link key={c.id} href={`/coaches/${c.id}`} className="group overflow-hidden rounded-3xl border border-borderc bg-white transition hover:-translate-y-1 hover:shadow-lg hover:shadow-brand/5">
              <div className="aspect-[4/3] bg-paper">
                {c.coach_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.coach_photo_url} alt={c.full_name || "Coach"} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-5xl font-black text-brand/15">{(c.full_name || "C").slice(0, 1)}</div>
                )}
              </div>
              <div className="p-5">
                <p className="text-lg font-black text-brand">{c.full_name || "Coach"}</p>
                {c.coach_specialty && <p className="mt-0.5 text-sm font-semibold text-accentdark">{c.coach_specialty}</p>}
                {c.coach_bio && <p className="mt-2 line-clamp-2 text-sm text-brand/60">{c.coach_bio}</p>}
                <span className="mt-3 inline-block text-sm font-bold text-brand/60 transition group-hover:text-brand">Bekijk profiel →</span>
              </div>
            </Link>
          ))}
          {(!coaches || coaches.length === 0) && (
            <div className="rounded-3xl border border-dashed border-borderc bg-white p-10 text-center sm:col-span-2 lg:col-span-3">
              <p className="font-semibold text-brand/70">Binnenkort stellen onze coaches zich hier voor.</p>
              <Link href="/personal-training" className="mt-4 inline-block rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand">Meer over personal training</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
