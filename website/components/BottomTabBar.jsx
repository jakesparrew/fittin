"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/components/useMe";

// App-like mobile bottom tab bar (hidden on md+, where the top nav takes over). Role-aware: tabs
// adapt to logged-out / lid / coach / beheerder. Role comes from /api/me (same source as Nav).
const ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  cal: "M3 9h18M7 3v4M17 3v4M5 5h14v16H5z",
  dumbbell: "M6.5 6.5l11 11M4 9l2-2 3 3-2 2zM15 18l2-2 3 3-2 2zM2 11l2 2M20 11l2 2",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  play: "M6 4l14 8-14 8z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  whistle: "M14 11a5 5 0 11-9.9-1H14zM14 9l6-3M12 16v3",
};
function Icon({ d }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

const TABS = {
  guest: [["/", "Home", "home"], ["/boeken", "Boeken", "cal"], ["/workouts", "Workouts", "dumbbell"], ["/oefeningen", "Oefeningen", "list"], ["/login", "Inloggen", "user"]],
  lid: [["/boeken", "Boeken", "cal"], ["/workouts", "Workouts", "dumbbell"], ["/training", "Training", "play"], ["/oefeningen", "Oefeningen", "list"], ["/account", "Account", "user"]],
  coach: [["/boeken", "Boeken", "cal"], ["/workouts", "Workouts", "dumbbell"], ["/oefeningen", "Oefeningen", "list"], ["/coach", "Coach", "whistle"], ["/account", "Account", "user"]],
  beheerder: [["/boeken", "Boeken", "cal"], ["/workouts", "Workouts", "dumbbell"], ["/oefeningen", "Oefeningen", "list"], ["/beheer", "Beheer", "shield"], ["/account", "Account", "user"]],
};

export default function BottomTabBar() {
  const pathname = usePathname() || "/";
  // Dezelfde /api/me-oproep als Nav (zie useMe.js): één antwoord voor beide balken, en niet langer
  // opnieuw ophalen bij elke paginawissel — rol en teller veranderen daar niet van.
  const me = useMe();
  const role = me ? (me.loggedIn ? me.role || "lid" : null) : undefined; // undefined=loading, null=gast
  const unread = me?.unread || 0;

  // Tijdens een trainingssessie verdwijnt de balk. Dat scherm heeft een eigen ✕ met bevestiging;
  // een tabbalk eronder nodigt uit om er middenin weg te tikken, en dekt bovendien de rusttimer af.
  if (pathname.startsWith("/training/sessie")) return null;

  const tabs = !role ? TABS.guest : TABS[role] || TABS.lid;
  const isActive = (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-borderc bg-white/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {/* min-w-0 op elk tabblad is hier geen detail: een flex-item krimpt standaard niet onder de
          breedte van zijn langste woord, en "Oefeningen" past met vijf tabs niet op een smal
          scherm — op 320px liep de balk 23px over en werd de laatste tab afgeknipt. Zelfde valkuil
          als bij de sets-grid. Het label mag nu afbreken met puntjes; het icoon blijft heel. */}
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map(([href, label, icon]) => {
          const act = isActive(href);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link href={href} className={"relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition " + (act ? "text-accentdark" : "text-brand/55 hover:text-brand")}>
                <span className="relative">
                  <Icon d={ICONS[icon]} />
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
