import Link from "next/link";
import Icon from "@/components/ui/Icon";

// Empty-state card — generalizes the ComingSoon look (dashed card + accent icon chip + title + CTA).
// Replaces the ~50 bare grey "Nog geen…" paragraphs. Every empty state should name the next action.
export default function EmptyState({ icon = "grid", title, text, cta, className = "" }) {
  return (
    <div className={`rounded-3xl border border-dashed border-borderc bg-white/60 p-8 text-center ${className}`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accentdark">
        <Icon name={icon} size={22} />
      </div>
      {title && <p className="mt-4 font-black text-brand">{title}</p>}
      {text && <p className="mx-auto mt-1 max-w-sm text-sm text-brand/60">{text}</p>}
      {cta?.href && (
        <Link href={cta.href} className="mt-5 inline-flex items-center justify-center rounded-full bg-accent px-6 py-2.5 text-sm font-black text-brand shadow-lg shadow-accent/30 transition hover:-translate-y-0.5">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
