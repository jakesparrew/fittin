import { Sk, SkCard, SkStats, SkList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="px-8 py-8">
      <Sk className="h-8 w-64" />
      <Sk className="mt-2 h-4 w-80" />
      <div className="mt-6">
        <SkStats count={3} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SkCard><Sk className="h-5 w-40" /><Sk className="mt-3 h-9 w-full" /></SkCard>
        <SkCard><Sk className="h-5 w-40" /><Sk className="mt-3 h-9 w-full" /></SkCard>
      </div>
      <div className="mt-8">
        <Sk className="h-6 w-56" />
        <div className="mt-4"><SkList rows={5} /></div>
      </div>
    </div>
  );
}
