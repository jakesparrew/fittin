import { Sk, SkCard, SkList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-5xl px-5 py-16">
        <Sk className="h-9 w-64" />
        <Sk className="mt-3 h-4 w-80" />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <SkCard className="p-6"><Sk className="h-6 w-40" /><div className="mt-4"><SkList rows={5} /></div></SkCard>
          <SkCard className="p-6"><Sk className="h-6 w-40" /><div className="mt-4"><SkList rows={5} /></div></SkCard>
        </div>
      </div>
    </main>
  );
}
