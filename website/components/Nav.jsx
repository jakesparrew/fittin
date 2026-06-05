"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/degym", label: "De gym" },
  { href: "/personal-training", label: "Personal training" },
  { href: "/boeken", label: "Online boeken" },
  { href: "/calorieen-berekenen", label: "Calorieën berekenen" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(null);

  useEffect(() => {
    let active = true;
    // Instant logged-in hint from the auth cookie so the nav doesn't flash "Inloggen".
    const hasAuthCookie = document.cookie.split(";").some((c) => /sb-.*-auth-token/.test(c.trim()));
    if (hasAuthCookie) setAccount((a) => a || { name: "Account", role: "lid", home: "/account" });

    // Authoritative state from the server (reliable; also refreshes the session cookie).
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setAccount(d?.loggedIn ? { name: d.name, role: d.role, home: d.home } : null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const isStaff = account && ["coach", "beheerder"].includes(account.role);
  const staffLabel = account?.role === "beheerder" ? "Beheer" : "Coach";
  const home = account?.home || "/account";

  return (
    <header className="sticky top-0 z-50 border-b border-borderc/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="group text-2xl font-black tracking-tight text-brand">
          Fittin<span className="text-accent transition group-hover:opacity-70">&rsquo;</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-brand/70 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="relative transition hover:text-brand">
              {l.label}
            </Link>
          ))}
          {account && !isStaff && (
            <>
              <Link href="/training" className="transition hover:text-brand">Training</Link>
              <Link href="/community" className="transition hover:text-brand">Community</Link>
            </>
          )}
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
          <button onClick={() => setOpen(!open)} className="rounded-lg border border-borderc p-2 md:hidden" aria-label="Menu">
            <span className="mb-1 block h-0.5 w-5 bg-brand"></span>
            <span className="mb-1 block h-0.5 w-5 bg-brand"></span>
            <span className="block h-0.5 w-5 bg-brand"></span>
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-borderc bg-white px-5 py-4 md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2 font-semibold text-brand">{l.label}</Link>
          ))}
          {account && !isStaff && (
            <>
              <Link href="/training" onClick={() => setOpen(false)} className="block py-2 font-semibold text-brand">Training</Link>
              <Link href="/community" onClick={() => setOpen(false)} className="block py-2 font-semibold text-brand">Community</Link>
            </>
          )}
          <div className="mt-2 border-t border-borderc pt-2">
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
