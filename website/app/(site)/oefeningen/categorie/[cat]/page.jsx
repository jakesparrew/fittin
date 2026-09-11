import Link from "next/link";
import { notFound } from "next/navigation";
import { getGymCached, getExercisesCached } from "@/lib/cache";
import { catLabel, catTitle, catIntro } from "@/lib/exercise-categories";
import { breadcrumbLd, jsonLdScript, SITE } from "@/lib/seo";
import ExerciseMedia from "@/components/exercises/ExerciseMedia";

export const revalidate = 300;

const DIFF = { beginner: "Beginner", intermediate: "Gemiddeld", gevorderd: "Gevorderd" };

async function loadCategory(cat) {
  const gym = await getGymCached();
  if (!gym) return { gym: null, list: [] };
  const all = await getExercisesCached(gym.id);
  const list = (all || []).filter((e) => e.category === cat);
  return { gym, list };
}

export async function generateMetadata({ params }) {
  const { cat } = await params;
  const title = catTitle(cat);
  return {
    title: `${title} — met demo & uitleg | Fittin'`,
    description: catIntro(cat).slice(0, 155),
    alternates: { canonical: `${SITE}/oefeningen/categorie/${cat}` },
  };
}

export default async function CategoryHub({ params }) {
  const { cat } = await params;
  const { list } = await loadCategory(cat);
  if (!list.length) notFound();

  const crumbs = breadcrumbLd([
    { name: "Home", url: "/" },
    { name: "Oefeningen", url: "/oefeningen" },
    { name: catLabel(cat), url: `/oefeningen/categorie/${cat}` },
  ]);

  return (
    <main className="min-h-screen bg-paper">
      <script {...jsonLdScript(crumbs)} />
      <div className="mx-auto max-w-5xl px-5 py-14">
        {/* Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ink/45">
          <Link href="/oefeningen" className="hover:text-ink">Oefeningen</Link>
          <span>›</span>
          <span className="text-ink/70">{catLabel(cat)}</span>
        </nav>

        <h1 className="mt-3 text-3xl font-black text-ink md:text-4xl">{catTitle(cat)}</h1>
        <p className="mt-2 max-w-2xl text-ink/60">{catIntro(cat)}</p>
        <p className="mt-3 text-sm font-bold text-ink/40">{list.length} oefeningen</p>

        {/* Sibling category links (crawlable topical cluster) */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/oefeningen" className="rounded-full bg-surface px-3.5 py-1.5 text-xs font-bold text-ink/60 transition hover:text-ink">Alle oefeningen</Link>
          {["borst", "rug", "schouders", "benen", "armen", "core"].filter((c) => c !== cat).map((c) => (
            <Link key={c} href={`/oefeningen/categorie/${c}`} className="rounded-full bg-surface px-3.5 py-1.5 text-xs font-bold capitalize text-ink/60 transition hover:text-ink">{catLabel(c)}</Link>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((ex) => (
            <Link key={ex.id} href={`/oefeningen/${ex.slug}`} className="group rounded-3xl border border-borderc bg-surface p-2 transition hover:-translate-y-0.5 hover:shadow-md">
              <ExerciseMedia exercise={ex} thumb className="aspect-square w-full" rounded="rounded-2xl" />
              <div className="px-2 pb-2 pt-3">
                <p className="font-black leading-tight text-ink">{ex.name}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {(ex.primary_muscles?.[0] || ex.muscle || catLabel(cat)).toString()}
                  {ex.difficulty ? ` · ${DIFF[ex.difficulty] || ex.difficulty}` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Conversion CTA — every hub carries the signup message */}
        <div className="mt-12 rounded-3xl bg-brand p-8 text-white">
          <h2 className="text-2xl font-black">Klaar om te trainen?</h2>
          <p className="mt-2 max-w-xl text-white/75">
            Bij Fittin' reserveer je de privégym in Gent helemaal voor jezelf. Je eerste sessie is gratis —
            geen lidgeld, je betaalt enkel voor je tijd.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/boeken" className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand transition hover:opacity-90">Boek je gratis sessie</Link>
            <Link href="/oefeningen" className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white transition hover:bg-surface/10">Alle oefeningen</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
