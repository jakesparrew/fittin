"use client";
import Link from "next/link";
import { useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/degym", label: "De gym" },
  { href: "/personal-training", label: "Personal training" },
  { href: "/boeken", label: "Online boeken" },
];

export default function Nav({ account = null }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-borderc bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="text-2xl font-black tracking-tight text-brand">
          Fittin<span className="text-accent">&rsquo;</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-brand/70 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-brand">
              {l.label}
            </Link>
          ))}
          {account && (
            <>
              <Link href="/training" className="transition hover:text-brand">Training</Link>
              <Link href="/community" className="transition hover:text-brand">Community</Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {account && ["coach", "beheerder"].includes(account.role) && (
            <Link
              href="/beheer"
              className="hidden text-sm font-bold text-accentdark transition hover:opacity-80 sm:block"
            >
              Beheer
            </Link>
          )}
          {account ? (
            <Link
              href="/account"
              className="hidden rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 sm:block"
            >
              {account.name?.split(" ")[0] || "Account"}
            </Link>
          ) : (
            <Link
              href="/login"
              className="hidden text-sm font-bold text-brand/70 transition hover:text-brand sm:block"
            >
              Inloggen
            </Link>
          )}
          <Link
            href="/boeken"
            className="hidden rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90 sm:block"
          >
            Reserveer de gym
          </Link>
          <button
            onClick={() => setOpen(!open)}
            className="rounded-lg border border-borderc p-2 md:hidden"
            aria-label="Menu"
          >
            <span className="mb-1 block h-0.5 w-5 bg-brand"></span>
            <span className="mb-1 block h-0.5 w-5 bg-brand"></span>
            <span className="block h-0.5 w-5 bg-brand"></span>
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-borderc bg-white px-5 py-4 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block py-2 font-semibold text-brand"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-2 border-t border-borderc pt-2">
            <Link
              href={account ? "/account" : "/login"}
              onClick={() => setOpen(false)}
              className="block py-2 font-bold text-accentdark"
            >
              {account ? "Mijn account" : "Inloggen / word lid"}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
