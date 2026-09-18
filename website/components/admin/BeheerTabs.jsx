"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { itemVoor, tabVoor } from "@/lib/beheer-nav";

// De tabs bovenaan een beheerpagina die samen met andere onder één menu-item hoort (lib/beheer-nav.js).
// Zo blijft de zijbalk kort en zijn de verwante pagina's één tik van elkaar.
export default function BeheerTabs() {
  const pathname = usePathname();
  const item = itemVoor(pathname);
  if (!item?.tabs || item.tabs.length < 2) return null;
  const actief = tabVoor(item, pathname);
  return (
    <nav aria-label={item.label} className="scrollbar-slim flex gap-1.5 overflow-x-auto px-4 pt-5 md:px-8">
      {item.tabs.map(([href, label]) => (
        <Link key={href} href={href} aria-current={actief?.href === href ? "page" : undefined}
          className={"shrink-0 rounded-full px-4 py-2 text-sm font-bold transition " + (actief?.href === href ? "bg-brand text-white" : "border border-borderc bg-surface text-ink/60 hover:border-lav hover:text-ink")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
