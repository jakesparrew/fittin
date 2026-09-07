// Lichtgewicht skelet dat meteen verschijnt (via de loading.jsx van een route) terwijl een
// dynamische pagina zijn data ophaalt. Pure CSS-puls — geen JS, geen data — dus hij schildert
// onmiddellijk en de app voelt snel.
//
// Waarom er varianten zijn (2026-09-07): er was één vaste vorm — titel, vier statkaarten, een breed
// blok, twee kolommen — voor zes zeer verschillende pagina's. Op /training en /community belooft dat
// een layout die nooit komt, en dan is de wissel naar de echte inhoud zélf een sprong. Een skelet
// dat de verkeerde vorm heeft, is slechter dan geen skelet: het verplaatst de sprong alleen.
//
// Kies de variant die de pagina werkelijk heeft. Twijfel je, neem dan geen skelet.
//   dashboard  titel + 4 statkaarten + breed blok + 2 kolommen   (standaard, ongewijzigd)
//   lijst      titel + verticale stapel brede rijen              (events, plannen, workouts)
//   raster     titel + raster van kaarten met beeld bovenaan     (coaches, bewaarde video's)
//   kaart      titel + één centrale kaart                        (profiel, formulier)
//   prijzen    titel + drie gelijke kolomkaarten                 (lidmaatschap)

// Breedtes staan als hele klassenamen in het bestand: Tailwind scant de broncode, dus een
// samengestelde string als `max-w-${x}` levert géén klasse op.
const BREEDTE = { smal: "max-w-4xl", midden: "max-w-5xl", breed: "max-w-6xl" };

// De radius staat NIET in de helper: twee radius-klassen in één string hebben dezelfde
// specificiteit, dus welke wint hangt af van de volgorde in de gegenereerde CSS en niet van de
// volgorde waarin je ze schrijft. Elke aanroep zet zijn eigen radius, één keer.
const Balk = ({ className }) => <div className={"rounded " + className} />;
const Vlak = ({ className }) => <div className={"border border-borderc bg-white " + className} />;

// Vuistregel voor `rijen` en `kaarten`: kies de ONDERGRENS, niet het gemiddelde. Een skelet dat
// minder toont dan er komt, groeit gewoon naar beneden — dat leest als laden. Een skelet dat méér
// toont dan er komt, krimpt, en dan springt alles eronder omhoog. Op /coaches stond hier eerst 3
// terwijl er één coach is; het skelet beloofde een rij van drie die nooit kwam.
export default function PageSkeleton({ wide, variant = "dashboard", breedte, rijen = 3, kaarten = 1, intro = false }) {
  const max = BREEDTE[breedte] || (wide ? BREEDTE.breed : BREEDTE.smal);
  return (
    <main className="min-h-screen bg-paper">
      <div className={"mx-auto px-5 py-16 " + max}>
        {/* animate-pulse is bewust de enige beweging hier. Bij `prefers-reduced-motion` blijft hij
            lopen maar trager (zie app/globals.css): een stilstaand skelet leest als een vastgelopen
            pagina, en dat is precies de indruk die dit component moet wegnemen. */}
        <div className="animate-pulse space-y-6">
          <Balk className="h-4 w-32 bg-borderc/60" />
          <Balk className="h-9 w-64 bg-borderc/70" />
          {/* De meeste publieke pagina's openen met twee regels inleiding onder de titel. Laat je
              die weg, dan schuift alles eronder een regel of twee omlaag zodra de tekst komt. */}
          {intro && (
            <div className="space-y-2">
              <Balk className="h-3 w-full max-w-2xl bg-borderc/60" />
              <Balk className="h-3 w-4/5 max-w-xl bg-borderc/60" />
            </div>
          )}

          {variant === "dashboard" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Vlak key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
              <Vlak className="h-40 rounded-3xl" />
              <div className="grid gap-4 lg:grid-cols-2">
                <Vlak className="h-56 rounded-3xl" />
                <Vlak className="h-56 rounded-3xl" />
              </div>
            </>
          )}

          {variant === "lijst" && (
            <div className="space-y-4">
              {Array.from({ length: rijen }).map((_, i) => (
                <Vlak key={i} className="h-32 rounded-3xl" />
              ))}
            </div>
          )}

          {variant === "raster" && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: kaarten }).map((_, i) => (
                // Beeld boven, tekst onder — dezelfde verhouding als de echte kaart, anders
                // verspringt het raster op het moment dat de inhoud binnenkomt.
                <div key={i} className="overflow-hidden rounded-3xl border border-borderc bg-white">
                  <div className="aspect-[4/3] bg-borderc/50" />
                  <div className="space-y-2 p-5">
                    <Balk className="h-5 w-2/3 bg-borderc/70" />
                    <Balk className="h-3 w-full bg-borderc/60" />
                    <Balk className="h-3 w-4/5 bg-borderc/60" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {variant === "kaart" && <Vlak className="h-72 rounded-3xl" />}

          {variant === "prijzen" && (
            <div className="grid gap-5 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Vlak key={i} className="h-[26rem] rounded-3xl" />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
