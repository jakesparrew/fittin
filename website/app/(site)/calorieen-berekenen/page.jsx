import Link from "next/link";
import CalorieCalculator from "@/components/calculators/CalorieCalculator";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

export const metadata = {
  title: "Calorieën berekenen — gratis calorie- & macrocalculator | Fittin'",
  description:
    "Bereken in 30 seconden hoeveel calorieën je per dag nodig hebt om af te vallen, op gewicht te blijven of spiermassa op te bouwen. Inclusief eiwitten, koolhydraten, vetten en een voorbeeld dagplan. Gratis, geen account nodig.",
  alternates: { canonical: `${SITE}/calorieen-berekenen` },
  openGraph: {
    title: "Calorieën berekenen — gratis calorie- & macrocalculator",
    description: "Hoeveel calorieën heb jij nodig? Bereken je dagbehoefte, macro's en een voorbeeld dagplan.",
    url: `${SITE}/calorieen-berekenen`,
    type: "website",
  },
};

const FAQ = [
  {
    q: "Hoeveel calorieën heb ik per dag nodig?",
    a: "Dat hangt af van je geslacht, leeftijd, lengte, gewicht en hoeveel je beweegt. De calculator berekent eerst je ruststofwisseling (BMR) en vermenigvuldigt die met een activiteitsfactor tot je dagelijkse onderhoudsbehoefte (TDEE). Een gemiddelde actieve volwassen man zit rond 2400–2800 kcal, een vrouw rond 1900–2200 kcal — maar je persoonlijke cijfer kan flink afwijken.",
  },
  {
    q: "Hoeveel calorieën moet ik eten om af te vallen?",
    a: "Voor vetverlies trek je ongeveer 15–20% van je onderhoudsbehoefte af. Zo val je gestaag af (±0,5 kg per week) zonder spiermassa te verliezen of constant honger te hebben. Crashdiëten met heel weinig calorieën houd je zelden vol en kosten je spiermassa.",
  },
  {
    q: "Hoeveel eiwitten heb ik nodig?",
    a: "Voor wie sport is 1,6–2,2 gram eiwit per kilo lichaamsgewicht een goede richtlijn. Tijdens een afvalfase ga je richting de bovenkant (±2,0 g/kg) om spiermassa te behouden. De calculator rekent dit automatisch voor je uit en verdeelt het over je maaltijden.",
  },
  {
    q: "Wat zijn macro's?",
    a: "Macronutriënten zijn de drie bouwstenen die energie leveren: eiwitten (4 kcal/g), koolhydraten (4 kcal/g) en vetten (9 kcal/g). Je totale calorieën bepalen of je aankomt of afvalt; je macroverdeling bepaalt hoe je je voelt, traint en herstelt.",
  },
  {
    q: "Klopt deze calculator precies?",
    a: "Het zijn betrouwbare richtwaarden op basis van de Mifflin-St Jeor-formule, de standaard die ook diëtisten gebruiken. Je werkelijke verbruik kan ±10% verschillen. Gebruik het cijfer als startpunt: weeg je 2–3 weken en stel bij op basis van wat de weegschaal en de spiegel doen.",
  },
];

export default function CalorieenBerekenen() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Fittin' calorie- en macrocalculator",
    applicationCategory: "HealthApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    url: `${SITE}/calorieen-berekenen`,
  };

  return (
    <main className="bg-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />

      <div className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Gratis tool</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-black md:text-5xl">Calorieën berekenen</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-brand/70">
          Bereken in een halve minuut hoeveel calorieën én macro's (eiwitten, koolhydraten, vetten)
          je per dag nodig hebt — om af te vallen, op gewicht te blijven of spiermassa op te bouwen.
          Je krijgt er meteen een voorbeeld dagplan bij. Geen account, geen gedoe.
        </p>

        <div className="mt-10">
          <CalorieCalculator />
        </div>

        {/* Explanation */}
        <section className="mt-16 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-black text-brand">Hoe werkt de berekening?</h2>
            <p className="mt-3 leading-relaxed text-brand/70">
              We gebruiken de <strong>Mifflin-St Jeor-formule</strong>, de meest accurate manier om je
              ruststofwisseling (BMR) te schatten — de energie die je lichaam in volledige rust
              verbruikt. Die vermenigvuldigen we met een activiteitsfactor tot je{" "}
              <strong>onderhoudsbehoefte (TDEE)</strong>: het aantal calorieën waarbij je gewicht
              stabiel blijft. Daarna passen we je doel toe (afvallen, onderhoud of opbouwen).
            </p>
            <div className="mt-5 rounded-2xl border border-borderc bg-white p-5 text-sm leading-relaxed text-brand/70">
              <p className="font-bold text-brand">De formule</p>
              <p className="mt-2">Mannen: 10×kg + 6,25×cm − 5×leeftijd + 5</p>
              <p>Vrouwen: 10×kg + 6,25×cm − 5×leeftijd − 161</p>
              <p className="mt-2">TDEE = BMR × activiteitsfactor (1,2 tot 1,9)</p>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-brand">En dan?</h2>
            <p className="mt-3 leading-relaxed text-brand/70">
              Een cijfer is een startpunt, geen wet. Eet 2–3 weken volgens je streefdoel, weeg jezelf
              een paar keer per week op een vast moment, en stel bij: val je niet af, dan trek je er
              100–150 kcal af; kom je te snel bij, dan doe je er wat carbs bij. Eiwitten hou je hoog —
              dat beschermt je spieren en houdt je langer verzadigd.
            </p>
            <p className="mt-3 leading-relaxed text-brand/70">
              Liever niet zelf prutsen? Bij Fittin' in Gent stelt een coach een plan op maat op — qua
              training én voeding — en volgt hij je vooruitgang op.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/personal-training" className="rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:opacity-90">Personal training</Link>
              <Link href="/boeken" className="rounded-full border-2 border-borderc px-6 py-3 text-sm font-bold text-brand transition hover:border-lav">Reserveer de gym</Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-16">
          <h2 className="text-2xl font-black text-brand">Veelgestelde vragen</h2>
          <div className="mt-6 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-borderc bg-white p-5">
                <summary className="cursor-pointer list-none font-bold text-brand">
                  <span className="mr-2 text-accentdark group-open:hidden">+</span>
                  <span className="mr-2 hidden text-accentdark group-open:inline">−</span>
                  {f.q}
                </summary>
                <p className="mt-3 leading-relaxed text-brand/70">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
