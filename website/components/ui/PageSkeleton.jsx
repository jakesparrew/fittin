// Lightweight skeleton shown instantly (via route loading.jsx) while a dynamic page fetches.
// Pure CSS pulse — no JS, no data — so it paints immediately and the app feels fast.
export default function PageSkeleton({ wide }) {
  return (
    <main className="min-h-screen bg-paper">
      <div className={"mx-auto px-5 py-16 " + (wide ? "max-w-6xl" : "max-w-4xl")}>
        <div className="animate-pulse space-y-6">
          <div className="h-4 w-32 rounded bg-borderc/60" />
          <div className="h-9 w-64 rounded bg-borderc/70" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl border border-borderc bg-white" />
            ))}
          </div>
          <div className="h-40 rounded-3xl border border-borderc bg-white" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-56 rounded-3xl border border-borderc bg-white" />
            <div className="h-56 rounded-3xl border border-borderc bg-white" />
          </div>
        </div>
      </div>
    </main>
  );
}
