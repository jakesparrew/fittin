// Page-shaped loading skeletons for heavy admin routes (Batch 4.5). Pure CSS pulse — no deps.
export function SkStats({ n = 4 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-borderc bg-white p-5">
          <div className="h-3 w-24 animate-pulse rounded bg-paper" />
          <div className="mt-3 h-6 w-16 animate-pulse rounded bg-paper" />
        </div>
      ))}
    </div>
  );
}

export function SkList({ rows = 6 }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-borderc bg-white">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 border-b border-borderc px-5 py-4 last:border-0">
          <div className="flex-1">
            <div className="h-3.5 w-40 animate-pulse rounded bg-paper" />
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-paper" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded-full bg-paper" />
        </div>
      ))}
    </div>
  );
}

// Standard page frame for admin loading states.
export function SkPage({ stats = 4, rows = 6 }) {
  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="h-8 w-48 animate-pulse rounded bg-paper" />
      <div className="mt-6"><SkStats n={stats} /></div>
      <div className="mt-8"><SkList rows={rows} /></div>
    </div>
  );
}
