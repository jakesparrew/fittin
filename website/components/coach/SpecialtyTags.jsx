import { parseSpecialties } from "@/lib/coach-specialties";

// Toont de specialiteit van een coach als nette chips op de publieke pagina's. Presentatie-only
// (geen client-JS). Splitst zowel de nieuwe " · "-labels als oude vrije-tekstwaarden.
export default function SpecialtyTags({ value, className = "" }) {
  const tags = parseSpecialties(value);
  if (!tags.length) return null;
  return (
    <div className={"flex flex-wrap gap-1.5 " + className}>
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accentdark">
          {t}
        </span>
      ))}
    </div>
  );
}
