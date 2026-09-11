"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/components/useMe";
import { isTabRoot } from "@/components/tabs";
import useIsApp from "@/components/native/useIsApp";

// Marketing nav — shown to logged-out visitors.
const links = [
  { href: "/degym", label: "De gym" },
  { href: "/personal-training", label: "Personal training" },
  { href: "/coaches", label: "Coaches" },
  { href: "/lidmaatschap", label: "Prijzen" },
  { href: "/workouts", label: "Workouts" },
  { href: "/oefeningen", label: "Oefeningen" },
  { href: "/boeken", label: "Online boeken" },
];

// Trimmed nav for logged-in members — no homepage/sales links.
const memberLinks = [
  { href: "/boeken", label: "Online boeken" },
  { href: "/workouts", label: "Workouts" },
  { href: "/training", label: "Training" },
  { href: "/plannen", label: "Plannen" },
  { href: "/oefeningen", label: "Oefeningen" },
  { href: "/community", label: "Community" },
];

// Coaches/beheerders: keep the bar useful (matches the mobile bottom-bar) — they also have a
// dashboard button on the right. Without this the logged-in staff nav was empty in the middle.
const staffLinks = [
  { href: "/boeken", label: "Boeken" },
  { href: "/workouts", label: "Workouts" },
  { href: "/oefeningen", label: "Oefeningen" },
  { href: "/community", label: "Community" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "/";
  const router = useRouter();
  const app = useIsApp();
  // Gedeeld met BottomTabBar — samen nog één /api/me-oproep per pagina i.p.v. twee (zie useMe.js).
  const me = useMe();
  // Optimistic logged-in hint from a visible Supabase cookie so the nav doesn't flash "Inloggen".
  // We ALWAYS confirm with /api/me — the auth-token cookie can be httpOnly/chunked and invisible
  // to document.cookie, so a logged-in member must still reliably get the member nav.
  const [sbCookie, setSbCookie] = useState(false);
  useEffect(() => {
    setSbCookie(document.cookie.split(";").some((c) => c.trim().startsWith("sb-")));
  }, []);

  // Android-terugknop in de app: eerst het open menu dicht, pas daarna terug (NativeBoot).
  useEffect(() => {
    if (!open) return;
    const onBack = (e) => { e.preventDefault(); setOpen(false); };
    window.addEventListener("fittin:back", onBack);
    return () => window.removeEventListener("fittin:back", onBack);
  }, [open]);

  const account = me
    ? (me.loggedIn ? { name: me.name, role: me.role, home: me.home, unread: me.unread || 0 } : null)
    : (sbCookie ? { name: "Account", role: "lid", home: "/account" } : null);

  const isStaff = account && ["coach", "beheerder"].includes(account.role);
  const staffLabel = account?.role === "beheerder" ? "Beheer" : "Coach";
  const home = account?.home || "/account";
  // Logged-out → marketing links; member → member app links; staff → a useful subset (+ dashboard button).
  const navLinks = !account ? links : isStaff ? staffLinks : memberLinks;

  // In de app: een pagina die geen tabblad is, krijgt een terugpijl (zoals elk native scherm). Het
  // logo leidt er naar je eigen startpunt, niet naar de verkoopspagina.
  const showBack = app && !isTabRoot(pathname);
  const logoHref = app ? (account ? home : "/app") : "/";

  return (
    // app:pt-(--sat): de kopbalk zelf loopt door onder de statusbalk, de inhoud begint eronder.
    <header className="sticky top-0 z-50 border-b border-borderc/70 bg-surface/80 backdrop-blur-xl app:pt-(--sat)">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <div className="flex min-w-0 items-center gap-1">
          {showBack && (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? router.back() : router.push(logoHref))}
              aria-label="Terug"
              className="-ml-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          )}
          <Link href={logoHref} className="group flex items-center" aria-label="Fittin' — home">
            {/* Twee versies, CSS kiest. Het wordmark is donkerindigo, dus in het donkere thema stond
                het onzichtbaar in een donkere balk. Een `src` omwisselen kan CSS niet; met JS zou je
                tot de hydratatie het verkeerde logo zien staan. Zie .bij-licht/.bij-donker. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Fittin'" width={150} height={40} className="bij-licht h-8 w-auto transition group-hover:opacity-80" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.png" alt="" aria-hidden="true" width={170} height={45} className="bij-donker h-8 w-auto transition group-hover:opacity-80" />
          </Link>
        </div>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-ink/70 md:flex">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="relative transition hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {!account && (
            <>
              <Link href="/login" className="hidden text-sm font-bold text-ink/70 transition hover:text-ink sm:block">Inloggen</Link>
              <Link href="/login?mode=signup" className="hidden rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand shadow-sm shadow-accent/30 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-accent/40 sm:block">
                Word lid
              </Link>
            </>
          )}
          {account && (
            // In de app altijd zichtbaar: een bel hoort in een app-kopbalk, niet verstopt in een menu.
            <Link href="/notificaties" className="relative hidden rounded-full p-2 text-ink/70 transition hover:bg-paper hover:text-ink sm:block app:block" aria-label="Notificaties">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {account.unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-black text-brand">{account.unread > 9 ? "9+" : account.unread}</span>
              )}
            </Link>
          )}
          {account && isStaff && (
            <>
              <form action="/auth/signout" method="post" className="hidden sm:block">
                <button className="text-sm font-bold text-ink/60 transition hover:text-ink">Uitloggen</button>
              </form>
              <Link href={home} className="hidden rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:opacity-90 sm:block">
                {staffLabel} →
              </Link>
            </>
          )}
          {account && !isStaff && (
            <>
              <Link href="/account" className="hidden rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 sm:block">
                {account.name?.split(" ")[0] || "Account"}
              </Link>
              <Link href="/boeken" className="hidden rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand shadow-sm shadow-accent/30 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-accent/40 sm:block">
                Reserveer de gym
              </Link>
            </>
          )}
          {/* h-11 w-11 = 44x44: het enige navigatie-element van de kopbalk op mobiel mag geen 38x32-doelwit
              zijn. flex-col + justify-center houdt het streepjes-icoon exact zoals het was; enkel het
              aanraakvlak groeit, de kopbalk (h-16) blijft even hoog. */}
          <button onClick={() => setOpen(!open)} className="flex h-11 w-11 flex-col items-center justify-center rounded-lg border border-borderc md:hidden" aria-label="Menu" aria-expanded={open} aria-controls="mobile-menu">
            <span className="mb-1 block h-0.5 w-5 bg-brand"></span>
            <span className="mb-1 block h-0.5 w-5 bg-brand"></span>
            <span className="block h-0.5 w-5 bg-brand"></span>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-menu" className="anim-in max-h-[calc(100dvh-4rem-var(--sat))] overflow-y-auto border-t border-borderc bg-surface px-5 py-4 md:hidden">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2 font-semibold text-ink">{l.label}</Link>
          ))}
          <div className="mt-2 border-t border-borderc pt-2">
            {account && (
              <Link href="/notificaties" onClick={() => setOpen(false)} className="block py-2 font-semibold text-ink">
                Notificaties{account.unread > 0 ? ` (${account.unread > 9 ? "9+" : account.unread})` : ""}
              </Link>
            )}
            {/* Hulp staat bewust in dit onderste blok, naast Notificaties en Mijn account: wie
                vastloopt zoekt daar. Bereikbaar zónder login — juist wie niet binnen raakt,
                heeft de hulppagina nodig. */}
            <Link href="/hulp" onClick={() => setOpen(false)} className="block py-2 font-semibold text-ink">🛟 Hulp &amp; contact</Link>
            {isStaff && <Link href={home} onClick={() => setOpen(false)} className="block py-2 font-bold text-accentdark">{staffLabel} →</Link>}
            {account && isStaff ? (
              <form action="/auth/signout" method="post"><button className="block py-2 font-bold text-ink">Uitloggen</button></form>
            ) : (
              <Link href={account ? "/account" : "/login?mode=signup"} onClick={() => setOpen(false)} className="block py-2 font-bold text-ink">
                {account ? "Mijn account" : "Inloggen / word lid"}
              </Link>
            )}
          </div>
          {/* In de app is er geen voetbalk: de juridische pagina's moeten ergens bereikbaar blijven
              (App Review controleert dat de privacyverklaring in de app te vinden is). */}
          <div className="mt-3 hidden flex-wrap gap-x-4 gap-y-1 border-t border-borderc pt-3 text-xs font-semibold text-ink/55 app:flex">
            <Link href="/privacy" onClick={() => setOpen(false)}>Privacy</Link>
            <Link href="/voorwaarden" onClick={() => setOpen(false)}>Voorwaarden</Link>
            <Link href="/huisregels" onClick={() => setOpen(false)}>Huisregels</Link>
            <Link href="/account-verwijderen" onClick={() => setOpen(false)}>Account verwijderen</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
