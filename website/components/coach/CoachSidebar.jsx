"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/coach", label: "Dashboard", icon: "▦" },
  { href: "/notificaties", label: "Notificaties", icon: "🔔" },
  { href: "/coach/agenda", label: "Mijn agenda", icon: "▤" },
  { href: "/coach/profiel", label: "Mijn profiel", icon: "◐" },
  { href: "/coach/clienten", label: "Mijn clienten", icon: "◍" },
  { href: "/coach/betalingen", label: "Betalingen", icon: "◈" },
  { href: "/coach/programmas", label: "Programma's & oefeningen", icon: "✎" },
  { href: "/coach/events", label: "Events", icon: "◆" },
  { href: "/coach/beschikbaarheid", label: "Beschikbaarheid", icon: "◷" },
];

export default function CoachSidebar({ name, role }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col bg-brand text-white">
      <div className="px-6 py-6">
        <Link href="/" className="text-2xl font-black">
          Fittin<span className="text-accent">&rsquo;</span>
        </Link>
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-lav">Coach</p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((it) => {
          const active = pathname === it.href || (it.href !== "/coach" && pathname.startsWith(it.href));
          return (
            <Link
              key={it.href}
              href={it.href}
              className={
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition " +
                (active ? "bg-accent text-brand" : "text-lav hover:bg-white/10 hover:text-white")
              }
            >
              <span className="w-4 text-center">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
        {role === "beheerder" && (
          <Link href="/beheer" className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-lav hover:bg-white/10 hover:text-white">
            <span className="w-4 text-center">⚙</span> Beheer
          </Link>
        )}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="text-sm font-bold">{name}</p>
        <p className="text-xs capitalize text-lav">{role}</p>
        <div className="mt-3 flex gap-3">
          <Link href="/" className="text-xs font-semibold text-lav hover:text-white">← Site</Link>
          <form action="/auth/signout" method="post">
            <button className="text-xs font-semibold text-lav hover:text-white">Uitloggen</button>
          </form>
        </div>
      </div>
    </aside>
  );
}
