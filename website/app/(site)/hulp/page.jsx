import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { getGymCached } from "@/lib/cache";
import HelpForm from "./HelpForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Hulp nodig? | Fittin'",
  description: "Loop je vast bij Fittin'? Hier vind je onze contactgegevens, antwoorden op veelgestelde vragen en een formulier om je vraag te stellen.",
  // Zonder canonical kan elke variant met UTM- of deelparameters als aparte URL geïndexeerd worden.
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/hulp` },
};

// Eén plek waar je terechtkan als er iets misloopt. Aanleiding: de hulpknop stond alleen op
// /account, achter een login — net wie niet binnen raakt, kwam er dus niet.
//
// Volgorde is bewust: eerst de dingen die je NU zelf kan oplossen (de meeste vragen gaan over de
// deurcode of een mislukte betaling), dan pas het formulier. Zo krijgt iemand zijn antwoord vaak
// zonder te moeten wachten.
export default async function HulpPagina() {
  const [{ user }, gym] = await Promise.all([getSessionProfile(), getGymCached()]);
  const adres = gym?.address || "Aannemersstraat 186, 9040 Gent";
  const uren = gym ? `${gym.open_hour}u–${gym.close_hour}u` : "6u–23u";

  const vragen = [
    {
      v: "Ik raak niet binnen — waar is mijn deurcode?",
      a: `Je persoonlijke code wordt ongeveer 5 minuten vóór je sessie aangemaakt en komt per mail binnen. Je vindt hem ook altijd op je boekingskaart onder Mijn account. Staat er nog geen code? Dan is je sessie nog niet begonnen.`,
    },
    {
      v: "Mijn betaling lukte niet",
      a: "Meestal is dat een verlopen bankkaart. Open Mijn account → Abonnement beheren en werk je betaalmethode bij; daarna probeert het systeem vanzelf opnieuw. Ging het om een losse sessie, boek dan gewoon opnieuw — een mislukte betaling reserveert niets.",
    },
    {
      v: "Ik kan niet inloggen",
      a: "Vraag een nieuw wachtwoord aan via 'Wachtwoord vergeten' op de inlogpagina. Krijg je die mail niet binnen, kijk dan even in je ongewenste post — en laat het ons hieronder weten, dan zetten we het recht.",
    },
    {
      // De titel vroeg naar annuleren, maar dat kan een lid zelf niet: er bestaat enkel
      // rescheduleBookingAction. Beloof dus alleen wat de knop doet, en zeg wat je met annuleren doet.
      v: "Hoe verplaats ik een sessie?",
      a: "Onder Mijn account staat bij elke geboekte sessie een knop om te verplaatsen, tot 6 uur vóór de start. Zelf annuleren kan niet — mail ons op info@fittin.be en we regelen het. Lukt het niet meer op tijd? Laat het ons weten, we zoeken mee.",
    },
    {
      v: "Hoe zeg ik mijn abonnement op?",
      a: "Via Mijn account → Abonnement beheren. Je abonnement loopt door tot het einde van de betaalde periode; daarna stopt het vanzelf. Geen opzegtermijn, geen kleine lettertjes.",
    },
  ];

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-2xl px-5 py-14">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-accentdark">Hulp</p>
        <h1 className="mt-2 text-3xl font-black text-brand md:text-4xl">Waarmee kunnen we helpen?</h1>
        <p className="mt-2 text-brand/60">
          Loop je ergens vast? Grote kans dat je antwoord hieronder staat. Zo niet, stel je vraag onderaan — we lezen alles zelf.
        </p>

        {/* Direct contact bovenaan: wie haast heeft, moet niet eerst door een FAQ scrollen. */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a href="mailto:info@fittin.be" className="rounded-2xl border-2 border-accent bg-accent/5 p-5 transition hover:bg-accent/10">
            <p className="text-xs font-bold uppercase tracking-wide text-lav">Mail ons</p>
            <p className="mt-1 break-words font-black text-brand">info@fittin.be</p>
            <p className="mt-0.5 text-xs text-brand/55">Meestal antwoord dezelfde dag</p>
          </a>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adres)}`}
            target="_blank" rel="noopener noreferrer"
            className="rounded-2xl border border-borderc bg-white p-5 transition hover:border-accent"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-lav">Kom langs</p>
            <p className="mt-1 break-words font-black text-brand">{adres}</p>
            <p className="mt-0.5 text-xs text-brand/55">Open {uren} · reserveer je eigen uur</p>
          </a>
        </div>

        <section className="mt-8">
          <h2 className="text-xs font-black uppercase tracking-widest text-lav">Veelgestelde vragen</h2>
          <div className="mt-3 space-y-2">
            {vragen.map((q, i) => (
              <details key={i} className="rounded-2xl border border-borderc bg-white p-4">
                <summary className="cursor-pointer font-bold text-brand">{q.v}</summary>
                <p className="mt-2 text-sm leading-relaxed text-brand/70">{q.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <HelpForm ingelogd={!!user} />
        </section>

        <p className="mt-6 text-center text-xs text-brand/45">
          Ook handig: <Link href="/voorwaarden" className="font-bold text-accentdark hover:underline">voorwaarden</Link>
          {" · "}<Link href="/privacy" className="font-bold text-accentdark hover:underline">privacy</Link>
          {" · "}<Link href="/cookies" className="font-bold text-accentdark hover:underline">cookies</Link>
        </p>
      </div>
    </main>
  );
}
