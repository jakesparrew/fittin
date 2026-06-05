// Reusable skeleton building blocks. Pulse animation, brand-neutral so they read as "loading"
// on every surface. Use these in route-level loading.jsx files to mirror the real layout.
export function Sk({ className = "" }) {
  return <div className={"animate-pulse rounded-xl bg-brand/10 " + className} />;
}

// A card-shaped placeholder matching the bordered white cards used across the app.
export function SkCard({ className = "", children }) {
  return (
    <div className={"rounded-2xl border border-borderc bg-white p-5 " + className}>
      {children}
    </div>
  );
}

// A row of stat cards (used on dashboards).
export function SkStats({ count = 3 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkCard key={i}>
          <Sk className="h-3 w-24" />
          <Sk className="mt-3 h-7 w-16" />
        </SkCard>
      ))}
    </div>
  );
}

// A list of line placeholders (used for booking/session lists).
export function SkList({ rows = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between rounded-2xl border border-borderc bg-white p-4">
          <div className="space-y-2">
            <Sk className="h-4 w-40" />
            <Sk className="h-3 w-28" />
          </div>
          <Sk className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}
