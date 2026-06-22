"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  { items: [{ href: "/beheer", label: "Dashboard", icon: "▦" }, { href: "/beheer/analytics", label: "Analytics", icon: "▰" }, { href: "/beheer/verkeer", label: "Websiteverkeer", icon: "🌐" }, { href: "/beheer/notificaties", label: "Notificaties", icon: "🔔" }, { href: "/beheer/inbox", label: "Inbox", icon: "✉" }] },
  { title: "Gym", items: [
    { href: "/beheer/boekingen", label: "Boekingen", icon: "▤" },
    { href: "/beheer/leden", label: "Leden", icon: "◍" },
    { href: "/beheer/coaches", label: "Coaches", icon: "♦" },
    { href: "/beheer/betalingen", label: "Betalingen", icon: "◈" },
  ] },
  { title: "Coaching", items: [
    { href: "/beheer/programmas", label: "Programma's & oefeningen", icon: "✎" },
  ] },
  { title: "Groei", items: [
    { href: "/beheer/nieuwsbrief", label: "Nieuwsbrief", icon: "➤" },
    { href: "/beheer/activatie", label: "Activatie", icon: "✦" },
    { href: "/beheer/challenges", label: "Challenges", icon: "★" },
    { href: "/beheer/events", label: "Events", icon: "◆" },
  ] },
  { title: "Instellingen", items: [
    { href: "/beheer/diensten", label: "Diensten & prijzen", icon: "€" },
    { href: "/beheer/pakketten", label: "Pakketten & abo", icon: "▣" },
    { href: "/beheer/instellingen", label: "Algemeen", icon: "⚙" },
  ] },
];

export default function AdminSidebar({ name, role }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const linkClass = (href) => {
    const active = pathname === href || (href !== "/beheer" && pathname.startsWith(href));
    return "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition " + (active ? "bg-accent text-brand" : "text-lav hover:bg-white/10 hover:text-white");
  };
  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-brand px-4 py-3 text-white md:hidden">
        <Link href="/" className="text-xl font-black">Fittin<span className="text-accent">&rsquo;</span> <span className="ml-1 text-xs font-semibold uppercase tracking-widest text-lav">Beheer</span></Link>
        <button onClick={() => setOpen(true)} aria-label="Menu openen" className="rounded-lg px-3 py-1.5 text-2xl leading-none hover:bg-white/10">☰</button>
      </div>
      {/* Backdrop (mobile, when drawer open) */}
      {open && <div onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/50 md:hidden" aria-hidden />}
      {/* Sidebar: static column on desktop, slide-in drawer on mobile */}
      <aside className={"fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col overflow-y-auto bg-brand text-white transition-transform md:static md:z-auto md:w-60 md:translate-x-0 " + (open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between px-6 py-6">
          <div>
            <Link href="/" className="text-2xl font-black">Fittin<span className="text-accent">&rsquo;</span></Link>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-lav">Beheer</p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Menu sluiten" className="rounded-lg px-2 py-1 text-xl leading-none text-lav hover:bg-white/10 md:hidden">✕</button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {groups.map((grp, gi) => (
            <div key={gi} className="space-y-0.5">
              {grp.title && <p className="px-3 pb-1 pt-1 text-[10px] font-black uppercase tracking-widest text-lav/50">{grp.title}</p>}
              {grp.items.map((it) => (
                <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className={linkClass(it.href)}>
                  <span className="w-4 text-center">{it.icon}</span>
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="text-sm font-bold">{name}</p>
          <p className="text-xs capitalize text-lav">{role}</p>
          <div className="mt-3 flex gap-2">
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
