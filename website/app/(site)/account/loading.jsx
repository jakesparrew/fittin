import { Sk, SkCard, SkStats, SkList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <Sk className="h-9 w-56" />
        <Sk className="mt-3 h-4 w-72" />
        <div className="mt-8">
          <SkStats count={3} />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <SkCard><Sk className="h-5 w-32" /><Sk className="mt-3 h-20 w-full" /></SkCard>
          <SkCard><Sk className="h-5 w-32" /><Sk className="mt-3 h-20 w-full" /></SkCard>
        </div>
        <div className="mt-8">
          <Sk className="h-6 w-48" />
          <div className="mt-4"><SkList rows={4} /></div>
        </div>
      </div>
    </main>
  );
}
