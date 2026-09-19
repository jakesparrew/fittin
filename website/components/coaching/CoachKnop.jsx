"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useMe } from "@/components/useMe";
import CoachChat from "./CoachChat";

// De zwevende coachknop, op elke sitepagina voor wie de AI-coach mag gebruiken (/api/me → coach).
// Niet op schermen met hun eigen onderbalk of waar je midden in iets zit: boeken (plakkende betaalbalk) en een
// lopende workout. Andere knoppen openen hem met `window.dispatchEvent(new Event("coach:open"))`.

const VERBERG = ["/boeken", "/training/sessie", "/login"];

export default function CoachKnop() {
  const me = useMe();
  const pad = usePathname() || "";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const opener = () => setOpen(true);
    window.addEventListener("coach:open", opener);
    return () => window.removeEventListener("coach:open", opener);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  if (!me?.coach) return null;
  const verborgen = VERBERG.some((p) => pad.startsWith(p));

  return (
    <>
      {!open && !verborgen && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open je AI-coach"
          className="fixed right-4 bottom-[calc(5.5rem_+_var(--sab))] z-50 flex items-center gap-2 rounded-full bg-brand py-3 pr-4 pl-3 text-sm font-black text-white shadow-lg md:bottom-6 nativebar:bottom-[calc(var(--native-tabbar-h)_+_1rem)]"
        >
          <span aria-hidden className="text-lg leading-none">💬</span> Coach
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-ink">test</span>
        </button>
      )}
      {open && (
        <div className="anim-fade fixed inset-0 z-[60] md:inset-auto md:right-6 md:bottom-6" role="dialog" aria-modal="true" aria-label="AI-coach">
          <div className="absolute inset-0 bg-black/30 md:hidden" onClick={() => setOpen(false)} />
          <div className="anim-sheet absolute inset-x-0 bottom-0 top-[max(env(safe-area-inset-top),2rem)] overflow-hidden rounded-t-3xl bg-surface shadow-2xl md:static md:h-[min(640px,calc(100vh-3rem))] md:w-[400px] md:rounded-3xl md:border md:border-borderc">
            <CoachChat onSluit={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
