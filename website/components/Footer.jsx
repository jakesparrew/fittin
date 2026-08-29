import Link from "next/link";
import NewsletterSignup from "./NewsletterSignup";

export default function Footer() {
  return (
    <footer className="bg-brand text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-3">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* Onderaan de pagina: laat de browser dit logo pas ophalen als het in beeld komt, zodat
              het niet meedingt met de bandbreedte van wat de bezoeker meteen ziet. */}
          <img src="/logo-white.png" alt="Fittin'" width={170} height={45} loading="lazy" decoding="async" className="h-10 w-auto" />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-lav">
            Privé fitness &amp; personal training in Gent. Train alleen, met vrienden of met je
            coach — de zaal is van jou.
          </p>
          <div className="mt-5 max-w-xs">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Nieuwsbrief</p>
            <p className="mt-2 mb-3 text-sm text-lav">Tips, openingsuren &amp; acties — af en toe, nooit spam.</p>
            <NewsletterSignup />
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Menu</p>
          <ul className="mt-4 space-y-2 text-sm text-lav">
            <li><Link href="/" className="transition hover:text-white">Home</Link></li>
            <li><Link href="/degym" className="transition hover:text-white">De gym</Link></li>
            <li><Link href="/personal-training" className="transition hover:text-white">Personal training</Link></li>
            <li><Link href="/coaches" className="transition hover:text-white">Coaches</Link></li>
            <li><Link href="/coach-worden" className="transition hover:text-white">Word coach</Link></li>
            {/* Dezelfde pagina heette in de nav "Prijzen" en hier "Lidmaatschap" — dat laatste botst
                bovendien met de hoofdboodschap "geen lidgeld". Eén naam, de URL blijft. */}
            <li><Link href="/lidmaatschap" className="transition hover:text-white">Prijzen</Link></li>
            <li><Link href="/boeken" className="transition hover:text-white">Online boeken</Link></li>
            <li><Link href="/workouts" className="transition hover:text-white">Workouts</Link></li>
            <li><Link href="/huisregels" className="transition hover:text-white">Toegang &amp; huisregels</Link></li>
            <li><Link href="/calorieen-berekenen" className="transition hover:text-white">Calorieën berekenen</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Contact</p>
          <ul className="mt-4 space-y-2 text-sm text-lav">
            <li>
              <a href="mailto:info@fittin.be" className="transition hover:text-white">info@fittin.be</a>
            </li>
            <li>Aannemersstraat 186, 9040 Gent</li>
            <li>Gratis parking</li>
            {/* Enkel Instagram. De Facebook-pagina /fittingent is niet meer in ons beheer (gehackt),
                dus we sturen er geen bezoekers meer heen. Ze staat om dezelfde reden ook niet meer in
                de sameAs van de structured data — zie lib/seo.js. */}
            <li className="flex gap-4 pt-2">
              <a href="https://www.instagram.com/fittin_gent/" className="font-semibold transition hover:text-white">Instagram</a>
            </li>
            <li className="pt-2 text-xs text-lav/70">De Wereld Draait Door VZW · BE 0772.565.606</li>
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/10 py-5 text-center text-xs text-lav/70">
        <span>© 2026 Fittin&rsquo;</span>
        <span aria-hidden>·</span>
        <Link href="/hulp" className="font-bold transition hover:text-white">Hulp &amp; contact</Link>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="transition hover:text-white">Privacybeleid</Link>
        <span aria-hidden>·</span>
        <Link href="/voorwaarden" className="transition hover:text-white">Algemene voorwaarden</Link>
        <span aria-hidden>·</span>
        <Link href="/cookies" className="transition hover:text-white">Cookies</Link>
        <span aria-hidden>·</span>
        <Link href="/disclosure" className="transition hover:text-white">Disclosure</Link>
      </div>
    </footer>
  );
}
