// Maatwerk: dit is de zwaarste publieke route. Een slug die geen uuid is, laat álle publieke
// coachprofielen ophalen om de juiste te vinden, en daarna volgen nog drie tot vier queries. Hier
// staat de bezoeker dus het langst te wachten.
//
// De vorm moet de asymmetrie van de echte pagina aanhouden — een vaste kolom van 300px met een 4:5
// portret links, de tekst rechts. Eén gecentreerde kaart zou de naam zichtbaar doen verspringen op
// het moment dat de inhoud binnenkomt.
export default function Loading() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <div className="animate-pulse">
          <div className="h-3 w-28 rounded bg-borderc/60" />
          <div className="mt-6 grid gap-8 md:grid-cols-[300px_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="aspect-[4/5] rounded-3xl border border-borderc bg-borderc/40" />
              <div className="h-12 rounded-full bg-borderc/50" />
            </div>
            <div className="space-y-4">
              <div className="h-10 w-64 max-w-full rounded bg-borderc/70" />
              <div className="flex gap-2">
                <div className="h-6 w-24 rounded-full bg-borderc/50" />
                <div className="h-6 w-20 rounded-full bg-borderc/50" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-borderc/60" />
                <div className="h-3 w-11/12 rounded bg-borderc/60" />
                <div className="h-3 w-4/5 rounded bg-borderc/60" />
              </div>
              <div className="h-32 rounded-2xl border border-borderc bg-surface" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
