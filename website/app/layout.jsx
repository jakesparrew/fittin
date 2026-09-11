import "./globals.css";
import { Lato, Bricolage_Grotesque } from "next/font/google";
import PWARegister from "../components/PWARegister";
import PWAInstallPrompt from "../components/PWAInstallPrompt";
import IosReloginNudge from "../components/IosReloginNudge";
import PageView from "../components/analytics/PageView";
import ErrorLogger from "../components/ErrorLogger";
import ChunkErrorRecovery from "../components/ChunkErrorRecovery";

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-lato",
  display: "swap",
});

// Distinctive display face for headings — characterful, editorial; keeps the UI off the
// generic Inter/Arial/system default. Paired with Lato for refined body copy.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Fittin' | Privé fitness & personal training in Gent",
    template: "%s",
  },
  description:
    "Fittin' is een privé fitness in Gent. Reserveer de zaal voor jezelf (en vrienden) of train met een personal coach. Je eerste sessie is gratis.",
  applicationName: "Fittin'",
  appleWebApp: { capable: true, title: "Fittin'", statusBarStyle: "default" },
  // Safari op iPhone herkent uit zichzelf datums, adressen, telefoonnummers en e-mailadressen in de
  // tekst en verbouwt ze tot links — ná het laden, dus ná de HTML die de server stuurde. React ziet
  // dan een DOM die niet meer klopt met wat het verwacht en gooit hydratatiefout #418: niet één
  // element stuk, de hele pagina.
  //
  // Gemeten op 05-09-2026: twee keer op /coach/factuur, allebei vanaf een iPhone, allebei op de
  // factuur die de eigenaar net wou doorsturen. Precies de pagina die er het meest naar vraagt —
  // een factuur staat vol datums, een adres, een IBAN, een btw-nummer en een e-mailadres. De oude
  // #418-golf op /account had een andere oorzaak (de klok tijdens het renderen, zie
  // lib/hydration-clock.test.js) en die is al opgelost; dit is het tweede pad naar dezelfde fout.
  //
  // Het uitzetten kost niets: op een factuur wil je sowieso geen btw-nummer dat als telefoonnummer
  // gebeld kan worden.
  formatDetection: { telephone: false, date: false, address: false, email: false },
  // Bewust ZONDER title/description/url: die erven alle pagina's, waardoor elke gedeelde workout,
  // coach of oefening het homepagekaartje toonde. Next vult og:/twitter: title en description
  // automatisch met de title en description van de pagina zelf zodra ze hier ontbreken.
  openGraph: {
    type: "website",
    locale: "nl_BE",
    siteName: "Fittin'",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport = {
  // Eén waarde, want de site is standaard licht. Een meta-tag kan niet meebewegen met `data-theme`,
  // dus twee waarden op prefers-color-scheme zouden de balk donker maken voor iemand die de site
  // wél licht ziet — precies verkeerd om.
  themeColor: "#22194f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    // `suppressHydrationWarning` op <html>: het scriptje hieronder zet `data-theme` vóór React
    // begint, dus de server-HTML en de client-HTML verschillen daar met opzet. Zonder deze vlag is
    // dat een hydratatiewaarschuwing over precies het ding dat goed gaat.
    <html lang="nl" suppressHydrationWarning className={`${lato.variable} ${display.variable}`}>
      <head>
        {/* De oefeningdemo's staan nog op jsdelivr; zonder preconnect kost de eerste afbeelding een
            volledige DNS+TLS-ronde. Weg zodra de stills naar Supabase Storage gespiegeld zijn. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
      </head>
      <body className="bg-surface font-sans text-ink antialiased">
        {/* VÓÓR DE EERSTE VERF. Dit moet een inline script zijn en geen useEffect: een thema dat
            pas ná de hydratatie wordt toegepast, geeft bij élke paginalading een witte flits —
            dezelfde soort fout als hydratatiefout #418 in deze codebase, alleen zie je hem in
            plaats van dat hij in de console staat.

            Als EERSTE kind van <body>, en dat is geen willekeurige plek. Het stond eerst als broer
            van <body> rechtstreeks in <html>: geen geldige HTML ("`<script>` cannot be a child of
            `<html>`"), en React brak daarop de hydratatie van de HELE pagina af — met als gevolg
            dat geen enkele knop op de site nog werkte. Dat merk je niet aan een test en niet aan
            een screenshot; alleen aan klikken. In <head> is het in de App Router evenmin
            betrouwbaar, want Next hijst die inhoud zelf.

            Bewust minimaal, en het faalt stil: gaat localStorage niet open (privémodus, site-data
            geblokkeerd), dan blijft `prefers-color-scheme` gelden. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("fittin-thema");if(t==="dark"||t==="light"||t==="system")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        <PWARegister />
        <ChunkErrorRecovery />
        {children}
        <PWAInstallPrompt />
        <IosReloginNudge />
        <PageView />
        <ErrorLogger />
      </body>
    </html>
  );
}
