import "./globals.css";
import { Lato } from "next/font/google";
import PWARegister from "../components/PWARegister";

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-lato",
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
    "Fittin' is een privé fitness in Gent. Reserveer de zaal voor jezelf (en vrienden) of train met een personal coach. Eerste sessie gratis met code FittinWelcome.",
  applicationName: "Fittin'",
  appleWebApp: { capable: true, title: "Fittin'", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "nl_BE",
    siteName: "Fittin'",
    title: "Fittin' | Privé fitness & personal training in Gent",
    description:
      "Reserveer de privégym in Gent — alleen of met vrienden — of train met een personal coach.",
    url: siteUrl,
  },
};

export const viewport = {
  themeColor: "#22194f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl" className={lato.variable}>
      <body className="bg-white font-sans text-brand antialiased">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
