// Maatwerk in plaats van een variant: /events opent met een donkerblauwe hero over de volle breedte.
// Een generiek licht skelet zou daar een lichte band tonen die daarna donker wordt — dan is de wissel
// naar de echte pagina zelf een flits, en dat is precies wat een skelet hoort weg te nemen.
export default function Loading() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="animate-pulse">
        <section className="bg-brand px-5 py-16">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="h-3 w-28 rounded bg-white/20" />
            <div className="h-10 w-80 max-w-full rounded bg-white/25" />
            <div className="h-4 w-full max-w-2xl rounded bg-white/15" />
          </div>
        </section>
        {/* Eén kaart, niet drie. De agenda staat vaak leeg, en dan toont de echte pagina precies één
            lege-toestandkaart. Een skelet dat er drie belooft, laat alles eronder omhoog springen
            zodra de inhoud komt. Onder-beloven groeit gewoon naar beneden en leest als laden. */}
        <div className="mx-auto max-w-4xl px-5 py-14">
          <div className="h-40 rounded-3xl border border-borderc bg-white" />
        </div>
      </div>
    </main>
  );
}
