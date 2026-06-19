"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [role, setRole] = useState(undefined); // undefined=loading, null=guest, else role
  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (active) setRole(d?.loggedIn ? (d.role || "lid") : null); })
      .catch(() => { if (active) setRole(null); });
    return () => { active = false; };
  }, []);

  const tabs = !role ? TABS.guest : TABS[role] || TABS.lid;
  const isActive = (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-borderc bg-white/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {tabs.map(([href, label, icon]) => {
          const act = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link href={href} className={"flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition " + (act ? "text-accentdark" : "text-brand/55 hover:text-brand")}>
                <Icon d={ICONS[icon]} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
