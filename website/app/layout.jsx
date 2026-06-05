import "./globals.css";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import PWARegister from "../components/PWARegister";
import { getSessionProfile } from "@/lib/auth";

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

export default async function RootLayout({ children }) {
  const { profile } = await getSessionProfile();
  const account = profile
    ? { name: profile.full_name || "Account", role: profile.role }
    : null;

  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white font-sans text-brand antialiased">
        <PWARegister />
        <Nav account={account} />
        {children}
        <Footer />
      </body>
    </html>
  );
}
