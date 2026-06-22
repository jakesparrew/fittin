// Reusable "Coming soon" placeholder for features that are temporarily disabled.
export default function ComingSoon({ title = "Binnenkort beschikbaar", subtitle, icon = "📅" }) {
  return (
    <div className="px-8 py-16">
      <div className="mx-auto max-w-xl rounded-3xl border border-dashed border-borderc bg-white p-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-2xl">{icon}</div>
        <h1 className="mt-5 text-3xl font-black text-brand">{title}</h1>
        <p className="mt-3 text-brand/60">{subtitle || "We werken aan deze functie — binnenkort beschikbaar."}</p>
        <span className="mt-5 inline-block rounded-full bg-brand px-4 py-1.5 text-xs font-black uppercase tracking-widest text-accent">Coming soon</span>
      </div>
    </div>
  );
}
