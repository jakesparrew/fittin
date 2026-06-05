import { Sk, SkCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-5xl px-5 py-16">
        <Sk className="h-9 w-56" />
        <Sk className="mt-3 h-4 w-80" />
        <div className="mt-8 grid gap-6 md:grid-cols-[1fr_320px]">
          <SkCard className="p-6">
            <Sk className="h-5 w-40" />
            <div className="mt-4 grid grid-cols-7 gap-2">
              {Array.from({ length: 28 }).map((_, i) => <Sk key={i} className="h-10" />)}
            </div>
          </SkCard>
          <SkCard className="p-6">
            <Sk className="h-5 w-32" />
            <Sk className="mt-4 h-10 w-full" />
            <Sk className="mt-3 h-10 w-full" />
            <Sk className="mt-6 h-11 w-full" />
          </SkCard>
        </div>
      </div>
    </main>
  );
}
