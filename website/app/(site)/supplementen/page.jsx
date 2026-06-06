import Link from "next/link";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";
export const metadata = {
  title: "Supplementen die wij aanraden | Fittin'",
  description: "Onze aanraders voor sportvoeding: eiwitten, creatine, pre-workout en vitamines. Met korting bij Body & Fit.",
  alternates: { canonical: `${SITE}/supplementen` },
};

// Curated picks → outbound affiliate redirect (/go/bodyfit logs + forwards via Awin).
const go = (dest, slug) => `/go/bodyfit?p=${slug}&to=${encodeURIComponent(dest)}`;
const PICKS = [
  { slug: "whey", title: "Whey proteïne", blurb: "Sneller herstel en spieropbouw. De makkelijkste manier om je eiwitten te halen — zeker na een sessie.", dest: "https://www.bodyandfit.com/nl-be/sportvoeding/eiwitten/", emoji: "🥛" },
  { slug: "creatine", title: "Creatine monohydraat", blurb: "Het best onderbouwde supplement voor kracht en volume. 3–5 g per dag, simpel en goedkoop.", dest: "https://www.bodyandfit.com/nl-be/sportvoeding/creatine/", emoji: "💪" },
  { slug: "preworkout", title: "Pre-workout", blurb: "Een extra boost focus en energie voor je zware sessies.", dest: "https://www.bodyandfit.com/nl-be/sportvoeding/pre-workout/", emoji: "⚡" },
  { slug: "vitamines", title: "Vitamines & mineralen", blurb: "Vul de gaten in je voeding op — vitamine D, magnesium en een goede multi.", dest: "https://www.bodyandfit.com/nl-be/gezondheid/", emoji: "🟢" },
  { slug: "repen", title: "Eiwitrepen & snacks", blurb: "Een lekkere, eiwitrijke snack voor onderweg of na de gym.", dest: "https://www.bodyandfit.com/nl-be/sportvoeding/eiwitrepen-snacks/", emoji: "🍫" },
  { slug: "omega3", title: "Omega-3 visolie", blurb: "Goed voor hart, gewrichten en herstel. Een klassieker die in geen enkele kast mag ontbreken.", dest: "https://www.bodyandfit.com/nl-be/gezondheid/visolie-omega-3/", emoji: "🐟" },
];

export default function Supplementen() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Onze aanraders</p>
        <h1 className="mt-2 text-4xl font-black md:text-5xl">Supplementen die wij aanraden</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-brand/70">
          Voeding doet 80% van het werk. Dit zijn de supplementen die wij onze leden aanraden — niet
          omdat het moet, maar omdat ze echt helpen. We bestellen zelf bij <strong>Body &amp; Fit</strong>:
          goede kwaliteit, snelle levering.
        </p>
        <p className="mt-2 text-xs text-brand/40">
          Affiliate: koop je via onze links, dan krijgen wij mogelijk een kleine commissie — voor jou
          verandert de prijs niet. <Link href="/disclosure" className="underline">Meer info</Link>.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PICKS.map((p) => (
            <div key={p.slug} className="flex flex-col rounded-3xl border border-borderc bg-white p-6">
              <div className="text-3xl">{p.emoji}</div>
              <h2 className="mt-3 text-lg font-black text-brand">{p.title}</h2>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-brand/60">{p.blurb}</p>
              <a href={go(p.dest, p.slug)} target="_blank" rel="sponsored nofollow noopener" className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-center text-sm font-bold text-brand transition hover:opacity-90">
                Bekijk bij Body &amp; Fit →
              </a>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-3xl bg-brand p-8 text-white">
          <p className="text-xl font-black">Niet zeker wat je nodig hebt?</p>
          <p className="mt-2 max-w-xl text-lav">Bereken eerst je eiwit- en caloriebehoefte, of laat een coach een plan op maat maken.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/calorieen-berekenen" className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-brand">Bereken je behoefte</Link>
            <Link href="/coaches" className="rounded-full border-2 border-white/20 px-6 py-3 text-sm font-bold text-white">Vind een coach</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
