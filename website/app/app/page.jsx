import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth";

// The native app's start URL (capacitor.config.js → server.url = https://fittin.be/app).
// Logged in → straight to your own home. Logged out → the welcome screen below.
//
// It CONTINUES the launch screen: same indigo, same wordmark at the same size (200pt on iOS,
// LaunchScreen.storyboard; 160dp on Android, the system splash) in the same centre. After the
// splash fades there is no jump — the logo glides up and the choices rise into place.
export const dynamic = "force-dynamic";
export const metadata = { title: "Fittin’", robots: { index: false, follow: false } };

export default async function AppStart() {
  const { user, profile } = await getSessionProfile();
  if (user) redirect(roleHome(profile?.role));

  return (
    // A page, not an overlay: it has the whole viewport to itself (no Nav/tab bar outside the
    // (site) group) and must NOT fade in — behind the splash that would flash white.
    <main data-statusbar="light" className="relative h-dvh overflow-hidden bg-brand text-white">
      {/* The gym itself, barely there: it fades in after the logo has moved. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/gym/zaal-logo-staand-800.webp"
        alt=""
        aria-hidden="true"
        className="welkom-foto absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-brand/80 via-brand/70 to-brand" aria-hidden="true" />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-white.svg"
        alt="Fittin’"
        width={200}
        height={57}
        className="welkom-logo absolute left-1/2 top-1/2 w-[200px] -translate-x-1/2 -translate-y-1/2 android:w-[160px]"
      />

      <div
        className="absolute inset-x-0 bottom-0 px-6"
        style={{ paddingBottom: "calc(var(--sab) + 28px)" }}
      >
        <div className="welkom-in mx-auto max-w-sm" style={{ animationDelay: "520ms" }}>
          <span className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-black uppercase tracking-widest text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Je eerste uur is gratis
          </span>
          <h1 className="mt-4 text-[2.1rem] font-black leading-[1.05] text-white">
            De hele zaal.<br />Alleen voor jou.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-lav">
            Privégym in Gent, elke dag van 6 tot 23 uur. Geen lidgeld — je betaalt enkel voor je tijd.
          </p>
        </div>

        <div className="welkom-in mx-auto mt-8 max-w-sm space-y-3" style={{ animationDelay: "640ms" }}>
          <Link
            href="/login?mode=signup&next=/boeken"
            className="flex h-14 w-full items-center justify-center rounded-full bg-accent text-base font-black text-brand"
          >
            Account aanmaken
          </Link>
          <Link
            href="/login"
            className="flex h-14 w-full items-center justify-center rounded-full border-2 border-white/25 text-base font-black text-white"
          >
            Ik heb al een account
          </Link>
          <Link href="/boeken" className="block py-2 text-center text-sm font-bold text-lav">
            Eerst rondkijken
          </Link>
        </div>
      </div>
    </main>
  );
}
