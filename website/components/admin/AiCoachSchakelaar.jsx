"use client";
import { useActie } from "@/components/ui/useActie";
import { zetAiCoachOpen } from "@/app/beheer/coaching-actions";

export default function AiCoachSchakelaar({ open }) {
  const [, action, pending] = useActie(zetAiCoachOpen);
  return (
    <form action={action}>
      <input type="hidden" name="open" value={open ? "0" : "1"} />
      <button disabled={pending} className={"rounded-full px-5 py-2.5 text-sm font-black disabled:opacity-50 " + (open ? "border-2 border-borderc text-ink" : "bg-accent text-brand")}>
        {open ? "Zet dicht" : "Zet open voor iedereen"}
      </button>
    </form>
  );
}
