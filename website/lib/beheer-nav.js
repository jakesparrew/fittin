// Het beheermenu — één register voor de zijbalk én de tabs bovenaan de pagina's.
//
// Waarom zo (2026-09-19): de zijbalk telde 24 items en werd onleesbaar. Pagina's die bij dezelfde vraag horen
// ("hoeveel geld kwam er binnen?", "hoe groeit de gym?") staan nu onder één item, en de pagina's zelf blijven
// bereikbaar als tabs. Geen enkele URL verandert: bestaande links, mails en bladwijzers blijven werken.
//
// Een item zonder `tabs` is één pagina. Een item mét tabs is actief zodra je op één van die pagina's staat.

export const NAV = [
  {
    items: [
      { href: "/beheer", label: "Dashboard", icon: "▦" },
      { href: "/beheer/inbox", label: "Inbox", icon: "✉" },
      { href: "/beheer/meldingen", label: "Meldingen & netheid", icon: "🛟", tabs: [["/beheer/meldingen", "Meldingen"], ["/beheer/netheid", "Netheid & ervaring"]] },
      { href: "/beheer/notificaties", label: "Notificaties", icon: "🔔" },
    ],
  },
  {
    title: "Gym",
    items: [
      { href: "/beheer/boekingen", label: "Boekingen", icon: "▤" },
      { href: "/beheer/leden", label: "Leden", icon: "◍" },
      { href: "/beheer/coaches", label: "Coaches", icon: "♦", tabs: [["/beheer/coaches", "Coaches"], ["/beheer/aanbreng", "Aanbreng"]] },
    ],
  },
  {
    title: "Geld",
    items: [
      { href: "/beheer/betalingen", label: "Betalingen & financiën", icon: "€", tabs: [["/beheer/betalingen", "Betalingen"], ["/beheer/financien", "Financiën"], ["/beheer/abonnementen", "Abonnementen"]] },
    ],
  },
  {
    title: "Groei",
    items: [
      { href: "/beheer/punten", label: "Punten & community", icon: "🏅", tabs: [["/beheer/punten", "Punten"], ["/beheer/challenges", "Challenges"], ["/beheer/events", "Events"]] },
      { href: "/beheer/activatie", label: "Mails & campagnes", icon: "➤", tabs: [["/beheer/activatie", "Activatie"], ["/beheer/nieuwsbrief", "Nieuwsbrief"]] },
      { href: "/beheer/analytics", label: "Cijfers & verkeer", icon: "▰", tabs: [["/beheer/analytics", "Analytics"], ["/beheer/verkeer", "Websiteverkeer"]] },
    ],
  },
  {
    title: "Coaching",
    items: [
      { href: "/beheer/programmas", label: "Programma's & oefeningen", icon: "✎", tabs: [["/beheer/programmas", "Programma's"], ["/beheer/oefeningen", "Oefeningen"]] },
      { href: "/beheer/coaching", label: "AI-coach", icon: "◉" },
    ],
  },
  {
    title: "Instellingen",
    items: [
      { href: "/beheer/instellingen", label: "Instellingen & prijzen", icon: "⚙", tabs: [["/beheer/instellingen", "Algemeen"], ["/beheer/diensten", "Diensten & prijzen"], ["/beheer/pakketten", "Pakketten & abo"]] },
    ],
  },
];

const past = (pathname, href) => pathname === href || (href !== "/beheer" && pathname.startsWith(href + "/"));

/** Het menu-item waar deze pagina onder valt (voor de actieve kleur en de tabs). */
export function itemVoor(pathname) {
  let beste = null, lengte = -1;
  for (const g of NAV) for (const it of g.items) {
    for (const [href] of it.tabs || [[it.href]]) {
      if (past(pathname, href) && href.length > lengte) { beste = it; lengte = href.length; }
    }
  }
  return beste;
}

/** De actieve tab binnen een item. */
export function tabVoor(item, pathname) {
  let beste = null, lengte = -1;
  for (const [href, label] of item?.tabs || []) if (past(pathname, href) && href.length > lengte) { beste = { href, label }; lengte = href.length; }
  return beste;
}
