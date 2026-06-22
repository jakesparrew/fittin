import Link from "next/link";
import NewsletterSignup from "./NewsletterSignup";

export default function Footer() {
  return (
    <footer className="bg-brand text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-3">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="Fittin'" width={170} height={45} className="h-10 w-auto" />
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
            <li><Link href="/lidmaatschap" className="transition hover:text-white">Lidmaatschap</Link></li>
            <li><Link href="/boeken" className="transition hover:text-white">Online boeken</Link></li>
            <li><Link href="/workouts" className="transition hover:text-white">Workouts</Link></li>
            <li><Link href="/huisregels" className="transition hover:text-white">Toegang &amp; huisregels</Link></li>
            <li><Link href="/calorieen-berekenen" className="transition hover:text-white">Calorieën berekenen</Link></li>
            <li><Link href="/supplementen" className="transition hover:text-white">Supplementen</Link></li>
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
            <li className="flex gap-4 pt-2">
              <a href="https://www.instagram.com/fittin_gent/" className="font-semibold transition hover:text-white">Instagram</a>
              <a href="https://www.facebook.com/fittingent" className="font-semibold transition hover:text-white">Facebook</a>
            </li>
            <li className="pt-2 text-xs text-lav/70">De Wereld Draait Door VZW · BE 0772.565.606</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-lav/70">
        © 2026 Fittin&rsquo; · Alle rechten voorbehouden
      </div>
    </footer>
  );
}
