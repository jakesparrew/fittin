import Link from "next/link";
import { notFound } from "next/navigation";
import { getGymCached, getExercisesCached } from "@/lib/cache";
import ExerciseDetail from "@/components/exercises/ExerciseDetail";

export const revalidate = 300;

async function findExercise(slug) {
  const gym = await getGymCached();
  if (!gym) return null;
  const exercises = await getExercisesCached(gym.id);
  return exercises.find((e) => e.slug === slug) || null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const ex = await findExercise(slug);
  if (!ex) return { title: "Oefening | Fittin'" };
  const desc = (ex.instructions?.[0] || ex.tips || `${ex.name} — correcte uitvoering en doelspieren.`).slice(0, 155);
  return {
    title: `${ex.name} — oefening | Fittin'`,
    description: desc,
    alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/oefeningen/${ex.slug}` },
  };
}

export default async function ExercisePage({ params }) {
  const { slug } = await params;
  const ex = await findExercise(slug);
  if (!ex) notFound();

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <Link href="/oefeningen" className="text-sm font-semibold text-brand/50 hover:text-brand">← Alle oefeningen</Link>
        <div className="mt-5 rounded-3xl border border-borderc bg-white p-5 md:p-7">
          <ExerciseDetail exercise={ex} />
        </div>
      </div>
    </main>
  );
}
