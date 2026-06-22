"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/coach", label: "Dashboard", icon: "▦" },
  { href: "/coach/notificaties", label: "Notificaties", icon: "🔔" },
  { href: "/coach/agenda", label: "Mijn agenda", icon: "▤" },
  { href: "/coach/profiel", label: "Mijn profiel", icon: "◐" },
  { href: "/coach/clienten", label: "Mijn clienten", icon: "◍" },
  { href: "/coach/berichten", label: "Berichten", icon: "✉" },
  { href: "/coach/betalingen", label: "Betalingen", icon: "◈" },
  { href: "/coach/programmas", label: "Programma's & oefeningen", icon: "✎" },
  { href: "/coach/events", label: "Events", icon: "◆" },
  { href: "/coach/beschikbaarheid", label: "Beschikbaarheid", icon: "◷" },
];

export default function CoachSidebar({ name, role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const linkClass = (href) => {
    const active = pathname === href || (href !== "/coach" && pathname.startsWith(href));
    return "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition " + (active ? "bg-accent text-brand" : "text-lav hover:bg-white/10 hover:text-white");
  };
  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-brand px-4 py-3 text-white md:hidden">
        <Link href="/" className="text-xl font-black">Fittin<span className="text-accent">&rsquo;</span> <span className="ml-1 text-xs font-semibold uppercase tracking-widest text-lav">Coach</span></Link>
        <button onClick={() => setOpen(true)} aria-label="Menu openen" className="rounded-lg px-3 py-1.5 text-2xl leading-none hover:bg-white/10">☰</button>
      </div>
      {/* Backdrop (mobile, when drawer open) */}
      {open && <div onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/50 md:hidden" aria-hidden />}
      {/* Sidebar: static column on desktop, slide-in drawer on mobile */}
      <aside className={"fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col overflow-y-auto bg-brand text-white transition-transform md:static md:z-auto md:w-60 md:translate-x-0 " + (open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between px-6 py-6">
          <div>
            <Link href="/" className="text-2xl font-black">Fittin<span className="text-accent">&rsquo;</span></Link>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-lav">Coach</p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Menu sluiten" className="rounded-lg px-2 py-1 text-xl leading-none text-lav hover:bg-white/10 md:hidden">✕</button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {items.map((it) => (
            <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className={linkClass(it.href)}>
              <span className="w-4 text-center">{it.icon}</span>
              {it.label}
            </Link>
          ))}
          {role === "beheerder" && (
            <Link href="/beheer" onClick={() => setOpen(false)} className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-lav hover:bg-white/10 hover:text-white">
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
    </>
  );
}
