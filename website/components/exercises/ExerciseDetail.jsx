import ExerciseMedia from "./ExerciseMedia";

const DIFF = { beginner: "Beginner", intermediate: "Gemiddeld", gevorderd: "Gevorderd" };

function Chip({ children }) {
  return <span className="rounded-full bg-paper px-3 py-1 text-xs font-bold capitalize text-brand/70">{children}</span>;
}

// Full exercise detail: looping demo, target muscles, equipment/difficulty, numbered steps, tips.
// Reused by the library detail page and the workout player. `compact` trims spacing for modals.
export default function ExerciseDetail({ exercise, compact = false }) {
  const ex = exercise || {};
  const primary = ex.primary_muscles || (ex.muscle ? [ex.muscle] : []);
  const secondary = ex.secondary_muscles || [];
  const steps = ex.instructions || [];

  return (
    <div>
      <ExerciseMedia exercise={ex} className={compact ? "aspect-video w-full" : "aspect-[4/3] w-full"} rounded="rounded-3xl" />

      <div className={compact ? "mt-4" : "mt-6"}>
        <h2 className="text-2xl font-black text-brand md:text-3xl">{ex.name}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {ex.category && <Chip>{ex.category}</Chip>}
          {ex.equipment && <Chip>{ex.equipment}</Chip>}
          {ex.difficulty && <Chip>{DIFF[ex.difficulty] || ex.difficulty}</Chip>}
        </div>

        {(primary.length > 0 || secondary.length > 0) && (
          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-widest text-lav">Spieren</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {primary.map((m) => (
                <span key={m} className="rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accentdark">{m}</span>
              ))}
              {secondary.map((m) => (
                <span key={m} className="rounded-full border border-borderc px-3 py-1 text-xs font-semibold text-brand/50">{m}</span>
              ))}
            </div>
          </div>
        )}

        {steps.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-widest text-lav">Uitvoering</p>
            <ol className="mt-3 space-y-3">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-white">{i + 1}</span>
                  <span className="text-sm leading-relaxed text-brand/80">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {ex.tips && (
          <div className="mt-6 rounded-2xl border border-accent/30 bg-accent/10 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-accentdark">Tip</p>
            <p className="mt-1 text-sm leading-relaxed text-brand/80">{ex.tips}</p>
          </div>
        )}

        {ex.video_url && (
          <a href={ex.video_url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-accentdark hover:underline">
            Bekijk de volledige video ↗
          </a>
        )}
      </div>
    </div>
  );
}
