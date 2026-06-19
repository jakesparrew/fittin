import { getGymCached, getExercisesCached } from "@/lib/cache";
import ExerciseLibrary from "@/components/exercises/ExerciseLibrary";
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
  const categories = ["alle", ...Array.from(new Set(all.map((e) => e.category).filter(Boolean))).sort()];
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
