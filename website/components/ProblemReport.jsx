"use client";
import { usePathname } from "next/navigation";
import ActionForm from "@/components/ui/ActionForm";
import SubmitButton from "@/components/ui/SubmitButton";
import { reportProblem } from "@/app/(site)/account/actions";

// Member-facing "iets werkt niet" reporter. Deliberately tiny: one textarea, one tap.
// The current page travels along so the owner knows where it happened.
export default function ProblemReport() {
  const path = usePathname();
  return (
    <details id="meld-probleem" className="rounded-2xl border border-borderc bg-white p-4">
      <summary className="cursor-pointer text-sm font-bold text-brand transition hover:text-accentdark">🛟 Werkt iets niet? Meld het ons</summary>
      <ActionForm action={reportProblem} className="mt-3 space-y-2">
        <input type="hidden" name="page" value={path || ""} />
        <textarea
          name="message"
          required
          minLength={5}
          rows={3}
          placeholder="Wat ging er mis? Bv. “de deurcode werkte niet om 18u” of “betalen lukte niet”."
          className="w-full rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm text-brand outline-none transition focus:border-accent"
        />
        <div className="flex items-center gap-3">
          <SubmitButton className="rounded-full bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90">Verstuur melding</SubmitButton>
          <span className="text-[11px] text-brand/40">Komt rechtstreeks bij de gym terecht.</span>
        </div>
      </ActionForm>
    </details>
  );
}
