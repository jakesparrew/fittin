import Link from "next/link";

// Zonder eigen description erfde deze pagina die van de homepage ("privé fitness in Gent...") —
// in Google en bij delen las /disclosure dus als de startpagina.
export const metadata = {
  title: "Affiliate-disclosure | Fittin'",
  description:
    "Hoe Fittin' omgaat met affiliate-links en partners. Op dit moment staan er geen affiliate-links op fittin.be.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be"}/disclosure` },
};

export default function Disclosure() {
  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-2xl px-5 py-16">
        <Link href="/" className="text-sm font-semibold text-brand/50 hover:text-brand">← Home</Link>
        <h1 className="mt-4 text-3xl font-black text-brand md:text-4xl">Affiliate-disclosure</h1>
        <div className="mt-6 space-y-4 leading-relaxed text-brand/70">
          {/* Stond hier: "sommige links zijn affiliate-links … partner zoals Body & Fit". Dat klopte
              niet — er is nooit een affiliate-account geactiveerd (AWIN_AFFID is nergens ingevuld,
              nagemeten op de live site: de link ging rechtstreeks naar de winkel, niet via Awin), en
              de supplementenpagina staat sinds 29-08-2026 tijdelijk uit. Een disclosure die een
              commissie meldt die niet bestaat, is even onjuist als er geen melden. */}
          <p>
            <strong>Op dit moment staan er geen affiliate-links op fittin.be.</strong> We verdienen
            dus niets aan producten die we vermelden.
          </p>
          <p>
            Verandert dat ooit, dan zeggen we het hier én op de pagina zelf. Onze regel blijft
            dezelfde: we vermelden enkel wat we zelf gebruiken of zinvol vinden voor onze leden, een
            partner krijgt nooit een plaats <em>omdat</em> het een partner is, en aan jouw prijs
            verandert er nooit iets.
          </p>
          <p className="text-sm text-brand/50">
            Vragen? Mail ons gerust op <a href="mailto:info@fittin.be" className="underline">info@fittin.be</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
