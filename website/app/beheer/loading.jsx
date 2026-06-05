import { Sk, SkStats, SkList } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="px-8 py-8">
      <Sk className="h-8 w-56" />
      <Sk className="mt-2 h-4 w-72" />
      <div className="mt-6">
        <SkStats count={3} />
      </div>
      <div className="mt-8">
        <Sk className="h-6 w-48" />
        <div className="mt-4"><SkList rows={6} /></div>
      </div>
    </div>
  );
}
