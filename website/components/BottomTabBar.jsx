"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/components/useMe";
import { TAB_ICONS, tabsFor, isTabActive, APP_NO_TABBAR } from "@/components/tabs";
import useIsApp from "@/components/native/useIsApp";

// App-like mobile bottom tab bar (hidden on md+, where the top nav takes over). Role-aware: tabs
// adapt to logged-out / lid / coach / beheerder. Role comes from /api/me (same source as Nav).
// The tab list is shared with the native iOS bar (components/tabs.js).
//
// In the iOS app a real UITabBar replaces this one (`nativebar:hidden`); on Android it stays, with
// the gesture/3-button navigation inset under it.
function Icon({ d }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export default function BottomTabBar() {
  const pathname = usePathname() || "/";
  const app = useIsApp();
  // Dezelfde /api/me-oproep als Nav (zie useMe.js): één antwoord voor beide balken, en niet langer
  // opnieuw ophalen bij elke paginawissel — rol en teller veranderen daar niet van.
  const me = useMe();
  const role = me ? (me.loggedIn ? me.role || "lid" : null) : undefined; // undefined=loading, null=gast
  const unread = me?.unread || 0;

  // Tijdens een trainingssessie verdwijnt de balk. Dat scherm heeft een eigen ✕ met bevestiging;
  // een tabbalk eronder nodigt uit om er middenin weg te tikken, en dekt bovendien de rusttimer af.
  if (pathname.startsWith("/training/sessie")) return null;
  // In de app zijn inloggen en het welkomstscherm schermvullend.
  if (app && APP_NO_TABBAR.some((p) => pathname.startsWith(p))) return null;

  const tabs = tabsFor(role, { app });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-borderc bg-surface/95 backdrop-blur md:hidden nativebar:hidden" style={{ paddingBottom: "var(--sab)" }}>
      {/* min-w-0 op elk tabblad is hier geen detail: een flex-item krimpt standaard niet onder de
          breedte van zijn langste woord, en "Oefeningen" past met vijf tabs niet op een smal
          scherm — op 320px liep de balk 23px over en werd de laatste tab afgeknipt. Zelfde valkuil
          als bij de sets-grid. Het label mag nu afbreken met puntjes; het icoon blijft heel. */}
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map(({ href, label, icon }) => {
          const act = isTabActive(href, pathname);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                onClick={() => {
                  if (!app) return;
                  if (act) window.scrollTo({ top: 0, behavior: "smooth" }); // native: tap the active tab → top
                  import("@/lib/native/haptics").then((h) => h.hapticSelect()).catch(() => {});
                }}
                className={"relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition " + (act ? "text-accentdark" : "text-ink/55 hover:text-ink")}
              >
                <span className="relative">
                  <Icon d={TAB_ICONS[icon]} />
                  {href === "/account" && unread > 0 && (
                    <span className="absolute -right-2 -top-1 min-w-[15px] rounded-full bg-red-500 px-1 text-center text-[9px] font-black leading-[15px] text-white">{unread > 9 ? "9+" : unread}</span>
                  )}
                </span>
                <span className="w-full truncate px-0.5 text-center">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
