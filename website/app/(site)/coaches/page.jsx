import Link from "next/link";
import SpecialtyTags from "@/components/coach/SpecialtyTags";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { coachSlug } from "@/lib/slug";
import { healthClubLd, breadcrumbLd, jsonLdScript } from "@/lib/seo";

export const dynamic = "force-dynamic";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
export const metadata = {
  // Rechtstreeks boeken bij een coach staat bewust uit: beloof hier de route die wél bestaat.
  title: "Onze coaches | Fittin'",
  description: "Maak kennis met de personal trainers van Fittin' in Gent — bekijk hun specialiteit en aanpak, en vraag een gratis intake met proeftraining aan.",
  alternates: { canonical: `${SITE}/coaches` },
};

export default async function CoachesPage() {
  const supabase = await createClient();
  const { data: gym } = await supabase.from("gyms").select("id").eq("slug", "fittin").single();
  const admin = createAdminClient();
  const { data: coaches } = gym
    ? await admin.from("profiles").select("id, full_name, coach_specialty, coach_photo_url, coach_bio").eq("gym_id", gym.id).eq("role", "coach").eq("coach_public", true).order("full_name")
    : { data: [] };

  const list = coaches || [];
  const alleen = list.length === 1;

  return (
    <main className="bg-paper">
      <script {...jsonLdScript(healthClubLd())} />
      <script {...jsonLdScript(breadcrumbLd([{ name: "Home", url: "/" }, { name: "Coaches", url: "/coaches" }]))} />
      <div className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Personal training</p>
        <h1 className="mt-2 text-4xl font-black md:text-5xl">{alleen ? "Onze coach" : "Onze coaches"}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-brand/70">
          {alleen
            ? "Train onder begeleiding van een ervaren personal trainer in onze privégym. Vraag een gratis intake met proeftraining aan — daarna beslis je zelf."
            : "Train onder begeleiding van een ervaren personal trainer in onze privégym. Vraag een gratis intake met proeftraining aan; samen kiezen jullie de coach die bij je past."}
        </p>

        {/* Het kolomaantal volgt het aantal publieke coaches — anders staan er gaten naast één kaart. */}
        <div className={`mt-10 grid gap-6 ${alleen ? "max-w-sm" : list.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {list.map((c) => (
            <Link key={c.id} href={`/coaches/${coachSlug(c)}`} className="group overflow-hidden rounded-3xl border border-borderc bg-white transition hover:-translate-y-1 hover:shadow-lg hover:shadow-brand/5">
              <div className="relative aspect-[4/3] bg-paper">
                {c.coach_photo_url ? (
                  <Image src={c.coach_photo_url} alt={c.full_name || "Coach"} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-5xl font-black text-brand/15">{(c.full_name || "C").slice(0, 1)}</div>
                )}
              </div>
              <div className="p-5">
                <p className="text-lg font-black text-brand">{c.full_name || "Coach"}</p>
                <SpecialtyTags value={c.coach_specialty} className="mt-1.5" />
                {c.coach_bio && <p className="mt-2 line-clamp-2 text-sm text-brand/60">{c.coach_bio}</p>}
                <span className="mt-3 inline-block text-sm font-bold text-brand/60 transition group-hover:text-brand">Bekijk profiel →</span>
              </div>
            </Link>
          ))}
          {list.length === 0 && (
            <div className="rounded-3xl border border-dashed border-borderc bg-white p-10 text-center sm:col-span-2 lg:col-span-3">
              <p className="font-semibold text-brand/70">Binnenkort stellen onze coaches zich hier voor.</p>
            </div>
          )}
        </div>

        {/* De enige conversieroute van deze pagina — ook zichtbaar als er nog geen profiel klaarstaat. */}
        <div className="mt-10 text-center">
          <Link href="/personal-training#intake" className="inline-block rounded-full bg-accent px-8 py-4 font-black text-brand transition hover:opacity-90">
            Vraag je gratis proeftraining aan
          </Link>
          <p className="mt-3 text-sm text-brand/50">Gratis en vrijblijvend · we mailen je binnen 1 werkdag</p>
        </div>
      </div>
    </main>
  );
}
