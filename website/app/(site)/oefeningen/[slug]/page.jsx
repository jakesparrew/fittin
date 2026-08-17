import Link from "next/link";
import { notFound } from "next/navigation";
import { getGymCached, getExerciseBySlug, getAlternativesByCategory, getExercisesCached } from "@/lib/cache";
import { catLabel } from "@/lib/exercise-categories";
import { breadcrumbLd, exerciseHowToLd, isDutchExercise, jsonLdScript } from "@/lib/seo";
import ExerciseDetail from "@/components/exercises/ExerciseDetail";
import ExerciseActions from "@/components/exercises/ExerciseActions";
import ExerciseMedia from "@/components/exercises/ExerciseMedia";

export const revalidate = 300;

// Alle oefeningpagina's bij de build renderen. `revalidate = 300` alléén maakte ze nog niet
// statisch: zonder deze lijst kent Next de slugs niet en rendert hij elke pagina pas bij het
// eerste bezoek. Live gemeten gaf dat X-Vercel-Cache MISS en 176–242 ms TTFB (tegenover ~100 ms
// voor de wél geprerenderde lijstpagina), plus twee databankvragen per crawl — bij ~885 pagina's
// die een crawler één na één afgaat is dat elke keer opnieuw de koude weg.
//
// Best-effort: valt de databank tijdens de build weg, dan is de lijst leeg en rendert Next de
// pagina's gewoon op aanvraag (dynamicParams staat standaard aan). Een hapering mag nooit de
// deploy tegenhouden — dezelfde afweging als in app/sitemap.js.
export async function generateStaticParams() {
  try {
    const gym = await getGymCached();
    if (!gym) return [];
    const oefeningen = await getExercisesCached(gym.id);
    return (oefeningen || []).filter((o) => o.slug).map((o) => ({ slug: o.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const gym = await getGymCached();
  const ex = gym ? await getExerciseBySlug(gym.id, slug) : null;
  if (!ex) return { title: "Oefening | Fittin'" };
  const desc = (ex.instructions?.[0] || ex.tips || `${ex.name} — correcte uitvoering en doelspieren.`).slice(0, 155);
  return {
    title: `${ex.name} — oefening | Fittin'`,
    description: desc,
    alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/oefeningen/${ex.slug}` },
    // De nog niet vertaalde, overgenomen oefeningen staan al buiten de sitemap. Uit de sitemap
    // halen vráágt enkel om niet te crawlen; het haalt niets uit de index en houdt niets tegen dat
    // via een interne link binnenkomt. Deze meta doet dat wél. follow blijft aan, zodat de links
    // naar de Nederlandstalige hubs en alternatieven hun waarde blijven doorgeven.
    ...(isDutchExercise(ex) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ExercisePage({ params }) {
  const { slug } = await params;
  const gym = await getGymCached();
  const ex = gym ? await getExerciseBySlug(gym.id, slug) : null;
  if (!ex) notFound();

  // Alternatives: same category (DB-queried), prefer a shared primary muscle.
  const altRaw = gym && ex.category ? await getAlternativesByCategory(gym.id, ex.category, ex.slug) : [];
  const muscle = (ex.primary_muscles || [])[0];
  const alternatives = altRaw
    .sort((a, b) => (muscle && (b.primary_muscles || []).includes(muscle) ? 1 : 0) - (muscle && (a.primary_muscles || []).includes(muscle) ? 1 : 0))
    .slice(0, 6);

  const crumbItems = [
    { name: "Home", url: "/" },
    { name: "Oefeningen", url: "/oefeningen" },
    ...(ex.category ? [{ name: catLabel(ex.category), url: `/oefeningen/categorie/${ex.category}` }] : []),
    { name: ex.name, url: `/oefeningen/${ex.slug}` },
  ];

  return (
    <main className="bg-paper min-h-screen">
      <script {...jsonLdScript(breadcrumbLd(crumbItems))} />
      {Array.isArray(ex.instructions) && ex.instructions.length > 0 && <script {...jsonLdScript(exerciseHowToLd(ex))} />}
      <div className="mx-auto max-w-2xl px-5 py-12">
        {/* Breadcrumb — links back up into the category hub (topical cluster) */}
        <nav className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-brand/45">
          <Link href="/oefeningen" className="hover:text-brand">Oefeningen</Link>
          {ex.category && (<><span>›</span><Link href={`/oefeningen/categorie/${ex.category}`} className="capitalize hover:text-brand">{catLabel(ex.category)}</Link></>)}
        </nav>
        <div className="mt-5 rounded-3xl border border-borderc bg-white p-5 md:p-7">
          <ExerciseDetail exercise={ex} />
          {/* Van artikel naar handeling: bewaren, in je schema zetten, of nu doen en loggen. */}
          <ExerciseActions exerciseId={ex.id} exerciseName={ex.name} />
        </div>

        {alternatives.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-lav">Alternatieven</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {alternatives.map((a) => (
                <Link key={a.id} href={`/oefeningen/${a.slug}`} className="group rounded-2xl border border-borderc bg-white p-2 transition hover:-translate-y-0.5 hover:shadow-md">
                  <ExerciseMedia exercise={a} thumb className="aspect-square w-full" rounded="rounded-xl" />
                  <p className="px-1 pt-2 text-sm font-bold leading-tight text-brand">{a.name}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
