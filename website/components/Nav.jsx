"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// Marketing nav — shown to logged-out visitors.
const links = [
  { href: "/degym", label: "De gym" },
  { href: "/personal-training", label: "Personal training" },
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

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(null);

  useEffect(() => {
    let active = true;
    // Optimistic logged-in hint from a visible Supabase cookie so the nav doesn't flash "Inloggen".
    // We ALWAYS confirm with /api/me — the auth-token cookie can be httpOnly/chunked and invisible
    // to document.cookie, so a logged-in member must still reliably get the member nav.
    const hasSbCookie = document.cookie.split(";").some((c) => c.trim().startsWith("sb-"));
    if (hasSbCookie) setAccount((a) => a || { name: "Account", role: "lid", home: "/account" });

    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setAccount(d?.loggedIn ? { name: d.name, role: d.role, home: d.home, unread: d.unread || 0 } : null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const isStaff = account && ["coach", "beheerder"].includes(account.role);
  const staffLabel = account?.role === "beheerder" ? "Beheer" : "Coach";
  const home = account?.home || "/account";
  // Logged-out → marketing links; member → trimmed links; staff → none (they use their dashboard button).
  const navLinks = !account ? links : isStaff ? [] : memberLinks;

  return (
    <header className="sticky top-0 z-50 border-b border-borderc/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="group flex items-center" aria-label="Fittin' — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Fittin'" width={150} height={40} className="h-8 w-auto transition group-hover:opacity-80" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-brand/70 md:flex">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="relative transition hover:text-brand">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {!account && (
            <>
              <Link href="/login" className="hidden text-sm font-bold text-brand/70 transition hover:text-brand sm:block">Inloggen</Link>
              <Link href="/login?mode=signup" className="hidden rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand shadow-sm shadow-accent/30 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-accent/40 sm:block">
                Word lid
              </Link>
            </>
          )}
          {account && (
            <Link href="/notificaties" className="relative hidden rounded-full p-2 text-brand/70 transition hover:bg-paper hover:text-brand sm:block" aria-label="Notificaties">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {account.unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-black text-brand">{account.unread > 9 ? "9+" : account.unread}</span>
              )}
            </Link>
          )}
          {account && isStaff && (
            <>
              <Link href="/account" className="hidden text-sm font-bold text-brand/60 transition hover:text-brand sm:block">Mijn account</Link>
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
          <button onClick={() => setOpen(!open)} className="rounded-lg border border-borderc p-2 md:hidden" aria-label="Menu" aria-expanded={open} aria-controls="mobile-menu">
            <span className="mb-1 block h-0.5 w-5 bg-brand"></span>
            <span className="mb-1 block h-0.5 w-5 bg-brand"></span>
            <span className="block h-0.5 w-5 bg-brand"></span>
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-menu" className="border-t border-borderc bg-white px-5 py-4 md:hidden">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2 font-semibold text-brand">{l.label}</Link>
          ))}
          <div className="mt-2 border-t border-borderc pt-2">
            {account && (
              <Link href="/notificaties" onClick={() => setOpen(false)} className="block py-2 font-semibold text-brand">
                Notificaties{account.unread > 0 ? ` (${account.unread > 9 ? "9+" : account.unread})` : ""}
              </Link>
            )}
            {isStaff && <Link href={home} onClick={() => setOpen(false)} className="block py-2 font-bold text-accentdark">{staffLabel} →</Link>}
            <Link href={account ? "/account" : "/login?mode=signup"} onClick={() => setOpen(false)} className="block py-2 font-bold text-brand">
              {account ? "Mijn account" : "Inloggen / word lid"}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
