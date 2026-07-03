import Link from "next/link";
import { getGymCached, getExercisesCached } from "@/lib/cache";
import ExerciseLibrary from "@/components/exercises/ExerciseLibrary";
import { catLabel } from "@/lib/exercise-categories";
import { searchLibrary } from "./actions";

export const metadata = {
  title: "Oefeningenbibliotheek | Fittin'",
  description: "Geanimeerde oefeningen met uitleg, doelspieren en stap-voor-stap instructies — de volledige Fittin'-bibliotheek.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/oefeningen` },
};

export const revalidate = 300;

export default async function OefeningenPage() {
  const gym = await getGymCached();
  const all = gym ? await getExercisesCached(gym.id) : [];
  const hubCats = Array.from(new Set(all.map((e) => e.category).filter(Boolean))).sort();
  const categories = ["alle", ...hubCats];
  const initial = all.slice(0, 48); // small initial payload; search/filter queries the server

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-14">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Oefeningen</p>
        <h1 className="mt-2 text-3xl font-black text-brand md:text-4xl">Oefeningenbibliotheek</h1>
        <p className="mt-2 max-w-2xl text-brand/60">
          Bekijk hoe je elke oefening correct uitvoert — met demo, doelspieren en duidelijke uitleg.
          Je coach stelt hiermee jouw persoonlijke schema samen.
        </p>
        {/* Crawlable category hubs — real links so the ~900 exercise pages form a linked topical cluster. */}
        {hubCats.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-wide text-lav">Blader per spiergroep</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {hubCats.map((c) => (
                <Link key={c} href={`/oefeningen/categorie/${c}`} className="rounded-full border border-borderc bg-white px-4 py-2 text-sm font-bold capitalize text-brand transition hover:border-accent hover:text-accentdark">
                  {catLabel(c)}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="mt-8">
          {all.length > 0 ? (
            <ExerciseLibrary initial={initial} total={all.length} categories={categories} onSearch={searchLibrary} />
          ) : (
            <div className="rounded-3xl border border-dashed border-borderc bg-white p-10 text-center">
              <p className="font-semibold text-brand/70">De bibliotheek wordt binnenkort gevuld.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
